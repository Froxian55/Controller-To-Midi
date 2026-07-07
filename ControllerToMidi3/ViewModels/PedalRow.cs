using System;
using System.Collections.Generic;
using ControllerToMidi3.Models;

namespace ControllerToMidi3.ViewModels;

public class PedalRow : BaseViewModel
{
    private string _pedalName = "";
    private int _cc;
    private SourceType _type = SourceType.Axis;
    private string _sourceName = "";
    private AxisMode _mode = AxisMode.Analog;
    private int _deadzonePct = 10;
    private bool _invert;
    private int _thresholdPct = 50;
    private int _liveValue;
    private bool _isCapturing;
    private string _learningValue = "";

    public int Index { get; set; }

    public string PedalName { get => _pedalName; set => SetProperty(ref _pedalName, value); }

    public int Cc { get => _cc; set => SetProperty(ref _cc, value); }

    public string PedalLabel => $"{_pedalName} (CC{_cc})";

    public SourceType Type
    {
        get => _type;
        set => SetProperty(ref _type, value);
    }

    public string SourceName
    {
        get => _sourceName;
        set => SetProperty(ref _sourceName, value);
    }

    public AxisMode Mode
    {
        get => _mode;
        set => SetProperty(ref _mode, value);
    }

    public int DeadzonePct
    {
        get => _deadzonePct;
        set => SetProperty(ref _deadzonePct, value);
    }

    public bool Invert
    {
        get => _invert;
        set => SetProperty(ref _invert, value);
    }

    public int ThresholdPct
    {
        get => _thresholdPct;
        set => SetProperty(ref _thresholdPct, value);
    }

    public int LiveValue
    {
        get => _liveValue;
        set => SetProperty(ref _liveValue, value);
    }

    public bool IsCapturing
    {
        get => _isCapturing;
        set => SetProperty(ref _isCapturing, value);
    }

    public string LearningValue
    {
        get => _learningValue;
        set
        {
            if (SetProperty(ref _learningValue, value))
            {
                OnPropertyChanged(nameof(LearnButtonText));
            }
        }
    }

    public string LearnButtonText => string.IsNullOrEmpty(_learningValue) ? "Bind" : _learningValue;

    public PedalRow() { }

    public PedalRow(int index, string name, int cc)
    {
        Index = index;
        _pedalName = name;
        _cc = cc;
    }

    public PedalMapping ToModel() => new()
    {
        SourceName = _sourceName,
        Type = _type,
        Mode = _mode,
        Deadzone = _deadzonePct / 100.0,
        Invert = _invert,
        Threshold = _thresholdPct / 100.0
    };

    public void Load(PedalMapping? m)
    {
        if (m == null) return;
        _type = m.Type;
        _sourceName = m.SourceName;
        _mode = m.Mode;
        _deadzonePct = (int)Math.Round(m.Deadzone * 100);
        _invert = m.Invert;
        _thresholdPct = (int)Math.Round(m.Threshold * 100);
        OnPropertyChanged(nameof(Type));
        OnPropertyChanged(nameof(SourceName));
        OnPropertyChanged(nameof(Mode));
        OnPropertyChanged(nameof(DeadzonePct));
        OnPropertyChanged(nameof(Invert));
        OnPropertyChanged(nameof(ThresholdPct));
    }
}
