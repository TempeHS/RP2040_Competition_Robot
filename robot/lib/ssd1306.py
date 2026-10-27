"""SSD1306 OLED. Draw with the framebuf methods (text, fill, ...) then show()."""

import framebuf

_INIT = (
    0xAE,
    0x20,
    0x00,
    0x40,
    0xA1,
    0xC8,
    0xD3,
    0x00,
    0xDA,
    0x12,
    0xD5,
    0x80,
    0xD9,
    0xF1,
    0xDB,
    0x30,
    0x81,
    0xFF,
    0xA4,
    0xA6,
    0x8D,
    0x14,
)


class SSD1306(framebuf.FrameBuffer):
    def __init__(self, i2c, width=64, height=48, address=0x3C):
        self.i2c = i2c
        self.address = address
        self.width = width
        self.height = height
        self.buffer = bytearray(width * height // 8)
        super().__init__(self.buffer, width, height, framebuf.MONO_VLSB)
        for cmd in _INIT + (0xA8, height - 1, 0xAF):
            self._cmd(cmd)
        self.fill(0)
        self.show()

    def _cmd(self, cmd):
        self.i2c.writeto(self.address, bytes([0x80, cmd]))

    def show(self):
        x0 = (
            128 - self.width
        ) // 2  # small panels sit in the middle of the 128-column RAM
        for cmd in (0x21, x0, x0 + self.width - 1, 0x22, 0, self.height // 8 - 1):
            self._cmd(cmd)
        self.i2c.writevto(self.address, (b"\x40", self.buffer))
