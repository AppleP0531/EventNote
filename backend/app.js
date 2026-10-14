// ブラウザ版の起動スクリプト（http://localhost:PORT で API を公開する）
//   開発時は start.ps1 から起動され、画面は Vite の開発サーバー（8080）が出す。
//   デスクトップ版（.exe）はこのファイルを使わず、desktop/main.js から server.js を直接使う。
require("dotenv").config();
const path = require("path");
const createApp = require("./server");

const port = process.env.PORT || 3000;
// ビルド済みの画面（frontend/dist）があれば、API と一緒に配信する
const webDir = path.join(__dirname, "..", "frontend", "dist");

createApp({ webDir })
  .then(({ app, scheduler }) => {
    app.listen(port, () => {
      console.log(`EventNote backend listening on http://localhost:${port}`);
      scheduler.start(); // 通知時刻のチェックを開始（1分ごと）
    });
  })
  .catch((error) => {
    console.error("Failed to start backend:", error);
    process.exit(1);
  });
