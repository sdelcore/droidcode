#!/usr/bin/env bash
# API Integration Tests for DroidCode-Expo
# Tests against a live OpenCode server

set -e

HOST="${1:-dayman.tap}"
PORT="${2:-4096}"
BASE_URL="http://${HOST}:${PORT}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}→${NC} $1"; }

echo "=========================================="
echo "DroidCode-Expo API Integration Tests"
echo "Server: ${BASE_URL}"
echo "=========================================="
echo

# Test 1: Health/Connection
info "Testing server connection..."
if curl -s --connect-timeout 3 "${BASE_URL}/" > /dev/null 2>&1; then
  pass "Server is reachable"
else
  fail "Cannot connect to server at ${BASE_URL}"
fi

# Test 2: Sessions List
info "Testing GET /session..."
SESSIONS=$(curl -s "${BASE_URL}/session")
if echo "$SESSIONS" | jq -e '.[0].id' > /dev/null 2>&1; then
  SESSION_COUNT=$(echo "$SESSIONS" | jq 'length')
  pass "Sessions list works (${SESSION_COUNT} sessions)"
else
  fail "Sessions list failed or returned invalid JSON"
fi

# Get first session for further tests
SESSION_ID=$(echo "$SESSIONS" | jq -r '.[0].id')
info "Using session: ${SESSION_ID}"

# Test 3: Session Details
info "Testing GET /session/{id}..."
SESSION=$(curl -s "${BASE_URL}/session/${SESSION_ID}")
if echo "$SESSION" | jq -e '.id' > /dev/null 2>&1; then
  TITLE=$(echo "$SESSION" | jq -r '.title // "No title"')
  pass "Session details work (title: ${TITLE:0:40}...)"
else
  fail "Session details failed"
fi

# Test 4: Messages
info "Testing GET /session/{id}/message..."
MESSAGES=$(curl -s "${BASE_URL}/session/${SESSION_ID}/message")
if echo "$MESSAGES" | jq -e 'type == "array"' > /dev/null 2>&1; then
  MSG_COUNT=$(echo "$MESSAGES" | jq 'length')
  pass "Messages list works (${MSG_COUNT} messages)"

  # Check message structure
  if echo "$MESSAGES" | jq -e '.[0].info.id' > /dev/null 2>&1; then
    pass "Message structure valid (has info.id, parts, etc.)"
  fi
else
  fail "Messages list failed"
fi

# Test 5: SSE Event Stream
info "Testing SSE /event endpoint..."
SSE_RESPONSE=$(timeout 2 curl -s -N -H "Accept: text/event-stream" "${BASE_URL}/event" 2>&1 || true)
if echo "$SSE_RESPONSE" | grep -q "server.connected"; then
  pass "SSE endpoint works (received server.connected)"
else
  fail "SSE endpoint failed or no server.connected event"
fi

# Test 6: Todos (if supported)
info "Testing GET /session/{id}/todo..."
TODOS=$(curl -s "${BASE_URL}/session/${SESSION_ID}/todo" 2>&1)
if echo "$TODOS" | jq -e 'type' > /dev/null 2>&1; then
  pass "Todos endpoint works"
else
  info "Todos endpoint returned non-JSON (may be empty or unsupported)"
fi

# Test 7: Diff (if supported)
info "Testing GET /session/{id}/diff..."
DIFF=$(curl -s "${BASE_URL}/session/${SESSION_ID}/diff" 2>&1)
if echo "$DIFF" | jq -e 'type' > /dev/null 2>&1; then
  pass "Diff endpoint works"
else
  info "Diff endpoint returned non-JSON (may be empty or unsupported)"
fi

echo
echo "=========================================="
echo -e "${GREEN}All core API tests passed!${NC}"
echo "=========================================="
echo
echo "API Response Samples:"
echo "---"
echo "Session structure:"
echo "$SESSION" | jq 'keys' 2>/dev/null || echo "(parse error)"
echo
echo "Message part types found:"
echo "$MESSAGES" | jq -r '.[].parts[]?.type // empty' 2>/dev/null | sort -u || echo "(none)"
echo
