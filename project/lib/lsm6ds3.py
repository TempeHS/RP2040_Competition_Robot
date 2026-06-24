"""
lsm6ds3.py
MicroPython driver for the ST LSM6DS3 / LSM6DS3-C IMU
(accelerometer + gyroscope, I²C interface).

Ported from SparkFun's LSM6DS3 Arduino library
(Marshall Taylor, SparkFun Electronics, MIT Licence).
https://github.com/sparkfun/SparkFun_LSM6DS3_Arduino_Library

Supports:
    LSM6DS3   WHO_AM_I = 0x69  (default I²C address 0x6B)
    LSM6DS3-C WHO_AM_I = 0x6A  (default I²C address 0x6B or 0x6A)

Wiring (Raspberry Pi Pico default pins):
    SDA → GP4   (or pass sda= to constructor)
    SCL → GP5   (or pass scl= to constructor)
    VCC → 3.3 V
    GND → GND
    SDO/SA0 → GND for address 0x6B, or VCC for 0x6A

Quick-start::

    from lsm6ds3 import LSM6DS3
    imu = LSM6DS3()          # defaults: I2C(0), SDA=GP4, SCL=GP5, addr=0x6B
    imu.begin()
    print(imu.read_gyro_z_dps())    # deg/s around vertical axis — use for turns
    print(imu.read_accel_g())       # (x, y, z) in g

Integration example for angle tracking in a turn::

    from lsm6ds3 import LSM6DS3
    from time import ticks_ms, ticks_diff
    imu = LSM6DS3()
    imu.begin()
    angle = 0.0
    last_ms = ticks_ms()
    while abs(angle) < 90:
        gz = imu.read_gyro_z_dps()
        now = ticks_ms()
        dt = ticks_diff(now, last_ms) / 1000.0
        last_ms = now
        angle += gz * dt
"""

import struct
from machine import I2C, Pin, SoftI2C
from time import sleep_ms, sleep_us


def _recover_i2c_bus(sda_pin, scl_pin, clocks=9):
    """Release an I²C slave that is holding SDA low (stuck-bus recovery).

    If the MCU resets while a slave is clocking out a byte, the slave keeps
    SDA pulled low waiting for the remaining clock pulses. A soft reboot does
    not reset the sensor, so the bus stays stuck and every transfer raises
    EIO. This bit-bangs up to ``clocks`` SCL pulses with SDA released until
    the slave lets go, then issues a STOP to return the bus to idle.

    Returns the final SDA level (1 = idle-high/recovered, 0 = still stuck).
    """
    sda = Pin(sda_pin, Pin.OPEN_DRAIN, Pin.PULL_UP)
    scl = Pin(scl_pin, Pin.OPEN_DRAIN, Pin.PULL_UP)
    sda.value(1)
    scl.value(1)
    sleep_us(5)

    for _ in range(clocks):
        if sda.value():
            break
        scl.value(0)
        sleep_us(5)
        scl.value(1)
        sleep_us(5)

    # STOP condition: SDA low→high while SCL is high.
    scl.value(1)
    sleep_us(5)
    sda.value(0)
    sleep_us(5)
    sda.value(1)
    sleep_us(5)
    return sda.value()


# ── Device IDs ────────────────────────────────────────────────────────────────
_WHO_AM_I_LSM6DS3 = 0x69
_WHO_AM_I_LSM6DS3_C = 0x6A

# ── Register map (from LSM6DS3.h) ─────────────────────────────────────────────
_REG_WHO_AM_I = 0x0F
_REG_CTRL1_XL = 0x10  # Accelerometer control
_REG_CTRL2_G = 0x11  # Gyroscope control
_REG_CTRL3_C = 0x12  # Common control (IF_INC, BDU, SW_RESET)
_REG_CTRL4_C = 0x13
_REG_STATUS = 0x1E
_REG_OUT_TEMP_L = 0x20
_REG_OUTX_L_G = 0x22  # Gyro X low byte
_REG_OUTY_L_G = 0x24  # Gyro Y low byte
_REG_OUTZ_L_G = 0x26  # Gyro Z low byte
_REG_OUTX_L_XL = 0x28  # Accel X low byte
_REG_OUTY_L_XL = 0x2A  # Accel Y low byte
_REG_OUTZ_L_XL = 0x2C  # Accel Z low byte

# CTRL1_XL field values
_ODR_XL = {
    0: 0x00,
    13: 0x10,
    26: 0x20,
    52: 0x30,
    104: 0x40,
    208: 0x50,
    416: 0x60,
    833: 0x70,
    1660: 0x80,
    3330: 0x90,
    6660: 0xA0,
}
_FS_XL = {2: 0x00, 4: 0x08, 8: 0x0C, 16: 0x04}
_BW_XL = {400: 0x00, 200: 0x01, 100: 0x02, 50: 0x03}

