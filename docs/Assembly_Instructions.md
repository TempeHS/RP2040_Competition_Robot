# Assembly Instructions

> [!Important]
> Before students begin, they should know:
>
> 1. During assembly, no parts should be forced, excessive force will break the components.
> 2. The motors should not be manually turned as it will break the plastic gears (that means no pushing and pulling the robot on the ground like a Tonka truck).
> 3. The robots battery power should always be turned off when connecting to a computer.
> 4. Make sure your robot has room to move and won't be stepped on when testing.
> 5. Batteries should be always removed for storage

## Step 1

**Assemble to axel for the front wheel.**

![Step 1 Visual](images/step_1.png "Step 1 Visual")

## Step 2

**Slide the omni wheel onto the middle of the axel.**

![Animation of omni wheel sliding onto the axel](images/attach_motors.gif "Animation of omni wheel sliding onto the axel")

**Assemble the main chassis.**

![Step 2 Visual](images/step_2.png "Step 2 Visual")

## Step 3

**Attach the 3D Printed brackets for the battery holder and Microcontroller.**

![Step 3 Visual](images/step_3.png "Step 3 Visual")

## Step 4

**First insert the two motors into the 3D motor clip.**

![Animation of the motors being attached](images/attach_motors.gif "Animation of the motors being attached")

**Second attach the motor clip to the chassis.**

![Step 4 Visual](images/step_4.png "Step 5 Visual")

## Step 5

**Attach the wheels to the motors.**

![Animation of the wheels being attached to the motor](images/attach_wheels.gif "Animation of the wheels being attached to the motor")

## Step 6

**Connect the wires to the screw terminals.**

![Screw terminals visual](images/screw_terminals.png "Screw terminals visual")

## Step 7

**Attach the ultrasonic sensor to the robot and connect it to the processor.**

![Ultrasonic sensor visual](images/connect_ultrasonic.png "Ultrasonic sensor visual")

## Step 8 - Test the Hardware

1. Make sure your battery power switch is off.
2. Navigate to [https://lab-micropython.arduino.cc/](https://lab-micropython.arduino.cc/).
3. Sign in with Google (use your @education.nsw.gov.au account).
4. Follow these instructions to connect:

![Animated connection instructions](images/instructions.gif "Animated connection instructions")

5. Copy and paste this code into `main.py`
6. Click <kbd>SAVE</KDB>
7. Disconnect your robot from your computer

> [!Caution]
> To avoid damaging your computer or robot place it on the floor in an area with enough space for it to move safely before powering it on.

```python
from aidriver import AIDriver, hold_state
import aidriver

"""Hardware sanity test for the AIDriver robot.

Runs a short sequence of movements and distance readings.
Most details are reported via the AIDriver debug logger.
"""

aidriver.DEBUG_AIDRIVER = True

print("Initialising AIDriver hardware test...")

try:
    robot = AIDriver(
        "left"
    )  # wall_side required; change to "right" if following right wall
except Exception as exc:
    print("Failed to initialise AIDriver:", exc)
    print("Check that 'aidriver.py' is in the 'lib' folder on the device.")
    raise SystemExit

print("Starting tests in 3 seconds. Ensure clear space around the robot.")
hold_state(3)

# Test 1: Drive Forward
print("Test 1: drive_forward")
robot.drive_forward(200, 200)
hold_state(2)
robot.brake()
hold_state(1)

# Test 2: Drive Backward
print("Test 2: drive_backward")
robot.drive_backward(200, 200)
hold_state(2)
robot.brake()
hold_state(1)

# Test 3: Rotate Right
print("Test 3: rotate_right")
robot.rotate_right(200)
hold_state(2)
robot.brake()
hold_state(1)

# Test 4: Rotate Left
print("Test 4: rotate_left")
robot.rotate_left(200)
hold_state(2)
robot.brake()
hold_state(1)

# Test 5: Gyro closed-loop turns (90 degrees each way)
if robot.has_gyro:
    print("Test 5: turn_90 right (gyro PID)")
    turned = robot.turn_90("right")
    print("  turned", round(turned, 1), "deg")
    hold_state(1)
    print("Test 5: turn_90 left (gyro PID)")
    turned = robot.turn_90("left")
    print("  turned", round(turned, 1), "deg")
    hold_state(1)
else:
    print("Test 5 skipped: no IMU/gyro detected (check GP16/GP17 wiring)")

# Test 6: Ultrasonic Sensors
print("Test 6: ultrasonic distance readings (sensor 1 + sensor 2)")
for i in range(5):
    distance_1 = robot.read_distance()
    distance_2 = robot.read_distance_2()
    print(
        "Reading", i + 1, "- Sensor 1:", distance_1, "mm | Sensor 2:", distance_2, "mm"
    )
    hold_state(0.5)

print("All hardware tests completed.")
```
