const { query } = require("../db/mysql");

async function findEmailByMessageId(messageId) {
  const rows = await query(
    `
      SELECT
        e.id,
        e.application_id,
        a.important_link
      FROM emails
      e
      LEFT JOIN applications a ON a.id = e.application_id
      WHERE e.message_id = ?
      LIMIT 1
    `,
    [messageId]
  );

  return rows[0] || null;
}

async function insertEmail(email) {
  const result = await query(
    `
      INSERT INTO emails (
        message_id,
        subject,
        from_name,
        from_address,
        received_at,
        snippet,
        body_text,
        is_job_related,
        company_name,
        role_name,
        mail_type,
        needs_action,
        action_deadline,
        suggested_action,
        application_id,
        raw_ai_result
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      nullable(email.messageId),
      nullable(email.subject),
      nullable(email.fromName),
      nullable(email.fromAddress),
      nullable(email.receivedAt),
      nullable(email.snippet),
      nullable(email.bodyText),
      email.isJobRelated ? 1 : 0,
      nullable(email.companyName),
      nullable(email.roleName),
      nullable(email.mailType),
      email.needsAction ? 1 : 0,
      nullable(email.actionDeadline),
      nullable(email.suggestedAction),
      nullable(email.applicationId),
      JSON.stringify(email.rawAiResult ?? null),
    ]
  );

  return result.insertId;
}

async function attachEmailToApplication(emailId, applicationId) {
  await query(
    `
      UPDATE emails
      SET application_id = ?
      WHERE id = ?
    `,
    [applicationId, emailId]
  );
}

async function updateEmailDetails(emailId, email) {
  await query(
    `
      UPDATE emails
      SET snippet = ?,
          body_text = ?,
          company_name = COALESCE(?, company_name),
          role_name = COALESCE(?, role_name),
          mail_type = COALESCE(?, mail_type),
          needs_action = ?,
          action_deadline = COALESCE(?, action_deadline),
          suggested_action = COALESCE(?, suggested_action),
          raw_ai_result = ?
      WHERE id = ?
    `,
    [
      nullable(email.snippet),
      nullable(email.bodyText),
      nullable(email.companyName),
      nullable(email.roleName),
      nullable(email.mailType),
      email.needsAction ? 1 : 0,
      nullable(email.actionDeadline),
      nullable(email.suggestedAction),
      JSON.stringify(email.rawAiResult ?? null),
      emailId,
    ]
  );
}

function nullable(value) {
  return value === undefined ? null : value;
}

module.exports = {
  attachEmailToApplication,
  findEmailByMessageId,
  insertEmail,
  updateEmailDetails,
};
