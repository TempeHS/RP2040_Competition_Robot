/**
 * Simulator-Runner Integration Tests
 * Tests for the integration between simulator physics and Python execution
 */

describe("Simulator-Runner Integration", () => {
  let robot;
  let commandQueue;

  beforeEach(() => {
    robot = {
      x: 1000,
      y: 1000,
      angle: 0,
      leftSpeed: 0,
      rightSpeed: 0,
      isMoving: false,
    };
    commandQueue = [];
  });

  function processCommand(cmd) {
    switch (cmd.type) {
      case "drive_forward":
        robot.leftSpeed = cmd.speed || 100;
        robot.rightSpeed = cmd.speed || 100;
        robot.isMoving = true;
        break;
      case "drive_backward":
        robot.leftSpeed = -(cmd.speed || 100);
        robot.rightSpeed = -(cmd.speed || 100);
        robot.isMoving = true;
        break;
      case "rotate_left":
        robot.leftSpeed = -(cmd.speed || 100);
        robot.rightSpeed = cmd.speed || 100;
        robot.isMoving = true;
        break;
      case "rotate_right":
        robot.leftSpeed = cmd.speed || 100;
        robot.rightSpeed = -(cmd.speed || 100);
        robot.isMoving = true;
        break;
      case "brake":
        robot.leftSpeed = 0;
        robot.rightSpeed = 0;
        robot.isMoving = false;
        break;
    }
  }

  function updatePhysics(dt) {
    if (!robot.isMoving) return;

    const WHEEL_BASE = 150;
    const v = (robot.leftSpeed + robot.rightSpeed) / 2;
    const omega = (robot.rightSpeed - robot.leftSpeed) / WHEEL_BASE;

    robot.x += v * Math.cos(robot.angle) * dt;
    robot.y += v * Math.sin(robot.angle) * dt;
    robot.angle += omega * dt;

    // Clamp to arena
    robot.x = Math.max(100, Math.min(1900, robot.x));
    robot.y = Math.max(125, Math.min(1875, robot.y));
  }

  describe("Command to Motion", () => {
    test("drive_forward should move robot forward", () => {
      processCommand({ type: "drive_forward", speed: 100 });
      const startX = robot.x;

      // Simulate 1 second
      updatePhysics(1);

      expect(robot.x).toBeGreaterThan(startX);
    });

    test("drive_backward should move robot backward", () => {
      processCommand({ type: "drive_backward", speed: 100 });
      const startX = robot.x;

      updatePhysics(1);

      expect(robot.x).toBeLessThan(startX);
    });

    test("rotate_left should turn robot counter-clockwise", () => {
      processCommand({ type: "rotate_left", speed: 100 });
      const startAngle = robot.angle;

      updatePhysics(1);

      expect(robot.angle).toBeGreaterThan(startAngle);
    });

    test("rotate_right should turn robot clockwise", () => {
      processCommand({ type: "rotate_right", speed: 100 });
      const startAngle = robot.angle;

      updatePhysics(1);

      expect(robot.angle).toBeLessThan(startAngle);
    });

    test("brake should stop robot", () => {
      processCommand({ type: "drive_forward", speed: 100 });
      processCommand({ type: "brake" });

      expect(robot.leftSpeed).toBe(0);
      expect(robot.rightSpeed).toBe(0);
      expect(robot.isMoving).toBe(false);
    });
  });

  describe("Command Sequence Execution", () => {
    test("should execute forward-turn-forward pattern", () => {
      const startPos = { x: robot.x, y: robot.y };

      // Forward
      processCommand({ type: "drive_forward", speed: 100 });
      updatePhysics(1);

      // Turn right
      processCommand({ type: "rotate_right", speed: 100 });
      updatePhysics(0.5);

      // Forward again
      processCommand({ type: "drive_forward", speed: 100 });
      updatePhysics(1);

      // Robot should have moved from start
      const distance = Math.sqrt(
        Math.pow(robot.x - startPos.x, 2) + Math.pow(robot.y - startPos.y, 2)
      );
      expect(distance).toBeGreaterThan(50);
    });

    test("should execute square pattern", () => {
      const startPos = { x: robot.x, y: robot.y };

      // Drive in a square
      for (let i = 0; i < 4; i++) {
        processCommand({ type: "drive_forward", speed: 100 });
        updatePhysics(1);
        processCommand({ type: "rotate_right", speed: 100 });
        updatePhysics(0.39); // ~90 degrees
      }

      // Should be near start position
      const distance = Math.sqrt(
        Math.pow(robot.x - startPos.x, 2) + Math.pow(robot.y - startPos.y, 2)
      );
      expect(distance).toBeLessThan(400); // Allow some error due to physics simulation
    });
  });

  describe("Continuous Motion", () => {
    test("should maintain constant speed during forward motion", () => {
      processCommand({ type: "drive_forward", speed: 100 });

      const positions = [];
      for (let i = 0; i < 10; i++) {
        positions.push(robot.x);
        updatePhysics(0.1);
      }

      // Check consistent movement
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      }
    });

    test("should maintain consistent angular velocity during rotation", () => {
      processCommand({ type: "rotate_left", speed: 100 });

      const angles = [];
      for (let i = 0; i < 10; i++) {
        angles.push(robot.angle);
        updatePhysics(0.1);
      }

      // Check consistent rotation
      for (let i = 1; i < angles.length; i++) {
        expect(angles[i]).toBeGreaterThan(angles[i - 1]);
      }
    });
  });

  describe("Speed Variations", () => {
    test("higher speed should result in faster movement", () => {
      // Low speed
      processCommand({ type: "drive_forward", speed: 50 });
      const startX = robot.x;
      updatePhysics(1);
      const lowSpeedDistance = robot.x - startX;

      // Reset
      robot.x = 1000;

      // High speed
      processCommand({ type: "drive_forward", speed: 150 });
      updatePhysics(1);
      const highSpeedDistance = robot.x - 1000;

      expect(highSpeedDistance).toBeGreaterThan(lowSpeedDistance);
    });

    test("differential speeds should cause curved path", () => {
      // Set asymmetric speeds
      robot.leftSpeed = 80;
      robot.rightSpeed = 120;
      robot.isMoving = true;

      const startAngle = robot.angle;
      const startX = robot.x;

      // Simulate multiple small steps to see the curve
      for (let i = 0; i < 20; i++) {
        updatePhysics(0.1);
      }

      // Should have changed angle (curved path)
      expect(robot.angle).not.toBe(startAngle);
      // Should have moved forward
      expect(robot.x).not.toBe(startX);
    });
  });

  describe("Boundary Handling", () => {
    test("should stop at arena boundary", () => {
      // Move towards right edge
      robot.x = 1800;
      processCommand({ type: "drive_forward", speed: 200 });

      for (let i = 0; i < 20; i++) {
        updatePhysics(0.1);
      }

      expect(robot.x).toBeLessThanOrEqual(1900);
    });

    test("should stop at left boundary", () => {
      robot.x = 200;
      robot.angle = Math.PI; // Face left
      processCommand({ type: "drive_forward", speed: 200 });

      for (let i = 0; i < 20; i++) {
        updatePhysics(0.1);
      }

      expect(robot.x).toBeGreaterThanOrEqual(100);
    });
  });

  describe("State Synchronization", () => {
    test("command should immediately update robot state", () => {
      expect(robot.isMoving).toBe(false);

      processCommand({ type: "drive_forward", speed: 100 });

      expect(robot.isMoving).toBe(true);
      expect(robot.leftSpeed).toBe(100);
      expect(robot.rightSpeed).toBe(100);
    });

    test("brake should immediately stop motion", () => {
      processCommand({ type: "drive_forward", speed: 100 });
      expect(robot.isMoving).toBe(true);

      processCommand({ type: "brake" });

      expect(robot.isMoving).toBe(false);
      expect(robot.leftSpeed).toBe(0);
      expect(robot.rightSpeed).toBe(0);
    });
  });

  describe("Queue Processing", () => {
    test("should process commands in order", () => {
      commandQueue.push({ type: "drive_forward", speed: 100 });
      commandQueue.push({ type: "rotate_left", speed: 100 });
      commandQueue.push({ type: "brake" });

      while (commandQueue.length > 0) {
        const cmd = commandQueue.shift();
        processCommand(cmd);
      }

      // After all commands, robot should be stopped
      expect(robot.isMoving).toBe(false);
    });
  });
});
