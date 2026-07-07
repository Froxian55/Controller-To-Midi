using System.Collections.Generic;
using ControllerToMidi3.Models;

namespace ControllerToMidi3.Models;

public class AppSettings
{
    public string SelectedMidiDevice { get; set; } = "";
    public int Channel { get; set; } = 1;
    public List<PedalMapping> Pedals { get; set; } = new();
}
