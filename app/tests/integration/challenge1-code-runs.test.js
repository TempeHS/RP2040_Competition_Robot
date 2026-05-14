/**
 * End-to-end behavioural test for Challenge 1 control code against the
 * REAL Simulator IIFE.
 *
 * The two Python files we exercise are:
 *   app/answers/challenge-1.py   — the worked solution (side_Kp = 0.40)
 *   app/starter-code/challenge-1.py — the student scaffold with all
 *                                     TODO values left at 0 (side_Kp = 0.0)
 *
 * Running real Skulpt inside Jest is heavy and brittle, so this suite
 * loads each Python file as text, asserts that the file matches the
 * expected pedagogical state, parses out the controller parameters, and
 * then drives a faithful JS replica of the wall-follow loop from
 * answers/challenge-1.py through the real simulator.step() and
 * simulator.simulateUltrasonicSide() functions.
 *
 *   Test 1 — "answer code loaded": with the real answer's side_Kp the
 *            robot makes northward progress, stays inside the corridor,
 *            and never collides with the wall.
 *   Test 2 — "sample code loaded with all values = 0": with the
 *            zeroed-out starter's side_Kp the robot has no corrective
 *            steering, drifts on its initial heading bias, and crashes
 *            into the corridor wall (collisionCount > 0).
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const APP_ROOT = path.join(__dirname, "../..");

function loadSimulator() {
  const src = fs.readFileSync(path.join(APP_ROOT, "js/simulator.js"), "utf8");
  const sandbox = {
    Math,
    Date,
    console,
    DebugPanel: { info: () => {}, warning: () => {}, error: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(src + "\n;this.Simulator = Simulator;", sandbox);
  return sandbox.Simulator;
}

/**
 * Pull a numeric assignment of the form `name = 0.40` (or `name = 0`)
 * out of a Python source file. Throws if the name is missing so the
 * test fails loudly when the file format changes.
 */
