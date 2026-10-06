import { useMemo, useState } from "react";
import type { EventItem } from "../types/event";
import { toYmd } from "../utils/date";

type Props = {
  events: EventItem[];
  selectedDate: string;
  onSelectDate: (ymd: string) => void;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const Calendar = ({ events, selectedDate, onSelectDate }: Props) => {
  const now = new Date();
  const today = toYmd(now);
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0〜11

  // 日付ごとの予定
  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const ev of events) {
      const list = map.get(ev.due_date) ?? [];
      list.push(ev);
      map.set(ev.due_date, list);
    }
    return map;
  }, [events]);

  // 表示する月のマス目（月初の前は null で埋める）
  const cells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const result: (string | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      result.push(toYmd(new Date(viewYear, viewMonth, d)));
    }
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [viewYear, viewMonth]);

  const moveMonth = (diff: number) => {
    const d = new Date(viewYear, viewMonth + diff, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const goToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    onSelectDate(today);
  };

  return (
    <div className="card bg-base-100 shadow p-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">
          {viewYear}年{viewMonth + 1}月
        </h2>
        <div className="join">
          <button
            className="btn btn-sm join-item"
            onClick={() => moveMonth(-1)}
          >
            ←
          </button>
          <button className="btn btn-sm join-item" onClick={goToday}>
            今日
          </button>
          <button className="btn btn-sm join-item" onClick={() => moveMonth(1)}>
            →
          </button>
        </div>
      </div>

      {/* 曜日 */}
      <div className="grid grid-cols-7 text-center text-sm font-bold mb-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={i === 0 ? "text-error" : i === 6 ? "text-info" : ""}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 日付 */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={`empty-${i}`} />;

          const dayEvents = eventsByDate.get(ymd) ?? [];
          const isSelected = ymd === selectedDate;
          const isToday = ymd === today;
          const weekday = i % 7;

          return (
            <button
              key={ymd}
              onClick={() => onSelectDate(ymd)}
              className={[
                "min-h-16 rounded-lg p-1 text-left flex flex-col gap-0.5 border transition-colors",
                isSelected
                  ? "bg-primary text-primary-content border-primary"
                  : "bg-base-200 border-transparent hover:bg-base-300",
                isToday && !isSelected ? "ring-2 ring-primary" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "text-sm font-bold",
                  !isSelected && weekday === 0 ? "text-error" : "",
                  !isSelected && weekday === 6 ? "text-info" : "",
                ].join(" ")}
              >
                {Number(ymd.slice(8))}
              </span>

              {dayEvents.slice(0, 2).map((ev) => (
                <span
                  key={ev.id}
                  className={[
                    "truncate rounded px-1 text-[10px] leading-4",
                    isSelected
                      ? "bg-primary-content text-primary"
                      : "bg-primary text-primary-content",
                  ].join(" ")}
                >
                  {ev.title}
                </span>
              ))}
              {dayEvents.length > 2 && (
                <span className="text-[10px]">+{dayEvents.length - 2}件</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Calendar;
