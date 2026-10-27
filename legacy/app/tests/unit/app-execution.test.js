const fs = require("fs");
const path = require("path");
const vm = require("vm");

function deferred() {
  let resolve;
  const promise = new Promise((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

describe("Actual app execution controls", () => {
  let context;
  let pending;

  beforeEach(() => {
    pending = [];
    document.body.innerHTML =
      '<button id="run"></button><button id="step"></button><button id="stop"></button><span id="status"></span>';
    context = {
      console,
      window: {},
      document: {
        addEventListener: jest.fn(),
        getElementById: (id) => document.getElementById(id),
      },
      Editor: { flushSave: jest.fn(), getCode: () => 'print("test")' },
      DebugPanel: Object.fromEntries(
        ["info", "success", "warning", "error"].map((method) => [
          method,
          jest.fn(),
        ]),
      ),
      PythonRunner: {
        executionId: 0,
        run: jest.fn(() => {
          context.PythonRunner.executionId++;
          const execution = deferred();
          pending.push(execution);
          return execution.promise;
        }),
        runStepMode: jest.fn(() => {
          context.PythonRunner.executionId++;
          const execution = deferred();
          pending.push(execution);
          return execution.promise;
        }),
        stop: jest.fn(() => {
          context.PythonRunner.executionId++;
        }),
      },
    };
    vm.createContext(context);
    vm.runInContext(
      fs.readFileSync(path.resolve(__dirname, "../../js/app.js"), "utf8"),
      context,
    );
    context.App = context.window.App;
    context.App.elements = {
      btnRun: document.getElementById("run"),
      btnStep: document.getElementById("step"),
      btnStop: document.getElementById("stop"),
      challengeStatus: document.getElementById("status"),
    };
    context.expandDebugPanel = jest.fn();
    context.collapseDebugPanel = jest.fn();
    context.updateStatus = jest.fn();
  });

  afterEach(() => {
    pending.forEach((execution) => execution.resolve(false));
  });

  test("a cancelled Run cannot finish a newer Run", async () => {
    context.runCode();
    context.stopExecution();
    context.runCode();
    pending[0].resolve(false);
    await pending[0].promise;
    expect(context.App.isRunning).toBe(true);
    expect(context.App.elements.challengeStatus.textContent).toBe("Running");
    expect(context.PythonRunner.stop).toHaveBeenCalledTimes(1);
  });

  test("wall-side changes mirror colour markers and restore the canonical frame", () => {
    vm.runInContext(
      fs.readFileSync(
        path.resolve(__dirname, "../../js/robot-config.js"),
        "utf8",
      ) +
        "\n" +
        fs.readFileSync(
          path.resolve(__dirname, "../../js/simulator.js"),
          "utf8",
        ) +
        "\nthis.Simulator = Simulator;",
      context,
    );
    context.render = jest.fn();
    const start = { x: 145, y: 1885, heading: 0 };
    const zone = { x: 0, y: 0, width: 290, height: 290 };
    const markers = [
      {
        x: 0,
        y: 1740,
        width: 290,
        height: 290,
        rgb: [200, 200, 200, 620],
        color: "silver",
      },
    ];
    context.App.currentChallengeConfig = {
      startPosition: start,
      successCriteria: { zone: { ...zone } },
      colorZones: markers,
    };
    context.App.session = { startPosition: { ...start } };
    context.App.robot = { ...start, trail: [] };
    context.Simulator.setColorZones(markers);
    context.App.onAIDriverInstantiated("right");
    expect(context.Simulator.simulateColor(context.App.robot).name).toBe(
      "silver",
    );
    expect(context.App.robot.x).toBe(1885);
    context.App.onAIDriverInstantiated("left");
    expect(context.App.robot.x).toBe(145);
    expect(context.App.currentChallengeConfig.successCriteria.zone).toEqual(
      zone,
    );
    expect(context.Simulator.getColorZones()).toEqual(markers);
  });

  test("Step cannot start a second trace during collection", async () => {
    const first = context.stepCode();
    const second = context.stepCode();
    expect(context.PythonRunner.runStepMode).toHaveBeenCalledTimes(1);
    pending[0].resolve(true);
    await Promise.all([first, second]);
  });

  test("stopped Step cannot overwrite Reset controls", async () => {
    const stepping = context.stepCode();
    context.stopExecution();
    context.App.hasRun = false;
    context.App.elements.btnRun.disabled = false;
    context.App.elements.challengeStatus.textContent = "Ready";
    pending[0].resolve(false);
    await stepping;
    expect(context.App.elements.btnRun.disabled).toBe(false);
    expect(context.App.elements.challengeStatus.textContent).toBe("Ready");
  });

  test.each([true, false])(
    "challenge success respects the active session (running=%s)",
    (running) => {
      context.App.currentChallengeConfig = {};
      context.App.session = { startTime: Date.now() - 3000 };
      context.App.isRunning = running;
      context.PythonRunner.isRunning = running;
      context.App.elements.canvasContainer = document.createElement("div");
      context.Challenges = {
        checkSuccess: jest.fn(() => ({
          success: true,
          message: "Goal reached",
        })),
      };
      context.checkChallengeSuccess();
      expect(context.Challenges.checkSuccess).toHaveBeenCalledTimes(
        running ? 1 : 0,
      );
      if (running) {
        expect(context.App.elements.challengeStatus.textContent).toBe(
          "SUCCESS!",
        );
        expect(context.App.isRunning).toBe(false);
      }
    },
  );

  test("completed Step stops motor outputs and motion", async () => {
    const stepping = context.stepCode();
    Object.assign(context.App.robot, {
      leftSpeed: 200,
      rightSpeed: 200,
      actualLeftV: 50,
      actualRightV: 50,
      isMoving: true,
    });
    pending[0].resolve(true);
    await stepping;
    expect(context.App.robot.leftSpeed).toBe(0);
    expect(context.App.robot.rightSpeed).toBe(0);
    expect(context.App.robot.actualLeftV).toBe(0);
    expect(context.App.robot.actualRightV).toBe(0);
    expect(context.App.robot.isMoving).toBe(false);
    expect(context.App.elements.challengeStatus.textContent).toBe("Completed");
  });
});
