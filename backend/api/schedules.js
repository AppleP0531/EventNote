const express = require("express");
const { isValidDate, isOccurrence, parseList, occurrencesBetween } = require("../services/recurrence");

const INTERVAL_UNITS = ["day", "week", "month", "year"];
const MONTH_MODES = ["date", "nth_weekday", "last_day"];
const MEMO_MAX = 2000;
const REMINDER_UNITS = ["day", "hour"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function isPositiveInt(v, max = 9999) {
  return Number.isInteger(v) && v >= 1 && v <= max;
}

function parseTime(value) {
  if (value == null || value === "") return { value: null };
  if (typeof value !== "string" || !TIME_RE.test(value)) return { error: "時刻が正しくありません" };
  return { value: value.slice(0, 5) };
}

// スケジュールの入力チェック。問題なければ整形済みの値、問題があれば { error } を返す
function validate(body) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { error: "スケジュール名を入力してください" };
  if (title.length > 100) return { error: "スケジュール名は100文字以内にしてください" };

  if (!isValidDate(body.start_date)) return { error: "初回日程が正しくありません" };

  const t = parseTime(body.start_time);
  if (t.error) return t;

  let intervalValue = null;
  let intervalUnit = null;
  let weekdays = null;
  let monthMode = null;
  let weekNumbers = null;
  let endDate = null;
  let maxCount = null;
  if (body.interval_unit) {
    intervalValue = Number(body.interval_value);
    intervalUnit = body.interval_unit;
    if (!INTERVAL_UNITS.includes(intervalUnit)) return { error: "周期の単位が正しくありません" };
    if (!isPositiveInt(intervalValue)) return { error: "周期は1以上の整数で入力してください" };

    // 曜日指定（毎週○曜 / 第○○曜日）
    const wds = parseList(body.weekdays);
    const wns = parseList(body.week_numbers);
    if (wds.some((d) => d < 0 || d > 6)) return { error: "曜日が正しくありません" };
    if (wns.some((n) => !(n === -1 || (n >= 1 && n <= 5)))) return { error: "第何週かの指定が正しくありません" };
    if (intervalUnit === "week") {
      if (wds.length === 0) return { error: "曜日を1つ以上選んでください" };
      weekdays = wds.join(",");
    }
    if (intervalUnit === "month") {
      monthMode = body.month_mode || "date";
      if (!MONTH_MODES.includes(monthMode)) return { error: "月の繰り返し方が正しくありません" };
      if (monthMode === "nth_weekday") {
        if (wns.length === 0) return { error: "第何週かを1つ以上選んでください" };
        if (wds.length === 0) return { error: "曜日を1つ以上選んでください" };
        weekdays = wds.join(",");
        weekNumbers = wns.join(",");
      }
    }

    // 終了条件（どちらか一方、または無し）
    if (body.end_date && body.max_count) return { error: "終了日と回数はどちらか一方だけ指定してください" };
    if (body.end_date) {
      if (!isValidDate(body.end_date)) return { error: "終了日が正しくありません" };
      if (body.end_date < body.start_date) return { error: "終了日は初回日程以降にしてください" };
      endDate = body.end_date;
    }
    if (body.max_count != null && body.max_count !== "") {
      maxCount = Number(body.max_count);
      if (!isPositiveInt(maxCount)) return { error: "回数は1以上の整数で入力してください" };
    }
  }

  const reminders = [];
  const seen = new Set();
  for (const r of Array.isArray(body.reminders) ? body.reminders : []) {
    const amount = Number(r.amount);
    if (!REMINDER_UNITS.includes(r.unit)) return { error: "通知の単位が正しくありません" };
    if (!isPositiveInt(amount)) return { error: "通知タイミングは1以上の整数で入力してください" };
    const key = `${amount}${r.unit}`;
    if (seen.has(key)) continue; // 重複は無視
    seen.add(key);
    reminders.push({ amount, unit: r.unit });
  }

  const memo = typeof body.memo === "string" ? body.memo.trim() : "";
  if (memo.length > MEMO_MAX) return { error: `メモは${MEMO_MAX}文字以内にしてください` };

  let categoryId = null;
  if (body.category_id != null && body.category_id !== "") {
    categoryId = Number(body.category_id);
    if (!isPositiveInt(categoryId, 2 ** 31)) return { error: "カテゴリが正しくありません" };
  }

  return {
    title,
    startDate: body.start_date,
    startTime: t.value,
    intervalValue,
    intervalUnit,
    weekdays,
    monthMode,
    weekNumbers,
    endDate,
    maxCount,
    memo: memo || null,
    categoryId,
    reminders,
  };
}

