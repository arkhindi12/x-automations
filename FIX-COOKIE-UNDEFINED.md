# 🔧 Fix: Cookie Undefined / Connection Failed

## ❌ Masalah

Error "undefined" atau "connection failed" biasanya karena:
1. Format cookie JSON salah
2. Cookie tidak lengkap (tidak ada `auth_token` atau `ct0`)
3. Cookie expired
4. Format paste salah di form

---

## ✅ Cara Export Cookie yang Benar

### Step 1: Install Extension

**Chrome/Edge:**
1. Buka Chrome Web Store
2. Cari **"Cookie-Editor"** by cgagnier
3. Install extension

**Firefox:**
1. Buka Firefox Add-ons
2. Cari **"Cookie-Editor"**
3. Install extension

### Step 2: Login ke X.com

1. Buka `https://x.com` di browser
2. Login dengan akun kamu
3. Pastikan sudah masuk ke homepage/feed

### Step 3: Export Cookies

1. **Klik icon Cookie-Editor** di toolbar browser
2. **Klik tombol "Export"** (icon download)
3. **Pilih format "JSON"**
4. Cookie akan di-copy ke clipboard

### Step 4: Verifikasi Cookie

Cookie JSON harus berisi minimal 2 cookie penting:
- `auth_token` - Session token
- `ct0` - CSRF token

**Contoh format yang benar:**
```json
[
  {
    "domain": ".x.com",
    "expirationDate": 1234567890,
    "hostOnly": false,
    "httpOnly": true,
    "name": "auth_token",
    "path": "/",
    "sameSite": "no_restriction",
    "secure": true,
    "session": false,
    "storeId": "0",
    "value": "a1b2c3d4e5f6g7h8i9j0..."
  },
  {
    "domain": ".x.com",
    "expirationDate": 1234567890,
    "hostOnly": false,
    "httpOnly": false,
    "name": "ct0",
    "path": "/",
    "sameSite": "lax",
    "secure": true,
    "session": false,
    "storeId": "0",
    "value": "1a2b3c4d5e6f7g8h9i0j..."
  }
]
```

---

## 🧪 Test Cookie Sebelum Paste ke UI

Sebelum paste ke website, test dulu via curl:

### 1. Buat File Test

```bash
cd "$HOME/Downloads/X automation"

cat > test-my-cookie.json << 'EOF'
{
  "username": "GANTI_DENGAN_USERNAME_KAMU",
  "authMode": "cookies",
  "cookieJson": "PASTE_COOKIE_JSON_DI_SINI",
  "cookieUserAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "proxyUrl": null
}
EOF
```

### 2. Edit File

```bash
nano test-my-cookie.json
```

Atau buka dengan text editor, lalu:
1. Ganti `GANTI_DENGAN_USERNAME_KAMU` dengan username X kamu (tanpa @)
2. Ganti `PASTE_COOKIE_JSON_DI_SINI` dengan cookie JSON dari Cookie-Editor
3. Save file

### 3. Test via Curl

```bash
curl -X POST http://localhost:3006/api/accounts/test-diagnostic \
  -H "Content-Type: application/json" \
  -d @test-my-cookie.json
```

### 4. Lihat Hasil

**Sukses:**
```json
{
  "ok": true,
  "reason": "OK",
  "message": "Cookies validated for @username"
}
```

**Gagal - Cookie tidak lengkap:**
```json
{
  "ok": false,
  "reason": "AUTH_TOKEN_MISSING",
  "message": "Cookie auth_token tidak ditemukan."
}
```

**Gagal - Format JSON salah:**
```json
{
  "ok": false,
  "reason": "COOKIE_JSON_INVALID",
  "message": "Cookie JSON tidak valid: ..."
}
```

---

## 🔍 Debug Cookie di UI

Kalau test via curl berhasil tapi di UI gagal, cek:

### 1. Cek Console Browser

1. Buka website `http://localhost:5001`
2. Tekan `F12` atau `Cmd+Option+I` (Mac)
3. Klik tab **"Console"**
4. Coba test connection lagi
5. Lihat error message di console

### 2. Cek Network Tab

1. Buka tab **"Network"** di DevTools
2. Coba test connection lagi
3. Cari request ke `/api/accounts/test-diagnostic`
4. Klik request tersebut
5. Lihat **"Payload"** - apakah cookieJson terkirim?
6. Lihat **"Response"** - apa error yang dikembalikan?

### 3. Cek Backend Log

