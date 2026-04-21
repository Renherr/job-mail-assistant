const dns = require("node:dns/promises");
const { ImapFlow } = require("imapflow");
const { readConfig } = require("../config");
const { classifyMail } = require("./jobClassifier");
const { buildTaskFromMail } = require("./taskService");
const {
  attachEmailToApplication,
  findEmailByMessageId,
  insertEmail,
  updateEmailDetails,
} = require("../repositories/emailRepository");
const {
  upsertApplication,
  updateApplicationImportantLink,
} = require("../repositories/applicationRepository");
const { findTaskByEmailId, insertTask } = require("../repositories/taskRepository");
const { getLastSyncedAt, updateLastSyncedAt } = require("../repositories/syncStateRepository");

async function syncRecentEmails(options = {}) {
  const config = readConfig();
  const client = await createImapClient(config.mail);

  const syncKey = `mailbox:${config.mail.user}`;
  const initialSyncStartDate = options.initialSyncStartDate || config.mail.initialSyncStartDate || "2026-03-01";
  const lastSyncedAt = await getLastSyncedAt(syncKey);
  const since = lastSyncedAt ? new Date(lastSyncedAt) : new Date(`${initialSyncStartDate}T00:00:00`);
  const perRunLimit = lastSyncedAt ? options.maxMessages || 20 : options.maxMessages || 120;

  let synced = 0;
  let skipped = 0;
  let createdTasks = 0;
  let newestSeenAt = lastSyncedAt ? new Date(lastSyncedAt) : null;

  try {
    await client.mailboxOpen("INBOX");

    const messageUids = await client.search({ since });
    const targetUids = lastSyncedAt ? messageUids.slice(-perRunLimit) : messageUids.slice(0, perRunLimit);

    for (const uid of targetUids) {
      const envelopeMessage = await client.fetchOne(uid, {
        uid: true,
        envelope: true,
        internalDate: true,
      });

      const previewMail = normalizeEnvelopeMessage(envelopeMessage);
      const existing = await findEmailByMessageId(previewMail.messageId);

      newestSeenAt = pickLater(newestSeenAt, previewMail.receivedAt);

      if (existing) {
        if (existing.application_id && !existing.important_link) {
          const detailedMessage = await client.fetchOne(uid, {
            uid: true,
            envelope: true,
            internalDate: true,
            source: true,
          });
          const detailedMail = normalizeDetailedMessage(detailedMessage || envelopeMessage);
          const parsed = await classifyMail(detailedMail);

          await updateEmailDetails(existing.id, {
            ...detailedMail,
            companyName: parsed.companyName || null,
            roleName: parsed.roleName || null,
            mailType: parsed.mailType || null,
            needsAction: Boolean(parsed.needsAction),
            actionDeadline: parsed.actionDeadline,
            suggestedAction: parsed.suggestedAction || null,
            rawAiResult: parsed,
          });

          if (detailedMail.importantLink) {
            await updateApplicationImportantLink(existing.application_id, detailedMail.importantLink);
          }
        }

        skipped += 1;
        continue;
      }

      let parsed = await classifyMail(previewMail);
      let detailedMail = previewMail;

      if (parsed.isJobRelated) {
        const detailedMessage = await client.fetchOne(uid, {
          uid: true,
          envelope: true,
          internalDate: true,
          source: true,
        });

        detailedMail = normalizeDetailedMessage(detailedMessage || envelopeMessage);
        parsed = await classifyMail(detailedMail);
        newestSeenAt = pickLater(newestSeenAt, detailedMail.receivedAt);
      }

      const emailId = await insertEmail({
        ...detailedMail,
        isJobRelated: parsed.isJobRelated,
        companyName: parsed.companyName || null,
        roleName: parsed.roleName || null,
        mailType: parsed.mailType || null,
        needsAction: Boolean(parsed.needsAction),
        actionDeadline: parsed.actionDeadline,
        suggestedAction: parsed.suggestedAction || null,
        applicationId: null,
        rawAiResult: parsed,
      });

      if (!parsed.isJobRelated) {
        skipped += 1;
        continue;
      }

      const applicationId = await upsertApplication({
        companyName: parsed.companyName || "未知公司",
        roleName: parsed.roleName || "未知岗位",
        currentStage: parsed.currentStage || "已投递",
        summary: parsed.summary || null,
        importantLink: detailedMail.importantLink || null,
        lastActivityAt: detailedMail.receivedAt,
        latestEmailId: emailId,
        isActive: !["已结束", "已录用"].includes(parsed.currentStage),
      });

      await attachEmailToApplication(emailId, applicationId);

      const task = buildTaskFromMail(parsed);
      if (task) {
        const existingTask = await findTaskByEmailId(emailId);
        if (!existingTask) {
          await insertTask({
            applicationId,
            emailId,
            title: task.title,
            description: task.description,
            dueAt: task.dueAt,
            priority: task.priority,
            status: task.status,
            completedAt: task.completedAt,
          });
          createdTasks += 1;
        }
      }

      synced += 1;
    }

    if (newestSeenAt) {
      await updateLastSyncedAt(syncKey, normalizeSyncTimestamp(newestSeenAt));
    }

    const isInitialSync = !lastSyncedAt;
    return {
      synced,
      skipped,
      createdTasks,
      message: isInitialSync
        ? `邮件初始化已处理从 ${initialSyncStartDate} 起的前 ${targetUids.length} 封。`
        : `邮件增量同步完成，起点为 ${formatSyncDate(lastSyncedAt)}。`,
    };
  } finally {
    await safeLogout(client);
  }
}

