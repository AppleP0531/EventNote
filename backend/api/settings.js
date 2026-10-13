const express = require("express");

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// アプリ設定
//   allday_time … 終日予定（時刻なし）の通知を計算するときの基準時刻（例: "09:00"）
module.exports = (store, scheduler) => {
  const router = express.Router();

  // GET /api/settings
  router.get("/", async (_req, res, next) => {
    try {
      res.json({ allday_time: await store.getAlldayTime() });
    } catch (e) {
      next(e);
    }
  });

  // PUT /api/settings
  router.put("/", async (req, res, next) => {
    try {
      const alldayTime = req.body?.allday_time;
      if (typeof alldayTime !== "string" || !TIME_RE.test(alldayTime)) {
        return res.status(400).json({ message: "基準時刻が正しくありません" });
      }
      await store.setSetting("allday_time", alldayTime);
      res.json({ allday_time: alldayTime });
      scheduler?.check();
    } catch (e) {
      next(e);
    }
  });

  router.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: "サーバーエラーが発生しました" });
  });

  return router;
};
