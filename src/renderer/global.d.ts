import type { AppSettings } from "../shared/types";

declare global {
  interface Window {
    desktop: {
      loadSettings(): Promise<AppSettings>;
      saveSettings(settings: AppSettings): Promise<void>;
    };
  }
}

export {};
