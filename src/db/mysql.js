const mysql = require("mysql2/promise");
const { readConfig } = require("../config");

let pool;

function getPool() {
  if (!pool) {
    const config = readConfig();
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }

  return pool;
}

async function ping() {
  const activePool = getPool();
  const connection = await activePool.getConnection();

  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

async function query(sql, params = []) {
  const activePool = getPool();
  const [rows] = await activePool.execute(sql, params);
  return rows;
}

module.exports = {
  getPool,
  ping,
  query,
};
