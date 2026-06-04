#!/bin/bash
# Script untuk restart semua service dengan konfigurasi yang benar

echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║              RESTART ALL SERVICES (FULL RESET)                       ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

cd "$HOME/Downloads/X automation"
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 2>/dev/null
corepack prepare pnpm@10.23.0 --activate >/dev/null

# Stop all services
echo "1. Stopping all services..."
lsof -ti:3006 | xargs kill -9 2>/dev/null
lsof -ti:5001 | xargs kill -9 2>/dev/null
sleep 2

# Start backend
echo "2. Starting backend..."
export DATABASE_URL=postgresql://postgres@localhost:5433/x_automation
export PORT=3006
export NODE_ENV=development
export LOG_LEVEL=info

nohup pnpm --filter @workspace/api-server run dev > .api-server.log 2>&1 &
sleep 5

if lsof -i:3006 >/dev/null 2>&1; then
  echo "   ✅ Backend running on port 3006"
else
  echo "   ❌ Backend failed to start"
  exit 1
fi

# Start frontend
echo "3. Starting frontend..."
export API_PROXY_TARGET=http://127.0.0.1:3006
export PORT=5001
export BASE_PATH=/

nohup pnpm --filter @workspace/x-automation run dev > .frontend.log 2>&1 &
sleep 8

if lsof -i:5001 >/dev/null 2>&1; then
  echo "   ✅ Frontend running on port 5001"
else
  echo "   ❌ Frontend failed to start"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║                    ✅ ALL SERVICES RUNNING                           ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Services:"
echo "  ✅ PostgreSQL: port 5433"
echo "  ✅ Backend API: port 3006"
echo "  ✅ Frontend UI: port 5001"
echo ""
echo "Proxy config:"
echo "  /api → http://127.0.0.1:3006"
echo ""
echo "🌐 Buka di browser: http://localhost:5001"
echo ""
echo "Rate limit telah di-reset. Silakan test connection lagi."
echo ""
