#!/bin/bash
# Script untuk test cookie dengan input interaktif

echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║              TEST COOKIE LOGIN - INTERACTIVE                         ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

# Input username
echo "Masukkan username X (tanpa @):"
read -r USERNAME

# Input cookie JSON
echo ""
echo "Paste cookie JSON dari Cookie-Editor (tekan Enter 2x setelah paste):"
echo "(Format: [{\"name\":\"auth_token\",...},{\"name\":\"ct0\",...}])"
echo ""

# Read multi-line input
COOKIE_JSON=""
while IFS= read -r line; do
  [ -z "$line" ] && break
  COOKIE_JSON="${COOKIE_JSON}${line}"
done

# Validate inputs
if [ -z "$USERNAME" ]; then
  echo "❌ Username tidak boleh kosong"
  exit 1
fi

if [ -z "$COOKIE_JSON" ]; then
  echo "❌ Cookie JSON tidak boleh kosong"
  exit 1
fi

# Build payload
PAYLOAD=$(cat <<EOF
{
  "username": "$USERNAME",
  "authMode": "cookies",
  "cookieJson": $(echo "$COOKIE_JSON" | jq -c .),
  "cookieUserAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "proxyUrl": null
}
EOF
)

echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║                    SENDING REQUEST...                                ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

# Send request
RESPONSE=$(curl -s -X POST http://localhost:3006/api/accounts/test-diagnostic \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Parse response
echo "Response:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

echo ""

# Check result
OK=$(echo "$RESPONSE" | jq -r '.ok' 2>/dev/null)

if [ "$OK" = "true" ]; then
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║                         ✅ SUCCESS!                                  ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  MESSAGE=$(echo "$RESPONSE" | jq -r '.message')
  echo "$MESSAGE"
  echo ""
  echo "Sekarang kamu bisa paste cookie ini ke UI dan save account."
else
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║                         ❌ FAILED                                    ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  REASON=$(echo "$RESPONSE" | jq -r '.reason' 2>/dev/null)
  MESSAGE=$(echo "$RESPONSE" | jq -r '.message' 2>/dev/null)
  
  echo "Reason: $REASON"
  echo "Message: $MESSAGE"
  echo ""
  echo "Suggestions:"
  echo "$RESPONSE" | jq -r '.suggestions[]?' 2>/dev/null
fi

echo ""
