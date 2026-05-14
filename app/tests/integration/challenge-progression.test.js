/**
 * Challenge Progression — P → PD → PID lateral-excursion improvement
 *
 * Validates that each successive challenge answer keeps the robot in a
 * tighter X-range (lateral deviation) while travelling along the corridor.
 *
 *   Challenge 1 (P only)  — widest lateral band
 *   Challenge 2 (PD)      — narrower than C1
 *   Challenge 3 (PID)     — narrower than C2
 *
 * All three run on the SAME straight corridor with the SAME start position
 * through the real Skulpt → aidriver-stub → Simulator pipeline.
 */

const fs = require("fs");
const path = require("path");

const APP_DIR = path.resolve(__dirname, "../..");
const SKULPT = path.join(APP_DIR, "node_modules/skulpt/dist/skulpt.js");
const SKULPT_STDLIB = path.join(
  APP_DIR,
  "node_modules/skulpt/dist/skulpt-stdlib.js",
);
const SIMULATOR_JS = path.join(APP_DIR, "js/simulator.js");
const ROBOT_CONFIG_JS = path.join(APP_DIR, "js/robot-config.js");
const AIDRIVER_STUB_JS = path.join(APP_DIR, "js/aidriver-stub.js");

const CHALLENGE_FILES = {
  1: path.join(APP_DIR, "answers/challenge-1.py"),
  2: path.join(APP_DIR, "answers/challenge-2.py"),
  3: path.join(APP_DIR, "answers/challenge-3.py"),
};

/* ── helpers ────────────────────────────────────────────────────── */

function loadIntoGlobal(file, exposeAs) {
  const src = fs.readFileSync(file, "utf8");
  const tail = exposeAs ? `\n;globalThis.${exposeAs} = ${exposeAs};` : "";
  // eslint-disable-next-line no-eval
  (0, eval)(src + tail);
}

/* ── suite ──────────────────────────────────────────────────────── */

