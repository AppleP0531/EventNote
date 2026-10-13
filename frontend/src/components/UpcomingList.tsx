import type { Category, Occurrence } from "../types/schedule";
import { occurrenceKey } from "../types/schedule";
import { colorHex } from "../utils/colors";
import { daysFromToday, formatDateJa, formatInterval, formatReminder } from "../utils/date";

type Props = {
  occurrences: Occurrence[]; // 完了・休みを除いたもの
  categories: Category[];
  days: number;
  onSelect: (o: Occurrence) => void;
  onDone: (o: Occurrence) => void;
};

const remainLabel = (diff: number) => {
  if (diff === 0) return { text: "今日", cls: "badge-error" };
  if (diff === 1) return { text: "明日", cls: "badge-warning" };
  if (diff <= 7) return { text: `あと${diff}日`, cls: "badge-warning badge-outline" };
  return { text: `あと${diff}日`, cls: "badge-ghost" };
};

const UpcomingList = ({ occurrences, categories, days, onSelect, onDone }: Props) => {
  const categoryOf = new Map(categories.map((c) => [c.id, c]));
  return (
  <div className="card bg-base-100 shadow lg:self-start">
    <div className="card-body p-3 sm:p-5 gap-2">
      <h2 className="card-title text-base">日付が近づいている予定</h2>
      <p className="text-xs text-base-content/60 -mt-1">今日から {days} 日以内</p>

      {occurrences.length === 0 ? (
        <p className="text-sm text-base-content/60 py-6 text-center">予定はありません</p>
      ) : (
        <ul className="flex flex-col gap-2 mt-1 lg:max-h-[70vh] overflow-y-auto">
          {occurrences.map((o) => {
            const label = remainLabel(daysFromToday(o.date));
            const interval = formatInterval(o.schedule);
            const category = o.schedule.category_id ? categoryOf.get(o.schedule.category_id) : undefined;
            const memoFirst = o.schedule.memo?.split(/\r?\n/).find(Boolean);
            return (
              <li key={occurrenceKey(o)} className="flex items-stretch gap-1">
                <button
                  onClick={() => onDone(o)}
                  className="btn btn-ghost btn-sm h-auto px-1.5 tooltip tooltip-right"
                  data-tip="完了にする"
                  aria-label="完了にする"
                >
                  <span className="w-4 h-4 rounded border-2 border-base-content/40 hover:border-success hover:bg-success/20" />
                </button>
                <button
                  onClick={() => onSelect(o)}
                  className="flex-1 min-w-0 text-left rounded-box border border-base-300 p-2.5 hover:bg-base-200 transition-colors"
                  style={category ? { borderLeft: `4px solid ${colorHex(category.color)}` } : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold truncate">{o.schedule.title}</span>
                    <span className={`badge badge-sm shrink-0 ${label.cls}`}>{label.text}</span>
                  </div>
                  <div className="text-xs text-base-content/70 mt-0.5">
                    {formatDateJa(o.date)}
                    {o.time && ` ${o.time}`}
                    {o.moved && <span className="ml-1 text-info">↪変更</span>}
                    {interval && <span className="ml-2">🔁 {interval}</span>}
                  </div>
                  {memoFirst && <div className="text-xs text-base-content/70 mt-0.5 truncate">📝 {memoFirst}</div>}
                  {(category || o.schedule.reminders.length > 0) && (
                    <div className="text-xs text-base-content/60 mt-0.5 flex items-center gap-2">
                      {category && (
                        <span className="flex items-center gap-1">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: colorHex(category.color) }}
                          />
                          {category.name}
                        </span>
                      )}
                      {o.schedule.reminders.length > 0 && (
                        <span>🔔 {o.schedule.reminders.map(formatReminder).join("・")}</span>
                      )}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </div>
);
};

export default UpcomingList;
