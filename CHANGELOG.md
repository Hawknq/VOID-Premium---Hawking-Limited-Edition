# Sürüm geçmişi

Son sürüm en üstte.

## v1.9.3
- "LIMITED EDITION" yazısı kırmızı (VOID rengi), yan çizgiler kaldırıldı, en alt sağ köşeye dayandı.

## v1.9.2
- "LIMITED EDITION" yazısı biraz aşağı alındı ve yan menüdeki "— PREMIUM —" biçimine (yan çizgiler, aynı yazı tipi) uyduruldu.

## v1.9.1
- Bağlantı rozeti: bağlıyken yeşil nokta, ms değeri kaldırıldı.
- Sağ alttaki yazı "LIMITED EDITION" (küçük, geniş harf aralıklı, yeşil parlama).

## v1.9.0
- **Uygulama içinde izle:** kanal kartlarında ve link sonucunda "İzle" düğmesi; mp4 ve HLS (VOD) için oynatıcı, HLS'de kalite seçimi. (hls.js, Apache-2.0; `voidmedia://` yerel aktarıcı ile.)
- Görseli olmayan klip/VOD kartlarına ffmpeg ile küçük resim üretilir.
- Kalite penceresinde **Kısa video** bölümü: TikTok / YouTube Shorts / Reels için 1080x1920 veya 720x1280, bulanık arka plan ya da ortadan kırp. Kick kalitesi ayrı bölüm.
- Durum rozeti ısınmış bağlantıdan ölçer.

## v1.8.1
- Sağ alt köşeye "Limited" rozeti eklendi (1.9.1'de yeniden tasarlandı).

## v1.8.0
- Uygulama adı **VOID Premium** oldu (pencere, kurulum, kısayollar, exe). Ayar/geçmiş klasörü aynı kaldı, eski kurulumun verisi korunur; kurulum eski "VOID Clipper" kısayollarını temizler.

## v1.7.1 - v1.7.2
- Yayımcı adı "VOID Premium" (dosya özellikleri, kurulum sihirbazı, Uygulamalar listesi).
- Durum rozeti: yanıt süresi küçük bir statik dosyadan ölçülür (ana sayfa ağır olduğu için yüksek görünüyordu).

## v1.7.0
- Kalite listesi **düşükten yükseğe** sıralı (dikey seçenekler en sonda).
- Kanal Tarayıcı: **En çok izlenen** filtresi (ilk 10/20/50).
- Önizleme: doğrudan mp4 kliplerde gerçek video oynatıcı (±1/5 sn adım, o anı başlangıç/bitiş yap, PNG kaydet); oynatılamazsa kare önizlemeye düşer. HLS kaynaklarda kare önizleme.

## v1.6.0
- **Dikey 9:16 dışa aktarma** (TikTok/Shorts/Reels): kalite listesinde "Dikey 9:16 · bulanık arka plan" ve "Dikey 9:16 · ortadan kırp" (1080×1920).
- **Pano algılama:** Kick klip/VOD linki kopyalayınca uygulama "Analiz et" önerir (Ayarlar'dan kapatılabilir).
