import { useEffect } from "react";

// Esc キーでダイアログを閉じる
export const useEscape = (onEscape: () => void, enabled = true) => {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape, enabled]);
};
