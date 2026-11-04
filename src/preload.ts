import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings } from "./shared/types";

contextBridge.exposeInMainWorld("desktop", {
  loadSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings: AppSettings): Promise<void> => ipcRenderer.invoke("settings:save", settings)
});
