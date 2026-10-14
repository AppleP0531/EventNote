import { useCallback, useEffect, useState } from "react";

export type PushState =
  | "loading"
  | "unsupported" // ブラウザが Web Push 非対応
  | "denied" // 通知がブロックされている
  | "off" // 未購読
  | "on"; // 購読中

const urlBase64ToUint8Array = (base64: string) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const postJson = async (url: string, body: unknown) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`通信エラー (${res.status})`);
  return res.json();
};

const isSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";

/**
 * Web Push の購読管理（Service Worker の登録・購読・解除・テスト送信）
 * enabled = false のとき（デスクトップ版）は何もしない
 */
export const usePush = (enabled = true) => {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState("");

  const getRegistration = useCallback(async () => {
    await navigator.serviceWorker.register("/sw.js");
    return navigator.serviceWorker.ready;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!isSupported()) {
      setState("unsupported");
      return;
    }
    (async () => {
      try {
        const reg = await getRegistration();
        const sub = await reg.pushManager.getSubscription();
        if (Notification.permission === "denied") setState("denied");
        else if (sub) {
          // サーバー側のDBが作り直された場合などに備えて毎回登録し直す
          await postJson("/api/push/subscribe", sub.toJSON());
          setState("on");
        } else setState("off");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setState("off");
      }
    })();
  }, [getRegistration, enabled]);

  const subscribe = async () => {
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await getRegistration();
      const { publicKey } = await (await fetch("/api/push/public-key")).json();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      await postJson("/api/push/subscribe", sub.toJSON());
      setState("on");
    } catch (e) {
      setError(`通知の登録に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const unsubscribe = async () => {
    setError("");
    try {
      const reg = await getRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await postJson("/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(`通知の解除に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const sendTest = async () => {
    setError("");
    try {
      const { sent } = await postJson("/api/push/test", {});
      if (sent === 0) setError("送信先が見つかりませんでした。通知をオンにし直してください。");
    } catch (e) {
      setError(`テスト通知の送信に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return { state, error, subscribe, unsubscribe, sendTest };
};
