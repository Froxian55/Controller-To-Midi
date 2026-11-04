import type { InputValues, PedalConfig } from "./types";

export function calculateValue(pedal: PedalConfig, values: InputValues): number {
  if (!pedal.sourceName || !(pedal.sourceName in values)) return 0;
  const raw = values[pedal.sourceName];
  if (pedal.sourceType === "button") return raw > 0.5 ? 127 : 0;

  const distanceToEnd = pedal.axisDirection === 1 ? 1 - pedal.axisRestValue : pedal.axisRestValue + 1;
  const movement = (raw - pedal.axisRestValue) * pedal.axisDirection;
  let value = distanceToEnd <= 0 ? 0 : Math.max(0, Math.min(1, movement / distanceToEnd));
  if (pedal.invert) value = 1 - value;

  const deadzone = pedal.deadzonePct / 100;
  if (value <= deadzone) return 0;
  if (pedal.mode === "threshold") return value >= pedal.thresholdPct / 100 ? 127 : 0;

  const scaled = (value - deadzone) / Math.max(0.01, 1 - deadzone);
  return Math.max(0, Math.min(127, Math.round(scaled * 127)));
}
