// カテゴリの色（バックエンドの api/categories.js の COLORS と合わせる）
export const CATEGORY_COLORS: Record<string, { hex: string; label: string }> = {
  red: { hex: "#ef4444", label: "赤" },
  orange: { hex: "#f97316", label: "オレンジ" },
  amber: { hex: "#eab308", label: "黄" },
  green: { hex: "#22c55e", label: "緑" },
  teal: { hex: "#14b8a6", label: "ティール" },
  sky: { hex: "#0ea5e9", label: "水色" },
  blue: { hex: "#3b82f6", label: "青" },
  violet: { hex: "#8b5cf6", label: "紫" },
  pink: { hex: "#ec4899", label: "ピンク" },
  gray: { hex: "#6b7280", label: "グレー" },
};

export const colorHex = (key: string | undefined) => (key && CATEGORY_COLORS[key]?.hex) || undefined;
