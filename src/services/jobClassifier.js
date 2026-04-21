const KEYWORDS = [
  "面试",
  "笔试",
  "测评",
  "在线考试",
  "在线笔试",
  "在线人才测评",
  "应聘",
  "申请",
  "职位",
  "岗位",
  "简历",
  "校招",
  "实习",
  "招聘",
  "offer",
  "recruit",
  "recruiting",
  "career",
  "campus",
  "talent",
  "assessment",
  "interview",
  "online test",
];

const STAGE_OPTIONS = ["已投递", "待处理", "笔试/测评中", "面试中", "已结束", "已录用"];

const COMPANY_ALIASES = [
  { pattern: /阿里巴巴|alibaba/iu, value: "阿里巴巴" },
  { pattern: /海康威视|hikvision/iu, value: "Hikvision" },
  { pattern: /拼多多|pdd/iu, value: "拼多多集团" },
  { pattern: /携程|trip\.com/iu, value: "携程集团" },
  { pattern: /美团|meituan/iu, value: "美团" },
  { pattern: /广联达|glodon/iu, value: "广联达科技股份有限公司" },
  { pattern: /网易|netease/iu, value: "网易" },
  { pattern: /蚂蚁|ant ?group/iu, value: "蚂蚁集团" },
  { pattern: /荣耀|honor/iu, value: "荣耀终端股份有限公司" },
  { pattern: /吉比特|雷霆游戏|g-bits/iu, value: "吉比特&雷霆游戏" },
  { pattern: /360/iu, value: "360集团" },
];

const GENERIC_ROLE_PHRASES = [
  "处理进度",
  "投递成功",
  "在线笔试邀请",
  "在线人才测评邀请",
  "在线测评邀请",
  "面试邀请",
  "校园招聘通知",
  "招聘通知",
  "空宣直播",
  "登录提醒",
  "感谢您投递本公司职位",
];

async function classifyMail(mail) {
  const decodedText = decodeMailContent(buildText(mail));
  const matched = looksLikeJobMail(
    mail.subject,
    mail.snippet,
    mail.fromAddress,
    mail.fromName,
    decodedText
  );

  if (!matched) {
    return { isJobRelated: false };
  }

  const companyName = inferCompanyName(mail.fromName, mail.fromAddress, decodedText, mail.subject);
  const mailType = inferMailType(decodedText, mail.subject);
  const schedule = inferSchedule(decodedText);
  const roleName = inferRoleName(decodedText, mail.subject, companyName);
  const currentStage = inferStage(mailType, decodedText);
  const needsAction = inferNeedsAction(mailType, decodedText);
  const actionDeadline = inferActionDeadline(mailType, schedule, decodedText);

  return {
    isJobRelated: true,
    companyName,
    roleName,
    mailType,
    needsAction,
    actionDeadline,
    suggestedAction: needsAction
      ? buildSuggestedAction({ companyName, roleName, mailType, schedule })
      : null,
    currentStage,
    summary: buildSummary({ companyName, roleName, mailType, currentStage, schedule, needsAction }),
  };
}

function looksLikeJobMail(subject = "", snippet = "", fromAddress = "", fromName = "", bodyText = "") {
  const text = `${subject} ${snippet} ${fromAddress} ${fromName} ${bodyText}`.toLowerCase();
  return KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
}

function buildText(mail) {
  return [mail.subject, mail.snippet, mail.bodyText, mail.fromName, mail.fromAddress]
    .filter(Boolean)
    .join("\n");
}

function inferMailType(text = "", subject = "") {
  const lower = `${subject}\n${text}`.toLowerCase();

  if (includesAny(lower, ["offer", "录用", "入职"])) {
    return "offer";
  }

  if (includesAny(lower, ["未通过", "很遗憾", "感谢应聘", "感谢您的关注", "reject", "淘汰"])) {
    return "rejection";
  }

  if (includesAny(lower, ["在线笔试", "笔试邀请", "考试入口", "考试开始时间", "online test"])) {
    return "written_test_invite";
  }

  if (includesAny(lower, ["在线人才测评", "在线测评", "测评邀请", "assessment", "ceping", "evaluation"])) {
    return "assessment_invite";
  }

  if (includesAny(lower, ["面试邀请", "面试提醒", "预约面试", "interview", "meeting"])) {
    return "interview_invite";
  }

  if (includesAny(lower, ["登记表", "信息补充", "填写", "完善信息", "注册", "激活"])) {
    return "info_collection";
  }

  if (includesAny(lower, ["投递成功", "申请成功", "简历投递成功", "感谢投递", "感谢您的应聘"])) {
    return "application_submitted";
  }

  if (includesAny(lower, ["空宣", "直播开播", "宣讲会"])) {
    return "campus_event";
  }

  return "application_update";
}

