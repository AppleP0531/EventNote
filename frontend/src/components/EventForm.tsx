import type { FormEvent } from "react";
import { useState } from "react";
import type { EventItem, NewEvent, RecurrenceUnit } from "../types/event";
import { recurrenceLabel } from "../utils/recurrence";

type Props = {
  defaultDate: string; // 新規登録のときの初期日付
  initial?: EventItem; // 渡されると編集モード
  onSubmit: (event: NewEvent) => Promise<void>;
};

const REMINDER_OPTIONS = [
  { days: 90, label: "90日前" },
  { days: 30, label: "30日前" },
  { days: 7, label: "7日前" },
  { days: 1, label: "前日" },
  { days: 0, label: "当日" },
];

const PRESETS: { label: string; unit: RecurrenceUnit; interval: number }[] = [
  { label: "毎月", unit: "month", interval: 1 },
  { label: "毎年", unit: "year", interval: 1 },
  { label: "3年ごと", unit: "year", interval: 3 },
  { label: "5年ごと", unit: "year", interval: 5 },
  { label: "10年ごと", unit: "year", interval: 10 },
];

const EventForm = ({ defaultDate, initial, onSubmit }: Props) => {
  const isEdit = initial !== undefined;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? defaultDate);
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [reminders, setReminders] = useState<number[]>(
    initial?.reminders ?? [30, 7, 1],
  );

  // 繰り返し（新規登録のときだけ使う）
  const [repeat, setRepeat] = useState(false);
  const [intervalValue, setIntervalValue] = useState(1);
  const [unit, setUnit] = useState<RecurrenceUnit>("year");
  const [endDate, setEndDate] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const toggleReminder = (days: number) => {
    setReminders((prev) =>
      prev.includes(days) ? prev.filter((d) => d !== days) : [...prev, days],
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (repeat && (!Number.isInteger(intervalValue) || intervalValue < 1)) {
      setFormError("繰り返しの間隔は1以上の整数にしてください");
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      await onSubmit({
        title,
        due_date: dueDate,
        memo,
        reminders,
        recurrence: repeat
          ? { unit, interval: intervalValue, end_date: endDate || null }
          : null,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "エラーが発生しました");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h2 className="text-lg font-bold">
        {isEdit ? "予定を編集" : "予定を追加"}
      </h2>

      {formError && (
        <div className="alert alert-error text-sm">{formError}</div>
      )}

      <input
        className="input input-bordered w-full"
        placeholder="タイトル（例：免許更新日）"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />

      <input
        type="date"
        className="input input-bordered w-full"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        required
      />

      {/* 繰り返し（新規登録のみ） */}
      {!isEdit && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
            />
            <span className="text-sm font-bold">繰り返す</span>
          </label>

          {repeat && (
            <div className="space-y-2 rounded-lg bg-base-200 p-3">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={`btn btn-xs ${
                      p.interval === intervalValue && p.unit === unit
                        ? "btn-primary"
                        : "btn-outline"
                    }`}
                    onClick={() => {
                      setIntervalValue(p.interval);
                      setUnit(p.unit);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="input input-bordered input-sm w-20"
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(Number(e.target.value))}
                />
                <select
                  className="select select-bordered select-sm"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as RecurrenceUnit)}
                >
                  <option value="year">年ごと</option>
                  <option value="month">か月ごと</option>
                  <option value="week">週間ごと</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm">
                終了日（任意）
                <input
                  type="date"
                  className="input input-bordered input-sm"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>

              <p className="text-xs opacity-70">
                上の日付が最初の日です。過去の日付でも、今日以降の分が自動で登録されます。
              </p>
            </div>
          )}
        </div>
      )}

      {/* 編集中の予定が繰り返しの1回分のとき */}
      {isEdit && initial.recurrence && (
        <p className="text-xs opacity-70">
          🔁 {recurrenceLabel(initial.recurrence)}
          の繰り返しの1回分です。この予定だけが変更されます。
        </p>
      )}

      <fieldset>
        <legend className="text-sm font-bold mb-1">通知するタイミング</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {REMINDER_OPTIONS.map((opt) => (
            <label
              key={opt.days}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary"
                checked={reminders.includes(opt.days)}
                onChange={() => toggleReminder(opt.days)}
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <textarea
        className="textarea textarea-bordered w-full"
        placeholder="メモ（任意）"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />

      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={submitting}
      >
        {submitting ? "保存中..." : isEdit ? "保存" : "登録"}
      </button>
    </form>
  );
};

export default EventForm;
