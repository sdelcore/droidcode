#!/usr/bin/env bash
# Push DroidCode Expo APK update to the update server
#
# This script builds the Expo APK, generates an update manifest, and deploys
# both to the aria.tap server for OTA updates.
#
# Usage: ./scripts/push-update.sh [--skip-build]
#
# Options:
#   --skip-build  Skip building, use existing APK (for re-deploys)
#
# Requirements:
#   - SSH access to root@aria.tap
#   - Node.js and npm
#   - Android SDK (for native build)

set -euo pipefail

# Configuration
UPDATE_HOST="droidcode.aria.tap"
VM_HOST="aria.tap"
VM_PATH="/opt/stacks/aria/public/droidcode"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
STAGING_DIR="$(mktemp -d)"

# Parse arguments
SKIP_BUILD=false
for arg in "$@"; do
    case $arg in
        --skip-build)
            SKIP_BUILD=true
            ;;
    esac
done

# Cleanup on exit
trap "rm -rf $STAGING_DIR" EXIT

echo "=== DroidCode Expo Update Push ==="
echo ""

cd "$PROJECT_DIR"

# Get version info from package.json
VERSION_NAME=$(node -e "console.log(require('./package.json').version)")
# Version code: Convert X.Y.Z to XYYZZZ (e.g., 2.2.0 -> 220200, 2.1.0 -> 210100)
# Must be higher than Kotlin version (115) - Expo starts at 200xxx
VERSION_CODE=$(node -e "
  const v = require('./package.json').version.split('.');
  const major = parseInt(v[0]) || 0;
  const minor = parseInt(v[1]) || 0;
  const patch = parseInt(v[2]) || 0;
  // Format: major * 10000 + minor * 100 + patch (e.g., 2.2.0 -> 20200)
  // Add 200 base to be higher than Kotlin versions
  console.log(200 + major * 10000 + minor * 100 + patch);
")

APK_PATH="$PROJECT_DIR/android/app/build/outputs/apk/release/app-release.apk"

if [ "$SKIP_BUILD" = false ]; then
    echo "Step 1: Running prebuild..."
    npx expo prebuild --platform android --clean

    echo ""
    echo "Step 2: Building release APK..."
    cd android

    # Build release APK (unsigned, but installable)
    ./gradlew assembleRelease

    cd "$PROJECT_DIR"

    if [ ! -f "$APK_PATH" ]; then
        # Try debug APK as fallback
        APK_PATH="$PROJECT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
        if [ ! -f "$APK_PATH" ]; then
            echo "Error: APK not found. Trying debug build..."
            cd android
            ./gradlew assembleDebug
            cd "$PROJECT_DIR"
        fi
    fi
fi

if [ ! -f "$APK_PATH" ]; then
    echo "Error: APK not found at $APK_PATH"
    echo "Available APKs:"
    find "$PROJECT_DIR/android" -name "*.apk" 2>/dev/null || echo "  None found"
    exit 1
fi

echo ""
echo "Built APK: $APK_PATH"

# Copy APK to staging
cp "$APK_PATH" "$STAGING_DIR/droidcode.apk"

# Calculate SHA256
SHA256=$(sha256sum "$STAGING_DIR/droidcode.apk" | cut -d' ' -f1)
FILE_SIZE=$(stat -c%s "$STAGING_DIR/droidcode.apk" 2>/dev/null || stat -f%z "$STAGING_DIR/droidcode.apk")

echo ""
echo "Version: $VERSION_NAME (code: $VERSION_CODE)"
echo "SHA256:  $SHA256"
echo "Size:    $(numfmt --to=iec $FILE_SIZE 2>/dev/null || echo "$FILE_SIZE bytes")"

# Generate manifest
cat > "$STAGING_DIR/manifest.json" << EOF
{
  "versionCode": $VERSION_CODE,
  "versionName": "$VERSION_NAME",
  "downloadUrl": "http://$UPDATE_HOST/droidcode.apk",
  "sha256": "$SHA256",
  "releaseNotes": "DroidCode Expo $VERSION_NAME - $(date '+%Y-%m-%d %H:%M')",
  "platform": "expo",
  "minSdkVersion": 26
}
EOF

# Deploy to server
echo ""
echo "Step 3: Deploying to $VM_HOST..."
ssh "root@$VM_HOST" "mkdir -p $VM_PATH"
scp -q "$STAGING_DIR/droidcode.apk" "$STAGING_DIR/manifest.json" "root@$VM_HOST:$VM_PATH/"
ssh "root@$VM_HOST" "chmod 755 $VM_PATH && chmod 644 $VM_PATH/*"

echo ""
echo "=== Update Deployed ==="
echo "Manifest: http://$UPDATE_HOST/manifest.json"
echo "APK:      http://$UPDATE_HOST/droidcode.apk"
echo ""
echo "Phones will see update v$VERSION_NAME on next check."