```bash
tail -f .api-server.log
```

Lalu coba test connection lagi dari UI. Lihat error di log.

---

## 🐛 Common Issues & Fixes

### Issue 1: "Cookie undefined"

**Penyebab:** Cookie JSON tidak terpaste dengan benar di form

**Fix:**
1. Jangan paste langsung dari Cookie-Editor
2. Paste dulu ke text editor (Notepad/TextEdit)
3. Copy dari text editor
4. Paste ke form UI

### Issue 2: "AUTH_TOKEN_MISSING"

**Penyebab:** Cookie tidak mengandung `auth_token`

**Fix:**
1. Pastikan sudah login ke x.com
2. Jangan export dari tab incognito/private
3. Export ulang dari tab yang sudah login
4. Pastikan domain cookie adalah `.x.com` atau `x.com`

### Issue 3: "CT0_MISSING"

**Penyebab:** Cookie tidak mengandung `ct0` (CSRF token)

**Fix:**
1. Refresh halaman x.com
2. Export cookies ulang
3. Pastikan tidak ada ad-blocker yang block cookie

### Issue 4: "Connection failed"

**Penyebab:** Backend tidak jalan atau network error

**Fix:**
1. Cek backend: `lsof -i:3006`
2. Cek log: `tail -f .api-server.log`
3. Restart backend jika perlu
4. Cek browser console untuk CORS error

### Issue 5: "Rate limit"

**Penyebab:** Terlalu banyak test dalam 15 menit

**Fix:**
1. Tunggu 15 menit, atau
2. Restart backend: `lsof -ti:3006 | xargs kill -9`

---

## 📋 Checklist Sebelum Test

Sebelum test cookie login, pastikan:

- [ ] Sudah login ke x.com di browser
- [ ] Cookie-Editor extension terinstall
- [ ] Export cookies dalam format JSON
- [ ] Cookie mengandung `auth_token` dan `ct0`
- [ ] Username ditulis tanpa `@`
- [ ] Backend running di port 3006
- [ ] Frontend running di port 5001
- [ ] Tidak kena rate limit (max 3 test per 15 menit)

---

## 🎯 Step-by-Step Test yang Benar

### Via UI (Recommended)

1. **Buka** `http://localhost:5001`
2. **Klik** menu "Accounts"
3. **Klik** "Add Account"
4. **Pilih** "Cookies Login"
5. **Isi Username:** `elonmusk` (contoh, tanpa @)
6. **Export Cookie:**
   - Buka x.com di tab lain
   - Klik Cookie-Editor extension
   - Export → JSON
   - Cookie ter-copy ke clipboard
7. **Paste Cookie JSON** ke form
8. **Isi User-Agent** (optional):
   ```
   Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
   ```
9. **Klik "Test Connection"**
10. **Tunggu** hasil (3-5 detik)
11. **Lihat** pesan sukses/error
12. **Kalau sukses**, klik "Save"

### Via Curl (For Debugging)

```bash
# 1. Buat file test
cat > test-cookie.json << 'EOF'
{
  "username": "your_username",
  "authMode": "cookies",
  "cookieJson": "[{\"name\":\"auth_token\",\"value\":\"...\",\"domain\":\".x.com\"},{\"name\":\"ct0\",\"value\":\"...\",\"domain\":\".x.com\"}]",
  "cookieUserAgent": "Mozilla/5.0",
  "proxyUrl": null
}
EOF

# 2. Test
curl -X POST http://localhost:3006/api/accounts/test-diagnostic \
  -H "Content-Type: application/json" \
  -d @test-cookie.json

# 3. Lihat hasil
```

---

## 💡 Tips

1. **Selalu test via curl dulu** sebelum paste ke UI
2. **Copy cookie ke text editor dulu** untuk verifikasi format
3. **Jangan edit cookie manual** - bisa rusak format JSON
4. **Pakai browser yang sama** untuk export cookie dan copy User-Agent
5. **Cookie expired?** Login ulang ke x.com lalu export baru
6. **Akun kena checkpoint?** Selesaikan verifikasi manual di x.com dulu

---

## 🆘 Masih Error?

Kalau masih error setelah ikuti panduan ini:

1. **Kirim error message lengkap** (dari UI atau curl)
2. **Kirim screenshot** error di browser console
3. **Kirim log backend** (tanpa cookie value):
   ```bash
   tail -50 .api-server.log | grep -A5 "test-diagnostic"
   ```

Saya akan bantu debug lebih lanjut!
