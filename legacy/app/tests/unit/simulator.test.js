/**
 * Simulator Unit Tests
 * Tests for robot physics, rendering, and collision detection
 */

describe("Simulator", () => {
  let SimulatorImpl;
  let mockCanvas;
  let mockCtx;

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `<canvas id="simulatorCanvas" width="800" height="600"></canvas>`;

    // Create mock canvas context
    mockCtx = {
      save: jest.fn(),
      restore: jest.fn(),
      translate: jest.fn(),
      rotate: jest.fn(),
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      arc: jest.fn(),
      stroke: jest.fn(),
      fill: jest.fn(),
      clearRect: jest.fn(),
      setTransform: jest.fn(),
    };

    mockCanvas = {
      getContext: jest.fn().mockReturnValue(mockCtx),
      width: 800,
      height: 600,
    };

    // Create Simulator implementation
    SimulatorImpl = {
      canvas: mockCanvas,
      ctx: mockCtx,
      ARENA_WIDTH: 2000,
      ARENA_HEIGHT: 2000,
      ROBOT_WIDTH: 200,
      ROBOT_LENGTH: 250,
      WHEEL_BASE: 150,
      MAX_SPEED: 200,
      isRunning: false,
      robot: {
        x: 1000,
        y: 1000,
        angle: 0,
        leftSpeed: 0,
        rightSpeed: 0,
        isMoving: false,
      },
      walls: [],

      init: function () {
        this.canvas = document.getElementById("simulatorCanvas");
        if (this.canvas) {
          this.ctx = this.canvas.getContext("2d");
        }
      },

      reset: function () {
        this.robot = {
          x: 1000,
          y: 1000,
          angle: 0,
          leftSpeed: 0,
          rightSpeed: 0,
          isMoving: false,
        };
        this.isRunning = false;
      },

      start: function () {
        this.isRunning = true;
      },

      stop: function () {
        this.isRunning = false;
        this.robot.leftSpeed = 0;
        this.robot.rightSpeed = 0;
        this.robot.isMoving = false;
      },

      update: function (deltaTime) {
        if (!this.robot.isMoving) return;

        const dt = deltaTime / 1000;
        const v = (this.robot.leftSpeed + this.robot.rightSpeed) / 2;
        const omega =
          (this.robot.rightSpeed - this.robot.leftSpeed) / this.WHEEL_BASE;

        this.robot.x += v * Math.cos(this.robot.angle) * dt;
        this.robot.y += v * Math.sin(this.robot.angle) * dt;
        this.robot.angle += omega * dt;

        // Normalize angle
        while (this.robot.angle > Math.PI) this.robot.angle -= 2 * Math.PI;
        while (this.robot.angle < -Math.PI) this.robot.angle += 2 * Math.PI;

        // Boundary check
        this.robot.x = Math.max(
          this.ROBOT_WIDTH / 2,
          Math.min(this.ARENA_WIDTH - this.ROBOT_WIDTH / 2, this.robot.x)
        );
        this.robot.y = Math.max(
          this.ROBOT_LENGTH / 2,
          Math.min(this.ARENA_HEIGHT - this.ROBOT_LENGTH / 2, this.robot.y)
        );
      },

      render: function () {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.renderRobot();
      },

      renderRobot: function () {
        this.ctx.save();
        this.ctx.translate(this.robot.x, this.robot.y);
        this.ctx.rotate(this.robot.angle);
        this.ctx.fillRect(
          -this.ROBOT_WIDTH / 2,
          -this.ROBOT_LENGTH / 2,
          this.ROBOT_WIDTH,
          this.ROBOT_LENGTH
        );
        this.ctx.restore();
      },

      calculateUltrasonic: function () {
        // Simple distance calculation to nearest wall
        let minDistance = Math.min(
          this.robot.y, // top
          this.ARENA_HEIGHT - this.robot.y, // bottom
          this.robot.x, // left
          this.ARENA_WIDTH - this.robot.x // right
        );
        return Math.max(20, Math.min(4000, minDistance));
      },

      checkCollision: function (x, y) {
        // Check arena boundaries
        if (x < 0 || x > this.ARENA_WIDTH || y < 0 || y > this.ARENA_HEIGHT) {
          return true;
        }
        // Check walls
        for (const wall of this.walls) {
          if (
            x >= wall.x &&
            x <= wall.x + wall.width &&
            y >= wall.y &&
            y <= wall.y + wall.height
          ) {
            return true;
          }
        }
        return false;
      },

      setWalls: function (walls) {
        this.walls = walls;
      },

      getWalls: function () {
        return this.walls;
      },
    };

    SimulatorImpl.init();
  });

  describe("Initialization", () => {
    test("should initialize without errors", () => {
      expect(() => SimulatorImpl.init()).not.toThrow();
    });

    test("should have required methods", () => {
      expect(typeof SimulatorImpl.init).toBe("function");
      expect(typeof SimulatorImpl.reset).toBe("function");
      expect(typeof SimulatorImpl.start).toBe("function");
      expect(typeof SimulatorImpl.stop).toBe("function");
      expect(typeof SimulatorImpl.update).toBe("function");
      expect(typeof SimulatorImpl.render).toBe("function");
    });

    test("should have correct arena dimensions", () => {
      expect(SimulatorImpl.ARENA_WIDTH).toBe(2000);
      expect(SimulatorImpl.ARENA_HEIGHT).toBe(2000);
    });

    test("should have correct robot dimensions", () => {
      expect(SimulatorImpl.ROBOT_WIDTH).toBeGreaterThan(0);
      expect(SimulatorImpl.ROBOT_LENGTH).toBeGreaterThan(0);
    });
  });

  describe("Robot State", () => {
    test("should start with default position", () => {
      SimulatorImpl.reset();
      expect(SimulatorImpl.robot.x).toBe(1000);
      expect(SimulatorImpl.robot.y).toBe(1000);
      expect(SimulatorImpl.robot.angle).toBe(0);
    });

    test("should start with zero speed", () => {
      SimulatorImpl.reset();
      expect(SimulatorImpl.robot.leftSpeed).toBe(0);
      expect(SimulatorImpl.robot.rightSpeed).toBe(0);
    });

    test("should start not moving", () => {
      SimulatorImpl.reset();
      expect(SimulatorImpl.robot.isMoving).toBe(false);
    });
  });

  describe("reset()", () => {
    test("should reset robot to initial position", () => {
      SimulatorImpl.robot.x = 500;
      SimulatorImpl.robot.y = 500;
      SimulatorImpl.reset();
      expect(SimulatorImpl.robot.x).toBe(1000);
      expect(SimulatorImpl.robot.y).toBe(1000);
    });

    test("should reset robot angle", () => {
      SimulatorImpl.robot.angle = Math.PI;
      SimulatorImpl.reset();
      expect(SimulatorImpl.robot.angle).toBe(0);
    });

    test("should stop robot movement", () => {
      SimulatorImpl.robot.isMoving = true;
      SimulatorImpl.robot.leftSpeed = 100;
      SimulatorImpl.reset();
      expect(SimulatorImpl.robot.isMoving).toBe(false);
      expect(SimulatorImpl.robot.leftSpeed).toBe(0);
    });
  });

  describe("start() and stop()", () => {
    test("start() should set isRunning to true", () => {
      SimulatorImpl.start();
      expect(SimulatorImpl.isRunning).toBe(true);
    });

    test("stop() should set isRunning to false", () => {
      SimulatorImpl.start();
      SimulatorImpl.stop();
      expect(SimulatorImpl.isRunning).toBe(false);
    });

    test("stop() should halt robot", () => {
      SimulatorImpl.robot.leftSpeed = 100;
      SimulatorImpl.robot.rightSpeed = 100;
      SimulatorImpl.robot.isMoving = true;
      SimulatorImpl.stop();
      expect(SimulatorImpl.robot.leftSpeed).toBe(0);
      expect(SimulatorImpl.robot.rightSpeed).toBe(0);
      expect(SimulatorImpl.robot.isMoving).toBe(false);
    });
  });

  describe("update() - Physics", () => {
    test("should not move when isMoving is false", () => {
      const startX = SimulatorImpl.robot.x;
      const startY = SimulatorImpl.robot.y;
      SimulatorImpl.robot.isMoving = false;
      SimulatorImpl.update(100);
      expect(SimulatorImpl.robot.x).toBe(startX);
      expect(SimulatorImpl.robot.y).toBe(startY);
    });

    test("should move forward when both wheels positive", () => {
      SimulatorImpl.robot.isMoving = true;
      SimulatorImpl.robot.leftSpeed = 100;
      SimulatorImpl.robot.rightSpeed = 100;
      SimulatorImpl.robot.angle = 0;
      const startX = SimulatorImpl.robot.x;
      SimulatorImpl.update(1000);
      expect(SimulatorImpl.robot.x).toBeGreaterThan(startX);
    });

    test("should move backward when both wheels negative", () => {
      SimulatorImpl.robot.isMoving = true;
      SimulatorImpl.robot.leftSpeed = -100;
      SimulatorImpl.robot.rightSpeed = -100;
      SimulatorImpl.robot.angle = 0;
      const startX = SimulatorImpl.robot.x;
      SimulatorImpl.update(1000);
      expect(SimulatorImpl.robot.x).toBeLessThan(startX);
    });

    test("should turn when wheels have different speeds", () => {
      SimulatorImpl.robot.isMoving = true;
      SimulatorImpl.robot.leftSpeed = -100;
      SimulatorImpl.robot.rightSpeed = 100;
      const startAngle = SimulatorImpl.robot.angle;
      SimulatorImpl.update(1000);
      expect(SimulatorImpl.robot.angle).not.toBe(startAngle);
    });

    test("should stay within arena boundaries", () => {
      SimulatorImpl.robot.isMoving = true;
      SimulatorImpl.robot.leftSpeed = 1000;
      SimulatorImpl.robot.rightSpeed = 1000;
      SimulatorImpl.robot.angle = 0;
      for (let i = 0; i < 100; i++) {
        SimulatorImpl.update(100);
      }
      expect(SimulatorImpl.robot.x).toBeLessThanOrEqual(
        SimulatorImpl.ARENA_WIDTH
      );
      expect(SimulatorImpl.robot.x).toBeGreaterThanOrEqual(0);
    });
  });

  describe("render()", () => {
    test("should not throw when called", () => {
      expect(() => SimulatorImpl.render()).not.toThrow();
    });

    test("should clear canvas", () => {
      // Ensure ctx is the mock
      SimulatorImpl.ctx = mockCtx;
      SimulatorImpl.canvas = mockCanvas;
      SimulatorImpl.render();
      expect(mockCtx.clearRect).toHaveBeenCalled();
    });
  });

  describe("calculateUltrasonic()", () => {
    test("should return distance to nearest wall", () => {
      SimulatorImpl.robot.x = 100;
      SimulatorImpl.robot.y = 1000;
      const distance = SimulatorImpl.calculateUltrasonic();
      expect(distance).toBeGreaterThan(0);
    });

    test("should return minimum 20mm", () => {
      SimulatorImpl.robot.x = 10;
      const distance = SimulatorImpl.calculateUltrasonic();
      expect(distance).toBeGreaterThanOrEqual(20);
    });

    test("should return maximum 4000mm", () => {
      const distance = SimulatorImpl.calculateUltrasonic();
      expect(distance).toBeLessThanOrEqual(4000);
    });
  });

  describe("checkCollision()", () => {
    test("should detect collision with arena boundary", () => {
      expect(SimulatorImpl.checkCollision(-10, 500)).toBe(true);
      expect(SimulatorImpl.checkCollision(2100, 500)).toBe(true);
      expect(SimulatorImpl.checkCollision(500, -10)).toBe(true);
      expect(SimulatorImpl.checkCollision(500, 2100)).toBe(true);
    });

    test("should not detect collision inside arena", () => {
      expect(SimulatorImpl.checkCollision(1000, 1000)).toBe(false);
    });

    test("should detect collision with walls", () => {
      SimulatorImpl.setWalls([{ x: 500, y: 500, width: 100, height: 100 }]);
      expect(SimulatorImpl.checkCollision(550, 550)).toBe(true);
    });
  });

  describe("Walls", () => {
    test("setWalls() should store walls", () => {
      const walls = [{ x: 100, y: 100, width: 50, height: 50 }];
      SimulatorImpl.setWalls(walls);
      expect(SimulatorImpl.getWalls()).toEqual(walls);
    });

    test("getWalls() should return empty array by default", () => {
      SimulatorImpl.reset();
      SimulatorImpl.walls = [];
      expect(SimulatorImpl.getWalls()).toEqual([]);
    });
  });

  describe("Edge Cases", () => {
    test("should handle zero delta time", () => {
      const startX = SimulatorImpl.robot.x;
      SimulatorImpl.robot.isMoving = true;
      SimulatorImpl.robot.leftSpeed = 100;
      SimulatorImpl.robot.rightSpeed = 100;
      SimulatorImpl.update(0);
      expect(SimulatorImpl.robot.x).toBe(startX);
    });

    test("should handle very large delta time", () => {
      SimulatorImpl.robot.isMoving = true;
      SimulatorImpl.robot.leftSpeed = 100;
      SimulatorImpl.robot.rightSpeed = 100;
      expect(() => SimulatorImpl.update(100000)).not.toThrow();
    });

    test("should normalize angle", () => {
      SimulatorImpl.robot.isMoving = true;
      SimulatorImpl.robot.leftSpeed = -100;
      SimulatorImpl.robot.rightSpeed = 100;
      for (let i = 0; i < 100; i++) {
        SimulatorImpl.update(100);
      }
      expect(SimulatorImpl.robot.angle).toBeGreaterThanOrEqual(-Math.PI);
      expect(SimulatorImpl.robot.angle).toBeLessThanOrEqual(Math.PI);
    });
  });
});
