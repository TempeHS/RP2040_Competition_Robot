# Building Custom MicroPython Firmware for Raspberry Pi Pico

This guide explains how to build MicroPython firmware for the Raspberry Pi Pico with your custom AIDriver libraries integrated. The build system automatically creates firmware with your libraries frozen into the firmware for fast loading, while `main.py` is placed on the filesystem for IDE editing with hardware recovery capability.

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
- ✅ Embeds `main.py` in firmware for filesystem creation
- ✅ Validates Python syntax
- ✅ Builds firmware with parallel compilation
- ✅ Saves to `_Firmware/AI_Driver_RP2040.uf2`
- ✅ Creates build metadata for tracking

---

## 📁 File Handling Strategy

### **Frozen Modules (Fast Loading):**

- `project/lib/aidriver.py` → Frozen into firmware
- `project/lib/gamepad_driver_controller.py` → Frozen into firmware
- `project/lib/gamepad_pico.py` → Frozen into firmware

**Benefits:** Instant loading, memory efficient, cannot be accidentally corrupted

### **Filesystem Files (IDE Editable):**

- `project/main.py` → Created on device filesystem during first boot

**Benefits:** Visible in IDE, editable, preserves user changes across reboots

---

## 🛡️ Recovery Mode Feature

**Pin 2 Hardware Recovery:** If your `main.py` becomes corrupted or problematic:

1. **Power off** the Pico
2. **Connect GPIO pin 2 to ground** (use jumper wire to any GND pin)
3. **Power on** or reset the Pico
4. **Recovery activates** → `main.py` restored to default content
5. **Remove jumper** from pin 2
6. **Reset** → Normal operation resumes with fresh `main.py`

**Console output during recovery:**

```
RECOVERY MODE: Pin 2 detected grounded - overwriting main.py with default
Recovery complete: main.py restored to default content
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
   # From: /workspaces/RP2040_Competition_Robot/_Firmware/AI_Driver_RP2040.uf2
   # To: RPI-RP2 USB drive
   ```
4. **Pico reboots automatically** and runs your integrated code

### **What Happens After Flashing:**

- **First boot:** `main.py` automatically created on filesystem with your test code
- **Subsequent boots:** Existing `main.py` preserved (user edits maintained)
- **IDE connection:** `main.py` visible and editable in Thonny, VS Code, etc.
- **Library access:** `from aidriver import AIDriver` works immediately (frozen modules)

---

## 🔍 Troubleshooting

### **Success Indicators:**

- ✅ Terminal shows `✅ AIDriver firmware build complete!`
- ✅ `AI_Driver_RP2040.uf2` file exists in `_Firmware/` folder (~630-650KB)
- ✅ No error messages in terminal output
- ✅ Build reports module counts: "Copied X modules to frozen modules directory"

### **Common Issues & Solutions:**

**Permission Error:**

```bash
chmod +x /workspaces/RP2040_Competition_Robot/.devcontainer/*.sh
```

**Files Not Found:**

- Verify files exist: `project/lib/*.py` and `project/main.py`
- Check exact filenames: `aidriver.py`, `gamepad_driver_controller.py`, `gamepad_pico.py`

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

1. **Edit code** in `project/` folder
2. **Build firmware:** `./build_firmware.sh --skip-update`
3. **Flash to Pico** (copy .uf2 file)
4. **Test on device**
5. **Repeat**

### **Recovery Testing:**

1. **Flash firmware** with your code
2. **Edit main.py** on device (introduce error)
3. **Connect pin 2 to ground** and reset
4. **Verify recovery** restores original code

---

## 📖 Alternative Manual Process (Advanced Users)

If you need to customize the build or prefer manual control:

```bash
# Copy modules manually
cp /workspaces/RP2040_Competition_Robot/project/lib/*.py /micropython/ports/rp2/modules/

# Build manually
cd /micropython/ports/rp2
make submodules
make clean
make -j$(nproc)

# Copy firmware
cp build-RPI_PICO/firmware.uf2 /workspaces/RP2040_Competition_Robot/_Firmware/AI_Driver_RP2040.uf2
```

**Note:** Manual process doesn't include the pin 2 recovery feature or filesystem `main.py` handling.

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
