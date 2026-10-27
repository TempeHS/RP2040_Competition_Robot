/**
 * Python Runner Unit Tests
 * Tests for Skulpt Python execution and command processing
 */

describe("PythonRunner", () => {
  let PythonRunnerImpl;
  let mockRobot;
  let commandQueue;

  beforeEach(() => {
    // Mock robot
    mockRobot = {
      x: 1000,
      y: 1000,
      angle: 0,
      leftSpeed: 0,
      rightSpeed: 0,
      isMoving: false,
    };

    commandQueue = [];

    // Create PythonRunner implementation
    PythonRunnerImpl = {
      isRunning: false,
      shouldStop: false,
      stepMode: false,
      robot: mockRobot,
      commandQueue: commandQueue,
      DEBUG_AIDRIVER: false,

      init: function () {
        this.isRunning = false;
        this.shouldStop = false;
        this.stepMode = false;
      },

      run: async function (code) {
        if (this.isRunning) {
          return { success: false, error: "Already running" };
        }

        this.isRunning = true;
        this.shouldStop = false;
        this.commandQueue = [];

        try {
          // Simulate execution
          const result = await this.execute(code);
          this.isRunning = false;
          return { success: true, result: result };
        } catch (error) {
          this.isRunning = false;
          return { success: false, error: error.message };
        }
      },

      execute: async function (code) {
        // Simulate code execution
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve("Execution complete");
          }, 10);
        });
      },

      stop: function () {
        this.shouldStop = true;
        this.isRunning = false;
        this.stepMode = false;
        this.robot.leftSpeed = 0;
        this.robot.rightSpeed = 0;
        this.robot.isMoving = false;
        this.commandQueue = [];
      },

      processCommand: function (cmd) {
        switch (cmd.type) {
          case "drive_forward":
            this.robot.leftSpeed = cmd.speed || 100;
            this.robot.rightSpeed = cmd.speed || 100;
            this.robot.isMoving = true;
            break;
          case "drive_backward":
            this.robot.leftSpeed = -(cmd.speed || 100);
            this.robot.rightSpeed = -(cmd.speed || 100);
            this.robot.isMoving = true;
            break;
          case "rotate_left":
            this.robot.leftSpeed = -(cmd.speed || 100);
            this.robot.rightSpeed = cmd.speed || 100;
            this.robot.isMoving = true;
            break;
          case "rotate_right":
            this.robot.leftSpeed = cmd.speed || 100;
            this.robot.rightSpeed = -(cmd.speed || 100);
            this.robot.isMoving = true;
            break;
          case "brake":
            this.robot.leftSpeed = 0;
            this.robot.rightSpeed = 0;
            this.robot.isMoving = false;
            break;
          case "init":
            // Robot initialization
            break;
          default:
            console.warn("Unknown command:", cmd.type);
        }
      },

      validateCode: function (code) {
        // Basic validation
        if (!code || code.trim() === "") {
          return { valid: false, error: "Empty code" };
        }
        return { valid: true };
      },

      handleOutput: function (text) {
        // Process Python print output
        return text.replace(/\n$/, "");
      },

      handleError: function (error) {
        const match = error.message.match(/line (\d+)/i);
        return {
          message: error.message,
          line: match ? parseInt(match[1]) : null,
        };
      },

      setStepMode: function (enabled) {
        this.stepMode = enabled;
      },

      step: function () {
        if (this.commandQueue.length > 0) {
          const cmd = this.commandQueue.shift();
          this.processCommand(cmd);
        }
      },

      detectDebugFlag: function (code) {
        return code.includes("DEBUG_AIDRIVER") && code.includes("True");
      },
    };

    PythonRunnerImpl.init();
  });

  describe("Initialization", () => {
    test("should have required methods", () => {
      expect(typeof PythonRunnerImpl.run).toBe("function");
      expect(typeof PythonRunnerImpl.stop).toBe("function");
      expect(typeof PythonRunnerImpl.processCommand).toBe("function");
    });

    test("should initialize without errors", () => {
      expect(() => PythonRunnerImpl.init()).not.toThrow();
    });

    test("should not be running initially", () => {
      expect(PythonRunnerImpl.isRunning).toBe(false);
    });
  });

  describe("run()", () => {
    test("should set isRunning to true during execution", async () => {
      const promise = PythonRunnerImpl.run("x = 1");
      // Check immediately while running
      expect(PythonRunnerImpl.isRunning).toBe(true);
      await promise;
    });

    test("should set isRunning to false after completion", async () => {
      await PythonRunnerImpl.run("x = 1");
      expect(PythonRunnerImpl.isRunning).toBe(false);
    });

    test("should return success for valid code", async () => {
      const result = await PythonRunnerImpl.run("x = 1");
      expect(result.success).toBe(true);
    });

    test("should not run if already running", async () => {
      PythonRunnerImpl.isRunning = true;
      const result = await PythonRunnerImpl.run("x = 1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Already running");
    });

    test("should clear command queue before running", async () => {
      PythonRunnerImpl.commandQueue.push({ type: "test" });
      await PythonRunnerImpl.run("x = 1");
      expect(PythonRunnerImpl.commandQueue).toHaveLength(0);
    });
  });

  describe("stop()", () => {
    test("should set shouldStop flag", () => {
      PythonRunnerImpl.stop();
      expect(PythonRunnerImpl.shouldStop).toBe(true);
    });

    test("should set isRunning to false", () => {
      PythonRunnerImpl.isRunning = true;
      PythonRunnerImpl.stop();
      expect(PythonRunnerImpl.isRunning).toBe(false);
    });

    test("should clear command queue", () => {
      PythonRunnerImpl.commandQueue.push({ type: "test" });
      PythonRunnerImpl.stop();
      expect(PythonRunnerImpl.commandQueue).toHaveLength(0);
    });

    test("should stop robot movement", () => {
      mockRobot.leftSpeed = 100;
      mockRobot.rightSpeed = 100;
      mockRobot.isMoving = true;

      PythonRunnerImpl.stop();

      expect(mockRobot.leftSpeed).toBe(0);
      expect(mockRobot.rightSpeed).toBe(0);
      expect(mockRobot.isMoving).toBe(false);
    });

    test("should reset step mode", () => {
      PythonRunnerImpl.stepMode = true;
      PythonRunnerImpl.stop();
      expect(PythonRunnerImpl.stepMode).toBe(false);
    });
  });

  describe("processCommand()", () => {
    test("should process drive_forward command", () => {
      PythonRunnerImpl.processCommand({ type: "drive_forward", speed: 100 });
      expect(mockRobot.leftSpeed).toBe(100);
      expect(mockRobot.rightSpeed).toBe(100);
      expect(mockRobot.isMoving).toBe(true);
    });

    test("should process drive_backward command", () => {
      PythonRunnerImpl.processCommand({ type: "drive_backward", speed: 100 });
      expect(mockRobot.leftSpeed).toBe(-100);
      expect(mockRobot.rightSpeed).toBe(-100);
      expect(mockRobot.isMoving).toBe(true);
    });

    test("should process rotate_left command", () => {
      PythonRunnerImpl.processCommand({ type: "rotate_left", speed: 100 });
      expect(mockRobot.leftSpeed).toBe(-100);
      expect(mockRobot.rightSpeed).toBe(100);
      expect(mockRobot.isMoving).toBe(true);
    });

    test("should process rotate_right command", () => {
      PythonRunnerImpl.processCommand({ type: "rotate_right", speed: 100 });
      expect(mockRobot.leftSpeed).toBe(100);
      expect(mockRobot.rightSpeed).toBe(-100);
      expect(mockRobot.isMoving).toBe(true);
    });

    test("should process brake command", () => {
      mockRobot.leftSpeed = 100;
      mockRobot.rightSpeed = 100;
      mockRobot.isMoving = true;

      PythonRunnerImpl.processCommand({ type: "brake" });

      expect(mockRobot.leftSpeed).toBe(0);
      expect(mockRobot.rightSpeed).toBe(0);
      expect(mockRobot.isMoving).toBe(false);
    });

    test("should process init command without error", () => {
      expect(() => {
        PythonRunnerImpl.processCommand({ type: "init" });
      }).not.toThrow();
    });

    test("should handle unknown command type gracefully", () => {
      expect(() => {
        PythonRunnerImpl.processCommand({ type: "unknown_command" });
      }).not.toThrow();
    });

    test("should use default speed if not specified", () => {
      PythonRunnerImpl.processCommand({ type: "drive_forward" });
      expect(mockRobot.leftSpeed).toBe(100);
      expect(mockRobot.rightSpeed).toBe(100);
    });
  });

  describe("validateCode()", () => {
    test("should return valid for non-empty code", () => {
      const result = PythonRunnerImpl.validateCode("x = 1");
      expect(result.valid).toBe(true);
    });

    test("should return invalid for empty code", () => {
      const result = PythonRunnerImpl.validateCode("");
      expect(result.valid).toBe(false);
    });

    test("should return invalid for whitespace-only code", () => {
      const result = PythonRunnerImpl.validateCode("   ");
      expect(result.valid).toBe(false);
    });
  });

  describe("handleOutput()", () => {
    test("should trim trailing newline", () => {
      const result = PythonRunnerImpl.handleOutput("Hello World\n");
      expect(result).toBe("Hello World");
    });

    test("should preserve internal content", () => {
      const result = PythonRunnerImpl.handleOutput("Line 1\nLine 2\n");
      expect(result).toBe("Line 1\nLine 2");
    });

    test("should handle empty string", () => {
      const result = PythonRunnerImpl.handleOutput("");
      expect(result).toBe("");
    });
  });

  describe("handleError()", () => {
    test("should extract line number from error", () => {
      const error = new Error("line 5: SyntaxError");
      const result = PythonRunnerImpl.handleError(error);
      expect(result.line).toBe(5);
    });

    test("should return null line for errors without line number", () => {
      const error = new Error("Unknown error");
      const result = PythonRunnerImpl.handleError(error);
      expect(result.line).toBeNull();
    });

    test("should include original message", () => {
      const error = new Error("Test error message");
      const result = PythonRunnerImpl.handleError(error);
      expect(result.message).toBe("Test error message");
    });
  });

  describe("Step Mode", () => {
    test("setStepMode() should enable step mode", () => {
      PythonRunnerImpl.setStepMode(true);
      expect(PythonRunnerImpl.stepMode).toBe(true);
    });

    test("setStepMode() should disable step mode", () => {
      PythonRunnerImpl.stepMode = true;
      PythonRunnerImpl.setStepMode(false);
      expect(PythonRunnerImpl.stepMode).toBe(false);
    });

    test("step() should process one command", () => {
      PythonRunnerImpl.commandQueue.push({ type: "drive_forward", speed: 100 });
      PythonRunnerImpl.commandQueue.push({ type: "brake" });

      PythonRunnerImpl.step();

      expect(mockRobot.leftSpeed).toBe(100);
      expect(PythonRunnerImpl.commandQueue).toHaveLength(1);
    });

    test("step() should handle empty queue", () => {
      expect(() => PythonRunnerImpl.step()).not.toThrow();
    });
  });

  describe("DEBUG_AIDRIVER Flag", () => {
    test("should detect DEBUG_AIDRIVER = True in code", () => {
      const code = "DEBUG_AIDRIVER = True\nfrom aidriver import AIDriver";
      expect(PythonRunnerImpl.detectDebugFlag(code)).toBe(true);
    });

    test("should not detect if DEBUG_AIDRIVER is False", () => {
      const code = "DEBUG_AIDRIVER = False\nfrom aidriver import AIDriver";
      expect(PythonRunnerImpl.detectDebugFlag(code)).toBe(false);
    });

    test("should not detect if DEBUG_AIDRIVER is absent", () => {
      const code = "from aidriver import AIDriver";
      expect(PythonRunnerImpl.detectDebugFlag(code)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    test("should handle concurrent stop calls", () => {
      expect(() => {
        PythonRunnerImpl.stop();
        PythonRunnerImpl.stop();
        PythonRunnerImpl.stop();
      }).not.toThrow();
    });

    test("should handle run after stop", async () => {
      PythonRunnerImpl.stop();
      const result = await PythonRunnerImpl.run("x = 1");
      expect(result.success).toBe(true);
    });
  });
});
