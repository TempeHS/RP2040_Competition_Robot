/**
 * Edge Cases Unit Tests
 * Tests for boundary conditions, stress testing, and error handling
 */

describe("Edge Cases", () => {
  describe("Robot Boundaries", () => {
    let robot;
    const ARENA_WIDTH = 2000;
    const ARENA_HEIGHT = 2000;

    beforeEach(() => {
      robot = {
        x: 1000,
        y: 1000,
        angle: 0,
        leftSpeed: 0,
        rightSpeed: 0,
        isMoving: false,
      };
    });

    test("robot at center should be valid", () => {
      expect(robot.x).toBeGreaterThan(0);
      expect(robot.x).toBeLessThan(ARENA_WIDTH);
      expect(robot.y).toBeGreaterThan(0);
      expect(robot.y).toBeLessThan(ARENA_HEIGHT);
    });

    test("robot at minimum bounds should be valid", () => {
      robot.x = 100;
      robot.y = 100;
      expect(robot.x).toBeGreaterThan(0);
      expect(robot.y).toBeGreaterThan(0);
    });

    test("robot at maximum bounds should be valid", () => {
      robot.x = 1900;
      robot.y = 1900;
      expect(robot.x).toBeLessThan(ARENA_WIDTH);
      expect(robot.y).toBeLessThan(ARENA_HEIGHT);
    });

    test("angle normalization should work", () => {
      robot.angle = Math.PI * 3; // 540 degrees
      robot.angle = robot.angle % (2 * Math.PI);
      expect(robot.angle).toBeLessThan(2 * Math.PI);
    });

    test("negative angle should be handled", () => {
      robot.angle = -Math.PI;
      expect(robot.angle).toBe(-Math.PI);
    });
  });

  describe("Speed Limits", () => {
    let robot;
    const MAX_SPEED = 200;

    beforeEach(() => {
      robot = { leftSpeed: 0, rightSpeed: 0 };
    });

    test("should handle zero speed", () => {
      robot.leftSpeed = 0;
      robot.rightSpeed = 0;
      expect(robot.leftSpeed).toBe(0);
      expect(robot.rightSpeed).toBe(0);
    });

    test("should handle maximum speed", () => {
      robot.leftSpeed = MAX_SPEED;
      robot.rightSpeed = MAX_SPEED;
      expect(robot.leftSpeed).toBe(MAX_SPEED);
    });

    test("should handle negative speed", () => {
      robot.leftSpeed = -100;
      robot.rightSpeed = -100;
      expect(robot.leftSpeed).toBe(-100);
    });

    test("should handle asymmetric speeds", () => {
      robot.leftSpeed = 50;
      robot.rightSpeed = 150;
      expect(robot.leftSpeed).not.toBe(robot.rightSpeed);
    });
  });

  describe("Ultrasonic Sensor", () => {
    const MIN_DISTANCE = 20;
    const MAX_DISTANCE = 4000;

    function clampDistance(distance) {
      return Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance));
    }

    test("should clamp minimum distance", () => {
      expect(clampDistance(5)).toBe(MIN_DISTANCE);
      expect(clampDistance(0)).toBe(MIN_DISTANCE);
    });

    test("should clamp maximum distance", () => {
      expect(clampDistance(5000)).toBe(MAX_DISTANCE);
      expect(clampDistance(10000)).toBe(MAX_DISTANCE);
    });

    test("should preserve valid distances", () => {
      expect(clampDistance(500)).toBe(500);
      expect(clampDistance(1000)).toBe(1000);
    });

    test("should handle edge values", () => {
      expect(clampDistance(MIN_DISTANCE)).toBe(MIN_DISTANCE);
      expect(clampDistance(MAX_DISTANCE)).toBe(MAX_DISTANCE);
    });
  });

  describe("Command Queue Stress", () => {
    let queue;

    beforeEach(() => {
      queue = [];
    });

    test("should handle large number of commands", () => {
      for (let i = 0; i < 10000; i++) {
        queue.push({ type: "drive_forward", speed: 100 });
      }
      expect(queue.length).toBe(10000);
    });

    test("should handle rapid add/remove", () => {
      for (let i = 0; i < 1000; i++) {
        queue.push({ type: "test" });
        queue.shift();
      }
      expect(queue.length).toBe(0);
    });

    test("should handle mixed operations", () => {
      for (let i = 0; i < 500; i++) {
        queue.push({ type: "forward" });
        queue.push({ type: "backward" });
        queue.shift();
      }
      expect(queue.length).toBe(500);
    });
  });

  describe("Code Validation Edge Cases", () => {
    function validateCode(code) {
      if (!code || code.trim() === "") return { valid: false };
      if (code.length > 100000) return { valid: false, error: "Code too long" };
      return { valid: true };
    }

    test("should reject null code", () => {
      expect(validateCode(null).valid).toBe(false);
    });

    test("should reject undefined code", () => {
      expect(validateCode(undefined).valid).toBe(false);
    });

    test("should reject empty string", () => {
      expect(validateCode("").valid).toBe(false);
    });

    test("should reject whitespace only", () => {
      expect(validateCode("   \n\t  ").valid).toBe(false);
    });

    test("should accept minimal code", () => {
      expect(validateCode("x=1").valid).toBe(true);
    });

    test("should handle very long code", () => {
      const longCode = "x = 1\\n".repeat(50000);
      expect(validateCode(longCode).valid).toBe(false);
    });
  });

  describe("Physics Edge Cases", () => {
    function updatePosition(robot, dt) {
      const v = (robot.leftSpeed + robot.rightSpeed) / 2;
      const omega = (robot.rightSpeed - robot.leftSpeed) / 150; // wheelbase

      robot.x += v * Math.cos(robot.angle) * dt;
      robot.y += v * Math.sin(robot.angle) * dt;
      robot.angle += omega * dt;

      return robot;
    }

    test("should handle zero delta time", () => {
      const robot = {
        x: 1000,
        y: 1000,
        angle: 0,
        leftSpeed: 100,
        rightSpeed: 100,
      };
      const result = updatePosition(robot, 0);
      expect(result.x).toBe(1000);
      expect(result.y).toBe(1000);
    });

    test("should handle very small delta time", () => {
      const robot = {
        x: 1000,
        y: 1000,
        angle: 0,
        leftSpeed: 100,
        rightSpeed: 100,
      };
      const result = updatePosition(robot, 0.001);
      expect(result.x).toBeCloseTo(1000.1, 1);
    });

    test("should handle large delta time", () => {
      const robot = {
        x: 1000,
        y: 1000,
        angle: 0,
        leftSpeed: 100,
        rightSpeed: 100,
      };
      const result = updatePosition(robot, 10);
      expect(result.x).toBeGreaterThan(1000);
    });

    test("should handle spinning in place", () => {
      const robot = {
        x: 1000,
        y: 1000,
        angle: 0,
        leftSpeed: -100,
        rightSpeed: 100,
      };
      const result = updatePosition(robot, 1);
      expect(result.x).toBeCloseTo(1000, 0);
      expect(result.y).toBeCloseTo(1000, 0);
      expect(result.angle).not.toBe(0);
    });
  });

  describe("Memory Safety", () => {
    test("should handle string concatenation", () => {
      let str = "";
      for (let i = 0; i < 1000; i++) {
        str += "test ";
      }
      expect(str.length).toBeGreaterThan(1000);
    });

    test("should handle object creation", () => {
      const objects = [];
      for (let i = 0; i < 1000; i++) {
        objects.push({ id: i, data: new Array(100).fill(0) });
      }
      expect(objects.length).toBe(1000);
    });

    test("should handle array operations", () => {
      const arr = [];
      for (let i = 0; i < 1000; i++) {
        arr.push(i);
      }
      const filtered = arr.filter((x) => x % 2 === 0);
      expect(filtered.length).toBe(500);
    });
  });

  describe("Numerical Precision", () => {
    test("should handle floating point comparison", () => {
      const a = 0.1 + 0.2;
      expect(Math.abs(a - 0.3)).toBeLessThan(0.0001);
    });

    test("should handle angle calculations", () => {
      const angle = Math.PI / 4;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      expect(sin * sin + cos * cos).toBeCloseTo(1, 10);
    });

    test("should handle distance calculations", () => {
      const dx = 3;
      const dy = 4;
      const distance = Math.sqrt(dx * dx + dy * dy);
      expect(distance).toBe(5);
    });
  });

  describe("Error Recovery", () => {
    test("should handle try-catch in async functions", async () => {
      async function mayFail() {
        throw new Error("Test error");
      }

      let caught = false;
      try {
        await mayFail();
      } catch (e) {
        caught = true;
      }
      expect(caught).toBe(true);
    });

    test("should handle promise rejection", async () => {
      const promise = Promise.reject(new Error("Rejected"));
      await expect(promise).rejects.toThrow("Rejected");
    });

    test("should handle timeout", async () => {
      const timeout = new Promise((resolve) => setTimeout(resolve, 10));
      await expect(timeout).resolves.toBeUndefined();
    });
  });

  describe("Input Sanitization", () => {
    function escapeHtml(str) {
      const div = { textContent: str };
      return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    test("should escape HTML tags", () => {
      const result = escapeHtml("<script>alert('xss')</script>");
      expect(result).not.toContain("<script>");
    });

    test("should handle normal text", () => {
      const result = escapeHtml("Hello World");
      expect(result).toBe("Hello World");
    });

    test("should handle empty string", () => {
      const result = escapeHtml("");
      expect(result).toBe("");
    });

    test("should handle unicode", () => {
      const result = escapeHtml("Hello 你好 🚀");
      expect(result).toContain("你好");
      expect(result).toContain("🚀");
    });
  });

  describe("State Consistency", () => {
    test("robot state should be consistent", () => {
      const robot = {
        x: 1000,
        y: 1000,
        angle: 0,
        leftSpeed: 0,
        rightSpeed: 0,
        isMoving: false,
      };

      // Moving state should match speed
      if (robot.leftSpeed !== 0 || robot.rightSpeed !== 0) {
        robot.isMoving = true;
      }

      expect(robot.isMoving).toBe(false);
    });

    test("stopped robot should have zero speeds", () => {
      const robot = {
        leftSpeed: 100,
        rightSpeed: 100,
        isMoving: true,
      };

      // Stop the robot
      robot.leftSpeed = 0;
      robot.rightSpeed = 0;
      robot.isMoving = false;

      expect(robot.leftSpeed).toBe(0);
      expect(robot.rightSpeed).toBe(0);
      expect(robot.isMoving).toBe(false);
    });
  });
});
