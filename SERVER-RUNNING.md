# ✅ API Server Berhasil Jalan di Port 3006

## Status

- ✅ PostgreSQL running di port 5433
- ✅ Database `x_automation` created
- ✅ Migration berhasil (semua tabel dibuat)
- ✅ API server running di port 3006
- ✅ Endpoint `/api/accounts` bekerja

## Akses API

### Base URL
```
http://localhost:3006
```

### Endpoints yang Tersedia

#### 1. List Accounts
```bash
curl http://localhost:3006/api/accounts
```

#### 2. Test Cookie Diagnostic
```bash
curl -X POST http://localhost:3006/api/accounts/test-diagnostic \
  -H "Content-Type: application/json" \
  -d '{
    "username": "YOUR_USERNAME",
    "authMode": "cookies",
    "cookieJson": "PASTE_COOKIE_JSON_HERE",
    "cookieUserAgent": "Mozilla/5.0...",
    "proxyUrl": null
  }'
```

#### 3. Create Account (Cookie Login)
```bash
curl -X POST http://localhost:3006/api/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "username": "YOUR_USERNAME",
    "authMode": "cookies",
    "cookieJson": "PASTE_COOKIE_JSON_HERE",
    "cookieUserAgent": "Mozilla/5.0..."
  }'
```

#### 4. Update Account Cookies
```bash
curl -X POST http://localhost:3006/api/accounts/:id/cookies \
  -H "Content-Type: application/json" \
  -d '{
    "cookieJson": "NEW_COOKIE_JSON",
    "cookieUserAgent": "Mozilla/5.0..."
  }'
```

## Test dengan Browser

Buka di browser:
```
http://localhost:3006/api/accounts
```

Harusnya return:
```json
[]
```

## Rate Limit

⚠️ Endpoint `/test-diagnostic` punya rate limit:
- **3 requests per 15 menit** per IP
- Kalau kena limit, tunggu 15 menit atau restart server

## Cara Restart Server

```bash
# Kill server
lsof -ti:3006 | xargs kill -9

# Start ulang
cd "$HOME/Downloads/X automation"
export DATABASE_URL=postgresql://postgres@localhost:5433/x_automation
export PORT=3006
export NODE_ENV=development

nohup pnpm --filter @workspace/api-server run dev > .api-server.log 2>&1 &
```

## Cara Stop Server

```bash
# Stop API server
lsof -ti:3006 | xargs kill -9

# Stop PostgreSQL
cd "$HOME/Downloads/X automation"
export PGDATA="$PWD/.pgdata"
export PATH="/tmp/pgsql/bin:$PATH"
pg_ctl -D .pgdata stop
```

## Cara Lihat Log

```bash
# Real-time log
tail -f .api-server.log

# Last 50 lines
tail -50 .api-server.log
```

## Test Cookie Login (Cara Lengkap)

### 1. Export Cookie dari Browser

1. Login ke `https://x.com`
2. Install extension **Cookie-Editor**
3. Klik extension → Export → JSON
4. Copy JSON yang berisi `auth_token` dan `ct0`

### 2. Buat File Test

```bash
cat > test-real-cookie.json << 'EOF'
{
  "username": "YOUR_USERNAME_TANPA_@",
  "authMode": "cookies",
  "cookieJson": "PASTE_COOKIE_JSON_DI_SINI",
  "cookieUserAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "proxyUrl": null
}
EOF
```

### 3. Test Diagnostic

```bash
curl -X POST http://localhost:3006/api/accounts/test-diagnostic \
  -H "Content-Type: application/json" \
  -d @test-real-cookie.json
```

### 4. Hasil yang Diharapkan

**Sukses:**
```json
{
  "ok": true,
  "reason": "OK",
  "message": "Cookies validated for @username",
  "suggestions": ["Cookies valid. Simpan akun atau lanjutkan update cookies."]
}
```

**Gagal:**
```json
{
  "ok": false,
  "reason": "AUTH_TOKEN_MISSING",
  "message": "Cookie auth_token tidak ditemukan.",
  "suggestions": [
    "Pastikan cookie auth_token ada di export",
    "Jangan export dari tab incognito/private yang belum login"
  ]
}
```

## Frontend (Opsional)

Untuk akses via UI, jalankan frontend:

```bash
export API_PROXY_TARGET=http://127.0.0.1:3006
export PORT=5001
export BASE_PATH=/

pnpm --filter @workspace/x-automation run dev
```

Lalu buka: `http://localhost:5001`

## Troubleshooting

### Error: "Route not found"

Pastikan pakai prefix `/api/`:
- ✅ `http://localhost:3006/api/accounts`
- ❌ `http://localhost:3006/accounts`

### Error: "Too many authentication attempts"

Rate limit hit. Tunggu 15 menit atau restart server.

### Error: "Cannot connect to database"

PostgreSQL mungkin mati. Start ulang:
```bash
cd "$HOME/Downloads/X automation"
export PGDATA="$PWD/.pgdata"
export PATH="/tmp/pgsql/bin:$PATH"
pg_ctl -D .pgdata start -o "-p 5433"
```

### Port 3006 sudah dipakai

Ganti port di `.env`:
```bash
PORT=3007
```

Lalu restart server.

---

## Summary

✅ **API server berhasil jalan di `http://localhost:3006`**  
✅ **Database PostgreSQL ready**  
✅ **Siap test cookie login X**  

Tinggal paste cookie asli dari x.com untuk test real login!
