import { createDefaultSettings, normalizeSettings } from "../shared/settings";
import type { AppSettings, ControllerDevice, InputValues, UpdateStatus } from "../shared/types";
import { calculateValue } from "../shared/processing";

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
};

const controllerSelect = $("controller-select") as HTMLSelectElement;
const midiSelect = $("midi-select") as HTMLSelectElement;
const channelInput = $("channel-input") as HTMLInputElement;
const pedalList = $("pedal-list");
const startButton = $("start-button") as HTMLButtonElement;
const stopButton = $("stop-button") as HTMLButtonElement;
const saveButton = $("save-button") as HTMLButtonElement;
const controllerStatus = $("controller-status");
const controllerIndicator = $("controller-indicator");
const midiStatus = $("midi-status");
const runningStatus = $("running-status");
const runningDot = $("running-dot");
const saveStatus = $("save-status");
const toast = $("toast");
const inputMonitor = $("input-monitor");
const emptyMonitor = $("empty-monitor");
const monitorDescription = $("monitor-description");
const inputCount = $("input-count");
const mappingCount = $("mapping-count");
const monitorMappingCount = $("monitor-mapping-count");
const sessionState = $("session-state");
const sessionDetail = $("session-detail");
const updateButton = $("update-button") as HTMLButtonElement;
const appVersion = $("app-version");

let settings: AppSettings = createDefaultSettings();
let controllers: ControllerDevice[] = [];
let midiAccess: MIDIAccess | null = null;
let midiOutput: MIDIOutput | null = null;
let running = false;
let learningIndex: number | null = null;
let learningBaseline: InputValues = {};
let lastSent = new Map<number, number>();
let toastTimer: number | undefined;
let monitorSignature = "";
let updateStatus: UpdateStatus = { state: "checking" };

async function initialize(): Promise<void> {
  window.desktop.onUpdateStatus(renderUpdateStatus);
  updateButton.addEventListener("click", () => void handleUpdateAction());
  void window.desktop.getAppVersion().then((version) => {
    appVersion.textContent = `VERSION ${version}`;
  }).catch((error: unknown) => {
    console.error("Could not read app version:", error);
  });
  try {
    settings = normalizeSettings(await window.desktop.loadSettings());
  } catch (error) {
    showToast(`Could not load settings: ${errorMessage(error)}`, true);
  }

  channelInput.value = String(settings.channel);
  renderPedals();
  refreshControllers();
  setMidiOptions([]);
  const midiPlaceholder = midiSelect.options.item(0);
  if (midiPlaceholder) midiPlaceholder.textContent = "MIDI is checked when you click Start";
  midiStatus.textContent = "Click Start to request MIDI access";
  window.setInterval(tick, 16);
  window.addEventListener("gamepadconnected", refreshControllers);
  window.addEventListener("gamepaddisconnected", refreshControllers);
  $("refresh-controllers").addEventListener("click", refreshControllers);
  startButton.addEventListener("click", () => void start());
  stopButton.addEventListener("click", () => stop());
  saveButton.addEventListener("click", () => void save());
  controllerSelect.addEventListener("change", () => {
    cancelLearning();
    if (running) stop();
    renderPedals();
    updateOverview();
  });
  midiSelect.addEventListener("change", () => {
    if (running) stop();
    settings.selectedMidiDevice = midiSelect.value;
    updateMidiStatus();
    markDirty();
  });
  channelInput.addEventListener("change", () => {
    if (running) {
      for (const pedal of settings.pedals) {
        if (pedal.sourceName) sendCc(pedal.cc, 0);
      }
    }
    const channel = Number(channelInput.value);
    settings.channel = Number.isFinite(channel) ? Math.min(16, Math.max(1, Math.round(channel))) : 1;
    channelInput.value = String(settings.channel);
    lastSent.clear();
    markDirty();
  });
  updateOverview();
}

function refreshControllers(): void {
  const previous = controllerSelect.value;
  controllers = getConnectedControllers();
  controllerSelect.replaceChildren();

  if (controllers.length === 0) {
    addOption(controllerSelect, "", "No controller found");
    controllerSelect.disabled = true;
    updateControllerStatus(null);
    renderPedals();
    if (running) {
      stop();
      showToast("Controller disconnected; MIDI output stopped.", true);
    }
    updateOverview();
    return;
  }

  controllerSelect.disabled = false;
  for (const controller of controllers) {
    addOption(controllerSelect, String(controller.index), controller.name);
  }
  controllerSelect.value = controllers.some((item) => String(item.index) === previous)
    ? previous
    : String(controllers[0].index);
  updateControllerStatus(getSelectedController());
  renderPedals();
  updateOverview();
}

