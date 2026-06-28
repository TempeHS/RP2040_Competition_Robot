"""
gyro_heading.py  —  Standalone LSM6DS3 gyro heading (yaw) test.

No ultrasonic rangers involved. Reads only the IMU and integrates the
gyroscope's Z axis into a relative heading angle.

What this gives you:
    • yaw  — relative heading in degrees (0 wherever you start; tracks how far
             the robot has turned, NOT compass North).
    • rate — instantaneous yaw rate in deg/s.

Why "relative, not compass":
    The LSM6DS3 is a 6-axis IMU (accelerometer + gyroscope). It has NO
    magnetometer, so it cannot sense magnetic North. Heading is obtained by
    integrating the gyro, which drifts slowly over time — fine for short
    maneuvers like "turn 90 degrees".

Wiring (confirmed on this board):
    SDA → GP16, SCL → GP17, VCC → 3.3 V, GND → GND, address 0x6A.
    Driven over SoftI2C because the RP2040 hardware-I2C block fails this
    sensor's data phase with EIO.

Run it, keep the robot still for the ~1 s calibration, then rotate it and
watch the yaw value track the turn. Press Ctrl-C to stop.
"""

from time import ticks_ms, ticks_diff, sleep_ms

from lsm6ds3 import LSM6DS3, _recover_i2c_bus

# ── IMU setup (same proven SoftI2C path as main2.py) ──────────────────────────
IMU_SDA, IMU_SCL, IMU_ADDR, IMU_FREQ = 16, 17, 0x6A, 50_000

_recover_i2c_bus(IMU_SDA, IMU_SCL, clocks=16)
imu = LSM6DS3(
    sda=IMU_SDA,
    scl=IMU_SCL,
    freq=IMU_FREQ,
    address=IMU_ADDR,
    use_soft=True,
    # +-1000 dps full-scale = 35 mdps/LSB, 2x finer than the +-2000 default
    # while still leaving headroom for fast hand turns (a quick wrist flick can
    # exceed 500 dps, which +-500 would clip and undercount). For a smooth
    # motor-driven robot (~150 dps) you can drop this to gyro_range=500 for
    # another 2x resolution.
    gyro_range=1000,
    gyro_rate=416,
)
imu.begin()
print(
    "IMU OK at 0x{:02X} on GP{}/GP{} via SoftI2C (device id: 0x{:02X})".format(
        IMU_ADDR, IMU_SDA, IMU_SCL, imu._device_id
    )
)


def calibrate_gyro_z_bias(samples=200, delay_ms=5):
    """Measure the gyro Z zero-rate bias. Keep the robot perfectly still.

    Even at rest the gyro reads a small non-zero rate (we saw ~+1.3 deg/s).
    Left uncorrected that bias integrates into a large false heading drift
    (~78 deg/min at 1.3 deg/s), so it must be subtracted before integrating.

    Returns the average resting yaw rate in deg/s.
    """
    print("Calibrating gyro bias — hold the robot STILL...")
    total = 0.0
    for _ in range(samples):
        total += imu.read_gyro_z_dps()
        sleep_ms(delay_ms)
    bias = total / samples
    print("gz bias = {:+.3f} deg/s".format(bias))
    return bias


# ── Heading integration loop ──────────────────────────────────────────────────
GZ_BIAS = calibrate_gyro_z_bias()
DEADBAND_DPS = 0.3  # ignore residual noise below this rate when still
TARGET_DEG = 90.0  # the turn angle we want to validate

heading = 0.0
last_ms = ticks_ms()
last_print_ms = last_ms

print("\n90 deg TURN VALIDATOR")
print(
    "Rotate the board against a straight edge until it reads ~{:.0f}.".format(
        TARGET_DEG
    )
)
print("Integrating every sample, printing ~4x/sec  (Ctrl-C to stop)\n")
print("{:<14}{:<14}{}".format("yaw (deg)", "rate (deg/s)", "target"))
print("-" * 40)

while True:
    gz = imu.read_gyro_z_dps() - GZ_BIAS  # bias-corrected yaw rate

    now_ms = ticks_ms()
    dt = ticks_diff(now_ms, last_ms) / 1000.0  # seconds since last sample
    last_ms = now_ms

    if abs(gz) > DEADBAND_DPS:
        heading += gz * dt

    # NOTE: do NOT wrap here -- for a turn you want the true accumulated angle
    # so 90 reads as 90 (not as a compass bearing). Keep integrating fast.

    # Integrate every loop; only PRINT every 250 ms so it is readable.
    if ticks_diff(now_ms, last_print_ms) >= 250:
        last_print_ms = now_ms
        remaining = TARGET_DEG - abs(heading)
        if abs(remaining) <= 2.0:
            flag = "<<< AT {:.0f} deg".format(TARGET_DEG)
        else:
            flag = "{:+.0f} to go".format(remaining)
        print("{:<14.1f}{:<14.1f}{}".format(heading, gz, flag))

    sleep_ms(5)  # ~200 Hz sampling for tighter integration during fast turns
