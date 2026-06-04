#!/usr/bin/env node
/**
 * Test cookie diagnostic dengan format yang sama seperti UI
 */

const SAMPLE_COOKIE = [
  {
    "domain": ".x.com",
    "name": "auth_token",
    "value": "PASTE_YOUR_AUTH_TOKEN_HERE",
    "path": "/",
    "httpOnly": true,
    "secure": true
  },
  {
    "domain": ".x.com",
    "name": "ct0",
    "value": "PASTE_YOUR_CT0_HERE",
    "path": "/",
    "httpOnly": false,
    "secure": true
  }
];

const payload = {
  username: "YOUR_USERNAME",
  authMode: "cookies",
  cookieJson: JSON.stringify(SAMPLE_COOKIE),
  cookieUserAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  proxyUrl: null
};

console.log("╔══════════════════════════════════════════════════════════════════════╗");
console.log("║              TEST COOKIE DIAGNOSTIC (UI FORMAT)                      ║");
console.log("╚══════════════════════════════════════════════════════════════════════╝");
console.log();

console.log("📋 Payload yang akan dikirim:");
console.log(JSON.stringify(payload, null, 2));
console.log();

console.log("🔍 Validasi payload:");
console.log();

// Validate username
if (!payload.username || payload.username === "YOUR_USERNAME") {
  console.log("❌ Username: BELUM DIISI");
  console.log("   Ganti 'YOUR_USERNAME' dengan username X kamu (tanpa @)");
} else {
  console.log(`✅ Username: ${payload.username}`);
}

// Validate cookieJson
let cookies;
try {
  cookies = JSON.parse(payload.cookieJson);
  console.log(`✅ Cookie JSON: Valid (${cookies.length} cookies)`);
  
  // Check auth_token
  const authToken = cookies.find(c => c.name === "auth_token");
  if (!authToken) {
    console.log("❌ auth_token: TIDAK DITEMUKAN");
  } else if (authToken.value === "PASTE_YOUR_AUTH_TOKEN_HERE") {
    console.log("❌ auth_token: BELUM DIISI (masih placeholder)");
  } else {
    console.log(`✅ auth_token: ${authToken.value.substring(0, 20)}...`);
  }
  
  // Check ct0
  const ct0 = cookies.find(c => c.name === "ct0");
  if (!ct0) {
    console.log("❌ ct0: TIDAK DITEMUKAN");
  } else if (ct0.value === "PASTE_YOUR_CT0_HERE") {
    console.log("❌ ct0: BELUM DIISI (masih placeholder)");
  } else {
    console.log(`✅ ct0: ${ct0.value.substring(0, 20)}...`);
  }
} catch (err) {
  console.log("❌ Cookie JSON: INVALID");
  console.log(`   Error: ${err.message}`);
}

console.log();
console.log("╔══════════════════════════════════════════════════════════════════════╗");
console.log("║                         CARA PAKAI                                   ║");
console.log("╚══════════════════════════════════════════════════════════════════════╝");
console.log();
console.log("1. Edit file ini:");
console.log("   nano test-cookie-ui-format.mjs");
console.log();
console.log("2. Ganti placeholder:");
console.log("   - YOUR_USERNAME → username X kamu (tanpa @)");
console.log("   - PASTE_YOUR_AUTH_TOKEN_HERE → nilai auth_token dari Cookie-Editor");
console.log("   - PASTE_YOUR_CT0_HERE → nilai ct0 dari Cookie-Editor");
console.log();
console.log("3. Jalankan ulang:");
console.log("   node test-cookie-ui-format.mjs");
console.log();
console.log("4. Kalau semua ✅, test ke server:");
console.log("   curl -X POST http://localhost:3006/api/accounts/test-diagnostic \\");
console.log("     -H 'Content-Type: application/json' \\");
console.log("     -d @- << 'EOF'");
console.log(JSON.stringify(payload, null, 2));
console.log("EOF");
console.log();
