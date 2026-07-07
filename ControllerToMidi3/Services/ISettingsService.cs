using ControllerToMidi3.Models;

namespace ControllerToMidi3.Services;

public interface ISettingsService
{
    AppSettings Load();
    void Save(AppSettings settings);
}
