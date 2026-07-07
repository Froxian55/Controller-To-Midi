using System;
using System.Collections.Generic;
using ControllerToMidi3.Models;

namespace ControllerToMidi3.Services;

public interface IControllerService : IDisposable
{
    bool IsConnected { get; }
    IReadOnlyList<ControllerInfo> GetControllers();
    IReadOnlyList<string> GetSourceNames(int index);
    IReadOnlyDictionary<string, double> Poll(int index = 0);
}
