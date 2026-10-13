import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOccurrences } from "../api/schedules";
import type { Occurrence, Reminder } from "../types/schedule";
import {
  addDays,
  formatDateJa,
  formatDateTimeJa,
  formatReminder,
  occurrenceDateTime,
  reminderTime,
  toYmd,
} from "../utils/date";

// 通知済みの記録（同じ通知を2回出さないため）
const STORAGE_KEY = "eventnote.notified";
const CHECK_INTERVAL_MS = 30_000; // 30秒ごとに通知時刻をチェック
const REFRESH_INTERVAL_MS = 5 * 60_000; // 5分ごとに予定を取り直す

export type InAppNotice = { key: string; title: string; body: string };

const loadNotified = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
};

const saveNotified = (data: Record<string, number>) => {
  try {
    // 30日以上前の記録は掃除
    const limit = Date.now() - 30 * 86_400_000;
    const pruned = Object.fromEntries(Object.entries(data).filter(([, t]) => t > limit));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // 保存できない環境では無視（その場合は画面を開き直すと再通知されることがある）
  }
};

// 日時を変更した回は通知し直すよう、実際の日時もキーに含める
const reminderKey = (o: Occurrence, r: Reminder) =>
  `${o.schedule.id}|${o.original_date}|${o.date} ${o.time ?? ""}|${r.amount}${r.unit}`;

/**
 * 予定の「○日前／○時間前」になったら画面内（右下）に通知を表示する。
 * デスクトップ通知はサーバーから Web Push で送る（usePush / services/reminderScheduler.js）。
 * ※ 画面を閉じている間に通知時刻を過ぎた場合は、予定日時を過ぎる前に画面を開いたタイミングで表示する。
 */
export const useReminders = (reloadKey: number, alldayTime: string) => {
  const [notices, setNotices] = useState<InAppNotice[]>([]);
  const occurrencesRef = useRef<Occurrence[]>([]);

  const refresh = useCallback(async () => {
    try {
      // 予定の最大通知日数は未知なので、余裕をもって1年先まで取得
      const now = new Date();
      occurrencesRef.current = await fetchOccurrences(toYmd(addDays(now, -1)), toYmd(addDays(now, 366)));
    } catch {
      // 通信失敗時は前回の内容のまま
    }
  }, []);

  const check = useCallback(() => {
    const now = new Date();
    const notified = loadNotified();
    const fresh: InAppNotice[] = [];

    for (const o of occurrencesRef.current) {
      if (o.skipped || o.done) continue; // 休み・完了の回は通知しない
      const base = occurrenceDateTime(o.date, o.time, alldayTime);
      if (base <= now) continue; // 予定を過ぎたものは通知しない
      for (const r of o.schedule.reminders) {
        const key = reminderKey(o, r);
        if (notified[key]) continue;
        if (reminderTime(base, r) > now) continue;

        notified[key] = now.getTime();
        const title = `🔔 ${o.schedule.title}`;
        const when = o.time ? formatDateTimeJa(base) : `${formatDateJa(o.date)}（終日）`;
        const body = `${when} の予定です（${formatReminder(r)}の通知）`;
        fresh.push({ key, title, body });
      }
    }

    if (fresh.length > 0) {
      saveNotified(notified);
      setNotices((ns) => [...ns, ...fresh]);
    }
  }, [alldayTime]);

  useEffect(() => {
    let alive = true;
    refresh().then(() => alive && check());
    const t1 = setInterval(check, CHECK_INTERVAL_MS);
    const t2 = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [refresh, check, reloadKey]);

  const dismiss = (key: string) => setNotices((ns) => ns.filter((n) => n.key !== key));

  return { notices, dismiss };
};
