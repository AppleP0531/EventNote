import type { Recurrence, RecurrenceUnit } from "../types/event";

const UNIT_LABEL: Record<RecurrenceUnit, string> = {
    week: "週間",
    month: "か月",
    year: "年",
};

const EVERY_LABEL: Record<RecurrenceUnit, string> = {
    week: "毎週",
    month: "毎月",
    year: "毎年",
};

// 例: { unit: "year", interval: 3 } → "3年ごと"
export const recurrenceLabel = ({ unit, interval }: Recurrence): string =>
    interval === 1 ? EVERY_LABEL[unit] : `${interval}${UNIT_LABEL[unit]}ごと`;