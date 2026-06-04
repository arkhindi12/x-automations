#!/usr/bin/env node
/**
 * Test berbagai error scenario untuk cookie diagnostic
 */

const scenarios = [
  {
    name: "Valid Cookie",
    input: {
      username: "testuser",
      authMode: "cookies",
      cookieJson: JSON.stringify([
        { name: "auth_token", value: "valid_token", domain: ".x.com" },
        { name: "ct0", value: "valid_ct0", domain: ".x.com" }
      ])
    },
    expectedReason: "OK"
  },
  {
    name: "Missing Username",
    input: {
      username: "",
      authMode: "cookies",
      cookieJson: JSON.stringify([
        { name: "auth_token", value: "valid_token", domain: ".x.com" },
        { name: "ct0", value: "valid_ct0", domain: ".x.com" }
      ])
    },
    expectedReason: "USERNAME_REQUIRED"
  },
  {
    name: "Missing Cookie JSON",
    input: {
      username: "testuser",
      authMode: "cookies",
      cookieJson: ""
    },
    expectedReason: "COOKIE_REQUIRED"
  },
  {
    name: "Invalid Cookie JSON",
    input: {
      username: "testuser",
      authMode: "cookies",
      cookieJson: "not a json"
    },
    expectedReason: "COOKIE_JSON_INVALID"
  },
  {
    name: "Missing auth_token",
    input: {
      username: "testuser",
      authMode: "cookies",
      cookieJson: JSON.stringify([
        { name: "ct0", value: "valid_ct0", domain: ".x.com" }
      ])
    },
    expectedReason: "AUTH_TOKEN_MISSING"
  },
  {
    name: "Missing ct0",
    input: {
      username: "testuser",
      authMode: "cookies",
      cookieJson: JSON.stringify([
        { name: "auth_token", value: "valid_token", domain: ".x.com" }
      ])
    },
    expectedReason: "CT0_MISSING"
  }
];

function runDiagnostic(input) {
  // Check username
  if (!input.username || input.username.trim() === "") {
    return {
      ok: false,
      reason: "USERNAME_REQUIRED",
      message: "Username tidak boleh kosong."
    };
  }

  // Check cookieJson
  if (!input.cookieJson || input.cookieJson.trim() === "") {
    return {
      ok: false,
      reason: "COOKIE_REQUIRED",
      message: "Cookie JSON tidak boleh kosong."
    };
  }

  // Parse cookieJson
  let cookies;
  try {
    cookies = JSON.parse(input.cookieJson);
    if (!Array.isArray(cookies)) {
      throw new Error("Cookie JSON harus berupa array");
    }
  } catch (err) {
    return {
      ok: false,
      reason: "COOKIE_JSON_INVALID",
      message: `Cookie JSON tidak valid: ${err.message}`
    };
  }

  // Check auth_token
  const authToken = cookies.find(c => c.name === "auth_token");
  if (!authToken) {
    return {
      ok: false,
      reason: "AUTH_TOKEN_MISSING",
      message: "Cookie auth_token tidak ditemukan."
    };
  }

  // Check ct0
  const ct0 = cookies.find(c => c.name === "ct0");
  if (!ct0) {
    return {
      ok: false,
      reason: "CT0_MISSING",
      message: "Cookie ct0 tidak ditemukan."
    };
  }

  return {
    ok: true,
    reason: "OK",
    message: `Cookie parsing berhasil untuk @${input.username}`
  };
}

console.log("=" .repeat(70));
console.log("COOKIE DIAGNOSTIC - ERROR SCENARIO TESTS");
console.log("=" .repeat(70));
console.log();

let passed = 0;
let failed = 0;

scenarios.forEach((scenario, index) => {
  console.log(`Test ${index + 1}/${scenarios.length}: ${scenario.name}`);
  
  const result = runDiagnostic(scenario.input);
  const success = result.reason === scenario.expectedReason;
  
  if (success) {
    console.log(`  ✅ PASS - Got expected reason: ${result.reason}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL - Expected: ${scenario.expectedReason}, Got: ${result.reason}`);
    failed++;
  }
  
  console.log(`  Message: ${result.message}`);
  console.log();
});

console.log("=" .repeat(70));
console.log("TEST SUMMARY");
console.log("=" .repeat(70));
console.log();
console.log(`Total: ${scenarios.length}`);
console.log(`Passed: ${passed} ✅`);
console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
console.log();

if (failed === 0) {
  console.log("🎉 ALL TESTS PASSED!");
} else {
  console.log("⚠️  SOME TESTS FAILED");
  process.exit(1);
}
