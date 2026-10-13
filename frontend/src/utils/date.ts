import { REMINDER_UNIT_LABEL } from "../types/schedule";
import type { Reminder, Schedule } from "../types/schedule";

const pad = (n: number) => String(n).padStart(2, "0");

// Date → "YYYY-MM-DD"（ローカル時刻）
export const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "YYYY-MM-DD" → ローカル0:00のDate
export const fromYmd = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, days: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

export const todayYmd = () => toYmd(new Date());

// 予定の日時。時刻なし（終日）なら設定の基準時刻を使う
export const occurrenceDateTime = (date: string, time: string | null, alldayTime = "00:00") => {
  const d = fromYmd(date);
  const [h, m] = (time ?? alldayTime).split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

// 通知する日時
export const reminderTime = (base: Date, r: Reminder) => {
  const t = new Date(base);
  if (r.unit === "day") t.setDate(t.getDate() - r.amount);
  else t.setHours(t.getHours() - r.amount);
  return t;
};

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

export const formatDateJa = (ymd: string) => {
  const d = fromYmd(ymd);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`;
};

export const formatDateTimeJa = (d: Date) =>
  `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;

// 今日から何日後か
export const daysFromToday = (ymd: string) =>
  Math.round((fromYmd(ymd).getTime() - fromYmd(todayYmd()).getTime()) / 86_400_000);

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const weekNumberLabel = (n: number) => (n === -1 ? "最終" : `第${n}`);

// 繰り返しの説明（例: 毎週 火・金 / 2週ごと 月 / 毎月 第2・第4 水曜 / 毎月末 / 3か月ごと 15日）
export const formatInterval = (
  s: Pick<Schedule, "interval_value" | "interval_unit" | "weekdays" | "month_mode" | "week_numbers" | "start_date">,
) => {
  const n = s.interval_value;
  if (!s.interval_unit || !n) return "";
  const wds = (s.weekdays ?? []).map((d) => WEEKDAY_LABELS[d]).join("・");

  switch (s.interval_unit) {
    case "day":
      return n === 1 ? "毎日" : `${n}日ごと`;
    case "week":
      return `${n === 1 ? "毎週" : `${n}週ごと`} ${wds}曜`;
    case "month": {
      const every = n === 1 ? "毎月" : `${n}か月ごと`;
      if (s.month_mode === "last_day") return n === 1 ? "毎月末" : `${every} 月末`;
      if (s.month_mode === "nth_weekday") {
        const nums = (s.week_numbers ?? []).map(weekNumberLabel).join("・");
        return `${every} ${nums} ${wds}曜`;
      }
      return `${every} ${Number(s.start_date.slice(8))}日`;
    }
    case "year":
      return n === 1 ? "毎年" : `${n}年ごと`;
  }
};

export const formatEnd = (s: Pick<Schedule, "end_date" | "max_count">) =>
  s.end_date ? `${formatDateJa(s.end_date)}まで` : s.max_count ? `全${s.max_count}回` : "";

export const formatReminder = (r: Reminder) => `${r.amount}${REMINDER_UNIT_LABEL[r.unit]}`;
