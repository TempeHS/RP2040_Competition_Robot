"""Teacher reference: Challenge 1. Use the shared Driving and Wall PID settings."""

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
    try:
        while True:
            wall_distance = my_robot.read_distance_2()
            if wall_distance == -1:
                my_robot.drive(config.BASE_SPEED, config.BASE_SPEED)
            else:
                error = wall_distance - config.TARGET_WALL_DISTANCE
                steering = config.side_Kp * error
                my_robot.steer(config.BASE_SPEED, steering, config.MAX_STEERING)
            hold_state(config.LOOP_DT)
    finally:
        my_robot.brake()


if __name__ == "__main__":
    main()
