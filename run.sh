#!/usr/bin/env bash
#
# Starts the SPANnotator server locally.
#
# The one thing that trips people up on a fresh machine is finding a usable
# `dotnet`, since it can be installed several different ways (an apt/distro
# package, Microsoft's dotnet-install.sh into ~/.dotnet, a manual tarball
# under /opt, a snap, ...). This script looks in the common spots so you
# don't have to remember where yours ended up. If your install lives
# somewhere not listed in EXTRA_DOTNET_DIRS below, either add it there or
# just make sure `dotnet` is on your PATH before running this script.
#
# The required SDK version is NOT hardcoded here — it's read from
# global.json. To move this project to a new .NET version, edit
# global.json; this script picks up the change automatically.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# Add another path here if your .NET install isn't found automatically.
EXTRA_DOTNET_DIRS=(
  "$HOME/.dotnet"
  "/usr/lib/dotnet"
  "/usr/share/dotnet"
  "/usr/local/share/dotnet"
  "/opt/dotnet"
  "/snap/dotnet-sdk/current"
)

find_dotnet() {
  if [ -n "${DOTNET_ROOT:-}" ] && [ -x "$DOTNET_ROOT/dotnet" ]; then
    echo "$DOTNET_ROOT/dotnet"
    return 0
  fi
  if command -v dotnet >/dev/null 2>&1; then
    command -v dotnet
    return 0
  fi
  for dir in "${EXTRA_DOTNET_DIRS[@]}"; do
    if [ -x "$dir/dotnet" ]; then
      echo "$dir/dotnet"
      return 0
    fi
  done
  return 1
}

# Pull the pinned SDK version out of global.json so this script never goes
# stale relative to it.
REQUIRED_SDK=""
if [ -f global.json ]; then
  REQUIRED_SDK="$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' global.json \
    | grep -oE '[0-9]+(\.[0-9]+){0,2}' | head -1)"
fi
REQUIRED_MAJOR="${REQUIRED_SDK%%.*}"
REQUIRED_MAJOR="${REQUIRED_MAJOR:-9}"

if ! DOTNET_BIN="$(find_dotnet)"; then
  cat >&2 <<EOF
error: no 'dotnet' executable found.

This project needs the .NET ${REQUIRED_MAJOR}.x SDK. Install it with one of:

  # User-local, no sudo (recommended if you're unsure which to pick):
  curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel ${REQUIRED_MAJOR}.0
  export PATH="\$HOME/.dotnet:\$PATH"

  # System package, if your distro's repo carries this version:
  sudo apt install dotnet-sdk-${REQUIRED_MAJOR}.0

See https://dotnet.microsoft.com/download for other options and platforms.
EOF
  exit 1
fi

export DOTNET_ROOT="$(cd "$(dirname "$DOTNET_BIN")" && pwd)"
export PATH="$DOTNET_ROOT:$PATH"

INSTALLED_VERSION="$("$DOTNET_BIN" --version)"
echo "Using dotnet $INSTALLED_VERSION ($DOTNET_BIN)"

if [ "${INSTALLED_VERSION%%.*}" != "$REQUIRED_MAJOR" ]; then
  echo "warning: global.json pins .NET ${REQUIRED_SDK:-$REQUIRED_MAJOR}, but the SDK found here is $INSTALLED_VERSION." >&2
  echo "         If restore/build fails below, install a matching SDK (see global.json)." >&2
fi

"$DOTNET_BIN" restore
exec "$DOTNET_BIN" run
