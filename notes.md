      tof_front_sda=29,  # GP29 (A0) — front ToF dedicated SoftI2C SDA
        tof_front_scl=28,  # GP28 (A1) — front ToF dedicated SoftI2C SCL

The timeout is consistent with a bus-level I2C problem rather than the reading loop itself. I’ve updated the code to use open-drain pins with pull-ups, which is the safer pattern for these sensors, and I also added a pre-scan so you can see whether the device is visible before the VL53L0X initialization runs.

[I2C] (2/12) SDA=GP4 SCL=GP5 (I2C0)...
112 addresses ACKed - floating bus (missing pull-ups?), ignored

Left hand on wall turns left (maybe gyroscope upsidedown?)

LCD not displaying should always output debug info like state and errors

Need a scan of all devices tro print and OLDEN on start -1 after 5 attempost of a ranger = not present
