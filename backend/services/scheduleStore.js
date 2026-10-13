const { occurrencesBetween, isOccurrence, parseList } = require("./recurrence");

const DEFAULT_ALLDAY_TIME = "09:00";

// スケジュール・回ごとの個別設定・アプリ設定の読み込みと、予定の展開
module.exports = function createScheduleStore(pool) {
  // スケジュール一覧（通知設定つき）
  async function loadSchedules(where = "", params = []) {
    const [schedules] = await pool.query(
      `SELECT id, title, start_date, TIME_FORMAT(start_time, '%H:%i') AS start_time,
              interval_value, interval_unit, weekdays, month_mode, week_numbers,
              end_date, max_count, memo, category_id
         FROM schedules ${where} ORDER BY start_date, start_time, id`,
      params,
    );
    if (schedules.length === 0) return [];
    for (const s of schedules) {
      // "2,5" → [2, 5]（使わない種類では null）
      s.weekdays = s.weekdays ? parseList(s.weekdays) : null;
      s.week_numbers = s.week_numbers ? parseList(s.week_numbers) : null;
    }

    const [reminders] = await pool.query(
      `SELECT schedule_id, amount, unit FROM schedule_reminders
        WHERE schedule_id IN (?) ORDER BY unit = 'hour', amount DESC`,
      [schedules.map((s) => s.id)],
    );
    for (const s of schedules) {
      s.reminders = reminders
        .filter((r) => r.schedule_id === s.id)
        .map(({ amount, unit }) => ({ amount, unit }));
    }
    return schedules;
  }

  async function loadSchedule(id) {
    const [s] = await loadSchedules("WHERE id = ?", [id]);
    return s ?? null;
  }

  // 個別設定を「スケジュールID → (本来の日付 → 設定)」の Map で返す
  async function loadOverrides(scheduleIds) {
    const map = new Map();
    if (scheduleIds.length === 0) return map;
    const [rows] = await pool.query(
      `SELECT schedule_id, original_date, moved_date, TIME_FORMAT(moved_time, '%H:%i') AS moved_time,
              skipped, done
         FROM occurrence_overrides WHERE schedule_id IN (?)`,
      [scheduleIds],
    );
    for (const r of rows) {
      if (!map.has(r.schedule_id)) map.set(r.schedule_id, new Map());
      map.get(r.schedule_id).set(r.original_date, r);
    }
    return map;
  }

  // 本来の日付と個別設定から、実際の1回分の予定を作る
  function makeOccurrence(schedule, originalDate, ov) {
    const date = ov?.moved_date ?? originalDate;
    const time = ov?.moved_time ?? schedule.start_time;
    return {
      date, // 実際の日付（変更されていれば変更後）
      time, // 実際の時刻（NULLなら終日）
      original_date: originalDate,
      moved: date !== originalDate || (ov?.moved_time != null && ov.moved_time !== schedule.start_time),
      skipped: Boolean(ov?.skipped),
      done: Boolean(ov?.done),
      schedule,
    };
  }

  /**
   * from〜to の予定をすべて返す（繰り返しを展開し、回ごとの変更・休み・完了を反映）
   * 休み・完了の回も含む（skipped / done フラグで判断）
   */
  async function expand(from, to, schedules = null) {
    const list = schedules ?? (await loadSchedules());
    const overrides = await loadOverrides(list.map((s) => s.id));
    const result = [];

    for (const s of list) {
      const ovs = overrides.get(s.id) ?? new Map();
      // 本来の日付が範囲内のもの（別の日へ移動したものは除く）
      for (const o of occurrencesBetween(s, from, to)) {
        const ov = ovs.get(o.date);
        if (ov?.moved_date && ov.moved_date !== o.date) continue;
        result.push(makeOccurrence(s, o.date, ov));
      }
      // 別の日から範囲内へ移動してきたもの
      for (const ov of ovs.values()) {
        if (!ov.moved_date || ov.moved_date === ov.original_date) continue;
        if (ov.moved_date < from || ov.moved_date > to) continue;
        if (!isOccurrence(s, ov.original_date)) continue; // 終了条件の変更などで無くなった回
        result.push(makeOccurrence(s, ov.original_date, ov));
      }
    }

    result.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.time ?? "").localeCompare(b.time ?? "") ||
        a.schedule.id - b.schedule.id,
    );
    return result;
  }

  async function getSetting(name, fallback = null) {
    const [rows] = await pool.query("SELECT value FROM app_settings WHERE name = ?", [name]);
    return rows[0]?.value ?? fallback;
  }

  async function setSetting(name, value) {
    await pool.query(
      "INSERT INTO app_settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [name, value],
    );
  }

  const getAlldayTime = () => getSetting("allday_time", DEFAULT_ALLDAY_TIME);

  return { loadSchedules, loadSchedule, loadOverrides, makeOccurrence, expand, getSetting, setSetting, getAlldayTime };
};
