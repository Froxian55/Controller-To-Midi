import type { AppSettings } from "../shared/types";
import type { UpdateStatus } from "../shared/types";

declare global {
  interface Window {
    desktop: {
      loadSettings(): Promise<AppSettings>;
      saveSettings(settings: AppSettings): Promise<void>;
      getAppVersion(): Promise<string>;
      checkForUpdates(): Promise<UpdateStatus>;
      installUpdate(): Promise<boolean>;
      openDownloadPage(): Promise<void>;
      onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
    };
  }
}

export {};
