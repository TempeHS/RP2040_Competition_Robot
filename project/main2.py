"""I2C pin-finder scanner for the RP2040.

Purpose: find every I2C device on the robot. It first probes the exact buses
AIDriver opens (front ToF, side ToF, and the shared IMU/OLED/colour bus) and
reports which ones answered, then falls back to trying every ordered pair of GP
pins as an (SDA, SCL) SoftI2C bus so a mis-wired sensor can be located.

Why SoftI2C: bit-banged I2C works on almost any GPIO, so we can probe arbitrary
pin combinations without being limited to the hardware I2C peripherals' fixed
pin mux. That makes it perfect for "I don't know where this sensor is plugged
in" situations.

Phantom filtering (hides the spam):
A pin used as SDA that happens to sit LOW makes EVERY address appear to ACK, so
the scan returns the whole 0x08..0x77 range. Those are not real devices, just a
stuck/floating line. Any pair returning more than MAX_PLAUSIBLE_ADDRS addresses
is discarded so only genuine hits (a handful of addresses) are shown.

How to use:
  1. Leave everything wired as normal and run this file on the Pico.
  2. Read the "Expected AIDriver buses" block first - it tells you which of the
     robot's own buses answered and which did not.
  3. If one failed, read the sweep results below it to find where that sensor
     actually is. Each hit shows the SDA pin, SCL pin, and the device(s) found.
"""

from machine import Pin, SoftI2C
import utime

# --- Configuration -----------------------------------------------------------
# GP pins to include in the sweep. By default we probe the full user-GPIO range
# on the RP2040 (GP0..GP29). GP29 matters here: it is the front ToF's SDA in the
# AIDriver default wiring. Trim this list to speed things up if you already
# know roughly where the sensor is.
CANDIDATE_PINS = list(range(0, 30))

# Every I2C address this robot can legitimately expose. 0x29 is the usual
# source of confusion: the VL53L0X ToF and the TCS34725 colour sensor SHARE it,
# so 0x29 on the GP16/GP17 bus is the colour sensor, NOT a distance sensor.
KNOWN_DEVICES = {
    0x29: "VL53L0X ToF *or* TCS34725 colour (same address!)",
    0x30: "VL53L0X (re-addressed)",
    0x3C: "SSD1306 OLED",
    0x3D: "SSD1306 OLED (alt address)",
    0x6A: "LSM6DS3 IMU",
    0x6B: "LSM6DS3 IMU (alt address)",
}

# The buses AIDriver actually opens, as (label, SDA, SCL, required addresses).
# These mirror the defaults in project/lib/aidriver/driver.py.
EXPECTED_BUSES = (
    ("Front ToF (VL53L0X)", 29, 28, (0x29,)),
    ("Side ToF (VL53L0X)", 6, 5, (0x29,)),
    ("Shared sensor bus", 16, 17, (0x6A, 0x3C, 0x29)),
)

# Pins to leave out of the sweep (e.g. reserved for on-board hardware). Add pin
# numbers here if the scan misbehaves on a particular GPIO.
EXCLUDE_PINS = set()

# SoftI2C frequency for probing. 100 kHz is a safe, widely-supported speed.
SCAN_FREQ = 100_000

# Per-transaction I2C timeout in microseconds. Kept short so that a floating or
# stuck line fails fast instead of blocking on SoftI2C's clock-stretch wait.
SCAN_TIMEOUT_US = 1_000

# Any pair reporting MORE than this many addresses is treated as a phantom
# (a stuck-LOW SDA line ACKing everything) and hidden. Real sensors expose only
# a few addresses, so a small cap removes the spam without dropping real hits.
MAX_PLAUSIBLE_ADDRS = 8

# Small settle delay between probes (ms) so lines can return to idle.
SETTLE_MS = 5


def _usable_pins():
    """Return the sorted list of candidate pins minus any excluded ones."""
    return sorted(p for p in CANDIDATE_PINS if p not in EXCLUDE_PINS)


