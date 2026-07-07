# -*- coding: utf-8 -*-
"""Controller → MIDI Pedal"""
from __future__ import annotations
import tkinter as tk
from tkinter import messagebox
import threading, time, json, os, sys

try:
    import pygame
except ImportError:
    messagebox.showerror("Error", "pygame not installed. Run install.bat"); raise SystemExit
try:
    import mido, mido.backends.rtmidi
except ImportError:
    messagebox.showerror("Error", "mido/python-rtmidi not installed. Run install.bat"); raise SystemExit
try:
    import customtkinter as ctk
except ImportError:
    messagebox.showerror("Error", "customtkinter not installed.\npython -m pip install customtkinter"); raise SystemExit

ctk.set_default_color_theme("blue")

# ══════════════════════════════════════════════════════════════════
# THEMES
# ══════════════════════════════════════════════════════════════════
THEMES = {
    "white": {
        "label": "White",
        "mode": "light",
        "bg":       "#ffffff",
        "surface":  "#fdf6eb",
        "surf2":    "#f8f1e2",
        "border":   "#d4c3a3",
        "accent":   "#d4942a",
        "accent2":  "#f0b840",
        "green":    "#2ea84e",
        "green_d":  "#d4eeda",
        "red":      "#c03030",
        "txt":      "#3a2e20",
        "txt_dim":  "#7a7060",
        "txt_hi":   "#0a0806",
        "dz":       "#c03030",
    },
    "gold": {
        "label": "Gold",
        "mode": "dark",
        "bg":       "#0c0b10",
        "surface":  "#161420",
        "surf2":    "#1e1c2c",
        "border":   "#3a3020",
        "accent":   "#d4942a",
        "accent2":  "#f0b840",
        "green":    "#2ea84e",
        "green_d":  "#1a3a20",
        "red":      "#d45050",
        "txt":      "#f0e8d0",
        "txt_dim":  "#80704a",
        "txt_hi":   "#fff8e0",
        "dz":       "#e06040",
    },
}
_T = "gold"  # active theme key

def C(k): return THEMES[_T][k]

def set_theme(name: str):
    global _T
    if name in THEMES:
        _T = name
        ctk.set_appearance_mode(THEMES[name]["mode"])

set_theme(_T)

# ══════════════════════════════════════════════════════════════════
# i18n
# ══════════════════════════════════════════════════════════════════
STRINGS = {
"tr": {
    "app_title":    "Controller → MIDI Pedal",
    "controller":   "Kontrolcü",
    "midi_out":     "MIDI Çıkışı",
    "midi_ch":      "Kanal",
    "start":        "BAŞLAT",
    "stop":         "DURDUR",
    "save":         "Kaydet",
    "ready":        "Hazır",
    "running":      "Çalışıyor",
    "stopped":      "Durduruldu",
    "saved":        "Kaydedildi",
    "loaded":       "Yüklendi",
    "click_assign": "Tıkla & Bas",
    "listening":    "Dinleniyor…",
    "analog":       "Analog",
    "threshold":    "Eşik",
    "invert":       "Ters çevir",
    "deadzone":     "Ölü Nokta",
    "settings":     "Ayarlar",
    "no_ctrl":      "Kontrolcü seçilmedi",
    "no_midi":      "MIDI portu seçilmedi",
    "no_map":       "Atama yapılmadı",
    "n_found":      "kontrolcü bulundu",
},
"en": {
    "app_title":    "Controller → MIDI Pedal",
    "controller":   "Controller",
    "midi_out":     "MIDI Output",
    "midi_ch":      "Channel",
    "start":        "START",
    "stop":         "STOP",
    "save":         "Save",
    "ready":        "Ready",
    "running":      "Running",
    "stopped":      "Stopped",
    "saved":        "Saved",
    "loaded":       "Loaded",
    "click_assign": "Click & Press",
    "listening":    "Listening…",
    "analog":       "Analog",
    "threshold":    "Threshold",
    "invert":       "Invert",
    "deadzone":     "Dead Zone",
    "settings":     "Settings",
    "no_ctrl":      "No controller selected",
    "no_midi":      "No MIDI port selected",
    "no_map":       "No mapping added",
    "n_found":      "controller(s) found",
},
}
_lang = "tr"
def L(k): return STRINGS[_lang].get(k, k)
def set_lang(l):
    global _lang
    if l in STRINGS: _lang = l

# ══════════════════════════════════════════════════════════════════
# CONSTANTS
# ══════════════════════════════════════════════════════════════════
PEDALS      = [("Sustain", 64), ("Sostenuto", 66), ("Soft", 67)]
PEDAL_COLS  = ["#d4942a", "#5b9bd4", "#8b6ed4"]
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
DEFAULT_DZ  = 0.10
AXIS_THR    = 0.50
DETECT_THR  = 0.22

