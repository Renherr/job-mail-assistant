const { query } = require("../db/mysql");

async function findTaskByEmailId(emailId) {
  const rows = await query(
    `
      SELECT id
      FROM tasks
      WHERE email_id = ?
      LIMIT 1
    `,
    [emailId]
  );

  return rows[0] || null;
}

async function updateTaskStatus(taskId, status) {
  const normalizedStatus = status === "done" ? "done" : "todo";
  await query(
    `
      UPDATE tasks
      SET status = ?,
          completed_at = CASE WHEN ? = 'done' THEN CURRENT_TIMESTAMP ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [normalizedStatus, normalizedStatus, taskId]
  );
}

async function insertTask(task) {
  const result = await query(
    `
      INSERT INTO tasks (
        application_id,
        email_id,
        title,
      description,
      due_at,
      priority,
      status,
      completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      task.applicationId,
      task.emailId,
      nullable(task.title),
      nullable(task.description),
      nullable(task.dueAt),
      nullable(task.priority),
      nullable(task.status),
      task.status === "done" ? nullable(task.completedAt || new Date()) : null,
    ]
  );

  return result.insertId;
}

function nullable(value) {
  return value === undefined ? null : value;
}

module.exports = {
  findTaskByEmailId,
  insertTask,
  updateTaskStatus,
};
