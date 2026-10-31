# VOID Premium · Ayrıntılı kullanım kılavuzu

[← Ana sayfaya dön](../README.md)

## Arayüz

Onaylanan VOID tasarımı uygulandı: sol menü (Ana Sayfa, Kanal Tarayıcı, İndirme Geçmişi, Ayarlar, Hakkında), üst barda bağlantı durumu / indirme klasörü / Ayarlar / Yardım ve pencere kontrolleri (pencere çerçevesiz, özel başlık çubuğu), sağda kuyruk paneli (1–5 eşzamanlı düğmeleri, küçük resimli kartlar). Daha fazla eşzamanlı indirme (6–8) Ayarlar'dan seçilir. "Yardım" ve "VOID Product Family" düğmeleri Hakkında sayfasını açar.

## Kurulum (kullanıcı)

1. [Releases](../../releases) sayfasından `VOID-Premium-Setup-x.y.z.exe` dosyasını indir.
2. Çift tıkla, kurulum klasörünü seç (varsayılan da olur).
3. Windows SmartScreen uyarısı çıkarsa **Daha fazla bilgi → Yine de çalıştır** (uygulama imzasız).
4. Masaüstünde **VOID Premium** kısayolu oluşur.

> Varsayılan olarak pencereyi kapatınca uygulama sistem tepsisinde çalışmaya devam eder (Ayarlar'dan kapatılabilir). Tamamen çıkmak için tepsi ikonuna sağ tıkla → **Çıkış**.

## Kullanım

**Link sekmesi**
1. Kick klip linki, klip ID'si (`clip_xxxxx`) veya VOD linki (`kick.com/video/...`) yapıştır.
2. **Analiz Et**'e bas.
3. **Dosya adı** alanından adı istediğin gibi düzenle (boş bırakırsan otomatik: `kanal - başlık [tarih]`).
4. **İndir**'e bas: sağda **indirme paneli** açılır. Burada her çözünürlük seçeneğinin **tahmini boyutu**, toplam boyut ve diskteki boş yer görünür. Tek bir **Kalite** listesinden seçersin: kaynağın kendi kaliteleri (1080p60, 720p60, 480p…) ve en altta **1080p60 / 2160p60 (4K) yükseltme** seçenekleri. **Kuyruğa ekle**.
5. İlk indirmede klasör seçici açılır. Sonradan üst bardaki klasör düğmesinden veya Ayarlar'dan değiştirebilirsin.

**Kısa video (TikTok · YouTube Shorts · Reels):** İndirme panelinde *Kısa video* bölümünde **Dikey (9:16) videoya çevir** kutusunu işaretle. Çözünürlük: 1080×1920 (Full HD) veya 720×1280 (HD). Sığdırma: **Bulanık arka plan** (görüntü genişliğe sığar, boş alan aynı görüntünün bulanığıyla dolar, hiçbir yer kesilmez) ya da **Ortadan kırp** (yatay görüntünün ortası alınır, kenarlar kesilir). Kaynak her zaman en yüksek Kick kalitesinden alınır, bu yüzden bu seçenek açıkken Kick kalite listesi pasifleşir. Yeniden kodlandığı için yavaştır; dosya adına `[Dikey]` eklenir.

**İzle:** Kanal kartlarındaki ve link sonucundaki **İzle** düğmesi klibi/VOD'u indirmeden uygulama içinde oynatır (HLS'de kalite seçilebilir). Kick oynatmaya izin vermezse uygulama bunu söyler; yine de indirebilirsin. Görseli olmayan kartlara videodan bir kare alınarak küçük resim üretilir.

