"""Challenge 10. Keep config.py when replacing this main program."""

from aidriver import AIDriver, hold_state
from config_check import validate_config
import aidriver
import config


unharmed = 0
harmed = 0
started = False
previous_color = "none"


def score():
    """Return the running score estimate to show on the OLED."""
    return (
        (unharmed * config.POINTS_UNHARMED) + (harmed * config.POINTS_HARMED) + (harmed * config.POINTS_KIT)
    )


def main():
    global my_robot, unharmed, harmed, started, previous_color
    validate_config(config, AIDriver.MIN_MOTOR_SPEED)
    aidriver.DEBUG_AIDRIVER = config.DEBUG_AIDRIVER
    my_robot = AIDriver(
        config.WALL_SIDE,
        distance_sensor=config.DISTANCE_SENSOR,
        min_approach_speed=config.MIN_APPROACH_SPEED,
        kit_servo_pin=config.KIT_SERVO_PIN,
    )
    unharmed = 0
    harmed = 0
    started = False
    previous_color = "none"
    try:
        my_robot.color_min_clear = config.color_min_clear
        my_robot.color_red_ratio = config.color_red_ratio
        my_robot.color_green_ratio = config.color_green_ratio
        my_robot.color_silver_clear = config.color_silver_clear
        my_robot.color_black_clear = config.color_black_clear
        my_robot.display_status("START", 0, 0)

        while True:
            my_robot.drive(config.BASE_SPEED, config.BASE_SPEED)

            # The colour interrupt fires whenever the sensor is over a marker.
            if my_robot.color_detected():
                color = my_robot.classify_color()
            else:
                color = "none"

            # Only react the moment we first roll onto a NEW marker.
            new_marker = color != "none" and color != previous_color

            # TODO: when you see a GREEN victim:
            #   - add 1 to unharmed
            #   - brake
            #   - my_robot.display_status("GREEN VIC", score(), unharmed + harmed)
            #   - hold_state(VICTIM_PAUSE_TIME)

            # TODO: when you see a RED victim:
            #   - add 1 to harmed
            #   - brake
            #   - my_robot.deploy_rescue_kit()
            #   - my_robot.display_status("HARMED VIC", score(), unharmed + harmed)
            #   - hold_state(VICTIM_PAUSE_TIME)

            # TODO: when you see SILVER and started is True, you are at the FINISH:
            #   - brake
            #   - my_robot.show_display("RUN COMPLETE", ...counts..., "Score:" + str(score()))
            #   - break

            # Mark that we have driven off the silver START marker.
            if color == "none" and previous_color == "silver":
                started = True

            previous_color = color  # save for next loop (must be last)
            hold_state(config.LOOP_DT)
    finally:
        my_robot.brake()


if __name__ == "__main__":
    main()
