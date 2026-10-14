// デスクトップ版に組み込むファイルを app/ に用意する
//   1. 画面（frontend）をビルドして app/web にコピー
//   2. バックエンド（backend）のソースを app/backend にコピー（.env や node_modules は含めない）
// `npm start` / `npm run dist` の前に自動で実行される。
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..", "..");
const frontend = path.join(root, "frontend");
const backend = path.join(root, "backend");
const out = path.join(__dirname, "..", "app");

const run = (cmd, cwd) => {
  console.log(`> ${cmd}  (${path.relative(root, cwd) || "."})`);
  execSync(cmd, { cwd, stdio: "inherit" });
};

// 1. 画面をビルド
if (!fs.existsSync(path.join(frontend, "node_modules"))) run("npm install", frontend);
run("npm run build", frontend);

// 2. コピー
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(frontend, "dist"), path.join(out, "web"), { recursive: true });

const BACKEND_FILES = ["server.js", "db.js", "DB.sql", "api", "services"];
for (const name of BACKEND_FILES) {
  fs.cpSync(path.join(backend, name), path.join(out, "backend", name), { recursive: true });
}
console.log(`Copied app files to ${path.relative(root, out)}`);
