#!/usr/bin/env bash

# Sets up the MicroPython source tree inside the workspace so firmware builds
# can be version controlled and survive container rebuilds.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MICROPYTHON_DIR="$PROJECT_ROOT/micropython"
MICROPYTHON_REPO="https://github.com/micropython/micropython.git"
RP2_PORT_DIR="$MICROPYTHON_DIR/ports/rp2"

info() {
    printf '\033[0;34m%s\033[0m\n' "$1"
}

warn() {
    printf '\033[1;33m%s\033[0m\n' "$1"
}

info "Workspace root: $PROJECT_ROOT"
info "Ensuring MicroPython repo lives at $MICROPYTHON_DIR"

if [ ! -d "$MICROPYTHON_DIR/.git" ]; then
    info "Cloning MicroPython (master)"
    git clone --branch master "$MICROPYTHON_REPO" "$MICROPYTHON_DIR"
else
    info "Updating existing MicroPython clone"
    if git -C "$MICROPYTHON_DIR" fetch origin; then
        if ! git -C "$MICROPYTHON_DIR" pull --ff-only origin master; then
            warn "Could not fast-forward MicroPython; continuing with current checkout"
        fi
    else
        warn "Could not reach origin (offline?); continuing with current checkout"
    fi
fi

if [ ! -d "$RP2_PORT_DIR" ]; then
    warn "RP2 port directory missing at $RP2_PORT_DIR"
    exit 1
fi

info "Updating MicroPython submodules for RP2"
make -C "$RP2_PORT_DIR" submodules

info "Marking devcontainer scripts as executable"
chmod +x "$PROJECT_ROOT/.devcontainer"/*.sh

# Install JavaScript test dependencies for the simulator (Jest, ESLint, ...)
if command -v npm >/dev/null 2>&1; then
    if [ -f "$PROJECT_ROOT/app/package.json" ]; then
        info "Installing simulator npm dependencies (app/)"
        if (cd "$PROJECT_ROOT/app" && npm install --no-audit --no-fund); then
            info "npm install complete"
        else
            warn "npm install failed in app/; continuing"
        fi
    fi
else
    warn "npm not available; skipping JS test dependency install"
fi

info "Setup complete"
