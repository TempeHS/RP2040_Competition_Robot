"""Robot settings: wiring, calibration and tuning. The only file to edit for setup."""

# Servos (continuous rotation)
LEFT_SERVO_PIN = 14
RIGHT_SERVO_PIN = 15
LEFT_STOP_US = 1500  # Trim until the wheel is still.
RIGHT_STOP_US = 1500
LEFT_REVERSED = False  # Flip if the wheel spins backwards on a forward command.
RIGHT_REVERSED = True
SERVO_DEADBAND_US = 30  # Offset from stop where the wheel starts to move.
SERVO_RANGE_US = 500  # Offset from stop at full speed.

# I2C (SDA, SCL). GP4/GP5 can only be I2C0; GP2/GP3 can only be I2C1.
I2C0_PINS = (4, 5)
I2C1_PINS = (2, 3)
I2C_FREQ = 100_000

# Bus (0 or 1) for each device. The two ToFs share address 0x29 so must differ.
FRONT_TOF_BUS = 1
OLED_BUS = 1
SIDE_TOF_BUS = 0
COLOUR_BUS = 0
GYRO_BUS = 0

# Stage 4 calibration
GYRO_SIGN = -1  # Set so clockwise rotation reads positive.

# Stage 2: side wall PID. Speeds are -100..100, distances mm.
BASE_SPEED = 40
WALL_SIDE = "left"  # Side the side ToF faces: "left" or "right".
SIDE_TARGET_MM = 100
SIDE_LOST_MM = 300  # Further than this means no wall: drive straight.
SIDE_KP = 0.4  # Steer per mm of error.
SIDE_KI = 0.0
SIDE_KD = 0.05
SIDE_MAX_STEER = 25

# Stage 3: front PID (approach a wall and hold distance)
FRONT_STOP_MM = 80
FRONT_TOLERANCE_MM = 10
FRONT_KP = 0.5  # Speed per mm still to go.
FRONT_KD = 0.0

# Stage 4: gyro turns
TURN_KP = 1.5  # Speed per degree still to turn.
TURN_KD = 0.0
TURN_MAX_SPEED = 60
TURN_TOLERANCE_DEG = 2
TURN_TIMEOUT_MS = 4000

# Stage 5: floor colour. Measure each surface with test5_colour.py.
BLACK_MAX_W = 200  # White count at or below this is black.
SILVER_MIN_W = 10000  # White count at or above this is silver.
RED_RATIO = 0.45  # R / (R+G+B) at or above this is red.
GREEN_RATIO = 0.45  # G / (R+G+B) at or above this is green.
REVERSE_SPEED = 40
REVERSE_MS = 800
VICTIM_PAUSE_MS = 3000
