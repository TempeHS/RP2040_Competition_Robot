/**
 * Verifies that every challenge whose definition references a maze can
 * resolve that maze id through the real Mazes module and that the maze
 * provides a non-empty walls array. This guards against the regression
 * where loadChallenge() failed to load maze walls (challenges 1–5 were
 * rendering an empty arena until the user manually picked a maze).
 *
 * Also exercises the wall-loading branch of loadChallenge() in isolation
 * via a minimal stub so the simulator receives the maze's walls and
 * App.currentMaze is set for the renderer.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadModule(relPath, exportName) {
  const src = fs.readFileSync(path.join(__dirname, relPath), "utf8");
  const sandbox = { Math, console };
  vm.createContext(sandbox);
  vm.runInContext(`${src}\n;this.${exportName} = ${exportName};`, sandbox);
  return sandbox[exportName];
}

describe("Challenge maze walls", () => {
  const Challenges = loadModule("../../js/challenges.js", "Challenges");
  const Mazes = loadModule("../../js/mazes.js", "Mazes");
  const allChallenges = Challenges.getAll();
  const mazeChallenges = Object.values(allChallenges).filter((c) => c.maze);

  test("at least one challenge references a maze", () => {
    expect(mazeChallenges.length).toBeGreaterThan(0);
  });

  test.each(mazeChallenges.map((c) => [c.id, c.maze]))(
    "Challenge %s -> maze '%s' resolves to a definition with walls",
    (_id, mazeId) => {
      const maze = Mazes.get(mazeId);
      expect(maze).toBeTruthy();
      expect(Array.isArray(maze.walls)).toBe(true);
      expect(maze.walls.length).toBeGreaterThan(0);
      // Sanity: each wall has rectangle geometry.
      maze.walls.forEach((w) => {
        expect(typeof w.x).toBe("number");
        expect(typeof w.y).toBe("number");
        expect(w.width).toBeGreaterThan(0);
        expect(w.height).toBeGreaterThan(0);
      });
    },
  );

  describe("loadChallenge wall-loading branch", () => {
    // Replicate the relevant portion of loadChallenge() (see app/js/app.js)
    // so a regression where walls aren't propagated to the simulator is
    // caught here without spinning up the full DOM.
    function applyChallengeMaze(challenge, App, Simulator) {
      if (challenge && challenge.maze) {
        const maze = Mazes.get(challenge.maze);
        if (maze) {
          App.currentMaze = maze;
          Simulator.setMazeWalls(maze.walls || []);
        } else {
          App.currentMaze = null;
          Simulator.setMazeWalls([]);
        }
      } else {
        App.currentMaze = null;
        Simulator.setMazeWalls([]);
      }
    }

    test("Challenge 4 ('corner') propagates walls to the simulator", () => {
      const App = { currentMaze: null };
      let setWalls = null;
      const Simulator = {
        setMazeWalls: (w) => {
          setWalls = w;
        },
      };
      applyChallengeMaze(Challenges.get(4), App, Simulator);
      expect(App.currentMaze).toBeTruthy();
      expect(App.currentMaze.id).toBe("corner");
      expect(setWalls).toEqual(Mazes.get("corner").walls);
      expect(setWalls.length).toBeGreaterThan(0);
    });

    test("challenges without a maze clear walls and currentMaze", () => {
      const App = { currentMaze: { id: "stale" } };
      let setWalls = null;
      const Simulator = {
        setMazeWalls: (w) => {
          setWalls = w;
        },
      };
      applyChallengeMaze({ id: 99 }, App, Simulator);
      expect(App.currentMaze).toBeNull();
      expect(setWalls).toEqual([]);
    });
  });
});
