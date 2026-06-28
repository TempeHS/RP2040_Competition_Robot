"""
tcs34725.py
MicroPython driver for the AMS TCS34725 RGB colour / light sensor (I²C).

Ported and trimmed for the Tempe High School AIDriver robot. Reference:
https://micropython-tcs34725.readthedocs.io/en/latest/tcs34725.html

The TCS34725 has a fixed I²C address (0x29) so it can safely share the same
bit-banged SoftI2C bus as the LSM6DS3 gyro (address 0x6A) on GP16/GP17.

This sensor faces the floor and is used for ground colour detection
(red / green / reflective-silver markers). It also drives a hardware
interrupt line (active-low) that asserts when the clear-channel reading
crosses a brightness threshold, letting the robot react the instant it
rolls onto a coloured marker instead of polling.

Wiring (default for the AIDriver build):
    SDA → GP16   (shared SoftI2C with the gyro)
    SCL → GP17   (shared SoftI2C with the gyro)
    INT → GP7    (active-low interrupt, handled in aidriver.py)
    VCC → 3.3 V
    GND → GND
    LED → controllable on-board white LED (tie to GND to disable)

Quick-start::

    from tcs34725 import TCS34725
    sensor = TCS34725(sda=16, scl=17)
    sensor.begin()
    r, g, b, c = sensor.read_rgbc()
    print(r, g, b, c)
"""

from machine import Pin, SoftI2C
from time import sleep_ms

# ── Command register ──────────────────────────────────────────────────────────
_COMMAND_BIT = 0x80
_AUTO_INCREMENT = 0x20  # COMMAND type field: auto-increment register pointer

# ── Register map ──────────────────────────────────────────────────────────────
_REG_ENABLE = 0x00
_REG_ATIME = 0x01  # RGBC integration time
_REG_WTIME = 0x03  # Wait time
_REG_AILTL = 0x04  # Clear interrupt low threshold, low byte
_REG_AIHTL = 0x06  # Clear interrupt high threshold, low byte
_REG_PERS = 0x0C  # Interrupt persistence filter
_REG_CONFIG = 0x0D
_REG_CONTROL = 0x0F  # Gain
_REG_ID = 0x12
_REG_STATUS = 0x13
_REG_CDATAL = 0x14  # Clear data, low byte (RGBC follows: C, R, G, B)

# ── ENABLE register bits ──────────────────────────────────────────────────────
_ENABLE_PON = 0x01  # Power on
_ENABLE_AEN = 0x02  # RGBC enable
_ENABLE_AIEN = 0x10  # RGBC interrupt enable

# ── STATUS register bits ──────────────────────────────────────────────────────
_STATUS_AVALID = 0x01  # RGBC valid
_STATUS_AINT = 0x10  # RGBC interrupt asserted

# Special function: clear the RGBC interrupt latch.
_SPECIAL_CLEAR_INT = 0x66

# Known device IDs (TCS34725 = 0x44, TCS34727 = 0x4D).
_VALID_IDS = (0x44, 0x4D, 0x10)

# Gain code → multiplier, used only for documentation/validation.
_GAINS = {1: 0x00, 4: 0x01, 16: 0x02, 60: 0x03}


