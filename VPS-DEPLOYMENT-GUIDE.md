# VPS Deployment Guide - X Automations

## Server Info
- **IP:** 43.133.136.244
- **User:** ubuntu
- **Port:** 22
- **Panel:** aaPanel
- **Target Path:** `/www/wwwroot/x-automations`

---

## First Time Setup (Run Once)

### 1. Upload Setup Script ke VPS
```bash
scp -P 22 vps-first-setup.sh ubuntu@43.133.136.244:/tmp/
```

### 2. SSH ke VPS dan Jalankan Setup
```bash
ssh -p 22 ubuntu@43.133.136.244
cd /tmp
chmod +x vps-first-setup.sh
./vps-first-setup.sh
```

Setup script akan install:
- Node.js 20 via nvm
- pnpm via corepack
- PM2 global
- PostgreSQL (via aaPanel atau manual)
- Create folder `/www/wwwroot/x-automations`

### 3. Setup PostgreSQL di aaPanel

**Via aaPanel Web UI:**
1. Login aaPanel: `http://43.133.136.244:7800`
2. Database → PostgreSQL → Install
3. Create database: `x_automation`
4. Create user: `postgres` / password bebas
5. Port default: `5432`

**Atau via command line:**
```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib -y

# Create database
sudo -u postgres psql -c "CREATE DATABASE x_automation;"
sudo -u postgres psql -c "CREATE USER xauto WITH PASSWORD 'your-password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE x_automation TO xauto;"
```

### 4. Setup Nginx di aaPanel

**Via aaPanel Web UI:**
1. Website → Add Site
2. Domain: `43.133.136.244` atau `yourdomain.com`
3. Path: `/www/wwwroot/x-automations/artifacts/x-automation/dist/public`
4. PHP: None (Node.js app)

**Nginx Config:**
```nginx
location /api {
    proxy_pass http://127.0.0.1:5002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    root /www/wwwroot/x-automations/artifacts/x-automation/dist/public;
    try_files $uri $uri/ /index.html;
    index index.html;
}
```

---

## Daily Deployment (Localhost → VPS)

### Deploy Command
```bash
./deploy-to-vps.sh
```

**Apa yang terjadi:**
1. Rsync code dari localhost ke VPS (exclude node_modules, .git)
2. SSH ke VPS
3. Install dependencies (`pnpm install`)
4. Build backend (`pnpm --filter @workspace/api-server run build`)
5. Build frontend (`pnpm --filter @workspace/x-automation run build`)
6. Restart PM2 (`pm2 restart x-automation`)

**Estimasi waktu:** 2-5 menit

---

## PM2 Management

### Start App
```bash
ssh ubuntu@43.133.136.244
cd /www/wwwroot/x-automations
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Check Status
```bash
pm2 status
pm2 logs x-automation
pm2 monit
```

### Restart
```bash
pm2 restart x-automation
```

### Stop
```bash
pm2 stop x-automation
```

---

## Environment Variables di VPS

Edit `.env` di VPS:
```bash
ssh ubuntu@43.133.136.244
cd /www/wwwroot/x-automations
nano .env
```

**Required:**
```env
NODE_ENV=production
PORT=5002
DATABASE_URL=postgresql://xauto:your-password@localhost:5432/x_automation
FRONTEND_URL=http://43.133.136.244
```

**Optional:**
```env
STREAMTAPE_LOGIN=81bb931eabacab29ca45
STREAMTAPE_KEY=JkzPYWAK76Ij0jb
SMART_EXTRACT_CONCURRENCY=6
STREAMTAPE_UPLOAD_CONCURRENCY=2
```

---

## Database Migration

### Export dari Localhost
```bash
./export-database.sh
```

### Import ke VPS
```bash
# Upload dump
scp -P 22 database-export-*.tar.gz ubuntu@43.133.136.244:/tmp/

# SSH dan import
ssh ubuntu@43.133.136.244
cd /tmp
tar -xzf database-export-*.tar.gz
cd database-export-*
./import-to-server.sh
```

---

## Troubleshooting

### Deploy Gagal
```bash
# Check rsync log
cat /tmp/deploy-rsync.log

# Manual SSH check
ssh ubuntu@43.133.136.244
cd /www/wwwroot/x-automations
pnpm install
pnpm --filter @workspace/api-server run build
```

### App Tidak Jalan
```bash
# Check PM2 logs
ssh ubuntu@43.133.136.244
pm2 logs x-automation --lines 100

# Check port
netstat -tulpn | grep 5002

# Restart
pm2 restart x-automation
```

### Database Connection Error
```bash
# Check PostgreSQL
sudo systemctl status postgresql
sudo -u postgres psql -c "\l"

# Test connection
psql "postgresql://xauto:password@localhost:5432/x_automation" -c "SELECT 1;"
```

### Nginx Error
```bash
# Check nginx config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Check logs
tail -f /www/wwwlogs/access.log
tail -f /www/wwwlogs/error.log
```

---

## Security Checklist

- [ ] Change default SSH port (22 → 2222)
- [ ] Setup UFW firewall
- [ ] Disable root SSH login
- [ ] Setup fail2ban
- [ ] Enable HTTPS via aaPanel SSL (Let's Encrypt)
- [ ] Setup database backup cron
- [ ] Setup PM2 log rotation

---

## Backup Strategy

### Auto Backup Script (Cron)
```bash
# Add to crontab
crontab -e

# Daily backup at 3 AM
0 3 * * * /www/wwwroot/x-automations/export-database.sh
```

### Manual Backup
```bash
ssh ubuntu@43.133.136.244
cd /www/wwwroot/x-automations
./export-database.sh
```

---

## Quick Commands

```bash
# Deploy
./deploy-to-vps.sh

# Check status
ssh ubuntu@43.133.136.244 "pm2 status"

# View logs
ssh ubuntu@43.133.136.244 "pm2 logs x-automation --lines 50"

# Restart
ssh ubuntu@43.133.136.244 "pm2 restart x-automation"

# Database backup
ssh ubuntu@43.133.136.244 "cd /www/wwwroot/x-automations && ./export-database.sh"
```

---

## Next Steps

1. Run `vps-first-setup.sh` di VPS
2. Setup PostgreSQL via aaPanel
3. Setup Nginx reverse proxy
4. Upload database dump
5. Run `./deploy-to-vps.sh` pertama kali
6. Setup PM2 startup
7. Test akses: `http://43.133.136.244:5002`
8. Setup domain + SSL (opsional)

---

**Support:** Kalau ada error, cek PM2 logs dan Nginx logs dulu.
