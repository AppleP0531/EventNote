const express = require("express");
require("dotenv").config();
const port = process.env.PORT || 3000;
const cors = require("cors");
const mysql = require("mysql2");
const createRecurrence = require("./services/recurrence");

const app = express();
app.use(cors({ maxAge: 86400 }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 接続先DB設定
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  dateStrings: true, // DATE列を "2026-10-06" の文字列で受け取る
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true, // 長時間アイドルでも切られにくくする
  keepAliveInitialDelay: 10000,
});

// 起動時にDBへ接続できるか確認
pool.getConnection((error, conn) => {
  if (error) throw error;
  console.log("Successfully connected to MySQL!");
  conn.release(); // 確認用に借りた接続を返す
});

app.get("/api/health", (_req, res) => {
  pool.query("SELECT 1 AS ok", (error, rows) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ status: "error", message: error.message });
    }
    res.json({ status: "ok", db: rows[0].ok === 1 });
  });
});

const notifier = createNotifier(pool);
const recurrence = createRecurrence(pool);

app.use("/api/events", require("./api/event")(pool, recurrence)); //予定系統
app.use("/api/push", require("./api/push")(pool, notifier)); //通知系統

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
  recurrence.start(); // 繰り返し予定の補充
  notifier.start(); // 通知スケジューラ開始
});
