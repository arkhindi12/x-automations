# Test Cookie Login X

## Status Saat Ini

✅ **Cookie parser logic** sudah ditest dan bekerja  
✅ **Diagnostic logic** sudah ditest dalam simulation mode  
❌ **Real X API test** belum bisa karena butuh:
- PostgreSQL database
- API server running
- Cookie asli dari akun X yang valid

---

## Error 403 yang Kamu Alami

Error 403 terjadi karena:

1. **Port 3000** yang jalan adalah **Vite dev server** (frontend), bukan API server
2. **Port 5000** sudah dipakai oleh macOS ControlCenter
3. **API server belum jalan** karena belum ada PostgreSQL database

---

## Cara Test Cookie (3 Opsi)

### Opsi 1: Simulation Test (Tanpa Database) ✅ SUDAH JALAN

Test parsing cookie tanpa koneksi ke X API:

```bash
node test-cookie-diagnostic.mjs
```

Hasil:
```
✅ DIAGNOSTIC PASSED
Cookie parsing berhasil untuk @test_username
```

### Opsi 2: Install PostgreSQL + Test Real API

#### Step 1: Install PostgreSQL

```bash
# Install Homebrew (akan minta password)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Tambahkan Homebrew ke PATH
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
eval "$(/opt/homebrew/bin/brew shellenv)"

# Install PostgreSQL
brew install postgresql@16

# Start PostgreSQL
brew services start postgresql@16

# Buat database
createdb x_automation
```

#### Step 2: Update .env

```bash
cat > .env << 'EOF'
DATABASE_URL=postgresql://$(whoami)@localhost:5432/x_automation
NODE_ENV=development
PORT=3001
FRONTEND_PORT=5001
LOG_LEVEL=debug
EOF
```

#### Step 3: Run Migration

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
corepack prepare pnpm@10.23.0 --activate

pnpm --filter @workspace/db run push
```

#### Step 4: Start API Server

```bash
pnpm --filter @workspace/api-server run dev
```

Server akan jalan di `http://localhost:3001`

#### Step 5: Test dengan Cookie Asli

1. Login ke `https://x.com` di browser
2. Install extension **Cookie-Editor** atau **EditThisCookie**
3. Export cookies sebagai JSON
4. Copy `cookie-test-template.json` ke `cookie-test.json`:
   ```bash
   cp cookie-test-template.json cookie-test.json
   ```
5. Edit `cookie-test.json`:
   - Ganti `YOUR_X_USERNAME_WITHOUT_@` dengan username X kamu
   - Ganti `PASTE_YOUR_AUTH_TOKEN_HERE` dengan nilai `auth_token` dari export
   - Ganti `PASTE_YOUR_CT0_HERE` dengan nilai `ct0` dari export
6. Test via curl:
   ```bash
   curl -X POST http://localhost:3001/api/accounts/test-diagnostic \
     -H "Content-Type: application/json" \
     -d @cookie-test.json
   ```

### Opsi 3: Test via UI (Setelah PostgreSQL Setup)

#### Start Frontend

```bash
export API_PROXY_TARGET=http://127.0.0.1:3001
export PORT=5001
export BASE_PATH=/

pnpm --filter @workspace/x-automation run dev
```

#### Akses UI

Buka browser: `http://localhost:5001`

1. Masuk halaman **Accounts**
2. Klik **Add Account**
3. Pilih **Cookies Login**
4. Isi form:
   - Username: tanpa `@`
   - Cookie JSON: paste dari Cookie-Editor
   - User-Agent: copy dari browser
5. Klik **Test Connection**

---

## Troubleshooting

### Port sudah dipakai

```bash
# Cek port yang dipakai
lsof -i :3001
lsof -i :5001

# Kill process jika perlu
kill -9 <PID>
```

### PostgreSQL tidak bisa connect

```bash
# Cek status PostgreSQL
brew services list

# Restart PostgreSQL
brew services restart postgresql@16

# Test connection
psql -d x_automation -c "SELECT 1"
```

### Cookie ditolak X

Penyebab umum:
- `auth_token` atau `ct0` tidak ada
- Cookie expired (login ulang)
- Username tidak match dengan cookie
- IP server beda negara (pakai proxy)
- Akun kena checkpoint (selesaikan verifikasi manual)

---

## Files yang Dibuat

- `test-cookie-parse.mjs` - Test parsing cookie JSON
- `test-cookie-diagnostic.mjs` - Test diagnostic logic lengkap
- `cookie-test-template.json` - Template untuk test dengan cookie asli
- `.env` - Environment variables (DATABASE_URL perlu diupdate)
- `TEST-COOKIE-LOGIN.md` - File ini

---

## Next Steps

1. ✅ Cookie parser logic sudah ditest
2. ⏳ Install PostgreSQL (butuh password sudo)
3. ⏳ Setup database dan migration
4. ⏳ Test real login dengan cookie asli
5. ⏳ Deploy ke production

---

## Kesimpulan

**Cookie login logic sudah siap dan ditest dalam simulation mode.**

Untuk test real login ke X API, kamu perlu:
1. Install PostgreSQL (butuh password sudo)
2. Jalankan API server
3. Pakai cookie asli dari akun X yang valid

Kalau kamu sudah install PostgreSQL dan punya cookie asli, kirim **hasil error JSON** (tanpa cookie value) ke saya untuk analisis lebih lanjut.
