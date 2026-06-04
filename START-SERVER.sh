#!/bin/bash
set -e

cd "$HOME/Downloads/X automation"

echo "🔧 Starting PostgreSQL..."
export PATH="/tmp/pgsql/bin:$PATH"
export PGDATA="$PWD/.pgdata"
if ! lsof -i:5433 >/dev/null 2>&1; then
  pg_ctl -D .pgdata -l .pgdata/logfile start -o "-p 5433"
  sleep 2
fi

echo "🚀 Starting Unified Server (Backend + Frontend)..."
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
corepack prepare pnpm@10.23.0 --activate >/dev/null

lsof -ti:3000 | xargs kill -9 2>/dev/null || true

export DATABASE_URL=postgresql://postgres@localhost:5433/x_automation
export PORT=3000
export NODE_ENV=development

nohup pnpm --filter @workspace/api-server run start > .unified-server.log 2>&1 &

sleep 6

if lsof -i:3000 >/dev/null 2>&1; then
  echo ""
  echo "✅ Server berjalan di:"
  echo ""
  echo "   http://localhost:3000"
  echo ""
  echo "📋 Log server:"
  echo "   tail -f .unified-server.log"
  echo ""
else
  echo "❌ Server gagal start. Cek log:"
  tail -40 .unified-server.log
  exit 1
fi