# ══════════════════════════════════════════════════════════════════
# MAPPING
# ══════════════════════════════════════════════════════════════════
class Mapping:
    def __init__(self, input_type, index,
                 axis_mode="analog", axis_threshold=AXIS_THR,
                 axis_deadzone=DEFAULT_DZ, axis_inverted=False):
        self.input_type    = input_type
        self.index         = index
        self.axis_mode     = axis_mode
        self.axis_threshold = axis_threshold
        self.axis_deadzone  = axis_deadzone
        self.axis_inverted  = axis_inverted

    def label(self):
        if self.input_type == "button":
            return f"Button {self.index}"
        inv  = " ↕" if self.axis_inverted else ""
        mode = L("analog") if self.axis_mode == "analog" else L("threshold")
        return f"Axis {self.index}  ·  {mode}{inv}"

    def to_dict(self):
        return dict(input_type=self.input_type, index=self.index,
                    axis_mode=self.axis_mode, axis_threshold=self.axis_threshold,
                    axis_deadzone=self.axis_deadzone, axis_inverted=self.axis_inverted)

    @staticmethod
    def from_dict(d):
        return Mapping(d["input_type"], d["index"],
                       d.get("axis_mode","analog"), d.get("axis_threshold", AXIS_THR),
                       d.get("axis_deadzone", DEFAULT_DZ), d.get("axis_inverted", False))

# ══════════════════════════════════════════════════════════════════
# LEVEL BAR — slim horizontal canvas
# ══════════════════════════════════════════════════════════════════
class LevelBar(tk.Canvas):
    BW, BH = 180, 12

    def __init__(self, parent, color="#d4942a"):
        super().__init__(parent, width=self.BW, height=self.BH,
                         highlightthickness=0)
        self._val   = 0
        self._dz    = DEFAULT_DZ
        self._color = color
        self._redraw()

    def set_value(self, v: int, dz: float):
        if v != self._val or abs(dz - self._dz) > 0.005:
            self._val, self._dz = v, dz
            self._redraw()

    def refresh_theme(self):
        self.configure(bg=C("surf2"))
        self._redraw()

    def _redraw(self):
        self.configure(bg=C("surf2"))
        self.delete("all")
        W, H = self.BW, self.BH
        r = 4
        # track
        self.create_rectangle(0, 0, W, H, fill=C("green_d"), outline=C("border"), width=1)
        # fill
        fw = int(self._val / 127 * W)
        if fw > 2:
            self.create_rectangle(1, 1, fw, H-1, fill=self._color, outline="")
        # dead zone lines (two symmetric markers)
        dz_px = int(self._dz * W)
        for x in [dz_px, W - dz_px]:
            if 0 < x < W:
                self.create_line(x, 0, x, H, fill=C("dz"), width=1, dash=(3, 2))
        # pct text
        if self._val > 0:
            pct = int(self._val / 127 * 100)
            self.create_text(W - 4, H // 2, text=f"{pct}%",
                             font=("Consolas", 8), fill=C("txt_hi"), anchor="e")

