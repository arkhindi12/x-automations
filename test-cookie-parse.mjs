#!/usr/bin/env node
/**
 * Test cookie parsing tanpa database
 * Usage: node test-cookie-parse.mjs
 */

// Sample cookie JSON (GANTI DENGAN COOKIE ASLI UNTUK TEST REAL)
const sampleCookieJson = JSON.stringify([
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
]);

console.log("🧪 Testing Cookie Parser\n");

// Parse cookie JSON
let cookies;
try {
  cookies = JSON.parse(sampleCookieJson);
  console.log("✅ Cookie JSON valid");
  console.log(`   Found ${cookies.length} cookies\n`);
} catch (err) {
  console.error("❌ Cookie JSON invalid:", err.message);
  process.exit(1);
}

// Check required cookies
const authToken = cookies.find(c => c.name === "auth_token");
const ct0 = cookies.find(c => c.name === "ct0");

console.log("🔍 Checking required cookies:\n");

if (!authToken) {
  console.error("❌ auth_token NOT FOUND");
  console.error("   Suggestion: Export cookies dari browser yang sudah login ke x.com");
  process.exit(1);
} else {
  console.log("✅ auth_token found");
  console.log(`   Value: ${authToken.value.substring(0, 20)}...`);
  console.log(`   Domain: ${authToken.domain}`);
  console.log(`   HttpOnly: ${authToken.httpOnly}`);
  console.log(`   Secure: ${authToken.secure}\n`);
}

if (!ct0) {
  console.error("❌ ct0 NOT FOUND");
  console.error("   Suggestion: Refresh x.com lalu export cookies ulang");
  process.exit(1);
} else {
  console.log("✅ ct0 found");
  console.log(`   Value: ${ct0.value.substring(0, 20)}...`);
  console.log(`   Domain: ${ct0.domain}\n`);
}

// Convert to cookie string format
const cookieString = cookies
  .map(c => `${c.name}=${c.value}`)
  .join("; ");

console.log("🍪 Cookie string format:\n");
console.log(`   ${cookieString.substring(0, 100)}...\n`);

console.log("✅ Cookie parsing test PASSED");
console.log("\n📝 Next steps:");
console.log("   1. Ganti sample cookie dengan cookie asli dari x.com");
console.log("   2. Install PostgreSQL: brew install postgresql@16");
console.log("   3. Jalankan API server dengan DATABASE_URL");
console.log("   4. Test endpoint: POST /api/accounts/test-diagnostic");
