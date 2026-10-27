/**
 * AIDriver Stub Unit Tests
 * Tests for the Skulpt module that bridges Python to JavaScript
 */

describe("AIDriverStub", () => {
  let AIDriverStubImpl;
  let mockRobot;

  beforeEach(() => {
    // Mock robot state
    mockRobot = {
      x: 1000,
      y: 1000,
      angle: 0,
      leftSpeed: 0,
      rightSpeed: 0,
      isMoving: false,
    };

    // Create AIDriverStub implementation
    AIDriverStubImpl = {
      commandQueue: [],
      robot: mockRobot,
      DEBUG_AIDRIVER: false,
      speed: 100,

      // Queue management
      clearQueue: function () {
        this.commandQueue = [];
      },

      queueCommand: function (command) {
        this.commandQueue.push(command);
      },

      getQueue: function () {
        return this.commandQueue;
      },

      // Motor commands
      drive_forward: function (speed = 100) {
        this.queueCommand({ type: "drive_forward", speed: speed });
      },

      drive_backward: function (speed = 100) {
        this.queueCommand({ type: "drive_backward", speed: speed });
      },

      rotate_left: function (speed = 100) {
        this.queueCommand({ type: "rotate_left", speed: speed });
      },

      rotate_right: function (speed = 100) {
        this.queueCommand({ type: "rotate_right", speed: speed });
      },

      brake: function () {
        this.queueCommand({ type: "brake" });
      },

      // Motor control
      set_motor_speed: function (left, right) {
        this.queueCommand({
          type: "set_motor_speed",
          left: left,
          right: right,
        });
      },

      // Sensor reading
      get_ultrasonic: function () {
        // Return simulated distance
        return 500;
      },

      // Sleep (simulated)
      sleep_ms: function (ms) {
        this.queueCommand({ type: "sleep_ms", duration: ms });
      },

      // Debug mode
      setDebugMode: function (enabled) {
        this.DEBUG_AIDRIVER = enabled;
      },

      isDebugMode: function () {
        return this.DEBUG_AIDRIVER;
      },

      // Process queue
      processNext: function () {
        if (this.commandQueue.length === 0) return null;
        return this.commandQueue.shift();
      },

      hasCommands: function () {
        return this.commandQueue.length > 0;
      },
    };
  });

  describe("Command Queue", () => {
    test("should start with empty queue", () => {
      expect(AIDriverStubImpl.getQueue()).toHaveLength(0);
    });

    test("clearQueue() should empty the queue", () => {
      AIDriverStubImpl.queueCommand({ type: "test" });
      AIDriverStubImpl.clearQueue();
      expect(AIDriverStubImpl.getQueue()).toHaveLength(0);
    });

    test("queueCommand() should add to queue", () => {
      AIDriverStubImpl.queueCommand({ type: "test" });
      expect(AIDriverStubImpl.getQueue()).toHaveLength(1);
    });

    test("processNext() should return and remove first command", () => {
      AIDriverStubImpl.queueCommand({ type: "first" });
      AIDriverStubImpl.queueCommand({ type: "second" });

      const cmd = AIDriverStubImpl.processNext();
      expect(cmd.type).toBe("first");
      expect(AIDriverStubImpl.getQueue()).toHaveLength(1);
    });

    test("processNext() should return null for empty queue", () => {
      expect(AIDriverStubImpl.processNext()).toBeNull();
    });

    test("hasCommands() should return true when queue has items", () => {
      AIDriverStubImpl.queueCommand({ type: "test" });
      expect(AIDriverStubImpl.hasCommands()).toBe(true);
    });

    test("hasCommands() should return false when queue is empty", () => {
      expect(AIDriverStubImpl.hasCommands()).toBe(false);
    });
  });

  describe("drive_forward()", () => {
    test("should queue drive_forward command", () => {
      AIDriverStubImpl.drive_forward();
      const queue = AIDriverStubImpl.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].type).toBe("drive_forward");
    });

    test("should use default speed of 100", () => {
      AIDriverStubImpl.drive_forward();
      const queue = AIDriverStubImpl.getQueue();
      expect(queue[0].speed).toBe(100);
    });

    test("should use custom speed", () => {
      AIDriverStubImpl.drive_forward(50);
      const queue = AIDriverStubImpl.getQueue();
      expect(queue[0].speed).toBe(50);
    });
  });

  describe("drive_backward()", () => {
    test("should queue drive_backward command", () => {
      AIDriverStubImpl.drive_backward();
      const queue = AIDriverStubImpl.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].type).toBe("drive_backward");
    });

    test("should use default speed of 100", () => {
      AIDriverStubImpl.drive_backward();
      expect(AIDriverStubImpl.getQueue()[0].speed).toBe(100);
    });

    test("should use custom speed", () => {
      AIDriverStubImpl.drive_backward(75);
      expect(AIDriverStubImpl.getQueue()[0].speed).toBe(75);
    });
  });

  describe("rotate_left()", () => {
    test("should queue rotate_left command", () => {
      AIDriverStubImpl.rotate_left();
      const queue = AIDriverStubImpl.getQueue();
      expect(queue[0].type).toBe("rotate_left");
    });

    test("should use default speed", () => {
      AIDriverStubImpl.rotate_left();
      expect(AIDriverStubImpl.getQueue()[0].speed).toBe(100);
    });
  });

  describe("rotate_right()", () => {
    test("should queue rotate_right command", () => {
      AIDriverStubImpl.rotate_right();
      const queue = AIDriverStubImpl.getQueue();
      expect(queue[0].type).toBe("rotate_right");
    });

    test("should use default speed", () => {
      AIDriverStubImpl.rotate_right();
      expect(AIDriverStubImpl.getQueue()[0].speed).toBe(100);
    });
  });

  describe("brake()", () => {
    test("should queue brake command", () => {
      AIDriverStubImpl.brake();
      const queue = AIDriverStubImpl.getQueue();
      expect(queue[0].type).toBe("brake");
    });

    test("should have no speed parameter", () => {
      AIDriverStubImpl.brake();
      expect(AIDriverStubImpl.getQueue()[0].speed).toBeUndefined();
    });
  });

  describe("set_motor_speed()", () => {
    test("should queue set_motor_speed command", () => {
      AIDriverStubImpl.set_motor_speed(50, 75);
      const queue = AIDriverStubImpl.getQueue();
      expect(queue[0].type).toBe("set_motor_speed");
      expect(queue[0].left).toBe(50);
      expect(queue[0].right).toBe(75);
    });

    test("should handle negative speeds", () => {
      AIDriverStubImpl.set_motor_speed(-100, -100);
      const queue = AIDriverStubImpl.getQueue();
      expect(queue[0].left).toBe(-100);
      expect(queue[0].right).toBe(-100);
    });

    test("should handle differential speeds", () => {
      AIDriverStubImpl.set_motor_speed(-50, 50);
      const queue = AIDriverStubImpl.getQueue();
      expect(queue[0].left).toBe(-50);
      expect(queue[0].right).toBe(50);
    });
  });

  describe("get_ultrasonic()", () => {
    test("should return a number", () => {
      const distance = AIDriverStubImpl.get_ultrasonic();
      expect(typeof distance).toBe("number");
    });

    test("should return positive value", () => {
      const distance = AIDriverStubImpl.get_ultrasonic();
      expect(distance).toBeGreaterThan(0);
    });
  });

  describe("sleep_ms()", () => {
    test("should queue sleep command", () => {
      AIDriverStubImpl.sleep_ms(1000);
      const queue = AIDriverStubImpl.getQueue();
      expect(queue[0].type).toBe("sleep_ms");
      expect(queue[0].duration).toBe(1000);
    });

    test("should handle short durations", () => {
      AIDriverStubImpl.sleep_ms(10);
      expect(AIDriverStubImpl.getQueue()[0].duration).toBe(10);
    });

    test("should handle long durations", () => {
      AIDriverStubImpl.sleep_ms(60000);
      expect(AIDriverStubImpl.getQueue()[0].duration).toBe(60000);
    });
  });

  describe("Debug Mode", () => {
    test("should default to false", () => {
      expect(AIDriverStubImpl.isDebugMode()).toBe(false);
    });

    test("setDebugMode(true) should enable debug", () => {
      AIDriverStubImpl.setDebugMode(true);
      expect(AIDriverStubImpl.isDebugMode()).toBe(true);
    });

    test("setDebugMode(false) should disable debug", () => {
      AIDriverStubImpl.setDebugMode(true);
      AIDriverStubImpl.setDebugMode(false);
      expect(AIDriverStubImpl.isDebugMode()).toBe(false);
    });
  });

  describe("Command Sequencing", () => {
    test("should maintain command order", () => {
      AIDriverStubImpl.drive_forward();
      AIDriverStubImpl.sleep_ms(500);
      AIDriverStubImpl.rotate_left();
      AIDriverStubImpl.sleep_ms(500);
      AIDriverStubImpl.brake();

      const queue = AIDriverStubImpl.getQueue();
      expect(queue[0].type).toBe("drive_forward");
      expect(queue[1].type).toBe("sleep_ms");
      expect(queue[2].type).toBe("rotate_left");
      expect(queue[3].type).toBe("sleep_ms");
      expect(queue[4].type).toBe("brake");
    });

    test("should process commands in FIFO order", () => {
      AIDriverStubImpl.drive_forward();
      AIDriverStubImpl.drive_backward();
      AIDriverStubImpl.brake();

      expect(AIDriverStubImpl.processNext().type).toBe("drive_forward");
      expect(AIDriverStubImpl.processNext().type).toBe("drive_backward");
      expect(AIDriverStubImpl.processNext().type).toBe("brake");
    });
  });

  describe("Edge Cases", () => {
    test("should handle zero speed", () => {
      AIDriverStubImpl.drive_forward(0);
      expect(AIDriverStubImpl.getQueue()[0].speed).toBe(0);
    });

    test("should handle very high speed", () => {
      AIDriverStubImpl.drive_forward(1000);
      expect(AIDriverStubImpl.getQueue()[0].speed).toBe(1000);
    });

    test("should handle many commands", () => {
      for (let i = 0; i < 100; i++) {
        AIDriverStubImpl.drive_forward();
      }
      expect(AIDriverStubImpl.getQueue()).toHaveLength(100);
    });

    test("should handle clear and add", () => {
      AIDriverStubImpl.drive_forward();
      AIDriverStubImpl.clearQueue();
      AIDriverStubImpl.drive_backward();
      expect(AIDriverStubImpl.getQueue()).toHaveLength(1);
      expect(AIDriverStubImpl.getQueue()[0].type).toBe("drive_backward");
    });
  });
});