def scan_pair(sda, scl):
    """Try one (SDA, SCL) pair. Return a list of found addresses, or None.

    None means the bus could not even be created / scanned on those pins
    (usually a pin that's unavailable), which we treat differently from an
    empty result (bus worked, but nothing answered).
    """
    try:
        # Enable the RP2040's internal pull-ups so an UNCONNECTED line idles
        # HIGH. Without this, a bare pin sits LOW and SoftI2C waits out its
        # clock-stretch timeout on every probe, making the sweep crawl.
        scl_pin = Pin(scl, Pin.OPEN_DRAIN, Pin.PULL_UP)
        sda_pin = Pin(sda, Pin.OPEN_DRAIN, Pin.PULL_UP)
        i2c = SoftI2C(scl=scl_pin, sda=sda_pin, freq=SCAN_FREQ, timeout=SCAN_TIMEOUT_US)
    except Exception:
        return None
    try:
        return i2c.scan()
    except Exception:
        return None


def _is_real_hit(found):
    """True only for a plausible, non-phantom result (1..MAX addresses)."""
    return bool(found) and len(found) <= MAX_PLAUSIBLE_ADDRS


def _describe(addrs):
    """Format addresses with the device each one belongs to."""
    return ", ".join(
        "0x%02X (%s)" % (a, KNOWN_DEVICES[a]) if a in KNOWN_DEVICES else "0x%02X" % a
        for a in addrs
    )


def check_expected_buses():
    """Probe each bus AIDriver opens and report what is missing.

    This is the check that answers "main.py says the side sensor failed" -
    a sweep hit somewhere else on the board does not mean the sensor is on
    the bus the driver will actually use.
    """
    print("Expected AIDriver buses")
    print("-" * 60)
    all_ok = True
    for label, sda, scl, required in EXPECTED_BUSES:
        found = scan_pair(sda, scl)
        if found is None:
            print("  FAIL %-22s SDA=GP%-2d SCL=GP%-2d bus unusable" % (label, sda, scl))
            all_ok = False
            continue
        if not _is_real_hit(found):
            reason = "nothing responded" if not found else "line stuck LOW (phantom)"
            print("  FAIL %-22s SDA=GP%-2d SCL=GP%-2d %s" % (label, sda, scl, reason))
            all_ok = False
            continue
        missing = [a for a in required if a not in found]
        status = "OK  " if not missing else "FAIL"
        if missing:
            all_ok = False
        print(
            "  %s %-22s SDA=GP%-2d SCL=GP%-2d -> %s"
            % (status, label, sda, scl, _describe(found))
        )
        if missing:
            print("       missing: %s" % _describe(missing))
        utime.sleep_ms(SETTLE_MS)
    print("-" * 60)
    if all_ok:
        print("All expected buses answered.\n")
    else:
        print("At least one bus is wrong - the sweep below finds where it moved.\n")
    return all_ok


def find_i2c_pins():
    """Sweep every ordered pin pair and print every genuine hit."""
    pins = _usable_pins()
    total = len(pins) * (len(pins) - 1)
    print("I2C pin-finder starting...")
    print(
        "Probing %d GP pins -> %d ordered (SDA, SCL) pairs at %d kHz."
        % (len(pins), total, SCAN_FREQ // 1000)
    )
    print("Wire ONE sensor and wait for the results below.\n")

    hits = []
    phantoms = 0
    tested = 0
    for sda in pins:
        # Per-row progress: show which SDA pin we're on and overall percentage.
        pct = (tested * 100) // total if total else 100
        print(
            "[%3d%%] testing SDA=GP%-2d (%d/%d pairs, %d hit(s))..."
            % (pct, sda, tested, total, len(hits))
        )
        for scl in pins:
            if sda == scl:
                continue
            tested += 1
            found = scan_pair(sda, scl)
            utime.sleep_ms(SETTLE_MS)
            if not found:
                continue
            if _is_real_hit(found):
                print(
                    "  HIT  SDA=GP%-2d SCL=GP%-2d -> %s" % (sda, scl, _describe(found))
                )
                hits.append((sda, scl, found))
            else:
                # Phantom: stuck/floating line ACKing everything. Hidden.
                phantoms += 1

    print(
        "\n[100%%] Scan complete: %d pairs tested, %d hit(s), %d phantom(s) hidden."
        % (tested, len(hits), phantoms)
    )
    if not hits:
        print(
            "No devices found. Check power (VIN->3V3, GND->GND), wiring, and "
            "that the sensor is a 3.3V I2C part."
        )
    else:
        print("\nSummary:")
        for sda, scl, found in hits:
            print("  SDA=GP%-2d SCL=GP%-2d  %s" % (sda, scl, _describe(found)))
    return hits


def main():
    check_expected_buses()
    find_i2c_pins()


if __name__ == "__main__":
    main()
