const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const initDb = require("./db");
const createScheduleStore = require("./services/scheduleStore");
const createPush = require("./services/push");
const createReminderScheduler = require("./services/reminderScheduler");

/**
 * EventNote のバックエンド本体を組み立てる（ポートは開かない）。
 *   - ブラウザ版（app.js）は返された app を listen する
 *   - デスクトップ版（desktop/main.js）はポートを使わず、アプリ内から直接 app を呼び出す
 *
 * options.notifier … 通知の送り先（{ countSubscriptions, sendToAll }）。
 *                    省略時は Web Push（ブラウザ通知）を使う
 * options.webDir   … ビルド済みの画面（frontend/dist）。あれば一緒に配信する
 */
async function createApp(options = {}) {
  const pool = await initDb();
  const store = createScheduleStore(pool);
  const push = await createPush(pool);
  const notifier = options.notifier ?? push;
  const scheduler = createReminderScheduler(pool, store, notifier);

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
  app.use("/api/push", require("./api/push")(push, scheduler, notifier));
  app.use("/api", (_req, res) => res.status(404).json({ message: "Not Found" }));

  const webDir = options.webDir;
  if (webDir && fs.existsSync(path.join(webDir, "index.html"))) {
    app.use(
      express.static(webDir, {
        setHeaders: (res, filePath) => {
          // Service Worker と index.html は常に最新を読ませる
          if (/(sw\.js|index\.html)$/.test(filePath)) res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    // それ以外のパスは画面（index.html）を返す
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(webDir, "index.html"));
    });
  }

  return { app, pool, scheduler };
}

module.exports = createApp;
