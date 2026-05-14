/**
 * Behavioural tests for the REAL Simulator IIFE in app/js/simulator.js.
 *
 * The pre-existing simulator.test.js file uses a hand-rolled mock and does
 * not exercise the production code. This file loads the actual source so we
 * can verify the recent simulator hardening:
 *
 *   D3 — mirrorPose / mirrorRect helpers
 *   D4 — step() rejects motion that would tunnel through walls and applies
 *        5 mm sub-step integration
 *   D5 — step() increments collisionCount and sets collisionFlashUntil on
 *        every wall hit
 *   D2 — setSideSensorSide / getSideSensorSide bridge for AIDriver(side)
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadSimulator() {
  const src = fs.readFileSync(
    path.join(__dirname, "../../js/simulator.js"),
    "utf8",
  );
  // Provide globals the simulator may reference (DebugPanel is optional).
  const sandbox = {
    Math,
    Date,
    console,
    DebugPanel: { info: () => {}, warning: () => {}, error: () => {} },
  };
  vm.createContext(sandbox);
  // The IIFE assigns to a top-level `const Simulator`; that binding lives in
  // the script scope and is invisible from outside. Re-export it onto the
  // sandbox global so tests can reach it.
  vm.runInContext(src + "\n;this.Simulator = Simulator;", sandbox);
  return sandbox.Simulator;
}

describe("Simulator (real source)", () => {
  let Simulator;

  beforeEach(() => {
    // Fresh module per test so internal closure state (sideSensorSide,
    // mazeWalls, obstacles) cannot leak between specs.
    Simulator = loadSimulator();
    Simulator.setObstacles([]);
    Simulator.setMazeWalls([]);
    Simulator.setSideSensorSide("left");
  });

  describe("public surface", () => {
    test("exposes new D3 helpers", () => {
      expect(typeof Simulator.mirrorPose).toBe("function");
      expect(typeof Simulator.mirrorRect).toBe("function");
    });

    test("exposes side-sensor accessors", () => {
      expect(typeof Simulator.setSideSensorSide).toBe("function");
      expect(typeof Simulator.getSideSensorSide).toBe("function");
    });
  });

  describe("D3 — mirrorPose", () => {
    test("flips x across the centreline and inverts heading", () => {
      const out = Simulator.mirrorPose({ x: 300, y: 1700, heading: 0 });
      expect(out.x).toBe(Simulator.ARENA_WIDTH - 300);
      expect(out.y).toBe(1700);
      expect(out.heading).toBe(0); // (360 - 0) % 360 = 0
    });

    test("treats missing heading as 0", () => {
      const out = Simulator.mirrorPose({ x: 100, y: 100 });
      expect(out.x).toBe(Simulator.ARENA_WIDTH - 100);
      expect(out.heading).toBe(0);
    });

    test("mirrors a rightward heading to a leftward heading", () => {
      // heading 90 (east) -> mirror should face west = 270
      const out = Simulator.mirrorPose({ x: 500, y: 500, heading: 90 });
      expect(out.heading).toBe(270);
    });

    test("is its own inverse", () => {
      const start = { x: 250, y: 1700, heading: 45 };
      const mirroredTwice = Simulator.mirrorPose(Simulator.mirrorPose(start));
      expect(mirroredTwice.x).toBe(start.x);
      expect(mirroredTwice.y).toBe(start.y);
      expect(mirroredTwice.heading).toBe(start.heading);
    });
  });

  describe("D3 — mirrorRect", () => {
    test("flips an off-centre rectangle across x=1000", () => {
      const out = Simulator.mirrorRect({
        x: 100,
        y: 50,
        width: 300,
        height: 200,
      });
      expect(out).toEqual({ x: 1600, y: 50, width: 300, height: 200 });
    });

    test("a rectangle straddling the centreline is its own mirror", () => {
      const r = { x: 900, y: 100, width: 200, height: 200 };
      expect(Simulator.mirrorRect(r)).toEqual(r);
    });
  });

  describe("D2 — side sensor switching", () => {
    test("defaults to left, accepts left/right, ignores garbage", () => {
      expect(Simulator.getSideSensorSide()).toBe("left");
      Simulator.setSideSensorSide("right");
      expect(Simulator.getSideSensorSide()).toBe("right");
      Simulator.setSideSensorSide("left");
      expect(Simulator.getSideSensorSide()).toBe("left");
      Simulator.setSideSensorSide("banana");
      expect(Simulator.getSideSensorSide()).toBe("left");
    });
  });

  describe("D4 — collision rejects motion", () => {
    function makeMovingRobot(overrides = {}) {
      return {
        x: 200,
        y: 1000,
        heading: 90, // east-ish in this simulator's convention
        leftSpeed: 200,
        rightSpeed: 200,
        isMoving: true,
        trail: [],
        collisionCount: 0,
        collisionFlashUntil: 0,
        ...overrides,
      };
    }

    test("step() advances the robot when no walls are in the way", () => {
      const before = makeMovingRobot({ x: 1000, y: 1000 });
      const after = Simulator.step(before, 1 / 60);
      const moved = Math.abs(after.x - before.x) + Math.abs(after.y - before.y);
      expect(moved).toBeGreaterThan(0);
      expect(after.collisionCount).toBe(0);
      expect(after.isMoving).toBe(true);
    });

    test("step() rejects the move when a wall blocks the path", () => {
      // Put a vertical wall just east of a robot driving east.
      Simulator.setMazeWalls([
        { x: 250, y: 0, width: 30, height: 2000 }, // wall right next to robot
      ]);
      const before = makeMovingRobot({ x: 200, y: 1000, heading: 90 });
      const after = Simulator.step(before, 1 / 60);

      // Robot must NOT have tunnelled through the wall.
      expect(after.x).toBeLessThan(250);
      // Speeds are zeroed, motion stops.
      expect(after.leftSpeed).toBe(0);
      expect(after.rightSpeed).toBe(0);
      expect(after.isMoving).toBe(false);
      // Collision tracking is updated.
      expect(after.collisionCount).toBe(1);
      expect(after.collisionFlashUntil).toBeGreaterThan(Date.now() - 1);
    });

    test("step() with very high simulation speed still cannot tunnel (sub-stepping)", () => {
      // Pump the global simulation speed to its max so each frame would
      // travel many tens of mm. With 5 mm sub-stepping the wall must still
      // block the move.
      Simulator.setSpeed(5);
      Simulator.setMazeWalls([{ x: 400, y: 0, width: 30, height: 2000 }]);
      const before = {
        x: 200,
        y: 1000,
        heading: 90,
        leftSpeed: 255,
        rightSpeed: 255,
        isMoving: true,
        trail: [],
      };
      const after = Simulator.step(before, 1 / 30); // big dt

      expect(after.x).toBeLessThan(400); // never crossed the wall
      expect(after.collisionCount).toBeGreaterThanOrEqual(1);
    });

    test("collisionCount accumulates across separate hits", () => {
      Simulator.setMazeWalls([{ x: 250, y: 0, width: 30, height: 2000 }]);
      const blocked = Simulator.step(
        {
          x: 200,
          y: 1000,
          heading: 90,
          leftSpeed: 200,
          rightSpeed: 200,
          isMoving: true,
          trail: [],
          collisionCount: 4,
        },
        1 / 60,
      );
      expect(blocked.collisionCount).toBe(5);
    });

    test("step() short-circuits when robot is idle", () => {
      const idle = {
        x: 100,
        y: 100,
        heading: 0,
        leftSpeed: 0,
        rightSpeed: 0,
        isMoving: false,
        trail: [],
        collisionCount: 7,
      };
      const after = Simulator.step(idle, 1 / 60);
      // Same object short-circuit; collisionCount preserved.
      expect(after.collisionCount).toBe(7);
      expect(after.x).toBe(100);
      expect(after.y).toBe(100);
    });
  });
});
