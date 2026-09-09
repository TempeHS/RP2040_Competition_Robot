# Real-World Check Worksheet

This worksheet is only for the four checks in [real_world_check.py](../project/real_world_check.py): `sensors`, `gyro`, `wheel`, and `speed_change`.

Run them on the physical robot, one at a time. Record what actually happens; no simulator results or other calibration tests are required.

## Complete Test Code

Run this complete program on the Pico with your existing [config.py](../project/config.py) and installed AIDriver library. Stop the current program first and keep the robot still during startup calibration. It starts in sensor-only mode with motion disabled.

The same code is available as [real_world_check.py](../project/real_world_check.py). For each later check, change the selector settings shown in that check's instructions below.

```python
"""Run one bench check on the robot, not in the simulator.

Stop any running main first, then run this file from the MicroPython editor.
Keep the robot still during startup gyro calibration.

CHECK choices:
	sensors: 20 raw front/side/colour/gyro samples; motors stay braked.
	gyro: rotate the robot once by a measured angle during a 10-second window.
	wheel: one 0.25-second pulse at config.BASE_SPEED; choose WHEEL below.
	speed_change: compare cached speeds with PWM register readings before and
		after set_motor_speeds(), then after drive() reapplies the same speeds.

For either motion check, raise both wheels clear of the bench, keep hands away,
and explicitly set ALLOW_MOTION = True. Keep the power switch within reach.
Speed-change pulses use config.BASE_SPEED then config.MIN_APPROACH_SPEED.
No tuning values or pass/fail limits are supplied by this diagnostic.
"""

from time import ticks_ms, ticks_diff

import aidriver
import config
from aidriver import AIDriver, hold_state

CHECK = "sensors"
ALLOW_MOTION = False
WHEEL = "right"


def check_sensors(robot):
	print("sample,front_mm,side_mm,red,green,blue,clear,gyro_dps")
	for sample in range(20):
		front = robot.read_distance()
		side = robot.read_distance_2()
		red, green, blue, clear = robot.read_color()
		gyro = robot.read_gyro_z_dps()
		print(sample + 1, front, side, red, green, blue, clear, round(gyro, 3), sep=",")
		hold_state(0.5)


def check_gyro(robot):
	if not robot.has_gyro:
		print("Gyro missing; angle check skipped.")
		return
	print("Rotate by hand through one measured angle now; window is 10 seconds.")
	print("elapsed_ms,gyro_dps,integrated_deg")
	previous_rate = robot.read_gyro_z_dps()
	started = ticks_ms()
	previous_time = started
	last_report = started
	angle = 0.0
	while ticks_diff(previous_time, started) < 10000:
		hold_state(0.02)
		rate = robot.read_gyro_z_dps()
		now = ticks_ms()
		angle += (previous_rate + rate) * 0.5 * ticks_diff(now, previous_time) / 1000
		previous_rate = rate
		previous_time = now
		if ticks_diff(now, last_report) >= 500:
			print(ticks_diff(now, started), round(rate, 3), round(angle, 2), sep=",")
			last_report = now
	print("Integrated angle (degrees):", round(angle, 2))
	print("Record your ruler/protractor angle and turn direction separately.")


def check_wheel(robot):
	speed = config.BASE_SPEED
	speeds = {"right": (speed, 0), "left": (0, speed), "both": (speed, speed)}
	right, left = speeds[WHEEL]
	print("Requested right/left PWM:", right, left, "; pulse: 0.25 seconds")
	try:
		robot.drive(right, left)
		hold_state(0.25)
	finally:
		robot.brake()
	print("Record which wheel moved and whether it moved forward or backward.")


def motor_snapshot(robot):
	"""Read cached settings and PWM registers, not physical wheel speed."""
	return robot.get_motor_speeds(), (
		robot.motor_right._pin_enable.duty_u16(),
		robot.motor_left._pin_enable.duty_u16(),
	)


def check_speed_change(robot):
	initial = config.BASE_SPEED
	changed = config.MIN_APPROACH_SPEED
	print("Requested PWM:", initial, "then", changed, "; three 0.25-second phases")
	try:
		robot.drive(initial, initial)
		hold_state(0.25)
		before = motor_snapshot(robot)
		robot.set_motor_speeds(changed, changed)
		hold_state(0.25)
		after_set = motor_snapshot(robot)
		robot.drive(changed, changed)
		hold_state(0.25)
		after_drive = motor_snapshot(robot)
	finally:
		robot.brake()
	print("stage: cached (right,left), PWM register (right,left)")
	print("Initial drive:", before)
	print("After set_motor_speeds:", after_set)
	print("After drive reapplies:", after_drive)
	print("PWM registers are controller outputs, not wheel RPM.")


def main():
	checks = {
		"sensors": check_sensors,
		"gyro": check_gyro,
		"wheel": check_wheel,
		"speed_change": check_speed_change,
	}
	if CHECK not in checks:
		raise ValueError("Unknown CHECK: " + str(CHECK))
	if CHECK == "wheel" and WHEEL not in ("right", "left", "both"):
		raise ValueError("WHEEL must be right, left or both")
	motion = CHECK in ("wheel", "speed_change")
	if motion and ALLOW_MOTION is not True:
		print("Motion disabled. Raise the wheels, then explicitly enable ALLOW_MOTION.")
		return
	print("Check:", CHECK, "| distance backend:", config.DISTANCE_SENSOR)
	print("Keep still during startup calibration. Ctrl-C interrupts the check.")
	aidriver.DEBUG_AIDRIVER = config.DEBUG_AIDRIVER
	robot = AIDriver(config.WALL_SIDE, distance_sensor=config.DISTANCE_SENSOR)
	try:
		robot.brake()
		print("Gyro present:", robot.has_gyro, "| Colour present:", robot.has_color)
		if motion:
			print("Wheels raised; keep hands clear. Starting in 3 seconds.")
			for remaining in (3, 2, 1):
				print(remaining)
				hold_state(1)
		checks[CHECK](robot)
	finally:
		robot.brake()
	print("Check finished. Motors braked.")


if __name__ == "__main__":
	main()
```

