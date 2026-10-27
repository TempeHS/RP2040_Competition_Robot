"""LSM6DS3 / LSM6DS3TR-C gyro, Z axis only."""

import struct
from time import sleep_ms


class LSM6DS3:
    def __init__(self, i2c, address=0x6A):
        self.i2c = i2c
        self.address = address
        if self._read(0x0F, 1)[0] not in (0x69, 0x6A):
            raise OSError("LSM6DS3 not found")
        self._write(0x12, 0x44)  # block data update, auto-increment
        self._write(0x11, 0x64)  # gyro 416 Hz, 500 dps
        sleep_ms(50)

    # Pointer write then a separate read: this part NAKs repeated-start reads.
    def _read(self, reg, n):
        self.i2c.writeto(self.address, bytes([reg]))
        return self.i2c.readfrom(self.address, n)

    def _write(self, reg, value):
        self.i2c.writeto(self.address, bytes([reg, value]))

    def read(self):
        """Z rotation rate in degrees per second."""
        return struct.unpack("<h", self._read(0x26, 2))[0] * 0.0175
