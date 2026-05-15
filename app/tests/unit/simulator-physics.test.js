/**
 * Rear-Wheel-Drive Differential Drive — Physics Validation Tests
 *
 * Every test here validates the simulator math against hand-calculated
 * values.  If any test fails, the simulator does NOT match the real robot.
 *
 * Key physics facts (from RobotConfig):
 *   wheelBase      = 120 mm
 *   robotLength    = 150 mm   →  REAR_OFFSET = 75 mm (centre → rear axle)
 *   robotWidth     = 120 mm
 *   deadZonePWM    = 64
 *   maxPWM         = 255     →  activePWM = 191
 *   topSpeed       = 650 mm/s
 *   accel / decel  = 1750 mm/s²
 *   arena          = 2000 × 2000 mm
 *   ultrasonic     = 20 – 2000 mm, ±2 mm noise
 */

const fs = require("fs");
const vm = require("vm");

// ── Load RobotConfig + Simulator into an isolated sandbox ──
function loadSimulator() {
  const cfg = fs.readFileSync(__dirname + "/../../js/robot-config.js", "utf8");
  const sim = fs.readFileSync(__dirname + "/../../js/simulator.js", "utf8");
  const sb = {
    Math,
    Date,
    console,
    Object,
    Infinity,
    Array,
    Error,
    DebugPanel: {
      info: function () {},
      warning: function () {},
      error: function () {},
    },
  };
  vm.createContext(sb);
  vm.runInContext(
    cfg +
      "\n" +
      sim +
      "\n;this.Simulator=Simulator;this.RobotConfig=RobotConfig;",
    sb,
  );
  return sb;
}

const sandbox = loadSimulator();
const S = sandbox.Simulator;

// ── Helpers ──
function makeRobot(overrides) {
  return Object.assign(
    {
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
    },
    overrides || {},
  );
}

function stepN(robot, n, dt) {
  S.clearObstacles();
  var r = robot;
  for (var i = 0; i < n; i++) r = S.step(r, dt);
  return r;
}

function expectedVelocity(pwm) {
  if (pwm === 0) return 0;
  var sign = pwm > 0 ? 1 : -1;
  var abs = Math.abs(pwm);
  if (abs <= 64) return 0;
  return sign * ((abs - 64) / 191) * 650;
}

