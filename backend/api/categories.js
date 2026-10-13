const express = require("express");

// 選べる色（フロントエンドの utils/colors.ts と合わせる）
const COLORS = ["red", "orange", "amber", "green", "teal", "sky", "blue", "violet", "pink", "gray"];

function validate(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return { error: "カテゴリ名を入力してください" };
  if (name.length > 50) return { error: "カテゴリ名は50文字以内にしてください" };
  if (!COLORS.includes(body?.color)) return { error: "色が正しくありません" };
  return { name, color: body.color };
}

// カテゴリ（色分け）
module.exports = (pool) => {
  const router = express.Router();

  const list = async () => {
    const [rows] = await pool.query("SELECT id, name, color FROM categories ORDER BY sort_order, id");
    return rows;
  };

  // GET /api/categories
  router.get("/", async (_req, res, next) => {
    try {
      res.json(await list());
    } catch (e) {
      next(e);
    }
  });

  // POST /api/categories
  router.post("/", async (req, res, next) => {
    try {
      const v = validate(req.body);
      if (v.error) return res.status(400).json({ message: v.error });
      const [[{ next: order }]] = await pool.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM categories");
      const [r] = await pool.query("INSERT INTO categories (name, color, sort_order) VALUES (?, ?, ?)", [
        v.name,
        v.color,
        order,
      ]);
      res.status(201).json({ id: r.insertId, name: v.name, color: v.color });
    } catch (e) {
      next(e);
    }
  });

  // PUT /api/categories/:id
  router.put("/:id", async (req, res, next) => {
    try {
      const v = validate(req.body);
      if (v.error) return res.status(400).json({ message: v.error });
      const id = Number(req.params.id);
      const [r] = await pool.query("UPDATE categories SET name = ?, color = ? WHERE id = ?", [v.name, v.color, id]);
      if (r.affectedRows === 0) return res.status(404).json({ message: "カテゴリが見つかりません" });
      res.json({ id, name: v.name, color: v.color });
    } catch (e) {
      next(e);
    }
  });

  // DELETE /api/categories/:id（このカテゴリの予定は「カテゴリなし」になる）
  router.delete("/:id", async (req, res, next) => {
    try {
      const [r] = await pool.query("DELETE FROM categories WHERE id = ?", [Number(req.params.id)]);
      if (r.affectedRows === 0) return res.status(404).json({ message: "カテゴリが見つかりません" });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  router.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: "サーバーエラーが発生しました" });
  });

  return router;
};
