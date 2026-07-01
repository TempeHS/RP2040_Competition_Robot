# Hardware Integration

## I²C Peripherals (IMU, Colour, OLED)

The competition robot shares one bit-banged `SoftI2C` bus on **GP16 (SDA) / GP17 (SCL)** for three devices, each constructed in `AIDriver.__init__` with the same **graceful-degradation** pattern: a `has_*` flag starts `False`, init runs inside `try/except`, and every public method no-ops when the device is absent. The same program therefore runs with any subset of these fitted.

| Device             | Address       | Flag          | Public API                                              |
| ------------------ | ------------- | ------------- | ------------------------------------------------------- |
| LSM6DS3 IMU (gyro) | `0x6A`/`0x6B` | `has_gyro`    | `read_gyro_z_dps()`, `turn_90/180/degrees()`            |
| TCS34725 colour    | `0x29`        | `has_color`   | `read_color()`, `classify_color()`, `color_detected()`  |
| SSD1306 OLED       | `0x3C`        | `has_display` | `show_display()`, `display_status()`, `clear_display()` |

The OLED driver lives at `project/lib/ssd1306.py`. `display_status(state, score, victims)` is the
high-level call the competition controller pushes on every state change; `show_display(l1..l4)` writes
four raw 16-character lines. In the simulator these render on the on-screen OLED panel
(`app/js/oled-panel.js`) so learners see exactly what the hardware screen would show.

The **rescue-kit servo** (`deploy_rescue_kit()`, flag `has_kit`, `kit_servo_pin` constructor arg)
follows the same graceful pattern: unwired by default it just logs and returns `False`; given a pin it
sweeps a 50 Hz hobby servo to release a survival kit on a harmed-victim tile.
