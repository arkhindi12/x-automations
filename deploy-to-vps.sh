#!/bin/bash
set -e

# VPS Configuration
VPS_HOST="43.133.136.244"
VPS_PORT="22"
VPS_USER="ubuntu"
VPS_PATH="/www/wwwroot/x-automations"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  X-Automations Deploy to VPS${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if sshpass is available (optional, for password auth)
if ! command -v sshpass &> /dev/null; then
    echo -e "${YELLOW}Note: sshpass not found. You'll need to enter password manually.${NC}"
    echo -e "${YELLOW}Install: brew install hudochenkov/sshpass/sshpass (macOS)${NC}"
    echo ""
    SSH_CMD="ssh -p $VPS_PORT $VPS_USER@$VPS_HOST"
    RSYNC_CMD="rsync"
else
    SSH_CMD="sshpass -p 'UPM-ULq-F6s-2ZK' ssh -p $VPS_PORT $VPS_USER@$VPS_HOST"
    RSYNC_CMD="sshpass -p 'UPM-ULq-F6s-2ZK' rsync"
fi

# Test connection
echo -e "${YELLOW}[1/6] Testing VPS connection...${NC}"
if $SSH_CMD "echo 'Connection OK'" 2>/dev/null; then
    echo -e "${GREEN}✓ Connected to VPS${NC}"
else
    echo -e "${RED}✗ Cannot connect to VPS. Check credentials.${NC}"
    exit 1
fi

# Create backup on VPS
echo -e "${YELLOW}[2/6] Creating backup on VPS...${NC}"
$SSH_CMD "cd $VPS_PATH && tar -czf ../x-automations-backup-\$(date +%Y%m%d-%H%M%S).tar.gz . 2>/dev/null || echo 'No existing files to backup'"
echo -e "${GREEN}✓ Backup created${NC}"

# Sync files to VPS (exclude node_modules, dist, .git, etc)
echo -e "${YELLOW}[3/6] Syncing files to VPS...${NC}"
$RSYNC_CMD -avz --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude '.env.local' \
  --exclude '*.log' \
  --exclude 'pgsql-data' \
  --exclude '.DS_Store' \
  --exclude 'database-export-*' \
  -e "ssh -p $VPS_PORT" \
  ./ $VPS_USER@$VPS_HOST:$VPS_PATH/

echo -e "${GREEN}✓ Files synced${NC}"

# Install dependencies and build
echo -e "${YELLOW}[4/6] Installing dependencies on VPS...${NC}"
$SSH_CMD "cd $VPS_PATH && export PATH=\"\$HOME/.nvm/versions/node/v20.20.2/bin:\$PATH\" && corepack enable && pnpm install --frozen-lockfile"
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Build backend and frontend
echo -e "${YELLOW}[5/6] Building application on VPS...${NC}"
$SSH_CMD "cd $VPS_PATH && export PATH=\"\$HOME/.nvm/versions/node/v20.20.2/bin:\$PATH\" && pnpm --filter @workspace/api-server run build && pnpm --filter @workspace/x-automation run build"
echo -e "${GREEN}✓ Build complete${NC}"

# Restart PM2
echo -e "${YELLOW}[6/6] Restarting application...${NC}"
$SSH_CMD "cd $VPS_PATH && export PATH=\"\$HOME/.nvm/versions/node/v20.20.2/bin:\$PATH\" && pm2 restart x-automations || pm2 start ecosystem.config.js"
echo -e "${GREEN}✓ Application restarted${NC}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deploy Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "VPS: http://$VPS_HOST:5002"
echo -e "Check logs: ssh -p $VPS_PORT $VPS_USER@$VPS_HOST 'cd $VPS_PATH && pm2 logs x-automations'"
echo ""
