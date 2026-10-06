import type { EventItem } from "../types/event";
import { daysLeft } from "../utils/date";
import { recurrenceLabel } from "../utils/recurrence";

type Props = {
  events: EventItem[];
  emptyMessage?: string;
  onEdit: (event: EventItem) => void;
  onDelete: (event: EventItem) => void;
  onToggleDone: (event: EventItem) => void;
};

const badgeClass = (days: number): string => {
  if (days < 0) return "badge-neutral";
  if (days <= 7) return "badge-error";
  if (days <= 30) return "badge-warning";
  return "badge-success";
};

// メニューの項目を押したあと、ドロップダウンを閉じる
const closeMenu = () => {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
};

const EventList = ({
  events,
  emptyMessage = "予定はありません",
  onEdit,
  onDelete,
  onToggleDone,
}: Props) => {
  if (events.length === 0) {
    return <p className="text-center opacity-60 py-4">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-3">
      {events.map((ev) => {
        const done = ev.is_done === 1;
        const days = daysLeft(ev.due_date);

        return (
          <li key={ev.id} className="card bg-base-100 shadow p-4">
            <div className="flex justify-between items-start gap-2">
              <div className={done ? "opacity-50" : ""}>
                <p className={`font-bold ${done ? "line-through" : ""}`}>
                  {ev.title}
                </p>
                <p className="text-sm opacity-70">
                  {ev.due_date}
                  {ev.recurrence && (
                    <span className="ml-2">
                      🔁 {recurrenceLabel(ev.recurrence)}
                    </span>
                  )}
                </p>
                {ev.memo && <p className="text-sm mt-1">{ev.memo}</p>}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {done ? (
                  <span className="badge badge-ghost">完了</span>
                ) : (
                  <span className={`badge ${badgeClass(days)}`}>
                    {days < 0
                      ? "期限切れ"
                      : days === 0
                        ? "今日"
                        : `あと${days}日`}
                  </span>
                )}

                <div className="dropdown dropdown-end">
                  <button
                    type="button"
                    tabIndex={0}
                    className="btn btn-ghost btn-xs"
                    aria-label="メニュー"
                  >
                    ⋯
                  </button>
                  <ul
                    tabIndex={0}
                    className="dropdown-content menu bg-base-100 rounded-box z-10 w-40 p-2 shadow"
                  >
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu();
                          onEdit(ev);
                        }}
                      >
                        編集
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu();
                          onToggleDone(ev);
                        }}
                      >
                        {done ? "未完了に戻す" : "完了にする"}
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        className="text-error"
                        onClick={() => {
                          closeMenu();
                          onDelete(ev);
                        }}
                      >
                        削除
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default EventList;
