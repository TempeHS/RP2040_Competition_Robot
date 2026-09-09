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

  test.each([
    [
      "wrong type",
      testSource.replace("BASE_SPEED = 200", 'BASE_SPEED = "fast"'),
    ],
    ["missing variable", testSource.replace("BASE_SPEED = 200\n", "")],
    ["syntax error", testSource.replace("BASE_SPEED = 200", "BASE_SPEED = (")],
  ])("Run rejects config %s before queuing movement", async (_kind, source) => {
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
    await expect(store.validate(studentSource)).resolves.toBe(true);
  });

  test.each([
    [
      "runtime error",
      'from aidriver import AIDriver\nrobot = AIDriver("left")\nvalue = 1 / 0\n',
    ],
    ["syntax error", "from aidriver import AIDriver\nvalue = (\n"],
  ])("Step reports a %s and restores its module state", async (_kind, code) => {
    await run("from aidriver import AIDriver\n");
    const normalModule = runtime.builtinFiles.files["src/lib/aidriver.js"];
    localStorage.setItem(store.key, testSource);
    try {
      await expect(PythonRunner.runStepMode(code)).rejects.toBeDefined();
      expect(PythonRunner.isCollectingTrace).toBe(false);
      expect(PythonRunner.stepMode).toBe(false);
      expect(runtime.builtinFiles.files["src/lib/aidriver.js"]).toBe(
        normalModule,
      );
      expect(runtime.builtinFiles.files["src/lib/aidriver.py"]).toBeUndefined();
    } finally {
      localStorage.removeItem(store.key);
      PythonRunner.stepMode = false;
      PythonRunner.isCollectingTrace = false;
    }
  });

  test.each(["Run", "Step"])(
    "a stopped %s cannot resume after a new run starts",
    async (mode) => {
      const firstSnapshot = {};
      const secondSnapshot = {};
      const snapshot = jest
        .spyOn(store, "snapshot")
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              firstSnapshot.resolve = resolve;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              secondSnapshot.resolve = resolve;
            }),
        );
      const processCommands = jest.spyOn(PythonRunner, "processCommandQueue");
      const playback = jest
        .spyOn(PythonRunner, "playTrace")
        .mockResolvedValue();
      try {
        const firstRun =
          mode === "Run"
            ? PythonRunner.run('print("old run")\n')
            : PythonRunner.runStepMode('print("old run")\n');
        PythonRunner.stop();
        const secondRun = PythonRunner.run('print("new run")\n');
        firstSnapshot.resolve({ source: testSource, checkSource });
        await firstRun;
        expect(PythonRunner.isRunning).toBe(true);
        expect(processCommands).not.toHaveBeenCalled();
        expect(playback).not.toHaveBeenCalled();
        secondSnapshot.resolve({ source: testSource, checkSource });
        await secondRun;
        expect(PythonRunner.isRunning).toBe(false);
      } finally {
        secondSnapshot.resolve({ source: testSource, checkSource });
        snapshot.mockRestore();
        processCommands.mockRestore();
        playback.mockRestore();
        PythonRunner.stop();
      }
    },
  );

  test("a stopped built-in gyro turn cannot move a new robot", async () => {
    const module = await run(
      'from aidriver import AIDriver\nrobot = AIDriver("left")\ndef turn():\n    robot.turn_degrees(90)\n',
    );
    const gyro = Simulator.simulateGyroZ;
    Simulator.simulateGyroZ = () => 0;
    jest.useFakeTimers();
    try {
      const suspension = runtime.misceval.callsimOrSuspend(module.$d.turn);
      expect(App.robot.isMoving).toBe(true);
      PythonRunner.stop();
      const replacement = {
        x: 150,
        y: 1800,
        heading: 0,
        leftSpeed: 180,
        rightSpeed: 180,
        isMoving: true,
      };
      App.robot = replacement;
      jest.advanceTimersByTime(30);
      expect(App.robot).toEqual(replacement);
      expect(App.robot.leftSpeed).toBe(180);
      expect(App.robot.rightSpeed).toBe(180);
      await runtime.misceval.asyncToPromise(() => suspension);
    } finally {
      Simulator.simulateGyroZ = gyro;
      jest.clearAllTimers();
      jest.useRealTimers();
      PythonRunner.stop();
    }
  });

  test("Step reads arena sensors instead of placeholder values", async () => {
    localStorage.setItem(store.key, testSource);
    try {
      await PythonRunner.collectTrace(
        'from aidriver import AIDriver\nrobot = AIDriver("left")\nprint("SIDE:" + str(robot.read_distance_2()))\nprint("RED:" + str(robot.read_color()[0]))\n',
      );
      expect(PythonRunner.traceOutputs).toContain("SIDE:100");
      expect(PythonRunner.traceOutputs).toContain("RED:40");
    } finally {
      localStorage.removeItem(store.key);
    }
  });

  test.each(["left", "right"])(
    "Step advances isolated physics and replays recorded poses (%s)",
    async (side) => {
      const sensors = globalThis.Simulator;
      const stepDelay = PythonRunner.stepDelay;
      load("js/robot-config.js", "RobotConfig");
      load("js/simulator.js", "Simulator");
      const markers = [
        {
          x: 0,
          y: 1500,
          width: 500,
          height: 530,
          rgb: [200, 40, 40, 280],
          color: "red",
        },
      ];
      Simulator.setColorZones(markers);
      const random = jest.spyOn(Math, "random").mockReturnValue(0.5);
      const original = {
        x: 300,
        y: 1700,
        heading: 0,
        leftSpeed: 0,
        rightSpeed: 0,
        actualLeftV: 0,
        actualRightV: 0,
        isMoving: false,
        trail: [],
      };
      App.robot = original;
      PythonRunner.shouldStop = false;
      localStorage.setItem(store.key, testSource);
      try {
        await PythonRunner.collectTrace(
          `from aidriver import AIDriver, hold_state\nrobot = AIDriver("${side}")\nprint("RED:" + str(robot.read_color()[0]))\nprint("BEFORE:" + str(robot.read_distance()))\nrobot.drive(200, 200)\nhold_state(0.4)\nprint("AFTER:" + str(robot.read_distance()))\nrobot.rotate_right(200)\nhold_state(0.2)\nprint("GYRO:" + str(robot.read_gyro_z_dps()))\nrobot.brake()\n`,
        );
        const reading = (name) =>
          Number(
            PythonRunner.traceOutputs
              .find((output) => output.startsWith(name + ":"))
              .split(":")[1],
          );
        expect(reading("AFTER")).toBeLessThan(reading("BEFORE"));
        expect(reading("RED")).toBe(200);
        expect(Simulator.getColorZones()).toEqual(markers);
        expect(Math.abs(reading("GYRO"))).toBeGreaterThan(1);
        expect(App.robot).toBe(original);
        expect(original.y).toBe(1700);
        expect(original.trail).toEqual([]);
        const poses = PythonRunner.executionTrace
          .map((step) => step.pose)
          .filter(Boolean);
        expect(poses.length).toBeGreaterThan(0);
        expect(poses[poses.length - 1].y).toBeLessThan(1700);
        PythonRunner.stepDelay = 0;
        await PythonRunner.playTrace();
        expect(App.robot.y).toBe(poses[poses.length - 1].y);
        expect(App.robot.heading).toBe(poses[poses.length - 1].heading);
      } finally {
        globalThis.Simulator = sensors;
        random.mockRestore();
        PythonRunner.stepDelay = stepDelay;
        localStorage.removeItem(store.key);
        PythonRunner.stop();
      }
    },
  );

  test("Step retains a partial trace when a challenge reaches the trace limit", async () => {
    await run("from aidriver import AIDriver\n");
    const maxTraceSteps = PythonRunner.maxTraceSteps;
    PythonRunner.maxTraceSteps = 200;
    localStorage.setItem(store.key, testSource);
    try {
      await expect(
        PythonRunner.collectTrace(
          fs.readFileSync(
            path.join(appDir, "starter-code/challenge-1.py"),
            "utf8",
          ),
        ),
      ).resolves.toBe(true);
      expect(PythonRunner.executionTrace.length).toBeGreaterThan(0);
      expect(
        PythonRunner.executionTrace
          .flatMap((step) => step.commands)
          .some((command) => command.type.startsWith("drive")),
      ).toBe(true);
      expect(PythonRunner.isCollectingTrace).toBe(false);
    } finally {
      PythonRunner.maxTraceSteps = maxTraceSteps;
      localStorage.removeItem(store.key);
    }
  });

  test.each([
    ["BASE_SPEED = 200", "BASE_SPEED = -1000"],
    ["LOOP_DT = 0.05", "LOOP_DT = 0"],
    ["side_Kp = 0.4", "side_Kp = 1e309"],
    ['WALL_SIDE = "left"', 'WALL_SIDE = "middle"'],
    ['DISTANCE_SENSOR = "tof"', 'DISTANCE_SENSOR = "laser"'],
    ["KIT_SERVO_PIN = None", "KIT_SERVO_PIN = 26"],
    ["color_red_ratio = 0.55", "color_red_ratio = 1.2"],
    ["FRONT_STOP_DISTANCE = 150", "FRONT_STOP_DISTANCE = 5000"],
  ])(
    "validates types without restricting values: %s -> %s",
    async (before, after) => {
      await expect(
        store.validate(testSource.replace(before, after)),
      ).resolves.toBe(true);
    },
  );

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

  test.each([false, true])(
    "OLED status and forced writes match hardware (trace=%s)",
    async (trace) => {
      await run(
        'from aidriver import AIDriver\nrobot = AIDriver("left")\nrobot.color_min_clear = 180\nrobot.show_display("CHECK", force=True)\nrobot.display_status("FOLLOW_WALL", 123, 2)\n',
        testSource,
        trace,
      );
      const module = runtime.sysmodules.mp$subscript(
        new runtime.builtin.str("aidriver"),
      );
      const commands = trace
        ? runtime.ffi
            .remapToJs(runtime.misceval.callsimArray(module.$d._get_trace, []))
            .flatMap((step) => step.commands)
        : AIDriverStub.commandQueue;
      expect(
        commands.find((command) => command.type === "display_status").params
          .lines,
      ).toEqual(["FOLLOW_W", "FOK SOK", "S:123", "V:2 non"]);
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
    const source = testSource.replace(
      "BASE_SPEED = 200",
      'BASE_SPEED = "fast"',
    );
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
