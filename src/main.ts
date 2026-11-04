import { app, BrowserWindow, ipcMain, session } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeSettings } from "./shared/settings";
import type { AppSettings } from "./shared/types";

const settingsPath = (): string => path.join(app.getPath("userData"), "settings.json");
const rendererPath = path.resolve(__dirname, "..", "src", "renderer", "index.html");
let mainWindow: BrowserWindow | null = null;

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

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => {
    return isTrustedMidiRequest(webContents, permission, details.requestingUrl, details.isMainFrame);
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isTrustedMidiRequest(webContents, permission, details.requestingUrl, details.isMainFrame));
  });

  createWindow();
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
