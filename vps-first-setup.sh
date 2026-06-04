#!/bin/bash
# VPS First-Time Setup Script
# Run this ONCE on VPS after fresh aaPanel install

set -e

echo "=== X-Automation VPS Setup ==="
echo "This will install Node.js, PostgreSQL, and PM2"
echo ""

# Install Node.js 20 via nvm
if [ ! -d "$HOME/.nvm" ]; then
  echo "Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

echo "Installing Node.js 20..."
nvm install 20
nvm use 20
nvm alias default 20

# Enable corepack for pnpm
echo "Enabling pnpm..."
corepack enable
corepack prepare pnpm@latest --activate

# Install PM2 globally
echo "Installing PM2..."
npm install -g pm2

# Setup PM2 startup
pm2 startup systemd -u ubuntu --hp /home/ubuntu
echo "Run the command above if PM2 asks"

# PostgreSQL setup (if not installed via aaPanel)
if ! command -v psql &> /dev/null; then
  echo "PostgreSQL not found. Install via aaPanel > App Store > PostgreSQL"
  echo "After install, create database:"
  echo "  sudo -u postgres psql"
  echo "  CREATE DATABASE x_automation;"
  echo "  CREATE USER x_user WITH PASSWORD 'your_secure_password';"
  echo "  GRANT ALL PRIVILEGES ON DATABASE x_automation TO x_user;"
else
  echo "PostgreSQL already installed ✓"
fi

# Create app directory
APP_DIR="/www/wwwroot/x-automations"
if [ ! -d "$APP_DIR" ]; then
  echo "Creating app directory..."
  sudo mkdir -p "$APP_DIR"
  sudo chown ubuntu:ubuntu "$APP_DIR"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Setup PostgreSQL via aaPanel (if not done)"
echo "2. Create database 'x_automation'"
echo "3. Run deploy from localhost: ./deploy-to-vps.sh"
echo "4. Setup Nginx reverse proxy in aaPanel:"
echo "   - Create site: xauto.yourdomain.com"
echo "   - Reverse proxy: http://127.0.0.1:5002"
echo "   - Enable SSL via aaPanel"
echo ""
