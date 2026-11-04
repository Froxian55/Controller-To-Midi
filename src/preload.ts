import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings } from "./shared/types";
import type { UpdateStatus } from "./shared/types";

contextBridge.exposeInMainWorld("desktop", {
  loadSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings: AppSettings): Promise<void> => ipcRenderer.invoke("settings:save", settings),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  checkForUpdates: (): Promise<UpdateStatus> => ipcRenderer.invoke("updates:check"),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke("updates:install"),
  openDownloadPage: (): Promise<void> => ipcRenderer.invoke("updates:open-download-page"),
  onUpdateStatus: (listener: (status: UpdateStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => listener(status);
    ipcRenderer.on("updates:status", handler);
    return () => ipcRenderer.removeListener("updates:status", handler);
  }
});