## Before You Start

1. Stop the current robot program using your MicroPython editor's Stop control or Ctrl-C in the REPL. Keep the motor power switch accessible.
2. Open [real_world_check.py](../project/real_world_check.py) in your MicroPython editor. Run this file on the Pico, without replacing your normal main program or changing the robot library.
3. Make sure your existing [config.py](../project/config.py) is available on the Pico. Check that `WALL_SIDE` and `DISTANCE_SENSOR` match the installed sensors and wiring.
4. Select the check using `CHECK` near the top of the test script. `ALLOW_MOTION` and `WHEEL` are also in the test script, not in the shared configuration.
5. Keep the robot completely still during startup gyro calibration. Wait for the selected check's output before moving the robot by hand.
6. A normal run ends with `Check finished. Motors braked.` If an error appears, record the full message and stop that check.

> For either motor check, support the robot securely with both wheels clear of the bench. Keep hands, cables and loose objects away from the wheels. Ctrl-C requests a software stop; cut motor power if movement continues or the program becomes unresponsive.

### Session Details

| Item                               | Your entry |
| ---------------------------------- | ---------- |
| Date and tester                    |            |
| Robot identifier                   |            |
| Installed firmware/build, if known |            |
| `DISTANCE_SENSOR`                  |            |
| `WALL_SIDE`                        |            |
| Battery or motor supply used       |            |
| Startup `Gyro present:`            |            |
| Startup `Colour present:`          |            |

## 1. Sensors: Distance, Colour and Stationary Gyro

### Set the Script

```python
CHECK = "sensors"
ALLOW_MOTION = False
```

### Steps

