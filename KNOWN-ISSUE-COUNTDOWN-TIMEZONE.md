# Known Issue: Countdown Timer Timezone

## Masalah

Countdown timer di halaman Jobs menunjukkan waktu yang salah (biasanya +7 jam lebih lama).

Contoh:
- Schedule: 30 menit
- Countdown menunjukkan: 420+ menit
- Atau menunjukkan: "Running soon..." padahal masih lama

## Penyebab

Database column `next_run` menggunakan `timestamptz` (timestamp with timezone), tapi Drizzle ORM serialize ke JSON dengan timezone yang salah.

Database: `09:25:25+07` (09:25 WIB = 02:25 UTC)
API Response: `"2026-05-13T09:25:25Z"` (09:25 UTC, seharusnya 02:25 UTC)
Frontend calculate: 09:25 UTC - 01:55 UTC = 7 jam 30 menit (salah!)

## Workaround Sementara

1. **Refresh halaman** setelah toggle job ON/OFF
2. **Lihat database langsung** untuk waktu yang benar:
   ```bash
   psql -p 5433 -U postgres -d x_automation -c "SELECT id, name, next_run, now(), (next_run - now()) as time_remaining FROM jobs;"
   ```

## Fix Permanen (TODO)

Opsi 1: Gunakan `timestamp without timezone` dan simpan waktu UTC
Opsi 2: Gunakan Unix timestamp (integer) untuk `next_run`
Opsi 3: Fix Drizzle timezone serialization
Opsi 4: Frontend adjust timezone offset manual

## Status

Issue ini tidak mempengaruhi eksekusi job. Job tetap jalan sesuai schedule yang benar di database. Hanya tampilan countdown di UI yang salah.
