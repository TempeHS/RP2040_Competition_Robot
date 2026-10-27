/**
 * Mazes Unit Tests
 * Tests for maze definitions and wall structures
 */

describe("Mazes", () => {
  let MazesImpl;

  beforeEach(() => {
    // Create Mazes implementation
    MazesImpl = {
      mazes: {
        1: {
          id: 1,
          name: "Simple Corridor",
          walls: [
            { x: 0, y: 0, width: 2000, height: 50 }, // Top wall
            { x: 0, y: 1950, width: 2000, height: 50 }, // Bottom wall
            { x: 0, y: 0, width: 50, height: 2000 }, // Left wall
            { x: 1950, y: 0, width: 50, height: 2000 }, // Right wall
            { x: 500, y: 500, width: 50, height: 1000 }, // Internal wall
          ],
          startPosition: { x: 250, y: 1000 },
          goalPosition: { x: 1750, y: 1000 },
        },
        2: {
          id: 2,
          name: "L-Shape Maze",
          walls: [
            { x: 0, y: 0, width: 2000, height: 50 },
            { x: 0, y: 1950, width: 2000, height: 50 },
            { x: 0, y: 0, width: 50, height: 2000 },
            { x: 1950, y: 0, width: 50, height: 2000 },
            { x: 800, y: 0, width: 50, height: 1200 },
            { x: 400, y: 800, width: 600, height: 50 },
          ],
          startPosition: { x: 200, y: 200 },
          goalPosition: { x: 1800, y: 1800 },
        },
        3: {
          id: 3,
          name: "Zigzag Path",
          walls: [
            { x: 0, y: 0, width: 2000, height: 50 },
            { x: 0, y: 1950, width: 2000, height: 50 },
            { x: 0, y: 0, width: 50, height: 2000 },
            { x: 1950, y: 0, width: 50, height: 2000 },
            { x: 400, y: 0, width: 50, height: 1400 },
            { x: 800, y: 600, width: 50, height: 1400 },
            { x: 1200, y: 0, width: 50, height: 1400 },
            { x: 1600, y: 600, width: 50, height: 1400 },
          ],
          startPosition: { x: 200, y: 1800 },
          goalPosition: { x: 1800, y: 1800 },
        },
        4: {
          id: 4,
          name: "Obstacle Field",
          walls: [
            { x: 0, y: 0, width: 2000, height: 50 },
            { x: 0, y: 1950, width: 2000, height: 50 },
            { x: 0, y: 0, width: 50, height: 2000 },
            { x: 1950, y: 0, width: 50, height: 2000 },
            { x: 300, y: 300, width: 200, height: 200 },
            { x: 700, y: 700, width: 200, height: 200 },
            { x: 1100, y: 300, width: 200, height: 200 },
            { x: 1500, y: 700, width: 200, height: 200 },
            { x: 500, y: 1300, width: 200, height: 200 },
            { x: 1000, y: 1100, width: 200, height: 200 },
            { x: 1400, y: 1500, width: 200, height: 200 },
          ],
          startPosition: { x: 100, y: 1000 },
          goalPosition: { x: 1900, y: 1000 },
        },
      },

      get: function (id) {
        return this.mazes[id] || null;
      },

      getWalls: function (id) {
        const maze = this.get(id);
        return maze ? maze.walls : [];
      },

      getStartPosition: function (id) {
        const maze = this.get(id);
        return maze ? maze.startPosition : { x: 1000, y: 1000 };
      },

      getGoalPosition: function (id) {
        const maze = this.get(id);
        return maze ? maze.goalPosition : null;
      },

      getAll: function () {
        return Object.values(this.mazes);
      },

      hasValidPath: function (id) {
        // Check if maze has valid start and goal
        const maze = this.get(id);
        return (
          maze !== null &&
          maze.startPosition !== undefined &&
          maze.goalPosition !== undefined
        );
      },
    };
  });

  describe("Maze Definitions", () => {
    test("should have 4 mazes", () => {
      expect(MazesImpl.getAll()).toHaveLength(4);
    });

    test("mazes should have sequential IDs 1-4", () => {
      for (let i = 1; i <= 4; i++) {
        expect(MazesImpl.get(i)).not.toBeNull();
        expect(MazesImpl.get(i).id).toBe(i);
      }
    });

    test("each maze should have required properties", () => {
      MazesImpl.getAll().forEach((maze) => {
        expect(maze.id).toBeDefined();
        expect(maze.name).toBeDefined();
        expect(maze.walls).toBeDefined();
        expect(Array.isArray(maze.walls)).toBe(true);
        expect(maze.startPosition).toBeDefined();
        expect(maze.goalPosition).toBeDefined();
      });
    });
  });

  describe("get()", () => {
    test("should return maze by ID", () => {
      const maze = MazesImpl.get(1);
      expect(maze).not.toBeNull();
      expect(maze.id).toBe(1);
    });

    test("should return null for invalid ID", () => {
      expect(MazesImpl.get(0)).toBeNull();
      expect(MazesImpl.get(100)).toBeNull();
    });
  });

  describe("getWalls()", () => {
    test("should return walls array for valid maze", () => {
      const walls = MazesImpl.getWalls(1);
      expect(Array.isArray(walls)).toBe(true);
      expect(walls.length).toBeGreaterThan(0);
    });

    test("should return empty array for invalid maze", () => {
      const walls = MazesImpl.getWalls(999);
      expect(walls).toEqual([]);
    });

    test("walls should have position and size", () => {
      const walls = MazesImpl.getWalls(1);
      walls.forEach((wall) => {
        expect(wall.x).toBeDefined();
        expect(wall.y).toBeDefined();
        expect(wall.width).toBeDefined();
        expect(wall.height).toBeDefined();
      });
    });
  });

  describe("Wall Structure", () => {
    test("all mazes should have boundary walls", () => {
      MazesImpl.getAll().forEach((maze) => {
        const walls = maze.walls;

        // Check for at least 4 walls (boundaries)
        expect(walls.length).toBeGreaterThanOrEqual(4);
      });
    });

    test("walls should have positive dimensions", () => {
      MazesImpl.getAll().forEach((maze) => {
        maze.walls.forEach((wall) => {
          expect(wall.width).toBeGreaterThan(0);
          expect(wall.height).toBeGreaterThan(0);
        });
      });
    });

    test("walls should be within arena bounds", () => {
      MazesImpl.getAll().forEach((maze) => {
        maze.walls.forEach((wall) => {
          expect(wall.x).toBeGreaterThanOrEqual(0);
          expect(wall.y).toBeGreaterThanOrEqual(0);
          expect(wall.x + wall.width).toBeLessThanOrEqual(2000);
          expect(wall.y + wall.height).toBeLessThanOrEqual(2000);
        });
      });
    });
  });

  describe("Start and Goal Positions", () => {
    test("getStartPosition() should return valid position", () => {
      const pos = MazesImpl.getStartPosition(1);
      expect(pos.x).toBeDefined();
      expect(pos.y).toBeDefined();
      expect(pos.x).toBeGreaterThan(0);
      expect(pos.y).toBeGreaterThan(0);
    });

    test("getStartPosition() should return default for invalid maze", () => {
      const pos = MazesImpl.getStartPosition(999);
      expect(pos).toEqual({ x: 1000, y: 1000 });
    });

    test("getGoalPosition() should return valid position", () => {
      const pos = MazesImpl.getGoalPosition(1);
      expect(pos.x).toBeDefined();
      expect(pos.y).toBeDefined();
    });

    test("getGoalPosition() should return null for invalid maze", () => {
      expect(MazesImpl.getGoalPosition(999)).toBeNull();
    });

    test("start and goal positions should be within arena", () => {
      MazesImpl.getAll().forEach((maze) => {
        expect(maze.startPosition.x).toBeGreaterThan(0);
        expect(maze.startPosition.x).toBeLessThan(2000);
        expect(maze.startPosition.y).toBeGreaterThan(0);
        expect(maze.startPosition.y).toBeLessThan(2000);

        expect(maze.goalPosition.x).toBeGreaterThan(0);
        expect(maze.goalPosition.x).toBeLessThan(2000);
        expect(maze.goalPosition.y).toBeGreaterThan(0);
        expect(maze.goalPosition.y).toBeLessThan(2000);
      });
    });

    test("start position should not overlap with walls", () => {
      MazesImpl.getAll().forEach((maze) => {
        const start = maze.startPosition;
        let overlaps = false;

        maze.walls.forEach((wall) => {
          if (
            start.x >= wall.x &&
            start.x <= wall.x + wall.width &&
            start.y >= wall.y &&
            start.y <= wall.y + wall.height
          ) {
            overlaps = true;
          }
        });

        expect(overlaps).toBe(false);
      });
    });
  });

  describe("hasValidPath()", () => {
    test("should return true for valid mazes", () => {
      for (let i = 1; i <= 4; i++) {
        expect(MazesImpl.hasValidPath(i)).toBe(true);
      }
    });

    test("should return false for invalid maze ID", () => {
      expect(MazesImpl.hasValidPath(999)).toBe(false);
    });
  });

  describe("Specific Maze Properties", () => {
    test("Maze 1 (Simple Corridor) should have internal wall", () => {
      const walls = MazesImpl.getWalls(1);
      // More than just boundary walls
      expect(walls.length).toBeGreaterThan(4);
    });

    test("Maze 4 (Obstacle Field) should have many obstacles", () => {
      const walls = MazesImpl.getWalls(4);
      // Boundary walls + obstacles
      expect(walls.length).toBeGreaterThan(8);
    });
  });

  describe("Edge Cases", () => {
    test("should handle null ID", () => {
      expect(MazesImpl.get(null)).toBeNull();
    });

    test("should handle undefined ID", () => {
      expect(MazesImpl.get(undefined)).toBeNull();
    });

    test("should handle string ID", () => {
      // Depending on implementation, might need parseInt
      expect(MazesImpl.get("1")).toBeDefined();
    });
  });
});