# CTRL2_G field values
_ODR_G = {
    0: 0x00,
    13: 0x10,
    26: 0x20,
    52: 0x30,
    104: 0x40,
    208: 0x50,
    416: 0x60,
    833: 0x70,
    1660: 0x80,
}
_FS_G = {125: 0x02, 245: 0x00, 500: 0x04, 1000: 0x08, 2000: 0x0C}


class LSM6DS3Error(Exception):
    pass


class LSM6DS3:
    """MicroPython driver for the LSM6DS3 / LSM6DS3-C IMU over I²C.

    Args:
        i2c_id:         I²C bus index (default 0 → GP4/GP5 on Pico)
        address:        I²C device address (default 0x6B)
        sda:            SDA pin number (default 4)
        scl:            SCL pin number (default 5)
        freq:           I²C bus frequency in Hz (default 400_000)
        i2c:            Pre-built I2C/SoftI2C instance. If given, sda/scl/freq/
                        i2c_id/use_soft are ignored and this bus is used as-is.
        use_soft:       If True, build a machine.SoftI2C (bit-banged) bus instead
                        of the hardware I2C peripheral. On RP2040 the hardware
                        I2C block can ACK a device's address but then raise EIO
                        on every data phase; SoftI2C behaves like Arduino Wire
                        and works around this.
        gyro_range:     Gyro full-scale in deg/s. One of: 125, 245, 500, 1000, 2000
        gyro_rate:      Gyro output data rate in Hz. One of: 13, 26, 52, 104, 208, 416, 833, 1660
        accel_range:    Accel full-scale in g. One of: 2, 4, 8, 16
        accel_rate:     Accel output data rate in Hz. One of: 13, 26, 52, 104, 208, 416, 833, 1660
    """

    def __init__(
        self,
        i2c_id=0,
        address=0x6B,
        sda=4,
        scl=5,
        freq=400_000,
        i2c=None,
        use_soft=False,
        gyro_range=2000,
        gyro_rate=416,
        accel_range=16,
        accel_rate=416,
    ):
        if i2c is not None:
            self._i2c = i2c
        else:
            # Free the bus first: if the MCU was reset mid-read the sensor may
            # still be holding SDA low, which makes every transfer fail with
            # EIO (and scan() falsely report the device, since a stuck-low SDA
            # reads as a permanent ACK). A soft reboot does not reset the
            # sensor, so recovery must happen here, before the bus is created.
            _recover_i2c_bus(sda, scl)
            if use_soft:
                # Bit-banged bus. Build the pins as OPEN_DRAIN with the internal
                # pull-ups enabled — this is the exact configuration proven to
                # read WHO_AM_I reliably on GP16/GP17 when the RP2040 hardware
                # I2C block fails the data phase with EIO. SoftI2C alone does not
                # guarantee the pull is on, so set it explicitly here.
                self._i2c = SoftI2C(
                    sda=Pin(sda, Pin.OPEN_DRAIN, Pin.PULL_UP),
                    scl=Pin(scl, Pin.OPEN_DRAIN, Pin.PULL_UP),
                    freq=freq,
                )
            else:
                self._i2c = I2C(i2c_id, sda=Pin(sda), scl=Pin(scl), freq=freq)
        self._addr = address

        # Gain settings — filled in by begin() after reading WHO_AM_I
        self._gyro_range = gyro_range
        self._gyro_rate = gyro_rate
        self._accel_range = accel_range
        self._accel_rate = accel_rate
        self._temp_sensitivity = 16  # updated by begin() for DS3-C

        self._device_id = None  # set after begin()

    # ── Low-level I²C helpers ─────────────────────────────────────────────────

    def _read_bytes(self, reg, length):
        """Read *length* bytes from register *reg*.

        Mirrors the proven SparkFun Arduino driver's I²C sequence, which is
        STOP-separated (NOT repeated-start):

            Wire.beginTransmission(addr); Wire.write(reg); Wire.endTransmission();
            Wire.requestFrom(addr, n);

        i.e. write the register pointer and send a STOP, then issue a brand-new
        START to read. The LSM6DS3TR-C on the Seeed Grove module NAKs the data
        phase of a repeated-start (Sr) read on the RP2040 I²C block, which shows
        up as EIO. Sending a STOP between the pointer write and the read avoids
        this entirely.

        In MicroPython, writeto() with the default stop=True sends the STOP
        (equivalent to Wire.endTransmission(true)).
        """
        last_exc = None

        for _ in range(4):
            try:
                # stop=True (default) → STOP after the register pointer, exactly
                # like Wire.endTransmission(). Then a fresh START to read.
                self._i2c.writeto(self._addr, bytes([reg & 0xFF]))
                return self._i2c.readfrom(self._addr, length)
            except OSError as exc:
                last_exc = exc
                sleep_ms(2)

        raise LSM6DS3Error(
            "I2C read failed at reg 0x{:02X}, len {}: {}".format(reg, length, last_exc)
        )

    def _read_reg(self, reg):
        """Read one byte from *reg* with small retry window.

        Some RP2040 ports can return transient EIO while a sensor exits reset
        or clock-stretches briefly.  A short retry greatly improves robustness
        without changing normal behaviour.
        """
        return self._read_bytes(reg, 1)[0]

    def _read_reg_int16(self, reg):
        """Read two consecutive bytes starting at *reg* and return as signed int16."""
        raw = self._read_bytes(reg, 2)
        return struct.unpack("<h", raw)[0]  # little-endian signed 16-bit

    def _write_reg(self, reg, value):
        """Write one byte *value* to *reg* with retry."""
        last_exc = None

        for _ in range(4):
            try:
                self._i2c.writeto(self._addr, bytes([reg & 0xFF, value & 0xFF]))
                return
            except OSError as exc:
                last_exc = exc
                sleep_ms(2)

        for _ in range(4):
            try:
                self._i2c.writeto_mem(self._addr, reg, bytes([value & 0xFF]))
                return
            except OSError as exc:
                last_exc = exc
                sleep_ms(2)
        raise LSM6DS3Error("I2C write failed at reg 0x{:02X}: {}".format(reg, last_exc))

    def _update_reg(self, reg, mask, value):
        """Read-modify-write: clear *mask* bits then OR in *value*."""
        current = self._read_reg(reg)
        self._write_reg(reg, (current & ~mask) | (value & mask))

    # ── Initialisation ────────────────────────────────────────────────────────

    def begin(self):
        """Configure the IMU.  Must be called before reading any sensor data.

        Raises:
            LSM6DS3Error: if the WHO_AM_I register does not return a known value.
        """
        # Small power-on delay
        sleep_ms(20)

        # Verify device identity
        who = self._read_reg(_REG_WHO_AM_I)
        if who not in (_WHO_AM_I_LSM6DS3, _WHO_AM_I_LSM6DS3_C):
            raise LSM6DS3Error(
                "WHO_AM_I = 0x{:02X} — not an LSM6DS3. Check wiring and address.".format(
                    who
                )
            )
        self._device_id = who

        # LSM6DS3-C uses a different temperature sensitivity
        self._temp_sensitivity = 256 if who == _WHO_AM_I_LSM6DS3_C else 16

        # Software reset then poll until the reset bit clears.
        # Writing config too early can provoke EIO on some boards.
        self._write_reg(_REG_CTRL3_C, 0x01)
        for _ in range(60):
            ctrl3 = self._read_reg(_REG_CTRL3_C)
            if (ctrl3 & 0x01) == 0:
                break
            sleep_ms(2)
        else:
            raise LSM6DS3Error("CTRL3_C reset bit did not clear in time")

        # Reboot memory content (reloads factory trim), mirroring the Adafruit
        # driver's reset(): set BOOT (bit 7) and wait for it to self-clear.
        # This puts the device in a deterministic power-on state.
        self._write_reg(_REG_CTRL3_C, 0x80)
        for _ in range(60):
            if (self._read_reg(_REG_CTRL3_C) & 0x80) == 0:
                break
            sleep_ms(2)
        sleep_ms(15)  # boot procedure settle

        # CTRL3_C: enable register auto-increment (IF_INC) + block data update (BDU)
        self._write_reg(_REG_CTRL3_C, 0x44)  # IF_INC | BDU

        # CTRL1_XL: configure accelerometer ODR, full-scale, bandwidth
        xl_bw = _BW_XL.get(400, 0x00)  # 400 Hz anti-alias filter
        xl_fs = _FS_XL.get(self._accel_range, 0x04)
        xl_odr = _ODR_XL.get(self._accel_rate, 0x60)
        self._write_reg(_REG_CTRL1_XL, xl_odr | xl_fs | xl_bw)

        # CTRL4_C: set BW_SCAL_ODR so bandwidth tracks ODR
        self._update_reg(_REG_CTRL4_C, 0x80, 0x80)

        # CTRL2_G: configure gyroscope ODR and full-scale
        g_fs = _FS_G.get(self._gyro_range, 0x0C)
        g_odr = _ODR_G.get(self._gyro_rate, 0x60)
        self._write_reg(_REG_CTRL2_G, g_odr | g_fs)

        # Let the accel/gyro turn-on transient pass before the first read so the
        # initial sample is valid (the Adafruit driver sleeps here too).
        sleep_ms(20)

    # ── Status ────────────────────────────────────────────────────────────────

    @property
    def data_ready(self):
        """True when both accelerometer and gyroscope have a new sample."""
        status = self._read_reg(_REG_STATUS)
        return bool(status & 0x03)  # XLDA | GDA

    # ── Accelerometer ─────────────────────────────────────────────────────────

    def read_raw_accel(self):
        """Return raw (x, y, z) accelerometer counts as signed int16 values."""
        x = self._read_reg_int16(_REG_OUTX_L_XL)
        y = self._read_reg_int16(_REG_OUTY_L_XL)
        z = self._read_reg_int16(_REG_OUTZ_L_XL)
        return x, y, z

    def _calc_accel(self, raw):
        """Convert raw accel count to g.  Mirrors LSM6DS3::calcAccel()."""
        # sensitivity = 0.061 mg/LSB × (full-scale / 2)
        return raw * 0.061 * (self._accel_range >> 1) / 1000.0

    def read_accel_g(self):
        """Return (ax, ay, az) in g (float)."""
        x, y, z = self.read_raw_accel()
        return self._calc_accel(x), self._calc_accel(y), self._calc_accel(z)

    def read_accel_x(self):
        return self._calc_accel(self._read_reg_int16(_REG_OUTX_L_XL))

    def read_accel_y(self):
        return self._calc_accel(self._read_reg_int16(_REG_OUTY_L_XL))

    def read_accel_z(self):
        return self._calc_accel(self._read_reg_int16(_REG_OUTZ_L_XL))

    # ── Gyroscope ─────────────────────────────────────────────────────────────

    def read_raw_gyro(self):
        """Return raw (x, y, z) gyroscope counts as signed int16 values."""
        x = self._read_reg_int16(_REG_OUTX_L_G)
        y = self._read_reg_int16(_REG_OUTY_L_G)
        z = self._read_reg_int16(_REG_OUTZ_L_G)
        return x, y, z

    def _calc_gyro(self, raw):
        """Convert raw gyro count to deg/s.  Mirrors LSM6DS3::calcGyro()."""
        # sensitivity = 4.375 mdps/LSB × (range / 125)
        divisor = self._gyro_range // 125
        if self._gyro_range == 245:
            divisor = 2
        return raw * 4.375 * divisor / 1000.0

    def read_gyro_dps(self):
        """Return (gx, gy, gz) in degrees per second (float)."""
        x, y, z = self.read_raw_gyro()
        return self._calc_gyro(x), self._calc_gyro(y), self._calc_gyro(z)

    def read_gyro_x(self):
        return self._calc_gyro(self._read_reg_int16(_REG_OUTX_L_G))

    def read_gyro_y(self):
        return self._calc_gyro(self._read_reg_int16(_REG_OUTY_L_G))

    def read_gyro_z_dps(self):
        return self._calc_gyro(self._read_reg_int16(_REG_OUTZ_L_G))

    # ── Temperature ───────────────────────────────────────────────────────────

    def read_raw_temp(self):
        return self._read_reg_int16(_REG_OUT_TEMP_L)

    def read_temp_c(self):
        """Return temperature in °C.  Mirrors LSM6DS3::readTempC()."""
        return self.read_raw_temp() / self._temp_sensitivity + 25.0

    def read_temp_f(self):
        """Return temperature in °F."""
        return self.read_temp_c() * 9.0 / 5.0 + 32.0

    # ── Convenience: integrated-angle turn helper ─────────────────────────────

    def integrate_turn(self, target_deg, motor_fn, dt_ms=10):
        """Block until the IMU measures *target_deg* of rotation around Z.

        This replaces timed turns with closed-loop angle control.

        Args:
            target_deg: Desired rotation in degrees. Positive = CCW (right-hand
                        rule). Use a negative value for clockwise turns.
            motor_fn:   Callable called every *dt_ms* ms that drives the motors.
                        Receives no arguments — configure speed before calling
                        this method.  Example::

                            my_robot.rotate_right(180)
                            imu.integrate_turn(-90, lambda: None)
                            my_robot.brake()

            dt_ms:      Integration step in milliseconds (default 10).

        Returns:
            float: Actual degrees turned (useful for debugging).
        """
        from time import ticks_ms, ticks_diff

        angle = 0.0
        last = ticks_ms()
        sign = 1 if target_deg >= 0 else -1

        while sign * angle < sign * target_deg:
            motor_fn()
            now = ticks_ms()
            dt = ticks_diff(now, last) / 1000.0
            last = now
            angle += self.read_gyro_z_dps() * dt
            sleep_ms(dt_ms)

        return angle
