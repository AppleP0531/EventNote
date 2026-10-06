export type RecurrenceUnit = "week" | "month" | "year";

// 一覧に表示する繰り返しの情報
export type Recurrence = {
    unit: RecurrenceUnit;
    interval: number;
};

// 登録時に送る繰り返しの指定
export type RecurrenceInput = Recurrence & {
    end_date: string | null;
};

// DBから取得する予定
export type EventItem = {
    id: number;
    title: string;
    due_date: string; // "2026-10-06"
    memo: string | null;
    is_done: number; // 0 or 1
    reminders: number[]; // 何日前に通知するか（例: [30, 7, 1]）
    rule_id: number | null; // 繰り返しの予定なら値が入る
    recurrence: Recurrence | null;
};

// 登録・編集フォームから送る予定
export type NewEvent = {
    title: string;
    due_date: string;
    memo: string;
    reminders: number[];
    recurrence?: RecurrenceInput | null;
};