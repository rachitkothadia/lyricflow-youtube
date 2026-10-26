#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if command -v node >/dev/null 2>&1; then
  node scripts/install-native.mjs
elif [ -x /opt/homebrew/bin/node ]; then
  /opt/homebrew/bin/node scripts/install-native.mjs
elif [ -x /usr/local/bin/node ]; then
  /usr/local/bin/node scripts/install-native.mjs
else
  echo 'Install Node.js from nodejs.org, then run this installer again.'
  exit 1
fi
