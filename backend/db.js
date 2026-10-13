const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};
const dbName = process.env.DB_NAME || "db_eventnote";

// DB.sql の CREATE TABLE 文を取り出す（テーブル定義を1か所で管理するため）
function tableStatements() {
  const sql = fs.readFileSync(path.join(__dirname, "DB.sql"), "utf8");
  return sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => /^CREATE TABLE/i.test(s));
}

// 既存のテーブルに後から追加した列を足す（古いバージョンで作ったDB向け）
const ADDED_COLUMNS = [
  ["schedules", "end_date", "DATE NULL AFTER interval_unit"],
  ["schedules", "max_count", "INT NULL AFTER end_date"],
  ["schedules", "weekdays", "VARCHAR(20) NULL AFTER interval_unit"],
  ["schedules", "month_mode", "ENUM('date','nth_weekday','last_day') NULL AFTER weekdays"],
  ["schedules", "week_numbers", "VARCHAR(20) NULL AFTER month_mode"],
  ["schedules", "memo", "TEXT NULL AFTER max_count"],
  [
    "schedules",
    "category_id",
    "INT NULL AFTER memo, ADD FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL",
  ],
];

async function migrate(pool) {
  for (const [table, column, def] of ADDED_COLUMNS) {
    const [rows] = await pool.query(
      `SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    if (rows.length === 0) {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
      console.log(`Migrated: added ${table}.${column}`);
    }
  }

  // 周期の単位に 'week' を追加
  const [[unit]] = await pool.query(
    `SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schedules' AND COLUMN_NAME = 'interval_unit'`,
  );
  if (unit && !unit.type.includes("'week'")) {
    await pool.query("ALTER TABLE schedules MODIFY interval_unit ENUM('day','week','month','year') NULL");
    console.log("Migrated: schedules.interval_unit now accepts 'week'");
  }
  // 以前の「Nか月ごと」は「同じ日」扱い
  await pool.query("UPDATE schedules SET month_mode = 'date' WHERE interval_unit = 'month' AND month_mode IS NULL");
}

// DBとテーブルが無ければ作成してから接続プールを返す
async function initDb() {
  const conn = await mysql.createConnection(config);
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
  );
  await conn.end();

  const pool = mysql.createPool({
    ...config,
    database: dbName,
    dateStrings: true, // DATE列を "2026-10-06" の文字列で受け取る
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });

  for (const stmt of tableStatements()) {
    await pool.query(stmt);
  }
  await migrate(pool);

  console.log(`Successfully connected to MySQL! (database: ${dbName})`);
  return pool;
}

module.exports = initDb;
