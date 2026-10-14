// 画面（frontend）から使えるデスクトップ版の機能
//   window.eventnote があればデスクトップ版として動く（ブラウザ版では undefined）
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("eventnote", {
  desktop: true,
  getAutoLaunch: () => ipcRenderer.invoke("eventnote:get-auto-launch"),
  setAutoLaunch: (enabled) => ipcRenderer.invoke("eventnote:set-auto-launch", enabled),
  openConfig: () => ipcRenderer.invoke("eventnote:open-config"),
});
