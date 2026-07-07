using System;
using System.Windows;
using System.Windows.Threading;

namespace ControllerToMidi3;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (_, ev) =>
        {
            MessageBox.Show(ev.Exception.ToString(), "Hata / Error", MessageBoxButton.OK, MessageBoxImage.Error);
            ev.Handled = true;
        };
    }
}
