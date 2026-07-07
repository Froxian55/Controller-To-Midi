using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows.Input;
using System.Windows.Threading;
using ControllerToMidi3.Models;
using ControllerToMidi3.Services;

namespace ControllerToMidi3.ViewModels;

public class MainViewModel : BaseViewModel, IDisposable
{
    private static readonly (string Name, int Cc)[] PedalDefs =
    {
        ("Sustain", 64), ("Sostenuto", 66), ("Soft", 67)
    };

    private readonly IMidiService _midi;
    private readonly IControllerService _ctrl;
    private readonly ISettingsService _settings;
    private readonly DispatcherTimer _timer;
    private readonly Dictionary<int, int> _lastSent = new();
    private readonly Dictionary<string, double> _learnBaseline = new();
    private PedalRow? _learningRow;
    private bool _isRunning;
    private string _selectedMidiDevice = "";
    private int _channel = 1;
    private ControllerInfo? _selectedController;

    public ObservableCollection<ControllerInfo> Controllers { get; } = new();
    public ObservableCollection<string> AvailableSources { get; } = new();

    public ControllerInfo? SelectedController
    {
        get => _selectedController;
        set
        {
            if (SetProperty(ref _selectedController, value))
            {
                UpdateAvailableSources();
            }
        }
    }

    public ObservableCollection<string> MidiDevices { get; } = new();

    public string SelectedMidiDevice
    {
        get => _selectedMidiDevice;
        set => SetProperty(ref _selectedMidiDevice, value);
    }

    public int Channel
    {
        get => _channel;
        set => SetProperty(ref _channel, value);
    }

    public ObservableCollection<PedalRow> Pedals { get; } = new();

    public bool IsRunning
    {
        get => _isRunning;
        private set => SetProperty(ref _isRunning, value);
    }

    public bool IsConnected => _ctrl.IsConnected;

    public bool IsLearning => _learningRow != null;

    public string LearningHint =>
        IsLearning ? "Kontrolcünden bir tuşa bas ya da bir ekseni oynat..." : "";

    public ICommand StartCommand { get; }
    public ICommand StopCommand { get; }
    public ICommand SaveCommand { get; }
    public ICommand LearnCommand { get; }
    public ICommand RefreshControllersCommand { get; }

    public MainViewModel(IMidiService midi, IControllerService ctrl, ISettingsService settings)
    {
        _midi = midi;
        _ctrl = ctrl;
        _settings = settings;

        _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(16) };
        _timer.Tick += (_, _) => Tick();
        _timer.Start();

        StartCommand = new RelayCommand(_ => Start());
        StopCommand = new RelayCommand(_ => Stop());
        SaveCommand = new RelayCommand(_ => Save());
        LearnCommand = new RelayCommand(p => BeginLearn(p as PedalRow));
        RefreshControllersCommand = new RelayCommand(_ => RefreshControllers());

        for (int i = 0; i < PedalDefs.Length; i++)
            Pedals.Add(new PedalRow(i, PedalDefs[i].Name, PedalDefs[i].Cc));

