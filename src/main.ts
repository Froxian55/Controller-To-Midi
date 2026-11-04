import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeSettings } from "./shared/settings";
import type { AppSettings, UpdateStatus } from "./shared/types";

const settingsPath = (): string => path.join(app.getPath("userData"), "settings.json");
const rendererPath = path.resolve(__dirname, "..", "src", "renderer", "index.html");
const releasesUrl = "https://github.com/Froxian55/Controller-To-Midi/releases/latest";
let mainWindow: BrowserWindow | null = null;
let updateDownloaded = false;
let currentUpdateStatus: UpdateStatus = { state: "checking" };

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 820,
    minWidth: 760,
    minHeight: 640,
    backgroundColor: "#0b0e14",
    title: "Controller to MIDI",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  void mainWindow.loadFile(rendererPath);
  mainWindow.webContents.on("did-finish-load", () => {
    sendUpdateStatus(currentUpdateStatus);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("settings:load", async (): Promise<AppSettings> => {
  try {
    const contents = await fs.readFile(settingsPath(), "utf8");
    return normalizeSettings(JSON.parse(contents) as unknown);
  } catch (error) {
    if (isMissingFile(error)) return normalizeSettings(null);
    throw error;
  }
});

ipcMain.handle("settings:save", async (_event, value: unknown): Promise<void> => {
  const settings = normalizeSettings(value);
  const file = settingsPath();
  const temporaryFile = `${file}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temporaryFile, JSON.stringify(settings, null, 2), "utf8");
  await fs.rename(temporaryFile, file);
});

ipcMain.handle("app:version", (): string => app.getVersion());
ipcMain.handle("updates:check", async (): Promise<UpdateStatus> => checkForUpdates());
ipcMain.handle("updates:install", (): boolean => {
  if (!updateDownloaded) return false;
  autoUpdater.quitAndInstall(false, true);
  return true;
});
ipcMain.handle("updates:open-download-page", async (): Promise<void> => {
  await shell.openExternal(releasesUrl);
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => {
    return isTrustedMidiRequest(webContents, permission, details.requestingUrl, details.isMainFrame);
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isTrustedMidiRequest(webContents, permission, details.requestingUrl, details.isMainFrame));
  });

  createWindow();
  registerAutoUpdates();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function registerAutoUpdates(): void {
  autoUpdater.on("checking-for-update", () => {
    publishUpdateStatus({ state: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    publishUpdateStatus({ state: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", (info) => {
    publishUpdateStatus({ state: "not-available", version: info.version });
  });
  autoUpdater.on("download-progress", (progress) => {
    publishUpdateStatus({ state: "downloading", percent: progress.percent });
  });
  autoUpdater.on("update-downloaded", (info) => {
    updateDownloaded = true;
    publishUpdateStatus({ state: "downloaded", version: info.version });
  });
  autoUpdater.on("error", (error) => {
    console.error("Automatic update failed:", error);
    publishUpdateStatus({ state: "error", message: error.message });
  });

  if (!app.isPackaged) {
    publishUpdateStatus({ state: "unsupported", message: "Updates are available in packaged builds." });
    return;
  }
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    publishUpdateStatus({ state: "unsupported", message: "Portable builds must be updated manually." });
    return;
  }

  setTimeout(() => {
    void checkForUpdates();
  }, 4000);
}

async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) {
    const message = !app.isPackaged
      ? "Updates are available in packaged builds."
      : "Portable builds must be updated manually.";
    const status: UpdateStatus = { state: "unsupported", message };
    publishUpdateStatus(status);
    return status;
  }

  publishUpdateStatus({ state: "checking" });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Could not check for updates:", error);
    publishUpdateStatus({ state: "error", message });
  }
  return currentUpdateStatus;
}

function publishUpdateStatus(status: UpdateStatus): void {
  currentUpdateStatus = status;
  sendUpdateStatus(status);
}

function sendUpdateStatus(status: UpdateStatus): void {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("updates:status", status);
  }
}

function isTrustedMidiRequest(
  webContents: Electron.WebContents | null,
  permission: string,
  requestingUrl: string | undefined,
  isMainFrame: boolean
): boolean {
  if (
    (permission !== "midi" && permission !== "midiSysex") ||
    !mainWindow ||
    webContents !== mainWindow.webContents ||
    !isMainFrame ||
    !requestingUrl
  ) {
    return false;
  }

  try {
    return new URL(requestingUrl).protocol === "file:" &&
      path.resolve(fileURLToPath(requestingUrl)) === rendererPath &&
      new URL(requestingUrl).href === pathToFileURL(rendererPath).href;
  } catch {
    console.warn("Denied MIDI permission for an invalid renderer URL.");
    return false;
  }
}
