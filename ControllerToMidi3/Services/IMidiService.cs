using System.Collections.Generic;

namespace ControllerToMidi3.Services;

public interface IMidiService
{
    IReadOnlyList<string> GetOutputDevices();
    bool Connect(string deviceName);
    void Disconnect();
    void SendCc(int channel, int control, int value);
}
