#!/usr/bin/env bash
# Usage: ./bump-version.sh [version]
# If no version given, reads from VERSION file.
set -euo pipefail
cd "$(dirname "$0")"

VER="${1:-$(cat VERSION | tr -d '[:space:]')}"
MAJOR_MINOR=$(echo "$VER" | sed 's/^\([0-9]*\.[0-9]*\).*/\1/')

echo "Bumping to v${VER} (v${MAJOR_MINOR})"

# 1. VERSION file
echo "$VER" > VERSION

# 2. vscode-stableblock/package.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VER}\"/" vscode-stableblock/package.json

# 3. stableblock.html — default DSL comment
sed -i "s/# StableBlock v[0-9.]\+/# StableBlock v${MAJOR_MINOR}/" stableblock.html

# 4. stableblock.html — badge
sed -i "s/v[0-9.]\+ [A-Za-z]*/v${MAJOR_MINOR}/" stableblock.html

# 5. README.md — vsix filename
sed -i "s/stableblock-[0-9.]\+\.vsix/stableblock-${VER}.vsix/g" README.md
sed -i "s/stableblock-[0-9.]\+\.vsix/stableblock-${VER}.vsix/g" vscode-stableblock/README.md

echo "Done. Updated files:"
grep -n "v${MAJOR_MINOR}\|\"${VER}\"\|stableblock-${VER}" \
  VERSION vscode-stableblock/package.json stableblock.html README.md vscode-stableblock/README.md 2>/dev/null || true
