namespace ControllerToMidi3.Models;

public enum SourceType
{
    Axis,
    Button
}

public enum AxisMode
{
    Analog,
    Threshold
}

public class PedalMapping
{
    public string SourceName { get; set; } = "";
    public SourceType Type { get; set; } = SourceType.Axis;
    public AxisMode Mode { get; set; } = AxisMode.Analog;
    public double Deadzone { get; set; } = 0.10;
    public bool Invert { get; set; }
    public double Threshold { get; set; } = 0.50;
}
