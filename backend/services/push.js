const webpush = require("web-push");

// Web Push の送信まわり
//   VAPID 鍵は .env（VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY）があればそれを使い、
//   無ければ初回起動時に生成して DB（app_settings）に保存する
module.exports = async function createPush(pool) {
  async function getSetting(name) {
    const [rows] = await pool.query("SELECT value FROM app_settings WHERE name = ?", [name]);
    return rows[0]?.value ?? null;
  }

  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    publicKey = await getSetting("vapid_public_key");
    privateKey = await getSetting("vapid_private_key");
    if (!publicKey || !privateKey) {
      const keys = webpush.generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;
      await pool.query("INSERT INTO app_settings (name, value) VALUES (?, ?), (?, ?)", [
        "vapid_public_key",
        publicKey,
        "vapid_private_key",
        privateKey,
      ]);
      console.log("Generated new VAPID keys for Web Push.");
    }
  }

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:eventnote@example.com", publicKey, privateKey);

  async function saveSubscription(sub) {
    await pool.query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth)`,
      [sub.endpoint, sub.keys.p256dh, sub.keys.auth],
    );
  }

  async function removeSubscription(endpoint) {
    await pool.query("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
  }

  async function countSubscriptions() {
    const [rows] = await pool.query("SELECT COUNT(*) AS n FROM push_subscriptions");
    return rows[0].n;
  }

  // 登録されているすべてのブラウザへ送信。送れた件数を返す
  async function sendToAll(payload) {
    const [subs] = await pool.query("SELECT endpoint, p256dh, auth FROM push_subscriptions");
    const body = JSON.stringify(payload);
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            { TTL: 60 * 60 * 24 }, // ブラウザが起動していなくても1日は配信を待つ
          );
          sent++;
        } catch (err) {
          // 404 / 410 は購読が無効になっている → 削除
          if (err.statusCode === 404 || err.statusCode === 410) {
            await removeSubscription(s.endpoint);
          } else {
            console.error("Web Push send failed:", err.statusCode ?? "", err.body ?? err.message);
          }
        }
      }),
    );
    return sent;
  }

  return { publicKey, saveSubscription, removeSubscription, countSubscriptions, sendToAll };
};
