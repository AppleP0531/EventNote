import { useEffect, useState } from "react";
import type { DesktopBridge } from "../desktop";

type Props = { bridge: DesktopBridge };

// デスクトップ版の通知メニュー（Windows の通知を使うので、ブラウザの通知許可は不要）
const DesktopMenu = ({ bridge }: Props) => {
  const [autoLaunch, setAutoLaunch] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    bridge.getAutoLaunch().then(setAutoLaunch).catch(() => setAutoLaunch(null));
  }, [bridge]);

  const sendTest = async () => {
    setMessage("");
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = await res.json();
      setMessage(res.ok && body.sent > 0 ? "テスト通知を送りました" : "通知を送れませんでした（Windows の通知設定を確認してください）");
    } catch {
      setMessage("通知を送れませんでした");
    }
    setTimeout(() => setMessage(""), 5000);
  };

  return (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" className="btn btn-sm btn-ghost">
        🔔 通知オン
      </div>
      <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-10 w-60 p-2 shadow">
        <li>
          <button onClick={sendTest}>テスト通知を送る</button>
        </li>
        <li>
          <label className="flex justify-between">
            ログイン時に起動
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={autoLaunch ?? false}
              disabled={autoLaunch === null}
              onChange={async (e) => setAutoLaunch(await bridge.setAutoLaunch(e.target.checked))}
            />
          </label>
        </li>
        <li>
          <button onClick={() => bridge.openConfig()}>DB 接続設定を開く</button>
        </li>
        {message && <li className="text-xs text-base-content/70 px-3 py-1">{message}</li>}
      </ul>
    </div>
  );
};

export default DesktopMenu;