describe("Challenge progression: P → PD → PID tightens lateral excursion", () => {
  let Sk;
  let Simulator;
  let AIDriverStub;
  let App;

  beforeAll(() => {
    global.DebugPanel = {
      log: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    loadIntoGlobal(SKULPT);
    loadIntoGlobal(SKULPT_STDLIB);
    Sk = global.Sk || (typeof window !== "undefined" && window.Sk);
    if (!Sk) throw new Error("Skulpt did not register on global");

    loadIntoGlobal(ROBOT_CONFIG_JS, "RobotConfig");
    loadIntoGlobal(SIMULATOR_JS, "Simulator");
    Simulator = globalThis.Simulator;
    if (!Simulator) throw new Error("Simulator failed to load");

    loadIntoGlobal(AIDRIVER_STUB_JS, "AIDriverStub");
    AIDriverStub = globalThis.AIDriverStub;
    if (!AIDriverStub) throw new Error("AIDriverStub failed to load");

    App = {
      robot: null,
      speedMultiplier: 1,
      onAIDriverInstantiated(side) {
        Simulator.setSideSensorSide(side === "right" ? "right" : "left");
      },
    };
    global.App = App;
    global.render = () => {};
  });

  /**
   * Run a Python challenge answer through the full pipeline.
   * @param {string} code - Python source
   * @param {object} opts
   * @param {number} opts.startX - starting X position (default 300)
   * Returns { samples, stopReason, xRange, xStdDev, lateralExcursion, meanX, minX, maxX }.
   */
  function runChallenge(
    code,
    { dt = 0.05, maxTicks = 600, startX = 300 } = {},
  ) {
    // Eliminate sensor noise so we measure pure controller quality.
    // With random noise the integral term accumulates drift, unfairly
    // penalising PID in a straight corridor where there is no steady-state
    // error for I to correct.
    const origRandom = Math.random;
    Math.random = () => 0.5; // noise = (0.5-0.5)*2*NOISE = 0

    App.robot = {
      x: startX,
      y: 1700,
      heading: 0,
      leftSpeed: 0,
      rightSpeed: 0,
      actualLeftV: 0,
      actualRightV: 0,
      isMoving: false,
      trail: [],
      collisionCount: 0,
      collisionFlashUntil: 0,
    };

    // Straight corridor: left wall at x=0 (arena edge), right wall at x=500.
    Simulator.setMazeWalls([
      { x: 500, y: 0, width: 30, height: 2000 },
      { x: 1470, y: 0, width: 30, height: 2000 },
    ]);
    Simulator.clearObstacles();
    AIDriverStub.commandQueue = [];

    const samples = [];
    let stopReason = null;

    Sk.configure({
      output: () => {},
      read: (filename) => {
        if (
          Sk.builtinFiles &&
          Sk.builtinFiles.files &&
          Sk.builtinFiles.files[filename] !== undefined
        ) {
          return Sk.builtinFiles.files[filename];
        }
        throw new Error("File not found: " + filename);
      },
      __future__: Sk.python3,
      execLimit: null,
      killableWhile: true,
      killableFor: true,
      setTimeout(fn, delay) {
        return setTimeout(fn, delay);
      },
    });

    Sk.builtinFiles = Sk.builtinFiles || { files: {} };
    const realFactory = AIDriverStub.getModule();

    globalThis.__aidriverModuleFactory = function (name) {
      const mod = realFactory(name);
      if (mod && mod.hold_state) {
        mod.hold_state = new Sk.builtin.func(function (seconds) {
          const stepDt = Sk.ffi.remapToJs(seconds) || dt;

          const queue = AIDriverStub.commandQueue;
          while (queue.length) {
            const c = queue.shift();
            switch (c.type) {
              case "drive":
              case "drive_forward":
                App.robot.leftSpeed = c.params.leftSpeed;
                App.robot.rightSpeed = c.params.rightSpeed;
                App.robot.isMoving = true;
                break;
              case "drive_backward":
                App.robot.leftSpeed = -c.params.leftSpeed;
                App.robot.rightSpeed = -c.params.rightSpeed;
                App.robot.isMoving = true;
                break;
              case "rotate_left":
                App.robot.leftSpeed = -c.params.turnSpeed;
                App.robot.rightSpeed = c.params.turnSpeed;
                App.robot.isMoving = true;
                break;
              case "rotate_right":
                App.robot.leftSpeed = c.params.turnSpeed;
                App.robot.rightSpeed = -c.params.turnSpeed;
                App.robot.isMoving = true;
                break;
              case "brake":
                App.robot.leftSpeed = 0;
                App.robot.rightSpeed = 0;
                App.robot.actualLeftV = 0;
                App.robot.actualRightV = 0;
                App.robot.isMoving = false;
                break;
              case "init":
                App.onAIDriverInstantiated(c.params && c.params.side);
                break;
              default:
                break;
            }
          }

          App.robot = Simulator.step(App.robot, stepDt);

          samples.push({
            x: App.robot.x,
            y: App.robot.y,
            heading: App.robot.heading,
          });

          if ((App.robot.collisionCount || 0) > 0) {
            stopReason = "collision";
            throw new Sk.builtin.SystemExit(
              new Sk.builtin.str("__test_stop_collision__"),
            );
          }
          if (App.robot.y < 200) {
            stopReason = "success";
            throw new Sk.builtin.SystemExit(
              new Sk.builtin.str("__test_stop_success__"),
            );
          }
          if (samples.length >= maxTicks) {
            stopReason = "timeout";
            throw new Sk.builtin.SystemExit(
              new Sk.builtin.str("__test_stop_timeout__"),
            );
          }

          return Sk.builtin.none.none$;
        });
      }
      return mod;
    };

    Sk.builtinFiles.files["src/lib/aidriver.js"] =
      "var $builtinmodule = function() { " +
      "return globalThis.__aidriverModuleFactory('aidriver'); };";

    let runError = null;
    return Sk.misceval
      .asyncToPromise(() => Sk.importMainWithBody("<test>", false, code, true))
      .catch((err) => {
        const msg = String(err && (err.toString ? err.toString() : err));
        if (msg.includes("__test_stop_")) return;
        runError = err;
      })
      .then(() => {
        if (runError) throw runError;

        // Compute lateral metrics — X is the lateral axis in this corridor.
        // Use the latter half of samples only (deep steady-state),
        // excluding initial transient and overshoot.
        const half = Math.floor(samples.length / 2);
        const steady = samples.slice(half);
        let sumX = 0;
        let minX = Infinity;
        let maxX = -Infinity;
        for (const s of steady) {
          sumX += s.x;
          if (s.x < minX) minX = s.x;
          if (s.x > maxX) maxX = s.x;
        }
        const meanX = sumX / steady.length;
        let sumSqDev = 0;
        for (const s of steady) {
          sumSqDev += (s.x - meanX) * (s.x - meanX);
        }
        const xStdDev = Math.sqrt(sumSqDev / steady.length);
        const xRange = maxX - minX;
        const lateralExcursion = xRange;

        Math.random = origRandom; // restore
        return {
          samples,
          stopReason,
          xRange,
          xStdDev,
          meanX,
          lateralExcursion,
          minX,
          maxX,
        };
      })
      .catch((err) => {
        Math.random = origRandom; // restore on error too
        throw err;
      });
  }

  /* ── Collect results for all three challenges ──────────────── */

  const results = {};

  beforeAll(async () => {
    for (const num of [1, 2, 3]) {
      const code = fs.readFileSync(CHALLENGE_FILES[num], "utf8");
      results[num] = await runChallenge(code);
    }
  });

  /* ── Sanity: each challenge reaches the exit without collision ── */

  test("Challenge 1 (P) reaches exit without collision", () => {
    expect(results[1].stopReason).toBe("success");
    expect(results[1].samples.length).toBeGreaterThan(10);
  });

  test("Challenge 2 (PD) reaches exit without collision", () => {
    expect(results[2].stopReason).toBe("success");
    expect(results[2].samples.length).toBeGreaterThan(10);
  });

  test("Challenge 3 (PID) reaches exit without collision", () => {
    expect(results[3].stopReason).toBe("success");
    expect(results[3].samples.length).toBeGreaterThan(10);
  });

  /* ── Core assertion: each step tightens lateral tracking ─────── */

  test("PD (C2) has tighter steady-state X than P-only (C1)", () => {
    const diag = {
      c1_xRange: +results[1].xRange.toFixed(2),
      c1_xStdDev: +results[1].xStdDev.toFixed(2),
      c2_xRange: +results[2].xRange.toFixed(2),
      c2_xStdDev: +results[2].xStdDev.toFixed(2),
    };
    if (!(results[2].xStdDev < results[1].xStdDev)) {
      throw new Error(
        "PD did NOT tighten lateral tracking vs P-only: " +
          JSON.stringify(diag),
      );
    }
  });

  test("PID (C3) has tighter steady-state X than PD (C2)", () => {
    const diag = {
      c2_xRange: +results[2].xRange.toFixed(2),
      c2_xStdDev: +results[2].xStdDev.toFixed(2),
      c3_xRange: +results[3].xRange.toFixed(2),
      c3_xStdDev: +results[3].xStdDev.toFixed(2),
    };
    if (!(results[3].xStdDev < results[2].xStdDev)) {
      throw new Error(
        "PID did NOT tighten lateral tracking vs PD: " + JSON.stringify(diag),
      );
    }
  });

  test("Full progression: C1 > C2 > C3 lateral std-dev (strict)", () => {
    const diag = {
      c1_stddev: +results[1].xStdDev.toFixed(3),
      c2_stddev: +results[2].xStdDev.toFixed(3),
      c3_stddev: +results[3].xStdDev.toFixed(3),
      c1_range: +results[1].xRange.toFixed(2),
      c2_range: +results[2].xRange.toFixed(2),
      c3_range: +results[3].xRange.toFixed(2),
    };

    expect(results[1].xStdDev).toBeGreaterThan(results[2].xStdDev);
    expect(results[2].xStdDev).toBeGreaterThan(results[3].xStdDev);

    // eslint-disable-next-line no-console
    console.log(
      `Steady-state lateral std-dev: P=${diag.c1_stddev}mm → PD=${diag.c2_stddev}mm → PID=${diag.c3_stddev}mm`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `Steady-state lateral range:   P=${diag.c1_range}mm → PD=${diag.c2_range}mm → PID=${diag.c3_range}mm`,
    );
  });

  /* ── Multi-start: converges to target from any starting distance ── */

  // TARGET_WALL_DISTANCE = 200mm. The side sensor is mounted ROBOT_WIDTH/2
  // = 60mm from body centre. So when the sensor reads 200mm the body centre
  // sits at x = 200 + 60 = 260mm from the left arena wall.
  const TARGET_X = 260;
  const START_DISTANCES = [100, 150, 200, 260, 300, 350];
  // Tolerance: steady-state mean X must be within this many mm of target.
  const CONVERGE_TOLERANCE = 20;

  describe.each([1, 2, 3])("Challenge %i converges from any start", (cNum) => {
    const multiResults = {};

    beforeAll(async () => {
      const code = fs.readFileSync(CHALLENGE_FILES[cNum], "utf8");
      for (const startX of START_DISTANCES) {
        multiResults[startX] = await runChallenge(code, { startX });
      }
    });

    test.each(START_DISTANCES)("startX=%imm → reaches exit", (startX) => {
      expect(multiResults[startX].stopReason).toBe("success");
    });

    test.each(START_DISTANCES)(
      "startX=%imm → steady-state mean X within " +
        CONVERGE_TOLERANCE +
        "mm of " +
        TARGET_X,
      (startX) => {
        const r = multiResults[startX];
        const offset = Math.abs(r.meanX - TARGET_X);
        if (offset > CONVERGE_TOLERANCE) {
          throw new Error(
            `C${cNum} startX=${startX}: steady-state meanX=${r.meanX.toFixed(1)}mm, ` +
              `offset=${offset.toFixed(1)}mm from target ${TARGET_X}mm (tolerance ${CONVERGE_TOLERANCE}mm)`,
          );
        }
      },
    );

    test("progression holds across all starts", () => {
      // For each starting position, the robot must drive forward (y decreases)
      // and the mean X in steady state must cluster near TARGET_X.
      const rows = START_DISTANCES.map((sx) => {
        const r = multiResults[sx];
        return {
          startX: sx,
          meanX: +r.meanX.toFixed(1),
          stdDev: +r.xStdDev.toFixed(2),
          range: +r.xRange.toFixed(1),
          ticks: r.samples.length,
        };
      });
      // eslint-disable-next-line no-console
      console.table(rows);
    });
  });
});
