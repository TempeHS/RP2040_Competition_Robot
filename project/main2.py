"""
main2.py  —  Hardware test: 2× Grove Ultrasonic Rangers + LSM6DS3 gyro.

Pin assignment:
    Front ranger  SIG → GP6   (GP7 unused — leave unconnected)
    Side  ranger  SIG → GP4   (GP5 unused — leave unconnected)
    LSM6DS3 IMU   SDA → GP16, SCL → GP17  (confirmed by I²C scan)

Grove wiring for each ranger:
    Yellow (SIG) → GP6 or GP4
    Red    (VCC) → 3.3 V
    Black  (GND) → GND

⚠ PIN NOTE
    The IMU is wired to GP16 (SDA) / GP17 (SCL); the scan only ever finds
    0x6A there. The remaining pin pairs are still probed as a sanity check.

Runs a continuous read loop, printing all three sensors each cycle.
Press Ctrl-C to stop.
"""

from grove_ultrasonic import GroveUltrasonic
from lsm6ds3 import LSM6DS3, LSM6DS3Error
from machine import I2C, Pin, SoftI2C
from time import sleep_ms, sleep_us


def recover_i2c_bus(sda_pin, scl_pin, clocks=9):
    """Release an I²C slave that is holding SDA low (stuck bus recovery).

    If the MCU was reset while a slave was clocking out a byte, the slave
    keeps SDA pulled low waiting for the remaining clock pulses. A soft
    reboot of the RP2040 does not reset the sensor, so the bus stays stuck.
    This bit-bangs up to `clocks` SCL pulses with SDA released; once the
    slave finishes its byte it lets SDA go. A STOP condition is then issued
    to return the bus to idle.

    Returns the final SDA level (1 = recovered/idle-high, 0 = still stuck).
    """
    sda = Pin(sda_pin, Pin.OPEN_DRAIN, Pin.PULL_UP)
    scl = Pin(scl_pin, Pin.OPEN_DRAIN, Pin.PULL_UP)
    sda.value(1)
    scl.value(1)
    sleep_us(5)

    # Clock SCL until the slave releases SDA (or we run out of pulses).
    for _ in range(clocks):
        if sda.value():
            break
        scl.value(0)
        sleep_us(5)
        scl.value(1)
        sleep_us(5)

    # Issue a STOP: SDA low→high while SCL is high.
    scl.value(1)
    sleep_us(5)
    sda.value(0)
    sleep_us(5)
    sda.value(1)
    sleep_us(5)
    return sda.value()


# ── LSM6DS3 gyro/accelerometer ────────────────────────────────────────────────
# Probe candidate I²C mappings. UNO dedicated SDA/SCL is first priority.
imu_ok = False
imu = None
imu_error = None
imu_startup_summary = ""
imu_bus = None
imu_sda = None
imu_scl = None
imu_freq = None

I2C_CANDIDATES = [
    # Confirmed: the IMU's SDA/SCL are GP16/GP17 on this board.
    (0, 16, 17, "I2C0 GP16/GP17 (confirmed)"),
    # Remaining pairs are probed only as a sanity check.
    # GP4/GP5 is intentionally excluded — GP4 is the side ranger SIG.
    (0, 20, 21, "I2C0 GP20/GP21"),
    (0, 12, 13, "I2C0 GP12/GP13"),
    (0, 8, 9, "I2C0 GP8/GP9"),
    (0, 0, 1, "I2C0 GP0/GP1"),
]

# 100k is more tolerant of marginal wiring/level shifting than 400k.
I2C_FREQS = (100_000, 400_000)

