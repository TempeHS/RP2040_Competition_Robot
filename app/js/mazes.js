/**
 * AIDriver Simulator - Maze Definitions
 * Pre-defined mazes for Challenge 6: Maze Navigation
 */

const Mazes = (function () {
  "use strict";

  // Wall thickness in mm (reduced for wider corridors)
  const WALL_THICKNESS = 30;

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
   * Mazes are designed mirror-symmetric across the vertical centreline
   * (x = 1000). The recorded `startPosition` and `endZone` describe the
   * LEFT-wall ("AIDriver(\"left\")") spawn; when the user instantiates
   * `AIDriver("right")` the simulator auto-mirrors both via
   * `Simulator.mirrorPose` / `Simulator.mirrorRect` (see App.onAIDriverInstantiated).
   *
   * The few mazes that are inherently chiral (spiral, classic) carry
   * `symmetric: false` so the simulator leaves the spawn alone for those.
   *
   * @type {Record<string, MazeDefinition>}
   */
  const mazeDefinitions = {
    // Straight corridor — symmetric pair of outer corridors. Two long
    // vertical walls split the arena into three vertical strips. Drive
    // north along whichever outer strip your spawn picked.
    straight_corridor: {
      id: "straight_corridor",
      name: "Straight Corridor",
      difficulty: "Easy",
      symmetric: true,
      description:
        'Drive straight up the outer corridor — perfect for tuning P and PD controllers. Switch AIDriver("left") <> AIDriver("right") to flip sides.',
      startPosition: { x: 250, y: 1700, heading: 0 },
      endZone: { x: 50, y: 100, width: 400, height: 200 },
      walls: [
        // Inner wall of the LEFT corridor
        { x: 500, y: 0, width: WALL_THICKNESS, height: 2000 },
        // Inner wall of the RIGHT corridor (mirror)
        { x: 1470, y: 0, width: WALL_THICKNESS, height: 2000 },
      ],
    },

    // Corner — single large central block, mirror-symmetric about
    // x = 1000 so the same maze works for both left- and right-hand
    // wall followers. A 400 mm wide corridor wraps the block on the
    // left, top and right. The block touches the bottom edge so the
    // only path is: drive up the outer corridor, turn 90° at the top,
    // continue to the opposite top corner.
    corner: {
      id: "corner",
      name: "Corner",
      difficulty: "Easy",
      symmetric: true,
      description:
        "Drive up the outer corridor, detect the front wall, then turn 90° toward the centre to reach the top.",
      startPosition: { x: 200, y: 1700, heading: 0 },
      walls: [
        // Central block: x = 400..1600, y = 400..2000.
        // Symmetric: mirror about x=1000 maps the block to itself.
        { x: 400, y: 400, width: 1200, height: 1600 },
      ],
    },

    // Dead end — TWO sealed pockets, one on each side of the arena.
    // Dead End — single full-height central block, mirror-symmetric
    // about x = 1000. The two 400 mm wide side channels (x < 400 and
    // x > 1600) are dead-ends capped only by the arena's top boundary,
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
        // Central block fills the entire arena height between the two
        // outer channels. The arena boundary acts as the end wall.
        { x: 400, y: 0, width: 1200, height: 2000 },
      ],
      // Spawn near the bottom of the left channel; mirror puts the
      // right-mode spawn at x = 1800.
      startPosition: { x: 200, y: 1700, heading: 0 },
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
      startPosition: { x: 300, y: 1700, heading: 0 },
      endZone: { x: 900, y: 100, width: 200, height: 200 },
      walls: [
        // Lower horizontal walls block direct vertical travel except in
        // outer corridors. Two pieces, each mirrored across x=1000.
        { x: 0, y: 1000, width: 700, height: WALL_THICKNESS },
        { x: 1300, y: 1000, width: 700, height: WALL_THICKNESS },
        // Vertical walls forming the outer corridors (y=400..1000)
        { x: 700, y: 400, width: WALL_THICKNESS, height: 600 },
        { x: 1270, y: 400, width: WALL_THICKNESS, height: 600 },
      ],
    },

    // Zigzag — symmetric chevron pattern. Three horizontal walls each
    // built from mirrored pieces with a central gap to weave through.
    zigzag: {
      id: "zigzag",
      name: "Zigzag Path",
      difficulty: "Medium",
      symmetric: true,
      description:
        "Weave through three rows of walls, each with a central gap. Symmetric across the centreline so left- and right-wall runs feel the same.",
      startPosition: { x: 300, y: 1700, heading: 0 },
      endZone: { x: 900, y: 50, width: 200, height: 150 },
      walls: [
        // Bottom row: gap in the centre (x=800..1200)
        { x: 0, y: 1300, width: 800, height: WALL_THICKNESS },
        { x: 1200, y: 1300, width: 800, height: WALL_THICKNESS },
        // Middle row: gap on each end (wall in the centre, blocks centreline)
        { x: 600, y: 800, width: 800, height: WALL_THICKNESS },
        // Top row: gap in the centre again
        { x: 0, y: 300, width: 800, height: WALL_THICKNESS },
        { x: 1200, y: 300, width: 800, height: WALL_THICKNESS },
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
      startPosition: { x: 300, y: 1700, heading: 0 },
      endZone: { x: 800, y: 800, width: 200, height: 200 },
      walls: [
        // Outer spiral - 400mm spacing between walls
        { x: 0, y: 1400, width: 1600, height: WALL_THICKNESS },
        { x: 1600, y: 400, width: WALL_THICKNESS, height: 1030 },
        { x: 400, y: 400, width: 1230, height: WALL_THICKNESS },
        { x: 400, y: 400, width: WALL_THICKNESS, height: 600 },
        // Inner spiral - 400mm inward
        { x: 400, y: 1000, width: 800, height: WALL_THICKNESS },
        { x: 1200, y: 800, width: WALL_THICKNESS, height: 230 },
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
      startPosition: { x: 250, y: 1750, heading: 0 },
      endZone: { x: 1700, y: 100, width: 200, height: 200 },
      walls: [
        // Horizontal walls
        { x: 500, y: 400, width: 500, height: WALL_THICKNESS },
        { x: 1500, y: 400, width: 500, height: WALL_THICKNESS },
        { x: 500, y: 1100, width: 1000, height: WALL_THICKNESS },
        { x: 500, y: 1500, width: 500, height: WALL_THICKNESS },
        // Vertical walls
        { x: 500, y: 700, width: WALL_THICKNESS, height: 400 },
        { x: 500, y: 1500, width: WALL_THICKNESS, height: 500 },
        { x: 1000, y: 0, width: WALL_THICKNESS, height: 400 },
        { x: 1500, y: 400, width: WALL_THICKNESS, height: 700 },
      ],
    },

    // Obstacle course — scattered obstacles arranged symmetrically.
    obstacles: {
      id: "obstacles",
      name: "Obstacle Course",
      difficulty: "Medium",
      symmetric: true,
      description:
        "Navigate around scattered obstacles. Layout is mirrored across the centreline so either AIDriver side works.",
      startPosition: { x: 300, y: 1700, heading: 0 },
      endZone: { x: 900, y: 50, width: 200, height: 150 },
      walls: [
        // Wall-attached obstacles (each pair mirrored across x=1000)
        { x: 0, y: 1200, width: 300, height: 200 },
        { x: 1700, y: 1200, width: 300, height: 200 },
        { x: 600, y: 0, width: 200, height: 300 },
        { x: 1200, y: 0, width: 200, height: 300 },
        { x: 0, y: 600, width: 200, height: 200 },
        { x: 1800, y: 600, width: 200, height: 200 },
        // Centre obstacles (mirrored pair)
        { x: 600, y: 900, width: 200, height: 200 },
        { x: 1200, y: 900, width: 200, height: 200 },
      ],
    },
  };

  /**
   * Generate a deterministic classic maze layout comprised of cell-aligned walls.
   * @returns {Array<{x:number,y:number,width:number,height:number}>} Wall definitions.
   */
  function generateClassicMaze() {
    const walls = [];
    const cellSize = 200;
    const cols = 10;
    const rows = 10;

    // Add some predefined walls for a solvable maze
    const wallPatterns = [
      // Row 0
      { r: 0, c: 2, dir: "bottom" },
      { r: 0, c: 4, dir: "bottom" },
      { r: 0, c: 6, dir: "bottom" },
      { r: 0, c: 8, dir: "bottom" },

      // Row 1
      { r: 1, c: 1, dir: "right" },
      { r: 1, c: 3, dir: "bottom" },
      { r: 1, c: 5, dir: "right" },
      { r: 1, c: 7, dir: "bottom" },

      // Row 2
      { r: 2, c: 0, dir: "right" },
      { r: 2, c: 2, dir: "right" },
      { r: 2, c: 4, dir: "bottom" },
      { r: 2, c: 6, dir: "right" },
      { r: 2, c: 8, dir: "bottom" },

      // Row 3
      { r: 3, c: 1, dir: "bottom" },
      { r: 3, c: 3, dir: "right" },
      { r: 3, c: 5, dir: "bottom" },
      { r: 3, c: 7, dir: "right" },

      // Row 4
      { r: 4, c: 0, dir: "right" },
      { r: 4, c: 2, dir: "bottom" },
      { r: 4, c: 4, dir: "right" },
      { r: 4, c: 6, dir: "bottom" },
      { r: 4, c: 8, dir: "right" },

      // Row 5
      { r: 5, c: 1, dir: "right" },
      { r: 5, c: 3, dir: "bottom" },
      { r: 5, c: 5, dir: "right" },
      { r: 5, c: 7, dir: "bottom" },

      // Row 6
      { r: 6, c: 0, dir: "bottom" },
      { r: 6, c: 2, dir: "right" },
      { r: 6, c: 4, dir: "bottom" },
      { r: 6, c: 6, dir: "right" },
      { r: 6, c: 8, dir: "bottom" },

      // Row 7
      { r: 7, c: 1, dir: "bottom" },
      { r: 7, c: 3, dir: "right" },
      { r: 7, c: 5, dir: "bottom" },
      { r: 7, c: 7, dir: "right" },

      // Row 8
      { r: 8, c: 0, dir: "right" },
      { r: 8, c: 2, dir: "bottom" },
      { r: 8, c: 4, dir: "right" },
      { r: 8, c: 6, dir: "bottom" },
      { r: 8, c: 8, dir: "right" },
    ];

    for (const pattern of wallPatterns) {
      const x = pattern.c * cellSize;
      const y = pattern.r * cellSize;

      if (pattern.dir === "right") {
        walls.push({
          x: x + cellSize - WALL_THICKNESS / 2,
          y: y,
          width: WALL_THICKNESS,
          height: cellSize,
        });
      } else if (pattern.dir === "bottom") {
        walls.push({
          x: x,
          y: y + cellSize - WALL_THICKNESS / 2,
          width: cellSize,
          height: WALL_THICKNESS,
        });
      }
    }

    return walls;
  }

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
