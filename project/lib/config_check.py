"""Configuration checks shared by MicroPython, host tests, and Skulpt."""


def _setting(config, name):
    if not hasattr(config, name):
        raise ValueError("config." + name + " is missing")
    return getattr(config, name)


def _number(config, name, integer=False):
    value = _setting(config, name)
    if type(value) not in (int, float):
        raise ValueError("config." + name + " must be a number")
    if integer and type(value) is not int:
        raise ValueError("config." + name + " must be an integer")
    return value


def validate_config(config, min_motor_speed=120):
    """Check names and types only; min_motor_speed is retained for existing callers."""
    del min_motor_speed
    for name in ("WALL_SIDE", "DISTANCE_SENSOR"):
        if type(_setting(config, name)) is not str:
            raise ValueError("config." + name + " must be a string")
    if type(_setting(config, "DEBUG_AIDRIVER")) is not bool:
        raise ValueError("config.DEBUG_AIDRIVER must be True or False")
    if _setting(config, "KIT_SERVO_PIN") is not None:
        _number(config, "KIT_SERVO_PIN", integer=True)

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
        _number(config, name, integer=True)
    _number(config, "MAX_STEERING")
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
        _number(config, name)
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
        _number(config, name, integer=True)
    for name in ("POINTS_UNHARMED", "POINTS_HARMED", "POINTS_KIT"):
        _number(config, name, integer=True)
    for name in ("color_red_ratio", "color_green_ratio"):
        _number(config, name)
    _number(config, "TURN_ANGLE")
    _number(config, "VICTIM_PAUSE_TIME")
    return True
