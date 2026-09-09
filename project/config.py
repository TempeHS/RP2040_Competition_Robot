"""Shared robot settings. Keep this file when replacing main.py."""

# Robot Setup
WALL_SIDE = "left"  # Wall followed: "left" or "right".
DISTANCE_SENSOR = "tof"  # "tof" or "ultrasonic", matching the fitted sensors.
DEBUG_AIDRIVER = False  # Enable detailed serial logging.
KIT_SERVO_PIN = None  # Optional rescue-kit GPIO; None when not fitted.

# Driving
BASE_SPEED = 200  # Forward PWM, 120-255.
LOOP_DT = 0.05  # Normal loop pause, seconds.

# Wall PID
TARGET_WALL_DISTANCE = 100  # Side clearance, mm.
MAX_STEERING = 60  # Maximum steering correction, PWM.
side_Kp = 0.4  # Proportional gain, PWM per mm of error.
side_Kd = 0.3  # Derivative gain, using error change per loop.
side_Ki = 0.001  # Integral gain, using accumulated error per loop.
side_INTEGRAL_MAX = 50  # Anti-windup limit, accumulated mm of error.

# Front Distance Control
FRONT_SLOW_DISTANCE = 300  # Begin approach slowdown, mm.
FRONT_STOP_DISTANCE = 150  # Trigger a turn, mm.
FRONT_Kp = 1.0  # Approach gain, PWM per mm remaining.
MIN_APPROACH_SPEED = 130  # Lowest approach PWM above motor stall speed.

# Turn Control
turn_Kp = 30.0  # Proportional heading gain, PWM per degree.
turn_Kd = 0.4  # Derivative gain, using error change per turn sample.
turn_tolerance = 2.0  # Accepted final heading error, degrees.
TURN_ANGLE = 90  # Corner angle, degrees; positive turns away from the wall.
TURN_MAX_SPEED = 240  # Maximum spin PWM.
MIN_TURN_SPEED = 190  # Minimum sustained spin PWM.
TURN_TIMEOUT_MS = 2500  # Maximum cruise phase, ms.

# Turn Mechanics (advanced): Sampling and Kick
TURN_DT = 0.02  # Turn sample pause, seconds.
TURN_KICK_SPEED = 255  # Initial burst PWM to overcome static friction.
TURN_KICK_STEPS = 4  # Samples in the initial burst.

# Turn Mechanics (advanced): Braking and Settle
TURN_COAST_TIME = 0.03  # Predicted rotation after braking, seconds.
TURN_SETTLE_STEPS = 15  # Samples used to measure coast after braking.
TURN_PAUSE_TIME = 0.3  # Stationary pause before and after a corner turn, seconds.
TURN_CLEAR_TIME = 0.4  # Forward clearance after a turn, seconds.

# Turn Mechanics (advanced): Correction Pulses
NUDGE_SPEED = 220  # Corrective pulse PWM.
NUDGE_MS_PER_DEG = 4  # Pulse duration per degree of error, ms.
NUDGE_MIN_MS = 25  # Shortest pulse, ms.
NUDGE_MAX_MS = 250  # Longest pulse, ms.
NUDGE_STEP = 0.005  # Sample pause inside a pulse, seconds.
NUDGE_SETTLE_STEPS = 10  # Coast samples after each correction pulse.
TURN_MAX_NUDGES = 6  # Maximum correction pulses per turn.

# Outside Corners
NIB_LOST_DISTANCE = TARGET_WALL_DISTANCE * 3  # Wall-loss threshold, mm.
NIB_CONFIRM_TIME = 0.3  # Continuous wall loss before wrapping, seconds.
NIB_FORWARD_BEFORE = 0.3  # Forward clearance before wrapping, seconds.
NIB_FORWARD_AFTER = 0.4  # Forward movement after wrapping, seconds.
NIB_PAUSE_TIME = 0.2  # Stationary pause before wrapping the corner, seconds.
NIB_REACQUIRE_MS = 1500  # Maximum wall-reacquisition search, ms.

# Colour Detection
color_min_clear = 180  # Minimum clear-channel counts for a bright marker.
color_red_ratio = 0.55  # Red fraction of R+G+B.
color_green_ratio = 0.55  # Green fraction of R+G+B.
color_silver_clear = 500  # Silver brightness threshold, clear-channel counts.
color_black_clear = 60  # Black threshold, clear-channel counts; zero disables it.
COLOR_PAUSE_TIME = 1.0  # Pause on red/green markers, seconds.

# Heading Hold
HEADING_Kp = 4.0  # Straight-line correction, PWM per degree of heading error.

# No-Go Recovery: Reverse
REVERSE_SPEED = 180  # Reverse PWM magnitude.
REVERSE_DT = 0.05  # Reverse sample pause, seconds.
REVERSE_CLEAR_STEPS = 6  # Consecutive non-black samples before stopping reverse.
REVERSE_MAX_STEPS = 80  # Maximum reverse samples.

# No-Go Recovery: Turn and Wall Search
OPEN_SPACE_DISTANCE = 400  # Side distance considered open, mm.
FORWARD_SPEED = 200  # Forward wall-search PWM.
FORWARD_DT = 0.05  # Forward sample pause, seconds.
WALL_FOUND_DISTANCE = 300  # Front wall-search stopping distance, mm.
FORWARD_MAX_STEPS = 200  # Maximum forward search samples.

# No-Go Recovery: Grid Compensation
GRID_CELL_MM = 290  # Maze grid pitch, mm.
GRID_WALL_OFFSET_MM = 6  # Expected panel/clearance offset, mm.
GRID_ERROR_CLAMP_MM = 25  # Maximum grid-based correction, mm.

# Competition
VICTIM_PAUSE_TIME = 2.0  # Pause on each victim, seconds (at least one).
POINTS_UNHARMED = 10  # Estimated points per green victim.
POINTS_HARMED = 25  # Estimated points per red victim.
POINTS_KIT = 10  # Estimated bonus per requested rescue-kit deployment.
