export type IntervalUnit = "day" | "week" | "month" | "year";
export type MonthMode = "date" | "nth_weekday" | "last_day";
export type ReminderUnit = "day" | "hour";

export type Reminder = {
  amount: number;
  unit: ReminderUnit;
};

export type Schedule = {
  id: number;
  title: string;
  start_date: string; // YYYY-MM-DD
  start_time: string | null; // HH:mm（NULLなら終日）
  interval_value: number | null;
  interval_unit: IntervalUnit | null;
  weekdays: number[] | null; // 曜日（0=日〜6=土）週・第○曜日で使用
  month_mode: MonthMode | null; // 月の繰り返し方
  week_numbers: number[] | null; // 第何週か（1〜5、-1=最終）
  end_date: string | null; // 繰り返しの終了日（この日まで）
  max_count: number | null; // 繰り返しの回数（全N回）
  memo: string | null;
  category_id: number | null;
  reminders: Reminder[];
};

// 登録・更新時に送る内容
export type ScheduleInput = Omit<Schedule, "id">;

// 繰り返しを展開した1回分の予定（回ごとの変更・休み・完了を反映済み）
export type Occurrence = {
  date: string; // 実際の日付（この回だけ変更していれば変更後）
  time: string | null; // 実際の時刻（NULLなら終日）
  original_date: string; // 本来の予定日
  moved: boolean; // この回だけ日時を変更している
  skipped: boolean; // この回は休み
  done: boolean; // 完了
  schedule: Schedule;
};

// 1回分だけの設定
export type OccurrenceOverride = {
  moved_date: string | null;
  moved_time: string | null;
  skipped: boolean;
  done: boolean;
};

export type Category = {
  id: number;
  name: string;
  color: string; // utils/colors.ts のキー
};

export type Settings = {
  allday_time: string; // 終日予定の通知基準時刻 HH:mm
};

export const INTERVAL_UNIT_LABEL: Record<IntervalUnit, string> = {
  day: "日",
  week: "週",
  month: "か月",
  year: "年",
};

export const REMINDER_UNIT_LABEL: Record<ReminderUnit, string> = {
  day: "日前",
  hour: "時間前",
};

// 1回分の予定を一意に表すキー
export const occurrenceKey = (o: Occurrence) => `${o.schedule.id}|${o.original_date}`;

// 現在の状態から個別設定を作る（変更したい項目だけ上書きして送る）
export const currentOverride = (o: Occurrence): OccurrenceOverride => ({
  moved_date: o.date !== o.original_date ? o.date : null,
  moved_time: o.time !== o.schedule.start_time ? o.time : null,
  skipped: o.skipped,
  done: o.done,
});
