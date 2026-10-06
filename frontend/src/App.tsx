import { useEffect, useState } from "react";
import {
  createEvent,
  deleteEvent,
  fetchEvents,
  setEventDone,
  updateEvent,
} from "./api/events";
import Calendar from "./components/Calendar";
import EventForm from "./components/EventForm";
import EventList from "./components/EventList";
import Modal from "./components/Modal";
import "./css/style.css";
import type { EventItem, NewEvent } from "./types/event";
import { toYmd } from "./utils/date";

const App = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(toYmd(new Date()));
  const [error, setError] = useState("");

  // 登録・編集モーダル（editing が null なら新規登録）
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);

  // 削除の確認モーダル
  const [deleting, setDeleting] = useState<EventItem | null>(null);

  const load = async () => {
    try {
      setEvents(await fetchEvents());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (ev: EventItem) => {
    setEditing(ev);
    setFormOpen(true);
  };

  // 失敗したときは例外を投げて、フォーム側にエラーを表示させる
  const handleSubmit = async (data: NewEvent) => {
    if (editing) {
      await updateEvent(editing.id, data);
    } else {
      await createEvent(data);
    }
    await load();
    setFormOpen(false);
  };

  const handleToggleDone = async (ev: EventItem) => {
    try {
      await setEventDone(ev.id, ev.is_done !== 1);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    }
  };

  const handleDelete = async (scope: "one" | "all") => {
    if (!deleting) return;
    try {
      await deleteEvent(deleting.id, scope);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setDeleting(null);
    }
  };

  const today = toYmd(new Date());
  const selectedEvents = events.filter((ev) => ev.due_date === selectedDate);
  const upcomingEvents = events
    .filter((ev) => ev.is_done !== 1 && ev.due_date >= today)
    .slice(0, 5);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6 font-(--font-noto-sans-jp)">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">EventNote</h1>
        <button className="btn btn-primary" onClick={openCreate}>
          ＋ 予定を追加
        </button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* 左：カレンダー（常時表示） */}
        <Calendar
          events={events}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        {/* 右：予定の一覧 */}
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{selectedDate} の予定</h2>
              <button className="btn btn-sm btn-outline" onClick={openCreate}>
                この日に追加
              </button>
            </div>
            <EventList
              events={selectedEvents}
              emptyMessage="この日の予定はありません"
              onEdit={openEdit}
              onDelete={setDeleting}
              onToggleDone={handleToggleDone}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">直近の予定</h2>
            <EventList
              events={upcomingEvents}
              emptyMessage="これからの予定はありません"
              onEdit={openEdit}
              onDelete={setDeleting}
              onToggleDone={handleToggleDone}
            />
          </section>
        </div>
      </div>

      {/* 登録・編集モーダル（開いている間だけフォームを表示） */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)}>
        {formOpen && (
          <EventForm
            defaultDate={selectedDate}
            initial={editing ?? undefined}
            onSubmit={handleSubmit}
          />
        )}
      </Modal>

      {/* 削除の確認モーダル */}
      <Modal open={deleting !== null} onClose={() => setDeleting(null)}>
        {deleting && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">予定を削除しますか？</h2>
            <p>
              「{deleting.title}」（{deleting.due_date}）を削除します。
              この操作は取り消せません。
            </p>
            {deleting.rule_id !== null && (
              <p className="text-sm opacity-70">
                🔁
                これは繰り返しの予定です。この予定だけ、または繰り返しすべてを削除できます。
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn" onClick={() => setDeleting(null)}>
                キャンセル
              </button>
              {deleting.rule_id !== null ? (
                <>
                  <button
                    className="btn btn-error btn-outline"
                    onClick={() => handleDelete("one")}
                  >
                    この予定だけ削除
                  </button>
                  <button
                    className="btn btn-error"
                    onClick={() => handleDelete("all")}
                  >
                    繰り返しをすべて削除
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-error"
                  onClick={() => handleDelete("one")}
                >
                  削除
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
};

export default App;
