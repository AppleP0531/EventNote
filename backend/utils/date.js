// Date → "2026-10-06"（ローカル時刻）
const toYmd = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// "2026-10-06" → Date（ローカル時刻の0時）
const parseYmd = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};

module.exports = { toYmd, parseYmd };
