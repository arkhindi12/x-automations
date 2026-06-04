# Panduan Instalasi X Automation Dashboard di aaPanel

## Persyaratan Server
- VPS/Server dengan Ubuntu 20.04 / 22.04
- aaPanel sudah terinstall
- RAM minimal 1 GB
- Akses SSH / Terminal

---

## ⚡ Instalasi Otomatis (Direkomendasikan)

Upload file project ke server, lalu jalankan:

```bash
cd /www/wwwroot/x-automation
sudo bash install.sh
```

Script ini akan otomatis mengurus semua langkah di bawah — install Node.js, pnpm, PM2, yt-dlp, ffmpeg, setup database, build, dan menjalankan aplikasi. Setelah selesai, tinggal setup Reverse Proxy di aaPanel.

---

## Instalasi Manual (Langkah per Langkah)

## Langkah 1: Install Dependensi di Terminal Server

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PM2 (process manager)
npm install -g pm2

# Install Python3 dan yt-dlp
sudo apt-get install -y python3 python3-pip
pip3 install yt-dlp
```

---

## Langkah 2: Upload & Ekstrak File

1. Buka **aaPanel → File Manager**
2. Navigasi ke `/www/wwwroot/`
3. Upload file `x-automation.tar.gz` ini
4. Klik kanan → **Extract** → ekstrak ke folder `x-automation`
5. Masuk ke folder: `/www/wwwroot/x-automation`

Atau via SSH:
```bash
cd /www/wwwroot
tar -xzf x-automation.tar.gz -C x-automation
cd x-automation
```

---

## Langkah 3: Setup Database PostgreSQL

1. Di aaPanel → **Database** → **PostgreSQL** → **Add Database**
   - Database Name: `x_automation`
   - Username: `x_automation_user`
   - Password: (catat passwordnya)

2. Atau via terminal:
```bash
sudo -u postgres psql
CREATE DATABASE x_automation;
CREATE USER x_automation_user WITH PASSWORD 'passwordkamu';
GRANT ALL PRIVILEGES ON DATABASE x_automation TO x_automation_user;
\q
```

---

## Langkah 4: Konfigurasi Environment

Buat file `.env` di folder project:
```bash
cd /www/wwwroot/x-automation
cp .env.example .env
nano .env
```

Isi file `.env` (atau edit sesuai kebutuhan):
```
DATABASE_URL=postgresql://x_automation_user:passwordkamu@localhost:5432/x_automation
NODE_ENV=production
PORT=3000
FRONTEND_PORT=5000
LOG_LEVEL=info

# Optional: 9Proxy configuration (jika menggunakan proxy service)
# NINEPROXY_API_KEY=your_api_key_here
# NINEPROXY_GATEWAY=your_gateway_here
# NINEPROXY_BASE_URL=https://api.9proxy.com
```

**Catatan Penting:**
- `DATABASE_URL` wajib diisi dengan connection string PostgreSQL yang benar
- `PORT` dan `FRONTEND_PORT` harus berbeda dan tidak digunakan aplikasi lain
- Gunakan password yang kuat untuk database di production
- File `.env.example` tersedia sebagai template reference

---

## Langkah 5: Install & Build Aplikasi

```bash
cd /www/wwwroot/x-automation

# Install semua dependensi
pnpm install

# Migrasi database (buat tabel)
pnpm --filter @workspace/db run push

# Build aplikasi
pnpm run build
```

---

## Langkah 6: Jalankan dengan PM2

```bash
cd /www/wwwroot/x-automation

# Jalankan backend (port 3000)
pm2 start "node --enable-source-maps artifacts/api-server/dist/index.mjs" --name x-auto-api

# Jalankan frontend (port 5000)
pm2 start "pnpm --filter @workspace/x-automation run preview --port 5000 --host 0.0.0.0" --name x-auto-web

# Simpan agar otomatis jalan saat server restart
pm2 save
pm2 startup
```

---

## Langkah 7: Setup Website & Reverse Proxy di aaPanel

1. **aaPanel → Website → Add Site**
   - Domain: `domainmu.com` (atau subdomain)
   - PHP Version: Pure Static
   - Klik Submit

2. **Klik nama website → Config → Reverse Proxy → Add Reverse Proxy**
   - Proxy Name: `x-automation`
   - Target URL: `http://127.0.0.1:5000`
   - Klik Confirm

3. **Pasang SSL (opsional tapi disarankan)**
   - Klik **SSL → Let's Encrypt**
   - Centang domain → Apply
   - Aktifkan Force HTTPS

---

## Langkah 8: Akses Aplikasi

Buka browser dan akses: `https://domainmu.com`

---

## Troubleshooting

**Cek status aplikasi:**
```bash
pm2 list
pm2 logs x-auto-api
pm2 logs x-auto-web
```

**Restart aplikasi:**
```bash
pm2 restart x-auto-api
pm2 restart x-auto-web
```

**Cek yt-dlp:**
```bash
which yt-dlp
yt-dlp --version
```

**Port sudah terpakai:**
```bash
ss -tlnp | grep LISTEN
# Ganti port di .env jika diperlukan
```

---

## Catatan Penting
- Pastikan port 3000 dan 5000 tidak dipakai aplikasi lain
- Backup database secara berkala
- Update yt-dlp secara berkala: `pip3 install -U yt-dlp`
