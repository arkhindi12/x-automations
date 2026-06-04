# 🔧 Panduan Lengkap: Fix "Cookie Undefined"

## 🎯 Masalah

Error "undefined" atau "connection failed" saat test cookie login.

## ✅ Solusi Step-by-Step

### Step 1: Export Cookie dari X.com

1. **Buka browser** (Chrome/Firefox/Edge)

2. **Install Cookie-Editor extension:**
   - Chrome: https://chrome.google.com/webstore → cari "Cookie-Editor"
   - Firefox: https://addons.mozilla.org → cari "Cookie-Editor"

3. **Login ke x.com:**
   - Buka https://x.com
   - Login dengan akun kamu
   - Pastikan sudah masuk ke homepage

4. **Export cookies:**
   - Klik icon **Cookie-Editor** di toolbar
   - Klik tombol **"Export"** (icon download)
   - Pilih format **"JSON"**
   - Cookie akan di-copy ke clipboard

5. **Paste ke text editor:**
   - Buka Notepad/TextEdit/VS Code
   - Paste cookie (Cmd+V / Ctrl+V)
   - Save sebagai `my-cookies.json`

### Step 2: Verifikasi Cookie

Cookie JSON harus berisi minimal 2 cookie:

```json
[
  {
    "name": "auth_token",
    "value": "a1b2c3d4...",
    "domain": ".x.com"
  },
  {
    "name": "ct0",
    "value": "1a2b3c4d...",
    "domain": ".x.com"
  }
]
```

**Cek:**
- ✅ Ada `auth_token`?
- ✅ Ada `ct0`?
- ✅ Domain adalah `.x.com` atau `x.com`?

### Step 3: Test via Script (Recommended)

Sebelum paste ke UI, test dulu via script:

```bash
cd "$HOME/Downloads/X automation"

# Jalankan test script
node test-cookie-ui-format.mjs
```

**Edit script:**
```bash
nano test-cookie-ui-format.mjs
```

**Ganti 3 placeholder:**
1. `YOUR_USERNAME` → username X kamu (tanpa @)
2. `PASTE_YOUR_AUTH_TOKEN_HERE` → nilai dari cookie `auth_token`
3. `PASTE_YOUR_CT0_HERE` → nilai dari cookie `ct0`

**Jalankan ulang:**
```bash
node test-cookie-ui-format.mjs
```

**Hasil yang diharapkan:**
```
✅ Username: your_username
✅ Cookie JSON: Valid (2 cookies)
✅ auth_token: a1b2c3d4e5f6g7h8i9j0...
✅ ct0: 1a2b3c4d5e6f7g8h9i0j...
```

### Step 4: Test ke Server

Kalau semua ✅, test ke server:

```bash
curl -X POST http://localhost:3006/api/accounts/test-diagnostic \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "authMode": "cookies",
    "cookieJson": "[{\"name\":\"auth_token\",\"value\":\"YOUR_AUTH_TOKEN\",\"domain\":\".x.com\"},{\"name\":\"ct0\",\"value\":\"YOUR_CT0\",\"domain\":\".x.com\"}]",
    "cookieUserAgent": "Mozilla/5.0",
    "proxyUrl": null
  }'
```

**Hasil sukses:**
```json
{
  "ok": true,
  "reason": "OK",
  "message": "Cookies validated for @your_username"
}
```

### Step 5: Paste ke UI

Kalau test via curl berhasil, sekarang paste ke UI:

1. **Buka** `http://localhost:5001`
2. **Klik** menu "Accounts"
3. **Klik** "Add Account"
4. **Pilih** "Cookies Login"
5. **Isi form:**
   - **Username:** `your_username` (tanpa @)
   - **Cookie JSON:** Paste **SELURUH** JSON dari Cookie-Editor
   - **User-Agent:** (optional) `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36`
6. **Klik** "Test Connection"
7. **Tunggu** 3-5 detik
8. **Lihat** hasil

---

## 🐛 Troubleshooting

### Error: "Cookie undefined"

**Penyebab:** Cookie JSON tidak terpaste dengan benar

**Fix:**
1. Jangan paste langsung dari Cookie-Editor ke form UI
2. Paste dulu ke text editor (Notepad)
3. Copy dari text editor
4. Paste ke form UI

### Error: "AUTH_TOKEN_MISSING"

**Penyebab:** Cookie tidak mengandung `auth_token`

**Fix:**
1. Pastikan sudah login ke x.com
2. Jangan export dari tab incognito
3. Export ulang dari tab yang sudah login

### Error: "CT0_MISSING"

**Penyebab:** Cookie tidak mengandung `ct0`

**Fix:**
1. Refresh halaman x.com
2. Export cookies ulang

### Error: "Connection failed"

**Penyebab:** Backend tidak jalan

**Fix:**
```bash
# Cek backend
lsof -i:3006

# Restart jika perlu
lsof -ti:3006 | xargs kill -9
cd "$HOME/Downloads/X automation"
export DATABASE_URL=postgresql://postgres@localhost:5433/x_automation
export PORT=3006
nohup pnpm --filter @workspace/api-server run dev > .api-server.log 2>&1 &
```

### Error: "Rate limit"

**Penyebab:** Terlalu banyak test (max 3 per 15 menit)

**Fix:**
```bash
# Restart backend untuk reset rate limit
lsof -ti:3006 | xargs kill -9
cd "$HOME/Downloads/X automation"
export DATABASE_URL=postgresql://postgres@localhost:5433/x_automation
export PORT=3006
nohup pnpm --filter @workspace/api-server run dev > .api-server.log 2>&1 &
```

---

## 📋 Checklist

Sebelum test, pastikan:

- [ ] Sudah login ke x.com
- [ ] Cookie-Editor extension terinstall
- [ ] Export cookies dalam format JSON
- [ ] Cookie mengandung `auth_token` dan `ct0`
- [ ] Username tanpa `@`
- [ ] Backend running (port 3006)
- [ ] Frontend running (port 5001)
- [ ] Test via script dulu sebelum paste ke UI

---

## 💡 Tips

1. **Selalu test via script dulu** (`node test-cookie-ui-format.mjs`)
2. **Paste ke text editor dulu** untuk verifikasi
3. **Jangan edit cookie manual** - bisa rusak format
4. **Pakai browser yang sama** untuk export cookie dan User-Agent
5. **Cookie expired?** Login ulang lalu export baru

---

## 🎯 Format Cookie yang Benar

**Dari Cookie-Editor (JSON):**
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
    "value": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
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
    "value": "1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p"
  }
]
```

**Yang penting:**
- `name`: "auth_token" dan "ct0"
- `value`: nilai cookie (panjang ~32-64 karakter)
- `domain`: ".x.com" atau "x.com"

---

## 🆘 Masih Error?

Kalau masih error setelah ikuti semua step:

1. **Jalankan test script:**
   ```bash
   node test-cookie-ui-format.mjs
   ```

2. **Kirim hasil test** (tanpa cookie value)

3. **Cek log backend:**
   ```bash
   tail -50 .api-server.log
   ```

4. **Cek browser console:**
   - Buka http://localhost:5001
   - Tekan F12
   - Lihat tab Console dan Network

Saya akan bantu debug lebih lanjut!