# ── Cold-boot bus state on the confirmed IMU pins (GP16/GP17) ──────────────────
# CRITICAL: read the idle line levels BEFORE any I2C object is created and
# BEFORE any transfer is attempted. On RP2040 a hardware-I2C transfer that
# aborts with EIO can itself leave SDA parked low, so measuring after a failed
# transfer is misleading. This tells us the TRUE cold state:
#   SDA=1 cold  → device/bus is fine at rest; our aborted transfers hang it
#                 (fix = recover between attempts).
#   SDA=0 cold  → the IMU itself holds SDA low at rest with no comms at all,
#                 which a healthy I2C slave never does → faulty module or the
#                 device is latched in SPI mode driving SDO. No register-level
#                 driver technique can talk to it; the part must be swapped or
#                 power-cycled into I2C mode.
_cold_sda = Pin(16, Pin.IN, Pin.PULL_UP).value()
_cold_scl = Pin(17, Pin.IN, Pin.PULL_UP).value()
print(
    "Cold idle GP16/GP17 (no I2C created yet): SDA={} SCL={}".format(
        _cold_sda, _cold_scl
    )
)
# Now attempt recovery and re-measure to see if clocking frees the line.
_post = recover_i2c_bus(16, 17, clocks=16)
print("After 16-clock recovery on GP16/GP17: SDA={}".format(_post))

# ── LSM6DS3 IMU init on GP16/GP17 via SoftI2C ─────────────────────────────────
# ROOT CAUSE (confirmed by the cold-bus SoftI2C test): the RP2040 *hardware* I2C
# peripheral ACKs this sensor's address but aborts every data phase with EIO and
# parks SDA low. Bit-banged SoftI2C reads WHO_AM_I = 0x6A reliably, so the IMU is
# driven over SoftI2C. Recover the bus first in case a prior aborted transfer
# left SDA low, and never let the hardware I2C peripheral touch these pins.
IMU_SDA, IMU_SCL, IMU_ADDR, IMU_FREQ = 16, 17, 0x6A, 50_000
recover_i2c_bus(IMU_SDA, IMU_SCL, clocks=16)
try:
    imu = LSM6DS3(
        sda=IMU_SDA,
        scl=IMU_SCL,
        freq=IMU_FREQ,
        address=IMU_ADDR,
        use_soft=True,
    )
    imu.begin()
    imu_ok = True
    imu_bus, imu_sda, imu_scl, imu_freq = 0, IMU_SDA, IMU_SCL, IMU_FREQ
    print(
        "LSM6DS3 found at 0x{:02X} on GP{}/GP{} via SoftI2C @ {}Hz "
        "(device id: 0x{:02X})".format(
            IMU_ADDR, IMU_SDA, IMU_SCL, IMU_FREQ, imu._device_id
        )
    )
except Exception as exc:
    imu_error = exc
    print("SoftI2C IMU init failed:", exc, "— falling back to hardware-I2C scan.")

