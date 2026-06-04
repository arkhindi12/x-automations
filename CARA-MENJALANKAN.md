# Cara Menjalankan Aplikasi

## Port Aplikasi
Aplikasi ini menggunakan **unified server** yang berjalan di **satu port saja**:

- **Port 5002**: Backend API + Frontend (Unified Server)
  - Frontend: http://localhost:5002/
  - API: http://localhost:5002/api/*
  - Health Check: http://localhost:5002/api/healthz

## Cara Menjalankan

### 1. Jalankan Aplikasi
```bash
./start-dev.sh
```

### 2. Akses Aplikasi
Buka browser dan akses: **http://localhost:5002/**

### 3. Stop Aplikasi
```bash
# Cari process ID
ps aux | grep "node.*dist/index.mjs" | grep -v grep

# Kill process
kill -9 <PID>
```

## Konfigurasi

File `.env`:
```
DATABASE_URL=postgresql://postgres@localhost:5433/x_automation
NODE_ENV=development
PORT=5002
LOG_LEVEL=debug
```

## Struktur Port
- ✅ **Port 5002**: Unified server (Backend + Frontend)
- ✅ **Port 5433**: PostgreSQL Database

## Catatan
- Aplikasi ini menggunakan arsitektur unified server
- Backend serve API di `/api/*` dan frontend di root `/`
- Tidak ada port terpisah untuk frontend development
- Semua request ke root `/` akan serve frontend (HTML)
- Semua request ke `/api/*` akan serve API (JSON)
