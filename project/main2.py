"""I2C pin-finder scanner for the RP2040.

Purpose: quickly work out which GP pins an I2C sensor is wired to. It brute-force
tries every ordered pair of GP pins as an (SDA, SCL) SoftI2C bus, runs an I2C
scan, and prints any pair that finds one or more device addresses.

Why SoftI2C: bit-banged I2C works on almost any GPIO, so we can probe arbitrary
pin combinations without being limited to the hardware I2C peripherals' fixed
pin mux. That makes it perfect for "I don't know where this sensor is plugged
in" situations.

How to use:
  1. Wire ONE sensor at a time (VIN->3V3, GND->GND, plus its SDA/SCL).
  2. Copy this file to the Pico and run it.
  3. Read the results — each hit shows the SDA pin, SCL pin, and the
     address(es) found. Sensors usually have a known address (e.g. VL53L0X and
     TCS34725 are 0x29), so you can confirm the match.

Notes:
  - Each real bus tends to appear twice, once for each SDA/SCL orientation,
    because it can be hard to tell the two lines apart electrically. The correct
    orientation is the one your driver expects.
  - Some pins are tied up by on-board peripherals and may error or give false
    hits; those are skipped/flagged rather than crashing the scan.
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
        i2c = SoftI2C(scl=Pin(scl), sda=Pin(sda), freq=SCAN_FREQ)
    except Exception:
        return None
    try:
        return i2c.scan()
    except Exception:
        return None


def find_i2c_pins():
    """Sweep every ordered pin pair and print every combination that hits."""
    pins = _usable_pins()
    total = len(pins) * (len(pins) - 1)
    print("I2C pin-finder starting...")
    print(
        "Probing %d GP pins -> %d ordered (SDA, SCL) pairs at %d kHz."
        % (len(pins), total, SCAN_FREQ // 1000)
    )
    print("Wire ONE sensor and wait for the results below.\n")

    hits = []
    tested = 0
    for sda in pins:
        # Per-row progress: show which SDA pin we're on and overall percentage.
        pct = (tested * 100) // total if total else 100
        print(
            "[%3d%%] testing SDA=GP%-2d (%d/%d pairs done, %d hit(s))..."
            % (pct, sda, tested, total, len(hits))
        )
        for scl in pins:
            if sda == scl:
                continue
            tested += 1
            found = scan_pair(sda, scl)
            utime.sleep_ms(SETTLE_MS)
            if found:  # non-empty list => at least one device answered
                addrs = ", ".join("0x%02X" % a for a in found)
                print("  HIT  SDA=GP%-2d SCL=GP%-2d -> %s" % (sda, scl, addrs))
                hits.append((sda, scl, found))

    print("\n[100%%] Scan complete: tested %d pairs, %d hit(s)." % (tested, len(hits)))
    if not hits:
        print(
            "No devices found. Check power (VIN->3V3, GND->GND), wiring, and "
            "that the sensor is a 3.3V I2C part."
        )
    else:
        print("\nSummary (each real bus usually shows up as a reversed pair):")
        for sda, scl, found in hits:
            addrs = ", ".join("0x%02X" % a for a in found)
            print("  SDA=GP%-2d SCL=GP%-2d  addresses: %s" % (sda, scl, addrs))
    return hits


def main():
    find_i2c_pins()


if __name__ == "__main__":
    main()
