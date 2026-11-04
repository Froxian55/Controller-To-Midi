export type SourceType = "axis" | "button";
export type AxisMode = "analog" | "threshold";

export interface PedalConfig {
  name: string;
  cc: number;
  sourceName: string;
  sourceType: SourceType;
  mode: AxisMode;
  deadzonePct: number;
  invert: boolean;
  thresholdPct: number;
  axisRestValue: number;
  axisDirection: -1 | 1;
}

export interface AppSettings {
  selectedMidiDevice: string;
  channel: number;
  pedals: PedalConfig[];
}

export interface ControllerDevice {
  index: number;
  id: string;
  name: string;
}

export interface InputValues {
  [sourceName: string]: number;
}