// ═══════════════════════════════════════════════════════════════════
//  §1  PWM → Velocity mapping
// ═══════════════════════════════════════════════════════════════════
describe("§1 PWM → Velocity", () => {
  test("PWM 0 → 0", () => {
    expect(S.pwmToVelocity(0)).toBe(0);
  });
  test("PWM 64 (dead zone) → 0", () => {
    expect(S.pwmToVelocity(64)).toBe(0);
  });
  test("PWM 255 → 650", () => {
    expect(S.pwmToVelocity(255)).toBeCloseTo(650, 5);
  });
  test("PWM 65 → first usable step", () => {
    expect(S.pwmToVelocity(65)).toBeCloseTo((1 / 191) * 650, 2);
  });
  test("PWM −200 → negative", () => {
    expect(S.pwmToVelocity(-200)).toBeCloseTo(-(136 / 191) * 650, 2);
  });
  test("PWM 150 → ~292.7", () => {
    expect(S.pwmToVelocity(150)).toBeCloseTo(292.67, 0);
  });
  test("Symmetry", () => {
    for (var p = 0; p <= 255; p += 17) {
      expect(Math.abs(S.pwmToVelocity(-p))).toBeCloseTo(
        Math.abs(S.pwmToVelocity(p)),
        10,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §2  Velocity ramping
// ═══════════════════════════════════════════════════════════════════
describe("§2 Velocity ramping", () => {
  test("Accelerating caps at ACCEL * dt", () => {
    expect(S.rampVelocity(0, 650, 0.1)).toBeCloseTo(175, 1);
  });
  test("Decelerating caps at DECEL * dt", () => {
    expect(S.rampVelocity(650, 0, 0.1)).toBeCloseTo(475, 1);
  });
  test("Small diff snaps to target", () => {
    expect(S.rampVelocity(649.995, 650, 0.1)).toBe(650);
  });
  test("Reverse acceleration", () => {
    expect(S.rampVelocity(0, -650, 0.1)).toBeCloseTo(-175, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §3  Straight-line motion (4 cardinal directions)
// ═══════════════════════════════════════════════════════════════════
describe("§3 Straight-line motion", () => {
  test("Heading 0° (up): y decreases", () => {
    var v = expectedVelocity(200);
    var r = makeRobot({
      x: 1000,
      y: 1000,
      heading: 0,
      leftSpeed: 200,
      rightSpeed: 200,
      actualLeftV: v,
      actualRightV: v,
      isMoving: true,
    });
    r = stepN(r, 1, 1.0);
    expect(r.x).toBeCloseTo(1000, 1);
    expect(r.y).toBeCloseTo(1000 - v, 1);
  });

  test("Heading 90° (right): x increases", () => {
    var v = expectedVelocity(200);
    var r = makeRobot({
      x: 1000,
      y: 1000,
      heading: 90,
      leftSpeed: 200,
      rightSpeed: 200,
      actualLeftV: v,
      actualRightV: v,
      isMoving: true,
    });
    r = stepN(r, 1, 1.0);
    expect(r.x).toBeCloseTo(1000 + v, 1);
    expect(r.y).toBeCloseTo(1000, 1);
  });

  test("Heading 180° (down): y increases", () => {
    var v = expectedVelocity(200);
    var r = makeRobot({
      x: 1000,
      y: 500,
      heading: 180,
      leftSpeed: 200,
      rightSpeed: 200,
      actualLeftV: v,
      actualRightV: v,
      isMoving: true,
    });
    r = stepN(r, 1, 1.0);
    expect(r.x).toBeCloseTo(1000, 1);
    expect(r.y).toBeCloseTo(500 + v, 1);
  });

  test("Heading 270° (left): x decreases", () => {
    var v = expectedVelocity(200);
    var r = makeRobot({
      x: 1000,
      y: 1000,
      heading: 270,
      leftSpeed: 200,
      rightSpeed: 200,
      actualLeftV: v,
      actualRightV: v,
      isMoving: true,
    });
    r = stepN(r, 1, 1.0);
    expect(r.x).toBeCloseTo(1000 - v, 1);
    expect(r.y).toBeCloseTo(1000, 1);
  });

  test("1s at PWM 255 → exactly 650 mm", () => {
    var r = makeRobot({
      x: 1000,
      y: 1800,
      heading: 0,
      leftSpeed: 255,
      rightSpeed: 255,
      actualLeftV: 650,
      actualRightV: 650,
      isMoving: true,
    });
    r = stepN(r, 1, 1.0);
    expect(r.y).toBeCloseTo(1800 - 650, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §4  REAR-WHEEL-DRIVE: in-place pivot
// ═══════════════════════════════════════════════════════════════════
describe("§4 RWD in-place pivot", () => {
  test("rotate_right: heading increases", () => {
    var vL = expectedVelocity(180);
    var r = makeRobot({
      leftSpeed: 180,
      rightSpeed: -180,
      actualLeftV: vL,
      actualRightV: -vL,
      isMoving: true,
    });
    r = stepN(r, 1, 0.05);
    expect(r.heading).toBeGreaterThan(0);
  });

  test("rotate_left: heading decreases", () => {
    var vL = expectedVelocity(180);
    var r = makeRobot({
      leftSpeed: -180,
      rightSpeed: 180,
      actualLeftV: -vL,
      actualRightV: vL,
      isMoving: true,
    });
    r = stepN(r, 1, 0.05);
    expect(r.heading).toBeLessThan(0);
  });

  test("Rear axle stays fixed during 90° pivot", () => {
    var vL = expectedVelocity(180);
    var omega = (vL - -vL) / 120;
    var t90 = Math.PI / 2 / omega;

    var r = makeRobot({
      x: 1000,
      y: 1000,
      heading: 0,
      leftSpeed: 180,
      rightSpeed: -180,
      actualLeftV: vL,
      actualRightV: -vL,
      isMoving: true,
    });

    var rearBefore = { x: 1000, y: 1075 };
    var nSteps = Math.round(t90 / 0.001);
    r = stepN(r, nSteps, 0.001);

    var thetaN = (r.heading * Math.PI) / 180;
    var rearAfter = {
      x: r.x - 75 * Math.sin(thetaN),
      y: r.y + 75 * Math.cos(thetaN),
    };

    expect(rearAfter.x).toBeCloseTo(rearBefore.x, 0);
    expect(rearAfter.y).toBeCloseTo(rearBefore.y, 0);
  });

  test("Centre at (1075, 1075) after 90° CW pivot from (1000,1000,0°)", () => {
    var vL = expectedVelocity(180);
    var omega = (vL - -vL) / 120;
    var t90 = Math.PI / 2 / omega;

    var r = makeRobot({
      x: 1000,
      y: 1000,
      heading: 0,
      leftSpeed: 180,
      rightSpeed: -180,
      actualLeftV: vL,
      actualRightV: -vL,
      isMoving: true,
    });

    var nSteps = Math.round(t90 / 0.001);
    r = stepN(r, nSteps, 0.001);

    expect(r.heading).toBeCloseTo(90, 0);
    expect(r.x).toBeCloseTo(1075, 0);
    expect(r.y).toBeCloseTo(1075, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §5  Turning arcs
// ═══════════════════════════════════════════════════════════════════
describe("§5 Turning arcs", () => {
  test("Left faster → turns right", () => {
    var vL = expectedVelocity(200);
    var vR = expectedVelocity(150);
    var r = makeRobot({
      x: 1000,
      y: 1000,
      heading: 0,
      leftSpeed: 200,
      rightSpeed: 150,
      actualLeftV: vL,
      actualRightV: vR,
      isMoving: true,
    });
    r = stepN(r, 1, 0.1);
    expect(r.heading).toBeGreaterThan(0);
    expect(r.y).toBeLessThan(1000);
  });

  test("Right faster → turns left", () => {
    var vL = expectedVelocity(150);
    var vR = expectedVelocity(200);
    var r = makeRobot({
      x: 1000,
      y: 1000,
      heading: 0,
      leftSpeed: 150,
      rightSpeed: 200,
      actualLeftV: vL,
      actualRightV: vR,
      isMoving: true,
    });
    r = stepN(r, 1, 0.1);
    expect(r.heading).toBeLessThan(0);
    expect(r.y).toBeLessThan(1000);
  });

  test("Front swings more than rear during turn (RWD signature)", () => {
    var vL = expectedVelocity(200);
    var vR = expectedVelocity(180);
    var r0 = makeRobot({
      x: 1000,
      y: 1000,
      heading: 0,
      leftSpeed: 200,
      rightSpeed: 180,
      actualLeftV: vL,
      actualRightV: vR,
      isMoving: true,
    });

    var r1 = stepN(r0, 1, 0.05);
    var theta1 = (r1.heading * Math.PI) / 180;

    var rear0x = 1000;
    var rear1x = r1.x - 75 * Math.sin(theta1);
    var front0x = 1000;
    var front1x = r1.x + 75 * Math.sin(theta1);

    expect(Math.abs(front1x - front0x)).toBeGreaterThan(
      Math.abs(rear1x - rear0x),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §6  Turn timing with acceleration ramp
// ═══════════════════════════════════════════════════════════════════
describe("§6 Turn timing with ramp", () => {
  test("90° in ~0.35s at TURN_SPEED=180", () => {
    var r = makeRobot({
      x: 1000,
      y: 1000,
      heading: 0,
      leftSpeed: 180,
      rightSpeed: -180,
      actualLeftV: 0,
      actualRightV: 0,
      isMoving: true,
    });
    r = stepN(r, 350, 0.001);
    expect(Math.abs(r.heading - 90)).toBeLessThan(8);
  });

  test("180° in ~0.60s at TURN_SPEED=180", () => {
    var r = makeRobot({
      x: 1000,
      y: 1000,
      heading: 0,
      leftSpeed: 180,
      rightSpeed: -180,
      actualLeftV: 0,
      actualRightV: 0,
      isMoving: true,
    });
    r = stepN(r, 600, 0.001);
    expect(Math.abs(r.heading - 180)).toBeLessThan(15);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §7  Exact distance (pre-ramped, 1 second)
// ═══════════════════════════════════════════════════════════════════
describe("§7 Exact distance 1s", () => {
  var v = expectedVelocity(200);

  test("Up", () => {
    var r = makeRobot({
      x: 1000,
      y: 1800,
      heading: 0,
      leftSpeed: 200,
      rightSpeed: 200,
      actualLeftV: v,
      actualRightV: v,
      isMoving: true,
    });
    r = stepN(r, 100, 0.01);
    expect(r.y).toBeCloseTo(1800 - v, 0);
  });

  test("Right", () => {
    var r = makeRobot({
      x: 200,
      y: 1000,
      heading: 90,
      leftSpeed: 200,
      rightSpeed: 200,
      actualLeftV: v,
      actualRightV: v,
      isMoving: true,
    });
    r = stepN(r, 100, 0.01);
    expect(r.x).toBeCloseTo(200 + v, 0);
  });

  test("Down", () => {
    var r = makeRobot({
      x: 1000,
      y: 200,
      heading: 180,
      leftSpeed: 200,
      rightSpeed: 200,
      actualLeftV: v,
      actualRightV: v,
      isMoving: true,
    });
    r = stepN(r, 100, 0.01);
    expect(r.y).toBeCloseTo(200 + v, 0);
  });

  test("Left", () => {
    var r = makeRobot({
      x: 1800,
      y: 1000,
      heading: 270,
      leftSpeed: 200,
      rightSpeed: 200,
      actualLeftV: v,
      actualRightV: v,
      isMoving: true,
    });
    r = stepN(r, 100, 0.01);
    expect(r.x).toBeCloseTo(1800 - v, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §8  Ultrasonic sensors
// ═══════════════════════════════════════════════════════════════════
describe("§8 Ultrasonic", () => {
  beforeEach(() => {
    S.clearObstacles();
    S.setSideSensorSide("left");
  });

  test("Front: centre facing up → ~925 to top wall", () => {
    var r = makeRobot({ x: 1000, y: 1000, heading: 0 });
    var d = S.simulateUltrasonic(r);
    expect(d).toBeGreaterThanOrEqual(923);
    expect(d).toBeLessThanOrEqual(927);
  });

  test("Front: facing right → ~925 to right wall", () => {
    var r = makeRobot({ x: 1000, y: 1000, heading: 90 });
    var d = S.simulateUltrasonic(r);
    expect(d).toBeGreaterThanOrEqual(923);
    expect(d).toBeLessThanOrEqual(927);
  });

  test("Side left: heading 0 → ~940 to left wall", () => {
    var r = makeRobot({ x: 1000, y: 1000, heading: 0 });
    var d = S.simulateUltrasonicSide(r);
    expect(d).toBeGreaterThanOrEqual(938);
    expect(d).toBeLessThanOrEqual(942);
  });

  test("Side right: heading 0 → ~940 to right wall", () => {
    S.setSideSensorSide("right");
    var r = makeRobot({ x: 1000, y: 1000, heading: 0 });
    var d = S.simulateUltrasonicSide(r);
    expect(d).toBeGreaterThanOrEqual(938);
    expect(d).toBeLessThanOrEqual(942);
  });

  test("Side detects maze wall", () => {
    S.setMazeWalls([{ x: 500, y: 0, width: 30, height: 2000 }]);
    var r = makeRobot({ x: 300, y: 1000, heading: 0 });
    var d = S.simulateUltrasonicSide(r);
    expect(d).toBeGreaterThanOrEqual(238);
    expect(d).toBeLessThanOrEqual(242);
  });

  test("Returns −1 when < ULTRASONIC_MIN", () => {
    var r = makeRobot({ x: 1000, y: 85, heading: 0 });
    expect(S.simulateUltrasonic(r)).toBe(-1);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §9  Collision
// ═══════════════════════════════════════════════════════════════════
describe("§9 Collision", () => {
  test("No collision when clear", () => {
    S.setMazeWalls([{ x: 500, y: 0, width: 30, height: 2000 }]);
    var r = makeRobot({ x: 300, y: 1000, heading: 0 });
    expect(S.checkCollision(r).collisionCount).toBe(0);
  });

  test("Collision when corner inside wall", () => {
    S.setMazeWalls([{ x: 500, y: 0, width: 30, height: 2000 }]);
    var r = makeRobot({ x: 445, y: 1000, heading: 0, collisionCount: 0 });
    expect(S.checkCollision(r).collisionCount).toBe(1);
  });

  test("Corners at heading 0", () => {
    var r = makeRobot({ x: 1000, y: 1000, heading: 0 });
    var c = S.getRobotCorners(r);
    expect(c[0].x).toBeCloseTo(940, 1); // front-left
    expect(c[0].y).toBeCloseTo(925, 1);
    expect(c[2].x).toBeCloseTo(1060, 1); // rear-right
    expect(c[2].y).toBeCloseTo(1075, 1);
  });

  // ── Regression: robot must not drive THROUGH walls ──
  // Drive the robot at full speed straight into a horizontal wall and
  // verify that after many simulation steps the body has not crossed
  // to the far side of the wall. Previously checkCollision only flashed
  // and incremented a counter without restoring position, so the robot
  // would pass through walls.
  test("Robot does not pass through a wall when driving forward", () => {
    // Horizontal wall spanning the arena at y = 500..530.
    S.clearObstacles();
    S.setMazeWalls([{ x: 0, y: 500, width: 2000, height: 30 }]);
    // Heading 0 = facing -Y (up). Start below the wall.
    var r = makeRobot({
      x: 1000,
      y: 900,
      heading: 0,
      leftSpeed: 255,
      rightSpeed: 255,
      isMoving: true,
    });
    for (var i = 0; i < 400; i++) {
      r = S.step(r, 0.05); // 20 simulated seconds at full PWM
    }
    // The front-most edge of the body is at robot.y - ROBOT_LENGTH/2 (75).
    // It must remain on the near (high-y) side of the wall's far edge (530).
    expect(r.y - 75).toBeGreaterThanOrEqual(530);
    expect(r.collisionCount).toBeGreaterThan(0);
  });

  test("Robot does not pass through a wall when reversing", () => {
    S.clearObstacles();
    S.setMazeWalls([{ x: 0, y: 1500, width: 2000, height: 30 }]);
    // Heading 0, reversing → moves in +Y direction.
    var r = makeRobot({
      x: 1000,
      y: 1100,
      heading: 0,
      leftSpeed: -255,
      rightSpeed: -255,
      isMoving: true,
    });
    for (var i = 0; i < 400; i++) {
      r = S.step(r, 0.05);
    }
    // Rear-most edge of the body is at robot.y + ROBOT_LENGTH/2 (75).
    expect(r.y + 75).toBeLessThanOrEqual(1500);
    expect(r.collisionCount).toBeGreaterThan(0);
  });

  // ── Regression: substepping prevents tunneling through thin walls ──
  // Without substepping a single frame can move the robot further than
  // the wall's thickness; if all four body corners land beyond the wall
  // the discrete corner-in-rect check misses the collision.
  test("Robot does not tunnel through a 1 mm-thick wall at full speed", () => {
    S.clearObstacles();
    S.setMazeWalls([{ x: 0, y: 500, width: 2000, height: 1 }]);
    var r = makeRobot({
      x: 1000,
      y: 900,
      heading: 0,
      leftSpeed: 255,
      rightSpeed: 255,
      isMoving: true,
    });
    for (var i = 0; i < 200; i++) {
      r = S.step(r, 0.05);
    }
    expect(r.y - 75).toBeGreaterThanOrEqual(500);
    expect(r.collisionCount).toBeGreaterThan(0);
  });

  test("Robot does not tunnel through a thin wall when approaching at an angle", () => {
    // Vertical 5 mm thick wall — the robot drives diagonally toward it.
    S.clearObstacles();
    S.setMazeWalls([{ x: 800, y: 0, width: 5, height: 2000 }]);
    // Heading 45° = forward vector (sin45, -cos45) i.e. up-and-right.
    var r = makeRobot({
      x: 400,
      y: 1500,
      heading: 45,
      leftSpeed: 255,
      rightSpeed: 255,
      isMoving: true,
    });
    for (var i = 0; i < 400; i++) {
      r = S.step(r, 0.05);
    }
    // The right-most corner is at x = cx + hw·cos(h) - (-hl)·sin(h) at
    // heading=45 ≈ cx + 60·0.707 + 75·0.707 ≈ cx + 95.5. We require the
    // body to stay on the left (near) side of the wall: cx + 95.5 ≤ 800.
    expect(r.x + 95.5).toBeLessThanOrEqual(800 + 1);
    expect(r.collisionCount).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §10  Boundary constraints
// ═══════════════════════════════════════════════════════════════════
describe("§10 Boundary", () => {
  test("Clamps with 75mm margin", () => {
    var r = S.applyBoundaryConstraints(makeRobot({ x: 10, y: 10 }));
    expect(r.x).toBe(75);
    expect(r.y).toBe(75);
  });
  test("No change when inside", () => {
    var r = makeRobot({ x: 500, y: 500 });
    expect(S.applyBoundaryConstraints(r)).toBe(r);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §11  Mirrors
// ═══════════════════════════════════════════════════════════════════
describe("§11 Mirror", () => {
  test("mirrorPose", () => {
    var m = S.mirrorPose(makeRobot({ x: 300, heading: 10 }));
    expect(m.x).toBe(1700);
    expect(m.heading).toBe(-10);
  });
  test("mirrorRect", () => {
    var m = S.mirrorRect({ x: 100, y: 200, width: 50, height: 100 });
    expect(m.x).toBe(1850);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §12  Side sensor side
// ═══════════════════════════════════════════════════════════════════
describe("§12 SideSensorSide", () => {
  test("round-trip", () => {
    S.setSideSensorSide("right");
    expect(S.getSideSensorSide()).toBe("right");
    S.setSideSensorSide("left");
    expect(S.getSideSensorSide()).toBe("left");
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §13  Idle
// ═══════════════════════════════════════════════════════════════════
describe("§13 Idle", () => {
  test("Initial state", () => {
    var r = S.getInitialRobotState();
    expect(r.x).toBe(1000);
    expect(r.y).toBe(1000);
    expect(r.heading).toBe(0);
    expect(r.isMoving).toBe(false);
  });
  test("Idle robot stays put", () => {
    var r = stepN(makeRobot({ x: 500, y: 500, heading: 45 }), 10, 0.05);
    expect(r.x).toBe(500);
    expect(r.y).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §14  PD wall-following integration test
// ═══════════════════════════════════════════════════════════════════
describe("§14 PD wall-follow in straight corridor", () => {
  test("Converges to target distance and reaches exit", () => {
    S.setMazeWalls([
      { x: 500, y: 0, width: 30, height: 2000 },
      { x: 1470, y: 0, width: 30, height: 2000 },
    ]);
    S.setSideSensorSide("left");

    var r = makeRobot({
      x: 300,
      y: 1700,
      heading: 0,
      isMoving: true,
    });

    var BASE = 200,
      TARGET = 200,
      MAX_STEER = 70;
    var Kp = 0.35,
      Kd = 0.4;
    var prevError = 0,
      wallSign = -1,
      dt = 0.05;

    for (var t = 0; t < 600; t++) {
      var dist = S.simulateUltrasonicSide(r);
      if (dist === -1) {
        r.leftSpeed = BASE;
        r.rightSpeed = BASE;
      } else {
        var error = dist - TARGET;
        var steer = Kp * error + Kd * (error - prevError);
        steer = Math.max(-MAX_STEER, Math.min(MAX_STEER, steer));
        r.leftSpeed = Math.round(BASE + wallSign * steer);
        r.rightSpeed = Math.round(BASE - wallSign * steer);
        if (Math.abs(r.leftSpeed) < 120) r.leftSpeed = 0;
        if (Math.abs(r.rightSpeed) < 120) r.rightSpeed = 0;
        prevError = error;
      }
      r.isMoving = true;
      r = S.step(r, dt);
      if (r.y < 300) break;
    }

    expect(r.y).toBeLessThan(300);
    expect(r.collisionCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  §15  U-turn (180°) at a dead-end channel
//
//  Re-creates the Challenge 5/6 dead_end maze geometry: a 1200×2000
//  central block at x=400..1600, leaving a 400 mm wide channel on the
//  left (x=0..400). The robot drives up, brakes at the dead end (arena
//  top boundary at y=0), then spin-turns 180° in place.
// ═══════════════════════════════════════════════════════════════════
describe("§15 Dead-end U-turn in 400 mm channel", () => {
  function deadEndWalls() {
    return [{ x: 400, y: 0, width: 1200, height: 2000 }];
  }

  test("CONTROL: spin in open arena (no walls) reaches ~180° in 0.6 s", () => {
    S.clearObstacles();
    S.setMazeWalls([]);
    var r = makeRobot({
      x: 1000,
      y: 1000,
      heading: 0,
      leftSpeed: 180,
      rightSpeed: -180,
      isMoving: true,
    });
    for (var i = 0; i < 24; i++) r = S.step(r, 0.025);
    var change = (((r.heading - 0) % 360) + 360) % 360;
    var offBy180 = Math.abs(change - 180);
    // Free space: this MUST reach close to 180°.
    expect(offBy180).toBeLessThan(30);
    expect(r.collisionCount).toBe(0);
  });

  test("Robot can drive up the channel and stop near the dead end", () => {
    S.clearObstacles();
    S.setMazeWalls(deadEndWalls());
    var r = makeRobot({
      x: 200,
      y: 1700,
      heading: 0, // facing -Y (up)
      leftSpeed: 200,
      rightSpeed: 200,
      isMoving: true,
    });
    for (var i = 0; i < 200; i++) {
      var front = S.simulateUltrasonic(r);
      if (front !== -1 && front <= 150) {
        r.leftSpeed = 0;
        r.rightSpeed = 0;
      }
      r = S.step(r, 0.05);
    }
    // Robot should be near the top boundary, not crashed, no overlap.
    expect(r.y - 75).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeLessThan(300);
    expect(r.collisionCount).toBe(0);
    expect(r.x).toBeGreaterThan(60);
    expect(r.x).toBeLessThan(340);
  });

  test("Robot completes a 180° spin turn in place without colliding", () => {
    S.clearObstacles();
    S.setMazeWalls(deadEndWalls());
    // Place robot near the dead end, centred in the channel.
    // NOTE: rotation pivots about the rear axle (75 mm behind centre),
    // so during a 180° spin the centre legitimately swings ~150 mm.
    var r = makeRobot({
      x: 200,
      y: 200,
      heading: 0,
      leftSpeed: 180,
      rightSpeed: -180, // rotate_right: left forward, right backward
      isMoving: true,
    });
    var startHeading = r.heading;
    for (var i = 0; i < 24; i++) {
      r = S.step(r, 0.025);
    }
    var change = (((r.heading - startHeading) % 360) + 360) % 360;
    var offBy180 = Math.abs(change - 180);
    expect(offBy180).toBeLessThan(30);
    // X stays inside the 400 mm channel (walls at 0 and 400, half-width 60).
    expect(r.x).toBeGreaterThan(60);
    expect(r.x).toBeLessThan(340);
    // No collisions during the spin (the swept envelope must clear walls).
    expect(r.collisionCount).toBe(0);
  });

  test("Full drive-up-then-180-then-drive-back sequence in the channel", () => {
    S.clearObstacles();
    S.setMazeWalls(deadEndWalls());
    var r = makeRobot({
      x: 200,
      y: 1700,
      heading: 0,
      leftSpeed: 200,
      rightSpeed: 200,
      isMoving: true,
    });

    // Phase 1: drive forward until front sensor trips.
    // Phase 2: brake long enough for the wheels to fully stop (the
    //          motors don't reverse instantly — actualV must ramp down
    //          before the spin command produces clean rotation).
    // Phase 3: spin 180°.
    // Phase 4: brake again so spin momentum decays before driving.
    // Phase 5: drive forward in the new heading.
    var phase = "drive_up";
    var phaseFrames = 0;
    var TURN_FRAMES = 28;
    var BRAKE_FRAMES = 24; // ~0.6 s — enough for ±395 mm/s to ramp to 0
    var done = false;
    for (var i = 0; i < 1500 && !done; i++) {
      if (phase === "drive_up") {
        var front = S.simulateUltrasonic(r);
        if (front !== -1 && front <= 150) {
          r.leftSpeed = 0;
          r.rightSpeed = 0;
          phase = "brake1";
          phaseFrames = 0;
        }
      } else if (phase === "brake1") {
        if (phaseFrames > BRAKE_FRAMES) {
          r.leftSpeed = 180;
          r.rightSpeed = -180;
          phase = "turn";
          phaseFrames = 0;
        }
      } else if (phase === "turn") {
        if (phaseFrames >= TURN_FRAMES) {
          r.leftSpeed = 0;
          r.rightSpeed = 0;
          phase = "brake2";
          phaseFrames = 0;
        }
      } else if (phase === "brake2") {
        if (phaseFrames > BRAKE_FRAMES) {
          r.leftSpeed = 200;
          r.rightSpeed = 200;
          phase = "drive_back";
          phaseFrames = 0;
        }
      } else if (phase === "drive_back") {
        if (r.y > 1400) done = true;
      }
      r = S.step(r, 0.025);
      phaseFrames++;
    }

    expect(done).toBe(true);
    expect(r.collisionCount).toBe(0);
    expect(r.y).toBeGreaterThan(1400);
    // Robot may end pressed against the left wall (x=0) due to motor
    // inertia during brake2 — heading overshoots ~180° + ramp-down
    // omega. The relevant invariant is: it stayed inside the channel.
    expect(r.x).toBeGreaterThan(60);
    expect(r.x).toBeLessThan(340);
  });
});
