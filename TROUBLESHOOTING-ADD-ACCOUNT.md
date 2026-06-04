# Troubleshooting: Connection Failed saat Add Account

## Masalah yang Sudah Diperbaiki

### 1. Database Tidak Terkoneksi
**Gejala:** Error "connection failed undefined undefined" atau "DATABASE_URL must be set"

**Penyebab:** PostgreSQL tidak berjalan atau environment variable tidak ter-load

**Solusi:** Script `start-dev.sh` sudah diperbaiki untuk otomatis menjalankan PostgreSQL

### 2. Error Message Tidak Jelas
**Gejala:** Muncul "Connection failed: undefined undefined"

**Penyebab:** Frontend tidak menangani error response dengan benar

**Solusi:** Sudah diperbaiki di `artifacts/x-automation/src/pages/accounts.tsx`

## Cara Test Connection

### Test dengan Cookie Authentication

1. Login ke x.com di browser
2. Install extension Cookie-Editor atau EditThisCookie
3. Export cookies sebagai JSON
4. Di form Add Account:
   - Pilih tab "Cookie Auth"
   - Isi username (tanpa @)
   - Paste cookie JSON
   - Klik "Test Connection"

### Test dengan OAuth

1. Dapatkan credentials dari X Developer Portal
2. Di form Add Account:
   - Pilih tab "OAuth 1.0a"
   - Isi semua field (Bearer Token, API Key, dll)
   - Klik "Test Connection"

## Error Messages yang Mungkin Muncul

### "Could not authenticate you"
- **Penyebab:** Cookie sudah expired atau credentials salah
- **Solusi:** Login ulang ke x.com dan export cookies baru

### "Cookie auth_token was not found"
- **Penyebab:** Cookie JSON tidak lengkap
- **Solusi:** Pastikan export dari Cookie-Editor/EditThisCookie, bukan manual copy

### "Cookies belong to @username, not @expected"
- **Penyebab:** Username di form tidak sesuai dengan akun yang cookienya diexport
- **Solusi:** Ganti username atau login dengan akun yang benar

### "Rate limited"
- **Penyebab:** Terlalu banyak request ke X API
- **Solusi:** Tunggu beberapa menit sebelum test lagi

## Cek Status Server

```bash
# Cek apakah server berjalan
lsof -i :5002

# Cek apakah PostgreSQL berjalan
lsof -i :5433

# Lihat log server
tail -f .server.log

# Test API endpoint
curl http://localhost:5002/api/healthz
```

## Restart Server

```bash
# Stop semua proses
ps aux | grep "node.*dist/index.mjs" | grep -v grep | awk '{print $2}' | xargs kill -9

# Start ulang
./start-dev.sh
```

## Akses Aplikasi

- Frontend + Backend: http://localhost:5002/
- API Health Check: http://localhost:5002/api/healthz
- Database: PostgreSQL di localhost:5433

## Catatan Penting

1. **Port 5002** adalah unified server (Backend + Frontend)
2. PostgreSQL otomatis dijalankan oleh script `start-dev.sh`
3. Frontend sudah di-build dan di-serve oleh backend
4. Semua error sekarang menampilkan pesan yang jelas
