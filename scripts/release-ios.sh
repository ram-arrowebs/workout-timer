#!/bin/sh
# Builds a signed App Store IPA. Usage: scripts/release-ios.sh <build-number> [--upload]
# The version comes from package.json; every upload needs a new, higher build number.
# --upload sends the build to App Store Connect (it then appears in TestFlight).
set -eu

BUILD=${1:?usage: scripts/release-ios.sh <build-number> [--upload]}
DEST=export
[ "${2:-}" = "--upload" ] && DEST=upload

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/build/ios"
VERSION=$(node -p "require('$ROOT/package.json').version")
KEY_ID=AJ6N98KP5T
ISSUER_ID=69a6de74-d9e1-47e3-e053-5b8c7c11a4d1
KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_$KEY_ID.p8"
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}

cd "$ROOT"
npm run --silent build:web
npx cap sync ios

rm -rf "$OUT"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/App.xcarchive" \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD" \
  -allowProvisioningUpdates -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER_ID" \
  archive

cp ios/ExportOptions.plist "$OUT/ExportOptions.plist"
plutil -replace destination -string "$DEST" "$OUT/ExportOptions.plist"
xcodebuild -exportArchive -archivePath "$OUT/App.xcarchive" -exportPath "$OUT/export" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -authenticationKeyPath "$KEY_PATH" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER_ID"

echo "iOS $VERSION ($BUILD): $DEST done, output in $OUT/export"
