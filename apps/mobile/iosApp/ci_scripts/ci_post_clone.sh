#!/bin/sh
set -e

# Xcode Cloud post-clone script. Same approach as Novawerk's other KMP apps.
# We only install the JDK; the Kotlin framework builds in Xcode's
# "Compile Kotlin Framework" phase, which has the Xcode build environment.

echo ">>> Installing OpenJDK 17 via Homebrew..."
brew install openjdk@17

JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
"$JAVA_HOME/bin/java" -version

# Config.xcconfig is gitignored. Seed it from the template so PRODUCT_NAME
# and the bundle id are set, then take the version from the Gradle catalog.
MOBILE_ROOT="${CI_PRIMARY_REPOSITORY_PATH:+$CI_PRIMARY_REPOSITORY_PATH/apps/mobile}"
MOBILE_ROOT="${MOBILE_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
CONFIG_DIR="$MOBILE_ROOT/iosApp/Configuration"
CONFIG_FILE="$CONFIG_DIR/Config.xcconfig"

if [ ! -f "$CONFIG_FILE" ]; then
  cp "$CONFIG_DIR/Config.xcconfig.template" "$CONFIG_FILE"
  TOML="$MOBILE_ROOT/gradle/libs.versions.toml"
  VERSION_CODE=$(grep '^app-versionCode' "$TOML" | head -n1 | sed 's/.*= *"\([^"]*\)".*/\1/')
  VERSION_NAME=$(grep '^app-versionName' "$TOML" | head -n1 | sed 's/.*= *"\([^"]*\)".*/\1/')
  # Build number: Xcode Cloud's own counter, which only goes up. Locally, the catalog's.
  BUILD_NUMBER="${CI_BUILD_NUMBER:-$VERSION_CODE}"
  [ -n "$BUILD_NUMBER" ] && sed -i '' "s|^CURRENT_PROJECT_VERSION=.*|CURRENT_PROJECT_VERSION=$BUILD_NUMBER|" "$CONFIG_FILE"
  [ -n "$VERSION_NAME" ] && sed -i '' "s|^MARKETING_VERSION=.*|MARKETING_VERSION=$VERSION_NAME|" "$CONFIG_FILE"
  [ -n "${TEAM_ID:-}" ] && sed -i '' "s|^TEAM_ID=.*|TEAM_ID=$TEAM_ID|" "$CONFIG_FILE"
  cat "$CONFIG_FILE"
fi
