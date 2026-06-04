#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}"
echo "=================================================="
echo "   X Automation Dashboard - Auto Installer"
echo "=================================================="
echo -e "${NC}"

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── 1. Cek root ────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Jalankan script ini sebagai root (sudo bash install.sh)${NC}"
  exit 1
fi

echo -e "${GREEN}[1/8] Install dependensi sistem...${NC}"

# Node.js 20
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  echo "  → Install Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null 2>&1
fi
echo "  ✓ Node.js $(node -v)"

# pnpm
if ! command -v pnpm &>/dev/null; then
  echo "  → Install pnpm..."
  npm install -g pnpm >/dev/null 2>&1
fi
echo "  ✓ pnpm $(pnpm -v)"

# PM2
if ! command -v pm2 &>/dev/null; then
  echo "  → Install PM2..."
  npm install -g pm2 >/dev/null 2>&1
fi
echo "  ✓ PM2 $(pm2 -v)"

# ffmpeg
if ! command -v ffmpeg &>/dev/null; then
  echo "  → Install ffmpeg..."
  apt-get install -y ffmpeg >/dev/null 2>&1
fi
echo "  ✓ ffmpeg"

# yt-dlp (install sebagai binary langsung)
echo "  → Install/update yt-dlp..."
curl -sSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
echo "  ✓ yt-dlp $(/usr/local/bin/yt-dlp --version)"

# ─── 2. Konfigurasi Database ────────────────────────────
echo ""
echo -e "${GREEN}[2/8] Konfigurasi Database PostgreSQL...${NC}"

if [ ! -f "$INSTALL_DIR/.env" ]; then
  echo ""
  echo -e "${YELLOW}Masukkan informasi database PostgreSQL:${NC}"
  read -rp "  Host database [localhost]: " DB_HOST
  DB_HOST="${DB_HOST:-localhost}"
  read -rp "  Port database [5432]: " DB_PORT
  DB_PORT="${DB_PORT:-5432}"
  read -rp "  Nama database [x_automation]: " DB_NAME
  DB_NAME="${DB_NAME:-x_automation}"
  read -rp "  Username database [x_automation_user]: " DB_USER
  DB_USER="${DB_USER:-x_automation_user}"
  read -rsp "  Password database: " DB_PASS
  echo ""
  read -rp "  Port backend API [3000]: " API_PORT
  API_PORT="${API_PORT:-3000}"
  read -rp "  Port frontend [5000]: " FRONT_PORT
  FRONT_PORT="${FRONT_PORT:-5000}"

  cat > "$INSTALL_DIR/.env" <<EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}
NODE_ENV=production
PORT=${API_PORT}
FRONTEND_PORT=${FRONT_PORT}
EOF
  echo "  ✓ File .env berhasil dibuat"
else
  echo "  ✓ File .env sudah ada, dilewati"
  API_PORT=$(grep "^PORT=" "$INSTALL_DIR/.env" | cut -d= -f2 | tr -d ' ')
  API_PORT="${API_PORT:-3000}"
  FRONT_PORT=$(grep "^FRONTEND_PORT=" "$INSTALL_DIR/.env" | cut -d= -f2 | tr -d ' ')
  FRONT_PORT="${FRONT_PORT:-5000}"
fi

# Load env
export $(grep -v '^#' "$INSTALL_DIR/.env" | xargs)

# ─── 3. Install npm dependencies ────────────────────────
echo ""
echo -e "${GREEN}[3/8] Install dependencies (pnpm install)...${NC}"
cd "$INSTALL_DIR"
pnpm install --frozen-lockfile 2>&1 | tail -3
echo "  ✓ Dependencies terinstall"

# ─── 4. Migrasi database ────────────────────────────────
echo ""
echo -e "${GREEN}[4/8] Migrasi database (buat tabel)...${NC}"
pnpm --filter @workspace/db run push 2>&1 | tail -3
echo "  ✓ Tabel database berhasil dibuat"

# ─── 5. Build aplikasi ──────────────────────────────────
echo ""
echo -e "${GREEN}[5/8] Build aplikasi...${NC}"
pnpm run build 2>&1 | tail -5
echo "  ✓ Build selesai"

# ─── 6. Hentikan proses lama jika ada ───────────────────
echo ""
echo -e "${GREEN}[6/8] Hentikan proses PM2 lama (jika ada)...${NC}"
pm2 delete x-auto-api 2>/dev/null || true
pm2 delete x-auto-web 2>/dev/null || true

# ─── 7. Jalankan dengan PM2 ─────────────────────────────
echo ""
echo -e "${GREEN}[7/8] Jalankan aplikasi dengan PM2...${NC}"

pm2 start \
  --name x-auto-api \
  --env-file "$INSTALL_DIR/.env" \
  -- node --enable-source-maps "$INSTALL_DIR/artifacts/api-server/dist/index.mjs"

pm2 start \
  --name x-auto-web \
  -- pnpm --filter @workspace/x-automation run preview --port "$FRONT_PORT" --host 0.0.0.0

pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash 2>/dev/null || true

echo "  ✓ PM2 berjalan"

# ─── 8. Selesai ─────────────────────────────────────────
echo ""
echo -e "${GREEN}[8/8] Instalasi selesai!${NC}"
echo ""
echo -e "${GREEN}=================================================="
echo "  STATUS APLIKASI"
echo "==================================================${NC}"
pm2 list
echo ""
echo -e "${YELLOW}Langkah selanjutnya di aaPanel:${NC}"
echo "  1. Buka aaPanel → Website → Add Site"
echo "  2. Set domain Anda, PHP: Pure Static"
echo "  3. Config → Reverse Proxy → Target: http://127.0.0.1:${FRONT_PORT}"
echo "  4. (Opsional) Pasang SSL Let's Encrypt"
echo ""
echo -e "${GREEN}Aplikasi berjalan di port:${NC}"
echo "  Frontend : http://SERVER_IP:${FRONT_PORT}"
echo "  Backend  : http://SERVER_IP:${API_PORT}"
echo ""
echo -e "${YELLOW}Perintah berguna:${NC}"
echo "  pm2 list              → cek status"
echo "  pm2 logs x-auto-api   → log backend"
echo "  pm2 logs x-auto-web   → log frontend"
echo "  pm2 restart all       → restart semua"
echo ""
