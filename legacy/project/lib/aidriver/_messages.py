"""Event-log sentence builders for AIDriver drive/rotate commands.

Pure helpers with no hardware or module-state dependencies, split out so
driver.py isn't cluttered with string-formatting logic.
"""


def _speed_band(speed_value):
    """Return a human label for a motor speed using agreed classroom bands."""
    if speed_value <= 80:
        return "stopped"
    if speed_value <= 120:
        return "very slow"
    if speed_value <= 180:
        return "slow"
    if speed_value <= 220:
        return "normal"
    return "very fast"


def _describe_drive(direction, right_speed, left_speed):
    """Build an event-log sentence for forward/backward movement commands."""
    max_speed = max(right_speed, left_speed)
    if max_speed <= 80:
        return (
            f"{direction} requested with R={right_speed}, L={left_speed} – "
            "speeds are in the stopped range so the robot may not move"
        )

    band = _speed_band(max_speed)
    message = f"{direction} at {band} speed" f" (R={right_speed}, L={left_speed})"

    speed_diff = right_speed - left_speed
    if abs(speed_diff) > 20:
        arc_direction = "right" if speed_diff > 0 else "left"
        message += f"; expect an arc toward the {arc_direction}"

    return message


def _describe_rotation(direction, turn_speed):
    """Build an event-log sentence for rotate commands."""
    if turn_speed <= 80:
        return (
            f"Rotate {direction} requested with speed {turn_speed} – "
            "speed is in the stopped range so the robot may not turn"
        )

    band = _speed_band(turn_speed)
    return f"Rotate {direction} on the spot at {band} speed ({turn_speed})"
