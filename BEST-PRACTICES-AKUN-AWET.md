# Rekomendasi Konfigurasi Job untuk Akun Awet

## ⚙️ Job Settings yang Aman

### 1. Schedule Interval
```
❌ JANGAN: 1-5 menit (terlalu agresif)
✅ GUNAKAN: 15-30 menit (lebih natural)
✅ IDEAL: 30-60 menit (paling aman)
```

### 2. Grab Limits
```
- Max 20 tweets per run
- Max 100-200 tweets per hari
- Pause di malam hari (00:00 - 06:00)
```

### 3. Proxy Configuration
```
✅ Residential proxy (bukan datacenter)
✅ IP konsisten untuk 1 akun
✅ Lokasi proxy = lokasi akun
❌ Free proxy / public proxy
❌ Ganti-ganti IP setiap request
```

### 4. Cookie Management
```
✅ Manual refresh saat expired (7-14 hari sekali)
✅ Export dari browser yang sama
✅ User-Agent konsisten
❌ Auto refresh setiap jam
❌ Simpan password di database
```

## 📊 Contoh Konfigurasi Job yang Aman

### Job 1: Home Timeline (Conservative)
```json
{
  "name": "Safe Home Grab",
  "mediaSource": "home",
  "scheduleType": "interval",
  "scheduleValue": "30",  // 30 menit
  "grabImages": true,
  "grabVideos": true,
  "grabExternalLinksOnly": false,
  "uploadToDood": true,
  "postToX": false,  // Manual posting lebih aman
  "proxyUrl": "http://user:pass@residential-proxy:port"
}
```

### Job 2: Target Profile (Very Conservative)
```json
{
  "name": "Safe Profile Grab",
  "mediaSource": "grab",
  "targetId": 1,
  "scheduleType": "interval",
  "scheduleValue": "60",  // 1 jam
  "grabImages": true,
  "grabVideos": true,
  "includeReplies": false,  // Kurangi request
  "uploadToDood": true,
  "postToX": false,
  "proxyUrl": "http://user:pass@residential-proxy:port"
}
```

### Job 3: Prime Time Only (Most Safe)
```json
{
  "name": "Prime Time Grab",
  "mediaSource": "home",
  "scheduleType": "interval",
  "scheduleValue": "45",  // 45 menit
  "primeTimeHours": "8,12,18,21",  // Hanya jam sibuk
  "grabImages": true,
  "grabVideos": true,
  "uploadToDood": true,
  "postToX": false,
  "proxyUrl": "http://user:pass@residential-proxy:port"
}
```

## 🛡️ Best Practices

### 1. Monitoring
```bash
# Cek health account setiap hari
curl http://localhost:5002/api/accounts/1/health

# Monitor rate limit
# Jika sering kena rate limit = terlalu agresif
```

### 2. Rotation Strategy
```
- Gunakan multiple accounts (3-5 accounts)
- Rotate antar accounts
- 1 account = 1 job
- Jangan 1 account untuk banyak job
```

### 3. Warm-up Period
```
Hari 1-3:   1 job, interval 60 menit
Hari 4-7:   1 job, interval 45 menit
Hari 8-14:  2 jobs, interval 30 menit
Hari 15+:   Normal operation
```

### 4. Red Flags (Tanda Bahaya)
```
❌ Rate limit error sering muncul
❌ Cookie expired < 7 hari
❌ Akun kena checkpoint
❌ Shadowban (engagement turun drastis)
❌ "Suspicious activity" warning
```

## 🚫 Hal yang HARUS DIHINDARI

### 1. Automation yang Terlalu Obvious
```
❌ Request setiap 1-5 menit (bot pattern)
❌ Grab 24/7 non-stop
❌ Selalu tepat waktu (misal: setiap jam 00:00)
❌ Request dari datacenter IP
```

### 2. Multiple Accounts dari 1 IP
```
❌ 10+ accounts dari 1 IP
❌ Semua account aktif bersamaan
❌ Pattern yang sama untuk semua account
```

### 3. Aggressive Posting
```
❌ Auto-post setiap grab
❌ Post > 50 tweets per hari
❌ Post di tengah malam
❌ Semua post dengan format yang sama
```

## 📈 Metrics untuk Monitor

### Daily Metrics
```
- Total requests: < 500 per hari
- Rate limit hits: 0-2 per hari (max)
- Cookie lifetime: > 7 hari
- Job success rate: > 90%
```

### Weekly Metrics
```
- Account health checks: 7x per minggu
- Cookie refresh: 0-1x per minggu
- Checkpoint/ban: 0
- Engagement rate: stabil atau naik
```

## 🔄 Cookie Refresh Schedule

### Recommended Schedule
```
Week 1: No refresh (cookie fresh)
Week 2: Check health 1x per hari
Week 3: Refresh jika status "expired"
Week 4: Refresh preventive (sebelum expired)
```

### Manual Refresh Process
```
1. Stop semua jobs untuk account tersebut
2. Login ke x.com di browser
3. Browse timeline 2-3 menit (simulate human)
4. Export cookies dengan Cookie-Editor
5. Update cookies di dashboard
6. Test health check
7. Resume jobs
```

## 💡 Tips Tambahan

### 1. Diversifikasi Aktivitas
```
- Jangan hanya grab media
- Sesekali like/retweet manual
- Reply ke beberapa tweets
- Update profile/bio sesekali
```

### 2. Gunakan Multiple Proxies
```
- 1 proxy untuk grab
- 1 proxy untuk post
- Rotate proxy setiap 24 jam
```

### 3. Backup Strategy
```
- Backup cookies setiap refresh
- Simpan User-Agent yang digunakan
- Log semua aktivitas
- Siapkan account cadangan
```

## ⚠️ Warning Signs

Jika melihat tanda-tanda ini, **STOP semua automation**:

```
1. ❌ "Your account is suspended"
2. ❌ "Verify your phone number"
3. ❌ "Unusual activity detected"
4. ❌ Rate limit > 5x per hari
5. ❌ Cookie expired < 3 hari
6. ❌ Engagement turun > 50%
```

## 📞 Support

Jika akun kena masalah:
1. Stop semua automation
2. Login manual di browser
3. Selesaikan verifikasi jika ada
4. Tunggu 24-48 jam
5. Mulai lagi dengan setting lebih conservative

---

**Remember:** Slow and steady wins the race. Better safe than banned! 🐢✅
