// ===================================
// EventNote デスクトップ版（Electron）
//   - ポートを使わない：画面からの /api/... は app:// プロトコルで受け取り、
//     アプリ内のバックエンド（Express）を直接呼び出す
//   - 通知は Windows の通知で出す（ウィンドウを閉じてもタスクトレイで動き続ける）
//   - ログイン時の自動起動はトレイメニュー／画面から切り替えられる
//   - DB は MySQL（設定は %APPDATA%\EventNote\.env）
// ===================================
const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, protocol, shell } =
  require("electron");
const fs = require("fs");
const path = require("path");

const APP_ID = "com.eventnote.desktop";
const SCHEME = "app";
const ORIGIN = `${SCHEME}://eventnote`;
const isDev = !app.isPackaged;
const startHidden = process.argv.includes("--hidden"); // ログイン時の自動起動ではトレイだけで起動

// 組み込みのファイル（copy-app.js が用意する）
const appDir = path.join(__dirname, "app");
const webDir = path.join(appDir, "web");
const iconPath = path.join(__dirname, "assets", "icon.png");

let mainWindow = null;
let tray = null;
let backend = null; // { app, scheduler }
let quitting = false;

// ---------- 二重起動の防止 ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
}

// app:// を通常の Web ページと同じように扱えるようにする（fetch・Cookie など）
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// ---------- 設定（.env） ----------
const DEFAULT_ENV = `# EventNote デスクトップ版の設定
# MySQL の接続先を変えたら、EventNote を終了して起動し直してください
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=db_eventnote
`;

function configPath() {
  return path.join(app.getPath("userData"), ".env");
}

// 設定ファイルが無ければ作る。開発中（npm start）は backend/.env があればそれを初期値にする
function loadConfig() {
  const file = configPath();
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const devEnv = path.join(__dirname, "..", "backend", ".env");
    const initial = isDev && fs.existsSync(devEnv) ? fs.readFileSync(devEnv, "utf8") : DEFAULT_ENV;
    fs.writeFileSync(file, initial.replace(/^PORT=.*\r?\n?/m, ""), "utf8");
  }
  require("dotenv").config({ path: file, override: true, quiet: true });
}

// ---------- 通知（Windows の通知） ----------
// バックエンドの通知スケジューラから呼ばれる（Web Push と同じ形）
const desktopNotifier = {
  async countSubscriptions() {
    return Notification.isSupported() ? 1 : 0;
  },
  async sendToAll(payload) {
    if (!Notification.isSupported()) return 0;
    const n = new Notification({
      title: payload.title || "EventNote",
      body: payload.body || "",
      icon: iconPath,
      timeoutType: "never", // 閉じるまで表示（Windows の設定によっては通知センターへ）
    });
    n.on("click", () => showWindow());
    n.show();
    return 1;
  },
};

// Windows の通知は「アプリIDつきのスタートメニューのショートカット」が無いと表示されない。
// インストーラーが作るが、無い場合（開発中・フォルダごとコピーした場合など）はここで作る
function ensureStartMenuShortcut() {
  if (process.platform !== "win32") return;
  const name = isDev ? "EventNote (開発)" : "EventNote";
  const lnk = path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", `${name}.lnk`);
  if (fs.existsSync(lnk)) return;
  try {
    shell.writeShortcutLink(lnk, "create", {
      target: process.execPath,
      args: isDev ? `"${app.getAppPath()}"` : "",
      appUserModelId: APP_ID,
      icon: process.execPath,
      iconIndex: 0,
      description: "EventNote",
    });
  } catch (err) {
    console.error("Failed to create Start Menu shortcut:", err);
  }
}

// ---------- app:// プロトコル ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveFile(pathname) {
  // パスの外へ出ないようにする
  let file = path.normalize(path.join(webDir, decodeURIComponent(pathname)));
  if (!file.startsWith(webDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(webDir, "index.html"); // 画面内のパスは index.html を返す
  }
  const body = await fs.promises.readFile(file);
  const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  return new Response(body, { headers: { "Content-Type": type } });
}

// /api/... をアプリ内の Express に渡す（ネットワークを使わない）
async function callApi(request, url) {
  if (!backend) {
    return Response.json({ message: "バックエンドを起動中です" }, { status: 503 });
  }
  const inject = require("light-my-request");
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const res = await inject(backend.app, {
    method: request.method,
    url: url.pathname + url.search,
    headers: Object.fromEntries(request.headers.entries()),
    payload: hasBody ? Buffer.from(await request.arrayBuffer()) : undefined,
  });
  const headers = new Headers();
  for (const [k, v] of Object.entries(res.headers)) {
    if (v == null || ["content-length", "transfer-encoding", "connection"].includes(k)) continue;
    headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
  }
  const noBody = res.statusCode === 204 || res.statusCode === 304 || request.method === "HEAD";
  return new Response(noBody ? null : res.rawPayload, { status: res.statusCode, headers });
}

