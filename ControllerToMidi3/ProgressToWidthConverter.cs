using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows;

namespace ControllerToMidi3;

public class ProgressToWidthConverter : IMultiValueConverter
{
    public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
    {
        if (values.Length != 3) return 0.0;
        if (values[0] == DependencyProperty.UnsetValue || values[1] == DependencyProperty.UnsetValue || values[2] == DependencyProperty.UnsetValue)
            return 0.0;

        double value = System.Convert.ToDouble(values[0]);
        double actualWidth = System.Convert.ToDouble(values[1]);
        double maximum = System.Convert.ToDouble(values[2]);

        if (maximum <= 0 || actualWidth <= 0) return 0.0;
        return (value / maximum) * actualWidth;
    }

    public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}
