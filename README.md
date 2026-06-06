# X-Automations

**Deskripsi:** X (Twitter) & Social Media Automation Platform  
**URL:** https://x-auto.web.id  
**Port:** 5002 (backend API)  
**Tech Stack:** Node.js + TypeScript + Drizzle ORM + PostgreSQL + Playwright

## Fitur
- X/Twitter automation (post, reply, schedule)
- Multi-account management
- Cookie management & session handling
- Browser automation (Playwright)
- Campaign scheduling & analytics
- Best practices monitoring (account health)
- Cookie expiry detection & recovery
- Social media content automation

## Database
- Type: PostgreSQL
- Database: `xwebsite`
- User: `xwebsite`
- Backup: `backups/xwebsite_*.sql.gz` (5 terakhir)
- **Shared dengan:** enowxai (sama DB)

## URL & Access
- Dashboard: https://x-auto.web.id
- Admin: Check credentials di .env

## Dokumentasi Internal
Repo punya dokumentasi lengkap:
- `CARA-MENJALANKAN.md` - cara jalankan
- `API.md` - API reference
- `BEST-PRACTICES-AKUN-AWET.md` - account health best practices
- `COOKIE-EXPIRED.md` - handle cookie expiry
- `COOKIE-TEST-SUCCESS.md` - cookie test results
- `CHANGELOG.md` - version history

## Backup
Otomatis **00:00 WIB** setiap hari:
- Source code → GitHub
- Postgres → `backups/xwebsite_YYYY-MM-DD_HHMM.sql.gz`

## Restore di VPS Baru

### 1. Clone
```bash
cd /opt
git clone git@github.com:arkhindi12/x-automations.git
cd x-automations
```

### 2. Database restore
```bash
# DB shared dengan enowxai, restore sekali saja
sudo -u postgres createdb xwebsite 2>/dev/null || true
sudo -u postgres createuser xwebsite 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL ON DATABASE xwebsite TO xwebsite;"

# Restore
gunzip -c backups/xwebsite_*.sql.gz | sudo -u xwebsite psql xwebsite
```

### 3. Install & dependencies
```bash
npm install
# atau pnpm install

# Install Playwright browsers
npx playwright install chromium
npx playwright install-deps
```

### 4. Environment
```bash
cp .env.example .env
nano .env
# DATABASE_URL=postgresql://xwebsite:***@127.0.0.1:5432/xwebsite
# PORT=5002
# X_API_KEY, X_API_SECRET (if needed)
# PROXY_LIST (optional)
```

### 5. Build
```bash
npm run build
```

### 6. Start
```bash
pm2 start ecosystem.config.js --name x-automations
pm2 save
```

### 7. Nginx config
```bash
sudo nano /etc/nginx/sites-available/x-auto.web.id
```

Config:
```nginx
server {
    listen 80;
    server_name x-auto.web.id;
    
    location / {
        proxy_pass http://127.0.0.1:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    
    # API static artifacts
    location /artifacts {
        alias /opt/x-automations/artifacts/x-automation/dist/public;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/x-auto.web.id /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 8. SSL
```bash
sudo certbot --nginx -d x-auto.web.id
```

### 9. Verify
```bash
pm2 logs x-automations
curl http://localhost:5002
curl https://x-auto.web.id
```

## Important Notes
- **Chromium binary:** `/home/ubuntu/.cache/ms-playwright/` (from ubuntu user)
- **PM2 user:** Usually `ubuntu` (check current PM2 config)
- **Cookie management:** See `COOKIE-EXPIRED.md` untuk handle session expiry
- **Account health:** Follow `BEST-PRACTICES-AKUN-AWET.md` untuk account longevity

---
*Auto-backup enabled. Last update: 2026-06-06*
