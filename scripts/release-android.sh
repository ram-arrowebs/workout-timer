#!/bin/sh
# Builds a signed Play App Bundle. Usage: scripts/release-android.sh <version-code>
# The version name comes from package.json; every upload needs a new, higher version code.
# Signing reads ~/.config/play/workoutcounter-upload.properties (see android/app/build.gradle).
set -eu

CODE=${1:?usage: scripts/release-android.sh <version-code>}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
VERSION=$(node -p "require('$ROOT/package.json').version")
export JAVA_HOME=${JAVA_HOME:-$(/usr/libexec/java_home -v 21)}

cd "$ROOT"
npm run --silent build:web
npx cap sync android

cd android
./gradlew --no-daemon bundleRelease -PversionCode="$CODE" -PversionName="$VERSION"
mkdir -p "$ROOT/build/android"
cp app/build/outputs/bundle/release/app-release.aab "$ROOT/build/android/workout-counter-$VERSION-$CODE.aab"
echo "Android $VERSION ($CODE): $ROOT/build/android/workout-counter-$VERSION-$CODE.aab"
