# Controller to MIDI

Gamepad'ini, joystick'ini veya pedalını Sustain, Sostenuto ve Soft MIDI kontrollerine dönüştür.

## Windows uygulamasını indir

[En son sürümü ve `.exe` dosyalarını GitHub Releases sayfasında aç](https://github.com/Froxian55/Controller-To-Midi/releases/latest).

- **Portable**: Kurulum gerektirmeyen tek dosyalık uygulama.
- **Setup**: Masaüstü ve Başlat menüsü kısayollarıyla normal Windows kurulumu.

Uygulama MIDI erişimini yalnızca **Başlat** düğmesine bastığında ister. Windows, imzalanmamış açık kaynak uygulamalarında SmartScreen uyarısı gösterebilir.

## Özellikler

- Bağlı oyun kontrolcülerini ve canlı eksen/tuş sinyallerini görüntüleme
- MIDI çıkışı ve 1-16 arası MIDI kanalı seçimi
- Kontrolcü girdisini öğrenme veya listeden elle seçme
- Sustain (CC 64), Sostenuto (CC 66) ve Soft (CC 67) eşlemeleri
- Analog/eşik modu, ters yön, ölü bölge ve eşik seviyesi
- Bağlantı kesilince MIDI aktarımını güvenli şekilde durdurma
- Ayarları yerel olarak kaydetme

## Geliştirme

- Node.js 22 veya üzeri
- Windows x64

```powershell
npm ci
npm start
```

Test ve Windows `.exe` paketleri:

```powershell
npm test
npm run package:win
```

Çıktılar `release` klasörüne yazılır. GitHub Actions, `v*` etiketleri gönderildiğinde Setup ve Portable `.exe` dosyalarını otomatik olarak GitHub Release'e ekler.

## Lisans

MIT