function getConnectedControllers(): ControllerDevice[] {
  return Array.from(navigator.getGamepads())
    .filter((gamepad): gamepad is Gamepad => gamepad !== null && gamepad.connected)
    .map((gamepad) => ({ index: gamepad.index, id: gamepad.id, name: gamepad.id || `Controller ${gamepad.index + 1}` }));
}

function getSelectedController(): Gamepad | null {
  if (!controllerSelect.value) return null;
  const index = Number(controllerSelect.value);
  const controller = navigator.getGamepads()[index];
  return controller?.connected ? controller : null;
}

function updateControllerStatus(controller: Gamepad | null): void {
  controllerStatus.textContent = controller ? `${controller.id || `Controller ${controller.index + 1}`} connected` : "Waiting for controller";
  controllerIndicator.classList.toggle("is-connected", controller !== null);
}

async function connectMidiAccess(): Promise<void> {
  if (!("requestMIDIAccess" in navigator)) {
    setMidiOptions([]);
    midiStatus.textContent = "Web MIDI is not supported";
    throw new Error("Web MIDI is unavailable in this Electron/Chromium version.");
  }

  if (!midiAccess) {
    midiAccess = await navigator.requestMIDIAccess();
    midiAccess.onstatechange = refreshMidiDevices;
  }
  refreshMidiDevices();
}

function refreshMidiDevices(): void {
  const outputs = midiAccess ? Array.from(midiAccess.outputs.values()) : [];
  const selectedBefore = settings.selectedMidiDevice;
  setMidiOptions(outputs);

  if (outputs.some((output) => output.id === selectedBefore)) {
    midiSelect.value = selectedBefore;
  } else if (outputs.length > 0) {
    midiSelect.value = outputs[0].id;
    settings.selectedMidiDevice = outputs[0].id;
  }
  if (midiOutput && !outputs.some((output) => output.id === midiOutput?.id)) {
    showToast("MIDI output disconnected.", true);
    stop();
  }
  updateMidiStatus();
  updateOverview();
}

function setMidiOptions(outputs: MIDIOutput[]): void {
  midiSelect.replaceChildren();
  if (outputs.length === 0) {
    addOption(midiSelect, "", "No MIDI output found");
    midiSelect.disabled = true;
    return;
  }
  midiSelect.disabled = false;
  for (const output of outputs) {
    addOption(midiSelect, output.id, output.name || output.manufacturer || "MIDI Output");
  }
}

function updateMidiStatus(): void {
  const selected = midiAccess?.outputs.get(midiSelect.value);
  midiStatus.textContent = midiOutput
    ? `${midiOutput.name || "MIDI output"} connected`
    : selected
      ? `${selected.name || "MIDI output"} ready`
      : "Waiting for MIDI output";
}

