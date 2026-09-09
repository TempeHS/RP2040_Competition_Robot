const fs = require("fs");
const path = require("path");

const appDir = path.resolve(__dirname, "../..");
const root = path.dirname(appDir);
const studentSource = fs.readFileSync(
  path.join(root, "project/config.py"),
  "utf8",
);
const testSource = fs.readFileSync(
  path.join(root, "tests/test-config.py"),
  "utf8",
);
const checkSource = fs.readFileSync(
  path.join(root, "project/lib/config_check.py"),
  "utf8",
);

function load(relative, name) {
  const source = fs.readFileSync(path.join(appDir, relative), "utf8");
  (0, eval)(source + (name ? `\nglobalThis.${name} = ${name};` : ""));
}

describe("Shared configuration through real Skulpt", () => {
  let store;
  let runtime;

  beforeAll(() => {
    load("node_modules/skulpt/dist/skulpt.js");
    load("node_modules/skulpt/dist/skulpt-stdlib.js");
    runtime = globalThis.Sk;
    load("js/config-store.js", "ConfigStore");
    load("js/aidriver-stub.js", "AIDriverStub");
    load("js/python-runner.js", "PythonRunner");
    load("js/validator.js", "Validator");
    store = globalThis.ConfigStore;
    store.defaultSource = studentSource;
    store.checkSource = checkSource;
    store.source = testSource;
    store.loading = Promise.resolve(store);
    globalThis.App = {
      speedMultiplier: 1,
      robot: { x: 150, y: 1800, leftSpeed: 0, rightSpeed: 0 },
    };
    globalThis.Simulator = {
      simulateUltrasonic: () => 1000,
      simulateUltrasonicSide: () => 100,
      simulateColor: () => ({ r: 40, g: 40, b: 40, c: 120 }),
    };
  });

  async function run(code, source = testSource, trace = false) {
    runtime.configure({
      output: () => {},
      read: (filename) => {
        if (runtime.builtinFiles.files[filename] !== undefined)
          return runtime.builtinFiles.files[filename];
        throw new runtime.builtin.ImportError(filename);
      },
      __future__: runtime.python3,
      execLimit: 2000,
    });
    store.register({ source, checkSource });
    AIDriverStub.clearQueue();
    if (trace) {
      delete runtime.builtinFiles.files["src/lib/aidriver.js"];
      runtime.builtinFiles.files["src/lib/aidriver.py"] =
        PythonRunner.getAIDriverPythonModule(true);
    } else {
      globalThis.__aidriverModuleFactory = AIDriverStub.getModule();
      runtime.builtinFiles.files["src/lib/aidriver.js"] =
        "var $builtinmodule = function() { return globalThis.__aidriverModuleFactory('aidriver'); };";
    }
    return runtime.misceval.asyncToPromise(() =>
      runtime.importMainWithBody(
        "shared_test",
        false,
        trace ? PythonRunner.injectDebugCalls(code) : code,
        true,
      ),
    );
  }

  const programs = ["starter-code", "answers"].flatMap((folder) =>
    Array.from(
      { length: 10 },
      (_, index) => `${folder}/challenge-${index + 1}.py`,
    ),
  );

  test.each(programs)(
    "complete main executes in both Skulpt paths: %s",
    async (file) => {
      const source = fs.readFileSync(path.join(appDir, file), "utf8");
      expect(Validator.validate(source).errors).toEqual([]);
      expect(Validator.validateFunctionCalls(source)).toEqual([]);
      const bounded =
        '__name__ = "contract_test"\n' +
        source +
        '\n_hold_count = 0\ndef hold_state(seconds):\n    global _hold_count\n    _hold_count += 1\n    if _hold_count >= 2:\n        raise RuntimeError("__test_budget__")\nmain()\n';
      for (const trace of [false, true]) {
        const error = await run(bounded, testSource, trace).then(
          () => null,
          (failure) => failure,
        );
        expect(String(error)).toContain("__test_budget__");
      }
    },
  );

  test("Run rejects invalid config before queuing movement", async () => {
    const source = testSource.replace("BASE_SPEED = 200", "BASE_SPEED = 0");
    localStorage.setItem(store.key, source);
    AIDriverStub.clearQueue();
    Editor.markError.mockClear();
    try {
      await expect(
        PythonRunner.run(
          fs.readFileSync(
            path.join(appDir, "starter-code/challenge-1.py"),
            "utf8",
          ),
        ),
      ).rejects.toBeDefined();
      expect(AIDriverStub.commandQueue).toEqual([]);
      expect(Editor.markError).not.toHaveBeenCalled();
      expect(PythonRunner.isRunning).toBe(false);
    } finally {
      localStorage.removeItem(store.key);
      store.source = testSource;
    }
  });

  test("test config validates and has the same names as the zeroed student config", async () => {
    expect([...store.inspect(studentSource).keys()].sort()).toEqual(
      [...store.inspect(testSource).keys()].sort(),
    );
    await expect(store.validate(testSource)).resolves.toBe(true);
    await expect(store.validate(studentSource)).rejects.toBeDefined();
  });

  test.each([
    "import os",
    "BASE_SPEED = print(200)",
    "while True:\n    pass",
    "value = unknown + 1",
    "value = 1\nvalue = 2",
  ])("rejects unsafe or ambiguous config: %s", (source) => {
    expect(() => store.inspect(source)).toThrow();
  });

  test.each([false, true])(
    "constructor consumes shared settings (trace=%s)",
    async (trace) => {
      const result = await run(
        "import config\nfrom aidriver import AIDriver\nfrom config_check import validate_config\nvalidate_config(config)\nrobot = AIDriver(config.WALL_SIDE, distance_sensor=config.DISTANCE_SENSOR, min_approach_speed=config.MIN_APPROACH_SPEED, kit_servo_pin=config.KIT_SERVO_PIN)\nbackend = robot.distance_sensor\nfloor = robot.MIN_MOTOR_SPEED\nrobot.drive(config.BASE_SPEED, config.BASE_SPEED)\n",
        testSource,
        trace,
      );
      expect(runtime.ffi.remapToJs(result.$d.backend)).toBe("tof");
      expect(runtime.ffi.remapToJs(result.$d.floor)).toBe(120);
    },
  );

  test("a new run reads changed config rather than cached settings", async () => {
    const first = await run("import config\nspeed = config.BASE_SPEED\n");
    const second = await run(
      "import config\nspeed = config.BASE_SPEED\n",
      testSource.replace("BASE_SPEED = 200", "BASE_SPEED = 180"),
    );
    expect(runtime.ffi.remapToJs(first.$d.speed)).toBe(200);
    expect(runtime.ffi.remapToJs(second.$d.speed)).toBe(180);
  });

  test("validation points to the setting instead of the helper module", async () => {
    const source = testSource.replace("BASE_SPEED = 200", "BASE_SPEED = 0");
    try {
      await store.validate(source);
      throw new Error("Invalid config unexpectedly passed");
    } catch (error) {
      const location = store.errorLocation(error, source);
      expect(location.filename).toBe("config.py");
      expect(location.line).toBe(store.inspect(source).get("BASE_SPEED"));
      expect(location.message).toContain("BASE_SPEED");
    }
  });
});
