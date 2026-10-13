const CHECK_INTERVAL_MS = 60_000; // 1分ごとにチェック
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

const pad = (n) => String(n).padStart(2, "0");
const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 予定の日時（サーバーのローカル時刻）。時刻なし（終日）なら設定の基準時刻を使う
function occurrenceDateTime(date, time, alldayTime) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = (time ?? alldayTime).split(":").map(Number);
  return new Date(y, m - 1, d, h, mi);
}

// 通知に添えるメモ（先頭の数行・最大120文字）
function memoLine(memo) {
  if (!memo) return "";
  const text = memo.split(/\r?\n/).filter(Boolean).slice(0, 3).join(" / ");
  return `\n📝 ${text.length > 120 ? `${text.slice(0, 120)}…` : text}`;
}

function reminderTime(base, r) {
  const t = new Date(base);
  if (r.unit === "day") t.setDate(t.getDate() - r.amount);
  else t.setHours(t.getHours() - r.amount);
  return t;
}

function formatWhen(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const s = `${m}/${d}(${WEEK[dt.getDay()]})`;
  return time ? `${s} ${time}` : `${s}（終日）`;
}

/**
 * 通知時刻になった予定を Web Push で送る。
 * 通知時刻を過ぎていて、予定日時をまだ過ぎていない未送信のものが対象
 * （サーバーが止まっていた間の分も、予定日時前なら起動後に送る）。
 * 休み・完了にした回は送らない。
 */
module.exports = function createReminderScheduler(pool, store, push) {
  let running = false;
  let pending = false;

  async function check() {
    if (running) {
      pending = true; // 実行中に呼ばれたら終了後にもう一度
      return;
    }
    running = true;
    try {
      // 通知先のブラウザが1つも無ければ何もしない（登録後に未送信分をまとめて送る）
      if ((await push.countSubscriptions()) === 0) return;

      const schedules = (await store.loadSchedules()).filter((s) => s.reminders.length > 0);
      if (schedules.length === 0) return;
      const alldayTime = await store.getAlldayTime();

      const now = new Date();
      // 一番先の通知が届く範囲まで予定を展開する
      const maxDays = Math.max(
        1,
        ...schedules.flatMap((s) =>
          s.reminders.map((r) => (r.unit === "day" ? r.amount : Math.ceil(r.amount / 24))),
        ),
      );
      const from = toYmd(now);
      const to = toYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + maxDays + 1));

      for (const o of await store.expand(from, to, schedules)) {
        if (o.skipped || o.done) continue;
        const base = occurrenceDateTime(o.date, o.time, alldayTime);
        if (base <= now) continue;

        for (const r of o.schedule.reminders) {
          if (reminderTime(base, r) > now) continue;

          // 先に送信済みとして記録（INSERT IGNORE で重複なら送らない）
          const [ins] = await pool.query(
            `INSERT IGNORE INTO sent_reminders (schedule_id, occurrence_date, amount, unit)
             VALUES (?, ?, ?, ?)`,
            [o.schedule.id, o.original_date, r.amount, r.unit],
          );
          if (ins.affectedRows === 0) continue;

          const label = `${r.amount}${r.unit === "day" ? "日前" : "時間前"}`;
          const sent = await push.sendToAll({
            title: `🔔 ${o.schedule.title}`,
            body: `${formatWhen(o.date, o.time)} の予定です（${label}の通知）${memoLine(o.schedule.memo)}`,
            tag: `${o.schedule.id}|${o.original_date}|${r.amount}${r.unit}`,
            url: "/",
          });
          if (sent === 0) {
            // 1台にも届かなかった → 記録を消して次回のチェックで再送
            await pool.query(
              "DELETE FROM sent_reminders WHERE schedule_id = ? AND occurrence_date = ? AND amount = ? AND unit = ?",
              [o.schedule.id, o.original_date, r.amount, r.unit],
            );
          } else {
            console.log(`Reminder sent: ${o.schedule.title} ${o.date} (${label}) → ${sent} device(s)`);
          }
        }
      }
    } catch (err) {
      console.error("Reminder check failed:", err);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        check();
      }
    }
  }

  return {
    start() {
      check();
      setInterval(check, CHECK_INTERVAL_MS);
    },
    check,
  };
};
