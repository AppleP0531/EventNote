const express = require("express");

const UNITS = ["week", "month", "year"];

module.exports = (pool, recurrence) => {
  const router = express.Router();
  const db = pool.promise(); // async/await で使えるようにする

  // 通知日数：整数だけ・重複なし
  const cleanDays = (reminders) =>
    [...new Set(Array.isArray(reminders) ? reminders : [])].filter(
      (n) => Number.isInteger(n) && n >= 0,
    );

  // GET /api/events … 予定一覧（通知日・繰り返し情報つき）
  router.get("/", async (_req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT e.*, r.interval_unit, r.interval_value
         FROM events e
         LEFT JOIN recurrence_rules r ON r.id = e.rule_id
         ORDER BY e.due_date ASC`,
      );
      const [reminders] = await db.query(
        "SELECT event_id, days_before FROM reminders ORDER BY days_before DESC",
      );

      const map = new Map();
      for (const r of reminders) {
        const list = map.get(r.event_id) ?? [];
        list.push(r.days_before);
        map.set(r.event_id, list);
      }

      res.json(
        rows.map(({ interval_unit, interval_value, ...e }) => ({
          ...e,
          reminders: map.get(e.id) ?? [],
          recurrence: e.rule_id
            ? { unit: interval_unit, interval: interval_value }
            : null,
        })),
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "予定の取得に失敗しました" });
    }
  });

  // POST /api/events … 予定を登録（recurrence があれば繰り返し登録）
  router.post("/", async (req, res) => {
    const { title, due_date, memo, reminders, recurrence: rec } = req.body;
    if (!title || !due_date) {
      return res.status(400).json({ message: "title と due_date は必須です" });
    }
    const days = cleanDays(reminders);

    // 繰り返しの指定を検証
    let rule = null;
    if (rec) {
      const interval = Number(rec.interval);
      const endDate = rec.end_date || null;
      if (
        !UNITS.includes(rec.unit) ||
        !Number.isInteger(interval) ||
        interval < 1 ||
        interval > 100
      ) {
        return res.status(400).json({ message: "繰り返しの指定が不正です" });
      }
      if (endDate && endDate < due_date) {
        return res
          .status(400)
          .json({ message: "終了日は開始日より後にしてください" });
      }
      rule = { unit: rec.unit, interval, endDate };
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      if (rule) {
        // 繰り返し登録：ルールを作って、予定を自動生成する
        const [ruleResult] = await conn.query(
          `INSERT INTO recurrence_rules
             (title, memo, reminder_days, interval_unit, interval_value, start_date, end_date)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            title,
            memo || null,
            JSON.stringify(days),
            rule.unit,
            rule.interval,
            due_date,
            rule.endDate,
          ],
        );

        const created = await recurrence.fillRule(conn, {
          id: ruleResult.insertId,
          title,
          memo: memo || null,
          reminder_days: JSON.stringify(days),
          interval_unit: rule.unit,
          interval_value: rule.interval,
          start_date: due_date,
          end_date: rule.endDate,
          generated_until: null,
        });

        if (created === 0) {
          await conn.rollback();
          return res.status(400).json({
            message:
              "今日以降に登録できる日付がありません（終了日を確認してください）",
          });
        }

        await conn.commit();
        return res.status(201).json({ rule_id: ruleResult.insertId, created });
      }

      // 1件だけ登録
      const [result] = await conn.query(
        "INSERT INTO events (title, due_date, memo) VALUES (?, ?, ?)",
        [title, due_date, memo || null],
      );
      const eventId = result.insertId;

      if (days.length > 0) {
        await conn.query(
          "INSERT INTO reminders (event_id, days_before) VALUES ?",
          [days.map((d) => [eventId, d])],
        );
      }

      await conn.commit();
      res.status(201).json({ id: eventId });
    } catch (err) {
      await conn.rollback();
      console.error(err);
      res
        .status(500)
        .json({ message: "予定の登録に失敗しました", detail: err.message });
    } finally {
      conn.release();
    }
  });

  // PUT /api/events/:id … 予定を編集（通知日も更新）
  router.put("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "idが不正です" });
    }
    const { title, due_date, memo, reminders } = req.body;
    if (!title || !due_date) {
      return res.status(400).json({ message: "title と due_date は必須です" });
    }
    const days = cleanDays(reminders);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        "SELECT due_date FROM events WHERE id = ? FOR UPDATE",
        [id],
      );
      if (rows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ message: "予定が見つかりません" });
      }
      const dateChanged = rows[0].due_date !== due_date;

      await conn.query(
        "UPDATE events SET title = ?, due_date = ?, memo = ? WHERE id = ?",
        [title, due_date, memo || null, id],
      );

      // 期限日が変わった or 通知日が空 → 通知設定を作り直す（通知済みの記録もリセット）
      // それ以外 → 外した通知日だけ消し、追加分だけ入れる（通知済みの記録は残す）
      if (dateChanged || days.length === 0) {
        await conn.query("DELETE FROM reminders WHERE event_id = ?", [id]);
      } else {
        await conn.query(
          "DELETE FROM reminders WHERE event_id = ? AND days_before NOT IN (?)",
          [id, days],
        );
      }
      if (days.length > 0) {
        await conn.query(
          "INSERT IGNORE INTO reminders (event_id, days_before) VALUES ?",
          [days.map((d) => [id, d])],
        );
      }

      await conn.commit();
      res.json({ id });
    } catch (err) {
      await conn.rollback();
      console.error(err);
      res
        .status(500)
        .json({ message: "予定の更新に失敗しました", detail: err.message });
    } finally {
      conn.release();
    }
  });

  // PATCH /api/events/:id/done … 完了・未完了の切り替え
  router.patch("/:id/done", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "idが不正です" });
    }
    const isDone = req.body.is_done ? 1 : 0;
    try {
      const [result] = await db.query(
        "UPDATE events SET is_done = ? WHERE id = ?",
        [isDone, id],
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "予定が見つかりません" });
      }
      res.json({ id, is_done: isDone });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "完了状態の更新に失敗しました" });
    }
  });

  // DELETE /api/events/:id … 予定を削除（?scope=all で繰り返しをすべて削除）
  router.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "idが不正です" });
    }
    const scope = req.query.scope === "all" ? "all" : "one";

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        "SELECT rule_id FROM events WHERE id = ? FOR UPDATE",
        [id],
      );
      if (rows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ message: "予定が見つかりません" });
      }
      const ruleId = rows[0].rule_id;

      if (scope === "all" && ruleId) {
        await conn.query("DELETE FROM events WHERE rule_id = ?", [ruleId]);
        await conn.query("DELETE FROM recurrence_rules WHERE id = ?", [ruleId]);
      } else {
        await conn.query("DELETE FROM events WHERE id = ?", [id]);
      }

      await conn.commit();
      res.json({ id });
    } catch (err) {
      await conn.rollback();
      console.error(err);
      res.status(500).json({ message: "予定の削除に失敗しました" });
    } finally {
      conn.release();
    }
  });

  return router;
};
