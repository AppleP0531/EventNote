const express = require("express");

// push     … Web Push（ブラウザ通知の購読管理）
// notifier … 実際の通知の送り先（ブラウザ版は push と同じ、デスクトップ版は Windows の通知）
module.exports = (push, scheduler, notifier = push) => {
  const router = express.Router();

  // GET /api/push/public-key  … ブラウザが購読するときに使う公開鍵
  router.get("/public-key", (_req, res) => {
    res.json({ publicKey: push.publicKey });
  });

  // POST /api/push/subscribe  … ブラウザの購読情報を登録
  router.post("/subscribe", async (req, res, next) => {
    try {
      const sub = req.body;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return res.status(400).json({ message: "購読情報が正しくありません" });
      }
      await push.saveSubscription(sub);
      res.status(201).json({ ok: true });
      scheduler?.check(); // 未送信の通知があればすぐ送る
    } catch (e) {
      next(e);
    }
  });

  // POST /api/push/unsubscribe  … 購読解除
  router.post("/unsubscribe", async (req, res, next) => {
    try {
      if (req.body?.endpoint) await push.removeSubscription(req.body.endpoint);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/push/test  … テスト通知
  router.post("/test", async (_req, res, next) => {
    try {
      const sent = await notifier.sendToAll({
        title: "🔔 EventNote",
        body: "テスト通知です。通知は正しく届いています。",
        tag: "eventnote-test",
        url: "/",
      });
      res.json({ sent });
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
