// デスクトップ版（Electron の .exe）で動いているときだけ使える機能
//   desktop/preload.js が window.eventnote を用意する。ブラウザ版では undefined
export type DesktopBridge = {
  desktop: true;
  getAutoLaunch: () => Promise<boolean>;
  setAutoLaunch: (enabled: boolean) => Promise<boolean>;
  openConfig: () => Promise<void>;
};

export const desktop: DesktopBridge | undefined = (window as unknown as { eventnote?: DesktopBridge }).eventnote;
