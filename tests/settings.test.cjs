const test = require("node:test");
const assert = require("node:assert/strict");
const { createDefaultSettings, normalizeSettings } = require("../dist/shared/settings.js");
const { calculateValue } = require("../dist/shared/processing.js");

test("defaults define the three fixed MIDI pedal controls", () => {
  const settings = createDefaultSettings();
  assert.deepEqual(settings.pedals.map(({ name, cc }) => [name, cc]), [
    ["Sustain", 64],
    ["Sostenuto", 66],
    ["Soft", 67]
  ]);
});

test("settings normalization clamps invalid channels and pedal values", () => {
  const settings = normalizeSettings({
    channel: 99,
    pedals: [{ mode: "threshold", deadzonePct: -2, thresholdPct: 120, invert: true }]
  });
  assert.equal(settings.channel, 16);
  assert.equal(settings.pedals[0].mode, "threshold");
  assert.equal(settings.pedals[0].deadzonePct, 0);
  assert.equal(settings.pedals[0].thresholdPct, 99);
  assert.equal(settings.pedals[0].invert, true);
});

test("analog axis maps its learned rest point to zero and travel to 127", () => {
  const pedal = {
    name: "Sustain",
    cc: 64,
    sourceName: "Axis 0",
    sourceType: "axis",
    mode: "analog",
    deadzonePct: 10,
    invert: false,
    thresholdPct: 50,
    axisRestValue: -1,
    axisDirection: 1
  };
  assert.equal(calculateValue(pedal, { "Axis 0": -1 }), 0);
  assert.equal(calculateValue(pedal, { "Axis 0": 1 }), 127);
});

test("reverse axis travel and inversion preserve the learned pedal direction", () => {
  const pedal = {
    name: "Soft",
    cc: 67,
    sourceName: "Axis 1",
    sourceType: "axis",
    mode: "analog",
    deadzonePct: 10,
    invert: false,
    thresholdPct: 50,
    axisRestValue: 1,
    axisDirection: -1
  };
  assert.equal(calculateValue(pedal, { "Axis 1": 1 }), 0);
  assert.equal(calculateValue(pedal, { "Axis 1": -1 }), 127);
  pedal.invert = true;
  assert.equal(calculateValue(pedal, { "Axis 1": 1 }), 127);
  assert.equal(calculateValue(pedal, { "Axis 1": -1 }), 0);
});

test("button and threshold modes emit only zero or full MIDI value", () => {
  const button = {
    name: "Sustain",
    cc: 64,
    sourceName: "Button 0",
    sourceType: "button",
    mode: "analog",
    deadzonePct: 10,
    invert: false,
    thresholdPct: 50,
    axisRestValue: 0,
    axisDirection: 1
  };
  assert.equal(calculateValue(button, { "Button 0": 0.49 }), 0);
  assert.equal(calculateValue(button, { "Button 0": 1 }), 127);

  const threshold = {
    ...button,
    sourceName: "Axis 0",
    sourceType: "axis",
    mode: "threshold",
    axisRestValue: 0,
    axisDirection: 1
  };
  assert.equal(calculateValue(threshold, { "Axis 0": 0.49 }), 0);
  assert.equal(calculateValue(threshold, { "Axis 0": 0.8 }), 127);
});
