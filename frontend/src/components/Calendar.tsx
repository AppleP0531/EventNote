import type { Category, Occurrence } from "../types/schedule";
import { occurrenceKey } from "../types/schedule";
import { colorHex } from "../utils/colors";
import { addDays, toYmd, todayYmd } from "../utils/date";

type Props = {
  month: Date; // 表示する月（1日）
  occurrences: Occurrence[];
  categories: Category[];
  onChangeMonth: (month: Date) => void;
  onSelectDate: (ymd: string) => void;
  onSelectOccurrence: (o: Occurrence) => void;
};

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

// 月表示の先頭（日曜始まり）と末尾を返す
export const calendarRange = (month: Date) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const end = addDays(last, 6 - last.getDay());
  return { start, end };
};

const Calendar = ({ month, occurrences, categories, onChangeMonth, onSelectDate, onSelectOccurrence }: Props) => {
  const categoryColor = new Map(categories.map((c) => [c.id, colorHex(c.color)]));
  const { start, end } = calendarRange(month);
  const today = todayYmd();

  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const byDate = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const list = byDate.get(o.date) ?? [];
    list.push(o);
    byDate.set(o.date, list);
  }

  const moveMonth = (diff: number) =>
    onChangeMonth(new Date(month.getFullYear(), month.getMonth() + diff, 1));

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body p-3 sm:p-5">
        <div className="flex items-center justify-between mb-2">
          <button className="btn btn-ghost btn-sm" onClick={() => moveMonth(-1)} aria-label="前の月">
            ‹
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">
              {month.getFullYear()}年 {month.getMonth() + 1}月
            </h2>
            <button className="btn btn-xs btn-outline" onClick={() => onChangeMonth(new Date())}>
              今日
            </button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => moveMonth(1)} aria-label="次の月">
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-xs font-semibold">
          {WEEK.map((w, i) => (
            <div
              key={w}
              className={`py-1 ${i === 0 ? "text-error" : i === 6 ? "text-info" : "text-base-content/70"}`}
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 border-t border-l border-base-300">
          {days.map((d) => {
            const ymd = toYmd(d);
            const inMonth = d.getMonth() === month.getMonth();
            const list = byDate.get(ymd) ?? [];
            const dow = d.getDay();
            return (
              <div
                key={ymd}
                onClick={() => onSelectDate(ymd)}
                className={`min-h-20 sm:min-h-24 border-r border-b border-base-300 p-1 cursor-pointer hover:bg-base-200 transition-colors ${
                  inMonth ? "" : "bg-base-200/50 text-base-content/40"
                }`}
              >
                <div className="flex justify-end">
                  <span
                    className={`text-xs w-6 h-6 flex items-center justify-center rounded-full ${
                      ymd === today
                        ? "bg-primary text-primary-content font-bold"
                        : dow === 0
                          ? "text-error"
                          : dow === 6
                            ? "text-info"
                            : ""
                    }`}
                  >
                    {d.getDate()}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {list.slice(0, 3).map((o) => {
                    const color = o.schedule.category_id ? categoryColor.get(o.schedule.category_id) : undefined;
                    return (
                    <button
                      key={occurrenceKey(o)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectOccurrence(o);
                      }}
                      title={`${o.schedule.title}${o.done ? "（完了）" : o.skipped ? "（休み）" : o.moved ? "（この回だけ変更）" : ""}`}
                      style={
                        color
                          ? { borderLeft: `3px solid ${color}`, ...(o.skipped || o.done ? {} : { backgroundColor: `${color}26` }) }
                          : undefined
                      }
                      className={`text-left text-[11px] leading-tight truncate rounded px-1 py-0.5 hover:brightness-95 ${
                        o.skipped
                          ? "bg-base-300/60 line-through opacity-50 hover:opacity-80"
                          : o.done
                            ? "bg-success/15 line-through opacity-60 hover:opacity-90"
                            : color
                              ? ""
                              : o.schedule.interval_unit
                                ? "bg-secondary/20 hover:bg-secondary/35"
                                : "bg-primary/20 hover:bg-primary/35"
                      }`}
                    >
                      {o.done && <span className="mr-0.5">✓</span>}
                      {o.moved && !o.skipped && <span className="mr-0.5">↪</span>}
                      {o.time && <span className="opacity-70 mr-0.5">{o.time}</span>}
                      {o.schedule.title}
                    </button>
                    );
                  })}
                  {list.length > 3 && (
                    <span className="text-[11px] text-base-content/60 px-1">他 {list.length - 3} 件</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content/60 mt-2">
          {categories.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: colorHex(c.color) }} /> {c.name}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-primary/30" /> 単発
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-secondary/30" /> 繰り返し
          </span>
          <span>✓ 完了</span>
          <span>↪ この回だけ変更</span>
          <span className="line-through">休み</span>
        </div>
      </div>
    </div>
  );
};

export default Calendar;
