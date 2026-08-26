# QR Tree

Bir bağlantıyı, tepeden bakınca taranabilir bir QR koduna dönüşen 3B ağaca çeviren tek dosyalık web uygulaması. Ağaca dokununca kamera kuş bakışına yükselir, taçtaki yapraklar QR modüllerinin üzerine oturur; tekrar dokununca ağaç geri büyür.

Klibi animasyonlu GIF veya video olarak dışa aktarabilirsiniz: ağaç bir süre durur, sonra kendiliğinden tıklanmış gibi QR'a dönüşür ve taranmaya yetecek kadar sabit kalır.

## Çalıştırma

`index.html` dosyasına çift tıklamanız yeterli — kurulum, derleme, sunucu gerekmiyor. three.js bir CDN'den yüklenir, o yüzden ilk açılışta internet bağlantısı gerekir.

Yerel bir sunucudan servis etmek isterseniz:

```bash
python3 -m http.server 8000
```

## GitHub Pages ile yayına alma

Depoyu GitHub'a gönderdikten sonra: **Settings → Pages → Deploy from a branch → `main` → `/ (root)`**. Adres `https://KULLANICI.github.io/DEPO/` biçiminde olur.

Statik bir site olduğu için Netlify, Cloudflare Pages veya herhangi bir paylaşımlı hosting de aynı şekilde çalışır; tek gereken dosya `index.html`.

## Dosyalar

| Yol | Açıklama |
|---|---|
| `index.html` | Uygulamanın tamamı — HTML, CSS, 3B sahne, QR kodlayıcı, GIF kodlayıcı. Çalışması için gereken tek dosya. |
| `dev/qr.js` | QR kodlayıcının bağımsız kopyası (test için). |
| `dev/qr-test.html` | QR kodlayıcıyı tarayıcının kendi QR okuyucusuna karşı doğrulayan test sayfası. |

`dev/` klasörü çalışma zamanında kullanılmaz; silinebilir.

## QR kodlayıcı

Harici bir kütüphane kullanılmıyor. ISO/IEC 18004'e göre bayt modu, 1–15 arası sürümler ve L/M/Q/H hata düzeltme seviyeleri elle yazıldı: Galois cismi aritmetiği, Reed–Solomon hata düzeltme kodları, maske değerlendirmesi ve BCH format/sürüm bilgisi dahil.

Testi çalıştırmak için `dev/qr-test.html` sayfasını bir sunucu üzerinden açın (modül importları `file://` ile çalışmaz). Sayfa, 9 farklı veri × 4 hata düzeltme seviyesi × 8 maskeyi kodlayıp her birini tarayıcının `BarcodeDetector` API'siyle geri okur ve sonucu girdiyle karşılaştırır. Beklenen sonuç: **306/306**.

Chrome ve Edge'de çalışır; `BarcodeDetector` desteklemeyen tarayıcılarda test sayfası bunu bildirir.

## Bilinmesi gerekenler

**Video gerçek zamanlı kaydedilir.** `MediaRecorder` kareleri duvar saatine göre damgaladığı için klip, kaydedildiği süre kadar sürer. Sekme arka plana atılırsa tarayıcı zamanlayıcıları kısıtlar ve klip ağır çekime döner; bu yüzden kayıt sırasında sekme öne alınmamışsa işlem uyarı vererek durur. GIF bu sorundan etkilenmez, kare süreleri dosyanın içinde yazılıdır.

**Düz `http://` üzerinde çalışır.** 3B sahne, QR dönüşümü, ses, GIF ve video dışa aktarımı güvenli bağlam gerektirmez. Yalnızca `navigator.share` (telefondaki yerel paylaşım menüsü) `https://` ister; onun bulunmadığı durumda paylaş butonu bağlantıyı panoya kopyalar.

**Paylaşım bağlantıları.** Site yayındayken paylaş butonu `?u=<bağlantı>#qr` biçiminde adres üretir; bu adresi açan kişi doğrudan QR görünümüyle karşılaşır.

**Sosyal medya önizlemesi yok.** `og:image` etiketleri eklenmedi, bağlantı paylaşıldığında kapak görseli çıkmaz.

## Özelleştirme

Hepsi `index.html` içinde:

| Ne | Yer |
|---|---|
| Başlıktaki nokta yazı | `const WORDMARK` (571. satır) — metin canvas'ta taranıp nokta ızgarasına dönüştürülür, yazı tipi dosyası gerekmez |
| Mevsim paletleri | `const SEASONS` (610. satır) |
| QR modüllerinin koyuluğu | `l.qrColor.setHSL(...)` (824. satır) — zemine karşı kontrast için açıklık `.3` ile sınırlanır |
| QR'ın zemindeki boyutu | `const PLANE_W` (855. satır) |
| Hata düzeltme seviyesi seçimi | `function eccFor` (860. satır) |
| Klip zamanlaması | `const CLIP` (1215. satır) — ağacın durma, dönüşme ve QR'da bekleme süreleri (saniye) |
| Dışa aktarım çözünürlüğü | `const size = kind === 'gif' ? 480 : 720` (1503. satır) |

## Lisans

Henüz bir lisans belirtilmedi. GitHub'da lisanssız bir depo varsayılan olarak "tüm hakları saklı" sayılır; başkalarının kullanmasına izin vermek isterseniz bir `LICENSE` dosyası ekleyin.
