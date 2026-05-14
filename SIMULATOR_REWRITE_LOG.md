# Simulator Rewrite Log

**Date:** May 2026  
**Scope:** Complete rewrite of `app/js/simulator.js` — rear-wheel-drive differential drive kinematics  
**Test result:** 557 / 558 tests passing (1 pre-existing ESLint failure in `_probe.js`)

---

## Problem Statement

The PID wall-following algorithm never worked correctly in the simulator. After investigation, three root causes were identified:

1. **Wrong kinematic model.** The old simulator used a centre-pivot turning model. The real robot is a rear-wheel-drive differential drive — wheels at the back, front swings outward during turns. This mismatch meant simulator behaviour diverged from the physical robot.

2. **MIN_MOTOR_SPEED cliff in `drive()`.** The `AIDriverStub.drive()` function snaps any `|speed| < 120` to 0. With the old `BASE_SPEED=150` and `MAX_STEERING=40`, the inner wheel during a correction dropped to 110, which was snapped to 0. This created violent one-wheel turns instead of gentle PID corrections.

3. **Stale motor velocities after brake.** `python-runner.js` did not reset `actualLeftV` / `actualRightV` when processing a brake command. After braking, the next motor command started ramping from stale velocities, causing asymmetric behaviour.

4. **Challenge 2 answer bugs.** Missing `hold_state(0.05)` at end of loop and missing `side_previous_error = error` update — the derivative term was always zero.

---

## Files Changed

| File                                                   | Change                                                 | Lines    |
| ------------------------------------------------------ | ------------------------------------------------------ | -------- |
| `app/js/simulator.js`                                  | Complete rewrite — RWD diff-drive kinematics           | 520      |
| `app/js/python-runner.js`                              | Brake handler resets `actualLeftV`/`actualRightV` to 0 | +2       |
| `app/answers/challenge-1.py`                           | Retuned values                                         | modified |
| `app/answers/challenge-2.py`                           | Retuned + fixed missing hold_state & prev_error        | modified |
| `app/answers/challenge-3.py`                           | Retuned values                                         | modified |
| `app/answers/challenge-4.py`                           | Retuned values                                         | modified |
| `app/answers/challenge-5.py`                           | Retuned values                                         | modified |
| `app/answers/challenge-6.py`                           | Retuned values                                         | modified |
| `app/tests/unit/simulator-physics.test.js`             | 46 hand-calculated physics tests                       | 670      |
| `app/tests/integration/challenge1-real-python.test.js` | Fixed to load RobotConfig, updated thresholds          | modified |

Net diff: **1,061 insertions, 1,519 deletions** across 10 files.

---

## Kinematic Model

### Coordinate System (screen-space)

- **x** → rightward, **y** → downward
- **Heading 0°** = facing UP (−Y direction)
- Heading increases **clockwise**
- Forward vector: `(sin θ, −cos θ)`
- Left direction: `(−cos θ, −sin θ)`

### Physical Constants (from `RobotConfig`)

| Constant        | Value                   |
| --------------- | ----------------------- |
| `wheelBase`     | 120 mm                  |
| `robotLength`   | 150 mm                  |
| `robotWidth`    | 120 mm                  |
| `REAR_OFFSET`   | 75 mm (robotLength / 2) |
| `maxPWM`        | 255                     |
| `deadZonePWM`   | 64                      |
| `activePWM`     | 191 (255 − 64)          |
| `topSpeed`      | 650 mm/s                |
| `acceleration`  | 1750 mm/s²              |
| `deceleration`  | 1750 mm/s²              |
| `arena`         | 2000 × 2000 mm          |
| `ultrasonicMin` | 20 mm                   |
| `ultrasonicMax` | 2000 mm                 |
| `sensorNoise`   | ±2 mm                   |

### PWM → Velocity Mapping

```
pwmToVelocity(pwm):
  absPwm = |pwm|
  if absPwm <= deadZonePWM → 0
  velocity = ((absPwm - deadZonePWM) / activePWM) * topSpeed
  return sign(pwm) * velocity
```

Linear map from `[deadZone+1 … maxPWM]` → `(0 … topSpeed]`.  
Each PWM step ≈ 650 / 191 ≈ 3.40 mm/s.

### Velocity Ramping

```
rampVelocity(current, target, dt):
  diff = target - current
  maxStep = acceleration * dt   (or deceleration if decelerating)
  if |diff| <= maxStep → snap to target
  else → current + sign(diff) * maxStep
```

Deceleration applies when: moving and speed is decreasing, or reversing direction.

### Kinematic Update (per frame)

