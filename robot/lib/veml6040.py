"""VEML6040 RGBW colour sensor."""

from time import sleep_ms


class VEML6040:
    def __init__(self, i2c, address=0x10):
        self.i2c = i2c
        self.address = address
        self.i2c.writeto_mem(address, 0x00, b"\x00\x00")  # on, auto mode, 40 ms
        sleep_ms(50)

    def read(self):
        """Raw (red, green, blue, white) counts."""
        return tuple(
            int.from_bytes(self.i2c.readfrom_mem(self.address, reg, 2), "little")
            for reg in (0x08, 0x09, 0x0A, 0x0B)
        )