# Fallback diagnostics: only runs if the SoftI2C init above did not succeed.
for bus_id, sda_pin, scl_pin, label in (I2C_CANDIDATES if not imu_ok else []):
    for freq in I2C_FREQS:
        try:
            # Free the bus first in case a slave is holding SDA low after a
            # mid-transaction reset. Without this, scan() reports a phantom
            # device (SDA stuck low reads as a permanent ACK) and every data
            # phase fails with EIO.
            recovered = recover_i2c_bus(sda_pin, scl_pin)
            if recovered == 0:
                print(
                    "I2C bus recovery on GP{}/GP{}: SDA still LOW after 9 clocks "
                    "(line shorted or slave dead)".format(sda_pin, scl_pin)
                )
            scan_i2c = I2C(bus_id, sda=Pin(sda_pin), scl=Pin(scl_pin), freq=freq)
            found = scan_i2c.scan()
            if found:
                print(
                    "I2C scan ({} bus{} GP{}/GP{} @ {}Hz):".format(
                        label, bus_id, sda_pin, scl_pin, freq
                    ),
                    ["0x{:02X}".format(a) for a in found],
                )
            else:
                print(
                    "I2C scan ({} bus{} GP{}/GP{} @ {}Hz): no devices found".format(
                        label, bus_id, sda_pin, scl_pin, freq
                    )
                )

            if 0x6A in found:
                # Deeper transport diagnostics: separate address ACK,
                # register-pointer write, and raw read operations.
                try:
                    scan_i2c.writeto(0x6A, b"")
                    print(
                        "Addr ACK test passed at 0x6A on bus{} GP{}/GP{} @ {}Hz".format(
                            bus_id, sda_pin, scl_pin, freq
                        )
                    )
                except Exception as exc:
                    print(
                        "Addr ACK test failed at 0x6A on bus{} GP{}/GP{} @ {}Hz: {}".format(
                            bus_id, sda_pin, scl_pin, freq, exc
                        )
                    )

                try:
                    scan_i2c.writeto(0x6A, b"\x0f", False)
                    print(
                        "Register-pointer write (0x0F) passed at 0x6A on bus{} GP{}/GP{} @ {}Hz".format(
                            bus_id, sda_pin, scl_pin, freq
                        )
                    )
                except Exception as exc:
                    print(
                        "Register-pointer write (0x0F) failed at 0x6A on bus{} GP{}/GP{} @ {}Hz: {}".format(
                            bus_id, sda_pin, scl_pin, freq, exc
                        )
                    )

                try:
                    raw1 = scan_i2c.readfrom(0x6A, 1)[0]
                    print(
                        "Raw readfrom(1) succeeded at 0x6A on bus{} GP{}/GP{} @ {}Hz: 0x{:02X}".format(
                            bus_id, sda_pin, scl_pin, freq, raw1
                        )
                    )
                except Exception as exc:
                    print(
                        "Raw readfrom(1) failed at 0x6A on bus{} GP{}/GP{} @ {}Hz: {}".format(
                            bus_id, sda_pin, scl_pin, freq, exc
                        )
                    )

                try:
                    who_raw = scan_i2c.readfrom_mem(0x6A, 0x0F, 1)[0]
                    print(
                        "Raw WHO_AM_I read at 0x6A on bus{} GP{}/GP{} @ {}Hz: 0x{:02X}".format(
                            bus_id, sda_pin, scl_pin, freq, who_raw
                        )
                    )
                except Exception as exc:
                    print(
                        "Raw WHO_AM_I read failed at 0x6A on bus{} GP{}/GP{} @ {}Hz: {}".format(
                            bus_id, sda_pin, scl_pin, freq, exc
                        )
                    )

                # ── Bus line-state + SoftI2C (bit-banged) diagnostic ──────────
                # Symptom so far: hardware I2C ACKs the address but EIOs every
                # data byte, while SoftI2C gets ENODEV. That is the classic
                # fingerprint of missing/weak I2C pull-ups: the RP2040's weak
                # internal pulls (~50k, enabled by machine.I2C) just manage an
                # address ACK but cannot sustain a data byte, and SoftI2C (no
                # internal pulls) sees nothing.
                #
                # 1) Read the idle line levels with internal pull-ups ON. With
                #    proper external pull-ups both read 1. If either reads 0 the
                #    line is shorted/held low; if they only read 1 thanks to the
                #    internal pull the external pull-ups are missing.
                try:
                    sda_probe = Pin(sda_pin, Pin.IN, Pin.PULL_UP)
                    scl_probe = Pin(scl_pin, Pin.IN, Pin.PULL_UP)
                    print(
                        "Idle line state on GP{}/GP{} (internal pull-up ON): "
                        "SDA={} SCL={}".format(
                            sda_pin, scl_pin, sda_probe.value(), scl_probe.value()
                        )
                    )
                except Exception as exc:
                    print("Line-state probe failed: {}".format(exc))

                # 2) Retry SoftI2C very slowly with internal pull-ups forced on.
                #    If this now reads WHO_AM_I, the bus was simply under-pulled.
                soft_ok = False
                try:
                    soft_i2c = SoftI2C(
                        sda=Pin(sda_pin, Pin.OPEN_DRAIN, Pin.PULL_UP),
                        scl=Pin(scl_pin, Pin.OPEN_DRAIN, Pin.PULL_UP),
                        freq=50_000,
                    )
                    who_soft = soft_i2c.readfrom_mem(0x6A, 0x0F, 1)[0]
                    soft_ok = True
                    print(
                        "SoftI2C (50kHz, pull-up) WHO_AM_I at 0x6A on GP{}/GP{}: "
                        "0x{:02X}".format(sda_pin, scl_pin, who_soft)
                    )
                except Exception as exc:
                    print(
                        "SoftI2C (50kHz, pull-up) WHO_AM_I failed at 0x6A on "
                        "GP{}/GP{}: {}".format(sda_pin, scl_pin, exc)
                    )

                try:
                    # Prefer SoftI2C when it could read WHO_AM_I, else hardware.
                    imu = LSM6DS3(
                        sda=sda_pin,
                        scl=scl_pin,
                        freq=freq,
                        address=0x6A,
                        use_soft=soft_ok,
                    )
                    imu.begin()
                    imu_ok = True
                    imu_bus = bus_id
                    imu_sda = sda_pin
                    imu_scl = scl_pin
                    imu_freq = freq
                    print(
                        "LSM6DS3 found at 0x6A on bus{} GP{}/GP{} @ {}Hz ({}) (device id: 0x{:02X})".format(
                            imu_bus,
                            imu_sda,
                            imu_scl,
                            imu_freq,
                            "SoftI2C" if soft_ok else "hardware I2C",
                            imu._device_id,
                        )
                    )
                    break
                except Exception as exc:
                    imu_error = exc
        except Exception as exc:
            imu_error = exc

    if imu_ok:
        break

