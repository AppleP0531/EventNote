import { useState } from "react";
import type { Category, Occurrence, OccurrenceOverride } from "../types/schedule";
import { currentOverride } from "../types/schedule";
import { colorHex } from "../utils/colors";
import { formatDateJa, formatEnd, formatInterval, formatReminder } from "../utils/date";
import { useEscape } from "../hooks/useEscape";

type Props = {
  occurrence: Occurrence;
  category?: Category;
  onChange: (override: OccurrenceOverride) => Promise<void>;
  onEditSeries: () => void;
  onClose: () => void;
};

const formatWhen = (date: string, time: string | null) => `${formatDateJa(date)} ${time ?? "終日"}`;

// カレンダーや一覧で予定をクリックしたときの、1回分の操作メニュー
const OccurrenceModal = ({ occurrence: o, category, onChange, onEditSeries, onClose }: Props) => {
  const s = o.schedule;
  const recurring = Boolean(s.interval_unit);
  const [editing, setEditing] = useState(false);
  const [movedDate, setMovedDate] = useState(o.date);
  const [movedTime, setMovedTime] = useState(o.time ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEscape(onClose, !busy);

  const run = async (patch: Partial<OccurrenceOverride>) => {
    setBusy(true);
    setError("");
    try {
      await onChange({ ...currentOverride(o), ...patch });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const saveMove = () => {
    if (!movedDate) return setError("日付を入力してください");
    run({
      moved_date: movedDate === o.original_date ? null : movedDate,
      moved_time: movedTime && movedTime !== s.start_time ? movedTime : null,
    });
  };

  const interval = formatInterval(s);
  const end = formatEnd(s);

  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box max-w-sm">
        <div className="flex items-start justify-between gap-2">
          <h3 className={`font-bold text-lg break-all ${o.done || o.skipped ? "line-through opacity-60" : ""}`}>
            {s.title}
          </h3>
          <button className="btn btn-ghost btn-sm btn-square -mt-1 -mr-2" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-1 mt-1">
          {category && (
            <span
              className="badge badge-sm border-0 text-white"
              style={{ backgroundColor: colorHex(category.color) }}
            >
              {category.name}
            </span>
          )}
          {o.done && <span className="badge badge-success badge-sm">✓ 完了</span>}
          {o.skipped && <span className="badge badge-neutral badge-sm">休み</span>}
          {o.moved && <span className="badge badge-info badge-sm">この回だけ変更</span>}
        </div>

        <div className="text-sm mt-2 space-y-0.5">
          <div className="font-semibold">{formatWhen(o.date, o.time)}</div>
          {o.moved && (
            <div className="text-xs text-base-content/60">本来の日時: {formatWhen(o.original_date, s.start_time)}</div>
          )}
          {interval && (
            <div className="text-xs text-base-content/70">
              🔁 {interval}
              {end && `（${end}）`}
            </div>
          )}
          {s.reminders.length > 0 && (
            <div className="text-xs text-base-content/70">🔔 {s.reminders.map(formatReminder).join("・")}</div>
          )}
        </div>

        {s.memo && (
          <div className="mt-3 text-sm bg-base-200 rounded-box px-3 py-2 whitespace-pre-wrap break-words">
            <div className="text-xs font-semibold text-base-content/60 mb-0.5">📝 メモ</div>
            {s.memo}
          </div>
        )}

        {error && <div className="alert alert-error text-sm py-2 mt-3">{error}</div>}

        {editing ? (
          <div className="mt-4 p-3 rounded-box bg-base-200 flex flex-col gap-2">
            <span className="text-sm font-semibold">この回だけ日時を変更</span>
            <div className="flex gap-2">
              <input
                type="date"
                className="input input-bordered input-sm flex-1"
                value={movedDate}
                onChange={(e) => setMovedDate(e.target.value)}
              />
              <input
                type="time"
                className="input input-bordered input-sm w-28"
                value={movedTime}
                onChange={(e) => setMovedTime(e.target.value)}
              />
            </div>
            <span className="text-xs text-base-content/60">時刻を空欄にすると通常の時刻（{s.start_time ?? "終日"}）になります</span>
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={busy}>
                やめる
              </button>
              <button className="btn btn-primary btn-sm" onClick={saveMove} disabled={busy}>
                変更する
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-4">
            {!o.skipped && (
              <button
                className={`btn ${o.done ? "btn-outline" : "btn-success"}`}
                disabled={busy}
                onClick={() => run({ done: !o.done })}
              >
                {o.done ? "完了を取り消す" : "✓ 完了にする"}
              </button>
            )}
            {recurring && !o.done && (
              <>
                {!o.skipped && (
                  <button className="btn btn-outline" disabled={busy} onClick={() => setEditing(true)}>
                    この回だけ日時を変更
                  </button>
                )}
                <button className="btn btn-outline" disabled={busy} onClick={() => run({ skipped: !o.skipped })}>
                  {o.skipped ? "休みを取り消す" : "この回を休む"}
                </button>
                {o.moved && !o.skipped && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => run({ moved_date: null, moved_time: null })}
                  >
                    本来の日時に戻す
                  </button>
                )}
              </>
            )}
            <div className="divider my-0" />
            <button className="btn btn-ghost btn-sm" onClick={onEditSeries}>
              {recurring ? "繰り返し全体を編集・削除" : "編集・削除"}
            </button>
          </div>
        )}
      </div>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose} />
    </div>
  );
};

export default OccurrenceModal;
