"""PID steering direction verification test.

Upload this file to the Pico and run it via Arduino MicroPython Lab or REPL.
It uses robot.drive(right_speed, left_speed) — exactly as the PID controller
does — and tells you which way the robot SHOULD turn. Watch the robot and
confirm it matches.

Expected results:
  Step 1 — right wheel faster → robot nose turns LEFT
  Step 2 — left wheel faster  → robot nose turns RIGHT

If the robot goes the OPPOSITE way, the correction sign in your PID loop
needs to be flipped (negate the correction value).
"""

from aidriver import AIDriver, hold_state

BASE_SPEED = 160  # Forward speed for both wheels
CORRECTION = 60  # Speed difference to force a visible turn

print("Initialising...")
my_robot = AIDriver("left")  # ← Change to "right" if wall is on your right
print("wall_sign =", my_robot.wall_sign, "  (+1 = right wall, -1 = left wall)")
print("Ready. Tests start in 3 seconds — place robot on the floor with space to move.")
hold_state(3)

# ── Step 1: right wheel faster → expect nose turns LEFT ──────────
print()
print("Step 1: Steering LEFT  (right wheel faster)")
print("  >> Robot nose should turn to the LEFT")
print(
    "  drive(right={}, left={})".format(
        BASE_SPEED + CORRECTION, BASE_SPEED - CORRECTION
    )
)
my_robot.drive(BASE_SPEED + CORRECTION, BASE_SPEED - CORRECTION)
hold_state(2)
my_robot.brake()
hold_state(2)

# ── Step 2: left wheel faster → expect nose turns RIGHT ──────────
print()
print("Step 2: Steering RIGHT (left wheel faster)")
print("  >> Robot nose should turn to the RIGHT")
print(
    "  drive(right={}, left={})".format(
        BASE_SPEED - CORRECTION, BASE_SPEED + CORRECTION
    )
)
my_robot.drive(BASE_SPEED - CORRECTION, BASE_SPEED + CORRECTION)
hold_state(2)
my_robot.brake()

print()
print("Done.")
print("If either step went the WRONG way, negate the correction in your PID loop:")
print("  WRONG: my_robot.drive(BASE_SPEED + correction, BASE_SPEED - correction)")
print("  FIX:   my_robot.drive(BASE_SPEED - correction, BASE_SPEED + correction)")