function normalizeEnvelopeMessage(message) {
  const envelope = message.envelope || {};
  const from = envelope.from?.[0] || {};
  const subject = envelope.subject || "(no subject)";

  return {
    messageId: cleanupMessageId(envelope.messageId || `${message.uid}@local`),
    subject,
    fromName: from.name || "",
    fromAddress: from.address || "",
    receivedAt: toMysqlDateTime(message.internalDate || new Date()),
    bodyText: "",
    snippet: subject,
  };
}

function normalizeDetailedMessage(message) {
  const base = normalizeEnvelopeMessage(message);
  const sourceText = bufferToText(message.source);
  const normalizedSource = normalizeSourceForAnalysis(sourceText);
  const bodyText = extractReadableText(normalizedSource);
  const importantLink = extractImportantLink(normalizedSource);

  return {
    ...base,
    bodyText,
    importantLink,
    snippet: bodyText.slice(0, 240).replace(/\s+/g, " ").trim() || base.subject,
  };
}

function bufferToText(value) {
  if (!value) {
    return "";
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return String(value);
}

function extractReadableText(rawSource) {
  const normalized = String(rawSource).replace(/\r/g, "");
  const bodyStartIndex = normalized.indexOf("\n\n");
  const body = bodyStartIndex >= 0 ? normalized.slice(bodyStartIndex + 2) : normalized;
  const htmlDecoded = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(htmlDecoded)
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImportantLink(rawSource) {
  const text = String(rawSource || "");
  const candidates = Array.from(
    new Set(
      [...collectHrefCandidates(text), ...(text.match(/https?:\/\/[^\s"'<>\\]+/gi) || [])]
        .map((value) => value.replace(/[),.;]+$/g, ""))
        .filter(Boolean)
    )
  );

  if (!candidates.length) {
    return null;
  }

  const scored = candidates
    .map((url) => ({
      url,
      score: scoreLink(url, text),
    }))
    .sort((left, right) => right.score - left.score);

  return scored[0]?.score > 0 ? scored[0].url : null;
}

function normalizeSourceForAnalysis(rawSource) {
  const text = String(rawSource || "");
  return decodeHtmlEntities(decodeQuotedPrintable(decodeBase64Blocks(text)));
}

function collectHrefCandidates(text) {
  return Array.from(
    text.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi),
    (match) => match[1]
  ).filter((value) => /^https?:\/\//i.test(value));
}

function decodeQuotedPrintable(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const withoutSoftBreaks = normalized.replace(/=(\n|$)/g, "");
  const bytes = [];

  for (let index = 0; index < withoutSoftBreaks.length; index += 1) {
    const current = withoutSoftBreaks[index];
    if (current === "=" && /^[0-9A-Fa-f]{2}$/.test(withoutSoftBreaks.slice(index + 1, index + 3))) {
      bytes.push(parseInt(withoutSoftBreaks.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }

    const codePoint = withoutSoftBreaks.charCodeAt(index);
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
    } else {
      bytes.push(...Buffer.from(current, "utf8"));
    }
  }

  return Buffer.from(bytes).toString("utf8");
}

function decodeBase64Blocks(text) {
  return String(text || "").replace(/(?:^|\n)([A-Za-z0-9+/=\n]{200,})(?=\n|$)/g, (_, block) => {
    const compact = block.replace(/\s+/g, "");
    if (!isLikelyBase64(compact)) {
      return block;
    }

    try {
      const decoded = Buffer.from(compact, "base64").toString("utf8");
      return /<[^>]+>|[\u4e00-\u9fff]|https?:\/\//u.test(decoded) ? `\n${decoded}\n` : block;
    } catch {
      return block;
    }
  });
}

function isLikelyBase64(value) {
  return value.length >= 200 && value.length % 4 === 0 && /^[A-Za-z0-9+/=]+$/.test(value);
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function scoreLink(url, rawText) {
  const lowerUrl = url.toLowerCase();
  let score = 0;

  const directKeywords = [
    "interview",
    "meeting",
    "zoom",
    "teams",
    "assessment",
    "test",
    "exam",
    "written",
    "笔试",
    "面试",
    "测评",
    "exam",
    "apply",
    "campus",
  ];

  const knownHosts = [
    "zoom.us",
    "teams.microsoft.com",
    "tencentmeeting",
    "meeting.tencent.com",
    "nowcoder",
    "hackerrank",
    "codility",
    "shl",
    "amcat",
    "talent",
    "eval",
    "assessment",
  ];

  if (directKeywords.some((keyword) => lowerUrl.includes(keyword))) {
    score += 5;
  }

  if (knownHosts.some((keyword) => lowerUrl.includes(keyword))) {
    score += 8;
  }

  const index = rawText.indexOf(url);
  if (index >= 0) {
    const context = rawText.slice(Math.max(0, index - 120), Math.min(rawText.length, index + url.length + 120));
    const contextLower = context.toLowerCase();
    const contextKeywords = [
      "面试",
      "笔试",
      "测评",
      "考试",
      "预约",
      "会议",
      "链接",
      "参加",
      "作答",
      "登录",
      "assessment",
      "interview",
      "meeting",
      "complete",
      "exam",
    ];

    score += contextKeywords.filter((keyword) => contextLower.includes(keyword.toLowerCase())).length * 2;
  }

  if (lowerUrl.includes("unsubscribe") || lowerUrl.includes("optout")) {
    score -= 10;
  }

  return score;
}

function cleanupMessageId(value) {
  return String(value).replace(/[<>]/g, "").trim();
}

function toMysqlDateTime(value) {
  const date = new Date(value);
  return normalizeSyncTimestamp(date);
}

function normalizeSyncTimestamp(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function pickLater(currentValue, nextValue) {
  if (!nextValue) {
    return currentValue;
  }

  if (!currentValue) {
    return new Date(nextValue);
  }

  return new Date(nextValue) > new Date(currentValue) ? new Date(nextValue) : currentValue;
}

function formatSyncDate(value) {
  return normalizeSyncTimestamp(value).slice(0, 10);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

async function safeLogout(client) {
  try {
    await Promise.race([
      client.logout(),
      new Promise((resolve) => {
        setTimeout(resolve, 3000);
      }),
    ]);
  } catch {
    // Ignore logout failures so the UI can still receive the sync result.
  }
}

async function createImapClient(mailConfig) {
  const hostsToTry = await resolveHosts(mailConfig.host);
  let lastError;

  for (const host of hostsToTry) {
    const client = new ImapFlow({
      host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      servername: mailConfig.host,
      auth: {
        user: mailConfig.user,
        pass: mailConfig.password,
      },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 90000,
      tls: {
        servername: mailConfig.host,
        minVersion: "TLSv1.2",
      },
    });

    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await safeLogout(client);
    }
  }

  throw lastError || new Error("无法连接到网易邮箱 IMAP 服务器。");
}

async function resolveHosts(hostname) {
  try {
    const addresses = await dns.resolve4(hostname);
    return [...addresses];
  } catch {
    return [hostname];
  }
}

module.exports = {
  syncRecentEmails,
};
