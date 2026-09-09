"""Tuned settings for test harnesses, never the student or firmware defaults."""

# Robot Setup
WALL_SIDE = "left"
DISTANCE_SENSOR = "tof"
DEBUG_AIDRIVER = False
KIT_SERVO_PIN = None

# Driving
BASE_SPEED = 200
LOOP_DT = 0.05
STARTUP_PAUSE_TIME = 2.0

# Wall PID
TARGET_WALL_DISTANCE = 100
MAX_STEERING = 60
side_Kp = 0.4
side_Kd = 0.3
side_Ki = 0.001
side_INTEGRAL_MAX = 50

# Front Distance Control
FRONT_SLOW_DISTANCE = 300
FRONT_STOP_DISTANCE = 150
FRONT_Kp = 1.0
MIN_APPROACH_SPEED = 130

# Turn Control
turn_Kp = 30.0
turn_Kd = 0.4
turn_tolerance = 2.0
TURN_ANGLE = 90
TURN_MAX_SPEED = 240
MIN_TURN_SPEED = 190
TURN_TIMEOUT_MS = 2500

# Turn Mechanics (advanced): Sampling and Kick
TURN_DT = 0.02
TURN_KICK_SPEED = 255
TURN_KICK_STEPS = 4

# Turn Mechanics (advanced): Braking and Settle
TURN_COAST_TIME = 0.03
TURN_SETTLE_STEPS = 15
TURN_PAUSE_TIME = 0.3
TURN_CLEAR_TIME = 0.4

# Turn Mechanics (advanced): Correction Pulses
NUDGE_SPEED = 220
NUDGE_MS_PER_DEG = 4
NUDGE_MIN_MS = 25
NUDGE_MAX_MS = 250
NUDGE_STEP = 0.005
NUDGE_SETTLE_STEPS = 10
TURN_MAX_NUDGES = 6

# Outside Corners
NIB_LOST_DISTANCE = TARGET_WALL_DISTANCE * 3
NIB_CONFIRM_TIME = 0.3
NIB_FORWARD_BEFORE = 0.3
NIB_FORWARD_AFTER = 0.4
NIB_PAUSE_TIME = 0.2
NIB_REACQUIRE_MS = 1500

# Colour Detection
color_min_clear = 180
color_red_ratio = 0.55
color_green_ratio = 0.55
color_silver_clear = 500
color_black_clear = 60
COLOR_PAUSE_TIME = 1.0

# Heading Hold
HEADING_Kp = 4.0

# No-Go Recovery: Reverse
REVERSE_SPEED = 180
REVERSE_DT = 0.05
REVERSE_CLEAR_STEPS = 6
REVERSE_MAX_STEPS = 80

# No-Go Recovery: Turn and Wall Search
OPEN_SPACE_DISTANCE = 400
FORWARD_SPEED = 200
FORWARD_DT = 0.05
WALL_FOUND_DISTANCE = 300
FORWARD_MAX_STEPS = 200

# No-Go Recovery: Grid Compensation
GRID_CELL_MM = 290
GRID_WALL_OFFSET_MM = 6
GRID_ERROR_CLAMP_MM = 25

# Competition
VICTIM_PAUSE_TIME = 2.0
POINTS_UNHARMED = 10
POINTS_HARMED = 25
POINTS_KIT = 10