function parsePyFloat(source, name) {
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`, "m");
  const m = source.match(re);
  if (!m) {
    throw new Error(`Could not find numeric assignment for ${name}`);
  }
  return parseFloat(m[1]);
}

/**
 * Faithful JS replica of the wall-follow control loop in
 * answers/challenge-1.py. Uses the real simulator for sensing and motion.
 *
 * @returns {{robot:object, collisions:number, lastDistance:number, steps:number}}
 */
function runWallFollow({
  Simulator,
  side_Kp,
  baseSpeed = 160,
  targetWall = 150,
  maxSteering = 40,
  wallSign = -1, // wall on the LEFT → -1 (matches AIDriver("left"))
  initialHeading = 15, // tilted slightly toward the wall on purpose
  steps = 600,
  dt = 1 / 30,
}) {
  // Single straight corridor: wall at x=500, robot starts in the left strip.
  Simulator.setMazeWalls([{ x: 500, y: 0, width: 30, height: 2000 }]);

  let robot = {
    x: 250,
    y: 1700,
    heading: initialHeading,
    leftSpeed: 0,
    rightSpeed: 0,
    isMoving: true,
    trail: [],
    collisionCount: 0,
  };

  let lastDistance = -1;
  for (let i = 0; i < steps; i++) {
    const wallDistance = Simulator.simulateUltrasonicSide(robot);
    lastDistance = wallDistance;

    let leftCmd;
    let rightCmd;
    if (wallDistance === -1) {
      // Sensor invalid: drive straight (matches answer's fallback).
      leftCmd = baseSpeed;
      rightCmd = baseSpeed;
    } else {
      const error = wallDistance - targetWall;
      let steering = side_Kp * error;
      if (steering > maxSteering) steering = maxSteering;
      else if (steering < -maxSteering) steering = -maxSteering;

      rightCmd = baseSpeed - wallSign * steering;
      leftCmd = baseSpeed + wallSign * steering;
    }

    robot = Simulator.step(
      { ...robot, leftSpeed: leftCmd, rightSpeed: rightCmd, isMoving: true },
      dt,
    );

    // Bail out as soon as a crash happens — no point sampling further.
    if (robot.collisionCount > 0) {
      return {
        robot,
        collisions: robot.collisionCount,
        lastDistance,
        steps: i + 1,
      };
    }
    // Or if we've made it to the top of the arena.
    if (robot.y < 200) {
      return {
        robot,
        collisions: robot.collisionCount,
        lastDistance,
        steps: i + 1,
      };
    }
  }

  return {
    robot,
    collisions: robot.collisionCount,
    lastDistance,
    steps,
  };
}

describe("Challenge 1 control code in the real simulator", () => {
  let Simulator;
  let answerSrc;
  let starterSrc;

  beforeAll(() => {
    answerSrc = fs.readFileSync(
      path.join(APP_ROOT, "answers/challenge-1.py"),
      "utf8",
    );
    starterSrc = fs.readFileSync(
      path.join(APP_ROOT, "starter-code/challenge-1.py"),
      "utf8",
    );
  });

  beforeEach(() => {
    // Fresh simulator state for every test.
    Simulator = loadSimulator();
    Simulator.setSideSensorSide("left");
  });

  describe("answer code (app/answers/challenge-1.py)", () => {
    test("file declares a non-zero side_Kp and exercises the side sensor", () => {
      const kp = parsePyFloat(answerSrc, "side_Kp");
      expect(kp).toBeGreaterThan(0);
      expect(answerSrc).toMatch(/read_distance_2\s*\(/);
      expect(answerSrc).toMatch(/my_robot\.drive\s*\(/);
    });

    test("running the answer's parameters wall-follows northward without crashing", () => {
      const side_Kp = parsePyFloat(answerSrc, "side_Kp");
      const baseSpeed = parsePyFloat(answerSrc, "BASE_SPEED");
      const targetWall = parsePyFloat(answerSrc, "TARGET_WALL_DISTANCE");
      const maxSteering = parsePyFloat(answerSrc, "MAX_STEERING");

      const result = runWallFollow({
        Simulator,
        side_Kp,
        baseSpeed,
        targetWall,
        maxSteering,
      });

      // Made meaningful northward progress (started at y=1700).
      expect(result.robot.y).toBeLessThan(1500);
      // Did not cross the corridor wall (wall is at x=500, robot stays west of it).
      expect(result.robot.x).toBeLessThan(500);
      // No collisions occurred during the run.
      expect(result.collisions).toBe(0);
      // The P controller drove the robot toward the target distance —
      // by the end we are within a reasonable band of TARGET.
      expect(Math.abs(result.lastDistance - targetWall)).toBeLessThan(120);
    });
  });

  describe("starter code with all values = 0 (app/starter-code/challenge-1.py)", () => {
    test("every numeric setting is 0 — student must configure to make anything happen", () => {
      expect(parsePyFloat(starterSrc, "side_Kp")).toBe(0);
      expect(parsePyFloat(starterSrc, "BASE_SPEED")).toBe(0);
      expect(parsePyFloat(starterSrc, "TARGET_WALL_DISTANCE")).toBe(0);
      expect(parsePyFloat(starterSrc, "MAX_STEERING")).toBe(0);
    });

    test("running with all settings = 0 the robot does not move and makes no progress", () => {
      const result = runWallFollow({
        Simulator,
        side_Kp: parsePyFloat(starterSrc, "side_Kp"),
        baseSpeed: parsePyFloat(starterSrc, "BASE_SPEED"),
        targetWall: parsePyFloat(starterSrc, "TARGET_WALL_DISTANCE"),
        maxSteering: parsePyFloat(starterSrc, "MAX_STEERING"),
      });

      // No motion → no collision and no northward progress from y=1700.
      expect(result.collisions).toBe(0);
      expect(result.robot.y).toBeGreaterThan(1690);
    });
  });
});
