using System;
using System.Collections.Generic;
using System.Linq;
using ControllerToMidi3.Models;
using NAudio.Midi;

namespace ControllerToMidi3.Services;

public class MidiService : IMidiService, IDisposable
{
    private MidiOut? _out;

    public IReadOnlyList<string> GetOutputDevices()
    {
        var list = new List<string>();
        for (int i = 0; i < MidiOut.NumberOfDevices; i++)
            list.Add(MidiOut.DeviceInfo(i).ProductName);
        return list;
    }

    public bool Connect(string deviceName)
    {
        Disconnect();
        if (string.IsNullOrEmpty(deviceName)) return false;
        try
        {
            for (int i = 0; i < MidiOut.NumberOfDevices; i++)
            {
                if (MidiOut.DeviceInfo(i).ProductName == deviceName)
                {
                    _out = new MidiOut(i);
                    return true;
                }
            }
        }
        catch (Exception) { }
        return false;
    }

    public void Disconnect()
    {
        try { _out?.Dispose(); } catch (Exception) { }
        _out = null;
    }

    public void SendCc(int channel, int control, int value)
    {
        if (_out == null) return;
        channel = Math.Clamp(channel, 0, 15);
        control = Math.Clamp(control, 0, 127);
        value = Math.Clamp(value, 0, 127);
        int message = 0xB0 | channel | (control << 8) | (value << 16);
        try { _out.Send(message); } catch (Exception) { }
    }

    public void Dispose() => Disconnect();
}