        RefreshControllers();
        Load();
    }

    public void RefreshControllers()
    {
        var list = _ctrl.GetControllers();
        Controllers.Clear();
        foreach (var c in list) Controllers.Add(c);

        if (_selectedController != null && list.Any(c => c.Name == _selectedController.Name))
            SelectedController = list.First(c => c.Name == _selectedController.Name);
        else
            SelectedController = list.Count > 0 ? list[0] : null;

        UpdateAvailableSources();
    }

    private void UpdateAvailableSources()
    {
        AvailableSources.Clear();
        if (_selectedController == null) return;
        foreach (var s in _ctrl.GetSourceNames(_selectedController.Id))
            AvailableSources.Add(s);
    }

    private int SelectedIndex => _selectedController?.Id ?? 0;

    private void Load()
    {
        foreach (var d in _midi.GetOutputDevices())
            MidiDevices.Add(d);

        var s = _settings.Load();
        SelectedMidiDevice = s.SelectedMidiDevice;
        Channel = s.Channel;
        for (int i = 0; i < Pedals.Count && i < s.Pedals.Count; i++)
            Pedals[i].Load(s.Pedals[i]);
    }

    public void Start()
    {
        if (IsRunning) return;
        _midi.Connect(SelectedMidiDevice);
        _lastSent.Clear();
        IsRunning = true;
    }

    public void Stop()
    {
        if (!IsRunning) return;
        IsRunning = false;
        for (int i = 0; i < Pedals.Count; i++)
            if (!string.IsNullOrEmpty(Pedals[i].SourceName))
                _midi.SendCc(_channel - 1, Pedals[i].Cc, 0);
        _lastSent.Clear();
        _midi.Disconnect();
    }

    private void BeginLearn(PedalRow? row)
    {
        if (row == null) return;
        if (_learningRow == row)
        {
            row.IsCapturing = false;
            row.LearningValue = "";
            _learningRow = null;
            OnPropertyChanged(nameof(IsLearning));
            OnPropertyChanged(nameof(LearningHint));
            return;
        }

        CancelLearn();
        _learnBaseline.Clear();
        foreach (var kvp in _ctrl.Poll(SelectedIndex))
            _learnBaseline[kvp.Key] = kvp.Value;

        _learningRow = row;
        row.IsCapturing = true;
        row.LearningValue = "Bind";
        OnPropertyChanged(nameof(IsLearning));
        OnPropertyChanged(nameof(LearningHint));
    }

    private void CancelLearn()
    {
        if (_learningRow != null)
        {
            _learningRow.IsCapturing = false;
            _learningRow.LearningValue = "";
        }
        _learningRow = null;
    }

    private void Tick()
    {
        var values = _ctrl.Poll(SelectedIndex);
        OnPropertyChanged(nameof(IsConnected));

        if (_learningRow != null)
        {
            foreach (var kvp in values)
            {
                double baseline = _learnBaseline.TryGetValue(kvp.Key, out var b) ? b : kvp.Value;
                if (Math.Abs(kvp.Value - baseline) > 0.22)
                {
                    _learningRow.Type = kvp.Key.StartsWith("Axis", StringComparison.Ordinal) ? SourceType.Axis : SourceType.Button;
                    _learningRow.SourceName = kvp.Key;
                    _learningRow.LiveValue = (int)Math.Round(kvp.Value * 127.0);
                    _learningRow.LearningValue = "";
                    _learningRow.IsCapturing = false;
                    _learningRow = null;
                    OnPropertyChanged(nameof(IsLearning));
                    OnPropertyChanged(nameof(LearningHint));
                    break;
                }
            }
        }

        if (!IsRunning) return;

        for (int i = 0; i < Pedals.Count; i++)
        {
            var pedal = Pedals[i];
            int val = CalcValue(pedal, values);
            pedal.LiveValue = val;

            if (_lastSent.TryGetValue(pedal.Cc, out int prev) && prev == val) continue;
            _lastSent[pedal.Cc] = val;
            _midi.SendCc(_channel - 1, pedal.Cc, val);
        }
    }

    private static int CalcValue(PedalRow pedal, IReadOnlyDictionary<string, double> values)
    {
        if (string.IsNullOrEmpty(pedal.SourceName) || !values.TryGetValue(pedal.SourceName, out double raw))
            return 0;

        if (pedal.Type == SourceType.Button)
            return raw > 0.5 ? 127 : 0;

        double v = pedal.Invert ? 1.0 - raw : raw;
        double dz = pedal.DeadzonePct / 100.0;

        if (pedal.Mode == AxisMode.Analog)
        {
            if (v <= dz) return 0;
            double scaled = (v - dz) / Math.Max(0.01, 1.0 - dz);
            return Math.Clamp((int)Math.Round(scaled * 127.0), 0, 127);
        }
        else
        {
            if (v <= dz) return 0;
            return v >= pedal.ThresholdPct / 100.0 ? 127 : 0;
        }
    }

    public void Save()
    {
        var s = new AppSettings
        {
            SelectedMidiDevice = SelectedMidiDevice,
            Channel = Channel,
            Pedals = Pedals.Select(p => p.ToModel()).ToList()
        };
        _settings.Save(s);
    }

    public void Dispose()
    {
        Stop();
        _ctrl.Dispose();
    }
}