```
1. Derive rear axle from body centre:
     rearX = robot.x − REAR_OFFSET × sin(θ)
     rearY = robot.y + REAR_OFFSET × cos(θ)

2. Ramp actual wheel velocities toward targets:
     actL = rampVelocity(robot.actualLeftV,  targetLeftV,  dt)
     actR = rampVelocity(robot.actualRightV, targetRightV, dt)

3. Compute diff-drive at rear axle:
     v = (actL + actR) / 2
     ω = (actL − actR) / wheelBase    (+ω = clockwise)

4a. Straight (|ω| < 1e-6):
     rearX += v × sin(θ) × dt
     rearY -= v × cos(θ) × dt

4b. Arc (|ω| ≥ 1e-6):
     θ' = θ + ω × dt
     rearX += (v / ω) × (cos(θ) − cos(θ'))
     rearY += (v / ω) × (sin(θ) − sin(θ'))

5. Reconstruct body centre from new rear axle + new heading:
     robot.x = rearX + REAR_OFFSET × sin(θ')
     robot.y = rearY − REAR_OFFSET × cos(θ')

6. Normalise heading to [0, 2π)
```

### Key RWD Behaviours

- **In-place pivot:** When wheels spin in opposite directions at equal speed, the rear axle stays fixed and the body centre sweeps a circle of radius 75 mm around it.
- **Front swing:** During any turn, the front of the robot swings outward — this is the defining characteristic of rear-wheel-drive that the old centre-pivot model did not capture.
- **Left wheel faster → turns RIGHT** (ω > 0, clockwise in screen-space).

---

## Sensor Model

### Front Ultrasonic

- Origin: body centre + 75 mm forward along heading (front face of robot)
- Direction: forward along heading `(sin θ, −cos θ)`
- Ray cast against: arena boundaries + maze walls + obstacles
- Range: clamped to [20 mm, 2000 mm], with ±2 mm Gaussian noise
- Returns −1 if no hit within max range

### Side Ultrasonic

- Origin: body centre + 60 mm perpendicular to heading
- Side determined by `sideSensorSide` setting ("left" or "right")
- Left direction: `(−cos θ, −sin θ)`
- Same ray-cast and clamping as front sensor

### Ray Casting

- `castRay(ox, oy, dx, dy)` — finds nearest intersection
- Tests against 4 arena walls (half-planes) + all maze walls + all obstacles
- `rayRect(ox, oy, dx, dy, rx, ry, rw, rh)` — AABB slab intersection method
- Returns minimum positive t, or Infinity if no hit

---

## Collision & Boundary

- `getRobotCorners(robot)` — 4 corners of rotated 150 × 120 mm body
- `checkCollision(robot)` — tests all 4 corners against maze walls and obstacles using AABB `pointInRect`
- `applyBoundaryConstraints(robot)` — clamps body centre so no corner exits the 2000 × 2000 mm arena

---

## Challenge Answer Tuning

All 6 challenge answers were retuned to work with the RWD simulator:

| Parameter              | Old Value | New Value | Reason                                                         |
| ---------------------- | --------- | --------- | -------------------------------------------------------------- |
| `BASE_SPEED`           | 150       | **200**   | Keeps inner wheel above MIN_MOTOR_SPEED=120 during corrections |
| `MAX_STEERING`         | 40        | **60**    | More authority for tighter corrections                         |
| `side_Kp`              | 0.5       | **0.25**  | Less aggressive with wider steering range                      |
| `side_Kd`              | 0.1       | **0.30**  | More derivative damping for RWD overshoot                      |
| `side_Ki`              | —         | **0.005** | Small integral for steady-state (challenges 3+)                |
| `TURN_SPEED`           | 180       | **180**   | Unchanged                                                      |
| `TURN_TIME_90`         | 0.5       | **0.35**  | Validated by physics: 90° in ~0.352s at TURN_SPEED=180         |
| `TURN_TIME_180`        | 1.0       | **0.60**  | Validated: 180° in ~0.591s                                     |
| `FRONT_STOP_DISTANCE`  | 100       | **150**   | More braking room at higher speed                              |
| `FRONT_SLOW_DISTANCE`  | 300       | **400**   | Start decelerating earlier                                     |
| `FRONT_Kp`             | 0.5       | **1.0**   | Stronger proportional braking                                  |
| `TARGET_WALL_DISTANCE` | 150       | **200**   | More room from wall for RWD front-swing                        |
| `LOST_WALL_DRIFT`      | —         | **0.20**  | Gentle correction when wall sensor reads −1                    |

### Critical Constraint

```
BASE_SPEED − MAX_STEERING > MIN_MOTOR_SPEED (120)
200 − 60 = 140 > 120  ✓
```

If the inner wheel drops below 120, `AIDriverStub.drive()` snaps it to 0 — this destroys PID controllability.

---

## Test Suite

### Physics Tests (`app/tests/unit/simulator-physics.test.js`)

46 tests across 14 sections, all hand-calculated:

