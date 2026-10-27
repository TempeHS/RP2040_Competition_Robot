"""Challenge 8. Teacher reference. Keep config.py when replacing this main program."""

from aidriver import AIDriver, hold_state
from config_check import validate_config
import aidriver
import config


started = False
previous_color = "none"





def main():
    global my_robot, started, previous_color
    validate_config(config, AIDriver.MIN_MOTOR_SPEED)
    aidriver.DEBUG_AIDRIVER = config.DEBUG_AIDRIVER
    my_robot = AIDriver(
        config.WALL_SIDE,
        distance_sensor=config.DISTANCE_SENSOR,
        min_approach_speed=config.MIN_APPROACH_SPEED,
        kit_servo_pin=config.KIT_SERVO_PIN,
    )
    started = False
    previous_color = "none"
    try:
        my_robot.color_min_clear = config.color_min_clear
        my_robot.color_red_ratio = config.color_red_ratio
        my_robot.color_green_ratio = config.color_green_ratio
        my_robot.color_silver_clear = config.color_silver_clear
        my_robot.color_black_clear = config.color_black_clear
        while True:
            my_robot.drive(config.BASE_SPEED, config.BASE_SPEED)

            # The colour interrupt fires whenever the sensor is over a marker.
            if my_robot.color_detected():
                color = my_robot.classify_color()
            else:
                color = "none"

            # Only react the moment we first roll onto a new marker.
            new_marker = color != "none" and color != previous_color

            if new_marker and (color == "red" or color == "green"):
                my_robot.brake()
                hold_state(config.COLOR_PAUSE_TIME)
            elif new_marker and color == "silver":
                if started:
                    my_robot.brake()
                    break  # reached the silver FINISH marker

            if color == "none" and previous_color == "silver":
                started = True  # we have driven off the silver START marker

            previous_color = color  # save for next loop (must be last)
            hold_state(config.LOOP_DT)
    finally:
        my_robot.brake()


if __name__ == "__main__":
    main()
