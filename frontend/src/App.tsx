import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSchedule,
  deleteSchedule,
  fetchCategories,
  fetchOccurrences,
  fetchSettings,
  updateOccurrence,
  updateSchedule,
  updateSettings,
} from "./api/schedules";
import Calendar, { calendarRange } from "./components/Calendar";
import OccurrenceModal from "./components/OccurrenceModal";
import ScheduleForm from "./components/ScheduleForm";
import SettingsModal from "./components/SettingsModal";
import UpcomingList from "./components/UpcomingList";
import "./css/style.css";
import { usePush } from "./hooks/usePush";
import { useReminders } from "./hooks/useReminders";
import type { Category, Occurrence, OccurrenceOverride, Schedule, ScheduleInput, Settings } from "./types/schedule";
import { currentOverride } from "./types/schedule";
import { addDays, toYmd, todayYmd } from "./utils/date";

const UPCOMING_DAYS = 30; // 「日付が近づいている予定」に出す日数

type FormState = { schedule: Schedule | null; date: string } | null;

const App = () => {
  const [month, setMonth] = useState(() => new Date());
  const [monthOccurrences, setMonthOccurrences] = useState<Occurrence[]>([]);
  const [upcoming, setUpcoming] = useState<Occurrence[]>([]);
  const [form, setForm] = useState<FormState>(null);
  const [selected, setSelected] = useState<Occurrence | null>(null); // 1回分の操作メニュー
  const [settings, setSettings] = useState<Settings>({ allday_time: "09:00" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [undo, setUndo] = useState<{ occurrence: Occurrence; message: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const { notices, dismiss } = useReminders(reloadKey, settings.allday_time);
  const push = usePush();

  useEffect(() => {
    fetchSettings()
      .then(setSettings)
      .catch(() => {}); // 読めなければ既定値のまま
  }, []);

  const loadCategories = useCallback(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // カテゴリを変更・削除したら予定も読み直す（削除したカテゴリの予定は「なし」になるため）
  const onCategoriesChanged = () => {
    loadCategories();
    setReloadKey((k) => k + 1);
  };

  const load = useCallback(async () => {
    try {
      const { start, end } = calendarRange(month);
      const today = new Date();
      const [m, u] = await Promise.all([
        fetchOccurrences(toYmd(start), toYmd(end)),
        fetchOccurrences(toYmd(today), toYmd(addDays(today, UPCOMING_DAYS))),
      ]);
      setMonthOccurrences(m);
      setUpcoming(u.filter((o) => !o.done && !o.skipped)); // 完了・休みは一覧に出さない
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const afterChange = () => {
    setForm(null);
    setSelected(null);
    setReloadKey((k) => k + 1);
  };

  // 1回分の設定を変更（完了・休み・日時変更）
  const changeOccurrence = async (o: Occurrence, override: OccurrenceOverride) => {
    await updateOccurrence(o.schedule.id, o.original_date, override);
    afterChange();
  };

  // 一覧のチェックボックスから完了にする（数秒間「元に戻す」を表示）
  const quickDone = async (o: Occurrence) => {
    try {
      await changeOccurrence(o, { ...currentOverride(o), done: true });
      clearTimeout(undoTimer.current);
      setUndo({ occurrence: o, message: `「${o.schedule.title}」を完了にしました` });
      undoTimer.current = setTimeout(() => setUndo(null), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const undoDone = async () => {
    if (!undo) return;
    const o = undo.occurrence;
    setUndo(null);
    try {
      await changeOccurrence(o, currentOverride(o)); // 完了にする前の状態へ
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveSettings = async (next: Settings) => {
    setSettings(await updateSettings(next));
    setReloadKey((k) => k + 1);
  };

  const handleSubmit = async (input: ScheduleInput) => {
    if (form?.schedule) await updateSchedule(form.schedule.id, input);
    else await createSchedule(input);
    afterChange();
  };

  const handleDelete = async () => {
    if (!form?.schedule) return;
    await deleteSchedule(form.schedule.id);
    afterChange();
  };

  const openOccurrence = (o: Occurrence) => setSelected(o);

  return (
    <div className="min-h-screen bg-base-200 font-noto-sans-jp">
      <header className="navbar bg-base-100 shadow-sm px-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold">📅 EventNote</h1>
        </div>
        <div className="flex gap-2">
          {push.state === "off" && (
            <button className="btn btn-sm btn-outline" onClick={push.subscribe}>
              🔔 通知をオンにする
            </button>
          )}
          {push.state === "on" && (
            <div className="dropdown dropdown-end">
              <div tabIndex={0} role="button" className="btn btn-sm btn-ghost">
                🔔 通知オン
              </div>
              <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-10 w-44 p-2 shadow">
                <li>
                  <button onClick={push.sendTest}>テスト通知を送る</button>
                </li>
                <li>
                  <button onClick={push.unsubscribe}>通知をオフにする</button>
                </li>
              </ul>
            </div>
          )}
          <button className="btn btn-sm btn-ghost btn-square" onClick={() => setSettingsOpen(true)} aria-label="設定">
            ⚙
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => setForm({ schedule: null, date: todayYmd() })}>
            ＋ 追加
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-3 sm:p-6">
        {error && (
          <div className="alert alert-error mb-4">
            <span>{error}（バックエンドとMySQLが起動しているか確認してください）</span>
          </div>
        )}
        {push.state === "denied" && (
          <div className="alert alert-warning mb-4 text-sm">
            ブラウザ通知がブロックされています。通知は画面内にのみ表示されます（アドレスバー左のアイコンから許可できます）。
          </div>
        )}
        {push.state === "unsupported" && (
          <div className="alert alert-warning mb-4 text-sm">
            このブラウザは Web Push に対応していません。通知は画面を開いている間、画面内にのみ表示されます。
          </div>
        )}
        {push.error && <div className="alert alert-error mb-4 text-sm">{push.error}</div>}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Calendar
              month={month}
              occurrences={monthOccurrences}
              categories={categories}
              onChangeMonth={setMonth}
              onSelectDate={(date) => setForm({ schedule: null, date })}
              onSelectOccurrence={openOccurrence}
            />
          </div>
          <UpcomingList occurrences={upcoming} categories={categories} days={UPCOMING_DAYS} onSelect={openOccurrence} onDone={quickDone} />
        </div>
      </main>

      {form && (
        <ScheduleForm
          key={form.schedule?.id ?? `new-${form.date}`}
          initial={form.schedule}
          defaultDate={form.date}
          alldayTime={settings.allday_time}
          categories={categories}
          onSubmit={handleSubmit}
          onDelete={form.schedule ? handleDelete : undefined}
          onClose={() => setForm(null)}
        />
      )}

      {selected && (
        <OccurrenceModal
          key={`${selected.schedule.id}|${selected.original_date}`}
          occurrence={selected}
          category={categories.find((c) => c.id === selected.schedule.category_id)}
          onChange={(override) => changeOccurrence(selected, override)}
          onEditSeries={() => {
            setSelected(null);
            setForm({ schedule: selected.schedule, date: selected.date });
          }}
          onClose={() => setSelected(null)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          categories={categories}
          onSaveSettings={saveSettings}
          onCategoriesChanged={onCategoriesChanged}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {undo && (
        <div className="toast toast-center toast-bottom z-50">
          <div className="alert shadow-lg">
            <span className="text-sm">✓ {undo.message}</span>
            <button className="btn btn-sm btn-ghost text-primary" onClick={undoDone}>
              元に戻す
            </button>
          </div>
        </div>
      )}

      {notices.length > 0 && (
        <div className="toast toast-end toast-bottom z-50">
          {notices.map((n) => (
            <div key={n.key} className="alert alert-info shadow-lg max-w-sm">
              <div>
                <div className="font-bold">{n.title}</div>
                <div className="text-sm">{n.body}</div>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={() => dismiss(n.key)} aria-label="閉じる">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default App;
