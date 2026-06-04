#!/usr/bin/env node
/**
 * Test cookie diagnostic logic tanpa database
 * Simulasi endpoint POST /api/accounts/test-diagnostic
 */

// ============================================================================
// GANTI DENGAN COOKIE ASLI UNTUK TEST REAL
// ============================================================================
const TEST_INPUT = {
  username: "test_username",  // Username X tanpa @
  authMode: "cookies",
  cookieJson: JSON.stringify([
    {
      "domain": ".x.com",
      "name": "auth_token",
      "value": "sample_auth_token_value_here",
      "path": "/",
      "httpOnly": true,
      "secure": true
    },
    {
      "domain": ".x.com",
      "name": "ct0",
      "value": "sample_ct0_value_here",
      "path": "/",
      "httpOnly": false,
      "secure": true
    }
  ]),
  cookieUserAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  proxyUrl: null
};

// ============================================================================
// Diagnostic Logic (sama seperti di backend)
// ============================================================================

function runDiagnostic(input) {
  console.log("🔍 Running Cookie Diagnostic\n");
  console.log(`Username: @${input.username}`);
  console.log(`Auth Mode: ${input.authMode}`);
  console.log(`Proxy: ${input.proxyUrl || "none"}\n`);

  // 1. Check username
  if (!input.username || input.username.trim() === "") {
    return {
      ok: false,
      reason: "USERNAME_REQUIRED",
      message: "Username tidak boleh kosong.",
      suggestions: [
        "Isi username X tanpa simbol @",
        "Contoh: elonmusk bukan @elonmusk"
      ]
    };
  }

  // 2. Check cookieJson
  if (!input.cookieJson || input.cookieJson.trim() === "") {
    return {
      ok: false,
      reason: "COOKIE_REQUIRED",
      message: "Cookie JSON tidak boleh kosong.",
      suggestions: [
        "Export cookies dari browser menggunakan Cookie-Editor extension",
        "Pastikan sudah login ke x.com sebelum export"
      ]
    };
  }

  // 3. Parse cookieJson
  let cookies;
  try {
    cookies = JSON.parse(input.cookieJson);
    if (!Array.isArray(cookies)) {
      throw new Error("Cookie JSON harus berupa array");
    }
    console.log(`✅ Cookie JSON valid (${cookies.length} cookies)\n`);
  } catch (err) {
    return {
      ok: false,
      reason: "COOKIE_JSON_INVALID",
      message: `Cookie JSON tidak valid: ${err.message}`,
      suggestions: [
        "Pastikan format JSON benar",
        "Export ulang dari Cookie-Editor dengan format JSON",
        "Jangan edit manual cookie JSON"
      ]
    };
  }

  // 4. Check auth_token
  const authToken = cookies.find(c => c.name === "auth_token");
  if (!authToken) {
    return {
      ok: false,
      reason: "AUTH_TOKEN_MISSING",
      message: "Cookie auth_token tidak ditemukan.",
      suggestions: [
        "Pastikan cookie auth_token ada di export",
        "Jangan export dari tab incognito/private yang belum login",
        "Login ulang ke x.com lalu export cookies"
      ]
    };
  }
  console.log(`✅ auth_token found: ${authToken.value.substring(0, 20)}...`);

  // 5. Check ct0
  const ct0 = cookies.find(c => c.name === "ct0");
  if (!ct0) {
    return {
      ok: false,
      reason: "CT0_MISSING",
      message: "Cookie ct0 tidak ditemukan.",
      suggestions: [
        "Refresh halaman x.com lalu export cookies ulang",
        "ct0 adalah CSRF token yang diperlukan untuk API X"
      ]
    };
  }
  console.log(`✅ ct0 found: ${ct0.value.substring(0, 20)}...\n`);

  // 6. Build cookie string
  const cookieString = cookies
    .map(c => `${c.name}=${c.value}`)
    .join("; ");

  console.log("🍪 Cookie string built successfully\n");

  // 7. Simulate X API call (tanpa real request)
  console.log("⚠️  SIMULATION MODE: Tidak melakukan request ke X API");
  console.log("   Untuk test real, butuh:");
  console.log("   - PostgreSQL database");
  console.log("   - API server running");
  console.log("   - Cookie asli dari akun X yang valid\n");

  return {
    ok: true,
    reason: "OK",
    message: `Cookie parsing berhasil untuk @${input.username}`,
    suggestions: [
      "Cookie format valid",
      "Untuk test real login, jalankan API server dengan DATABASE_URL",
      "Gunakan endpoint POST /api/accounts/test-diagnostic"
    ],
    proxyChecked: false,
    authMode: input.authMode,
    cookieCount: cookies.length,
    hasAuthToken: true,
    hasCt0: true
  };
}

// ============================================================================
// Run Test
// ============================================================================

console.log("=" .repeat(70));
console.log("X AUTOMATION - COOKIE DIAGNOSTIC TEST");
console.log("=" .repeat(70));
console.log();

const result = runDiagnostic(TEST_INPUT);

console.log("=" .repeat(70));
console.log("DIAGNOSTIC RESULT");
console.log("=" .repeat(70));
console.log();
console.log(JSON.stringify(result, null, 2));
console.log();

if (result.ok) {
  console.log("✅ DIAGNOSTIC PASSED");
} else {
  console.log("❌ DIAGNOSTIC FAILED");
  console.log(`\nReason: ${result.reason}`);
  console.log(`Message: ${result.message}`);
  console.log("\nSuggestions:");
  result.suggestions.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s}`);
  });
}

console.log();
console.log("=" .repeat(70));
console.log("NEXT STEPS");
console.log("=" .repeat(70));
console.log();
console.log("1. Install PostgreSQL:");
console.log("   brew install postgresql@16");
console.log("   brew services start postgresql@16");
console.log("   createdb x_automation");
console.log();
console.log("2. Update .env file:");
console.log("   DATABASE_URL=postgresql://$(whoami)@localhost:5432/x_automation");
console.log();
console.log("3. Run database migration:");
console.log("   pnpm --filter @workspace/db run push");
console.log();
console.log("4. Start API server:");
console.log("   pnpm --filter @workspace/api-server run dev");
console.log();
console.log("5. Test dengan cookie asli:");
console.log("   curl -X POST http://localhost:3001/api/accounts/test-diagnostic \\");
console.log("     -H 'Content-Type: application/json' \\");
console.log("     -d @cookie-test.json");
console.log();