function inferStage(mailType, text = "") {
  const lower = String(text).toLowerCase();

  if (mailType === "offer") {
    return "已录用";
  }

  if (mailType === "rejection") {
    return "已结束";
  }

  if (mailType === "interview_invite") {
    return "面试中";
  }

  if (mailType === "written_test_invite" || mailType === "assessment_invite") {
    return "笔试/测评中";
  }

  if (mailType === "info_collection" || includesAny(lower, ["确认", "回复", "填写", "补充", "预约"])) {
    return "待处理";
  }

  return "已投递";
}

function inferNeedsAction(mailType, text = "") {
  const lower = String(text).toLowerCase();

  if (["written_test_invite", "assessment_invite", "interview_invite", "info_collection"].includes(mailType)) {
    return true;
  }

  return includesAny(lower, [
    "请回复",
    "请确认",
    "请完成",
    "请填写",
    "请尽快",
    "截止",
    "提交",
    "预约",
    "登录",
    "点击链接",
    "查看详情",
    "开始作答",
    "please reply",
    "please confirm",
    "please complete",
    "deadline",
    "register",
    "sign up",
    "log in",
  ]);
}

function inferCompanyName(fromName = "", fromAddress = "", text = "", subject = "") {
  for (const sample of [subject, text, fromName, fromAddress].filter(Boolean)) {
    const alias = COMPANY_ALIASES.find(({ pattern }) => pattern.test(sample));
    if (alias) {
      return alias.value;
    }
  }

  const bracketName = matchFirst(subject, [/【([^】]{2,30})】/u]);
  if (bracketName) {
    return cleanupCompanyName(bracketName);
  }

  const companyFromBody = matchFirst(text, [
    /([^\s，,。；;]{2,30}(?:有限公司|集团|科技))/u,
    /来自([^\s，,。；;]{2,30})的/u,
  ]);
  if (companyFromBody) {
    return cleanupCompanyName(companyFromBody);
  }

  const cleanedName = String(fromName).replace(/[<>"']/g, "").trim();
  if (cleanedName) {
    return cleanupCompanyName(cleanedName);
  }

  const base = (String(fromAddress).split("@")[1] || "").split(".")[0];
  return cleanupCompanyName(base || "未知公司");
}

function inferRoleName(text = "", subject = "", companyName = "") {
  const explicit = matchFirst(`${subject}\n${text}`, [
    /(?:岗位|职位|应聘岗位|申请岗位|投递岗位|应聘职位)[:：]?\s*([^\n\r，,。；;]{2,50})/iu,
    /已收到您对\s*([^\n\r，,。；;]{2,50})\s*的申请/iu,
  ]);

  const cleanedExplicit = cleanupRoleName(explicit || "", companyName);
  if (cleanedExplicit) {
    return cleanedExplicit;
  }

  const titleLike = matchFirst(`${subject}\n${text}`, [
    /([^\n\r，,。；;]{2,40}(?:实习生|工程师|开发|算法|产品经理|运营|测试|设计师|分析师|研究员|顾问))/iu,
    /for\s+([a-z0-9\s/_-]{2,80}(?:intern|engineer|manager|analyst|designer))/iu,
  ]);

  const cleanedTitleLike = cleanupRoleName(titleLike || "", companyName);
  if (cleanedTitleLike) {
    return cleanedTitleLike;
  }

  return "未知岗位";
}

function inferSchedule(text = "") {
  const normalizedText = normalizeDateText(text);
  const startAt = findDateTimeAfterLabel(normalizedText, [
    "笔试开始时间",
    "考试开始时间",
    "开始时间",
    "面试时间",
    "测评开始时间",
  ]);
  const deadlineAt = findDateTimeAfterLabel(normalizedText, [
    "截止时间",
    "截止日期",
    "完成截止时间",
    "请于",
    "截止至",
    "截止到",
  ]);
  const duration = matchFirst(normalizedText, [
    /(?:考试时长|笔试时长|测评时长|时长)[:：]?\s*([0-9/]{1,20}\s*分钟?)/iu,
    /(?:duration)[:：]?\s*([0-9/]{1,20}\s*min(?:ute)?s?)/iu,
  ]);

  return {
    startAt,
    deadlineAt,
    duration: duration ? duration.replace(/\s+/g, " ").trim() : null,
  };
}

function inferActionDeadline(mailType, schedule, text = "") {
  if (schedule.deadlineAt) {
    return schedule.deadlineAt;
  }

  if (["written_test_invite", "assessment_invite", "interview_invite"].includes(mailType) && schedule.startAt) {
    return schedule.startAt;
  }

  return extractFirstDateTime(normalizeDateText(text));
}

function buildSuggestedAction({ companyName, roleName, mailType, schedule }) {
  const target = roleName === "未知岗位" ? companyName : `${companyName}${roleName}`;
  const timeHint = schedule.startAt ? `（${formatDisplayTime(schedule.startAt)}）` : "";

  if (mailType === "written_test_invite") {
    return `完成${target}在线笔试${timeHint}`;
  }

  if (mailType === "assessment_invite") {
    return `完成${target}在线测评${timeHint}`;
  }

  if (mailType === "interview_invite") {
    return `确认${target}面试安排${timeHint}`;
  }

  if (mailType === "info_collection") {
    return `处理${target}信息填写`;
  }

  return `跟进${target}邮件`;
}

function buildSummary({ companyName, roleName, mailType, currentStage, schedule, needsAction }) {
  const roleText = roleName === "未知岗位" ? "" : `，岗位 ${roleName}`;
  const startText = schedule.startAt ? `，开始时间 ${formatDisplayTime(schedule.startAt)}` : "";
  const deadlineText = schedule.deadlineAt ? `，截止时间 ${formatDisplayTime(schedule.deadlineAt)}` : "";
  const durationText = schedule.duration ? `，时长 ${schedule.duration}` : "";

  switch (mailType) {
    case "written_test_invite":
      return `${companyName}发送在线笔试邀请${roleText}${startText}${durationText}${deadlineText}`;
    case "assessment_invite":
      return `${companyName}发送在线测评邀请${roleText}${startText}${durationText}${deadlineText}`;
    case "interview_invite":
      return `${companyName}发送面试邀请${roleText}${startText}${deadlineText}`;
    case "info_collection":
      return `${companyName}需要补充或确认求职信息${roleText}${deadlineText}`;
    case "application_submitted":
      return `${companyName}已收到你的投递${roleText}`;
    case "campus_event":
      return `${companyName}发送校招活动通知${roleText}`;
    case "offer":
      return `${companyName}发来录用通知${roleText}`;
    case "rejection":
      return `${companyName}流程已结束${roleText}`;
    default:
      return needsAction
        ? `${companyName}${roleText}当前阶段为${currentStage}，需要继续跟进`
        : `${companyName}${roleText}当前阶段为${currentStage}`;
  }
}

function cleanupCompanyName(value) {
  return String(value)
    .replace(/^(recruiting|recruitment|hr|talent)[-_:\s]*/iu, "")
    .replace(/(校园招聘|招聘官网|招聘|校招)$/u, "")
    .replace(/[【】[\]()（）]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function cleanupRoleName(value, companyName = "") {
  const cleaned = String(value)
    .replace(/[【】[\]()（）]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[|/].*$/u, "")
    .trim()
    .slice(0, 120);

  if (!cleaned || cleaned.length < 2) {
    return "";
  }

  if (GENERIC_ROLE_PHRASES.some((phrase) => cleaned.includes(phrase))) {
    return "";
  }

  if (companyName && cleaned.includes(companyName) && !/(实习生|工程师|开发|算法|产品|运营|测试|设计|分析|研究)/u.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function decodeMailContent(text = "") {
  const raw = String(text || "");
  const decodedBase64Blocks = decodeBase64Blocks(raw);
  return decodeHtmlEntities(decodeQuotedPrintable(decodedBase64Blocks));
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

function normalizeDateText(text) {
  return String(text)
    .replace(/\r/g, "\n")
    .replace(/年/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, " ")
    .replace(/[（(]UTC\+?8[）)]/giu, "")
    .replace(/[（(]北京时间[）)]/gu, "")
    .replace(/\s+/g, " ");
}

function findDateTimeAfterLabel(text, labels) {
  for (const label of labels) {
    const index = text.indexOf(label);
    if (index < 0) {
      continue;
    }

    const value = extractFirstDateTime(text.slice(index, index + 160));
    if (value) {
      return value;
    }
  }

  return null;
}

function extractFirstDateTime(text) {
  const match = String(text).match(
    /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/
  );

  if (!match) {
    return null;
  }

  const [, year, month, day, hour = "23", minute = "59"] = match;
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:00`;
}

function formatDisplayTime(value) {
  return value ? value.slice(5, 16) : "";
}

function matchFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => String(text).includes(String(keyword).toLowerCase()));
}

function pad(value) {
  return String(value).padStart(2, "0");
}

module.exports = {
  classifyMail,
  looksLikeJobMail,
  STAGE_OPTIONS,
};
