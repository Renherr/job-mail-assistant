const { query } = require("../db/mysql");

async function getTodaySummary() {
  const newMailRows = await query(`
    SELECT COUNT(*) AS count
    FROM emails
    WHERE is_job_related = 1
      AND DATE(received_at) = CURDATE()
  `);

  const openTaskRows = await query(`
    SELECT COUNT(*) AS count
    FROM tasks
    WHERE status = 'todo'
  `);

  const updatedApplicationRows = await query(`
    SELECT COUNT(*) AS count
    FROM applications
    WHERE DATE(updated_at) = CURDATE()
  `);

  const urgentRows = await query(`
    SELECT
      t.title,
      a.company_name,
      a.role_name,
      t.due_at
    FROM tasks t
    INNER JOIN applications a ON a.id = t.application_id
    WHERE t.status = 'todo'
    ORDER BY
      CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
      t.due_at ASC,
      t.updated_at DESC
    LIMIT 1
  `);

  const urgentTask = urgentRows[0];
  let urgentText = "暂无待处理事项。";

  if (urgentTask) {
    const dueText = urgentTask.due_at
      ? formatDateTime(urgentTask.due_at)
      : "无截止时间";
    urgentText = `${urgentTask.title}｜${urgentTask.company_name} / ${urgentTask.role_name}｜${dueText}`;
  }

  return {
    newJobMailsToday: Number(newMailRows[0]?.count || 0),
    openTasks: Number(openTaskRows[0]?.count || 0),
    updatedApplications: Number(updatedApplicationRows[0]?.count || 0),
    urgentText,
  };
}

async function getOpenTasks(limit = 10) {
  const safeLimit = normalizeLimit(limit, 10);
  const rows = await query(
    `
      SELECT
        t.id,
        t.title,
        t.status,
        t.completed_at,
        t.priority,
        t.due_at,
        a.company_name,
        a.role_name
      FROM tasks t
      INNER JOIN applications a ON a.id = t.application_id
      ORDER BY
        CASE WHEN t.status = 'done' THEN 1 ELSE 0 END,
        CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
        t.due_at ASC,
        t.completed_at DESC,
        t.updated_at DESC
      LIMIT ${safeLimit}
    `
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    completed: row.status === "done",
    completedAt: row.completed_at ? formatDateTime(row.completed_at) : null,
    priority: mapPriority(row.priority),
    dueAt: row.due_at ? formatDateTime(row.due_at) : null,
    companyName: row.company_name,
    roleName: row.role_name,
  }));
}

async function getApplications(limit = 20) {
  const safeLimit = normalizeLimit(limit, 20);
  const rows = await query(
    `
      SELECT
        a.id,
        a.company_name,
        a.role_name,
        a.current_stage,
        a.summary,
        a.last_activity_at,
        a.is_manually_edited,
        a.important_link,
        e.action_deadline,
        e.suggested_action
      FROM applications a
      LEFT JOIN emails e ON e.id = a.latest_email_id
      WHERE is_active = 1
      ORDER BY a.last_activity_at DESC, a.updated_at DESC
      LIMIT ${safeLimit}
    `
  );

  return rows.map((row) => ({
    id: row.id,
    companyName: row.company_name,
    roleName: row.role_name,
    currentStage: row.current_stage,
    summary: row.summary,
    lastActivityAt: formatDateTime(row.last_activity_at),
    actionDeadline: row.action_deadline ? formatDateTime(row.action_deadline) : null,
    suggestedAction: row.suggested_action,
    isManuallyEdited: Boolean(row.is_manually_edited),
    importantLink: row.important_link,
  }));
}

function mapPriority(priority) {
  switch (priority) {
    case "high":
      return "高";
    case "low":
      return "低";
    default:
      return "中";
  }
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function normalizeLimit(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

module.exports = {
  getApplications,
  getOpenTasks,
  getTodaySummary,
};
