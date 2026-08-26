# Challenge 1: Wall Follow — P Control
# Follow the side wall using a Proportional controller.
# Fill in the values below (they start at 0). Guide: docs.html?doc=Challenge_1

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False  # Set True to print sensor + motor values
my_robot = AIDriver("left")  # "left" or "right" — match the simulator scene

BASE_SPEED = 0  # forward speed (keep BASE_SPEED - MAX_STEERING > 120)
TARGET_WALL_DISTANCE = 0  # distance to hold from the wall (mm)
MAX_STEERING = 0  # max wheel-speed difference

side_Kp = 0.0  # proportional gain


while True:
    wall_distance = my_robot.read_distance_2()

    if wall_distance == -1:
        # Sensor lost the wall — drive straight and try again next tick.
        my_robot.drive(BASE_SPEED, BASE_SPEED)
        hold_state(0.05)
        continue

    error = wall_distance - TARGET_WALL_DISTANCE
    steering = side_Kp * error

    # steer() applies the correction to the correct wheel for your chosen wall
    # and caps it so the slower wheel stays above the motor dead zone.
    my_robot.steer(BASE_SPEED, steering, MAX_STEERING)
    hold_state(0.05)
