"""I2C pin-finder scanner for the RP2040.

Purpose: quickly work out which GP pins an I2C sensor is wired to. It tries every
ordered pair of GP pins as an (SDA, SCL) SoftI2C bus, runs an I2C scan, and
prints any pair that finds a plausible set of device addresses.

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
  1. Wire ONE sensor at a time (VIN->3V3, GND->GND, plus its SDA/SCL).
  2. Copy this file to the Pico and run it.
  3. Read the results - each hit shows the SDA pin, SCL pin, and the address(es)
     found. Sensors usually have a known address (e.g. VL53L0X and TCS34725 are
     0x29), so you can confirm the match.
"""

from machine import Pin, SoftI2C
import utime

# --- Configuration -----------------------------------------------------------
# GP pins to include in the sweep. By default we probe the full user-GPIO range
# on the RP2040 (GP0..GP28). Trim this list to speed things up if you already
# know roughly where the sensor is.
CANDIDATE_PINS = list(range(0, 29))

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
                addrs = ", ".join("0x%02X" % a for a in found)
                print("  HIT  SDA=GP%-2d SCL=GP%-2d -> %s" % (sda, scl, addrs))
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
            addrs = ", ".join("0x%02X" % a for a in found)
            print("  SDA=GP%-2d SCL=GP%-2d  addresses: %s" % (sda, scl, addrs))
    return hits


def main():
    find_i2c_pins()


if __name__ == "__main__":
    main()
