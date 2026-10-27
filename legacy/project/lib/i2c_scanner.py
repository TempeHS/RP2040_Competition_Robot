"""Reusable I2C pin-finder / bus-scanner utility for the RP2040.

Drop-in helper for working out which GP pins an I2C sensor is wired to, or for
listing the devices on a known bus. Everything is bit-banged with SoftI2C so it
works on almost any GPIO, not just the fixed hardware-I2C pins.

Typical use from the REPL or a script::

    from i2c_scanner import find_i2c_pins, scan_bus

    find_i2c_pins()          # sweep every pin pair, print genuine hits
    scan_bus(sda=6, scl=5)   # list addresses on one known bus

Phantom filtering:
A pin used as SDA that happens to sit LOW makes EVERY address appear to ACK, so
a scan returns the whole 0x08..0x77 range. Those are not real devices, just a
stuck/floating line. Any result with more than ``MAX_PLAUSIBLE_ADDRS`` addresses
is treated as a phantom and hidden, so only genuine hits are shown.
"""

from machine import Pin, SoftI2C
import utime

# --- Defaults (override via function arguments) ------------------------------
# Full user-GPIO range on the RP2040 (GP0..GP28).
DEFAULT_PINS = list(range(0, 29))

# SoftI2C frequency for probing. 100 kHz is a safe, widely-supported speed.
SCAN_FREQ = 100_000

# Per-transaction I2C timeout in microseconds. Kept short so a floating or stuck
# line fails fast instead of blocking on SoftI2C's clock-stretch wait.
SCAN_TIMEOUT_US = 1_000

# Results with more than this many addresses are treated as a phantom (a
# stuck-LOW SDA line ACKing everything) and hidden. Real sensors expose only a
# few addresses, so a small cap removes the spam without dropping real hits.
MAX_PLAUSIBLE_ADDRS = 8

# Small settle delay between probes (ms) so lines can return to idle.
SETTLE_MS = 5


def scan_bus(sda, scl, freq=SCAN_FREQ, timeout_us=SCAN_TIMEOUT_US):
    """Scan a single (SDA, SCL) SoftI2C bus. Return a list of addresses or None.

    None means the bus could not be created / scanned on those pins (usually an
    unavailable pin), which is distinct from an empty list (bus worked, nothing
    answered). Internal pull-ups are enabled so an unconnected line idles HIGH
    instead of stalling on the clock-stretch timeout.
    """
    try:
        scl_pin = Pin(scl, Pin.OPEN_DRAIN, Pin.PULL_UP)
        sda_pin = Pin(sda, Pin.OPEN_DRAIN, Pin.PULL_UP)
        i2c = SoftI2C(scl=scl_pin, sda=sda_pin, freq=freq, timeout=timeout_us)
    except Exception:
        return None
    try:
        return i2c.scan()
    except Exception:
        return None


def is_real_hit(found, max_addrs=MAX_PLAUSIBLE_ADDRS):
    """True only for a plausible, non-phantom result (1..max_addrs addresses)."""
    return bool(found) and len(found) <= max_addrs


def find_i2c_pins(
    pins=None,
    exclude=None,
    freq=SCAN_FREQ,
    timeout_us=SCAN_TIMEOUT_US,
    max_addrs=MAX_PLAUSIBLE_ADDRS,
    settle_ms=SETTLE_MS,
    verbose=True,
):
    """Sweep every ordered pin pair and return a list of genuine hits.

    Each hit is a tuple ``(sda, scl, [addresses])``. Wire ONE sensor at a time
    (VIN->3V3, GND->GND, plus its SDA/SCL) for an unambiguous result.

    Args:
        pins: iterable of GP pin numbers to probe (default DEFAULT_PINS).
        exclude: iterable of GP pin numbers to skip.
        freq/timeout_us: SoftI2C settings passed to ``scan_bus``.
        max_addrs: phantom cutoff (see ``is_real_hit``).
        settle_ms: delay between probes so lines return to idle.
        verbose: when True, print progress and results as they are found.
    """
    exclude = set(exclude or ())
    pins = sorted(p for p in (pins or DEFAULT_PINS) if p not in exclude)
    total = len(pins) * (len(pins) - 1)

    if verbose:
        print("I2C pin-finder starting...")
        print(
            "Probing %d GP pins -> %d ordered (SDA, SCL) pairs at %d kHz."
            % (len(pins), total, freq // 1000)
        )
        print("Wire ONE sensor and wait for the results below.\n")

    hits = []
    phantoms = 0
    tested = 0
    for sda in pins:
        if verbose:
            pct = (tested * 100) // total if total else 100
            print(
                "[%3d%%] testing SDA=GP%-2d (%d/%d pairs, %d hit(s))..."
                % (pct, sda, tested, total, len(hits))
            )
        for scl in pins:
            if sda == scl:
                continue
            tested += 1
            found = scan_bus(sda, scl, freq=freq, timeout_us=timeout_us)
            utime.sleep_ms(settle_ms)
            if not found:
                continue
            if is_real_hit(found, max_addrs):
                if verbose:
                    addrs = ", ".join("0x%02X" % a for a in found)
                    print("  HIT  SDA=GP%-2d SCL=GP%-2d -> %s" % (sda, scl, addrs))
                hits.append((sda, scl, found))
            else:
                # Phantom: stuck/floating line ACKing everything. Hidden.
                phantoms += 1

    if verbose:
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


if __name__ == "__main__":
    find_i2c_pins()