# ══════════════════════════════════════════════════════════════════
# PEDAL CARD — slim horizontal row
# ══════════════════════════════════════════════════════════════════
class PedalCard(ctk.CTkFrame):
    def __init__(self, parent, idx: int, app: "App"):
        super().__init__(parent, corner_radius=10,
                         border_width=1,
                         fg_color=C("surface"),
                         border_color=C("border"))
        self.idx      = idx
        self.app      = app
        self.mapping: Mapping | None = None
        self._col     = PEDAL_COLS[idx]
        self._listen  = False
        self._midi    = 0
        self._expanded = False
        self._build()

    # ─────────────────────────────────────────────────────────────
    def _build(self):
        name, cc = PEDALS[self.idx]

        # top color stripe
        tk.Frame(self, height=2, bg=self._col).pack(fill="x")

        # ── main row ─────────────────────────────────────────────
        row = ctk.CTkFrame(self, fg_color="transparent")
        row.pack(fill="x", padx=16, pady=(8, 6))

        # pedal name
        ctk.CTkLabel(row,
                     text=f"{name}",
                     font=ctk.CTkFont("Segoe UI", 13, weight="bold"),
                     text_color=self._col,
                     width=90, anchor="w").pack(side="left")

        # CC badge
        ctk.CTkLabel(row,
                     text=f"CC{cc}",
                     font=ctk.CTkFont("Consolas", 10),
                     text_color=C("txt_dim"),
                     fg_color=C("surf2"),
                     corner_radius=4,
                     width=36).pack(side="left", padx=(0, 10))

        # assign button — fills remaining space
        self._assign_btn = ctk.CTkButton(
            row,
            text=L("click_assign"),
            font=ctk.CTkFont("Segoe UI", 12),
            height=34, corner_radius=8,
            fg_color=C("surf2"), hover_color=C("border"),
            text_color=C("txt_dim"),
            border_width=1, border_color=C("border"),
            command=self._on_assign)
        self._assign_btn.pack(side="left", fill="x", expand=True, padx=(0, 6))

        # level bar (axis only — hidden until assigned)
        self._bar = LevelBar(row, color=self._col)
        # packed when axis assigned

        # clear button (hidden until assigned)
        self._clear_btn = ctk.CTkButton(
            row, text="✕",
            font=ctk.CTkFont("Segoe UI", 12, weight="bold"),
            width=34, height=34, corner_radius=8,
            fg_color=C("surf2"), hover_color=C("red"),
            text_color=C("red"),
            border_width=1, border_color=C("border"),
            command=self._on_clear)

        # settings toggle
        self._exp_btn = ctk.CTkButton(
            row, text="⚙",
            font=ctk.CTkFont("Segoe UI", 13),
            width=34, height=34, corner_radius=8,
            fg_color="transparent", hover_color=C("surf2"),
            text_color=C("txt_dim"),
            command=self._toggle_settings)
        self._exp_btn.pack(side="left", padx=(0, 0))

        # ── settings panel (collapsed by default) ────────────────
        self._settings = ctk.CTkFrame(self,
                                      fg_color=C("surf2"),
                                      corner_radius=8,
                                      border_width=1,
                                      border_color=C("border"))
        self._build_settings()

    # ─────────────────────────────────────────────────────────────
    def _build_settings(self):
        f = self._settings
        for w in f.winfo_children():
            w.destroy()

        inner = ctk.CTkFrame(f, fg_color="transparent")
        inner.pack(fill="x", padx=14, pady=10)
        inner.columnconfigure((0, 2), weight=1)

        # ── Mode ─────────────────────────────────────────────────
        self._mode_var = tk.StringVar(value=L("analog"))
        ctk.CTkLabel(inner, text="Mode",
                     font=ctk.CTkFont("Segoe UI", 10),
                     text_color=C("txt_dim")).grid(row=0, column=0, sticky="w")
        self._mode_seg = ctk.CTkSegmentedButton(
            inner,
            values=[L("analog"), L("threshold")],
            variable=self._mode_var,
            font=ctk.CTkFont("Segoe UI", 10),
            height=26, corner_radius=6,
            fg_color=C("surface"),
            selected_color=self._col,
            selected_hover_color=C("accent2"),
            unselected_color=C("surface"),
            unselected_hover_color=C("border"),
            text_color=C("txt"),
            command=self._on_mode)
        self._mode_seg.grid(row=0, column=1, columnspan=3, sticky="e", pady=(0, 6))

        # ── Dead zone ─────────────────────────────────────────────
        ctk.CTkLabel(inner, text=L("deadzone"),
                     font=ctk.CTkFont("Segoe UI", 10),
                     text_color=C("txt_dim")).grid(row=1, column=0, sticky="w")
        self._dz_lbl = ctk.CTkLabel(inner, text="0.10",
                                     font=ctk.CTkFont("Consolas", 10),
                                     text_color=self._col)
        self._dz_lbl.grid(row=1, column=3, sticky="e")
        self._dz_var = tk.DoubleVar(value=DEFAULT_DZ)
        self._dz_var.trace_add("write", self._on_dz)
        ctk.CTkSlider(inner,
                      variable=self._dz_var,
                      from_=0.0, to=0.50,
                      number_of_steps=50, height=14,
                      button_color=self._col,
                      button_hover_color=C("accent2"),
                      progress_color=self._col,
                      fg_color=C("surface"),
                      ).grid(row=2, column=0, columnspan=4, sticky="ew", pady=(0, 6))

        # ── Threshold (hidden in analog mode) ─────────────────────
        self._thr_frame = ctk.CTkFrame(inner, fg_color="transparent")
        self._thr_frame.grid(row=3, column=0, columnspan=4, sticky="ew")
        ctk.CTkLabel(self._thr_frame, text=L("threshold"),
                     font=ctk.CTkFont("Segoe UI", 10),
                     text_color=C("txt_dim")).pack(side="left")
        self._thr_lbl = ctk.CTkLabel(self._thr_frame, text="0.50",
                                      font=ctk.CTkFont("Consolas", 10),
                                      text_color=self._col)
        self._thr_lbl.pack(side="right")
        self._thr_var = tk.DoubleVar(value=AXIS_THR)
        self._thr_var.trace_add("write", self._on_thr)
        self._thr_slider = ctk.CTkSlider(inner,
                             variable=self._thr_var,
                             from_=0.05, to=0.99,
                             number_of_steps=94, height=14,
                             button_color=self._col,
                             button_hover_color=C("accent2"),
                             progress_color=self._col,
                             fg_color=C("surface"))
        # packed conditionally

        # ── Invert ────────────────────────────────────────────────
        inv_row = ctk.CTkFrame(inner, fg_color="transparent")
        inv_row.grid(row=4, column=0, columnspan=4, sticky="ew", pady=(4, 0))
        ctk.CTkLabel(inv_row, text=L("invert"),
                     font=ctk.CTkFont("Segoe UI", 10),
                     text_color=C("txt_dim")).pack(side="left")
        self._inv_var = tk.BooleanVar(value=False)
        ctk.CTkSwitch(inv_row, text="",
                      variable=self._inv_var,
                      width=40, height=20,
                      button_color=self._col,
                      progress_color=self._col,
                      command=self._on_inv).pack(side="right")

        self._sync_settings()

    def _on_mode(self, val=None):
        is_thr = (self._mode_var.get() == L("threshold"))
        if is_thr:
            self._thr_frame.grid()
            self._thr_slider.grid(row=5, column=0, columnspan=4, sticky="ew", pady=(0, 4))
        else:
            self._thr_frame.grid_remove()
            self._thr_slider.grid_remove()
        if self.mapping and self.mapping.input_type == "axis":
            self.mapping.axis_mode = "threshold" if is_thr else "analog"

    def _on_dz(self, *_):
        v = round(self._dz_var.get(), 2)
        if hasattr(self, "_dz_lbl"): self._dz_lbl.configure(text=f"{v:.2f}")
        if self.mapping and self.mapping.input_type == "axis":
            self.mapping.axis_deadzone = v
        self._bar.set_value(self._midi, v)

    def _on_thr(self, *_):
        v = round(self._thr_var.get(), 2)
        if hasattr(self, "_thr_lbl"): self._thr_lbl.configure(text=f"{v:.2f}")
        if self.mapping and self.mapping.input_type == "axis":
            self.mapping.axis_threshold = v

    def _on_inv(self):
        if self.mapping and self.mapping.input_type == "axis":
            self.mapping.axis_inverted = self._inv_var.get()

    def _sync_settings(self):
        if not self.mapping or self.mapping.input_type != "axis":
            return
        m = self.mapping
        self._dz_var.set(m.axis_deadzone)
        self._thr_var.set(m.axis_threshold)
        self._inv_var.set(m.axis_inverted)
        disp = L("threshold") if m.axis_mode == "threshold" else L("analog")
        self._mode_var.set(disp)
        self._mode_seg.set(disp)
        self._on_mode()

    # ─────────────────────────────────────────────────────────────
    def _toggle_settings(self):
        self._expanded = not self._expanded
        if self._expanded:
            self._settings.pack(fill="x", padx=10, pady=(0, 10))
            self._exp_btn.configure(text_color=C("accent"))
        else:
            self._settings.pack_forget()
            self._exp_btn.configure(text_color=C("txt_dim"))

    # ─────────────────────────────────────────────────────────────
    def _on_assign(self):
        if self._listen: return
        js = self.app._get_joystick()
        if not js:
            self.app._set_status(L("no_ctrl")); return
        self._listen = True
        self._assign_btn.configure(text=L("listening"),
                                   text_color=self._col,
                                   border_color=self._col)
        baseline = {}
        pygame.event.pump()
        for i in range(js.get_numaxes()):
            baseline[i] = js.get_axis(i)

        def detect():
            while self._listen:
                pygame.event.pump()
                for i in range(js.get_numbuttons()):
                    if js.get_button(i):
                        self.after(0, lambda: self._finish(Mapping("button", i)))
                        time.sleep(0.15); return
                for i in range(js.get_numaxes()):
                    v = js.get_axis(i)
                    diff = v - baseline.get(i, 0)
                    if abs(diff) > DETECT_THR:
                        dz = self._dz_var.get() if hasattr(self, "_dz_var") else DEFAULT_DZ
                        m  = Mapping("axis", i, axis_deadzone=dz, axis_inverted=diff < 0)
                        self.after(0, lambda _m=m: self._finish(_m))
                        time.sleep(0.02); return
                time.sleep(0.02)

        threading.Thread(target=detect, daemon=True).start()

    def _finish(self, m: Mapping):
        self._listen = False
        self.set_mapping(m)

    def _on_clear(self):
        self._midi = 0
        self.set_mapping(None)

    # ─────────────────────────────────────────────────────────────
    def set_mapping(self, m: Mapping | None):
        self.mapping = m
        if m is None:
            self._assign_btn.configure(text=L("click_assign"),
                                       text_color=C("txt_dim"),
                                       border_color=C("border"),
                                       fg_color=C("surf2"))
            self._clear_btn.pack_forget()
            self._bar.pack_forget()
        else:
            self._assign_btn.configure(text=m.label(),
                                       text_color=C("txt_hi"),
                                       border_color=self._col,
                                       fg_color=C("surf2"))
            self._clear_btn.pack(side="right", padx=(4, 0))
            if m.input_type == "axis":
                self._bar.pack(side="right", padx=(6, 4))
            else:
                self._bar.pack_forget()
        self._build_settings()
        if self._expanded:
            self._settings.pack(fill="x", padx=10, pady=(0, 10))

    def update_value(self, v: int):
        self._midi = v
        dz = self.mapping.axis_deadzone if (self.mapping and self.mapping.input_type == "axis") else DEFAULT_DZ
        self._bar.set_value(v, dz)
        if self.mapping and self.mapping.input_type == "button":
            self._assign_btn.configure(
                fg_color=self._col if v > 0 else C("surf2"),
                text_color=C("bg") if v > 0 else C("txt_hi"))

    def refresh_theme(self):
        self.configure(fg_color=C("surface"), border_color=C("border"))
        self._assign_btn.configure(fg_color=C("surf2"), hover_color=C("border"),
                                   border_color=C("border"))
        if self.mapping:
            self._assign_btn.configure(border_color=self._col, text_color=C("txt_hi"))
        else:
            self._assign_btn.configure(text_color=C("txt_dim"))
        self._clear_btn.configure(fg_color=C("surf2"), hover_color=C("red"),
                                   text_color=C("red"), border_color=C("border"))
        self._exp_btn.configure(hover_color=C("surf2"),
                                text_color=C("accent") if self._expanded else C("txt_dim"))
        self._settings.configure(fg_color=C("surf2"), border_color=C("border"))
        self._bar.refresh_theme()
        self._build_settings()
        if self._expanded:
            self._settings.pack(fill="x", padx=10, pady=(0, 10))

