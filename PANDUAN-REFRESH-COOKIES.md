# Panduan Refresh Cookies untuk Account

## Fitur Baru: Refresh Cookies ✨

Sekarang Anda dapat dengan mudah memperbarui cookies untuk account yang menggunakan Cookie Authentication.

## Cara Menggunakan

### 1. Cek Health Account

Pertama, cek status health account untuk melihat apakah cookie masih valid:

1. Buka http://localhost:5002/
2. Klik menu "Accounts"
3. Klik tombol **Check** (icon ❤️) di kolom "Health"

**Status yang mungkin muncul:**
- ✅ **OK** (hijau) - Cookie masih valid
- ❌ **Expired** (merah) - Cookie sudah expired, perlu di-refresh
- ⚠️ **Error** (kuning) - Ada masalah lain

### 2. Refresh Cookies (Jika Expired)

Jika status menunjukkan **Expired**, Anda akan melihat:
- **Alert banner** di atas tabel dengan pesan "Cookie Authentication Expired"
- **Tombol "Refresh"** di kolom Health
- **Icon refresh** (🔄) di kolom Actions

**Cara refresh:**

#### Opsi 1: Dari Kolom Health
1. Klik tombol **"Refresh"** yang muncul di sebelah badge "Expired"

#### Opsi 2: Dari Kolom Actions
1. Klik icon **refresh** (🔄 warna amber/orange) di kolom Actions

### 3. Update Cookies

Setelah klik tombol refresh, dialog akan muncul:

1. **Login ke X.com** di browser
   - Gunakan browser yang sama dengan akun yang ingin di-update
   - Pastikan sudah login dengan akun yang benar

2. **Export Cookies**
   - Install extension: [Cookie-Editor](https://cookie-editor.com/) atau EditThisCookie
   - Buka x.com
   - Klik icon extension
   - Klik "Export" → Copy sebagai JSON

3. **Paste Cookies**
   - Paste JSON cookies ke textarea di dialog
   - Atau upload file JSON dengan klik "Upload Cookie File"

4. **Test Cookies (Opsional)**
   - Klik tombol **"Diagnose"** untuk test cookies sebelum save
   - Lihat hasil diagnostic

5. **Save Cookies**
   - Klik tombol **"Validate & Update"**
   - Cookies akan di-validasi dan disimpan
   - Jika berhasil, status health akan berubah menjadi "OK"

## Fitur UI Baru

### 1. Alert Banner
Jika ada account dengan cookie expired, banner kuning akan muncul di atas tabel dengan pesan:
```
⚠️ Cookie Authentication Expired
Some accounts have expired cookies. Click the 🔄 button to update cookies and restore access.
```

### 2. Tombol Refresh di Health Column
Saat status "Expired", tombol "Refresh" akan muncul langsung di kolom Health untuk akses cepat.

### 3. Icon Refresh di Actions
Icon refresh (🔄) berwarna amber/orange tersedia di kolom Actions untuk semua account dengan Cookie Auth.

### 4. Tooltip Informatif
Hover mouse ke icon refresh untuk melihat tooltip "Refresh Cookies".

## Tips

### Kapan Perlu Refresh Cookies?
- ❌ Status health menunjukkan "Expired"
- ❌ Job automation tidak grab media
- ❌ Error "Sorry, that page does not exist"
- ❌ Error "Could not authenticate you"

### Cara Mencegah Cookie Expired
- 🔄 Refresh cookies secara berkala (setiap 1-2 minggu)
- ✅ Gunakan proxy yang stabil dan konsisten
- ✅ Jangan logout dari x.com di browser
- ✅ Gunakan User-Agent yang sama saat export cookies

### Troubleshooting

**Q: Cookies masih expired setelah di-update?**
- Pastikan login dengan akun yang benar di x.com
- Coba logout dan login ulang di x.com
- Export cookies dari tab yang baru dibuka (bukan incognito)
- Pastikan tidak ada checkpoint/verifikasi di akun X

**Q: Error "Cookies belong to @username, not @expected"?**
- Username di form harus sama dengan akun yang cookienya diexport
- Login dengan akun yang benar di x.com

**Q: Tombol refresh tidak muncul?**
- Tombol refresh hanya muncul untuk account dengan "Cookie Auth"
- Account dengan "OAuth 1.0a" tidak perlu refresh cookies

## Endpoint API

Untuk developer yang ingin menggunakan API:

```bash
# Check health
curl http://localhost:5002/api/accounts/1/health

# Update cookies
curl -X PUT http://localhost:5002/api/accounts/1 \
  -H "Content-Type: application/json" \
  -d '{
    "cookieJson": "[{\"name\":\"auth_token\",\"value\":\"...\"}]",
    "cookieUserAgent": "Mozilla/5.0 ..."
  }'
```

## File yang Diupdate

- ✅ `artifacts/x-automation/src/pages/accounts.tsx`
  - Tambah alert banner untuk expired cookies
  - Tambah tombol "Refresh" di kolom Health
  - Improve tooltip untuk icon refresh
  - Better visual feedback untuk expired status

## Screenshot Fitur

### Alert Banner
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Cookie Authentication Expired                        │
│ Some accounts have expired cookies. Click the 🔄 button │
│ to update cookies and restore access.                   │
└─────────────────────────────────────────────────────────┘
```

### Kolom Health dengan Tombol Refresh
```
Health Column:
┌──────────────────────────┐
│ ❌ Expired  [🔄 Refresh] │
└──────────────────────────┘
```

### Actions Column
```
Actions:
┌────────────────────────┐
│ ❤️  🔄  ✏️  🗑️        │
│ Check Refresh Edit Del │
└────────────────────────┘
```

---

**Selamat menggunakan fitur Refresh Cookies!** 🎉

Jika ada pertanyaan atau masalah, silakan cek file `TROUBLESHOOTING-ADD-ACCOUNT.md` atau `TROUBLESHOOTING-JOBS.md`.
