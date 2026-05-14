/**
 * Challenge 1 — REAL Python via the actual browser pipeline.
 *
 * This test does NOT reimplement the control loop in JS. It loads the real
 *   Skulpt → aidriver-stub → simulator
 * pipeline and runs `app/answers/challenge-1.py` verbatim, then asserts on
 * the resulting trajectory.
 *
 * The only thing we substitute is `aidriver.hold_state`: instead of yielding
 * a real Skulpt suspension that defers via setTimeout, our test version
 * applies the queued motor commands, advances the simulator one step, and
 * raises a sentinel exception when the run has finished (success / collision /
 * timeout). That keeps the run synchronous so Jest can assert the outcome.
 * Everything else — the AIDriver class, drive(), read_distance_2(),
 * wall_sign, the command queue, Simulator.step kinematics — is the exact
 * code the browser executes.
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
const ANSWER_PY = path.join(APP_DIR, "answers/challenge-1.py");

function loadIntoGlobal(file, exposeAs) {
  const src = fs.readFileSync(file, "utf8");
  const tail = exposeAs ? `\n;globalThis.${exposeAs} = ${exposeAs};` : "";
  // Indirect eval -> evaluated in the global scope so top-level `const X = ...`
  // declarations land where we can see them via globalThis.
  // eslint-disable-next-line no-eval
  (0, eval)(src + tail);
}

describe("Challenge 1 answer — real Python through the browser pipeline", () => {
  let Sk;
  let Simulator;
  let AIDriverStub;
  let App;

  beforeAll(() => {
    // jsdom provides `window`. Mirror to globalThis so the file scripts'
    // `const X = (function(){ ... })()` declarations land somewhere we can
    // reach. (We assign the IIFE results to globalThis at the bottom.)
    global.DebugPanel = {
      log: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    // 1) Skulpt
    loadIntoGlobal(SKULPT);
    loadIntoGlobal(SKULPT_STDLIB);
    Sk = global.Sk || (typeof window !== "undefined" && window.Sk);
    if (!Sk) throw new Error("Skulpt did not register on global");

    // 2) RobotConfig (needed by Simulator)
    loadIntoGlobal(ROBOT_CONFIG_JS, "RobotConfig");

    // 3) Simulator (top-level `const Simulator = (function(){...})()`)
    loadIntoGlobal(SIMULATOR_JS, "Simulator");
    Simulator = globalThis.Simulator;
    if (!Simulator) throw new Error("Simulator failed to load");

    // 4) aidriver-stub (top-level `const AIDriverStub = { ... }`)
    loadIntoGlobal(AIDRIVER_STUB_JS, "AIDriverStub");
    AIDriverStub = globalThis.AIDriverStub;
    if (!AIDriverStub) throw new Error("AIDriverStub failed to load");

    // 4) Browser-side App stub. The aidriver-stub references App.robot,
    //    App.speedMultiplier, App.onAIDriverInstantiated — we satisfy each.
    App = {
      robot: null, // set per test
      speedMultiplier: 1,
      onAIDriverInstantiated(side) {
        Simulator.setSideSensorSide(side === "right" ? "right" : "left");
      },
    };
    global.App = App;
    global.render = () => {};
  });

  /**
   * Run `code` (Python source) through the full Skulpt + aidriver-stub +
   * Simulator pipeline and return per-tick trajectory samples.
   */
  function runPython(code, { dt = 0.05, maxTicks = 600 } = {}) {
    // Reset robot pose to the EXACT spawn the browser uses for Challenge 1.
    // (See app/js/challenges.js → challenges[1].startPosition.)
    App.robot = {
      x: 300,
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

    // Maze the answer is tuned for: outer left arena wall (x=0) is implicit
    // in Simulator.simulateUltrasonicSide; we add the inner divider at x=500
    // and at x=1470 to match the real straight_corridor.
    Simulator.setMazeWalls([
      { x: 500, y: 0, width: 30, height: 2000 },
      { x: 1470, y: 0, width: 30, height: 2000 },
    ]);

    AIDriverStub.commandQueue = [];

    const samples = [];
    let stopReason = null;

    // ---- Configure Skulpt --------------------------------------------------
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

    // ---- Register aidriver as the JS builtin module ------------------------
    Sk.builtinFiles = Sk.builtinFiles || { files: {} };
    const realFactory = AIDriverStub.getModule();

    // Wrap the factory so that every freshly-constructed `aidriver` module
    // gets its `hold_state` swapped for a synchronous step-and-check.
    globalThis.__aidriverModuleFactory = function (name) {
      const mod = realFactory(name);
      if (mod && mod.hold_state) {
        mod.hold_state = new Sk.builtin.func(function (seconds) {
          const stepDt = Sk.ffi.remapToJs(seconds) || dt;

          // Drain queued commands from this Python iteration into App.robot.
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
                // ignore read_distance / hold_state / etc
                break;
            }
          }

          // Advance simulator by one tick using the real kinematics.
          App.robot = Simulator.step(App.robot, stepDt);

          samples.push({
            x: App.robot.x,
            y: App.robot.y,
            heading: App.robot.heading,
            leftSpeed: App.robot.leftSpeed,
            rightSpeed: App.robot.rightSpeed,
            collisions: App.robot.collisionCount || 0,
          });

          // Termination conditions.
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

    // ---- Run --------------------------------------------------------------
    let runError = null;
    return Sk.misceval
      .asyncToPromise(() => Sk.importMainWithBody("<test>", false, code, true))
      .catch((err) => {
        // SystemExit raised from our hold_state is the *expected* exit path.
        const msg = String(err && (err.toString ? err.toString() : err));
        if (msg.includes("__test_stop_")) return;
        runError = err;
      })
      .then(() => {
        if (runError) throw runError;
        return { samples, stopReason };
      });
  }

  test("answer drives in a near-straight line down the corridor", async () => {
    const code = fs.readFileSync(ANSWER_PY, "utf8");
    const { samples, stopReason } = await runPython(code);

    // Run did something.
    expect(samples.length).toBeGreaterThan(20);

    // Compute trajectory metrics from the samples the SIMULATOR produced.
    const startX = samples[0].x;
    let minX = startX;
    let maxX = startX;
    let maxAbsHeading = 0;
    for (const s of samples) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      let h = ((s.heading % 360) + 360) % 360;
      if (h > 180) h -= 360;
      if (Math.abs(h) > maxAbsHeading) maxAbsHeading = Math.abs(h);
    }
    const lateralExcursion = Math.max(maxX - startX, startX - minX);
    const final = samples[samples.length - 1];

    // Diagnostics on failure.
    const diag = {
      stopReason,
      ticks: samples.length,
      startX,
      finalX: final.x,
      finalY: final.y,
      finalHeading: final.heading,
      collisions: final.collisions,
      maxAbsHeading: +maxAbsHeading.toFixed(2),
      lateralExcursion: +lateralExcursion.toFixed(2),
      xRange: [+minX.toFixed(2), +maxX.toFixed(2)],
    };

    // Hard requirements — these are the actual visible behaviours.
    // The user's spec: x stays within 10mm, y traverses the corridor to
    // the exit (which sits at y<200 in a 2000mm-tall arena), no collisions.
    expect({ ...diag, check: "no collisions" }).toMatchObject({
      collisions: 0,
      check: "no collisions",
    });
    expect({ ...diag, check: "reached exit" }).toMatchObject({
      stopReason: "success",
      check: "reached exit",
    });
    if (!(final.y < 200)) {
      throw new Error(
        "Robot did not reach the exit zone (y<200). Trajectory: " +
          JSON.stringify(diag),
      );
    }
    if (!(lateralExcursion < 80)) {
      throw new Error(
        "Lateral drift exceeded 80mm. Trajectory: " + JSON.stringify(diag),
      );
    }
    if (!(maxAbsHeading < 15)) {
      throw new Error(
        "Heading swung beyond 15°. Trajectory: " + JSON.stringify(diag),
      );
    }
  });

  // Sanity-check: prove the assertions actually catch a known-bad tuning.
  // The original (high-gain) values caused the in-browser car to corkscrew.
  // If this test ever PASSES we know the trajectory checks have gone soft.
  test("CONTROL: high-gain tuning is rejected (proves the test bites)", async () => {
    // Use a low BASE_SPEED that triggers the MIN_MOTOR_SPEED=120 cliff
    // when combined with high Kp and MAX_STEERING.
    const broken = fs
      .readFileSync(ANSWER_PY, "utf8")
      .replace(/^BASE_SPEED = \d+/m, "BASE_SPEED = 130")
      .replace(/^MAX_STEERING = \d+/m, "MAX_STEERING = 80")
      .replace(/^side_Kp = [\d.]+/m, "side_Kp = 0.80");

    const { samples } = await runPython(broken);
    let maxAbsHeading = 0;
    let minX = samples[0].x;
    let maxX = samples[0].x;
    for (const s of samples) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      let h = ((s.heading % 360) + 360) % 360;
      if (h > 180) h -= 360;
      if (Math.abs(h) > maxAbsHeading) maxAbsHeading = Math.abs(h);
    }
    const lateralExcursion = Math.max(maxX - samples[0].x, samples[0].x - minX);

    // The high-gain configuration MUST violate at least one bound. If both
    // pass it means the assertions are too loose to catch the visible bug.
    const violates = maxAbsHeading >= 20 || lateralExcursion >= 100;
    if (!violates) {
      throw new Error(
        "Known-bad tuning slipped through: maxH=" +
          maxAbsHeading.toFixed(2) +
          "° lateral=" +
          lateralExcursion.toFixed(2) +
          "mm — assertions are too loose.",
      );
    }
  });
});
