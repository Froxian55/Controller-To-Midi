import type { AppSettings, AxisMode, PedalConfig, SourceType } from "./types";

export const DEFAULT_PEDALS: ReadonlyArray<Pick<PedalConfig, "name" | "cc">> = [
  { name: "Sustain", cc: 64 },
  { name: "Sostenuto", cc: 66 },
  { name: "Soft", cc: 67 }
];

export function createDefaultSettings(): AppSettings {
  return {
    selectedMidiDevice: "",
    channel: 1,
    pedals: DEFAULT_PEDALS.map(({ name, cc }) => ({
      name,
      cc,
      sourceName: "",
      sourceType: "axis",
      mode: "analog",
      deadzonePct: 10,
      invert: false,
      thresholdPct: 50,
      axisRestValue: 0,
      axisDirection: 1
    }))
  };
}

export function normalizeSettings(value: unknown): AppSettings {
  const defaults = createDefaultSettings();
  if (!isRecord(value)) return defaults;

  const pedals = Array.isArray(value.pedals) ? value.pedals : [];
  return {
    selectedMidiDevice: typeof value.selectedMidiDevice === "string" ? value.selectedMidiDevice : "",
    channel: clampInteger(value.channel, 1, 16, 1),
    pedals: defaults.pedals.map((defaultPedal, index) => {
      const saved = pedals[index];
      if (!isRecord(saved)) return defaultPedal;

      const sourceType: SourceType = saved.sourceType === "button" ? "button" : "axis";
      const mode: AxisMode = saved.mode === "threshold" ? "threshold" : "analog";
      const axisDirection = saved.axisDirection === -1 ? -1 : 1;
      return {
        ...defaultPedal,
        sourceName: typeof saved.sourceName === "string" ? saved.sourceName : "",
        sourceType,
        mode,
        deadzonePct: clampInteger(saved.deadzonePct, 0, 50, defaultPedal.deadzonePct),
        invert: typeof saved.invert === "boolean" ? saved.invert : false,
        thresholdPct: clampInteger(saved.thresholdPct, 5, 99, defaultPedal.thresholdPct),
        axisRestValue: clampNumber(saved.axisRestValue, -1, 1, 0),
        axisDirection
      };
    })
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
