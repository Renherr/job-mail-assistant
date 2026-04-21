const { query } = require("../db/mysql");

async function getLastSyncedAt(syncKey) {
  const rows = await query(
    `
      SELECT last_synced_at
      FROM sync_state
      WHERE sync_key = ?
      LIMIT 1
    `,
    [syncKey]
  );

  return rows[0]?.last_synced_at || null;
}

async function updateLastSyncedAt(syncKey, lastSyncedAt) {
  await query(
    `
      INSERT INTO sync_state (sync_key, last_synced_at)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        last_synced_at = VALUES(last_synced_at),
        updated_at = CURRENT_TIMESTAMP
    `,
    [syncKey, lastSyncedAt]
  );
}

module.exports = {
  getLastSyncedAt,
  updateLastSyncedAt,
};
