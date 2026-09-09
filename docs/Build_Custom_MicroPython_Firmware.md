# Building Custom MicroPython Firmware for Raspberry Pi Pico

This guide explains how to build MicroPython firmware for the Raspberry Pi Pico with your custom AIDriver libraries integrated. Libraries are frozen for fast loading, while `main.py` and `config.py` remain on the filesystem for IDE editing. Students retain their tuning and replace main when changing challenges; see the [shared workflow](Shared_Config_Workflow.md).

---

## Prerequisites

- Codespaces or a local devcontainer (already set up in this repo)
- Internet connection (optional - script works offline)
- Raspberry Pi Pico board

---

## 🚀 Quick Start (Recommended)

**One-Command Build:**

```bash
cd /workspaces/RP2040_Competition_Robot/.devcontainer
./build_firmware.sh
```

The script automatically:

- ✅ Validates the build environment
- ✅ Updates MicroPython to the latest version (if internet available)
- ✅ Copies custom libraries to frozen modules (fast loading)
- ✅ Bundles defaults for missing editable `main.py` and `config.py` files
- ✅ Validates Python syntax
- ✅ Builds firmware with parallel compilation
- ✅ Saves to `_Firmware/THS_Comp_RP2040.uf2`
- ✅ Creates build metadata for tracking

---

## 📁 File Handling Strategy

### **Frozen Modules (Fast Loading):**

- The [AIDriver package](../project/lib/aidriver/__init__.py), peripheral modules and [config checker](../project/lib/config_check.py) are frozen into firmware.
- The build generates `robot_recovery` with bundled main/config defaults. Neither editable file is imported as a frozen module.

**Benefits:** Instant loading, memory efficient, cannot be accidentally corrupted

### **Filesystem Files (IDE Editable):**

- [project/main.py](../project/main.py) and [project/config.py](../project/config.py) are created on the device filesystem when missing.
- Existing files are preserved, even across a firmware update. Missing or invalid settings must be fixed explicitly; firmware does not silently replace student tuning.

**Benefits:** Visible in IDE, editable, preserves user changes across reboots

---

## 🛡️ Recovery Mode Feature

**Pin 2 Hardware Recovery:** If your `main.py` becomes corrupted or problematic:

1. **Power off** the Pico
2. **Connect GPIO pin 2 to ground** (use jumper wire to any GND pin)
3. **Power on** or reset the Pico
4. **Recovery activates** → `main.py` restored to default content
5. **Remove jumper** from pin 2
6. **Reset** → The fresh `main.py` reads your existing `config.py`

This restores main and clears the event log, but **preserves config**, including an invalid config. Correct the named setting in your IDE, or explicitly restore the baseline from the MicroPython REPL:

```python
import robot_recovery
robot_recovery.restore_config()
```

The previous file is backed up as `config.py.bak`, then `config.py.bak.1`, and so on without overwriting earlier backups. Restart the robot afterward. A normal boot never executes this reset automatically.

**Console output during recovery:**

```
Restored main.py; config.py preserved
```

---

## 🔧 Build Options

### **Quick Rebuild (Skip Update):**

```bash
./build_firmware.sh --skip-update
```

Use this for iterative development when you don't need the latest MicroPython.

### **Force Clean Build:**

```bash
./build_firmware.sh --force-clean
```

Use this if you encounter build issues or want to ensure a completely fresh build.

### **Development-Only Module Copy:**

```bash
./prepare_modules.sh
```

Just copies modules without building firmware. Useful for testing module syntax.

### **Get Help:**

```bash
./build_firmware.sh --help
./prepare_modules.sh --help
```

---

## 📦 Flashing the Firmware

1. **Connect your Raspberry Pi Pico** to your computer while holding the **BOOTSEL** button
2. **Pico mounts as USB drive** (RPI-RP2)
3. **Copy firmware file:**
   ```bash
   # From: /workspaces/RP2040_Competition_Robot/_Firmware/THS_Comp_RP2040.uf2
   # To: RPI-RP2 USB drive
   ```
4. **Pico reboots automatically** and runs your integrated code

### **What Happens After Flashing:**

- **First boot:** Missing `config.py` and `main.py` are created on the filesystem
- **Subsequent boots:** Existing main and configuration are preserved
- **IDE connection:** Both files are visible and editable in Thonny, VS Code, etc.
- **Library access:** `from aidriver import AIDriver` works immediately (frozen modules)

