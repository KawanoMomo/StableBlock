#!/usr/bin/env bash
# Usage: ./bump-version.sh [version]
# If no version given, reads from VERSION file.
# 本体は scripts/bump-version.mjs(VERSION・ルートと拡張の package.json・package-lock.json・stableblock.html・README の版番号を揃える。
# 置き換える箇所が見つからないファイルがあれば何も書かずに失敗する)
set -euo pipefail
cd "$(dirname "$0")"
exec node scripts/bump-version.mjs "$@"