1. Place flat targets in front of the front and side distance sensors. Measure from each sensor's face to its target, not from the robot's bumper.
2. Keep the robot and targets still. Put a known surface under the colour sensor at its normal operating height.
3. Run the script. It prints 20 samples, with a 0.5-second pause after each sample. Sensor reads and startup add to the total run time.
4. Record the measured distances and the smallest/largest reported readings below. Count `-1` readings separately; do not include them in the reported range.
5. Repeat at two other measured target positions. For the optional open-space row, remove the targets and record the readings without inventing a reference distance.
6. For colour readings, keep the targets fixed and repeat the same check with each available surface below. Keep the sensor height and lighting unchanged. Enter one complete sample's red, green, blue and clear counts together; retain all 20 samples in the console log.
7. Record the stationary gyro reading range from one run. Do not move the robot during this run.

The printed columns are:

```text
sample,front_mm,side_mm,red,green,blue,clear,gyro_dps
```

### Distance Results

All distances are in millimetres. Write ranges as, for example, `148 to 154`.

| Run                   | Measured front | Reported front range | Measured side | Reported side range | Number of -1 readings (front / side) | Notes |
| --------------------- | -------------- | -------------------- | ------------- | ------------------- | ------------------------------------ | ----- |
| Position 1            |                |                      |               |                     |                                      |       |
| Position 2            |                |                      |               |                     |                                      |       |
| Position 3            |                |                      |               |                     |                                      |       |
| Open space (optional) | No target      |                      | No target     |                     |                                      |       |

### Colour Results

These are raw sensor counts, not colour classification results. Leave unavailable surfaces blank.

| Actual surface | Sample number | Red | Green | Blue | Clear | Lighting/height/notes |
| -------------- | ------------- | --- | ----- | ---- | ----- | --------------------- |
| Normal floor   |               |     |       |      |       |                       |
| Black          |               |     |       |      |       |                       |
| Red            |               |     |       |      |       |                       |
| Green          |               |     |       |      |       |                       |
| Silver         |               |     |       |      |       |                       |

### Stationary Gyro Result

| Run | Lowest gyro reading (deg/s) | Highest gyro reading (deg/s) | Robot stayed still? | Notes |
| --- | --------------------------- | ---------------------------- | ------------------- | ----- |
|     |                             |                              |                     |       |

`-1` means no valid distance reading; in open space it can be expected. A missing colour sensor or a colour read error can produce four zeros. A missing gyro or a gyro read error can produce zero. Record the startup presence messages and any errors instead of treating these values alone as proof that a sensor works.

## 2. Gyro: Turn the Robot by Hand

### Set the Script

```python
CHECK = "gyro"
ALLOW_MOTION = False
```

### Steps

1. Prepare a start-heading mark and a measured 90-degree reference using a protractor or square. Arrange the robot so you can turn the chassis by hand while keeping it level and the wheels clear.
2. Run the script and keep the robot still during startup calibration. If it prints `Gyro missing; angle check skipped.`, record that and skip this check.
3. Wait for `Rotate by hand through one measured angle now; window is 10 seconds.` The measurement window starts immediately at this prompt; there is no countdown for this check.
4. For the first run, leave the robot stationary for the whole window.
5. Run again. At the prompt, turn it once approximately 90 degrees clockwise, viewed from above. Stop at the reference and hold it still until the window ends. Do not turn it back during the window.
6. Repeat for a counter-clockwise turn. Reposition the robot before starting the next run, not during its calibration.
7. Enter your physically measured angle and the final `Integrated angle (degrees):` output. Keep the printed plus/minus sign. Record the actual measured angle even if you did not stop at exactly 90 degrees.

### Results

| Run               | Physical turn, viewed from above | Measured angle magnitude (degrees) | Printed signed integrated angle (degrees) | Notes |
| ----------------- | -------------------------------- | ---------------------------------- | ----------------------------------------- | ----- |
| 1                 | Stationary                       | 0                                  |                                           |       |
| 2                 | Clockwise                        |                                    |                                           |       |
| 3                 | Counter-clockwise                |                                    |                                           |       |
| Repeat, if needed |                                  |                                    |                                           |       |

This checks the gyro during hand movement. It does not test an automatic motor-driven turn.

## 3. Wheel: One Short Motor Pulse

