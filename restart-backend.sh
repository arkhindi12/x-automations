#!/bin/bash
# Quick script to restart backend and reset rate limit

echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║              RESTART BACKEND & RESET RATE LIMIT                      ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

# Kill backend
echo "Stopping backend..."
lsof -ti:3006 | xargs kill -9 2>/dev/null
sleep 1

# Start backend
echo "Starting backend..."
cd "$HOME/Downloads/X automation"
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 2>/dev/null
corepack prepare pnpm@10.23.0 --activate >/dev/null

export DATABASE_URL=postgresql://postgres@localhost:5433/x_automation
export PORT=3006
export NODE_ENV=development
export LOG_LEVEL=info

nohup pnpm --filter @workspace/api-server run dev > .api-server.log 2>&1 &

echo "Waiting for backend to start..."
sleep 5

# Check status
if lsof -i:3006 >/dev/null 2>&1; then
  echo ""
  echo "✅ Backend restarted successfully!"
  echo ""
  echo "Rate limit telah di-reset."
  echo "Silakan test connection lagi di UI: http://localhost:5001"
else
  echo ""
  echo "❌ Backend failed to start"
  echo ""
  echo "Cek log:"
  echo "  tail -50 .api-server.log"
fi
