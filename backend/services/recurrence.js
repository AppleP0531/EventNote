const cron = require("node-cron");
const { addWeeks, addMonths, addYears } = require("date-fns");
const { toYmd, parseYmd } = require("../utils/date");

const HORIZON_YEARS = 2; // 何年先まで予定を作っておくか
const MAX_STEPS = 20000; // 無限ループ防止

const adders = { week: addWeeks, month: addMonths, year: addYears };

module.exports = (pool) => {
  const db = pool.promise();

  // ルールに従って、足りない予定を作る（作った件数を返す）
  const fillRule = async (conn, rule) => {
    const today = toYmd(new Date());
    const horizon = toYmd(addYears(new Date(), HORIZON_YEARS));
    const start = parseYmd(rule.start_date);
    const add = adders[rule.interval_unit];
    const nth = (k) => toYmd(add(start, k * rule.interval_value));

    // 今日以降で最初の日付
    let k = 0;
    while (nth(k) < today && k < MAX_STEPS) k++;
    const next = nth(k);

    // 作る範囲の終わり：2年先まで。ただし直近の1件は必ず含める。終了日があればそこまで
    let limit = next > horizon ? next : horizon;
    if (rule.end_date && rule.end_date < limit) limit = rule.end_date;

    const dates = [];
    for (let i = k; i < MAX_STEPS && nth(i) <= limit; i++) {
      const d = nth(i);
      if (rule.generated_until && d <= rule.generated_until) continue; // 作成済み範囲
      dates.push(d);
    }

    const days = JSON.parse(rule.reminder_days || "[]");
    for (const due of dates) {
      const [result] = await conn.query(
        "INSERT INTO events (title, due_date, memo, rule_id) VALUES (?, ?, ?, ?)",
        [rule.title, due, rule.memo, rule.id],
      );
      if (days.length > 0) {
        await conn.query(
          "INSERT INTO reminders (event_id, days_before) VALUES ?",
          [days.map((d) => [result.insertId, d])],
        );
      }
    }

    await conn.query(
      `UPDATE recurrence_rules SET generated_until = ?
       WHERE id = ? AND (generated_until IS NULL OR generated_until < ?)`,
      [limit, rule.id, limit],
    );
    return dates.length;
  };

  // すべてのルールを補充する
  const topUpAll = async () => {
    const today = toYmd(new Date());
    const [rules] = await db.query(
      "SELECT * FROM recurrence_rules WHERE end_date IS NULL OR end_date >= ?",
      [today],
    );

    let total = 0;
    for (const rule of rules) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        total += await fillRule(conn, rule);
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        console.error("recurrence error:", rule.id, err);
      } finally {
        conn.release();
      }
    }
    return total;
  };

  // 毎日3:00に補充 ＋ 起動時に1回
  const start = () => {
    cron.schedule("0 3 * * *", () => topUpAll().catch(console.error), {
      timezone: "Asia/Tokyo",
    });
    topUpAll()
      .then((n) => console.log("recurrence top-up:", n))
      .catch(console.error);
  };

  return { fillRule, topUpAll, start };
};
