# Sürüm notları

## v1.12.0
- **Başlangıç ekranı:** Uygulama artık burada açılır. Bağlantıyı yapıştırınca Kick mi YouTube mı olduğunu anlayıp doğru bölüme geçer; kategori kartları (Kick, Kanal Tarayıcı, YouTube, Geçmiş, Ayarlar, Hakkında), özet sayılar (toplam/Kick/YouTube indirme, kuyruk, boş disk) ve son 5 indirme görünür. Eski "Ana Sayfa" artık "Kick İndir". Logoya tıklayınca da buraya dönülür.
- **YouTube geçmişi:** YouTube indirmeleri geçmişe kaydedilir (başlık, kanal, kalite, boyut). Geçmiş sayfasında Tümü / Kick / YouTube filtresi vardır; "Geçmişi temizle" seçili türü siler, indirilen dosyalara dokunmaz. YouTube kaydında "Tekrar indir" videoyu YouTube sekmesinde yeniden açar.
- **Pano ve sürükle-bırak:** YouTube bağlantıları da algılanır; çubuktaki düğme doğru sekmeye götürür.
- **Kısayollar:** Ctrl+1 … Ctrl+7 ile sekmeler arasında geçiş.

## v1.11.1
- **Güncelleme tek tıkla:** Yeni sürüm bulununca kurulum dosyası arka planda kendiliğinden indirilir ve doğrulanır (Ayarlar'dan kapatılabilir). Üstteki çubukta "Şimdi kur" çıkar; basınca GitHub'a gitmeden hemen kurulur. Çubukta artık GitHub'a yönlendiren düğme yok, yalnızca otomatik kurulum başarısız olursa yedek olarak görünür.
- Sürüm kontrolü açılıştan 8 saniye sonra ve her 6 saatte bir yapılır.
- Not: Güncelleme düğmesi v1.11.0 ile geldi; 1.10.0 ve öncesini kullananlar bu sürüme bir kez elle geçer.

## v1.11.0
- **YouTube sekmesi:** YouTube, youtu.be ve Shorts bağlantısından video indir. Kaliteyi (144p'den 4K'ya, kaynakta ne varsa) ve tahmini boyutu görerek seç; MP4 ya da yalnızca ses (MP3). "Uyumlu format" açıkken mümkün olduğunda H.264/AAC seçilir, kapatırsan en yüksek kalite alınır.
  - YouTube için gereken araçlar (yt-dlp ve Deno) ilk kullanımda GitHub'dan indirilir, sağlama toplamı doğrulanır; kurulum dosyası büyümez. yt-dlp haftada bir kendini günceller.
- **Uygulama içinden güncelleme:** Yeni sürüm bildiriminde "Şimdi güncelle" düğmesi gelir. Zip indirilir, sha256 doğrulanır, kurulum otomatik açılır; uyuşmazsa hiçbir şey çalıştırılmaz.

## v1.10.0
- **Dikey videoda kırpma konumu:** "Kırp" modunda artık hangi bölgenin kalacağını sol – orta – sağ kaydırıcısıyla seçersin (eskiden hep ortadan kırpıyordu).
- **GIF çıktısı:** Klip veya VOD'un seçtiğin aralığını (en çok 30 sn) 480 piksel genişlikte GIF olarak kaydeder.
- **Dosya adı şablonu:** Ayarlar'dan `{kanal} {başlık} {tarih} {tür}` parçalarıyla otomatik dosya adını kendin belirlersin.
- **Güncelleme kontrolü:** Açılışta yeni sürüm olup olmadığına bakar, varsa üstte haber verir; Ayarlar'dan kapatılabilir. Hiçbir şey kendiliğinden kurulmaz.
- **Hata raporu:** Ayarlar > Veriler'deki "Raporu kopyala" butonu sürüm, sistem ve son hata kayıtlarını panoya alır. Klasör yolu ve bağlantı içermez.
- **Bildirime tıklayınca:** İndirme bitince gelen bildirime tıklamak dosyayı klasörde seçili açar.
- Ayarlardaki sayı kutusu (hız sınırı) koyu temaya uyduruldu.

## v1.9.4
- Kurulum dosyası küçüldü: yalnızca Türkçe ve İngilizce dil dosyaları pakete dahil (GitHub 100 MB sınırı için).
- Uygulama adı "VOID Premium", yayımcı "VOID Premium", sağ altta kırmızı "LIMITED EDITION" yazısı.
- Durum çubuğunda Kick bağlantısı varsa yeşil nokta, milisaniye gösterimi kaldırıldı.
- Kliplerin ve VOD'ların indirmeden uygulama içinde izlenmesi ("İzle"), küçük resmi olmayan VOD'lar için kare yakalama.
- Kalite listesi düşükten yükseğe sıralı; TikTok / YouTube Shorts için ayrı dikey (9:16) bölüm.
- Panodaki Kick bağlantısını algılama, "en çok izlenen N" filtresi.