# ══════════════════════════════════════════════════════════════════
# MAIN APP
# ══════════════════════════════════════════════════════════════════
class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.configure(fg_color=C("bg"))
        self.title("Controller → MIDI Pedal")
        self.geometry("860x680")
        self.minsize(700, 500)
        self.resizable(True, True)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        pygame.init()
        pygame.joystick.init()

        self.joystick   = None
        self.midi_out   = None
        self.running    = False
        self._thread    = None
        self._last_sent = [-1, -1, -1]

        self._ctrl_var  = tk.StringVar()
        self._midi_var  = tk.StringVar()
        self._chan_var   = tk.IntVar(value=1)
        self._lang_var  = tk.StringVar(value="TR")
        self._settings_open = False

        self._loaded   = [None, None, None]
        self._pend_ctrl = ""
        self._pend_midi = ""
        self._pend_chan  = 1

        self._load_config()
        self._build_ui()
        self._refresh_controllers()
        self._refresh_midi_ports()
        self.after(150, self._apply_pending)
        self.after(500, self._status_loop)

    # ─────────────────────────────────────────────────────────────
    def _build_ui(self):
        self.columnconfigure(0, weight=1)
        self.rowconfigure(2, weight=1)  # scroll area grows

        # ── HEADER ───────────────────────────────────────────────
        hdr = ctk.CTkFrame(self, fg_color=C("surface"),
                           corner_radius=0, height=56)
        hdr.grid(row=0, column=0, sticky="ew")
        hdr.grid_propagate(False)
        hdr.columnconfigure(1, weight=1)

        ctk.CTkLabel(hdr, text="  MIDI PEDAL",
                     font=ctk.CTkFont("Segoe UI", 20, weight="bold"),
                     text_color=C("accent")).grid(row=0, column=0, padx=24, pady=14, sticky="w")
        self._hdr = hdr
        self._title_lbl = hdr.winfo_children()[-1]

        ctrl_bar = ctk.CTkFrame(hdr, fg_color="transparent")
        ctrl_bar.grid(row=0, column=2, padx=16, pady=10, sticky="e")

        self._settings_btn = ctk.CTkButton(
            ctrl_bar, text=L("settings"),
            font=ctk.CTkFont("Segoe UI", 11),
            width=100, height=30, corner_radius=8,
            fg_color=C("surf2"), hover_color=C("accent"),
            text_color=C("txt"),
            command=self._toggle_settings)
        self._settings_btn.pack(side="left", padx=(0, 8))

        # ── SETTINGS PANEL ────────────────────────────────────────
        self._settings_frame = ctk.CTkFrame(self, fg_color=C("surf2"),
                                            corner_radius=0)
        self._settings_frame.grid(row=1, column=0, sticky="ew")
        self._settings_frame.grid_remove()
        self._dev_frame = self._settings_frame

        top_row = ctk.CTkFrame(self._settings_frame, fg_color="transparent")
        top_row.pack(fill="x", padx=20, pady=(12, 6))

        ctk.CTkLabel(top_row, text=L("settings"),
                     font=ctk.CTkFont("Segoe UI", 13, weight="bold"),
                     text_color=C("txt_hi")).pack(side="left")

        self._settings_content = ctk.CTkFrame(self._settings_frame, fg_color="transparent")
        self._settings_content.pack(fill="x", padx=20, pady=(0, 12))
        self._settings_content.columnconfigure(0, weight=3)
        self._settings_content.columnconfigure(4, weight=3)

        self._lang_frame = ctk.CTkFrame(self._settings_content, fg_color="transparent")
        self._lang_frame.grid(row=0, column=0, columnspan=8, sticky="ew", padx=(20, 0), pady=(0, 12))

        ctk.CTkLabel(self._lang_frame, text="Dil",
                     font=ctk.CTkFont("Segoe UI", 10),
                     text_color=C("txt_dim")).pack(anchor="w")
        self._lang_seg = ctk.CTkSegmentedButton(
            self._lang_frame,
            values=["TR", "EN"],
            variable=self._lang_var,
            font=ctk.CTkFont("Segoe UI", 11),
            height=30, width=120, corner_radius=8,
            fg_color=C("bg"),
            selected_color=C("accent"),
            selected_hover_color=C("accent2"),
            unselected_color=C("bg"),
            unselected_hover_color=C("border"),
            text_color=C("txt"),
            command=self._on_lang)
        self._lang_seg.pack(anchor="w", pady=(2, 0))

        # controller label + combo + refresh
        self._ctrl_lbl = ctk.CTkLabel(self._settings_content, text=L("controller"),
                     font=ctk.CTkFont("Segoe UI", 10),
                     text_color=C("txt_dim"))
        self._ctrl_lbl.grid(row=1, column=0, padx=(20, 4), pady=(8, 0), sticky="sw")

        self._ctrl_cb = ctk.CTkComboBox(self._settings_content,
                         variable=self._ctrl_var, values=[],
                         state="readonly",
                         font=ctk.CTkFont("Segoe UI", 11),
                         height=30, corner_radius=8,
                         fg_color=C("bg"), border_color=C("border"),
                         button_color=C("border"), button_hover_color=C("accent"),
                         dropdown_fg_color=C("surf2"),
                         dropdown_hover_color=C("border"),
                         text_color=C("txt"))
        self._ctrl_cb.grid(row=3, column=0, columnspan=2,
                           padx=(20, 0), pady=(0, 10), sticky="ew")

        self._ctrl_ref = ctk.CTkButton(self._settings_content, text="↺",
                  width=30, height=30, corner_radius=8,
                  font=ctk.CTkFont("Segoe UI", 12),
                  fg_color=C("bg"), hover_color=C("accent"),
                  text_color=C("txt_dim"),
                  command=self._refresh_controllers)
        self._ctrl_ref.grid(row=3, column=2, padx=(4, 16), pady=(0, 10))

        # divider
        ctk.CTkFrame(self._settings_content, width=1, fg_color=C("border")).grid(
            row=4, column=3, rowspan=4, sticky="ns", pady=10)

        # MIDI label + combo + refresh
        self._midi_lbl = ctk.CTkLabel(self._settings_content, text=L("midi_out"),
                     font=ctk.CTkFont("Segoe UI", 10),
                     text_color=C("txt_dim"))
        self._midi_lbl.grid(row=4, column=0, padx=(20, 4), pady=(8, 0), sticky="sw")

        self._midi_cb = ctk.CTkComboBox(self._settings_content,
                         variable=self._midi_var, values=[],
                         state="readonly",
                         font=ctk.CTkFont("Segoe UI", 11),
                         height=30, corner_radius=8,
                         fg_color=C("bg"), border_color=C("border"),
                         button_color=C("border"), button_hover_color=C("accent"),
                         dropdown_fg_color=C("surf2"),
                         dropdown_hover_color=C("border"),
                         text_color=C("txt"))
        self._midi_cb.grid(row=5, column=0, columnspan=2,
                           padx=(20, 0), pady=(0, 10), sticky="ew")

        self._midi_ref = ctk.CTkButton(self._settings_content, text="↺",
                  width=30, height=30, corner_radius=8,
                  font=ctk.CTkFont("Segoe UI", 12),
                  fg_color=C("bg"), hover_color=C("accent"),
                  text_color=C("txt_dim"),
                  command=self._refresh_midi_ports)
        self._midi_ref.grid(row=5, column=2, padx=(4, 16), pady=(0, 10))

        # channel
        self._ch_lbl = ctk.CTkLabel(self._settings_content, text=L("midi_ch"),
                     font=ctk.CTkFont("Segoe UI", 10),
                     text_color=C("txt_dim"))
        self._ch_lbl.grid(row=4, column=4, padx=(16, 0), pady=(8, 0), sticky="sw")

        ctk.CTkEntry(self._settings_content, textvariable=self._chan_var,
                     width=52, height=30, corner_radius=8,
                     fg_color=C("bg"), border_color=C("border"),
                     font=ctk.CTkFont("Segoe UI", 11),
                     text_color=C("txt"), justify="center"
                     ).grid(row=5, column=4, padx=(16, 20), pady=(0, 10), sticky="w")

        # ── PEDAL CARDS (scrollable) ──────────────────────────────
        self._scroll = ctk.CTkScrollableFrame(
            self, fg_color=C("bg"), corner_radius=0,
            scrollbar_button_color=C("surf2"),
            scrollbar_button_hover_color=C("border"))
        self._scroll.grid(row=2, column=0, sticky="nsew")

        self._cards: list[PedalCard] = []
        for i in range(3):
            card = PedalCard(self._scroll, i, self)
            card.pack(fill="x", padx=24, pady=(14 if i == 0 else 0, 14))
            if i < len(self._loaded) and self._loaded[i]:
                card.set_mapping(self._loaded[i])
            self._cards.append(card)

        # ── FOOTER ───────────────────────────────────────────────
        foot = ctk.CTkFrame(self, fg_color=C("surface"),
                            corner_radius=0, height=60)
        foot.grid(row=3, column=0, sticky="ew")
        foot.grid_propagate(False)
        foot.columnconfigure(2, weight=1)
        self._foot = foot

        self._start_btn = ctk.CTkButton(
            foot, text=L("start"),
            font=ctk.CTkFont("Segoe UI", 13, weight="bold"),
            width=140, height=38, corner_radius=8,
            fg_color=C("accent"), hover_color=C("accent2"),
            text_color=C("bg"),
            command=self._start)
        self._start_btn.grid(row=0, column=0, padx=(24, 8), pady=11)

        self._stop_btn = ctk.CTkButton(
            foot, text=L("stop"),
            font=ctk.CTkFont("Segoe UI", 13, weight="bold"),
            width=140, height=38, corner_radius=8,
            fg_color=C("surf2"), hover_color=C("red"),
            text_color=C("txt_dim"),
            state="disabled",
            command=self._stop)
        self._stop_btn.grid(row=0, column=1, padx=(0, 20), pady=11)

        self._status_lbl = ctk.CTkLabel(
            foot, text=L("ready"),
            font=ctk.CTkFont("Segoe UI", 11),
            text_color=C("txt_dim"))
        self._status_lbl.grid(row=0, column=2, padx=8, pady=11, sticky="w")

        ctk.CTkButton(
            foot, text=L("save"),
            font=ctk.CTkFont("Segoe UI", 11),
            width=90, height=38, corner_radius=8,
            fg_color=C("surf2"), hover_color=C("border"),
            text_color=C("txt_dim"),
            command=self._save_config
        ).grid(row=0, column=3, padx=(0, 24), pady=11)

    # ─────────────────────────────────────────────────────────────
    # Device refresh
    # ─────────────────────────────────────────────────────────────
    def _refresh_controllers(self):
        pygame.joystick.quit(); pygame.joystick.init()
        names = []
        for i in range(pygame.joystick.get_count()):
            js = pygame.joystick.Joystick(i); js.init()
            names.append(f"{i}: {js.get_name()}")
        self._ctrl_cb.configure(values=names)
        self._restore_selection(names, self._ctrl_var.get(), kind="controller")
        self._set_status(f"{len(names)} {L('n_found')}")

    def _refresh_midi_ports(self):
        try:    ports = mido.get_output_names()
        except: ports = []
        self._midi_cb.configure(values=ports)
        self._restore_selection(ports, self._midi_var.get(), kind="midi")

    def _restore_selection(self, values, current, kind: str):
        if not values:
            if kind == "controller":
                self._ctrl_var.set("")
            else:
                self._midi_var.set("")
            return
        if current and current in values:
            if kind == "controller":
                self._ctrl_var.set(current)
            else:
                self._midi_var.set(current)
        else:
            if kind == "controller":
                self._ctrl_var.set(values[0])
            else:
                self._midi_var.set(values[0])

    def _get_joystick(self):
        sel = self._ctrl_var.get()
        if not sel: return None
        try:
            js = pygame.joystick.Joystick(int(sel.split(":")[0]))
            js.init(); return js
        except: return None

    # ─────────────────────────────────────────────────────────────
    # Transport
    # ─────────────────────────────────────────────────────────────
    def _start(self):
        if not any(c.mapping for c in self._cards):
            self._set_status(L("no_map")); return
        port = self._midi_var.get()
        if not port: self._set_status(L("no_midi")); return
        js = self._get_joystick()
        if not js: self._set_status(L("no_ctrl")); return
        try:
            self.midi_out = mido.open_output(port)
        except Exception as e:
            self._set_status(str(e)); return

        self.joystick   = js
        self._last_sent = [-1, -1, -1]
        self.running    = True
        self._start_btn.configure(state="disabled",
                                  fg_color=C("surf2"), text_color=C("txt_dim"))
        self._stop_btn.configure(state="normal",
                                 fg_color=C("red"), text_color=C("txt_hi"))
        self._set_status(f"{L('running')}  ·  {port}")
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()

    def _stop(self):
        self.running = False
        if self.midi_out:
            for i in range(3): self._send_val(i, 0)
            self.midi_out.close(); self.midi_out = None
        self._last_sent = [-1, -1, -1]
        self._start_btn.configure(state="normal",
                                  fg_color=C("accent"), text_color=C("bg"))
        self._stop_btn.configure(state="disabled",
                                 fg_color=C("surf2"), text_color=C("txt_dim"))
        for card in self._cards: card.update_value(0)
        self._set_status(L("stopped"))

    # ─────────────────────────────────────────────────────────────
    # Poll loop
    # ─────────────────────────────────────────────────────────────
    def _poll_loop(self):
        clk = pygame.time.Clock()
        while self.running:
            pygame.event.pump()
            for i, card in enumerate(self._cards):
                m = card.mapping
                if not m: continue
                try:   v = self._calc(m)
                except: continue
                if v != self._last_sent[i]:
                    self._last_sent[i] = v
                    self._send_val(i, v)
                    self.after(0, lambda c=card, _v=v: c.update_value(_v))
            clk.tick(120)

    def _calc(self, m: Mapping) -> int:
        if m.input_type == "button":
            return 127 if self.joystick.get_button(m.index) else 0
        raw = self.joystick.get_axis(m.index)
        if m.axis_inverted: raw = -raw
        dz = m.axis_deadzone
        if m.axis_mode == "analog":
            if raw <= dz: return 0
            return int(min(1.0, (raw - dz) / max(0.01, 1.0 - dz)) * 127)
        else:
            if raw <= dz: return 0
            return 127 if raw >= m.axis_threshold else 0

    def _send_val(self, idx, value):
        if not self.midi_out: return
        try:
            self.midi_out.send(mido.Message("control_change",
                channel=self._chan_var.get() - 1,
                control=PEDALS[idx][1], value=value))
        except: pass

    # ─────────────────────────────────────────────────────────────
    # Language
    # ─────────────────────────────────────────────────────────────
    def _toggle_settings(self):
        self._settings_open = not self._settings_open
        if self._settings_open:
            self._settings_frame.grid()
            self._settings_btn.configure(fg_color=C("accent"), text_color=C("bg"))
        else:
            self._settings_frame.grid_remove()
            self._settings_btn.configure(fg_color=C("surf2"), text_color=C("txt"))

    def _redraw_theme(self):
        self.configure(fg_color=C("bg"))
        self._hdr.configure(fg_color=C("surface"))
        self._title_lbl.configure(text_color=C("accent"))
        self._dev_frame.configure(fg_color=C("surf2"))
        self._scroll.configure(fg_color=C("bg"),
                               scrollbar_button_color=C("surf2"),
                               scrollbar_button_hover_color=C("border"))
        self._foot.configure(fg_color=C("surface"))

        self._lang_seg.configure(fg_color=C("surf2"),
                                   selected_color=C("accent"),
                                   selected_hover_color=C("accent2"),
                                   unselected_color=C("surf2"),
                                   unselected_hover_color=C("border"),
                                   text_color=C("txt"))

        for lbl in (self._ctrl_lbl, self._midi_lbl, self._ch_lbl):
            lbl.configure(text_color=C("txt_dim"))

        for cb in (self._ctrl_cb, self._midi_cb):
            cb.configure(fg_color=C("bg"), border_color=C("border"),
                         button_color=C("border"), button_hover_color=C("accent"),
                         dropdown_fg_color=C("surf2"),
                         dropdown_hover_color=C("border"),
                         text_color=C("txt"))

        for btn in (self._ctrl_ref, self._midi_ref, self._settings_btn):
            btn.configure(fg_color=C("bg"), hover_color=C("accent"),
                          text_color=C("txt_dim"))
        if self._settings_open:
            self._settings_btn.configure(fg_color=C("accent"), text_color=C("bg"))

        self._start_btn.configure(
            fg_color=C("surf2") if not self.running else C("surf2"),
            text_color=C("txt_dim") if not self.running else C("txt_dim"))
        if not self.running:
            self._start_btn.configure(fg_color=C("accent"), text_color=C("bg"))
        else:
            self._stop_btn.configure(fg_color=C("red"), text_color=C("txt_hi"))

        self._status_lbl.configure(text_color=C("txt_dim"))

        for card in self._cards:
            card.refresh_theme()

    def _on_lang(self, val=None):
        lang = (val or self._lang_var.get()).lower()
        set_lang(lang)
        self.title(L("app_title"))
        self._start_btn.configure(text=L("start"))
        self._stop_btn.configure(text=L("stop"))
        self._status_lbl.configure(text=L("ready"))
        self._ctrl_lbl.configure(text=L("controller"))
        self._midi_lbl.configure(text=L("midi_out"))
        self._ch_lbl.configure(text=L("midi_ch"))
        self._settings_btn.configure(text=L("settings"))
        for card in self._cards:
            if not card.mapping:
                card._assign_btn.configure(text=L("click_assign"))
            card._exp_btn.configure(
                text_color=C("accent") if card._expanded else C("txt_dim"))
            card._build_settings()
            if card._expanded:
                card._settings.pack(fill="x", padx=10, pady=(0, 10))

    # ─────────────────────────────────────────────────────────────
    # Config
    # ─────────────────────────────────────────────────────────────
    def _save_config(self):
        data = {
            "lang":         self._lang_var.get().lower(),
            "theme":        _T,
            "controller":   self._ctrl_var.get(),
            "midi_port":    self._midi_var.get(),
            "midi_channel": self._chan_var.get(),
            "mappings":     [c.mapping.to_dict() if c.mapping else None
                             for c in self._cards],
        }
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        self._set_status(L("saved"))

    def _load_config(self):
        if not os.path.exists(CONFIG_FILE): return
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("lang") in STRINGS:
                set_lang(data["lang"])
                self._lang_var.set(data["lang"].upper())
            if data.get("theme") in THEMES:
                set_theme(data["theme"])
                raw = data.get("mappings", [None]*3)
            self._loaded = [Mapping.from_dict(d) if d else None
                            for d in (raw + [None]*3)[:3]]
            self._pend_ctrl = data.get("controller", "")
            self._pend_midi = data.get("midi_port",  "")
            self._pend_chan  = data.get("midi_channel", 1)
        except: pass

    def _apply_pending(self):
        try:
            self._refresh_controllers()
            self._refresh_midi_ports()
            if self._pend_ctrl in (self._ctrl_cb.cget("values") or []):
                self._ctrl_cb.set(self._pend_ctrl)
            if self._pend_midi in (self._midi_cb.cget("values") or []):
                self._midi_cb.set(self._pend_midi)
            self._chan_var.set(self._pend_chan)
            self._set_status(L("loaded"))
        except: pass

    # ─────────────────────────────────────────────────────────────
    def _set_status(self, msg):
        self._status_lbl.configure(text=msg)

    def _status_loop(self):
        if self.running and self.joystick:
            self._set_status(f"{L('running')}  ·  {self.joystick.get_name()}")
        self.after(500, self._status_loop)

    def _on_close(self):
        self._stop(); pygame.quit(); self.destroy()


# ══════════════════════════════════════════════════════════════════
def main():
    App().mainloop()

if __name__ == "__main__":
    main()
