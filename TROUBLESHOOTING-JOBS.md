# Troubleshooting: Automation Jobs Tidak Grab Media

## Masalah yang Ditemukan

### 1. Cookie Account Expired ❌
**Gejala:** Job berjalan tapi tidak ada media yang di-grab

**Penyebab:** Cookie authentication sudah expired

**Cara Cek:**
```bash
curl http://localhost:5002/api/accounts/1/health
```

**Response jika expired:**
```json
{
  "status": "error",
  "message": "Sorry, that page does not exist",
  "authMode": "cookies"
}
```

**Solusi:**
1. Login ulang ke x.com di browser
2. Export cookies baru dengan Cookie-Editor/EditThisCookie
3. Update account dengan cookies baru:
   - Buka http://localhost:5002/
   - Klik "Accounts"
   - Klik icon cookie di account yang expired
   - Paste cookies baru
   - Klik "Test & Update"

### 2. Timezone Issue (SUDAH DIPERBAIKI) ✅
**Gejala:** Job tidak jalan meskipun sudah waktunya

**Penyebab:** Scheduler menggunakan waktu UTC yang salah

**Solusi:** Sudah diperbaiki di `automation-scheduler.ts`

## Cara Test Job

### 1. Cek Status Job
```bash
curl http://localhost:5002/api/jobs/4 | jq '.isActive, .nextRun, .status'
```

### 2. Cek Health Account
```bash
curl http://localhost:5002/api/accounts/1/health
```

### 3. Run Job Manual
```bash
curl -X POST http://localhost:5002/api/jobs/4/run
```

### 4. Cek Media yang Di-grab
```bash
curl http://localhost:5002/api/media?limit=10 | jq '.[] | {id, type, targetUsername}'
```

## Konfigurasi Job

### Media Source Options:
- **home**: Grab dari home timeline account
- **grab**: Grab dari profile target tertentu
- **library**: Gunakan media yang sudah tersimpan

### Important Settings:
- **grabExternalLinksOnly**: 
  - `true` = Hanya grab link eksternal (YouTube, dll)
  - `false` = Grab native X videos/images
- **grabImages**: Grab gambar dari timeline
- **grabVideos**: Grab video dari timeline
- **uploadToDood**: Upload video ke DoodStream
- **postToX**: Auto-post ke X setelah upload

## Monitoring

### Cek Log Server
```bash
tail -f .server.log | grep -i "job\|grabbed\|uploaded"
```

### Cek Scheduler
```bash
tail -f .server.log | grep "Checking due jobs"
```

## Common Issues

### Job Status "running" Stuck
**Solusi:** Restart server
```bash
ps aux | grep "node.*dist/index.mjs" | awk '{print $2}' | xargs kill -9
./start-dev.sh
```

### No Media Grabbed
**Kemungkinan:**
1. ✅ Cookie expired - Update cookies
2. ✅ Timeline kosong - Cek timeline di x.com
3. ✅ Filter terlalu ketat - Cek `keywordFilter` dan `allowedVideoDomains`
4. ✅ `grabExternalLinksOnly=true` tapi tidak ada link eksternal

### Upload to DoodStream Failed
**Kemungkinan:**
1. ✅ DoodStream API key salah
2. ✅ Video terlalu besar
3. ✅ Format video tidak didukung

## Next Steps

1. **Update cookies account** yang expired
2. **Test job manual** dengan `POST /api/jobs/4/run`
3. **Monitor log** untuk melihat hasil grab
4. **Cek media table** untuk melihat media yang tersimpan

## File yang Diperbaiki

- ✅ `artifacts/api-server/src/lib/automation-scheduler.ts` - Fix timezone issue
- ✅ `start-dev.sh` - Auto-start PostgreSQL
- ✅ `TROUBLESHOOTING-ADD-ACCOUNT.md` - Panduan update cookies
