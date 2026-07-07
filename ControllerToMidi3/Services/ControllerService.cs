using System;
using System.Collections.Generic;
using SDL2;
using ControllerToMidi3.Models;

namespace ControllerToMidi3.Services;

public class ControllerService : IControllerService, IDisposable
{
    private bool _connected;
    private IntPtr _joy = IntPtr.Zero;
    private int _joyIndex = -1;

    public ControllerService()
    {
        try { SDL.SDL_Init(SDL.SDL_INIT_JOYSTICK); } catch { }
    }

    public bool IsConnected => _connected;

    public IReadOnlyList<ControllerInfo> GetControllers()
    {
        var list = new List<ControllerInfo>();
        try
        {
            int n = SDL.SDL_NumJoysticks();
            for (int i = 0; i < n; i++)
            {
                string name = $"Controller {i + 1}";
                IntPtr j = IntPtr.Zero;
                try { j = SDL.SDL_JoystickOpen(i); if (j != IntPtr.Zero) name = SDL.SDL_JoystickName(j); } catch { }
                finally { if (j != IntPtr.Zero) SDL.SDL_JoystickClose(j); }
                list.Add(new ControllerInfo { Id = i, Name = name });
            }
        }
        catch { }
        return list;
    }

    public IReadOnlyList<string> GetSourceNames(int index)
    {
        var list = new List<string>();
        try
        {
            IntPtr j = Open(index);
            if (j != IntPtr.Zero)
            {
                int na = SDL.SDL_JoystickNumAxes(j);
                int nb = SDL.SDL_JoystickNumButtons(j);
                for (int i = 0; i < na; i++) list.Add($"Axis {i}");
                for (int i = 0; i < nb; i++) list.Add($"Button {i}");
            }
        }
        catch { }
        return list;
    }

    public IReadOnlyDictionary<string, double> Poll(int index = 0)
    {
        var dict = new Dictionary<string, double>();
        IntPtr j = Open(index);
        _connected = j != IntPtr.Zero;
        if (j == IntPtr.Zero) return dict;

        try
        {
            SDL.SDL_JoystickUpdate();
            int na = SDL.SDL_JoystickNumAxes(j);
            int nb = SDL.SDL_JoystickNumButtons(j);
            for (int i = 0; i < na; i++)
            {
                short v = SDL.SDL_JoystickGetAxis(j, i);
                dict[$"Axis {i}"] = Math.Max(0.0, v) / 32768.0;
            }
            for (int i = 0; i < nb; i++)
                dict[$"Button {i}"] = SDL.SDL_JoystickGetButton(j, i);
        }
        catch { }

        return dict;
    }

    private IntPtr Open(int index)
    {
        if (_joyIndex == index && _joy != IntPtr.Zero) return _joy;
        if (_joy != IntPtr.Zero)
        {
            try { SDL.SDL_JoystickClose(_joy); } catch { }
            _joy = IntPtr.Zero;
            _joyIndex = -1;
        }
        try
        {
            if (index >= 0 && index < SDL.SDL_NumJoysticks())
            {
                _joy = SDL.SDL_JoystickOpen(index);
                _joyIndex = index;
            }
        }
        catch { }
        return _joy;
    }

    public void Dispose()
    {
        if (_joy != IntPtr.Zero)
        {
            try { SDL.SDL_JoystickClose(_joy); } catch { }
            _joy = IntPtr.Zero;
            _joyIndex = -1;
        }
        try { SDL.SDL_QuitSubSystem(SDL.SDL_INIT_JOYSTICK); } catch { }
    }
}
