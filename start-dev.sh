#!/bin/bash

# Start PostgreSQL if not running
echo "🔧 Checking PostgreSQL..."
export PATH="/tmp/pgsql/bin:$PATH"
export PGDATA="$PWD/.pgdata"
if ! lsof -i:5433 >/dev/null 2>&1; then
  echo "Starting PostgreSQL on port 5433..."
  pg_ctl -D .pgdata -l .pgdata/logfile start -o "-p 5433"
  sleep 2
else
  echo "PostgreSQL already running on port 5433"
fi

# Load environment variables from .env file (supports spaces in values)
if [ -f .env ]; then
  while IFS='=' read -r key value; do
    # skip comments/empty lines
    if [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]]; then
      continue
    fi
    # trim leading/trailing spaces from key
    key="$(echo "$key" | xargs)"
    # preserve value as-is (except trailing CR)
    value="${value%$'\r'}"
    export "$key=$value"
  done < .env
fi

echo "🚀 Starting unified server on port $PORT..."

# Start the development servers
pnpm run dev
