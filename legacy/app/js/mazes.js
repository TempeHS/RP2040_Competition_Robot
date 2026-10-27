/**
 * AIDriver Simulator - Maze Definitions
 * Pre-defined mazes for Challenge 6: Maze Navigation
 */
/* global RobotConfig */

const Mazes = (function () {
  "use strict";

  // Wall thickness in mm — real maze timber panels are 3 mm thick.
  const WALL_THICKNESS = RobotConfig.wallThickness_mm;

  // ── Real-world grid ────────────────────────────────────────────────
  // The physical arena is a 7 × 7 grid of 290 mm square timber panels
  // (2030 mm total per side). Walls are built on the grid boundaries so
  // that every layout maps cleanly onto the real maze. Grid boundary
  // index b (0..7) sits at b × 290 mm.
  const CELL = RobotConfig.panelSize_mm; // 290 mm cell pitch
  const WT = WALL_THICKNESS; // 3 mm panel thickness
  const GRID = Math.round(RobotConfig.arenaWidth_mm / CELL); // 7 cells

  /**
   * Vertical wall centred on column boundary `b`, spanning rows `r0`..`r1`.
   * @param {number} b Column boundary index (0..GRID).
   * @param {number} r0 Start row boundary index.
   * @param {number} r1 End row boundary index.
   * @returns {MazeRect}
   */
  function vWall(b, r0, r1) {
    return {
      x: b * CELL - WT / 2,
      y: r0 * CELL,
      width: WT,
      height: (r1 - r0) * CELL,
    };
  }

  /**
   * Horizontal wall centred on row boundary `b`, spanning columns `c0`..`c1`.
   * @param {number} b Row boundary index (0..GRID).
   * @param {number} c0 Start column boundary index.
   * @param {number} c1 End column boundary index.
   * @returns {MazeRect}
   */
  function hWall(b, c0, c1) {
    return {
      x: c0 * CELL,
      y: b * CELL - WT / 2,
      width: (c1 - c0) * CELL,
      height: WT,
    };
  }

  /**
   * Solid block covering whole cells from column `c0`..`c1` and row `r0`..`r1`.
   * @param {number} c0 Start column boundary index.
   * @param {number} r0 Start row boundary index.
   * @param {number} c1 End column boundary index.
   * @param {number} r1 End row boundary index.
   * @returns {MazeRect}
   */
  function block(c0, r0, c1, r1) {
    return {
      x: c0 * CELL,
      y: r0 * CELL,
      width: (c1 - c0) * CELL,
      height: (r1 - r0) * CELL,
    };
  }

  /**
   * Centre point (mm) of grid cell at column `c`, row `r`.
   * @param {number} c Column index (0..GRID-1).
   * @param {number} r Row index (0..GRID-1).
   * @param {number} [heading] Optional spawn heading in degrees.
   * @returns {{x:number,y:number,heading:number}}
   */
  function cellCentre(c, r, heading = 0) {
    return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2, heading };
  }

  /**
   * Goal rectangle covering grid cell(s) from column `c0`..`c1`, row `r0`..`r1`.
   * @param {number} c0 Start column boundary index.
   * @param {number} r0 Start row boundary index.
   * @param {number} [c1] End column boundary index (defaults to c0 + 1).
   * @param {number} [r1] End row boundary index (defaults to r0 + 1).
   * @returns {MazeRect}
   */
  function cellZone(c0, r0, c1 = c0 + 1, r1 = r0 + 1) {
    return block(c0, r0, c1, r1);
  }

  /**
   * Axis-aligned rectangle measured in millimetres.
   * @typedef {Object} MazeRect
   * @property {number} x Left coordinate from the simulator origin.
   * @property {number} y Top coordinate from the simulator origin.
   * @property {number} width Rectangle width.
   * @property {number} height Rectangle height.
   */

  /**
   * Metadata and geometry for a maze used by Challenge 6.
   * @typedef {Object} MazeDefinition
   * @property {string} id Unique identifier displayed in the maze selector.
   * @property {string} name Short title shown in the UI drop-down.
   * @property {"Easy"|"Medium"|"Hard"} difficulty Difficulty label used for badge colouring.
   * @property {string} description Optional learner-facing summary of the maze.
   * @property {{x:number,y:number,heading:number}} startPosition Robot spawn point expressed in millimetres.
   * @property {{x:number,y:number,width:number,height:number}} endZone Goal area that triggers challenge completion.
   * @property {Array<MazeRect>} walls Obstacles rendered on the canvas and used for collision checks.
   */

  /**
   * Pre-defined maze layouts with walls expressed as millimeter rectangles.
   *
   * Mazes are built on the real 7 × 7 grid of 290 mm timber panels
   * (2030 mm arena) and are mirror-symmetric across the vertical
   * centreline (x = 1015). The recorded `startPosition` and `endZone`
   * describe the LEFT-wall ("AIDriver(\"left\")") spawn; when the user
   * instantiates `AIDriver("right")` the simulator auto-mirrors both via
   * `Simulator.mirrorPose` / `Simulator.mirrorRect` (see App.onAIDriverInstantiated).
   *
   * The few mazes that are inherently chiral (spiral, classic) carry
   * `symmetric: false` so the simulator leaves the spawn alone for those.
   *
   * @type {Record<string, MazeDefinition>}
   */
  const mazeDefinitions = {
    // Straight corridor — symmetric pair of outer corridors. Two long
    // vertical walls on grid boundaries 1 and 6 split the arena into
    // three vertical strips. Drive north along whichever single-cell
    // outer strip your spawn picked.
    straight_corridor: {
      id: "straight_corridor",
      name: "Straight Corridor",
      difficulty: "Easy",
      symmetric: true,
      description:
        'Drive straight up the outer corridor — perfect for tuning P and PD controllers. Switch AIDriver("left") <> AIDriver("right") to flip sides.',
      startPosition: cellCentre(0, 6),
      endZone: cellZone(0, 0),
      walls: [
        // Inner wall of the LEFT corridor (grid boundary 1)
        vWall(1, 0, GRID),
        // Inner wall of the RIGHT corridor (mirror, grid boundary 6)
        vWall(GRID - 1, 0, GRID),
      ],
    },

    // Corner — single large central block, mirror-symmetric about
    // x = 1015 so the same maze works for both left- and right-hand
    // wall followers. A single-cell corridor wraps the block on the
    // left, top and right. The block touches the bottom edge so the
    // only path is: drive up the outer corridor, turn 90° at the top,
    // continue to the central goal.
    corner: {
      id: "corner",
      name: "Corner",
      difficulty: "Easy",
      symmetric: true,
      description:
        "Drive up the outer corridor, detect the front wall, then turn 90° toward the centre to reach the top.",
      startPosition: cellCentre(0, 6),
      endZone: cellZone(3, 0),
      walls: [
        // Central block: columns 1..5, rows 1..6 (touches bottom edge).
        // Self-mirrors about x = 1015.
        block(1, 1, GRID - 1, GRID),
      ],
    },

    // Outside Corners — two free-standing nib walls, one on each side
    // of the arena, mirror-symmetric about x = 1015. The robot spawns
    // in the centre of the arena. Each nib presents the inside edge as
    // a wall to follow upward, then ends abruptly (an outside / convex
    // corner) so the side sensor returns -1. The learner must add a
    // gentle "lost-wall" curl so the robot wraps around the top of the
    // nib and reaches the goal pocket on the far side.
    outside_corners: {
      id: "outside_corners",
      name: "Outside Corners",
      difficulty: "Medium",
      symmetric: true,
      description:
        "Two free-standing nib walls, one each side. Spawn in the centre, follow the inside edge of your nib up, then wrap around its outside corner to reach the pocket behind it.",
      // Spawn dead-centre, heading north. Mirror keeps it on x = 1015.
      startPosition: cellCentre(3, 6),
      // Goal pocket sits behind the LEFT nib (top-left corner of the
      // arena). For AIDriver("right") the simulator mirrors this to
      // the top-right pocket automatically.
      endZone: cellZone(0, 0, 2, 2),
      walls: [
        // Left nib: vertical bar on grid boundary 2, rows 2..7.
        // Outside corner at the TOP (row 2) — that's where the side
        // sensor blanks out and the lost-wall recovery must kick in.
        vWall(2, 2, GRID),
        // Right nib: mirror of the left nib about x = 1015 (boundary 5).
        vWall(GRID - 2, 2, GRID),
      ],
    },

    // Dead End — single full-height central block, mirror-symmetric
    // about x = 1015. The two single-cell side channels (column 0 and
    // column 6) are dead-ends capped only by the arena's top boundary,
    // so the robot must detect the front wall (arena edge) and turn
    // 180° to head back.
    dead_end: {
      id: "dead_end",
      name: "Dead End (Both Sides)",
      difficulty: "Medium",
      symmetric: true,
      description:
        'U-shaped arena with a dead end on each side. Pick AIDriver("left") or AIDriver("right") and the spawn moves to the matching pocket — drive to the dead end and stop before colliding.',
      walls: [
        // Central block fills the full arena height between the two
        // outer channels (columns 1..5). The arena boundary is the end.
        block(1, 0, GRID - 1, GRID),
      ],
      // Spawn near the bottom of the left channel; mirror puts the
      // right-mode spawn in column 6.
      startPosition: cellCentre(0, 6),
    },

    // Simple — single 90° turn into a wide top room. Symmetric pair
    // means either spawn ends in the same central goal.
    simple: {
      id: "simple",
      name: "Simple Corridor",
      difficulty: "Easy",
      symmetric: true,
      description:
        "A pair of mirrored L-shaped corridors meeting at the top — practice basic wall-follow plus one 90° turn.",
      startPosition: cellCentre(0, 6),
      endZone: cellZone(3, 0),
      walls: [
        // Central block (columns 1..5, rows 2..7) leaves single-cell
        // outer corridors and a two-cell-deep room across the top.
        // Self-mirrors about x = 1015.
        block(1, 2, GRID - 1, GRID),
      ],
    },

    // Zigzag — symmetric chevron pattern. Three horizontal wall rows on
    // grid boundaries 5, 3 and 1, each leaving a single-cell gap that
    // alternates between the centre and the sides so the robot weaves.
    zigzag: {
      id: "zigzag",
      name: "Zigzag Path",
      difficulty: "Medium",
      symmetric: true,
      description:
        "Weave through three rows of walls with alternating gaps. Symmetric across the centreline so left- and right-wall runs feel the same.",
      startPosition: cellCentre(0, 6),
      endZone: cellZone(3, 0),
      walls: [
        // Bottom row (boundary 5): gap at the centre cell (column 3).
        hWall(5, 0, 3),
        hWall(5, 4, GRID),
        // Middle row (boundary 3): central wall (columns 2..5),
        // gaps at both sides. Self-mirrors about x = 1015.
        hWall(3, 2, GRID - 2),
        // Top row (boundary 1): gap at the centre cell again.
        hWall(1, 0, 3),
        hWall(1, 4, GRID),
      ],
    },

    // Spiral — inherently chiral, cannot be mirrored. Marked symmetric:false
    // so the simulator does NOT mirror the spawn when the user picks
    // AIDriver("right") — they'll get a warning in the debug log.
    spiral: {
      id: "spiral",
      name: "Spiral",
      difficulty: "Hard",
      symmetric: false,
      description:
        'A spiral inward to the centre. This maze is inherently chiral — only AIDriver("left") is supported.',
      startPosition: cellCentre(0, 6),
      endZone: cellZone(3, 3),
      walls: [
        // Outer ring (one cell in from the arena edge), wound inward.
        hWall(1, 0, GRID - 1),
        vWall(GRID - 1, 1, GRID - 1),
        hWall(GRID - 1, 1, GRID),
        vWall(1, 2, GRID - 1),
        // Inner ring.
        hWall(2, 1, GRID - 2),
        vWall(GRID - 2, 2, GRID - 2),
        hWall(GRID - 2, 2, GRID - 1),
        vWall(2, 3, GRID - 2),
        // Centre stub.
        hWall(3, 2, 4),
      ],
    },

    // Classic — also chiral; left-wall only.
    classic: {
      id: "classic",
      name: "Classic Maze",
      difficulty: "Hard",
      symmetric: false,
      description:
        'A traditional maze with dead ends. Inherently chiral — only AIDriver("left") is supported.',
      startPosition: cellCentre(0, 6),
      endZone: cellZone(GRID - 1, 0),
      walls: [
        vWall(2, 0, 3),
        hWall(2, 0, 2),
        vWall(4, 1, 4),
        hWall(3, 2, 5),
        vWall(1, 4, GRID),
        hWall(5, 1, 4),
        vWall(5, 4, GRID),
        hWall(4, 4, 6),
        vWall(3, 5, GRID),
      ],
    },

    // Obstacle course — scattered cell-sized obstacles arranged in
    // mirror pairs about x = 1015.
    obstacles: {
      id: "obstacles",
      name: "Obstacle Course",
      difficulty: "Medium",
      symmetric: true,
      description:
        "Navigate around scattered obstacles. Layout is mirrored across the centreline so either AIDriver side works.",
      startPosition: cellCentre(0, 6),
      endZone: cellZone(3, 0),
      walls: [
        // Outer column obstacles (mirror pair: column 0 / column 6).
        block(0, 4, 1, 5),
        block(GRID - 1, 4, GRID, 5),
        // Upper inner obstacles (mirror pair: column 2 / column 4).
        block(2, 1, 3, 2),
        block(GRID - 3, 1, GRID - 2, 2),
        // Lower inner obstacles (mirror pair: column 2 / column 4).
        block(2, 4, 3, 5),
        block(GRID - 3, 4, GRID - 2, 5),
      ],
    },
  };

  /**
   * Retrieve a maze definition by identifier, defaulting to the simple maze.
   * @param {string} mazeId Maze identifier.
   * @returns {object} Maze definition including geometry and metadata.
   */
  function get(mazeId) {
    return mazeDefinitions[mazeId] || mazeDefinitions.simple;
  }

  /**
   * Expose the full maze definitions map.
   * @returns {Record<string, object>} All maze definitions keyed by id.
   */
  function getAll() {
    return mazeDefinitions;
  }

  /**
   * Build a lightweight list of maze metadata for UI consumption.
   * @returns {Array<{id:string,name:string,difficulty:string}>} Summary list.
   */
  function getList() {
    return Object.values(mazeDefinitions).map((m) => ({
      id: m.id,
      name: m.name,
      difficulty: m.difficulty,
    }));
  }

  /**
   * Render the selected maze walls and exit zone on the provided canvas context.
   * @param {CanvasRenderingContext2D} ctx Canvas rendering context.
   * @param {number} scale Conversion factor from millimeters to pixels.
   * @param {string} mazeId Maze identifier to draw.
   * @returns {void}
   */
  function draw(ctx, scale, mazeId) {
    const maze = get(mazeId);
    if (!maze || !maze.walls) return;

    ctx.save();
    ctx.fillStyle = "#4a4a6a";
    ctx.strokeStyle = "#6a6a8a";
    ctx.lineWidth = 2;

    for (const wall of maze.walls) {
      ctx.fillRect(
        wall.x * scale,
        wall.y * scale,
        wall.width * scale,
        wall.height * scale,
      );
      ctx.strokeRect(
        wall.x * scale,
        wall.y * scale,
        wall.width * scale,
        wall.height * scale,
      );
    }

    ctx.restore();
  }

  // Public API
  return {
    get,
    getAll,
    getList,
    draw,
    WALL_THICKNESS,
  };
})();
