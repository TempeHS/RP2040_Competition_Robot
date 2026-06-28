# Challenge 8: Ground Colour Detection — pause on markers
# Drive straight up the corridor and use the TCS34725 ground colour sensor
# to find the coloured floor markers. Pause on every RED and GREEN marker,
# then reach the SILVER finish. Guide: docs.html?doc=Challenge_8

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")

# --- Tunables ---
BASE_SPEED = 0  # cruise speed up the corridor
COLOR_PAUSE_TIME = 0  # seconds to pause when a red/green marker is found

# Colour thresholds — set on the robot so classify_color() can use them.
my_robot.color_min_clear = 0  # ignore readings dimmer than this (plain floor)
my_robot.color_red_ratio = 0.0  # red fraction r/(r+g+b) needed to call it RED
my_robot.color_green_ratio = 0.0  # green fraction g/(r+g+b) needed to call it GREEN
my_robot.color_silver_clear = 0  # clear value above which a balanced colour is SILVER

started = False  # have we driven off the silver START marker yet?
previous_color = "none"  # marker seen last loop (used to detect a NEW marker)


while True:
    my_robot.drive(BASE_SPEED, BASE_SPEED)

    # The colour interrupt fires whenever the sensor is over a marker.
    if my_robot.color_detected():
        color = my_robot.classify_color()
    else:
        color = "none"

    # Only react the moment we first roll onto a new marker.
    new_marker = color != "none" and color != previous_color

    if new_marker and (color == "red" or color == "green"):
        my_robot.brake()
        hold_state(COLOR_PAUSE_TIME)
    elif new_marker and color == "silver":
        if started:
            my_robot.brake()
            break  # reached the silver FINISH marker

    if color == "none" and previous_color == "silver":
        started = True  # we have driven off the silver START marker

    previous_color = color  # save for next loop (must be last)
    hold_state(0.05)
