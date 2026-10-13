require("dotenv").config();
const express = require("express");
const cors = require("cors");
const initDb = require("./db");
const createScheduleStore = require("./services/scheduleStore");
const createPush = require("./services/push");
const createReminderScheduler = require("./services/reminderScheduler");

const port = process.env.PORT || 3000;

async function main() {
  const pool = await initDb();
  const store = createScheduleStore(pool);
  const push = await createPush(pool);
  const scheduler = createReminderScheduler(pool, store, push);

  const app = express();
  app.use(cors({ maxAge: 86400 }));
  app.use(express.json());

  app.get("/api/health", async (_req, res) => {
    try {
      const [rows] = await pool.query("SELECT 1 AS ok");
      res.json({ status: "ok", db: rows[0].ok === 1 });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  app.use("/api/schedules", require("./api/schedules")(pool, store, scheduler));
  app.use("/api/settings", require("./api/settings")(store, scheduler));
  app.use("/api/categories", require("./api/categories")(pool));
  app.use("/api/push", require("./api/push")(push, scheduler));

  app.listen(port, () => {
    console.log(`EventNote backend listening on port ${port}`);
    scheduler.start(); // 通知時刻のチェックを開始（1分ごと）
  });
}

main().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