### Set the Script

```python
CHECK = "wheel"
ALLOW_MOTION = True
WHEEL = "right"
```

### Steps

1. Raise and secure both wheels before enabling motion. Identify left and right from the robot's perspective when facing forward.
2. In your shared configuration, choose and record the positive `BASE_SPEED` PWM setting to test. The student default is zero, which will not move the wheels. The library's `drive()` suppresses commands below 120; its positive operating command range is 120 to 255, but a particular robot may still stall near the lower end.
3. Set the script as above and run it. After startup there is a three-second countdown, followed by one 0.25-second right-wheel pulse and braking.
4. Record which wheel actually moved, its direction, and whether it stopped. "Forward" means the wheel rotation that would propel the robot forward when on the floor.
5. Change only `WHEEL` to `"left"`, run again and record the result.
6. Change `WHEEL` to `"both"`, run again and record the result. Keep the wheels raised throughout all three runs.
7. Set `ALLOW_MOTION = False` after finishing this check.

### Results

| `WHEEL` | `BASE_SPEED` used | Right wheel: forward / reverse / still | Left wheel: forward / reverse / still | Stopped after pulse? | Notes |
| ------- | ----------------- | -------------------------------------- | ------------------------------------- | -------------------- | ----- |
| `right` |                   |                                        |                                       |                      |       |
| `left`  |                   |                                        |                                       |                      |       |
| `both`  |                   |                                        |                                       |                      |       |

## 4. Speed Change: Compare Settings with PWM Registers

### Set the Script

```python
CHECK = "speed_change"
ALLOW_MOTION = True
```

### Steps

1. Keep both wheels securely raised and the motor power switch accessible. `WHEEL` is not used by this check; both wheels are commanded together.
2. Record your existing `BASE_SPEED` and `MIN_APPROACH_SPEED`. For a meaningful comparison, use two different positive values in the 120 to 255 range. Choose speeds appropriate for your robot, with `MIN_APPROACH_SPEED` lower than `BASE_SPEED`. Equal values or the zero defaults do not test a running speed change.
3. Run the script. After startup and the three-second countdown, it runs three consecutive phases: `drive()` at `BASE_SPEED`, `set_motor_speeds()` at `MIN_APPROACH_SPEED`, then `drive()` at that same `MIN_APPROACH_SPEED`. Each phase holds for 0.25 seconds; there is no brake between phases.
4. The script captures a snapshot at the end of each phase, brakes, then prints the three snapshots. Enter them below exactly as reported. Each line contains a cached `(right, left)` pair followed by a PWM-register `(right, left)` pair.
5. Record whether the wheels stopped, any obvious speed changes, and any exception. If it cannot read the PWM registers on your installed firmware, retain the full error rather than changing the library.
6. Set `ALLOW_MOTION = False` again. Restore any configuration values you changed only for this check using the original values recorded below.

### Settings

| Configuration setting | Original value | Value used for this check |
| --------------------- | -------------- | ------------------------- |
| `BASE_SPEED`          |                |                           |
| `MIN_APPROACH_SPEED`  |                |                           |

### Results

The cached settings and register readings use the motor driver's 16-bit PWM scale. They are not wheel RPM or measured travel speed.

| Printed stage             | Cached right | Cached left | PWM register right | PWM register left |
| ------------------------- | ------------ | ----------- | ------------------ | ----------------- |
| `Initial drive:`          |              |             |                    |                   |
| `After set_motor_speeds:` |              |             |                    |                   |
| `After drive reapplies:`  |              |             |                    |                   |

| Observation                     | Your entry |
| ------------------------------- | ---------- |
| Wheels stopped after the check? |            |
| Any obvious speed change?       |            |
| Error message or other notes    |            |

## Results to Return

Return the completed tables and the full console output from these checks, labelled with the check name and run. Include startup presence messages and complete error messages. Mark anything you did not run as `Not run`; do not fill it with zero.

Leave `ALLOW_MOTION = False` when finished. No robot-library changes are part of this worksheet.
