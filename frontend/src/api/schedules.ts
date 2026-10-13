import type { Category, Occurrence, OccurrenceOverride, Schedule, ScheduleInput, Settings } from "../types/schedule";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let message = `通信エラー (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      // 本文がJSONでない場合はそのまま
    }
    throw new Error(message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const fetchOccurrences = (from: string, to: string) =>
  request<Occurrence[]>(
    `/api/schedules/occurrences?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

export const createSchedule = (input: ScheduleInput) =>
  request<Schedule>("/api/schedules", { method: "POST", body: JSON.stringify(input) });

export const updateSchedule = (id: number, input: ScheduleInput) =>
  request<Schedule>(`/api/schedules/${id}`, { method: "PUT", body: JSON.stringify(input) });

export const deleteSchedule = (id: number) =>
  request<void>(`/api/schedules/${id}`, { method: "DELETE" });

// 1回分だけの設定（日時の変更・休み・完了）
export const updateOccurrence = (scheduleId: number, originalDate: string, override: OccurrenceOverride) =>
  request<Occurrence>(`/api/schedules/${scheduleId}/occurrences/${originalDate}`, {
    method: "PUT",
    body: JSON.stringify(override),
  });

export const fetchSettings = () => request<Settings>("/api/settings");

export const updateSettings = (settings: Settings) =>
  request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(settings) });

export const fetchCategories = () => request<Category[]>("/api/categories");

export const createCategory = (c: Omit<Category, "id">) =>
  request<Category>("/api/categories", { method: "POST", body: JSON.stringify(c) });

export const updateCategory = (c: Category) =>
  request<Category>(`/api/categories/${c.id}`, { method: "PUT", body: JSON.stringify(c) });

export const deleteCategory = (id: number) => request<void>(`/api/categories/${id}`, { method: "DELETE" });

// 保存前に、入力内容での予定日を先頭から数件取得（フォームの確認表示用）
export const previewSchedule = (input: Partial<ScheduleInput>) =>
  request<{ dates: string[]; more: boolean }>("/api/schedules/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
