# 🎉 Website Berhasil Jalan!

## ❌ Yang Salah

Kamu buka: `http://localhost:3006`  
Itu adalah **API backend** (REST API untuk developer), bukan website UI.

## ✅ Yang Benar

Buka: **`http://localhost:5001`**  
Ini adalah **dashboard UI** dengan tampilan visual.

---

## 📊 Penjelasan

### Port 3006 (Backend API)
- **Fungsi:** REST API untuk data (JSON)
- **Untuk:** Developer, integrasi, curl/Postman
- **Tampilan:** Plain text/JSON
- **Contoh:** `http://localhost:3006/api/accounts` → `[]`

### Port 5001 (Frontend UI) ✅
- **Fungsi:** Website dashboard dengan UI visual
- **Untuk:** User biasa, manage akun, automation
- **Tampilan:** Dashboard, forms, tables, buttons
- **Contoh:** `http://localhost:5001` → Dashboard lengkap

---

## 🎯 Cara Pakai Website

### 1. Buka Browser
```
http://localhost:5001
```

### 2. Navigasi Menu
Kamu akan lihat sidebar dengan menu:
- 📱 **Dashboard** - Overview
- 👤 **Accounts** - Manage akun X ← MULAI DI SINI
- 🎯 **Targets** - Target accounts
- 📋 **Jobs** - Automation jobs
- 🖼️ **Media** - Upload media
- 📝 **Posts** - Posted tweets
- ⚙️ **Settings** - Configuration

### 3. Tambah Akun X (Cookie Login)

1. Klik menu **"Accounts"**
2. Klik tombol **"Add Account"**
3. Pilih **"Cookies Login"**
4. Isi form:
   - **Username:** username X tanpa `@` (contoh: `elonmusk`)
   - **Cookie JSON:** paste dari Cookie-Editor extension
   - **User-Agent:** copy dari browser (optional)
5. Klik **"Test Connection"** untuk validasi
6. Kalau valid, klik **"Save"**

### 4. Export Cookie dari X.com

1. Login ke `https://x.com` di browser
2. Install extension **Cookie-Editor** (Chrome/Firefox)
3. Buka `x.com`
4. Klik icon Cookie-Editor
5. Klik **"Export"** → pilih **"JSON"**
6. Copy JSON yang muncul
7. Paste ke form "Cookie JSON" di dashboard

---

## 🔧 Status Services

Semua service sudah jalan:

| Service | Port | Status | URL |
|---------|------|--------|-----|
| PostgreSQL | 5433 | ✅ Running | - |
| Backend API | 3006 | ✅ Running | http://localhost:3006 |
| Frontend UI | 5001 | ✅ Running | http://localhost:5001 |

---

## 📝 Logs

Kalau ada error, cek log:

**Backend log:**
```bash
tail -f .api-server.log
```

**Frontend log:**
```bash
tail -f .frontend.log
```

---

## 🛑 Stop Services

**Stop frontend:**
```bash
lsof -ti:5001 | xargs kill -9
```

**Stop backend:**
```bash
lsof -ti:3006 | xargs kill -9
```

**Stop PostgreSQL:**
```bash
cd "$HOME/Downloads/X automation"
export PGDATA="$PWD/.pgdata"
export PATH="/tmp/pgsql/bin:$PATH"
pg_ctl -D .pgdata stop
```

---

## 🔄 Restart Services

Kalau service mati, restart dengan:

**Restart backend:**
```bash
cd "$HOME/Downloads/X automation"
export DATABASE_URL=postgresql://postgres@localhost:5433/x_automation
export PORT=3006
nohup pnpm --filter @workspace/api-server run dev > .api-server.log 2>&1 &
```

**Restart frontend:**
```bash
cd "$HOME/Downloads/X automation"
export API_PROXY_TARGET=http://127.0.0.1:3006
export PORT=5001
export BASE_PATH=/
nohup pnpm --filter @workspace/x-automation run dev > .frontend.log 2>&1 &
```

---

## 💡 Tips

1. **Selalu buka port 5001** untuk UI, bukan 3006
2. **Cookie harus fresh** - kalau expired, export ulang dari x.com
3. **Username tanpa @** - tulis `elonmusk` bukan `@elonmusk`
4. **Test connection dulu** sebelum save account
5. **Lihat log** kalau ada error

---

## 🎉 Summary

✅ **Website jalan di:** `http://localhost:5001`  
✅ **API jalan di:** `http://localhost:3006`  
✅ **Database ready**  
✅ **Siap tambah akun X dan mulai automation!**

**Buka http://localhost:5001 sekarang!**