module.exports = (pool, store, scheduler) => {
  const router = express.Router();

  // 登録・変更後すぐに通知時刻をチェック（すでに通知時刻を過ぎていれば即送信）
  const checkReminders = () => scheduler?.check();

  async function saveReminders(conn, scheduleId, reminders) {
    await conn.query("DELETE FROM schedule_reminders WHERE schedule_id = ?", [scheduleId]);
    if (reminders.length > 0) {
      await conn.query("INSERT INTO schedule_reminders (schedule_id, amount, unit) VALUES ?", [
        reminders.map((r) => [scheduleId, r.amount, r.unit]),
      ]);
    }
  }

  // GET /api/schedules
  router.get("/", async (_req, res, next) => {
    try {
      res.json(await store.loadSchedules());
    } catch (e) {
      next(e);
    }
  });

  // GET /api/schedules/occurrences?from=YYYY-MM-DD&to=YYYY-MM-DD
  // 繰り返しを展開して、期間内のすべての予定を返す（回ごとの変更・休み・完了を反映）
  router.get("/occurrences", async (req, res, next) => {
    try {
      const { from, to } = req.query;
      if (!isValidDate(from) || !isValidDate(to) || from > to) {
        return res.status(400).json({ message: "from / to の指定が正しくありません" });
      }
      res.json(await store.expand(from, to));
    } catch (e) {
      next(e);
    }
  });

  // POST /api/schedules/preview … 保存前に、入力内容での予定日を先頭から数件返す（入力フォームの確認用）
  router.post("/preview", (req, res) => {
    const v = validate({ title: "preview", ...(req.body ?? {}) });
    if (v.error) return res.status(400).json({ message: v.error });
    const [y, m, d] = v.startDate.split("-").map(Number);
    const to = `${y + 5}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dates = occurrencesBetween(
      {
        start_date: v.startDate,
        interval_value: v.intervalValue,
        interval_unit: v.intervalUnit,
        weekdays: v.weekdays,
        month_mode: v.monthMode,
        week_numbers: v.weekNumbers,
        end_date: v.endDate,
        max_count: v.maxCount,
      },
      v.startDate,
      to,
    );
    res.json({ dates: dates.slice(0, 6).map((o) => o.date), more: dates.length > 6 });
  });

  // POST /api/schedules
  router.post("/", async (req, res, next) => {
    const v = validate(req.body ?? {});
    if (v.error) return res.status(400).json({ message: v.error });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.query(
        `INSERT INTO schedules (title, start_date, start_time, interval_value, interval_unit,
                                weekdays, month_mode, week_numbers, end_date, max_count, memo, category_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          v.title, v.startDate, v.startTime, v.intervalValue, v.intervalUnit,
          v.weekdays, v.monthMode, v.weekNumbers, v.endDate, v.maxCount, v.memo, v.categoryId,
        ],
      );
      await saveReminders(conn, r.insertId, v.reminders);
      await conn.commit();
      res.status(201).json(await store.loadSchedule(r.insertId));
      checkReminders();
    } catch (e) {
      await conn.rollback();
      next(e);
    } finally {
      conn.release();
    }
  });

  // PUT /api/schedules/:id
  router.put("/:id", async (req, res, next) => {
    const id = Number(req.params.id);
    const v = validate(req.body ?? {});
    if (v.error) return res.status(400).json({ message: v.error });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[old]] = await conn.query(
        `SELECT start_date, TIME_FORMAT(start_time, '%H:%i') AS start_time, interval_value, interval_unit,
                weekdays, month_mode, week_numbers
           FROM schedules WHERE id = ?`,
        [id],
      );
      if (!old) {
        await conn.rollback();
        return res.status(404).json({ message: "スケジュールが見つかりません" });
      }
      await conn.query(
        `UPDATE schedules
            SET title = ?, start_date = ?, start_time = ?, interval_value = ?, interval_unit = ?,
                weekdays = ?, month_mode = ?, week_numbers = ?, end_date = ?, max_count = ?,
                memo = ?, category_id = ?
          WHERE id = ?`,
        [
          v.title, v.startDate, v.startTime, v.intervalValue, v.intervalUnit,
          v.weekdays, v.monthMode, v.weekNumbers, v.endDate, v.maxCount, v.memo, v.categoryId, id,
        ],
      );
      await saveReminders(conn, id, v.reminders);

      // 初回日程・周期が変わると各回の日付がずれるので、回ごとの個別設定（変更・休み・完了）をリセット
      const seriesChanged =
        old.start_date !== v.startDate ||
        (old.interval_value ?? null) !== v.intervalValue ||
        (old.interval_unit ?? null) !== v.intervalUnit ||
        (old.weekdays ?? null) !== v.weekdays ||
        ((old.interval_unit === "month" ? old.month_mode ?? "date" : null) ?? null) !== v.monthMode ||
        (old.week_numbers ?? null) !== v.weekNumbers;
      if (seriesChanged) {
        await conn.query("DELETE FROM occurrence_overrides WHERE schedule_id = ?", [id]);
      }
      // 日時が変わったら送信済み履歴をリセットして、新しい日時で通知し直す
      if (seriesChanged || (old.start_time ?? null) !== v.startTime) {
        await conn.query("DELETE FROM sent_reminders WHERE schedule_id = ?", [id]);
      }
      await conn.commit();
      res.json(await store.loadSchedule(id));
      checkReminders();
    } catch (e) {
      await conn.rollback();
      next(e);
    } finally {
      conn.release();
    }
  });

  // DELETE /api/schedules/:id
  router.delete("/:id", async (req, res, next) => {
    try {
      const [r] = await pool.query("DELETE FROM schedules WHERE id = ?", [Number(req.params.id)]);
      if (r.affectedRows === 0) return res.status(404).json({ message: "スケジュールが見つかりません" });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  // PUT /api/schedules/:id/occurrences/:originalDate
  // 1回分だけの設定（日時の変更・休み・完了）。body: { moved_date, moved_time, skipped, done }
  // すべて既定値（変更なし・休みなし・未完了）なら個別設定を削除する
  router.put("/:id/occurrences/:originalDate", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const originalDate = req.params.originalDate;
      const body = req.body ?? {};

      const schedule = await store.loadSchedule(id);
      if (!schedule) return res.status(404).json({ message: "スケジュールが見つかりません" });
      if (!isValidDate(originalDate) || !isOccurrence(schedule, originalDate)) {
        return res.status(400).json({ message: "その日はこのスケジュールの予定日ではありません" });
      }

      let movedDate = body.moved_date || null;
      if (movedDate && !isValidDate(movedDate)) return res.status(400).json({ message: "変更後の日付が正しくありません" });
      if (movedDate === originalDate) movedDate = null;
      const t = parseTime(body.moved_time);
      if (t.error) return res.status(400).json({ message: t.error });
      const movedTime = t.value === schedule.start_time ? null : t.value;
      const skipped = Boolean(body.skipped);
      const done = Boolean(body.done);

      const [[prev]] = await pool.query(
        `SELECT moved_date, TIME_FORMAT(moved_time, '%H:%i') AS moved_time
           FROM occurrence_overrides WHERE schedule_id = ? AND original_date = ?`,
        [id, originalDate],
      );

      if (!movedDate && !movedTime && !skipped && !done) {
        await pool.query("DELETE FROM occurrence_overrides WHERE schedule_id = ? AND original_date = ?", [
          id,
          originalDate,
        ]);
      } else {
        await pool.query(
          `INSERT INTO occurrence_overrides (schedule_id, original_date, moved_date, moved_time, skipped, done, done_at)
           VALUES (?, ?, ?, ?, ?, ?, IF(?, NOW(), NULL))
           ON DUPLICATE KEY UPDATE moved_date = VALUES(moved_date), moved_time = VALUES(moved_time),
             skipped = VALUES(skipped), done_at = IF(VALUES(done) AND NOT done, NOW(), IF(VALUES(done), done_at, NULL)),
             done = VALUES(done)`,
          [id, originalDate, movedDate, movedTime, skipped, done, done],
        );
      }

      // 日時が変わったら、その回の送信済み履歴をリセット（新しい日時で通知し直す）
      if ((prev?.moved_date ?? null) !== movedDate || (prev?.moved_time ?? null) !== movedTime) {
        await pool.query("DELETE FROM sent_reminders WHERE schedule_id = ? AND occurrence_date = ?", [
          id,
          originalDate,
        ]);
      }

      const overrides = await store.loadOverrides([id]);
      res.json(store.makeOccurrence(schedule, originalDate, overrides.get(id)?.get(originalDate)));
      checkReminders();
    } catch (e) {
      next(e);
    }
  });

  router.use((err, _req, res, _next) => {
    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({ message: "カテゴリが見つかりません（削除された可能性があります）" });
    }
    console.error(err);
    res.status(500).json({ message: "サーバーエラーが発生しました" });
  });

  return router;
};