class TCS34725:
    """Driver for the TCS34725 RGB colour sensor over (Soft)I²C.

    Args:
        sda: SDA GPIO number when building an internal SoftI2C bus.
        scl: SCL GPIO number when building an internal SoftI2C bus.
        i2c: An existing I2C/SoftI2C bus to use instead of building one.
        address: I²C address (fixed 0x29 for the TCS34725).
        freq: SoftI2C bus frequency when building an internal bus.
        integration_time_ms: RGBC integration window (2.4–614 ms).
        gain: Analog gain multiplier (1, 4, 16 or 60).
    """

    def __init__(
        self,
        sda=16,
        scl=17,
        i2c=None,
        address=0x29,
        freq=50_000,
        integration_time_ms=50,
        gain=4,
    ):
        self.address = address
        self._integration_time_ms = integration_time_ms
        self._gain = gain if gain in _GAINS else 4

        if i2c is not None:
            self.i2c = i2c
        else:
            # Bit-banged bus, matching the gyro driver, so the hardware I²C
            # block never touches these pins (see lsm6ds3.py notes).
            self.i2c = SoftI2C(
                sda=Pin(sda, Pin.OPEN_DRAIN, Pin.PULL_UP),
                scl=Pin(scl, Pin.OPEN_DRAIN, Pin.PULL_UP),
                freq=freq,
            )

        self._started = False

    # ── Low-level register access ─────────────────────────────────────────────
    def _write8(self, reg, value):
        self.i2c.writeto_mem(self.address, _COMMAND_BIT | reg, bytes([value & 0xFF]))

    def _read8(self, reg):
        return self.i2c.readfrom_mem(self.address, _COMMAND_BIT | reg, 1)[0]

    def _read16(self, reg):
        # Auto-increment so the two data bytes come back in one transfer.
        data = self.i2c.readfrom_mem(
            self.address, _COMMAND_BIT | _AUTO_INCREMENT | reg, 2
        )
        return data[0] | (data[1] << 8)

    # ── Public configuration ──────────────────────────────────────────────────
    def begin(self):
        """Power on the sensor, apply timing/gain, and verify the device ID.

        Raises:
            OSError/RuntimeError: if the device does not respond or the ID is
            not a recognised TCS347xx part.
        """
        chip_id = self._read8(_REG_ID)
        if chip_id not in _VALID_IDS:
            raise RuntimeError(
                "TCS34725 not found (ID=0x{:02X}) — check wiring/address".format(
                    chip_id
                )
            )

        self.set_integration_time(self._integration_time_ms)
        self.set_gain(self._gain)

        # Power on, then enable the RGBC engine after the required 2.4 ms delay.
        self._write8(_REG_ENABLE, _ENABLE_PON)
        sleep_ms(3)
        self._write8(_REG_ENABLE, _ENABLE_PON | _ENABLE_AEN)
        sleep_ms(int(self._integration_time_ms) + 3)
        self._started = True
        return True

    def set_integration_time(self, ms):
        """Set the RGBC integration time in milliseconds (2.4–614 ms)."""
        ms = max(2.4, min(614.0, float(ms)))
        self._integration_time_ms = ms
        atime = int(round(256 - ms / 2.4))
        atime = max(0, min(255, atime))
        self._write8(_REG_ATIME, atime)

    def set_gain(self, gain):
        """Set the analog gain (1, 4, 16 or 60)."""
        if gain not in _GAINS:
            gain = 4
        self._gain = gain
        self._write8(_REG_CONTROL, _GAINS[gain])

    # ── Readings ──────────────────────────────────────────────────────────────
    def read_rgbc(self):
        """Return the raw (red, green, blue, clear) channel counts.

        Each value is a 16-bit count. The clear channel ``c`` is overall
        brightness; ``r``/``g``/``b`` are the colour channels.
        """
        c = self._read16(_REG_CDATAL)
        r = self._read16(_REG_CDATAL + 2)
        g = self._read16(_REG_CDATAL + 4)
        b = self._read16(_REG_CDATAL + 6)
        return (r, g, b, c)

    # ── Interrupt support ─────────────────────────────────────────────────────
    def set_interrupt_thresholds(self, low, high):
        """Set the clear-channel interrupt thresholds (16-bit each).

        The INT line asserts (goes low) when the clear reading stays below
        ``low`` or above ``high`` for the configured persistence count. Set a
        low ``high`` value so any bright marker (red/green/silver) trips it.
        """
        low = max(0, min(0xFFFF, int(low)))
        high = max(0, min(0xFFFF, int(high)))
        self._write8(_REG_AILTL, low & 0xFF)
        self._write8(_REG_AILTL + 1, (low >> 8) & 0xFF)
        self._write8(_REG_AIHTL, high & 0xFF)
        self._write8(_REG_AIHTL + 1, (high >> 8) & 0xFF)

    def set_persistence(self, cycles):
        """Set how many out-of-range readings are needed before INT fires.

        ``cycles`` of 0 fires on every reading; small values (e.g. 1–4) give a
        light debounce. Only specific values are valid per the datasheet; the
        nearest supported code is used.
        """
        table = [0, 1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
        code = 0
        for i, v in enumerate(table):
            if cycles >= v:
                code = i
        self._write8(_REG_PERS, code)

    def enable_interrupt(self, enable=True):
        """Enable or disable the RGBC interrupt (AIEN) on the INT pin."""
        state = self._read8(_REG_ENABLE)
        if enable:
            state |= _ENABLE_AIEN
        else:
            state &= ~_ENABLE_AIEN
        self._write8(_REG_ENABLE, state)

    def clear_interrupt(self):
        """Clear the latched RGBC interrupt so the INT line releases (high)."""
        self.i2c.writeto(self.address, bytes([_COMMAND_BIT | _SPECIAL_CLEAR_INT]))