function registerProtocol() {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      return url.pathname.startsWith("/api/") || url.pathname === "/api"
        ? await callApi(request, url)
        : await serveFile(url.pathname);
    } catch (err) {
      console.error(err);
      return new Response("Internal Error", { status: 500 });
    }
  });
}

// ---------- バックエンド（MySQL 接続） ----------
async function startBackend() {
  for (;;) {
    loadConfig();
    // 設定を読み直したときのために、バックエンドのモジュールを毎回読み込み直す
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(path.join(appDir, "backend"))) delete require.cache[key];
    }
    const createApp = require(path.join(appDir, "backend", "server.js"));
    try {
      backend = await createApp({ notifier: desktopNotifier });
      backend.scheduler.start(); // 通知時刻のチェックを開始（1分ごと）
      return true;
    } catch (err) {
      console.error(err);
      const { response } = await dialog.showMessageBox({
        type: "error",
        title: "EventNote",
        message: "MySQL に接続できませんでした",
        detail:
          `${err.code ?? ""} ${err.message}\n\n` +
          "MySQL が起動しているか、接続設定が正しいか確認してください。\n" +
          `設定ファイル: ${configPath()}`,
        buttons: ["再試行", "設定ファイルを開く", "終了"],
        defaultId: 0,
        cancelId: 2,
      });
      if (response === 1) {
        await shell.openPath(configPath());
        await dialog.showMessageBox({
          type: "info",
          title: "EventNote",
          message: "設定ファイルを保存してから「OK」を押してください。",
          buttons: ["OK"],
        });
      } else if (response === 2) {
        return false;
      }
    }
  }
}

// ---------- ウィンドウ・トレイ ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    title: "EventNote",
    icon: iconPath,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.loadURL(`${ORIGIN}/`);
  mainWindow.once("ready-to-show", () => {
    if (!startHidden) mainWindow.show();
  });

  // 外部リンクは既定のブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(ORIGIN)) shell.openExternal(url);
    return { action: "deny" };
  });

  // ×で閉じてもトレイに残る（通知を続けるため）
  let toldAboutTray = false;
  mainWindow.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWindow.hide();
    if (!toldAboutTray && Notification.isSupported()) {
      toldAboutTray = true;
      new Notification({
        title: "EventNote はタスクトレイで動いています",
        body: "通知は引き続き届きます。終了するにはトレイのアイコンを右クリック →「終了」",
        icon: iconPath,
      }).show();
    }
  });
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

const isAutoLaunch = () => app.getLoginItemSettings({ args: ["--hidden"] }).openAtLogin;

function setAutoLaunch(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, args: ["--hidden"] });
  updateTrayMenu();
  return isAutoLaunch();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "EventNote を開く", click: showWindow },
      { type: "separator" },
      {
        label: "ログイン時に起動",
        type: "checkbox",
        checked: isAutoLaunch(),
        click: (item) => setAutoLaunch(item.checked),
      },
      { label: "設定ファイル（DB 接続）を開く", click: () => shell.openPath(configPath()) },
      { type: "separator" },
      {
        label: "終了",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip("EventNote");
  tray.on("click", showWindow);
  updateTrayMenu();
}

// ---------- 画面とのやりとり（preload.js 経由） ----------
ipcMain.handle("eventnote:get-auto-launch", () => isAutoLaunch());
ipcMain.handle("eventnote:set-auto-launch", (_e, enabled) => setAutoLaunch(Boolean(enabled)));
ipcMain.handle("eventnote:open-config", () => shell.openPath(configPath()));

// ---------- 起動 ----------
app.whenReady().then(async () => {
  app.setAppUserModelId(APP_ID); // Windows の通知に必要
  ensureStartMenuShortcut();
  Menu.setApplicationMenu(null);
  registerProtocol();
  createTray();

  if (!(await startBackend())) {
    quitting = true;
    app.quit();
    return;
  }
  createWindow();
});

// ウィンドウを全部閉じてもアプリは終了しない（トレイで通知を続ける）
app.on("window-all-closed", () => {});

app.on("before-quit", () => {
  quitting = true;
});
