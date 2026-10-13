import { useState } from "react";
import { createCategory, deleteCategory, updateCategory } from "../api/schedules";
import type { Category, Settings } from "../types/schedule";
import { CATEGORY_COLORS, colorHex } from "../utils/colors";
import { useEscape } from "../hooks/useEscape";

type Props = {
  settings: Settings;
  categories: Category[];
  onSaveSettings: (settings: Settings) => Promise<void>;
  onCategoriesChanged: () => void;
  onClose: () => void;
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// 色を選ぶ小さなパレット
const ColorPicker = ({ value, onChange }: { value: string; onChange: (c: string) => void }) => (
  <div className="dropdown">
    <div
      tabIndex={0}
      role="button"
      className="w-7 h-7 rounded-full border-2 border-base-100 ring-1 ring-base-300 cursor-pointer"
      style={{ backgroundColor: colorHex(value) }}
      aria-label="色を選ぶ"
    />
    <div tabIndex={0} className="dropdown-content z-20 bg-base-100 rounded-box shadow p-2 grid grid-cols-5 gap-1.5 w-44">
      {Object.entries(CATEGORY_COLORS).map(([key, c]) => (
        <button
          key={key}
          type="button"
          title={c.label}
          className={`w-7 h-7 rounded-full ${key === value ? "ring-2 ring-offset-2 ring-base-content" : ""}`}
          style={{ backgroundColor: c.hex }}
          onClick={() => {
            onChange(key);
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        />
      ))}
    </div>
  </div>
);

const CategoryRow = ({ category, onChanged }: { category: Category; onChanged: () => void }) => {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const dirty = name !== category.name || color !== category.color;

  const save = async (next: Partial<Category> = {}) => {
    setBusy(true);
    setError("");
    try {
      await updateCategory({ ...category, name: name.trim(), color, ...next });
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteCategory(category.id);
      onChanged();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <ColorPicker
          value={color}
          onChange={(c) => {
            setColor(c);
            save({ color: c }); // 色はすぐ保存
          }}
        />
        <input
          className="input input-bordered input-sm flex-1"
          value={name}
          maxLength={50}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && save()}
        />
        {dirty ? (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => save()}>
            保存
          </button>
        ) : confirm ? (
          <button type="button" className="btn btn-sm btn-error" disabled={busy} onClick={remove}>
            削除する
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-square"
            aria-label="削除"
            onClick={() => setConfirm(true)}
          >
            🗑
          </button>
        )}
      </div>
      {confirm && !dirty && (
        <span className="text-xs text-base-content/60 pl-9">
          このカテゴリの予定は「カテゴリなし」になります。
          <button type="button" className="link ml-1" onClick={() => setConfirm(false)}>
            やめる
          </button>
        </span>
      )}
      {error && <span className="text-xs text-error pl-9">{error}</span>}
    </li>
  );
};

const SettingsModal = ({ settings, categories, onSaveSettings, onCategoriesChanged, onClose }: Props) => {
  const [alldayTime, setAlldayTime] = useState(settings.allday_time);
  const [timeMsg, setTimeMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("blue");
  const [catError, setCatError] = useState("");
  const [busy, setBusy] = useState(false);
  useEscape(onClose);

  const saveTime = async () => {
    if (!alldayTime) return setTimeMsg("時刻を入力してください");
    setBusy(true);
    try {
      await onSaveSettings({ allday_time: alldayTime });
      setTimeMsg("保存しました");
    } catch (e) {
      setTimeMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const addCategory = async () => {
    if (!newName.trim()) return setCatError("カテゴリ名を入力してください");
    setBusy(true);
    setCatError("");
    try {
      await createCategory({ name: newName.trim(), color: newColor });
      setNewName("");
      onCategoriesChanged();
    } catch (e) {
      setCatError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const h = Number(alldayTime.slice(0, 2));
  const twoHoursBefore = alldayTime ? `${String((h + 22) % 24).padStart(2, "0")}${alldayTime.slice(2)}` : "";

  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box max-w-md">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-lg">設定</h3>
          <button className="btn btn-ghost btn-sm btn-square" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>

        <section className="flex flex-col gap-1.5">
          <h4 className="text-sm font-semibold">終日予定の通知基準時刻</h4>
          <div className="flex items-center gap-2">
            <input
              type="time"
              className="input input-bordered input-sm w-36"
              value={alldayTime}
              onChange={(e) => {
                setAlldayTime(e.target.value);
                setTimeMsg("");
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy || alldayTime === settings.allday_time}
              onClick={saveTime}
            >
              保存
            </button>
            {timeMsg && <span className="text-xs text-base-content/70">{timeMsg}</span>}
          </div>
          <span className="text-xs text-base-content/60">
            時刻を決めていない予定は、この時刻を基準に通知します。
            {alldayTime &&
              `例: 「1日前」は前日の ${alldayTime}、「2時間前」は${h < 2 ? "前日" : "当日"}の ${twoHoursBefore} に届きます。`}
          </span>
        </section>

        <div className="divider my-3" />

        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">カテゴリ</h4>
          {categories.length === 0 && (
            <span className="text-xs text-base-content/60">カテゴリはまだありません（例: ゴミ、手続き、病院）</span>
          )}
          <ul className="flex flex-col gap-2">
            {categories.map((c) => (
              <CategoryRow key={`${c.id}-${c.name}-${c.color}`} category={c} onChanged={onCategoriesChanged} />
            ))}
          </ul>
          <div className="flex items-center gap-2 mt-1">
            <ColorPicker value={newColor} onChange={setNewColor} />
            <input
              className="input input-bordered input-sm flex-1"
              placeholder="新しいカテゴリ名"
              value={newName}
              maxLength={50}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />
            <button type="button" className="btn btn-sm btn-outline" disabled={busy} onClick={addCategory}>
              追加
            </button>
          </div>
          {catError && <span className="text-xs text-error">{catError}</span>}
        </section>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
};

export default SettingsModal;
