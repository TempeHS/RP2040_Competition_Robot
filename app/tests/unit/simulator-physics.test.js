/**
 * Physics Math Validation Tests for Simulator
 *
 * Every test here calculates the EXPECTED result by hand from the real-world
 * robot measurements in RobotConfig, then asserts the simulator produces
 * exactly that value.  If any test fails, the simulator physics are wrong.
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │  REAL-WORLD CONSTANTS  (from RobotConfig)                         │
 * │                                                                    │
 * │  wheelBase        = 120 mm                                         │
 * │  maxPWM           = 255                                            │
 * │  deadZonePWM      = 64                                             │
 * │  topSpeed         = 0.65 m/s  = 650 mm/s                          │
 * │  liveRange        = 255 − 64 = 191                                 │
 * │  acceleration     = 1.75 m/s² = 1750 mm/s²                        │
 * │  deceleration     = 1.75 m/s² = 1750 mm/s²                        │
 * │  arena            = 2000 × 2000 mm                                 │
 * │  robot            = 120 wide × 150 long mm                         │
 * │  ultrasonic range = 20 … 2000 mm                                   │
 * └────────────────────────────────────────────────────────────────────┘
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ── Helpers ──────────────────────────────────────────────────────────

/** Load a fresh Simulator instance (clean closure state). */
function loadSimulator() {
  // Load RobotConfig first, then Simulator
  const configSrc = fs.readFileSync(
    path.join(__dirname, "../../js/robot-config.js"),
    "utf8",
  );
  const simSrc = fs.readFileSync(
    path.join(__dirname, "../../js/simulator.js"),
    "utf8",
  );
  const sandbox = {
    Math,
    Date,
    console,
    Object,
    Infinity,
    DebugPanel: { info: () => {}, warning: () => {}, error: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    configSrc +
      "\n" +
      simSrc +
      "\n;this.Simulator = Simulator; this.RobotConfig = RobotConfig;",
    sandbox,
  );
  return sandbox.Simulator;
}

// ── Duplicate the math here so we can compute expected values ────────

const WHEEL_BASE = 120; // mm
const MAX_PWM = 255;
const DEAD_ZONE = 64;
const LIVE_RANGE = MAX_PWM - DEAD_ZONE; // 191
const TOP_SPEED = 650; // mm/s
const ACCEL = 1750; // mm/s²
const DECEL = 1750; // mm/s²
const ARENA_W = 2000;
const ARENA_H = 2000;
const ROBOT_W = 120;
const ROBOT_L = 150;

/** Same PWM→velocity formula the simulator must use. */
function expectedVelocity(pwm) {
  const abs = Math.abs(pwm);
  if (abs <= DEAD_ZONE) return 0;
  const clamped = Math.min(abs, MAX_PWM);
  const v = ((clamped - DEAD_ZONE) / LIVE_RANGE) * TOP_SPEED;
  return pwm >= 0 ? v : -v;
}

/** Compute expected ramp result for one timestep. */
function expectedRamp(current, target, dt) {
  const diff = target - current;
  if (diff === 0) return target;
  const rate = Math.abs(target) >= Math.abs(current) ? ACCEL : DECEL;
  const maxDelta = rate * dt;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/** Reverse-map: given a desired wheel velocity (mm/s), return the PWM that produces it. */
function velocityToPwm(v) {
  if (v === 0) return 0;
  const abs = Math.abs(v);
  const pwm = (abs / TOP_SPEED) * LIVE_RANGE + DEAD_ZONE;
  return v >= 0 ? pwm : -pwm;
}

/**
 * Run N steps of kinematics with given PWM commands (simSpeed=1).
 * Returns { x, y, heading, actualLeftV, actualRightV }.
 */
function simulateManually(
  startX,
  startY,
  startHeading,
  leftPWM,
  rightPWM,
  dt,
  steps,
) {
  let x = startX;
  let y = startY;
  let heading = startHeading; // degrees
  let aLV = 0; // actual left velocity mm/s
  let aRV = 0; // actual right velocity mm/s

  for (let i = 0; i < steps; i++) {
    const leftTarget = expectedVelocity(leftPWM);
    const rightTarget = expectedVelocity(rightPWM);

    aLV = expectedRamp(aLV, leftTarget, dt);
    aRV = expectedRamp(aRV, rightTarget, dt);

    const v = (aLV + aRV) / 2;
    const omega = (aLV - aRV) / WHEEL_BASE;
    const theta = (heading * Math.PI) / 180;

    if (Math.abs(omega) < 1e-6) {
      x += v * Math.sin(theta) * dt;
      y -= v * Math.cos(theta) * dt;
    } else {
      const R = v / omega;
      const newTheta = theta + omega * dt;
      x += R * (Math.cos(theta) - Math.cos(newTheta));
      y -= R * (Math.sin(newTheta) - Math.sin(theta));
      heading = ((newTheta * 180) / Math.PI) % 360;
      if (heading < 0) heading += 360;
      continue;
    }
    // heading unchanged for straight
  }

  return { x, y, heading, actualLeftV: aLV, actualRightV: aRV };
}

// =====================================================================
//  TESTS
// =====================================================================

describe("Simulator physics math validation", () => {
  let Sim;

  beforeEach(() => {
    Sim = loadSimulator();
    Sim.setSpeed(1.0);
    Sim.setObstacles([]);
    Sim.setMazeWalls([]);
    Sim.setSideSensorSide("left");
  });

  // ─────────────────────────────────────────────────────────────────
  //  1. PWM → VELOCITY CONVERSION
  // ─────────────────────────────────────────────────────────────────

  describe("PWM to velocity mapping", () => {
    test("PWM=0 → velocity 0 (dead zone)", () => {
      // Robot at centre, both motors at 0, should not move
      const robot = makeRobot({ leftSpeed: 0, rightSpeed: 0, isMoving: true });
      const after = Sim.step(robot, 1.0);
      expect(after.actualLeftV).toBe(0);
      expect(after.actualRightV).toBe(0);
    });

    test("PWM at dead zone boundary (64) → velocity 0", () => {
      const robot = makeRobot({
        leftSpeed: 64,
        rightSpeed: 64,
        isMoving: true,
      });
      const after = Sim.step(robot, 1.0);
      expect(after.actualLeftV).toBe(0);
      expect(after.actualRightV).toBe(0);
    });

    test("PWM=255 (max) → velocity = 650 mm/s after full ramp", () => {
      // With accel=1750 mm/s², reaching 650 mm/s takes 650/1750 ≈ 0.371s
      // Use a large dt so we're sure to reach target in one step
      const robot = makeRobot({
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
      });
      const after = Sim.step(robot, 1.0); // 1 second, plenty of time to ramp
      expect(after.actualLeftV).toBeCloseTo(TOP_SPEED, 3);
      expect(after.actualRightV).toBeCloseTo(TOP_SPEED, 3);
    });

    test("PWM=160 → exact velocity = ((160-64)/191)*650", () => {
      const expected = ((160 - DEAD_ZONE) / LIVE_RANGE) * TOP_SPEED;
      // = (96/191) * 650 = 326.70... mm/s
      expect(expected).toBeCloseTo(326.7016, 2);

      // Run long enough to fully ramp up
      const robot = makeRobot({
        leftSpeed: 160,
        rightSpeed: 160,
        isMoving: true,
      });
      const after = Sim.step(robot, 1.0);
      expect(after.actualLeftV).toBeCloseTo(expected, 3);
      expect(after.actualRightV).toBeCloseTo(expected, 3);
    });

    test("PWM just above dead zone (65) → small positive velocity", () => {
      const expected = ((65 - DEAD_ZONE) / LIVE_RANGE) * TOP_SPEED;
      // = (1/191) * 650 ≈ 3.403 mm/s
      expect(expected).toBeCloseTo(3.4031, 2);

      const robot = makeRobot({
        leftSpeed: 65,
        rightSpeed: 65,
        isMoving: true,
      });
      const after = Sim.step(robot, 1.0);
      expect(after.actualLeftV).toBeCloseTo(expected, 3);
    });

    test("negative PWM produces negative velocity (reverse)", () => {
      const robot = makeRobot({
        leftSpeed: -200,
        rightSpeed: -200,
        isMoving: true,
      });
      const after = Sim.step(robot, 1.0);
      expect(after.actualLeftV).toBeLessThan(0);
      expect(after.actualRightV).toBeLessThan(0);
      const expectedV = -((200 - DEAD_ZONE) / LIVE_RANGE) * TOP_SPEED;
      expect(after.actualLeftV).toBeCloseTo(expectedV, 3);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  2. ACCELERATION / DECELERATION RAMP
  // ─────────────────────────────────────────────────────────────────

  describe("velocity ramping (motor inertia)", () => {
    test("from rest, 1 step at dt=0.1s: velocity = accel × dt = 175 mm/s (capped to target if smaller)", () => {
      // PWM=255 → target=650.  Ramp from 0: delta = 1750 × 0.1 = 175
      // After one step of dt=0.1: actualV = 175 mm/s  (not yet at 650)
      const robot = makeRobot({
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        actualLeftV: 0,
        actualRightV: 0,
      });
      // Use a tiny substep to avoid substep splitting
      const after = stepNoCollision(robot, 0.01);
      // In 0.01s: delta = 1750 × 0.01 = 17.5
      expect(after.actualLeftV).toBeCloseTo(17.5, 3);
      expect(after.actualRightV).toBeCloseTo(17.5, 3);
    });

    test("time to reach top speed = 650/1750 ≈ 0.3714s", () => {
      const timeToTop = TOP_SPEED / ACCEL;
      expect(timeToTop).toBeCloseTo(0.37143, 3);
    });

    test("partial ramp: 10 steps × 0.01s should reach 175 mm/s", () => {
      let robot = makeRobot({
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        actualLeftV: 0,
        actualRightV: 0,
      });
      for (let i = 0; i < 10; i++) {
        robot = stepNoCollision(robot, 0.01);
      }
      // 10 × 17.5 = 175 mm/s  (still below 650, so pure ramp)
      expect(robot.actualLeftV).toBeCloseTo(175, 1);
      expect(robot.actualRightV).toBeCloseTo(175, 1);
    });

    test("deceleration: stopping from top speed", () => {
      // Start at top speed, command PWM=0
      let robot = makeRobot({
        leftSpeed: 0,
        rightSpeed: 0,
        isMoving: true,
        actualLeftV: TOP_SPEED,
        actualRightV: TOP_SPEED,
      });
      const after = stepNoCollision(robot, 0.01);
      // Decel rate = 1750, delta = 17.5 mm/s per 0.01s
      expect(after.actualLeftV).toBeCloseTo(TOP_SPEED - 17.5, 3);
      expect(after.actualRightV).toBeCloseTo(TOP_SPEED - 17.5, 3);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  3. STRAIGHT-LINE MOTION
  // ─────────────────────────────────────────────────────────────────

  describe("straight-line motion (equal PWM both wheels)", () => {
    test("heading=0 (up): moves in −Y direction", () => {
      // heading=0 → forward = (sin0, −cos0) = (0, −1)
      // At velocity v, after dt: dy = −v*dt
      const v = TOP_SPEED;
      const dt = 0.01;
      let robot = makeRobot({
        heading: 0,
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        actualLeftV: v,
        actualRightV: v,
        x: 1000,
        y: 1000,
      });
      const after = stepNoCollision(robot, dt);
      // Already at top speed, target=650, actual=650 → ramp = 650
      expect(after.heading).toBeCloseTo(0, 5);
      expect(after.x).toBeCloseTo(1000, 3); // no X movement
      const expectedDy = -v * dt; // = −6.5 mm
      expect(after.y - robot.y).toBeCloseTo(expectedDy, 3);
    });

    test("heading=90 (right): moves in +X direction", () => {
      // heading=90° → forward = (sin90, −cos90) = (1, 0)
      const v = TOP_SPEED;
      const dt = 0.01;
      let robot = makeRobot({
        heading: 90,
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        actualLeftV: v,
        actualRightV: v,
        x: 1000,
        y: 1000,
      });
      const after = stepNoCollision(robot, dt);
      expect(after.y).toBeCloseTo(1000, 3); // no Y movement
      const expectedDx = v * dt; // = +6.5 mm
      expect(after.x - robot.x).toBeCloseTo(expectedDx, 3);
    });

    test("heading=180 (down): moves in +Y direction", () => {
      // heading=180° → forward = (sin180, −cos180) = (0, 1)
      const v = TOP_SPEED;
      const dt = 0.01;
      let robot = makeRobot({
        heading: 180,
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        actualLeftV: v,
        actualRightV: v,
        x: 1000,
        y: 1000,
      });
      const after = stepNoCollision(robot, dt);
      expect(after.x).toBeCloseTo(1000, 3);
      const expectedDy = v * dt; // = +6.5 mm
      expect(after.y - robot.y).toBeCloseTo(expectedDy, 3);
    });

    test("heading=270 (left): moves in −X direction", () => {
      // heading=270° → forward = (sin270, −cos270) = (−1, 0)
      const v = TOP_SPEED;
      const dt = 0.01;
      let robot = makeRobot({
        heading: 270,
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        actualLeftV: v,
        actualRightV: v,
        x: 1000,
        y: 1000,
      });
      const after = stepNoCollision(robot, dt);
      expect(after.y).toBeCloseTo(1000, 3);
      const expectedDx = -v * dt; // = −6.5 mm
      expect(after.x - robot.x).toBeCloseTo(expectedDx, 3);
    });

    test("heading=45: moves diagonally (equal dx, dy components)", () => {
      // heading=45° → forward = (sin45, −cos45) = (√2/2, −√2/2)
      const v = TOP_SPEED;
      const dt = 0.01;
      const robot = makeRobot({
        heading: 45,
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        actualLeftV: v,
        actualRightV: v,
        x: 1000,
        y: 1000,
      });
      const after = stepNoCollision(robot, dt);
      const s = Math.SQRT2 / 2;
      expect(after.x - robot.x).toBeCloseTo(v * s * dt, 3); // +4.596
      expect(after.y - robot.y).toBeCloseTo(-v * s * dt, 3); // −4.596
    });

    test("distance after 1 second at full speed = 650 mm", () => {
      // Start already at full speed, run for 100 steps of 0.01s
      let robot = makeRobot({
        heading: 0,
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        actualLeftV: TOP_SPEED,
        actualRightV: TOP_SPEED,
        x: 1000,
        y: 1200,
      });
      for (let i = 0; i < 100; i++) {
        robot = stepNoCollision(robot, 0.01);
      }
      // Should have moved 650mm upward (−Y)
      const dy = robot.y - 1200;
      expect(dy).toBeCloseTo(-650, 0);
      expect(robot.x).toBeCloseTo(1000, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  4. TURNING / ROTATION
  // ─────────────────────────────────────────────────────────────────

  describe("turning and rotation", () => {
    test("rotate right in place: left=+v, right=−v → heading increases", () => {
      // rotate_right: left forward, right backward
      // vL = +V, vR = −V
      // ω = (vL − vR) / L = (V − (−V)) / L = 2V/L > 0 → heading increases → RIGHT ✓
      const V = 200; // mm/s
      const robot = makeRobot({
        heading: 0,
        leftSpeed: velocityToPwm(V),
        rightSpeed: velocityToPwm(-V),
        actualLeftV: V,
        actualRightV: -V,
        isMoving: true,
        x: 1000,
        y: 1000,
      });
      // ω = (vL − vR) / L = (200 − (−200)) / 120 = 400/120 = +3.333 rad/s
      const omega = (V - -V) / WHEEL_BASE;
      expect(omega).toBeCloseTo(3.3333, 3);
      const after = stepNoCollision(robot, 0.01);
      const expectedHeading = (0 + (omega * 0.01 * 180) / Math.PI) % 360;
      expect(after.heading).toBeCloseTo(expectedHeading, 2);
    });

    test("rotate left in place: left=−v, right=+v → heading decreases", () => {
      // vL = −V, vR = +V
      // ω = (vL − vR) / L = (−V − V) / L = −2V/L < 0 → heading decreases → LEFT ✓
      const V = 200;
      const robot = makeRobot({
        heading: 90,
        leftSpeed: velocityToPwm(-V),
        rightSpeed: velocityToPwm(V),
        actualLeftV: -V,
        actualRightV: V,
        isMoving: true,
        x: 1000,
        y: 1000,
      });
      // ω = (−V − V) / L = −400/120 = −3.333 rad/s
      const omega = (-V - V) / WHEEL_BASE;
      expect(omega).toBeCloseTo(-3.3333, 3);
      const after = stepNoCollision(robot, 0.01);
      const expectedHeading = 90 + (omega * 0.01 * 180) / Math.PI;
      expect(after.heading).toBeCloseTo(expectedHeading, 2);
    });

    test("pure rotation: linear velocity = 0 (no displacement)", () => {
      const V = 300;
      const robot = makeRobot({
        heading: 0,
        leftSpeed: velocityToPwm(V),
        rightSpeed: velocityToPwm(-V),
        actualLeftV: V,
        actualRightV: -V,
        isMoving: true,
        x: 1000,
        y: 1000,
      });
      // v = (vL + vR)/2 = (300 + (−300))/2 = 0
      // Robot should spin in place, no translation
      const after = stepNoCollision(robot, 0.01);
      // With arc formula: R = v/ω = 0, but ω ≠ 0
      // The straight-line branch won't fire (|ω| > 1e-6)
      // Arc: R = 0 → Δx = 0×(...) = 0, Δy = 0×(...) = 0
      expect(after.x).toBeCloseTo(1000, 3);
      expect(after.y).toBeCloseTo(1000, 3);
    });

    test("differential speed → arc motion with correct radius", () => {
      // Left=400, Right=200 → v=(400+200)/2=300, ω=(400−200)/120=+1.667
      // R = v/ω = 300/1.667 = +180 mm  (turns RIGHT, vL > vR)
      const robot = makeRobot({
        heading: 0,
        leftSpeed: velocityToPwm(400),
        rightSpeed: velocityToPwm(200),
        actualLeftV: 400,
        actualRightV: 200,
        isMoving: true,
        x: 1000,
        y: 1000,
      });
      const v = (400 + 200) / 2;
      const omega = (400 - 200) / WHEEL_BASE;
      const R = v / omega;
      expect(v).toBe(300);
      expect(omega).toBeCloseTo(1.6667, 3);
      expect(R).toBeCloseTo(180, 1);

      const dt = 0.01;
      const theta0 = 0;
      const theta1 = theta0 + omega * dt;
      const expectedDx = R * (Math.cos(theta0) - Math.cos(theta1));
      const expectedDy = -(R * (Math.sin(theta1) - Math.sin(theta0)));

      const after = stepNoCollision(robot, dt);
      expect(after.x - 1000).toBeCloseTo(expectedDx, 3);
      expect(after.y - 1000).toBeCloseTo(expectedDy, 3);
    });

    test("360° rotation time: ω=2V/L, T=2π/|ω|", () => {
      // At V=325 mm/s (half top speed), pure rotation:
      // ω = 2×325/120 = 5.417 rad/s
      // Full rotation time = 2π/5.417 = 1.16 s
      const V = 325;
      const omega = (2 * V) / WHEEL_BASE;
      const fullRotationTime = (2 * Math.PI) / omega;
      expect(omega).toBeCloseTo(5.4167, 2);
      expect(fullRotationTime).toBeCloseTo(1.1597, 2);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  5. FULL INTEGRATION: MANUAL CALCULATION vs SIMULATOR
  // ─────────────────────────────────────────────────────────────────

  describe("full integration: manual math vs simulator", () => {
    test("drive forward from rest for 0.5s at PWM=200, heading=0", () => {
      const pwm = 200;
      const dt = 0.001; // 1ms steps for precision
      const totalSteps = 500; // 0.5s

      // Manually calculate
      const manual = simulateManually(1000, 1000, 0, pwm, pwm, dt, totalSteps);

      // Run through Simulator
      let robot = makeRobot({
        heading: 0,
        leftSpeed: pwm,
        rightSpeed: pwm,
        isMoving: true,
        actualLeftV: 0,
        actualRightV: 0,
        x: 1000,
        y: 1000,
      });
      for (let i = 0; i < totalSteps; i++) {
        robot = stepNoCollision(robot, dt);
      }

      expect(robot.x).toBeCloseTo(manual.x, 1);
      expect(robot.y).toBeCloseTo(manual.y, 1);
      expect(robot.heading).toBeCloseTo(manual.heading, 3);
      expect(robot.actualLeftV).toBeCloseTo(manual.actualLeftV, 3);
      expect(robot.actualRightV).toBeCloseTo(manual.actualRightV, 3);
    });

    test("drive forward from rest for 0.5s at PWM=200, heading=90", () => {
      const pwm = 200;
      const dt = 0.001;
      const totalSteps = 500;

      const manual = simulateManually(1000, 1000, 90, pwm, pwm, dt, totalSteps);

      let robot = makeRobot({
        heading: 90,
        leftSpeed: pwm,
        rightSpeed: pwm,
        isMoving: true,
        actualLeftV: 0,
        actualRightV: 0,
        x: 1000,
        y: 1000,
      });
      for (let i = 0; i < totalSteps; i++) {
        robot = stepNoCollision(robot, dt);
      }

      expect(robot.x).toBeCloseTo(manual.x, 1);
      expect(robot.y).toBeCloseTo(manual.y, 1);
    });

    test("turning arc: left=200, right=150 for 1s", () => {
      const dt = 0.001;
      const totalSteps = 1000;

      const manual = simulateManually(1000, 1000, 0, 200, 150, dt, totalSteps);

      let robot = makeRobot({
        heading: 0,
        leftSpeed: 200,
        rightSpeed: 150,
        isMoving: true,
        actualLeftV: 0,
        actualRightV: 0,
        x: 1000,
        y: 1000,
      });
      for (let i = 0; i < totalSteps; i++) {
        robot = stepNoCollision(robot, dt);
      }

      expect(robot.x).toBeCloseTo(manual.x, 0);
      expect(robot.y).toBeCloseTo(manual.y, 0);
      expect(robot.heading).toBeCloseTo(manual.heading, 1);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  6. DISTANCE CALCULATIONS (key for challenges)
  // ─────────────────────────────────────────────────────────────────

  describe("exact distance calculations", () => {
    test("at full speed (650mm/s), in 1s travel exactly 650mm", () => {
      let robot = makeRobot({
        heading: 0,
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        actualLeftV: TOP_SPEED,
        actualRightV: TOP_SPEED,
        x: 1000,
        y: 1200,
      });
      const startY = robot.y;

      // 1000 steps × 0.001s = 1s
      for (let i = 0; i < 1000; i++) {
        robot = stepNoCollision(robot, 0.001);
      }

      const distance = Math.sqrt(
        (robot.x - 1000) ** 2 + (robot.y - startY) ** 2,
      );
      expect(distance).toBeCloseTo(650, 0);
    });

    test("at half PWM effective speed, distance is proportional", () => {
      // PWM = 160: velocity = ((160−64)/191) × 650 = 326.70 mm/s
      const targetV = ((160 - DEAD_ZONE) / LIVE_RANGE) * TOP_SPEED;
      let robot = makeRobot({
        heading: 90,
        leftSpeed: 160,
        rightSpeed: 160,
        isMoving: true,
        actualLeftV: targetV,
        actualRightV: targetV,
        x: 500,
        y: 1000,
      });
      const startX = robot.x;

      for (let i = 0; i < 1000; i++) {
        robot = stepNoCollision(robot, 0.001);
      }

      const distance = Math.abs(robot.x - startX);
      expect(distance).toBeCloseTo(targetV, 0); // 326.7mm in 1s
    });

    test("acceleration distance from rest: d = ½at² until target reached, then v×t_remaining", () => {
      // PWM=255 → target=650, accel=1750
      // Time to reach 650: t_ramp = 650/1750 = 0.3714s
      // Distance during ramp: d = ½ × 1750 × 0.3714² = ½ × 1750 × 0.1379 = 120.71mm
      // Remaining time at full speed: 1.0 − 0.3714 = 0.6286s
      // Distance at full speed: 650 × 0.6286 = 408.57mm
      // Total: 120.71 + 408.57 = 529.28mm
      const tRamp = TOP_SPEED / ACCEL;
      const dRamp = 0.5 * ACCEL * tRamp * tRamp;
      const tCruise = 1.0 - tRamp;
      const dCruise = TOP_SPEED * tCruise;
      const totalExpected = dRamp + dCruise;

      expect(tRamp).toBeCloseTo(0.37143, 3);
      expect(dRamp).toBeCloseTo(120.714, 0);
      expect(totalExpected).toBeCloseTo(529.286, 0);

      let robot = makeRobot({
        heading: 0,
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        actualLeftV: 0,
        actualRightV: 0,
        x: 1000,
        y: 1500,
      });
      const startY = robot.y;

      for (let i = 0; i < 10000; i++) {
        robot = stepNoCollision(robot, 0.0001); // 0.1ms steps, 10000 = 1s
      }

      const distance = Math.abs(robot.y - startY);
      expect(distance).toBeCloseTo(totalExpected, 0);
    });

    test("1500mm from rest at full PWM: calculate exact time, assert exact distance", () => {
      // ── Hand calculation from real-world constants ──────────────
      //
      //   top speed  V = 650 mm/s
      //   accel      a = 1750 mm/s²
      //
      //   Phase 1 — accelerate from 0 to V:
      //     t_ramp = V / a             = 650 / 1750         = 13/35 s
      //     d_ramp = ½ · a · t_ramp²   = V² / (2a)         = 422500 / 3500
      //            = 120.714285… mm
      //
      //   Phase 2 — cruise at V for the remaining distance:
      //     d_cruise = 1500 − d_ramp   = 1500 − 120.714…   = 1379.2857… mm
      //     t_cruise = d_cruise / V    = 1379.2857… / 650   = 2.12197… s
      //
      //   Total time:
      //     t_total = t_ramp + t_cruise = 0.37143… + 2.12197… = 2.49340… s
      //
      //   If the simulator is correct it moves EXACTLY 1500mm in that time.
      // ────────────────────────────────────────────────────────────

      const TARGET_DIST = 1500; // mm

      const tRamp = TOP_SPEED / ACCEL; // 0.37142857…
      const dRamp = (TOP_SPEED * TOP_SPEED) / (2 * ACCEL); // 120.71428…
      const dCruise = TARGET_DIST - dRamp; // 1379.2857…
      const tCruise = dCruise / TOP_SPEED; // 2.12197…
      const tTotal = tRamp + tCruise; // 2.49340…

      // Verify the hand-calc intermediate values
      expect(tRamp).toBeCloseTo(13 / 35, 10);
      expect(dRamp).toBeCloseTo(120.7143, 2);
      expect(tTotal).toBeCloseTo(2.4934, 3);

      // ── Run the simulator for exactly tTotal seconds ───────────
      // Use 0.1 ms timestep for high accuracy (24934 steps)
      const DT = 0.0001;
      const steps = Math.round(tTotal / DT);

      let robot = makeRobot({
        heading: 0,
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        actualLeftV: 0,
        actualRightV: 0,
        x: 1000,
        y: 1800,
      });
      for (let i = 0; i < steps; i++) {
        robot = stepNoCollision(robot, DT);
      }

      const distanceTravelled = Math.abs(robot.y - 1800);
      expect(distanceTravelled).toBeCloseTo(TARGET_DIST, 0);

      // Must have reached full speed
      expect(robot.actualLeftV).toBeCloseTo(TOP_SPEED, 1);
      // Must still be heading straight up
      expect(robot.heading).toBeCloseTo(0, 5);
      // No X drift
      expect(robot.x).toBeCloseTo(1000, 3);
    });

    test("1500mm in all 4 cardinal directions", () => {
      const TARGET_DIST = 1500;
      const tRamp = TOP_SPEED / ACCEL;
      const dRamp = (TOP_SPEED * TOP_SPEED) / (2 * ACCEL);
      const tTotal = tRamp + (TARGET_DIST - dRamp) / TOP_SPEED;
      const DT = 0.0001;
      const steps = Math.round(tTotal / DT);

      // heading=0 → −Y,  heading=90 → +X,  heading=180 → +Y,  heading=270 → −X
      // Start positions give 1700mm+ clearance in direction of travel (arena boundary at 75)
      const cases = [
        { heading: 0, sx: 1000, sy: 1800, expectDx: 0, expectDy: -TARGET_DIST },
        { heading: 90, sx: 200, sy: 1000, expectDx: +TARGET_DIST, expectDy: 0 },
        {
          heading: 180,
          sx: 1000,
          sy: 200,
          expectDx: 0,
          expectDy: +TARGET_DIST,
        },
        {
          heading: 270,
          sx: 1800,
          sy: 1000,
          expectDx: -TARGET_DIST,
          expectDy: 0,
        },
      ];

      for (const { heading, sx, sy, expectDx, expectDy } of cases) {
        let robot = makeRobot({
          heading,
          leftSpeed: 255,
          rightSpeed: 255,
          isMoving: true,
          actualLeftV: 0,
          actualRightV: 0,
          x: sx,
          y: sy,
        });
        for (let i = 0; i < steps; i++) {
          robot = stepNoCollision(robot, DT);
        }
        const dx = robot.x - sx;
        const dy = robot.y - sy;
        expect(dx).toBeCloseTo(expectDx, 0);
        expect(dy).toBeCloseTo(expectDy, 0);
      }
    });

    test("braking distance from full speed: d = V²/(2·decel) = 120.71mm", () => {
      // ── Robot at full speed, PWM set to 0 — how far until it stops? ──
      //   d_brake = V² / (2 · decel) = 650² / (2 × 1750) = 120.714… mm
      //   t_brake = V / decel = 650 / 1750 = 0.37143… s

      const dBrake = (TOP_SPEED * TOP_SPEED) / (2 * DECEL);
      const tBrake = TOP_SPEED / DECEL;
      expect(dBrake).toBeCloseTo(120.7143, 2);
      expect(tBrake).toBeCloseTo(0.37143, 3);

      const DT = 0.0001;
      const steps = Math.round(tBrake / DT);

      let robot = makeRobot({
        heading: 90,
        leftSpeed: 0,
        rightSpeed: 0,
        isMoving: true,
        actualLeftV: TOP_SPEED,
        actualRightV: TOP_SPEED,
        x: 500,
        y: 1000,
      });
      for (let i = 0; i < steps; i++) {
        robot = stepNoCollision(robot, DT);
      }

      const dist = Math.abs(robot.x - 500);
      expect(dist).toBeCloseTo(dBrake, 0);
      // Should be stopped (or nearly)
      expect(Math.abs(robot.actualLeftV)).toBeLessThan(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  7. ULTRASONIC SENSOR GEOMETRY
  // ─────────────────────────────────────────────────────────────────

  describe("ultrasonic sensor distance", () => {
    test("front sensor: robot at centre facing up → distance to top wall", () => {
      // Robot at (1000, 1000), heading=0, front sensor at (1000, 1000−75)
      // Distance to top wall (y=0) = 1000 − 75 = 925 mm
      // With noise ±2mm, result should be ~925
      const robot = makeRobot({ x: 1000, y: 1000, heading: 0 });
      const readings = [];
      for (let i = 0; i < 100; i++) {
        readings.push(Sim.simulateUltrasonic(robot));
      }
      const avg = readings.reduce((a, b) => a + b, 0) / readings.length;
      expect(avg).toBeCloseTo(925, 0); // within rounding
      // All readings within noise bounds
      readings.forEach((r) => {
        expect(r).toBeGreaterThanOrEqual(923);
        expect(r).toBeLessThanOrEqual(927);
      });
    });

    test("front sensor: robot facing right → distance to right wall", () => {
      // Robot at (1000, 1000), heading=90
      // Front sensor at (1000+75, 1000)
      // Distance to right wall (x=2000) = 2000 − 1075 = 925 mm
      const robot = makeRobot({ x: 1000, y: 1000, heading: 90 });
      const readings = [];
      for (let i = 0; i < 100; i++) {
        readings.push(Sim.simulateUltrasonic(robot));
      }
      const avg = readings.reduce((a, b) => a + b, 0) / readings.length;
      expect(avg).toBeCloseTo(925, 0);
    });

    test("side sensor (left): robot heading=0 → distance to left wall", () => {
      Sim.setSideSensorSide("left");
      // heading=0: left direction = (−cos0, −sin0) = (−1, 0)
      // Sensor at (1000 − 60, 1000) = (940, 1000)
      // Distance to left wall (x=0) = 940 mm
      const robot = makeRobot({ x: 1000, y: 1000, heading: 0 });
      const readings = [];
      for (let i = 0; i < 100; i++) {
        readings.push(Sim.simulateUltrasonicSide(robot));
      }
      const avg = readings.reduce((a, b) => a + b, 0) / readings.length;
      expect(avg).toBeCloseTo(940, 0);
    });

    test("side sensor (right): robot heading=0 → distance to right wall", () => {
      Sim.setSideSensorSide("right");
      // heading=0: right direction = (cos0, sin0) = (1, 0)
      // Sensor at (1000 + 60, 1000) = (1060, 1000)
      // Distance to right wall (x=2000) = 940 mm
      const robot = makeRobot({ x: 1000, y: 1000, heading: 0 });
      const readings = [];
      for (let i = 0; i < 100; i++) {
        readings.push(Sim.simulateUltrasonicSide(robot));
      }
      const avg = readings.reduce((a, b) => a + b, 0) / readings.length;
      expect(avg).toBeCloseTo(940, 0);
    });

    test("sensor returns -1 when too close (< 20mm)", () => {
      // Place robot very close to top wall
      const robot = makeRobot({ x: 1000, y: 85, heading: 0 });
      // Front sensor at y = 85 − 75 = 10 mm from top wall
      const d = Sim.simulateUltrasonic(robot);
      expect(d).toBe(-1);
    });

    test("sensor returns -1 when obstacle is too far (> 2000mm)", () => {
      // In a 2000mm arena there's no way to be >2000mm from a wall,
      // so this is automatically handled. Test with an obstacle-free corridor.
      // Actually the max distance in the arena is ~2000mm diagonal.
      // With robot at corner facing towards far wall = ~2000 − 75 = 1925 < 2000
      // So in this arena, readings should always be valid unless too close.
      const robot = makeRobot({ x: 1000, y: 1000, heading: 0 });
      const d = Sim.simulateUltrasonic(robot);
      expect(d).toBeGreaterThan(0);
    });

    test("front sensor detects obstacle accurately", () => {
      // Place obstacle at y=500 (wall spanning full width)
      Sim.setObstacles([{ x: 0, y: 500, width: 2000, height: 20 }]);
      // Robot at (1000, 800) heading=0, sensor at y=800−75=725
      // Distance to obstacle bottom edge at y=520? No, obstacle top at y=500.
      // Sensor fires upward (−Y). Hits obstacle at y=520 (bottom of obstacle).
      // Distance = 725 − 520 = 205 mm
      const robot = makeRobot({ x: 1000, y: 800, heading: 0 });
      const readings = [];
      for (let i = 0; i < 50; i++) {
        readings.push(Sim.simulateUltrasonic(robot));
      }
      const avg = readings.reduce((a, b) => a + b, 0) / readings.length;
      expect(avg).toBeCloseTo(205, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  8. COLLISION DETECTION
  // ─────────────────────────────────────────────────────────────────

  describe("collision detection", () => {
    test("no collision when robot is in open space", () => {
      const robot = makeRobot({ x: 1000, y: 1000, heading: 0 });
      Sim.setObstacles([{ x: 100, y: 100, width: 50, height: 50 }]);
      expect(
        Sim.checkCollision(robot, [{ x: 100, y: 100, width: 50, height: 50 }]),
      ).toBe(false);
    });

    test("collision when robot overlaps obstacle", () => {
      const robot = makeRobot({ x: 150, y: 150, heading: 0 });
      // Robot corners extend ±60 in X, ±75 in Y → x:[90,210], y:[75,225]
      const obstacles = [{ x: 80, y: 70, width: 50, height: 50 }];
      expect(Sim.checkCollision(robot, obstacles)).toBe(true);
    });

    test("step stops robot and increments collisionCount on wall hit", () => {
      Sim.setMazeWalls([{ x: 990, y: 0, width: 30, height: 2000 }]);
      const robot = makeRobot({
        heading: 90,
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        actualLeftV: TOP_SPEED,
        actualRightV: TOP_SPEED,
        x: 900,
        y: 1000,
      });
      const after = Sim.step(robot, 0.1);
      expect(after.collisionCount).toBeGreaterThanOrEqual(1);
      expect(after.leftSpeed).toBe(0);
      expect(after.rightSpeed).toBe(0);
      expect(after.isMoving).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  9. BOUNDARY CONSTRAINTS
  // ─────────────────────────────────────────────────────────────────

  describe("boundary constraints", () => {
    test("robot is clamped within arena (margin = max(60, 75) = 75)", () => {
      const margin = Math.max(ROBOT_W / 2, ROBOT_L / 2); // 75
      const clamped = Sim.applyBoundaryConstraints({ x: 0, y: 0 });
      expect(clamped.x).toBe(margin);
      expect(clamped.y).toBe(margin);
    });

    test("robot near far corner is clamped", () => {
      const margin = 75;
      const clamped = Sim.applyBoundaryConstraints({ x: 2100, y: 2100 });
      expect(clamped.x).toBe(ARENA_W - margin);
      expect(clamped.y).toBe(ARENA_H - margin);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  10. MIRROR HELPERS
  // ─────────────────────────────────────────────────────────────────

  describe("mirror helpers", () => {
    test("mirrorPose flips x and inverts heading", () => {
      const out = Sim.mirrorPose({ x: 300, y: 1700, heading: 90 });
      expect(out.x).toBe(2000 - 300);
      expect(out.y).toBe(1700);
      expect(out.heading).toBe(270);
    });

    test("mirrorPose is its own inverse", () => {
      const start = { x: 250, y: 1700, heading: 45 };
      const twice = Sim.mirrorPose(Sim.mirrorPose(start));
      expect(twice.x).toBe(start.x);
      expect(twice.y).toBe(start.y);
      expect(twice.heading).toBe(start.heading);
    });

    test("mirrorRect flips across centreline", () => {
      const out = Sim.mirrorRect({ x: 100, y: 50, width: 300, height: 200 });
      expect(out).toEqual({ x: 1600, y: 50, width: 300, height: 200 });
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  11. SIDE SENSOR SWITCHING
  // ─────────────────────────────────────────────────────────────────

  describe("side sensor switching", () => {
    test("defaults to left", () => {
      expect(Sim.getSideSensorSide()).toBe("left");
    });

    test("accepts left and right, ignores invalid", () => {
      Sim.setSideSensorSide("right");
      expect(Sim.getSideSensorSide()).toBe("right");
      Sim.setSideSensorSide("banana");
      expect(Sim.getSideSensorSide()).toBe("right");
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  12. INITIAL STATE
  // ─────────────────────────────────────────────────────────────────

  describe("initial state", () => {
    test("spawns at centre-bottom facing up", () => {
      const s = Sim.getInitialRobotState();
      expect(s.x).toBe(1000);
      expect(s.y).toBe(1800);
      expect(s.heading).toBe(0);
      expect(s.leftSpeed).toBe(0);
      expect(s.rightSpeed).toBe(0);
      expect(s.actualLeftV).toBe(0);
      expect(s.actualRightV).toBe(0);
      expect(s.isMoving).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  13. IDLE SHORT-CIRCUIT
  // ─────────────────────────────────────────────────────────────────

  describe("idle short-circuit", () => {
    test("step returns same robot when fully stationary", () => {
      const idle = makeRobot({
        x: 500,
        y: 500,
        heading: 45,
        leftSpeed: 0,
        rightSpeed: 0,
        actualLeftV: 0,
        actualRightV: 0,
        isMoving: false,
        collisionCount: 3,
      });
      const after = Sim.step(idle, 1 / 60);
      expect(after.x).toBe(500);
      expect(after.y).toBe(500);
      expect(after.collisionCount).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────────────────────────────

  function makeRobot(overrides = {}) {
    return {
      x: 1000,
      y: 1000,
      heading: 0,
      leftSpeed: 0,
      rightSpeed: 0,
      actualLeftV: 0,
      actualRightV: 0,
      isMoving: false,
      trail: [],
      collisionCount: 0,
      collisionFlashUntil: 0,
      ...overrides,
    };
  }

  /**
   * Run one step through the simulator with no obstacles, so we test
   * pure kinematics without collision interference.
   */
  function stepNoCollision(robot, dt) {
    Sim.setObstacles([]);
    Sim.setMazeWalls([]);
    return Sim.step(robot, dt);
  }
});
