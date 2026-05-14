"""Sensor noise diagnostic for PID wall following.

Run this BEFORE tuning your PID. It shows you:
  1. How noisy the raw sensor readings are
  2. What correction the PID would apply to each reading
  3. Whether smoothing (averaging) helps

If the Correction column jumps around a lot even when the robot is still,
that noise is what makes the robot erratic — not the PID gains.

Place the robot beside a wall at roughly your TARGET distance and run this.
"""

from aidriver import AIDriver, hold_state

# ── Match these to your PID code ─────────────────────────────────
TARGET_WALL_DISTANCE = 150  # mm
side_Kp = 0.55
MAX_STEERING = 40
SAMPLES = 20  # readings to collect

my_robot = AIDriver("left")  # ← "left" or "right" — must match your physical setup!
hold_state(1)

print()
print("=== Sensor noise diagnostic ===")
print("Keep robot STILL beside a wall. Collecting {} readings...".format(SAMPLES))
print()
print("{:>4}  {:>10}  {:>8}  {:>12}".format("No.", "Raw (mm)", "Error", "Correction"))
print("-" * 42)

readings = []
for i in range(SAMPLES):
    raw = my_robot.read_distance_2()

    if raw == -1:
        print("{:>4}  {:>10}  {:>8}  {:>12}".format(i + 1, "NO ECHO", "-", "-"))
        hold_state(0.05)
        continue

    readings.append(raw)
    error = raw - TARGET_WALL_DISTANCE
    correction = side_Kp * error
    correction = max(-MAX_STEERING, min(MAX_STEERING, correction))

    print("{:>4}  {:>10}  {:>8.0f}  {:>12.1f}".format(i + 1, raw, error, correction))
    hold_state(0.05)

# ── Summary ───────────────────────────────────────────────────────
if len(readings) >= 2:
    mn = min(readings)
    mx = max(readings)
    avg = sum(readings) / len(readings)
    spread = mx - mn

    print()
    print("=== Summary ===")
    print("  Min reading : {} mm".format(mn))
    print("  Max reading : {} mm".format(mx))
    print("  Spread      : {} mm  <-- key number".format(spread))
    print("  Average     : {:.0f} mm".format(avg))
    print()

    correction_swing = side_Kp * spread
    print(
        "  With Kp={}, that spread causes correction to swing ±{:.1f}".format(
            side_Kp, correction_swing
        )
    )

    print()
    if spread > 30:
        print(">> HIGH NOISE detected (spread > 30 mm).")
        print("   This is the cause of erratic movement.")
        print("   Fix: average 3 readings each loop before calculating error.")
        print()
        print("   Replace:  wall_distance = my_robot.read_distance_2()")
        print("   With:")
        print("     r1 = my_robot.read_distance_2()")
        print("     r2 = my_robot.read_distance_2()")
        print("     r3 = my_robot.read_distance_2()")
        print("     valid = [r for r in (r1,r2,r3) if r != -1]")
        print("     if not valid:")
        print("         my_robot.drive(BASE_SPEED, BASE_SPEED)")
        print("         continue")
        print("     wall_distance = sum(valid) // len(valid)")
    elif spread > 15:
        print(">> MODERATE NOISE (spread 15-30 mm).")
        print("   Try averaging 2 readings, and keep side_Kp <= 0.4.")
    else:
        print(">> LOW NOISE (spread <= 15 mm). Sensor is clean.")
        print("   Erratic movement is likely Kp too high — try reducing by 30%.")