Build firmware from this implementation before deploying the new challenge mains. Older UF2 files may not contain `config_check` or `robot_recovery`. Source/test verification does not update the checked-in binary automatically or prove operation on a physical robot.

---

## 🔍 Troubleshooting

### **Success Indicators:**

- ✅ Terminal shows `✅ AIDriver firmware build complete!`
- ✅ `THS_Comp_RP2040.uf2` file exists in `_Firmware/` folder
- ✅ No error messages in terminal output
- ✅ Build reports module counts: "Copied X modules to frozen modules directory"

### **Common Issues & Solutions:**

**Permission Error:**

```bash
chmod +x /workspaces/RP2040_Competition_Robot/.devcontainer/*.sh
```

**Files Not Found:**

- Verify the AIDriver package, library modules, `project/main.py` and `project/config.py` exist.
- AIDriver is a package under `project/lib/aidriver/`, not a single `aidriver.py` file.

**Syntax Errors:**

- Script automatically validates Python syntax
- Fix reported syntax errors in your Python files

**Build Fails:**

```bash
./build_firmware.sh --force-clean  # Fresh build
```

**No Internet Connection:**

- Script automatically detects and continues with current MicroPython version
- Use `--skip-update` to explicitly skip updates

**Environment Issues:**

- Script validates environment and shows specific error messages
- Restart devcontainer if needed

**Pin 2 Recovery Not Working:**

- Ensure GPIO pin 2 is connected to ground (GND)
- Try different GND pins if available
- Verify jumper wire connection during boot

---

## 🔧 Development Workflow

### **Iterative Development:**

1. **Tune config or edit main**, then transfer the changed file to the robot filesystem.
2. **Restart and test on device** in a clear, controlled area.
3. **Build and flash firmware only for library or provisioning changes:** `./build_firmware.sh --skip-update`.
4. **Keep the same config when replacing main** for the next challenge.

### **Recovery Testing:**

1. **Flash firmware** with your code
2. **Edit main.py** on device (introduce error)
3. **Connect pin 2 to ground** and reset
4. **Verify recovery** restores original main while retaining a deliberately changed config value
5. **Test explicit config recovery** and verify the previous source remains in its numbered backup

Host-only provisioning checks run without a connected robot:

```bash
python -m pytest -q tests/test_firmware_config.py
```

---

## 📖 Alternative Manual Process (Advanced Users)

If you need to customize the build or prefer manual control:

```bash
# Copy modules manually
cp /workspaces/RP2040_Competition_Robot/project/lib/*.py /micropython/ports/rp2/modules/
cp -r /workspaces/RP2040_Competition_Robot/project/lib/aidriver /micropython/ports/rp2/modules/

# Build manually
cd /micropython/ports/rp2
make submodules
make clean
make -j$(nproc)

# Copy firmware
cp build-RPI_PICO/firmware.uf2 /workspaces/RP2040_Competition_Robot/_Firmware/THS_Comp_RP2040.uf2
```

**Note:** This manual process omits provisioning and recovery. Transfer both main and config yourself, and do not copy either into frozen modules. Use the automated build for the supported two-file deployment workflow.

---

## 🎯 Board Variants

**Default:** Raspberry Pi Pico

```bash
./build_firmware.sh  # Builds for standard Pico
```

**Pico W (WiFi):**

```bash
cd /micropython/ports/rp2
make BOARD=PICO_W  # Manual build for Pico W
```

**Pico 2:**

```bash
cd /micropython/ports/rp2
make BOARD=PICO2  # Manual build for Pico 2
```

---

## 📚 References

- [MicroPython RP2 Port Documentation](https://github.com/micropython/micropython/tree/master/ports/rp2)
- [Raspberry Pi Pico Documentation](https://www.raspberrypi.com/documentation/microcontrollers/raspberry-pi-pico.html)
- [MicroPython Build Troubleshooting](https://github.com/micropython/micropython/wiki/Build-Troubleshooting)

---

## 🆘 Support

If you need help:

1. Check error messages in terminal output
2. Try `./build_firmware.sh --force-clean`
3. Verify file structure and syntax
4. Ask your instructor
5. Open an issue in this repository

---

**Happy Building! 🚀**
