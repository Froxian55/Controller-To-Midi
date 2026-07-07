using System;
using System.IO;
using ControllerToMidi3.Models;
using Newtonsoft.Json;

namespace ControllerToMidi3.Services;

public class SettingsService : ISettingsService
{
    private readonly string _path;

    public SettingsService()
    {
        var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ControllerToMidi3");
        Directory.CreateDirectory(folder);
        _path = Path.Combine(folder, "settings.json");
    }

    public AppSettings Load()
    {
        if (!File.Exists(_path)) return new AppSettings();
        try
        {
            return JsonConvert.DeserializeObject<AppSettings>(File.ReadAllText(_path)) ?? new AppSettings();
        }
        catch (Exception)
        {
            return new AppSettings();
        }
    }

    public void Save(AppSettings settings)
    {
        if (settings == null) return;
        var json = JsonConvert.SerializeObject(settings, Formatting.Indented);
        File.WriteAllText(_path, json);
    }
}
