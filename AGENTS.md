# Hatırlatıcı - Proje Hafızası ve Geliştirici Kılavuzu

Bu dosya, Antigravity / AI asistanlarının farklı bilgisayarlarda (ev, iş vb.) projeyi açtığında hafıza kaybı yaşamadan tam senkronize çalışabilmesi için hazırlanmıştır.

---

## 📱 Proje Bilgileri
- **Tür:** React Native / Expo (Expo Router v57)
- **App ID (Bundle Identifier):** `com.beratisik.hatirlatici`
- **Apple Team:** `BA7RT8ZRUN (BERAT IŞIK)`
- **EAS Proje Adı:** `@isikberat0/hatirlatici`

---

## 🚀 TestFlight Dağıtımı (EAS Build)
Apple Developer API Anahtarı ve sertifikaları Expo bulut sunucusunda (`isikberat0` hesabında) kayıtlıdır.

### TestFlight'a Gönderme Komutu:
```powershell
npx eas-cli build --platform ios --auto-submit
```
*(Bu komut bulutta derleme yapar ve otomatik olarak App Store Connect TestFlight'a yükler).*

---

## 📌 İş Bilgisayarından Yapılacak Adımlar (v1.3 Güncellemesi)
1. **Lokal değişiklikleri kaydet:**
   ```powershell
   git add .
   git commit -m "Son güncel kodlar"
   ```
2. **GitHub'daki TestFlight ayarlarını çek:**
   ```powershell
   git pull origin master
   ```
3. **Sürümü `app.json` içinde güncelle:** `"version": "1.3.0"` yap.
4. **GitHub'a gönder:**
   ```powershell
   git add app.json
   git commit -m "Bump version to 1.3.0"
   git push origin master
   ```
5. **TestFlight'a gönder:**
   ```powershell
   npx eas-cli build --platform ios --auto-submit
   ```

---

## 🗄️ Veritabanı ve Supabase Notları
- Supabase şeması `supabase/schema.sql` dosyasındadır.
- `src/lib/supabase.ts` dosyası `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ortam değişkenlerini okur.
- Gerekli paketler: `@supabase/supabase-js` ve `expo-sqlite`.
