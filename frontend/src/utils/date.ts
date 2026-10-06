// Date → "2026-10-06"（ローカル時刻）
export const toYmd = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

// "2026-10-06" → Date（ローカル時刻の0時）
export const parseYmd = (ymd: string): Date => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d);
};

// 今日から期限までの日数（今日=0、過ぎていたらマイナス）
export const daysLeft = (ymd: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((parseYmd(ymd).getTime() - today.getTime()) / 86400000);
};