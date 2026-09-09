"""Configuration checks shared by MicroPython, host tests, and Skulpt."""


def _setting(config, name):
    if not hasattr(config, name):
        raise ValueError("config." + name + " is missing")
    return getattr(config, name)


def _number(config, name, minimum=0, maximum=None, integer=False):
    value = _setting(config, name)
    if type(value) not in (int, float) or value != value or abs(value) == float("inf"):
        raise ValueError("config." + name + " must be a finite number")
    if integer and type(value) is not int:
        raise ValueError("config." + name + " must be an integer")
    if value < minimum or (maximum is not None and value > maximum):
        raise ValueError("config." + name + " is outside its allowed range")
    return value


def validate_config(config, min_motor_speed=120):
    """Reject invalid settings before the main program constructs its robot."""
    if _setting(config, "WALL_SIDE") not in ("left", "right"):
        raise ValueError('config.WALL_SIDE must be "left" or "right"')
    if _setting(config, "DISTANCE_SENSOR") not in ("tof", "ultrasonic"):
        raise ValueError('config.DISTANCE_SENSOR must be "tof" or "ultrasonic"')
    if type(_setting(config, "DEBUG_AIDRIVER")) is not bool:
        raise ValueError("config.DEBUG_AIDRIVER must be True or False")
    if _setting(config, "KIT_SERVO_PIN") is not None:
        pin = _number(config, "KIT_SERVO_PIN", 0, 29, True)
        if pin in (3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 16, 17, 25, 26, 27, 28, 29, 2):
            raise ValueError(
                "config.KIT_SERVO_PIN conflicts with reserved robot wiring"
            )

    for name in (
        "BASE_SPEED",
        "MIN_APPROACH_SPEED",
        "TURN_MAX_SPEED",
        "MIN_TURN_SPEED",
        "TURN_KICK_SPEED",
        "NUDGE_SPEED",
        "REVERSE_SPEED",
        "FORWARD_SPEED",
    ):
        _number(config, name, min_motor_speed, 255, True)
    _number(config, "MAX_STEERING", 0, 255)
    for name in (
        "side_Kp",
        "side_Kd",
        "side_Ki",
        "side_INTEGRAL_MAX",
        "FRONT_Kp",
        "turn_Kp",
        "turn_Kd",
        "HEADING_Kp",
        "STARTUP_PAUSE_TIME",
        "TURN_COAST_TIME",
        "TURN_CLEAR_TIME",
        "TURN_PAUSE_TIME",
        "NIB_PAUSE_TIME",
        "GRID_WALL_OFFSET_MM",
        "GRID_ERROR_CLAMP_MM",
        "color_min_clear",
        "color_silver_clear",
        "color_black_clear",
    ):
        _number(config, name)
    for name in (
        "LOOP_DT",
        "TURN_DT",
        "NUDGE_STEP",
        "NIB_CONFIRM_TIME",
        "NIB_FORWARD_BEFORE",
        "NIB_FORWARD_AFTER",
        "COLOR_PAUSE_TIME",
        "REVERSE_DT",
        "FORWARD_DT",
        "NUDGE_MS_PER_DEG",
        "turn_tolerance",
        "TARGET_WALL_DISTANCE",
        "FRONT_SLOW_DISTANCE",
        "FRONT_STOP_DISTANCE",
        "NIB_LOST_DISTANCE",
        "OPEN_SPACE_DISTANCE",
        "WALL_FOUND_DISTANCE",
        "GRID_CELL_MM",
    ):
        _number(config, name, 0.000001)
    for name in (
        "TURN_TIMEOUT_MS",
        "TURN_KICK_STEPS",
        "TURN_SETTLE_STEPS",
        "NUDGE_SETTLE_STEPS",
        "NUDGE_MIN_MS",
        "NUDGE_MAX_MS",
        "TURN_MAX_NUDGES",
        "NIB_REACQUIRE_MS",
        "REVERSE_CLEAR_STEPS",
        "REVERSE_MAX_STEPS",
        "FORWARD_MAX_STEPS",
    ):
        _number(config, name, 1, integer=True)
    for name in ("POINTS_UNHARMED", "POINTS_HARMED", "POINTS_KIT"):
        _number(config, name, 0, integer=True)
    for name in ("color_red_ratio", "color_green_ratio"):
        _number(config, name, 0, 1)
    _number(config, "TURN_ANGLE", 0.000001, 360)
    _number(config, "VICTIM_PAUSE_TIME", 1)

    for smaller, larger in (
        ("FRONT_STOP_DISTANCE", "FRONT_SLOW_DISTANCE"),
        ("TARGET_WALL_DISTANCE", "NIB_LOST_DISTANCE"),
    ):
        if getattr(config, smaller) >= getattr(config, larger):
            raise ValueError(
                "config." + smaller + " must be less than config." + larger
            )
    for smaller, larger in (
        ("MIN_APPROACH_SPEED", "BASE_SPEED"),
        ("MIN_TURN_SPEED", "TURN_MAX_SPEED"),
        ("NUDGE_MIN_MS", "NUDGE_MAX_MS"),
        ("REVERSE_CLEAR_STEPS", "REVERSE_MAX_STEPS"),
    ):
        if getattr(config, smaller) > getattr(config, larger):
            raise ValueError("config." + smaller + " must not exceed config." + larger)
    return True
