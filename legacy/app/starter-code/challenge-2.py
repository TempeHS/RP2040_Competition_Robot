"""Challenge 2: Wall PD control. Keep P tuning; tune config.side_Kd."""

from aidriver import AIDriver, hold_state
from config_check import validate_config
import aidriver
import config


def main():
    validate_config(config, AIDriver.MIN_MOTOR_SPEED)
    aidriver.DEBUG_AIDRIVER = config.DEBUG_AIDRIVER
    my_robot = AIDriver(
        config.WALL_SIDE,
        distance_sensor=config.DISTANCE_SENSOR,
        min_approach_speed=config.MIN_APPROACH_SPEED,
        kit_servo_pin=config.KIT_SERVO_PIN,
    )
    side_previous_error = 0
    try:
        while True:
            wall_distance = my_robot.read_distance_2()
            if wall_distance == -1:
                my_robot.drive(config.BASE_SPEED, config.BASE_SPEED)
            else:
                error = wall_distance - config.TARGET_WALL_DISTANCE
                side_derivative = error - side_previous_error
                steering = (config.side_Kp * error) + (config.side_Kd * side_derivative)
                my_robot.steer(config.BASE_SPEED, steering, config.MAX_STEERING)
                side_previous_error = error
            hold_state(config.LOOP_DT)
    finally:
        my_robot.brake()


if __name__ == "__main__":
    main()
