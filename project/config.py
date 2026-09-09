"""Shared robot settings. Tune the zero values; keep this file with each main.py."""

# Robot Setup
WALL_SIDE = "left"  # Wall followed: "left" or "right".
DISTANCE_SENSOR = "tof"  # "tof" or "ultrasonic", matching the fitted sensors.
DEBUG_AIDRIVER = False  # Enable detailed serial logging.
KIT_SERVO_PIN = None  # Optional rescue-kit GPIO; None when not fitted.

# Driving
BASE_SPEED = 0  # Forward PWM, 120-255; suggested start 180-220.
LOOP_DT = 0.0  # Normal loop pause, seconds; suggested start 0.02-0.05.
STARTUP_PAUSE_TIME = 0.0  # Hardware main's startup display pause, seconds; try 1-2.

# Wall PID
TARGET_WALL_DISTANCE = 0  # Side clearance, mm; suggested start 80-120.
MAX_STEERING = 0  # Maximum correction, PWM; suggested start 40-80.
side_Kp = 0.0  # PWM per mm of error; suggested start 0.2-0.8.
side_Kd = 0.0  # Gain on error change per loop; suggested start 0.1-0.5 in C2.
side_Ki = 0.0  # Gain on accumulated error; suggested start 0.0005-0.005 in C3.
side_INTEGRAL_MAX = 0  # Accumulated mm of error; suggested start 50-200.

# Front Distance Control
FRONT_SLOW_DISTANCE = 0  # Slowdown distance, mm; suggested start 250-350.
FRONT_STOP_DISTANCE = 0  # Turn distance, mm; suggested start 120-180, below SLOW.
FRONT_Kp = 0.0  # PWM per mm remaining; suggested start 0.5-1.5.
MIN_APPROACH_SPEED = 0  # Minimum approach PWM; suggested start 120-150, <= BASE_SPEED.

# Turn Control
turn_Kp = 0.0  # PWM per degree; suggested start 20-35.
turn_Kd = 0.0  # Gain on error change per turn sample; suggested start 0.2-0.6.
turn_tolerance = 0.0  # Accepted heading error, degrees; suggested start 1-3.
TURN_ANGLE = 0  # Corner degrees; use 90 for square corners, positive away from wall.
TURN_MAX_SPEED = 0  # Maximum spin PWM; suggested start 220-255.
MIN_TURN_SPEED = 0  # Sustained spin PWM; suggested start 170-200, <= TURN_MAX_SPEED.
TURN_TIMEOUT_MS = 0  # Maximum cruise phase, ms; suggested start 2000-3000.

# Turn Mechanics (advanced): Sampling and Kick
TURN_DT = 0.0  # Turn sample pause, seconds; suggested start 0.01-0.02.
TURN_KICK_SPEED = 0  # Initial burst PWM; suggested start 230-255.
TURN_KICK_STEPS = 0  # Samples in the initial burst; suggested start 3-5.

# Turn Mechanics (advanced): Braking and Settle
TURN_COAST_TIME = 0.0  # Predicted coast, seconds; suggested start 0.02-0.05.
TURN_SETTLE_STEPS = 0  # Coast samples after braking; suggested start 10-20.
TURN_PAUSE_TIME = 0.0  # Pause before/after a turn, seconds; suggested start 0.2-0.4.
TURN_CLEAR_TIME = (
    0.0  # Forward clearance after a turn, seconds; suggested start 0.3-0.5.
)

# Turn Mechanics (advanced): Correction Pulses
NUDGE_SPEED = 0  # Corrective pulse PWM; suggested start 200-230.
NUDGE_MS_PER_DEG = 0  # Pulse ms per degree of error; suggested start 3-5.
NUDGE_MIN_MS = 0  # Shortest pulse, ms; suggested start 20-30.
NUDGE_MAX_MS = 0  # Longest pulse, ms; suggested start 200-300, >= NUDGE_MIN_MS.
NUDGE_STEP = 0.0  # Pulse sample pause, seconds; suggested start 0.005-0.01.
NUDGE_SETTLE_STEPS = 0  # Coast samples after each pulse; suggested start 8-12.
TURN_MAX_NUDGES = 0  # Maximum correction pulses per turn; suggested start 4-8.

# Outside Corners
NIB_LOST_DISTANCE = 0  # Wall-loss threshold, mm; try TARGET_WALL_DISTANCE * 3.
NIB_CONFIRM_TIME = 0.0  # Continuous wall loss, seconds; suggested start 0.2-0.4.
NIB_FORWARD_BEFORE = 0.0  # Clearance before wrapping, seconds; try 0.2-0.4.
NIB_FORWARD_AFTER = 0.0  # Forward movement after wrapping, seconds; try 0.3-0.5.
NIB_PAUSE_TIME = 0.0  # Stationary pause before wrapping, seconds; try 0.1-0.3.
NIB_REACQUIRE_MS = 0  # Maximum wall search, ms; suggested start 1000-2000.

# Colour Detection
color_min_clear = 0  # Bright-marker clear counts; suggested start 150-200.
color_red_ratio = 0.0  # Red fraction of R+G+B; suggested start 0.5-0.6.
color_green_ratio = 0.0  # Green fraction of R+G+B; suggested start 0.5-0.6.
color_silver_clear = 0  # Silver clear counts; suggested start 450-550.
color_black_clear = 0  # Black clear counts; try 40-80, zero disables detection.
COLOR_PAUSE_TIME = 0.0  # Red/green marker pause, seconds; suggested start 1-2.

# Heading Hold
HEADING_Kp = 0.0  # Straight-line PWM per degree of error; suggested start 2-6.

# No-Go Recovery: Reverse
REVERSE_SPEED = 0  # Reverse PWM magnitude; suggested start 160-200.
REVERSE_DT = 0.0  # Reverse sample pause, seconds; suggested start 0.02-0.05.
REVERSE_CLEAR_STEPS = 0  # Consecutive non-black samples to stop; try 4-8.
REVERSE_MAX_STEPS = 0  # Maximum reverse samples; try 60-100, >= CLEAR_STEPS.

# No-Go Recovery: Turn and Wall Search
OPEN_SPACE_DISTANCE = 0  # Open side distance, mm; suggested start 350-450.
FORWARD_SPEED = 0  # Forward wall-search PWM; suggested start 180-220.
FORWARD_DT = 0.0  # Forward sample pause, seconds; suggested start 0.02-0.05.
WALL_FOUND_DISTANCE = 0  # Front wall-search stop, mm; suggested start 250-350.
FORWARD_MAX_STEPS = 0  # Maximum search samples; suggested start 150-250.

# No-Go Recovery: Grid Compensation
GRID_CELL_MM = 0  # Measured maze grid pitch, mm; this simulator uses 290.
GRID_WALL_OFFSET_MM = 0  # Panel/clearance offset, mm; suggested start 4-8.
GRID_ERROR_CLAMP_MM = 0  # Maximum grid correction, mm; suggested start 20-30.

# Competition
VICTIM_PAUSE_TIME = 0.0  # Victim pause, seconds; at least 1, suggested start 1-2.
POINTS_UNHARMED = 0  # Estimated green-victim points; challenge example uses 10.
POINTS_HARMED = 0  # Estimated red-victim points; challenge example uses 25.
POINTS_KIT = 0  # Estimated bonus per kit request; challenge example uses 10.