try:
    if not imu_ok:
        raise LSM6DS3Error("No LSM6DS3 detected at 0x6A")
except LSM6DS3Error as exc:
    imu_startup_summary = "IMU init failed: {}".format(exc)
    print("LSM6DS3 ERROR:", exc)
    if imu_error is not None:
        print("Last init exception:", imu_error)
        imu_startup_summary += " | Last exception: {}".format(imu_error)
    print("  → Check VCC/GND, SA0/SDO HIGH, and dedicated SDA/SCL wiring.")
    print("  → IMU bus is GP16/GP17; add 4.7k pull-ups to 3.3V if data reads EIO.")
else:
    imu_startup_summary = "IMU init OK at 0x6A on bus{} GP{}/GP{} @ {}Hz".format(
        imu_bus, imu_sda, imu_scl, imu_freq
    )

# ── Grove Ultrasonic Rangers (single SIG pin each) ────────────────────────────
# Create AFTER IMU probing so their pin modes cannot interfere with I2C scans.
front_ranger = GroveUltrasonic(
    sig_pin=6
)  # front — aligns with AIDriver trig_pin default
side_ranger = GroveUltrasonic(
    sig_pin=4
)  # side  — aligns with AIDriver trig_pin_2 default (D4 / GP4)

print()
print("Reading sensors every 100 ms  (Ctrl-C to stop)")
print("Startup:", imu_startup_summary)
print(
    "{:<22} {:<22} {:<40}".format(
        "Front ranger (mm)", "Side ranger (mm)", "Gyro (gz deg/s)   Accel (ax ay az g)"
    )
)
print("-" * 90)

# ── Main read loop ────────────────────────────────────────────────────────────
while True:
    front_mm = front_ranger.read_distance_mm()
    side_mm = side_ranger.read_distance_mm()

    front_str = "{:>6} mm".format(front_mm) if front_mm != -1 else "  no echo"
    side_str = "{:>6} mm".format(side_mm) if side_mm != -1 else "  no echo"

    if imu_ok:
        try:
            gz = imu.read_gyro_z_dps()
            ax, ay, az = imu.read_accel_g()
            imu_str = "gz={:+7.1f}  ax={:+5.2f} ay={:+5.2f} az={:+5.2f}".format(
                gz, ax, ay, az
            )
        except Exception as exc:
            imu_str = "read error: {}".format(exc)
    else:
        if imu_error is not None:
            imu_str = "IMU init failed: {}".format(imu_error)
        else:
            imu_str = "IMU init failed: no error captured"

    print("{:<22} {:<22} {}".format(front_str, side_str, imu_str))
    sleep_ms(100)
