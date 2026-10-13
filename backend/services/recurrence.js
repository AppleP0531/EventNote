// 繰り返しスケジュールの日付計算
// 日付はすべて "YYYY-MM-DD" 文字列で扱い、内部ではUTCのDateで計算する（タイムゾーンずれ防止）
//
// 繰り返しの種類
//   interval_unit = 'day'   … N日ごと
//   interval_unit = 'week'  … N週ごと、weekdays の曜日（0=日〜6=土、複数可）
//   interval_unit = 'month' … Nか月ごと。month_mode で日の決め方を選ぶ
//       'date'        … 初回日程と同じ日（31日など無い月は月末）
//       'nth_weekday' … 第 week_numbers（1〜5、-1=最終）の weekdays 曜日
//       'last_day'    … 月末
//   interval_unit = 'year'  … N年ごと（初回日程と同じ月日。2/29 は平年は 2/28）
// 曜日・週指定の繰り返しは、開始日（start_date）以降の該当日が予定になる。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LOOP = 20000;

function parse(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function format(y, m, d) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toUtc(ymd) {
  const { y, m, d } = parse(ymd);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms) {
  const dt = new Date(ms);
  return format(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function isValidDate(ymd) {
  if (typeof ymd !== "string" || !DATE_RE.test(ymd)) return false;
  return fromUtc(toUtc(ymd)) === ymd;
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const addDays = (ymd, n) => fromUtc(toUtc(ymd) + n * DAY_MS);
const weekdayOf = (ymd) => new Date(toUtc(ymd)).getUTCDay();
const diffDays = (a, b) => Math.round((toUtc(b) - toUtc(a)) / DAY_MS);

// "2,5" や [2,5] を数値配列に
function parseList(v) {
  if (v == null || v === "") return [];
  const arr = Array.isArray(v) ? v : String(v).split(",");
  return [...new Set(arr.map(Number).filter((n) => Number.isInteger(n)))].sort((a, b) => a - b);
}

// 月の通し番号（年*12+月-1）から年・月
const monthOf = (index) => ({ y: Math.floor(index / 12), m: (index % 12) + 1 });

// その月の「第n weekday曜日」（n=-1 は最終）。無ければ null
function nthWeekdayOfMonth(y, m, n, weekday) {
  const dim = daysInMonth(y, m);
  if (n === -1) {
    const lastWd = new Date(Date.UTC(y, m - 1, dim)).getUTCDay();
    return format(y, m, dim - ((lastWd - weekday + 7) % 7));
  }
  const firstWd = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstWd + 7) % 7) + 7 * (n - 1);
  return day <= dim ? format(y, m, day) : null;
}

// 「日付だけで決まる」繰り返しか（n回目を直接計算できる）
function isSimple(s) {
  return s.interval_unit === "day" || s.interval_unit === "year" || (s.interval_unit === "month" && (s.month_mode ?? "date") === "date");
}

// 初回日程から n 回目の日付（日・月の同日・年の繰り返し用）
// 月・年周期で該当日が無い場合（1/31 → 2月 など）はその月の末日にそろえる
function nthDate(schedule, n) {
  const { start_date, interval_value, interval_unit } = schedule;
  if (n === 0 || !interval_unit) return start_date;
  const { y, m, d } = parse(start_date);
  const step = interval_value * n;

  if (interval_unit === "day") return addDays(start_date, step);

  const monthsToAdd = interval_unit === "month" ? step : step * 12;
  const { y: ny, m: nm } = monthOf(y * 12 + (m - 1) + monthsToAdd);
  return format(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

// 曜日・週指定・月末の繰り返しの起点（期間0の先頭）
//   週: 開始日を含む週の日曜日。その週に開始日以降の該当曜日が無ければ翌週から
//   月: 開始日の月。その月に開始日以降の該当日が無ければ翌月から
//   （「隔週月曜」を水曜に登録したとき、直後の月曜から数え始めるため）
function anchor(s) {
  const weekdays = parseList(s.weekdays);
  if (s.interval_unit === "week") {
    const sunday = addDays(s.start_date, -weekdayOf(s.start_date));
    const hasInFirstWeek = weekdays.some((wd) => wd >= weekdayOf(s.start_date));
    return { week: hasInFirstWeek ? sunday : addDays(sunday, 7) };
  }
  const { y, m } = parse(s.start_date);
  const month = y * 12 + (m - 1);
  return { month: rawMonthDates(s, month).some((d) => d >= s.start_date) ? month : month + 1 };
}

// 月の通し番号 month の候補日（開始日での絞り込み前）
function rawMonthDates(s, month) {
  const { y, m } = monthOf(month);
  if (s.month_mode === "last_day") return [format(y, m, daysInMonth(y, m))];
  const dates = [];
  for (const n of parseList(s.week_numbers)) {
    for (const wd of parseList(s.weekdays)) {
      const d = nthWeekdayOfMonth(y, m, n, wd);
      if (d) dates.push(d);
    }
  }
  return dates;
}

// p 番目の期間（週 or 月）に含まれる予定日（昇順・開始日以降）
function periodDates(s, a, p) {
  const N = s.interval_value;
  let dates;
  if (s.interval_unit === "week") {
    const base = addDays(a.week, p * 7 * N);
    dates = parseList(s.weekdays).map((wd) => addDays(base, wd));
  } else {
    dates = rawMonthDates(s, a.month + p * N);
  }
  return [...new Set(dates)].filter((d) => d >= s.start_date).sort();
}

// from より前の期間を飛ばすときの開始期間（回数指定があるときは数える必要があるので 0）
function firstPeriod(s, a, from) {
  if (s.max_count || from <= s.start_date) return 0;
  if (s.interval_unit === "week") {
    return Math.max(0, Math.floor(diffDays(a.week, from) / (7 * s.interval_value)) - 1);
  }
  const b = parse(from);
  const months = b.y * 12 + (b.m - 1) - a.month;
  return Math.max(0, Math.floor(months / s.interval_value) - 1);
}

// from〜to（両端含む）の範囲に入る予定日をすべて返す
//   end_date（この日まで）/ max_count（全N回）があればそこで終わる
function occurrencesBetween(schedule, from, to) {
  const result = [];
  const s = schedule;
  const { start_date, interval_value, interval_unit, end_date, max_count } = s;
  if (start_date > to) return result;

  if (!interval_unit || !interval_value) {
    if (start_date >= from) result.push({ date: start_date, index: 0 });
    return result;
  }
  if (end_date && end_date < to) to = end_date;

  if (isSimple(s)) {
    // 範囲の手前まで一気に飛ばして無駄なループを避ける
    let n = 0;
    if (from > start_date && !max_count) {
      if (interval_unit === "day") {
        n = Math.floor(diffDays(start_date, from) / interval_value);
      } else {
        const a = parse(start_date);
        const b = parse(from);
        const diffMonths = (b.y - a.y) * 12 + (b.m - a.m);
        const unitMonths = interval_unit === "month" ? interval_value : interval_value * 12;
        n = Math.max(0, Math.floor(diffMonths / unitMonths) - 1);
      }
    }
    for (let guard = 0; guard < MAX_LOOP; guard++, n++) {
      if (max_count && n >= max_count) break;
      const date = nthDate(s, n);
      if (date > to) break;
      if (date >= from) result.push({ date, index: n });
    }
    return result;
  }

  // 曜日・週指定・月末
  const a = anchor(s);
  let p = firstPeriod(s, a, from);
  let n = p === 0 ? 0 : null; // 途中から数え始めた場合は何回目か不明
  for (let guard = 0; guard < MAX_LOOP; guard++, p++) {
    const dates = periodDates(s, a, p);
    if (dates.length > 0 && dates[0] > to) break;
    for (const date of dates) {
      if (max_count && n >= max_count) return result;
      if (date > to) return result;
      if (date >= from) result.push({ date, index: n });
      if (n !== null) n++;
    }
  }
  return result;
}

// その日がスケジュール本来の予定日か
function isOccurrence(schedule, date) {
  return occurrencesBetween(schedule, date, date).length > 0;
}

module.exports = { isValidDate, parseList, occurrencesBetween, isOccurrence };
