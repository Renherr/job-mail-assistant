const { query } = require("../db/mysql");

async function findApplication(companyName, roleName) {
  const rows = await query(
    `
      SELECT id, is_manually_edited
      FROM applications
      WHERE company_name = ?
        AND role_name = ?
      LIMIT 1
    `,
    [companyName, roleName]
  );

  return rows[0] || null;
}

async function findFallbackApplication(companyName) {
  const rows = await query(
    `
      SELECT id, company_name, role_name, is_manually_edited
      FROM applications
      WHERE company_name = ?
        AND is_active = 1
      ORDER BY last_activity_at DESC, updated_at DESC
      LIMIT 1
    `,
    [companyName]
  );

  return rows[0] || null;
}

async function findSimilarApplication(companyName) {
  const normalizedCompanyName = String(companyName || "").trim();
  if (!normalizedCompanyName) {
    return null;
  }

  const rows = await query(
    `
      SELECT id, company_name, role_name, is_manually_edited
      FROM applications
      WHERE is_active = 1
        AND (
          company_name = ?
          OR company_name LIKE ?
          OR ? LIKE CONCAT('%', company_name, '%')
        )
      ORDER BY
        CASE WHEN company_name = ? THEN 0 ELSE 1 END,
        CASE WHEN role_name = '未知岗位' THEN 0 ELSE 1 END,
        last_activity_at DESC,
        updated_at DESC
      LIMIT 1
    `,
    [
      normalizedCompanyName,
      `%${normalizedCompanyName}%`,
      normalizedCompanyName,
      normalizedCompanyName,
    ]
  );

  return rows[0] || null;
}

async function upsertApplication(application) {
  const existing =
    (await findApplication(application.companyName, application.roleName)) ||
    (isUnknownRole(application.roleName)
      ? (await findFallbackApplication(application.companyName)) ||
        (await findSimilarApplication(application.companyName))
      : null);

  if (existing) {
    if (existing.is_manually_edited) {
      await query(
        `
          UPDATE applications
          SET summary = ?,
              last_activity_at = ?,
              latest_email_id = ?,
              is_active = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          nullable(application.summary),
          nullable(application.lastActivityAt),
          nullable(application.latestEmailId),
          application.isActive ? 1 : 0,
          existing.id,
        ]
      );
    } else {
      await query(
        `
          UPDATE applications
          SET company_name = ?,
              role_name = ?,
              current_stage = ?,
              summary = ?,
              important_link = COALESCE(?, important_link),
              last_activity_at = ?,
              latest_email_id = ?,
              is_active = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          nullable(application.companyName),
          nullable(application.roleName),
          nullable(application.currentStage),
          nullable(application.summary),
          nullable(application.importantLink),
          nullable(application.lastActivityAt),
          nullable(application.latestEmailId),
          application.isActive ? 1 : 0,
          existing.id,
        ]
      );
    }

    return existing.id;
  }

  const result = await query(
    `
      INSERT INTO applications (
        company_name,
        role_name,
        current_stage,
        summary,
        important_link,
        last_activity_at,
        latest_email_id,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      nullable(application.companyName),
      nullable(application.roleName),
      nullable(application.currentStage),
      nullable(application.summary),
      nullable(application.importantLink),
      nullable(application.lastActivityAt),
      nullable(application.latestEmailId),
      application.isActive ? 1 : 0,
    ]
  );

  return result.insertId;
}

async function updateApplicationManual(applicationId, application) {
  await query(
    `
      UPDATE applications
      SET company_name = ?,
          role_name = ?,
          current_stage = ?,
          important_link = ?,
          is_active = ?,
          is_manually_edited = 1,
          manual_updated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      nullable(application.companyName),
      nullable(application.roleName),
      nullable(application.currentStage),
      nullable(application.importantLink),
      !isClosedStage(application.currentStage) ? 1 : 0,
      applicationId,
    ]
  );
}

async function updateApplicationImportantLink(applicationId, importantLink) {
  if (!importantLink) {
    return;
  }

  await query(
    `
      UPDATE applications
      SET important_link = COALESCE(important_link, ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [importantLink, applicationId]
  );
}

function nullable(value) {
  return value === undefined ? null : value;
}

function isUnknownRole(value) {
  return ["未知岗位", "鏈煡宀椾綅"].includes(String(value || "").trim());
}

function isClosedStage(value) {
  return ["已结束", "已录用", "宸茬粨鏉?", "宸插綍鐢?"].includes(String(value || "").trim());
}

module.exports = {
  findApplication,
  updateApplicationImportantLink,
  updateApplicationManual,
  upsertApplication,
};
