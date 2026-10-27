/**
 * Behavioural tests for the REAL Mazes IIFE in app/js/mazes.js.
 *
 * Confirms that every maze flagged `symmetric: true` is mirror-symmetric
 * across the arena vertical centreline (x=1015), that walls are well-formed,
 * that spawns sit inside the arena and outside any wall, and that the
 * inherently chiral mazes (spiral, classic) carry `symmetric: false`.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ARENA = 2030; // 7 × 290 mm timber panels

function loadMazes() {
  const cfg = fs.readFileSync(
    path.join(__dirname, "../../js/robot-config.js"),
    "utf8",
  );
  const src = fs.readFileSync(
    path.join(__dirname, "../../js/mazes.js"),
    "utf8",
  );
  const sandbox = { Math, console, Object };
  vm.createContext(sandbox);
  vm.runInContext(cfg + "\n" + src + "\n;this.Mazes = Mazes;", sandbox);
  return sandbox.Mazes;
}

function mirrorRect(r) {
  return {
    x: ARENA - r.x - r.width,
    y: r.y,
    width: r.width,
    height: r.height,
  };
}

function rectEq(a, b) {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

function spawnInsideWall(spawn, wall) {
  return (
    spawn.x > wall.x &&
    spawn.x < wall.x + wall.width &&
    spawn.y > wall.y &&
    spawn.y < wall.y + wall.height
  );
}

describe("Mazes (real source)", () => {
  const Mazes = loadMazes();
  const allMazes = Mazes.getAll();

  test("module exports the expected public surface", () => {
    expect(typeof Mazes.get).toBe("function");
    expect(typeof Mazes.getAll).toBe("function");
    expect(Object.keys(allMazes).length).toBeGreaterThan(0);
  });

  test("Mazes.get falls back to the simple maze for an unknown id", () => {
    expect(Mazes.get("__nonexistent__")).toBe(allMazes.simple);
  });

  describe.each(Object.keys(allMazes))("maze: %s", (id) => {
    test("spawn is inside the arena and outside every wall", () => {
      const m = allMazes[id];
      expect(m.startPosition.x).toBeGreaterThanOrEqual(0);
      expect(m.startPosition.x).toBeLessThanOrEqual(ARENA);
      expect(m.startPosition.y).toBeGreaterThanOrEqual(0);
      expect(m.startPosition.y).toBeLessThanOrEqual(ARENA);
      for (const wall of m.walls) {
        expect(spawnInsideWall(m.startPosition, wall)).toBe(false);
      }
    });

    test("endZone is fully inside the arena", () => {
      const z = allMazes[id].endZone;
      if (!z) return; // optional — some mazes rely on challenge.successCriteria.zone
      expect(z.x).toBeGreaterThanOrEqual(0);
      expect(z.y).toBeGreaterThanOrEqual(0);
      expect(z.x + z.width).toBeLessThanOrEqual(ARENA);
      expect(z.y + z.height).toBeLessThanOrEqual(ARENA);
    });

    test("all walls have positive dimensions", () => {
      for (const wall of allMazes[id].walls) {
        expect(wall.width).toBeGreaterThan(0);
        expect(wall.height).toBeGreaterThan(0);
      }
    });
  });

  describe("symmetric mazes", () => {
    const symmetricIds = () =>
      Object.entries(allMazes)
        .filter(([, m]) => m.symmetric === true)
        .map(([k]) => k);

    test("at least the core mazes are flagged symmetric", () => {
      const ids = symmetricIds();
      expect(ids).toEqual(
        expect.arrayContaining([
          "straight_corridor",
          "corner",
          "dead_end",
          "simple",
          "zigzag",
          "obstacles",
        ]),
      );
    });

    test.each(
      Object.entries(allMazes)
        .filter(([, m]) => m.symmetric === true)
        .map(([k]) => [k]),
    )("%s — every wall has its mirror partner across x=1000", (id) => {
      const walls = allMazes[id].walls;
      for (const w of walls) {
        const mw = mirrorRect(w);
        const found = walls.some((other) => rectEq(other, mw));
        expect({
          maze: id,
          wall: w,
          expectedMirror: mw,
          found,
        }).toMatchObject({ found: true });
      }
    });

    test.each(
      Object.entries(allMazes)
        .filter(([, m]) => m.symmetric === true)
        .map(([k]) => [k]),
    )("%s — mirroring the spawn keeps it inside the arena", (id) => {
      const sp = allMazes[id].startPosition;
      const mirroredX = ARENA - sp.x;
      expect(mirroredX).toBeGreaterThanOrEqual(0);
      expect(mirroredX).toBeLessThanOrEqual(ARENA);
      // The mirrored spawn must also clear every wall.
      for (const wall of allMazes[id].walls) {
        const mirrored = { x: mirroredX, y: sp.y };
        expect(spawnInsideWall(mirrored, wall)).toBe(false);
      }
    });
  });

  describe("chiral mazes (left-only)", () => {
    test("spiral is marked symmetric:false", () => {
      expect(allMazes.spiral.symmetric).toBe(false);
    });

    test("classic is marked symmetric:false", () => {
      expect(allMazes.classic.symmetric).toBe(false);
    });
  });
});