**Pano ve sürükle-bırak:** Pencere açıkken bir Kick klip/VOD linki kopyalarsan üstte *Panoda Kick linki var* çıkar, **Analiz et** ile devam edersin (Ayarlar'dan kapatılabilir). Linki tarayıcıdan pencereye sürükleyip bırakmak da aynı işi görür.

**Bölüm kırpma:** İndirme panelinde (tek öğe için) *Yalnızca bir bölümünü indir* kutusunu işaretle, başlangıç/bitiş yaz (`1:30`, `1:02:03`). Kopya modunda başlangıç en yakın anahtar kareye yuvarlanabilir; yükseltme/küçültmede kesin kırpılır. Kaynak aralık okumaya izin vermiyorsa uygulama bunu söyler.

> HLS (VOD) boyutları bit hızı × süre ile **tahmindir** (`~` ile gösterilir). Doğrudan mp4 klip boyutları sunucudan okunur.

> **4K / 1080p60 yükseltme hakkında:** Kick yayınları genelde 1080p'ye kadar çıkar. Bu seçenek en yüksek kaliteli kaynağı 3840×2160 ve 60 kare/sn'ye **yükseltir**; gerçek detay eklemez ve 30 fps içerikte kareleri tekrarlar. Yeniden kodlama yapıldığı için yavaştır ve dosya büyüktür. Kaynak zaten gerçek 4K 60 fps ise kopyalanır. Dosya adına otomatik `[4K60]` eklenir.

**Kanal sekmesi**
1. Kanal adını yaz (örn. `hawking`), **Kanalı Aç**.
2. **Klipler** (Öne çıkan / 1 Ay / Tümü) veya **VOD'lar** sekmesini seç.
3. **Tüm klipleri indir** kanalın bütün kliplerini (en fazla 1000) listeleyip panele aktarır; boyutlar ilk 3 klibe bakılarak tahmin edilir. Ya da kartlara tıklayarak seç, **İndir (N)** ile indirme panelini aç (toplam boyut ve çözünürlük seçimi), oradan kuyruğa ekle. **Daha fazla yükle** ile sonraki klipleri getir.
4. **Tarih** düğmesiyle yeniden eskiye / eskiden yeniye sırala.

**Kuyruk**
- İlerleme, hız, kalan süre ve **indirilen / toplam boyut** (412 MB / ~600 MB) canlı görünür. HLS'de toplam boyut ilerlemeye göre tahmin edilir, bu yüzden `~` ile gösterilir.
- ⏸ Duraklat (sadece henüz başlamamış olanlar), ✎ Dosya adını düzenle (sıradakiler), ✕ İptal, 📁 Klasörde göster, ↻ Tekrar dene.
- Üstteki **Eşzamanlı** ayarı aynı anda kaç indirme çalışacağını belirler (1–8).
- **Bağlantı durumu** rozeti (üst bar) Kick'e erişimi gerçekten kontrol eder: *Kick bağlı*, *Kick erişimi engelledi*, *Bağlantı yok*. Tıklayınca açılan menüden yeniden kontrol edebilir.
- Kuyruk kalıcıdır; uygulamayı kapatıp açsan yarım kalanlar baştan devam eder.
- Aynı isimli dosyalarda otomatik `(1)`, `(2)` eklenir, üzerine yazılmaz.

## Ayarlar

- **Arka planda çalış**: açıkken pencereyi kapatmak uygulamayı tepsiye indirir, indirmeler sürer. Kapalıyken pencereyi kapatmak çıkış yapar (indirme sürüyorsa sorar).
- **Windows ile başlat** ve **tepside başlat** (yalnızca kurulu sürümde), **bitince bildirim**.
- **Yazı ve arayüz boyutu** (%80–160; kısayol: Ctrl + / Ctrl − / Ctrl 0).
- **İndirme hız sınırı** (MB/sn, 0 = sınırsız; toplam sınırdır, eşzamanlı indirmelere bölünür. Doğrudan mp4'te kesin, VOD/HLS'de yaklaşık uygulanır).
- İndirme klasörü, eşzamanlı indirme (1–8), kuyruk önceliği, **varsayılan kalite** ve **varsayılan çıktı**.
- Geçmişi temizleme.

## Geçmiş

**Geçmiş** sekmesi tamamlanan ve hata veren indirmeleri tutur (en fazla 500): dosya boyutu, tarih, **Göster** (klasörde aç), **Tekrar indir**, silme ve arama. Dosya sonradan silinmişse bunu belirtir. Kuyruktaki "Temizle" geçmişi silmez.

## Geliştirme

```bash
npm install
npm start        # uygulamayı aç
npm test         # birim testleri
npm run dist     # Windows installer (dist/ klasörüne)
```

Installer'ı kendi bilgisayarında üretmek için Windows gerekir. GitHub'da şu şekilde de üretebilirsin:

1. Depoya push et.
2. **Actions → Build VOID Premium → Run workflow** (veya `v1.0.0` gibi bir tag at).
3. Bitince installer **Artifacts** altında (tag attıysan **Releases**'te) hazır olur.

### Linux'ta installer üretmek (wine gerekmez)

`electron-builder`'ın NSIS hedefi Linux'ta wine ister. Bunun yerine hazır betik kullanılabilir:

```bash
npm run pack:win   # exe'ye VOID simgesini de yazar
cd build && makensis -DVERSION=1.9.3 -DSRC=../dist/win-unpacked -DOUT=../dist/VOID-Premium-Setup-1.9.3.exe installer.nsi
```

Kurulum kullanıcı bazlıdır (yönetici izni gerekmez), Başlat menüsü ve masaüstü kısayolu ekler, Ayarlar > Uygulamalar'dan kaldırılabilir.

### Yapı

```
src/main/        Electron ana süreç
  main.js        pencere, tepsi, IPC, Kick isteklerini yapan gizli Chromium penceresi
  kick.js        link çözümleme + Kick API istemcisi
  hls.js         m3u8 (master/media) çözümleme, kalite seçimi
  queue.js       kalıcı, öncelikli, paralel kuyruk
  downloader.js  ffmpeg ile HLS -> mp4 (kopya veya 4K 60 fps yükseltme), doğrudan mp4 indirme
  store.js       ayarlar, kuyruk ve geçmiş kaydı
src/renderer/    arayüz (HTML/CSS/JS)
tests/           node:test testleri
```

### Notlar

- Kick'in resmî olmayan `kick.com/api/...` uçları kullanılır; Kick bunları değiştirirse `src/main/kick.js` güncellenmelidir.
- İstekler Cloudflare'i geçebilmek için uygulamanın içindeki gerçek bir Chromium penceresi üzerinden yapılır.
- Yalnızca herkese açık içerikler indirilir. Abonelere özel VOD'lar indirilemez.

## Sorun çözme

| Sorun | Çözüm |
| --- | --- |
| SmartScreen "Tanınmayan uygulama" | **Daha fazla bilgi → Yine de çalıştır**. İmza yok, normal. |
| "Kick erişimi engelledi" | Birkaç saniye bekleyip tekrar dene; uygulama otomatik 3 kez dener. |
| "Bulunamadı" | Kanal adı yanlış olabilir ya da klip/yayın silinmiş olabilir. |
| İndirme başlamıyor | Kuyrukta sırada bekliyor olabilir; **Eşzamanlı** değerini arttır. |
| Antivirüs karantinaya aldı | İmzasız `.exe` olduğu için false-positive olabilir; istisna ekleyebilirsin. |
