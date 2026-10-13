import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { previewSchedule } from "../api/schedules";
import type {
  Category,
  IntervalUnit,
  MonthMode,
  Reminder,
  ReminderUnit,
  Schedule,
  ScheduleInput,
} from "../types/schedule";
import { INTERVAL_UNIT_LABEL, REMINDER_UNIT_LABEL } from "../types/schedule";
import { colorHex } from "../utils/colors";
import { WEEKDAY_LABELS, formatDateJa, fromYmd } from "../utils/date";
import { useEscape } from "../hooks/useEscape";

type Props = {
  initial: Schedule | null; // null なら新規
  defaultDate: string;
  alldayTime: string; // 終日予定の通知基準時刻
  categories: Category[];
  onSubmit: (input: ScheduleInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
};

type ReminderRow = { amount: string; unit: ReminderUnit };
type EndType = "none" | "until" | "count";

const WEEK_NUMBERS: { value: number; label: string }[] = [
  { value: 1, label: "第1" },
  { value: 2, label: "第2" },
  { value: 3, label: "第3" },
  { value: 4, label: "第4" },
  { value: 5, label: "第5" },
  { value: -1, label: "最終" },
];

const toggle = (list: number[], v: number) =>
  (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]).sort((a, b) => a - b);

// 曜日などのトグルボタン
const ToggleButtons = ({
  options,
  selected,
  onToggle,
}: {
  options: { value: number; label: string; className?: string }[];
  selected: number[];
  onToggle: (v: number) => void;
}) => (
  <div className="join">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        className={`join-item btn btn-sm px-2.5 ${selected.includes(o.value) ? "btn-secondary" : `btn-outline ${o.className ?? ""}`}`}
        onClick={() => onToggle(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const WEEKDAY_OPTIONS = WEEKDAY_LABELS.map((label, value) => ({
  value,
  label,
  className: value === 0 ? "text-error" : value === 6 ? "text-info" : "",
}));

const ScheduleForm = ({ initial, defaultDate, alldayTime, categories, onSubmit, onDelete, onClose }: Props) => {
  const initDate = initial?.start_date ?? defaultDate;
  const initWeekday = fromYmd(initDate).getDay();
  const initWeekNumber = Math.min(5, Math.ceil(Number(initDate.slice(8)) / 7));

  const [title, setTitle] = useState(initial?.title ?? "");
  const [startDate, setStartDate] = useState(initDate);
  const [startTime, setStartTime] = useState(initial?.start_time ?? "");
  const [repeat, setRepeat] = useState(Boolean(initial?.interval_unit));
  const [intervalValue, setIntervalValue] = useState(String(initial?.interval_value ?? 1));
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(initial?.interval_unit ?? "week");
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? [initWeekday]);
  const [monthMode, setMonthMode] = useState<MonthMode>(initial?.month_mode ?? "date");
  const [weekNumbers, setWeekNumbers] = useState<number[]>(initial?.week_numbers ?? [initWeekNumber]);
  const [endType, setEndType] = useState<EndType>(
    initial?.end_date ? "until" : initial?.max_count ? "count" : "none",
  );
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [maxCount, setMaxCount] = useState(String(initial?.max_count ?? 10));
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(initial?.category_id ?? null);
  const [reminders, setReminders] = useState<ReminderRow[]>(
    (initial?.reminders ?? []).map((r) => ({ amount: String(r.amount), unit: r.unit })),
  );
  const [preview, setPreview] = useState<{ dates: string[]; more: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEscape(onClose, !busy);

  // 曜日で決まる繰り返しか（このときの開始日は「この日以降の該当日から」の意味になる）
  const patternMode =
    repeat && (intervalUnit === "week" || (intervalUnit === "month" && monthMode !== "date"));

  // 入力中の繰り返し設定から、最初の数回の日付を表示
  const repeatInput = (): Partial<ScheduleInput> => ({
    start_date: startDate,
    interval_value: repeat ? Number(intervalValue) : null,
    interval_unit: repeat ? intervalUnit : null,
    weekdays: repeat && (intervalUnit === "week" || monthMode === "nth_weekday") ? weekdays : null,
    month_mode: repeat && intervalUnit === "month" ? monthMode : null,
    week_numbers: repeat && intervalUnit === "month" && monthMode === "nth_weekday" ? weekNumbers : null,
    end_date: repeat && endType === "until" ? endDate || null : null,
    max_count: repeat && endType === "count" ? Number(maxCount) || null : null,
  });
  const previewKey = JSON.stringify(repeatInput());

  useEffect(() => {
    if (!repeat || !startDate) {
      setPreview(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      previewSchedule(JSON.parse(previewKey))
        .then((p) => alive && setPreview(p))
        .catch(() => alive && setPreview(null));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [previewKey, repeat, startDate]);

  const updateReminder = (i: number, patch: Partial<ReminderRow>) =>
    setReminders((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) return setError("スケジュール名を入力してください");
    if (!startDate) return setError(patternMode ? "開始日を入力してください" : "初回日程を入力してください");

    const iv = Number(intervalValue);
    if (repeat && (!Number.isInteger(iv) || iv < 1)) return setError("周期は1以上の整数で入力してください");
    if (repeat && intervalUnit === "week" && weekdays.length === 0) return setError("曜日を1つ以上選んでください");
    if (repeat && intervalUnit === "month" && monthMode === "nth_weekday") {
      if (weekNumbers.length === 0) return setError("第何週かを1つ以上選んでください");
      if (weekdays.length === 0) return setError("曜日を1つ以上選んでください");
    }
    const mc = Number(maxCount);
    if (repeat && endType === "until") {
      if (!endDate) return setError("終了日を入力してください");
      if (endDate < startDate) return setError("終了日は開始日以降にしてください");
    }
    if (repeat && endType === "count" && (!Number.isInteger(mc) || mc < 1))
      return setError("回数は1以上の整数で入力してください");

    const parsed: Reminder[] = [];
    for (const r of reminders) {
      const n = Number(r.amount);
      if (!Number.isInteger(n) || n < 1) return setError("通知タイミングは1以上の整数で入力してください");
      parsed.push({ amount: n, unit: r.unit });
    }

    setBusy(true);
    try {
      const r = repeatInput();
      await onSubmit({
        title: title.trim(),
        start_date: startDate,
        start_time: startTime || null,
        interval_value: r.interval_value ?? null,
        interval_unit: r.interval_unit ?? null,
        weekdays: r.weekdays ?? null,
        month_mode: r.month_mode ?? null,
        week_numbers: r.week_numbers ?? null,
        end_date: r.end_date ?? null,
        max_count: r.max_count ?? null,
        memo: memo.trim() || null,
        category_id: categoryId,
        reminders: parsed,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const dayOfMonth = Number(startDate.slice(8)) || 1;

  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box max-w-lg">
        <h3 className="font-bold text-lg mb-3">{initial ? "スケジュールを編集" : "スケジュールを追加"}</h3>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">スケジュール名</span>
            <input
              className="input input-bordered w-full"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 免許更新"
              autoFocus
            />
          </label>

          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-sm font-semibold">{patternMode ? "開始日" : "初回日程"}</span>
              <input
                type="date"
                className="input input-bordered w-full"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 w-32">
              <span className="text-sm font-semibold">
                時刻 <span className="font-normal text-base-content/60">(任意)</span>
              </span>
              <input
                type="time"
                className="input input-bordered w-full"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
          </div>

          {/* 繰り返し */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-secondary"
                checked={repeat}
                onChange={(e) => setRepeat(e.target.checked)}
              />
              <span className="text-sm font-semibold">繰り返す</span>
            </label>

            {repeat && (
              <div className="flex flex-col gap-2.5 pl-1 border-l-2 border-secondary/30 ml-1.5 pl-3">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    className="input input-bordered input-sm w-20"
                    value={intervalValue}
                    onChange={(e) => setIntervalValue(e.target.value)}
                  />
                  <select
                    className="select select-bordered select-sm w-24"
                    value={intervalUnit}
                    onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                  >
                    {(Object.keys(INTERVAL_UNIT_LABEL) as IntervalUnit[]).map((u) => (
                      <option key={u} value={u}>
                        {INTERVAL_UNIT_LABEL[u]}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm">ごと</span>
                </div>

                {intervalUnit === "week" && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-base-content/70">曜日（複数選べます）</span>
                    <ToggleButtons
                      options={WEEKDAY_OPTIONS}
                      selected={weekdays}
                      onToggle={(v) => setWeekdays((w) => toggle(w, v))}
                    />
                  </div>
                )}

                {intervalUnit === "month" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2 cursor-pointer w-fit">
                      <input
                        type="radio"
                        className="radio radio-xs"
                        checked={monthMode === "date"}
                        onChange={() => setMonthMode("date")}
                      />
                      <span className="text-sm">{dayOfMonth}日</span>
                      <span className="text-xs text-base-content/60">（初回日程と同じ日。無い月は月末）</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer w-fit">
                      <input
                        type="radio"
                        className="radio radio-xs"
                        checked={monthMode === "nth_weekday"}
                        onChange={() => setMonthMode("nth_weekday")}
                      />
                      <span className="text-sm">第○○曜日</span>
                    </label>
                    {monthMode === "nth_weekday" && (
                      <div className="flex flex-col gap-1.5 pl-6">
                        <ToggleButtons
                          options={WEEK_NUMBERS}
                          selected={weekNumbers}
                          onToggle={(v) => setWeekNumbers((w) => toggle(w, v))}
                        />
                        <ToggleButtons
                          options={WEEKDAY_OPTIONS}
                          selected={weekdays}
                          onToggle={(v) => setWeekdays((w) => toggle(w, v))}
                        />
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer w-fit">
                      <input
                        type="radio"
                        className="radio radio-xs"
                        checked={monthMode === "last_day"}
                        onChange={() => setMonthMode("last_day")}
                      />
                      <span className="text-sm">月末</span>
                    </label>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-base-content/70">終わり</span>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        className="radio radio-xs"
                        checked={endType === "none"}
                        onChange={() => setEndType("none")}
                      />
                      <span className="text-sm">なし</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        className="radio radio-xs"
                        checked={endType === "until"}
                        onChange={() => setEndType("until")}
                      />
                      <input
                        type="date"
                        className="input input-bordered input-sm w-40"
                        value={endDate}
                        min={startDate}
                        onFocus={() => setEndType("until")}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                      <span className="text-sm">まで</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        className="radio radio-xs"
                        checked={endType === "count"}
                        onChange={() => setEndType("count")}
                      />
                      <span className="text-sm">全</span>
                      <input
                        type="number"
                        min={1}
                        className="input input-bordered input-sm w-16"
                        value={maxCount}
                        onFocus={() => setEndType("count")}
                        onChange={(e) => setMaxCount(e.target.value)}
                      />
                      <span className="text-sm">回</span>
                    </label>
                  </div>
                </div>

                {preview && (
                  <div className="text-xs text-base-content/70 bg-base-200 rounded-box px-3 py-2">
                    <span className="font-semibold">予定日: </span>
                    {preview.dates.length === 0
                      ? "該当する日がありません"
                      : preview.dates.map((d) => formatDateJa(d).slice(5)).join("、") + (preview.more ? " …" : "")}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* カテゴリ */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">カテゴリ</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={`btn btn-xs ${categoryId === null ? "btn-neutral" : "btn-outline"}`}
                onClick={() => setCategoryId(null)}
              >
                なし
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="btn btn-xs border-2"
                  style={
                    categoryId === c.id
                      ? { backgroundColor: colorHex(c.color), borderColor: colorHex(c.color), color: "white" }
                      : { borderColor: colorHex(c.color), backgroundColor: "transparent" }
                  }
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {categories.length === 0 && (
              <span className="text-xs text-base-content/60">右上の ⚙ 設定からカテゴリを追加できます</span>
            )}
          </div>

          {/* メモ */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">
              メモ <span className="font-normal text-base-content/60">(任意)</span>
            </span>
            <textarea
              className="textarea textarea-bordered w-full"
              rows={2}
              maxLength={2000}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="持ち物・手続きに必要なものなど（通知にも先頭が表示されます）"
            />
          </label>

          {/* 通知 */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">通知</span>
            {reminders.length === 0 && <span className="text-xs text-base-content/60">通知なし</span>}
            {reminders.length > 0 && !startTime && (
              <span className="text-xs text-base-content/60">
                終日の予定は {alldayTime} を基準に通知します（⚙ 設定で変更できます）
              </span>
            )}
            {reminders.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  className="input input-bordered input-sm w-20"
                  value={r.amount}
                  onChange={(e) => updateReminder(i, { amount: e.target.value })}
                />
                <select
                  className="select select-bordered select-sm w-28"
                  value={r.unit}
                  onChange={(e) => updateReminder(i, { unit: e.target.value as ReminderUnit })}
                >
                  {(Object.keys(REMINDER_UNIT_LABEL) as ReminderUnit[]).map((u) => (
                    <option key={u} value={u}>
                      {REMINDER_UNIT_LABEL[u]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-square"
                  onClick={() => setReminders((rs) => rs.filter((_, idx) => idx !== i))}
                  aria-label="通知を削除"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-xs btn-outline"
                onClick={() => setReminders((rs) => [...rs, { amount: "1", unit: "day" }])}
              >
                ＋ 日前
              </button>
              <button
                type="button"
                className="btn btn-xs btn-outline"
                onClick={() => setReminders((rs) => [...rs, { amount: "1", unit: "hour" }])}
              >
                ＋ 時間前
              </button>
            </div>
          </div>

          {initial?.interval_unit && (
            <p className="text-xs text-base-content/60">
              ※ ここでの変更・削除は繰り返しのすべての回に反映されます。1回だけ変える場合は、カレンダーでその回をクリックしてください。
              <br />※ 開始日・周期・曜日を変えると、回ごとの変更・休み・完了の記録はリセットされます。
            </p>
          )}
          {error && <div className="alert alert-error text-sm py-2">{error}</div>}

          <div className="modal-action mt-1 flex-wrap">
            {onDelete &&
              (confirmDelete ? (
                <div className="flex items-center gap-2 mr-auto">
                  <span className="text-sm">削除しますか？</span>
                  <button type="button" className="btn btn-error btn-sm" disabled={busy} onClick={handleDelete}>
                    削除する
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                    やめる
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost text-error mr-auto"
                  onClick={() => setConfirmDelete(true)}
                >
                  削除
                </button>
              ))}
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              キャンセル
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy && <span className="loading loading-spinner loading-xs" />}
              保存
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose} />
    </div>
  );
};

export default ScheduleForm;
