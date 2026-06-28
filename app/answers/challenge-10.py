# === ANSWER KEY — Challenge 10 (teacher reference; students should NOT see this) ===
# Same as app/starter-code/challenge-10.py with the victim/OLED logic filled in.

# Challenge 10: Competition Run — victims, score & the OLED display
# Drive up the corridor, identify each GREEN (unharmed) and RED (harmed)
# victim, report state/score/victims on the SSD1306 OLED, drop a rescue kit
# on every harmed victim, then show the final report at the silver finish.
# Guide: docs.html?doc=Challenge_10

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")

# --- Tunables ---
BASE_SPEED = 200  # cruise speed up the corridor
VICTIM_PAUSE_TIME = 2  # seconds to stop on a victim (rules: at least 1 s)

# Colour thresholds — carried over from Challenge 8.
my_robot.color_min_clear = 180
my_robot.color_red_ratio = 0.55
my_robot.color_green_ratio = 0.55
my_robot.color_silver_clear = 500

# --- Scoring (Intermediate division) ---
POINTS_UNHARMED = 10  # green victim
POINTS_HARMED = 25  # red victim
POINTS_KIT = 10  # bonus for a kit dropped on a harmed victim

unharmed = 0  # green victims found
harmed = 0  # red victims found
started = False  # have we driven off the silver START marker yet?
previous_color = "none"  # marker seen last loop (detect a NEW marker)


def score():
    """Return the running score estimate to show on the OLED."""
    return (
        (unharmed * POINTS_UNHARMED) + (harmed * POINTS_HARMED) + (harmed * POINTS_KIT)
    )


# Show a starting screen before the robot moves.
my_robot.display_status("START", 0, 0)


while True:
    my_robot.drive(BASE_SPEED, BASE_SPEED)

    # The colour interrupt fires whenever the sensor is over a marker.
    if my_robot.color_detected():
        color = my_robot.classify_color()
    else:
        color = "none"

    # Only react the moment we first roll onto a NEW marker.
    new_marker = color != "none" and color != previous_color

    if new_marker and color == "green":
        unharmed = unharmed + 1
        my_robot.brake()
        my_robot.display_status("GREEN VIC", score(), unharmed + harmed)
        hold_state(VICTIM_PAUSE_TIME)
    elif new_marker and color == "red":
        harmed = harmed + 1
        my_robot.brake()
        my_robot.deploy_rescue_kit()  # +10 bonus when the servo is fitted
        my_robot.display_status("HARMED VIC", score(), unharmed + harmed)
        hold_state(VICTIM_PAUSE_TIME)
    elif new_marker and color == "silver":
        if started:
            my_robot.brake()
            my_robot.show_display(
                "RUN COMPLETE",
                "Unharmed:" + str(unharmed),
                "Harmed:" + str(harmed),
                "Score:" + str(score()),
            )
            break  # reached the silver FINISH marker
    elif color == "none":
        # Cruising between markers — keep the live status on screen.
        my_robot.display_status("SEARCH", score(), unharmed + harmed)

    # Mark that we have driven off the silver START marker.
    if color == "none" and previous_color == "silver":
        started = True

    previous_color = color  # save for next loop (must be last)
    hold_state(0.05)