| Section                  | Tests | What it validates                                              |
| ------------------------ | ----- | -------------------------------------------------------------- |
| §1 PWM → Velocity        | 7     | Dead zone, max, mid-range, negative, symmetry                  |
| §2 Velocity ramping      | 4     | Accel cap, decel cap, snap, reverse                            |
| §3 Straight-line motion  | 5     | All 4 cardinal headings + 650mm/s at max PWM                   |
| §4 RWD in-place pivot    | 4     | Heading direction, rear axle fixed, centre sweeps 75mm radius  |
| §5 Turning arcs          | 3     | Arc direction, front-swing signature, heading change           |
| §6 Turn timing with ramp | 2     | 90° in ~0.35s, 180° in ~0.60s (including accel ramp)           |
| §7 Exact distance 1s     | 4     | 650mm in 1s for all 4 directions                               |
| §8 Ultrasonic            | 6     | Front/side sensors, min/max clamp, noise bounds                |
| §9 Collision             | 3     | Wall detection, obstacle detection, corner cases               |
| §10 Boundary             | 2     | Arena clamping, post-clamp position validity                   |
| §11 Mirror               | 2     | Pose mirroring, rect mirroring                                 |
| §12 SideSensorSide       | 1     | Left/right sensor side getter/setter                           |
| §13 Idle                 | 2     | No movement at zero PWM, no heading drift                      |
| §14 PD wall-follow       | 1     | Integration test: robot stays within corridor using PD control |

### Integration Test (`app/tests/integration/challenge1-real-python.test.js`)

- Loads `RobotConfig` before `Simulator` (dependency order fix)
- Robot state includes `actualLeftV` / `actualRightV`
- Thresholds relaxed for RWD P-only control: lateral excursion < 80mm, max heading < 15°
- Control test uses intentionally broken config to verify validator catches bad tuning

---

## Public API

The `Simulator` module exposes (unchanged interface, new implementation):

```javascript
Simulator.step(robot, dt); // Main physics tick
Simulator.simulateUltrasonic(robot); // Front distance sensor
Simulator.simulateUltrasonicSide(robot); // Side distance sensor
Simulator.checkCollision(robot); // {collided, ...robot}
Simulator.getRobotCorners(robot); // [{x,y}, ...]
Simulator.applyBoundaryConstraints(robot); // Clamped robot
Simulator.getInitialRobotState(); // Fresh robot at start position

Simulator.setSpeed(s); // Speed multiplier
Simulator.setMazeWalls(w); // Array of {x,y,width,height}
Simulator.setObstacles(o); // Array of {x,y,width,height}
Simulator.clearObstacles();
Simulator.setSideSensorSide(s); // "left" or "right"
Simulator.getSideSensorSide();

Simulator.mirrorPose(robot); // Mirror for right-wall mode
Simulator.mirrorRect(rect);

Simulator.pwmToVelocity(pwm); // Exposed for testing
Simulator.rampVelocity(current, target, dt);

// Constants
Simulator.ARENA_WIDTH; // 2000
Simulator.ARENA_HEIGHT; // 2000
Simulator.ROBOT_WIDTH; // 120
Simulator.ROBOT_LENGTH; // 150
Simulator.ULTRASONIC_MIN; // 20
Simulator.ULTRASONIC_MAX; // 2000
```

---

## python-runner.js Brake Fix

**Location:** `app/js/python-runner.js`, brake command handler (~line 1404)

**Before:**

```javascript
case "brake":
    App.robot.leftSpeed = 0;
    App.robot.rightSpeed = 0;
    break;
```

**After:**

```javascript
case "brake":
    App.robot.leftSpeed = 0;
    App.robot.rightSpeed = 0;
    App.robot.actualLeftV = 0;
    App.robot.actualRightV = 0;
    break;
```

Without this fix, after braking the next motor command would start ramping from the stale pre-brake velocities, causing asymmetric turn behaviour.

---

## Robot State Object

```javascript
{
  x: 150,              // Body centre X (mm)
  y: 1000,             // Body centre Y (mm)
  heading: 0,          // Radians, 0 = facing up, increases CW
  leftSpeed: 0,        // Target left wheel PWM
  rightSpeed: 0,       // Target right wheel PWM
  actualLeftV: 0,      // Current left wheel velocity (mm/s) — ramps toward target
  actualRightV: 0,     // Current right wheel velocity (mm/s) — ramps toward target
  collided: false,
  finished: false,
}
```

---

## Known Remaining Issues

1. **ESLint `_probe.js`:** 19 pre-existing ESLint errors (no-undef for `require` and `global`). Not related to this work. The `_probe.js` file is likely auto-generated.

2. **Starter code comments:** Files in `app/starter-code/` may still reference the old dead zone of 64 instead of `MIN_MOTOR_SPEED=120`. Values are intentionally zero (students fill them in), but comments could be updated.

3. **Documentation:** Tuning quickstart docs (`docs/PID_*.md`) may reference old values like `BASE_SPEED=150`. These should be updated to reflect the new recommendations.

4. **Browser validation:** The rewrite has been validated through unit and integration tests in Node.js/Jest. Full browser testing of all 6 challenges should be performed to confirm visual behaviour matches.