function addOption(select: HTMLSelectElement, value: string, label: string): void {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

async function start(): Promise<void> {
  if (running) return;
  try {
    const controller = getSelectedController();
    if (!controller) throw new Error("Connect and select a controller first.");

    await connectMidiAccess();
    const selected = midiAccess?.outputs.get(midiSelect.value);
    if (!selected) throw new Error("Select an available MIDI output.");
    await selected.open();
    midiOutput = selected;
    settings.selectedMidiDevice = selected.id;
    lastSent.clear();
    running = true;
    updateRunningState();
    updateMidiStatus();
    updateOverview();
    showToast("MIDI output started.");
  } catch (error) {
    midiOutput = null;
    updateMidiStatus();
    showToast(getMidiStartError(error), true);
  }
}

function stop(sendReset = true): void {
  if (!running && !midiOutput) return;
  running = false;
  if (sendReset) {
    for (const pedal of settings.pedals) {
      if (midiOutput && pedal.sourceName) sendCc(pedal.cc, 0);
    }
  }
  lastSent.clear();

  if (midiOutput) {
    void midiOutput.close().catch((error: unknown) => showToast(`Could not close MIDI output: ${errorMessage(error)}`, true));
  }
  midiOutput = null;
  for (const pedal of settings.pedals) setLiveValue(pedal.cc, 0);
  updateRunningState();
  updateMidiStatus();
  updateOverview();
}

async function save(): Promise<void> {
  try {
    readControls();
    await window.desktop.saveSettings(settings);
    saveStatus.textContent = "Settings saved";
    saveStatus.classList.remove("is-dirty");
    window.setTimeout(() => { saveStatus.textContent = ""; }, 1800);
  } catch (error) {
    showToast(`Could not save settings: ${errorMessage(error)}`, true);
  }
}

function readControls(): void {
  const channel = Number(channelInput.value);
  settings.channel = Number.isFinite(channel) ? Math.min(16, Math.max(1, Math.round(channel))) : 1;
  channelInput.value = String(settings.channel);
  settings.selectedMidiDevice = midiSelect.value;

  for (let index = 0; index < settings.pedals.length; index += 1) {
    const pedal = settings.pedals[index];
    const card = pedalList.querySelector<HTMLElement>(`[data-pedal-index="${index}"]`);
    if (!card) continue;

    const mode = card.querySelector<HTMLSelectElement>(".mode-select")?.value;
    const deadzone = card.querySelector<HTMLInputElement>(".deadzone-slider")?.value;
    const threshold = card.querySelector<HTMLInputElement>(".threshold-slider")?.value;
    const invert = card.querySelector<HTMLInputElement>(".invert-input")?.checked;
    pedal.mode = mode === "threshold" ? "threshold" : "analog";
    pedal.deadzonePct = parseBoundedInteger(deadzone, 0, 50, pedal.deadzonePct);
    pedal.thresholdPct = parseBoundedInteger(threshold, 5, 99, pedal.thresholdPct);
    pedal.invert = invert === true;
  }
  updateOverview();
}

function renderPedals(): void {
  const gamepad = getSelectedController();
  const options = gamepad ? getSources(gamepad) : [];
  pedalList.replaceChildren();

  settings.pedals.forEach((pedal, index) => {
    const card = document.createElement("article");
    card.className = "pedal-card";
    card.dataset.pedalIndex = String(index);

    const titleRow = document.createElement("div");
    titleRow.className = "pedal-title-row";
    const number = document.createElement("span");
    number.className = "pedal-number";
    number.textContent = `0${index + 1}`;
    const name = document.createElement("span");
    name.className = "pedal-name";
    name.textContent = pedal.name;
    const cc = document.createElement("span");
    cc.className = "cc-badge";
    cc.textContent = `MIDI CC ${pedal.cc}`;
    const meter = document.createElement("div");
    meter.className = "meter";
    const track = document.createElement("div");
    track.className = "meter-track";
    const fill = document.createElement("div");
    fill.className = "meter-fill";
    fill.dataset.meterCc = String(pedal.cc);
    track.append(fill);
    const value = document.createElement("span");
    value.className = "meter-value";
    value.dataset.valueCc = String(pedal.cc);
    value.textContent = "0";
    meter.append(track, value);
    titleRow.append(number, name, cc, meter);

    const controls = document.createElement("div");
    controls.className = "pedal-controls";
    const learn = document.createElement("button");
    learn.type = "button";
    learn.className = "learn-button";
    learn.dataset.learnIndex = String(index);
    learn.textContent = learningIndex === index ? "Listening…" : "Learn input";
    learn.classList.toggle("is-learning", learningIndex === index);
    learn.addEventListener("click", () => beginLearning(index));
    const source = document.createElement("span");
    source.className = gamepad ? "source-name is-hidden" : "source-name";
    source.dataset.sourceIndex = String(index);
    source.textContent = pedal.sourceName
      ? `${pedal.sourceType === "axis" ? "Axis" : "Button"} ${pedal.sourceName.slice(pedal.sourceName.indexOf(" ") + 1)}`
      : "No input mapped yet";
    const sourceSelect = document.createElement("select");
    sourceSelect.className = "source-select";
    sourceSelect.setAttribute("aria-label", `${pedal.name} controller input`);
    addOption(sourceSelect, "", "Select input");
    for (const option of options) {
      addOption(sourceSelect, option, option.startsWith("Axis ") ? `Axis ${option.slice(5)}` : `Button ${option.slice(7)}`);
    }
    if (pedal.sourceName && !options.includes(pedal.sourceName)) {
      addOption(
        sourceSelect,
        pedal.sourceName,
        `${pedal.sourceName.startsWith("Axis ") ? "Axis" : "Button"} ${pedal.sourceName.slice(pedal.sourceName.indexOf(" ") + 1)} (offline)`
      );
    }
    sourceSelect.value = pedal.sourceName;
    sourceSelect.addEventListener("change", () => setPedalSource(index, sourceSelect.value));
    const mode = document.createElement("select");
    mode.className = "mode-select";
    mode.setAttribute("aria-label", `${pedal.name} output mode`);
    addOption(mode, "analog", "Analog");
    addOption(mode, "threshold", "Threshold");
    mode.value = pedal.mode;
    mode.addEventListener("change", () => {
      pedal.mode = mode.value === "threshold" ? "threshold" : "analog";
      markDirty();
    });
    const invertLabel = document.createElement("label");
    invertLabel.className = "invert-control";
    const invert = document.createElement("input");
    invert.type = "checkbox";
    invert.className = "invert-input";
    invert.setAttribute("aria-label", `Invert ${pedal.name} direction`);
    invert.checked = pedal.invert;
    invert.addEventListener("change", () => {
      pedal.invert = invert.checked;
      markDirty();
    });
    invertLabel.append(invert, document.createTextNode("Invert"));
    controls.append(learn, source, sourceSelect, mode, invertLabel);

    const sliders = document.createElement("div");
    sliders.className = "sliders";
    sliders.append(
      createSlider("Dead zone", "deadzone", index, pedal.deadzonePct, 0, 50, "%", (value) => { pedal.deadzonePct = value; }),
      createSlider("Threshold", "threshold", index, pedal.thresholdPct, 5, 99, "%", (value) => { pedal.thresholdPct = value; })
    );
    if (options.length === 0) {
      learn.disabled = true;
      learn.title = "Connect a controller before mapping an input";
      sourceSelect.disabled = true;
    }
    if (pedal.sourceType === "button") mode.disabled = true;
    sourceSelect.disabled ||= options.length === 0;
    invert.disabled = pedal.sourceType === "button";
    for (const slider of sliders.querySelectorAll<HTMLInputElement>("input[type='range']")) {
      slider.disabled = pedal.sourceType === "button";
    }
    card.append(titleRow, controls, sliders);
    pedalList.append(card);
  });
  updateOverview();
}

function createSlider(
  label: string,
  kind: "deadzone" | "threshold",
  index: number,
  initial: number,
  min: number,
  max: number,
  suffix: string,
  update: (value: number) => void
): HTMLElement {
  const wrapper = document.createElement("label");
  const heading = document.createElement("span");
  heading.className = "slider-heading";
  const title = document.createElement("span");
  title.textContent = label;
  const output = document.createElement("output");
  output.textContent = `${initial}${suffix}`;
  output.dataset.sliderOutput = `${kind}-${index}`;
  heading.append(title, output);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(min);
  slider.max = String(max);
  slider.value = String(initial);
  slider.className = `${kind}-slider`;
  slider.addEventListener("input", () => {
    const value = Number(slider.value);
    update(value);
    output.textContent = `${value}${suffix}`;
    markDirty();
  });
  wrapper.append(heading, slider);
  return wrapper;
}

function getSources(gamepad: Gamepad): string[] {
  return [
    ...Array.from(gamepad.axes, (_value, index) => `Axis ${index}`),
    ...Array.from(gamepad.buttons, (_value, index) => `Button ${index}`)
  ];
}

function setPedalSource(index: number, sourceName: string): void {
  const pedal = settings.pedals[index];
  if (!pedal) return;
  pedal.sourceName = sourceName;
  pedal.sourceType = sourceName.startsWith("Button ") ? "button" : "axis";

  if (pedal.sourceType === "axis") {
    const gamepad = getSelectedController();
    const axisIndex = Number(sourceName.slice("Axis ".length));
    const value = gamepad?.axes[axisIndex];
    pedal.axisRestValue = typeof value === "number" ? value : 0;
    pedal.axisDirection = pedal.axisRestValue > 0 ? -1 : 1;
  }
  renderPedals();
  markDirty();
}

function beginLearning(index: number): void {
  if (learningIndex === index) {
    cancelLearning();
    renderPedals();
    return;
  }
  const gamepad = getSelectedController();
  if (!gamepad) {
    showToast("Connect and select a controller to learn an input.", true);
    return;
  }

  cancelLearning();
  learningBaseline = readInputs(gamepad);
  learningIndex = index;
  renderPedals();
  sessionDetail.textContent = `Press a button or move an axis for ${settings.pedals[index].name}`;
}

function cancelLearning(): void {
  learningIndex = null;
  learningBaseline = {};
}

function tick(): void {
  const gamepad = getSelectedController();
  updateControllerStatus(gamepad);
  if (!gamepad) {
    if (learningIndex !== null) {
      cancelLearning();
      renderPedals();
    }
    renderInputMonitor(null, {});
    if (running) {
      processPedals({});
      stop();
      showToast("Controller disconnected; MIDI output stopped.", true);
    }
    updateOverview();
    return;
  }

  const values = readInputs(gamepad);
  renderInputMonitor(gamepad, values);
  if (learningIndex !== null) detectLearnedInput(gamepad, values);
  if (running) processPedals(values);
}

function readInputs(gamepad: Gamepad): InputValues {
  const values: InputValues = {};
  gamepad.axes.forEach((value, index) => { values[`Axis ${index}`] = value; });
  gamepad.buttons.forEach((button, index) => { values[`Button ${index}`] = button.value; });
  return values;
}

function detectLearnedInput(gamepad: Gamepad, values: InputValues): void {
  if (learningIndex === null) return;
  for (const [sourceName, value] of Object.entries(values)) {
    const baseline = learningBaseline[sourceName] ?? value;
    if (Math.abs(value - baseline) <= 0.22) continue;

    const pedal = settings.pedals[learningIndex];
    pedal.sourceName = sourceName;
    pedal.sourceType = sourceName.startsWith("Axis ") ? "axis" : "button";
    if (pedal.sourceType === "axis") {
      pedal.axisRestValue = baseline;
      pedal.axisDirection = value > baseline ? 1 : -1;
    }
    learningIndex = null;
    learningBaseline = {};
    renderPedals();
    markDirty();
    showToast(`${sourceName.startsWith("Axis ") ? "Axis" : "Button"} mapped.`);
    return;
  }
  updateControllerStatus(gamepad);
}

function processPedals(values: InputValues): void {
  for (const pedal of settings.pedals) {
    const output = calculateValue(pedal, values);
    setLiveValue(pedal.cc, output);
    if (lastSent.get(pedal.cc) === output) continue;
    lastSent.set(pedal.cc, output);
    sendCc(pedal.cc, output);
  }
}

function sendCc(cc: number, value: number): void {
  if (!midiOutput) return;
  try {
    midiOutput.send([0xb0 | (settings.channel - 1), cc, value]);
  } catch (error) {
    showToast(`Could not send MIDI message: ${errorMessage(error)}`, true);
    stop(false);
  }
}

function setLiveValue(cc: number, value: number): void {
  const fill = pedalList.querySelector<HTMLElement>(`[data-meter-cc="${cc}"]`);
  const output = pedalList.querySelector<HTMLElement>(`[data-value-cc="${cc}"]`);
  if (fill) fill.style.width = `${(value / 127) * 100}%`;
  if (output) output.textContent = String(value);
}

function updateRunningState(): void {
  startButton.disabled = running;
  stopButton.disabled = !running;
  runningStatus.textContent = running ? "RUNNING" : "STOPPED";
  runningDot.classList.toggle("is-running", running);
  sessionState.classList.toggle("is-running", running);
}

function updateOverview(): void {
  const connected = getSelectedController() !== null;
  const mapped = settings.pedals.filter((pedal) => pedal.sourceName !== "").length;
  mappingCount.textContent = String(mapped);
  monitorMappingCount.textContent = String(mapped);

  if (running) {
    sessionDetail.textContent = "Controller data is being sent to MIDI";
  } else if (learningIndex !== null) {
    sessionDetail.textContent = `Waiting for ${settings.pedals[learningIndex].name} input`;
  } else if (!connected) {
    sessionDetail.textContent = "Connect a controller to get started";
  } else if (mapped < settings.pedals.length) {
    sessionDetail.textContent = `${settings.pedals.length - mapped} pedal input(s) left to map`;
  } else {
    sessionDetail.textContent = "All set. Ready to make music";
  }

  startButton.title = !connected
    ? "Connect a controller before starting"
    : !midiSelect.value
      ? "Select a MIDI output before starting"
      : "Start MIDI output";
}

function renderUpdateStatus(status: UpdateStatus): void {
  updateStatus = status;
  updateButton.disabled = status.state === "checking" || status.state === "downloading" || status.state === "available";
  switch (status.state) {
    case "checking":
      updateButton.textContent = "Checking…";
      break;
    case "available":
      updateButton.textContent = "Update found";
      break;
    case "downloading":
      updateButton.textContent = `Downloading ${Math.round(status.percent ?? 0)}%`;
      break;
    case "downloaded":
      updateButton.textContent = "Restart to update";
      break;
    case "not-available":
      updateButton.textContent = "Up to date";
      break;
    case "unsupported":
      updateButton.textContent = status.message?.startsWith("Portable") ? "Get latest version" : "Check for updates";
      break;
    case "error":
      updateButton.textContent = "Retry update check";
      break;
  }
  updateButton.title = status.message ?? updateButton.textContent;
  updateButton.setAttribute("aria-label", updateButton.textContent);
}

async function handleUpdateAction(): Promise<void> {
  try {
    if (updateStatus.state === "downloaded") {
      const installing = await window.desktop.installUpdate();
      if (!installing) showToast("The update is not ready to install yet.", true);
    } else if (updateStatus.state === "unsupported") {
      await window.desktop.openDownloadPage();
    } else {
      renderUpdateStatus(await window.desktop.checkForUpdates());
    }
  } catch (error) {
    showToast(`Update action failed: ${errorMessage(error)}`, true);
  }
}

function renderInputMonitor(gamepad: Gamepad | null, values: InputValues): void {
  if (!gamepad) {
    if (monitorSignature !== "") {
      monitorSignature = "";
      inputMonitor.replaceChildren();
    }
    inputCount.textContent = "—";
    monitorDescription.textContent = "Connect a controller to see its axes and buttons here.";
    emptyMonitor.hidden = false;
    return;
  }

  const sources = getSources(gamepad);
  const signature = `${gamepad.id}:${sources.join("|")}`;
  if (signature !== monitorSignature) {
    monitorSignature = signature;
    inputMonitor.replaceChildren();
    for (const sourceName of sources) {
      const isAxis = sourceName.startsWith("Axis ");
      const row = document.createElement("div");
      row.className = "input-row";
      row.dataset.inputName = sourceName;
      const kind = document.createElement("span");
      kind.className = "input-kind";
      kind.textContent = isAxis ? "AXIS" : "BUTTON";
      const label = document.createElement("span");
      label.className = "input-label";
      label.textContent = isAxis ? `Axis ${sourceName.slice(5)}` : `Button ${sourceName.slice(7)}`;
      const track = document.createElement("span");
      track.className = "input-track";
      const fill = document.createElement("span");
      fill.className = "input-fill";
      track.append(fill);
      const value = document.createElement("span");
      value.className = "input-value";
      value.textContent = "0";
      row.append(kind, label, track, value);
      inputMonitor.append(row);
    }
  }

  inputCount.textContent = String(sources.length);
  monitorDescription.textContent = `Live inputs from ${gamepad.id || `Controller ${gamepad.index + 1}`}.`;
  emptyMonitor.hidden = sources.length > 0;
  for (const sourceName of sources) {
    const row = inputMonitor.querySelector<HTMLElement>(`[data-input-name="${sourceName}"]`);
    const fill = row?.querySelector<HTMLElement>(".input-fill");
    const output = row?.querySelector<HTMLElement>(".input-value");
    if (!row || !fill || !output) continue;

    const raw = values[sourceName] ?? 0;
    const isAxis = sourceName.startsWith("Axis ");
    const percent = isAxis ? ((raw + 1) / 2) * 100 : raw * 100;
    fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    output.textContent = isAxis ? raw.toFixed(2) : `${Math.round(raw * 100)}%`;
    row.classList.toggle("is-active", isAxis ? Math.abs(raw) > 0.12 : raw > 0.5);
  }
}

function markDirty(): void {
  saveStatus.textContent = "Unsaved changes";
  saveStatus.classList.add("is-dirty");
}

function parseBoundedInteger(value: string | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function showToast(message: string, isError = false): void {
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 4000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getMidiStartError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "MIDI access was denied. Click Start again and approve the permission request.";
  }
  return `Could not start: ${errorMessage(error)}`;
}

void initialize();
