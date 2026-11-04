import { createDefaultSettings, normalizeSettings } from "../shared/settings";
import type { AppSettings, ControllerDevice, InputValues } from "../shared/types";
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

async function initialize(): Promise<void> {
  try {
    settings = normalizeSettings(await window.desktop.loadSettings());
  } catch (error) {
    showToast(`Ayarlar yüklenemedi: ${errorMessage(error)}`, true);
  }

  channelInput.value = String(settings.channel);
  renderPedals();
  refreshControllers();
  setMidiOptions([]);
  const midiPlaceholder = midiSelect.options.item(0);
  if (midiPlaceholder) midiPlaceholder.textContent = "Başlat'a basınca MIDI aranır";
  midiStatus.textContent = "MIDI izni için Başlat'a bas";
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
    addOption(controllerSelect, "", "Kontrolcü bulunamadı");
    controllerSelect.disabled = true;
    updateControllerStatus(null);
    renderPedals();
    if (running) {
      stop();
      showToast("Kontrolcü bağlantısı kesildi; MIDI aktarımı durduruldu.", true);
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
  controllerStatus.textContent = controller ? `${controller.id || `Kontrolcü ${controller.index + 1}`} bağlandı` : "Kontrolcü bekleniyor";
  controllerIndicator.classList.toggle("is-connected", controller !== null);
}

async function connectMidiAccess(): Promise<void> {
  if (!("requestMIDIAccess" in navigator)) {
    setMidiOptions([]);
    midiStatus.textContent = "Web MIDI desteklenmiyor";
    throw new Error("Bu Electron/Chromium sürümünde Web MIDI kullanılamıyor.");
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
    showToast("MIDI çıkışı bağlantısı kesildi.", true);
    stop();
  }
  updateMidiStatus();
  updateOverview();
}

function setMidiOptions(outputs: MIDIOutput[]): void {
  midiSelect.replaceChildren();
  if (outputs.length === 0) {
    addOption(midiSelect, "", "MIDI çıkışı bulunamadı");
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
    ? `${midiOutput.name || "MIDI çıkışı"} bağlı`
    : selected
      ? `${selected.name || "MIDI çıkışı"} hazır`
      : "MIDI çıkışı bekleniyor";
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
    if (!controller) throw new Error("Önce bir kontrolcü bağlayıp seç.");

    await connectMidiAccess();
    const selected = midiAccess?.outputs.get(midiSelect.value);
    if (!selected) throw new Error("Kullanılabilir bir MIDI çıkışı seç.");
    await selected.open();
    midiOutput = selected;
    settings.selectedMidiDevice = selected.id;
    lastSent.clear();
    running = true;
    updateRunningState();
    updateMidiStatus();
    updateOverview();
    showToast("MIDI çıkışı başlatıldı.");
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
    void midiOutput.close().catch((error: unknown) => showToast(`MIDI çıkışı kapatılamadı: ${errorMessage(error)}`, true));
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
    saveStatus.textContent = "Ayarlar kaydedildi";
    saveStatus.classList.remove("is-dirty");
    window.setTimeout(() => { saveStatus.textContent = ""; }, 1800);
  } catch (error) {
    showToast(`Ayarlar kaydedilemedi: ${errorMessage(error)}`, true);
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
    learn.textContent = learningIndex === index ? "Dinleniyor…" : "Girdi öğren";
    learn.classList.toggle("is-learning", learningIndex === index);
    learn.addEventListener("click", () => beginLearning(index));
    const source = document.createElement("span");
    source.className = gamepad ? "source-name is-hidden" : "source-name";
    source.dataset.sourceIndex = String(index);
    source.textContent = pedal.sourceName
      ? `${pedal.sourceType === "axis" ? "Eksen" : "Tuş"} ${pedal.sourceName.slice(pedal.sourceName.indexOf(" ") + 1)}`
      : "Henüz girdi eşlenmedi";
    const sourceSelect = document.createElement("select");
    sourceSelect.className = "source-select";
    sourceSelect.setAttribute("aria-label", `${pedal.name} için kontrolcü girdisi`);
    addOption(sourceSelect, "", "Girdi seç");
    for (const option of options) {
      addOption(sourceSelect, option, option.startsWith("Axis ") ? `Eksen ${option.slice(5)}` : `Tuş ${option.slice(7)}`);
    }
    if (pedal.sourceName && !options.includes(pedal.sourceName)) {
      addOption(
        sourceSelect,
        pedal.sourceName,
        `${pedal.sourceName.startsWith("Axis ") ? "Eksen" : "Tuş"} ${pedal.sourceName.slice(pedal.sourceName.indexOf(" ") + 1)} (çevrimdışı)`
      );
    }
    sourceSelect.value = pedal.sourceName;
    sourceSelect.addEventListener("change", () => setPedalSource(index, sourceSelect.value));
    const mode = document.createElement("select");
    mode.className = "mode-select";
    mode.setAttribute("aria-label", `${pedal.name} çıkış modu`);
    addOption(mode, "analog", "Analog");
    addOption(mode, "threshold", "Eşik");
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
    invert.setAttribute("aria-label", `${pedal.name} yönünü ters çevir`);
    invert.checked = pedal.invert;
    invert.addEventListener("change", () => {
      pedal.invert = invert.checked;
      markDirty();
    });
    invertLabel.append(invert, document.createTextNode("Ters"));
    controls.append(learn, source, sourceSelect, mode, invertLabel);

    const sliders = document.createElement("div");
    sliders.className = "sliders";
    sliders.append(
      createSlider("Ölü bölge", "deadzone", index, pedal.deadzonePct, 0, 50, "%", (value) => { pedal.deadzonePct = value; }),
      createSlider("Eşik seviyesi", "threshold", index, pedal.thresholdPct, 5, 99, "%", (value) => { pedal.thresholdPct = value; })
    );
    if (options.length === 0) {
      learn.disabled = true;
      learn.title = "Girdi eşlemek için önce bir kontrolcü bağla";
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
    showToast("Girdi öğrenmek için önce bir kontrolcü bağla ve seç.", true);
    return;
  }

  cancelLearning();
  learningBaseline = readInputs(gamepad);
  learningIndex = index;
  renderPedals();
  sessionDetail.textContent = `${settings.pedals[index].name} için bir tuşa bas veya ekseni hareket ettir`;
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
      showToast("Kontrolcü bağlantısı kesildi; MIDI aktarımı durduruldu.", true);
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
    showToast(`${sourceName.startsWith("Axis ") ? "Eksen" : "Tuş"} eşlendi.`);
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
    showToast(`MIDI mesajı gönderilemedi: ${errorMessage(error)}`, true);
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
  runningStatus.textContent = running ? "ÇALIŞIYOR" : "DURDURULDU";
  runningDot.classList.toggle("is-running", running);
  sessionState.classList.toggle("is-running", running);
}

function updateOverview(): void {
  const connected = getSelectedController() !== null;
  const mapped = settings.pedals.filter((pedal) => pedal.sourceName !== "").length;
  mappingCount.textContent = String(mapped);
  monitorMappingCount.textContent = String(mapped);

  if (running) {
    sessionDetail.textContent = "Kontrolcü verisi MIDI’ye aktarılıyor";
  } else if (learningIndex !== null) {
    sessionDetail.textContent = `${settings.pedals[learningIndex].name} girdisi bekleniyor`;
  } else if (!connected) {
    sessionDetail.textContent = "Başlamak için kontrolcünü bağla";
  } else if (mapped < settings.pedals.length) {
    sessionDetail.textContent = `${settings.pedals.length - mapped} pedal girdisi eşlenmeyi bekliyor`;
  } else {
    sessionDetail.textContent = "Her şey hazır, müziğe başlayabilirsin";
  }

  startButton.title = !connected
    ? "Başlamak için önce bir kontrolcü bağla"
    : !midiSelect.value
      ? "Başlamak için bir MIDI çıkışı seç"
      : "MIDI aktarımını başlat";
}

function renderInputMonitor(gamepad: Gamepad | null, values: InputValues): void {
  if (!gamepad) {
    if (monitorSignature !== "") {
      monitorSignature = "";
      inputMonitor.replaceChildren();
    }
    inputCount.textContent = "—";
    monitorDescription.textContent = "Kontrolcünü bağla; eksen ve tuş sinyallerin burada görünsün.";
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
      kind.textContent = isAxis ? "EKSEN" : "TUŞ";
      const label = document.createElement("span");
      label.className = "input-label";
      label.textContent = isAxis ? `Eksen ${sourceName.slice(5)}` : `Tuş ${sourceName.slice(7)}`;
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
  monitorDescription.textContent = `${gamepad.id || `Kontrolcü ${gamepad.index + 1}`} üzerinden okunan anlık girdiler.`;
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
  saveStatus.textContent = "Kaydedilmedi";
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
    return "MIDI izni verilmedi. Başlat'a yeniden basıp izin isteğini onayla.";
  }
  return `Başlatılamadı: ${errorMessage(error)}`;
}

void initialize();
