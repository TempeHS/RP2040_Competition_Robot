#!/bin/bash
# Build Pico firmware with robot/lib frozen in.
# On first boot the firmware writes main.py and config.py to the Pico (never overwrites).
# Usage: .devcontainer/build_firmware.sh [--clean]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="$ROOT/micropython/ports/rp2"
MODULES="$PORT/modules"
OUT="$ROOT/firmware"
CLEAN=false

for arg in "$@"; do
    case "$arg" in
        --clean | --force-clean) CLEAN=true ;;
        --skip-update) ;; # accepted for CI; the MicroPython submodule is never updated here
        *) echo "Unknown option: $arg" && exit 1 ;;
    esac
done

[ -d "$PORT" ] || git -C "$ROOT" submodule update --init micropython

echo "== Reset modules/ to stock MicroPython, then add robot/lib"
git -C "$PORT" checkout -- modules
git -C "$PORT" clean -fdxq -- modules
cp "$ROOT"/robot/lib/*.py "$MODULES/"

python3 - "$ROOT/robot/main.py" "$ROOT/robot/config.py" >>"$MODULES/_boot.py" <<'EOF'
import sys

files = {"main.py": open(sys.argv[1]).read(), "config.py": open(sys.argv[2]).read()}
print("""
# Robot: write the editable files on first boot, never overwrite.
for _name, _text in %r.items():
    try:
        open(_name).close()
    except OSError:
        with open(_name, "w") as _f:
            _f.write(_text)
del _name, _text
""" % files)
EOF

echo "== Build"
cd "$PORT"
make submodules
if $CLEAN; then make clean; fi
make -j"$(nproc)"

mkdir -p "$OUT"
cp build-RPI_PICO/firmware.uf2 "$OUT/robot.uf2"
{
    echo "Built: $(date -u)"
    echo "MicroPython: $(git -C "$ROOT/micropython" describe --tags --always)"
    echo "Frozen: $(cd "$ROOT/robot/lib" && echo *.py)"
} >"$OUT/build_info.txt"
cat "$OUT/build_info.txt"
echo "Firmware: $OUT/robot.uf2"
