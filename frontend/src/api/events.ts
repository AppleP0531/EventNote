import type { EventItem, NewEvent } from "../types/event";

const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
    const res = await fetch(url, options);

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        throw new Error(
            "APIがJSONを返していません。backendの起動とviteのproxy設定を確認してください",
        );
    }

    const data = await res.json();
    if (!res.ok) {
        const base = data?.message ?? "リクエストに失敗しました";
        throw new Error(data?.detail ? `${base}（${data.detail}）` : base);
    }
    return data as T;
};

const jsonOptions = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

// 予定一覧を取得
export const fetchEvents = () => request<EventItem[]>("/api/events");

// 予定を1件登録
export const createEvent = (event: NewEvent) =>
    request<{ id: number }>("/api/events", jsonOptions("POST", event));

// 予定を編集
export const updateEvent = (id: number, event: NewEvent) =>
    request<{ id: number }>(`/api/events/${id}`, jsonOptions("PUT", event));

// 完了・未完了を切り替え
export const setEventDone = (id: number, isDone: boolean) =>
    request<{ id: number }>(
        `/api/events/${id}/done`,
        jsonOptions("PATCH", { is_done: isDone }),
    );

// 予定を削除
export const deleteEvent = (id: number, scope: "one" | "all" = "one") =>
    request<{ id: number }>(`/api/events/${id}?scope=${scope}`, {
        method: "DELETE",
    });