/**
 * AIDriver Simulator - Challenge Definitions
 * PID wall-following progression: 5 challenges building to full maze solving
 */

const Challenges = (function () {
  "use strict";

  // Challenge difficulty colors
  const DIFFICULTY = {
    BEGINNER: "success",
    EASY: "info",
    MEDIUM: "warning",
    HARD: "danger",
  };

  /**
   * Comprehensive challenge definitions keyed by identifier.
   * Consumers should treat this object as immutable runtime configuration.
   */
  const definitions = {
    // Debug Script: Hardware test from project/main.py
    debug: {
      id: "debug",
      title: "Debug Script",
      subtitle: "Hardware Test",
      icon: "bi-bug",
      menuGroup: "special",
      difficulty: DIFFICULTY.BEGINNER,
      description:
        "Run the hardware debug script (project/main.py) to test all robot functions.",
      goal: "Verify motors, sensors, and the drive() method are working correctly.",
      hints: [
        "This script tests all hardware functions",
        "Watch the robot drive forward, backward, rotate, and read distances",
        "Check the debug output for front and side sensor readings",
      ],
      startPosition: { x: 1000, y: 1800, heading: 0 },
      successCriteria: {
        type: "run_without_error",
        minDistance: 100,
      },
      path: null,
      obstacles: [],
    },

    // Challenge 1: P Controller — Wall Following in a Straight Corridor
    1: {
      id: 1,
      title: "Wall Follow — P Control",
      subtitle: "Proportional Steering",
      icon: "bi-arrow-up",
      menuGroup: "basic",
      difficulty: DIFFICULTY.BEGINNER,
      description:
        "Use the side ultrasonic sensor and Proportional control to follow a straight wall.",
      goal: "Follow the wall from start to the green exit zone without hitting it.",
      hints: [
        "read_distance_2() reads the side ultrasonic sensor",
        "error = wall_distance - TARGET_WALL_DISTANCE",
        "steering = Kp * error adjusts wheel speed difference",
        "Keep BASE_SPEED - MAX_STEERING > 64 (dead zone)",
        "drive() handles signed speeds and the dead zone automatically",
      ],
      startPosition: { x: 145, y: 1885, heading: 0 },
      spawnXRange: { min: 80, max: 220 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 100, y: 100, width: 300, height: 200 },
      },
      path: null,
      obstacles: [],
      maze: "straight_corridor",
    },

    // Challenge 2: PD Controller — Off-Centre Start
    2: {
      id: 2,
      title: "Wall Follow — PD Control",
      subtitle: "Dampen Oscillations",
      icon: "bi-activity",
      menuGroup: "basic",
      difficulty: DIFFICULTY.EASY,
      description:
        "Add the Derivative term to dampen oscillations when starting off-centre.",
      goal: "Follow the wall smoothly to the exit zone — P alone will oscillate.",
      hints: [
        "derivative = error - previous_error",
        "steering = (Kp * error) + (Kd * derivative)",
        "D opposes rapid change — it slows approach and reduces overshoot",
        "Start with Kd = 0.3, then tune",
        "Remember to save previous_error each loop",
      ],
      startPosition: { x: 145, y: 1885, heading: 0 },
      spawnXRange: { min: 70, max: 220 },
      spawnHeadingRange: { min: -20, max: 20 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 100, y: 100, width: 300, height: 200 },
      },
      path: null,
      obstacles: [],
      maze: "straight_corridor",
    },

    // Challenge 3: Full PID — L-Shaped Corridor
    3: {
      id: 3,
      title: "Wall Follow — Full PID",
      subtitle: "Integral Correction",
      icon: "bi-bezier2",
      menuGroup: "basic",
      difficulty: DIFFICULTY.MEDIUM,
      description:
        "Add the Integral term to correct steady-state drift around an L-shaped corner.",
      goal: "Follow the wall around the L corner to the exit zone.",
      hints: [
        "integral = integral + error — accumulated error over time",
        "steering = (Kp * error) + (Ki * integral) + (Kd * derivative)",
        "Keep Ki very small (start 0.01) to avoid windup",
        "Clamp integral to INTEGRAL_MAX to prevent runaway",
        "Reset integral to 0 when sensor returns -1",
      ],
      startPosition: { x: 145, y: 1885, heading: 0 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 870, y: 0, width: 290, height: 290 },
      },
      path: null,
      obstacles: [],
      maze: "corner",
    },

    // Challenge 4: Corner Detection — single 90° turn
    4: {
      id: 4,
      title: "Corner Detection",
      subtitle: "Front Sensor + Turn",
      icon: "bi-sign-turn-right",
      menuGroup: "advanced",
      difficulty: DIFFICULTY.MEDIUM,
      description:
        "Use the front sensor to detect a corner, then run your own gyro turn PID — its error is the gyroscope heading, not the wall distance — to spin 90° in the correct direction before resuming wall following.",
      goal: "Follow the wall, detect the corner, turn 90° with your gyro turn PID, and reach the exit.",
      hints: [
        "Use read_distance() for the front sensor — detects the wall ahead",
        "If front <= FRONT_STOP_DISTANCE → brake, then run your gyro turn PID",
        "The turn's error is the gyro heading (read_gyro_z_dps), not the wall — tune turn_Kp / turn_Kd / turn_tolerance",
        "wall_sign picks the turn direction automatically (left wall → spin right)",
        "Reset side_integral and side_previous_error after turning",
      ],
      startPosition: { x: 200, y: 1700, heading: 0 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 1600, y: 0, width: 400, height: 400 },
      },
      path: null,
      obstacles: [],
      maze: "corner",
    },

    // Challenge 5: Outside Corners — Turn Left at a Nib
    5: {
      id: 5,
      title: "Outside Corners",
      subtitle: "Turn Left at a Nib",
      icon: "bi-bounding-box",
      menuGroup: "advanced",
      difficulty: DIFFICULTY.MEDIUM,
      description:
        "When the wall you're following ends abruptly (an outside / convex corner, or a free-standing nib), the side sensor returns -1. Following the left-hand rule, turn LEFT to wrap the corner — reusing the SAME gyro turn PID you wrote in Challenge 4.",
      goal: "Detect the nib, turn left with your held gyro turn PID, and reach the pocket behind it.",
      hints: [
        "side == -1 means the wall has ended — that's the outside corner / nib",
        "Left-hand rule: turn LEFT to wrap a nib (wall_sign == 1 → spin left)",
        "Reuse the SAME gyro turn PID from C4 — only the direction differs",
        "Keep turn_Kp / turn_Kd / turn_tolerance at your tuned C4 values",
        "Reset side_integral and side_previous_error after the turn",
      ],
      startPosition: { x: 1000, y: 1700, heading: 0 },
      successCriteria: {
        type: "reach_zone",
        // Top-left pocket behind the left nib. Mirrors to top-right
        // for AIDriver("right").
        zone: { x: 0, y: 0, width: 400, height: 400 },
      },
      path: null,
      obstacles: [],
      maze: "outside_corners",
    },

    // Challenge 6: Dead-End Detection — front-triggered turn behaviour
    6: {
      id: 6,
      title: "Dead End Detection",
      subtitle: "Front Trigger Priority",
      icon: "bi-arrow-counterclockwise",
      menuGroup: "advanced",
      difficulty: DIFFICULTY.MEDIUM,
      description:
        "Focus on front-triggered turning in a dead-end channel: when a wall is ahead, brake and run the SAME held gyro turn PID from Challenge 4 to rotate away from the blockage and continue.",
      goal: "Follow the wall, detect the dead end with the front sensor, turn away cleanly, and reach the exit.",
      hints: [
        "Front wall (front <= FRONT_STOP_DISTANCE) is the primary trigger in this maze",
        "Use the SAME held gyro turn PID from C4 — keep your tuned turn gains",
        "Brake, rotate away from the dead end, then reacquire side-wall control",
        "wall_sign still determines turn direction for left/right wall mode",
        "Reset side_integral and side_previous_error after every turn",
      ],
      startPosition: { x: 200, y: 1700, heading: 0 },
      successCriteria: {
        type: "reach_zone",
        // Top of the left channel (dead-end). Mirrors to the right
        // channel top for AIDriver("right").
        zone: { x: 0, y: 0, width: 400, height: 400 },
      },
      path: null,
      obstacles: [],
      maze: "dead_end",
    },

    // Challenge 7: Full Maze Solving — Hand on Wall
    7: {
      id: 7,
      title: "Maze Solver",
      subtitle: "Hand-on-Wall",
      icon: "bi-signpost-split",
      menuGroup: "advanced",
      difficulty: DIFFICULTY.HARD,
      description:
        "Navigate the full maze using your tuned PID wall following and the left-hand rule: turn RIGHT at dead ends and LEFT at nibs — every turn using the held gyro turn PID from Challenge 4.",
      goal: "Reach the exit zone without hitting walls. Time limit: 60 seconds.",
      hints: [
        "Left-hand rule: keep the wall on your left the whole way",
        "Priority 1: wall ahead (dead end) → brake and turn RIGHT",
        "Priority 2: side == -1 (nib) → turn LEFT",
        "Priority 3: wall visible → PID wall-follow as before",
        "Every turn reuses your held C4 gyro turn PID (turn_Kp / turn_Kd / turn_tolerance)",
      ],
      startPosition: { x: 300, y: 1700, heading: 0 },
      spawnXRange: { min: 110, max: 410 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 1700, y: 100, width: 200, height: 200 },
        timeLimit: 60,
      },
      path: null,
      obstacles: [],
      maze: "zigzag",
    },

    // Challenge 8: Ground Colour Detection — pause on markers
    8: {
      id: 8,
      title: "Colour Markers",
      subtitle: "Detect & Pause",
      icon: "bi-palette",
      menuGroup: "advanced",
      difficulty: DIFFICULTY.MEDIUM,
      description:
        "Drive straight up column 0 and use the TCS34725 ground colour sensor to detect coloured floor markers. Pause for a set time on each RED and GREEN marker, then continue. The silver markers mark the start and finish.",
      goal: "Tune the colour thresholds so the robot pauses on every red and green marker, then reaches the silver finish zone.",
      hints: [
        "Read raw counts with r, g, b, c = my_robot.read_color()",
        "color_detected() is True whenever the interrupt fires over a marker",
        "Raise color_min_clear until the plain floor classifies as 'none'",
        "A red marker has a high red fraction r / (r + g + b); green is similar",
        "Silver is bright AND balanced — tune color_silver_clear above the floor's clear value",
        "Pause with hold_state(COLOR_PAUSE_TIME) when you see red or green",
      ],
      startPosition: { x: 145, y: 1885, heading: 0 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 0, y: 0, width: 290, height: 290 },
        timeLimit: 60,
      },
      path: null,
      obstacles: [],
      maze: "straight_corridor",
      // Coloured floor markers (mm rects) the simulated sensor reads.
      // rgb = [red, green, blue, clear] counts; mirrors the hardware
      // (plain floor reads [40, 40, 40, 120]). Markers sit in alternate
      // cells so there is always a strip of plain floor between them.
      colorZones: [
        {
          x: 0,
          y: 1740,
          width: 290,
          height: 290,
          rgb: [200, 200, 200, 620],
          color: "silver",
        },
        {
          x: 0,
          y: 1160,
          width: 290,
          height: 290,
          rgb: [200, 40, 40, 280],
          color: "red",
        },
        {
          x: 0,
          y: 580,
          width: 290,
          height: 290,
          rgb: [40, 200, 40, 280],
          color: "green",
        },
        {
          x: 0,
          y: 0,
          width: 290,
          height: 290,
          rgb: [200, 200, 200, 620],
          color: "silver",
        },
      ],
    },

    // Challenge 9: No-Go Zones — detect BLACK and recover.
    9: {
      id: 9,
      title: "No-Go Zones",
      subtitle: "Detect Black & Recover",
      icon: "bi-sign-stop",
      menuGroup: "advanced",
      difficulty: DIFFICULTY.HARD,
      description:
        "BLACK floor patches are no-go areas. Wall-follow up the left wall; the moment the colour sensor reads BLACK, run the recovery: reverse straight out on the gyro, turn 90° toward open space, then drive on the gyro until you find a wall again.",
      goal: "Detect the black no-go patch, recover with the four-step manoeuvre, and reach the exit zone on the far side.",
      hints: [
        "Black absorbs the sensor's light, so its clear value reads BELOW the floor",
        "Tune my_robot.color_black_clear just under the floor's clear reading",
        "color_detected() only fires on bright markers — POLL classify_color() for black",
        "Step 1: reverse with a heading PID (read_gyro_z_dps) so you back out straight",
        "Step 2: read the side sensor to turn AWAY from the nearest wall (toward open space)",
        "Step 3/4: drive forward on the gyro until read_distance() finds the next wall",
      ],
      startPosition: { x: 200, y: 1885, heading: 0 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 1450, y: 290, width: 580, height: 1450 },
        timeLimit: 60,
      },
      path: null,
      obstacles: [],
      maze: null,
      // A single BLACK no-go patch occupying exactly one 290x290 grid cell.
      // Black absorbs the LED so its clear value (~30) sits well below the
      // plain floor (~120).
      colorZones: [
        {
          x: 0,
          y: 580,
          width: 290,
          height: 290,
          rgb: [10, 10, 10, 30],
          color: "black",
        },
      ],
    },

    // Challenge 10: Competition Run — victims, score, and the OLED display.
    10: {
      id: 10,
      title: "Competition Run",
      subtitle: "Victims, Score & OLED",
      icon: "bi-trophy",
      menuGroup: "advanced",
      difficulty: DIFFICULTY.HARD,
      description:
        "The Rescue Maze capstone. Drive up the corridor, identify each GREEN (unharmed) and RED (harmed) victim, and report what you find on the SSD1306 OLED — current state, running score and victim count. Drop a rescue kit on every harmed victim, then show the final report at the silver finish.",
      goal: "Count every green and red victim, show the live state/score/victims on the OLED, drop a kit on each harmed victim, and reach the silver finish with a RUN COMPLETE report on screen.",
      hints: [
        "Show state + score with my_robot.display_status(state, score, victims)",
        "Green victim = unharmed (10 pts); red victim = harmed (25 pts)",
        "Call my_robot.deploy_rescue_kit() on each RED victim for the +10 bonus",
        "Only count a victim the first frame you roll onto it (track previous_color)",
        "Keep your own score = unharmed*10 + harmed*25 + kits*10",
        "At the silver finish use show_display(...) to print the final report",
      ],
      startPosition: { x: 145, y: 1885, heading: 0 },
      successCriteria: {
        type: "reach_zone",
        zone: { x: 0, y: 0, width: 290, height: 290 },
        timeLimit: 90,
      },
      path: null,
      obstacles: [],
      maze: "straight_corridor",
      // Silver start, two victims (green + red) and a silver finish, with a
      // plain-floor strip between each so markers are detected one at a time.
      colorZones: [
        {
          x: 0,
          y: 1740,
          width: 290,
          height: 290,
          rgb: [200, 200, 200, 620],
          color: "silver",
        },
        {
          x: 0,
          y: 1160,
          width: 290,
          height: 290,
          rgb: [40, 200, 40, 280],
          color: "green",
        },
        {
          x: 0,
          y: 580,
          width: 290,
          height: 290,
          rgb: [200, 40, 40, 280],
          color: "red",
        },
        {
          x: 0,
          y: 0,
          width: 290,
          height: 290,
          rgb: [200, 200, 200, 620],
          color: "silver",
        },
      ],
    },
  };

  /**
   * Roll a random spawn position for a challenge.  If the challenge has
   * `spawnXRange` (and optionally `spawnHeadingRange`), the returned
   * position uses a uniform-random x (and heading) within those bounds.
   * Otherwise the static `startPosition` is returned unchanged.
   *
   * @param {object} challenge  A challenge definition from `get()`.
   * @returns {{x:number, y:number, heading:number}} Spawn pose in mm / degrees.
   */
  function randomizeSpawn(challenge) {
    const base = challenge.startPosition || { x: 300, y: 1700, heading: 0 };
    const pos = { x: base.x, y: base.y, heading: base.heading || 0 };

    if (challenge.spawnXRange) {
      const { min, max } = challenge.spawnXRange;
      pos.x = Math.floor(Math.random() * (max - min + 1)) + min;
    }
    if (challenge.spawnHeadingRange) {
      const { min, max } = challenge.spawnHeadingRange;
      pos.heading = Math.floor(Math.random() * (max - min + 1)) + min;
    }
    return pos;
  }

  /**
   * Retrieve a challenge definition by identifier, falling back to challenge 0 when missing.
   * @param {number|string} id Challenge identifier; accepts numeric or string ids.
   * @returns {object} Challenge metadata including paths, goals, and criteria.
   */
  function get(id) {
    return definitions[id] || definitions[1];
  }

  /**
   * Access the full definitions map for read-only operations.
   * @returns {Record<string, object>} Dictionary of challenge definitions keyed by id.
   */
  function getAll() {
    return definitions;
  }

  /**
   * Count the total number of registered challenges.
   * @returns {number} Total challenge entries including debug script.
   */
  function count() {
    return Object.keys(definitions).length;
  }

  /**
   * Evaluate the robot state against the challenge-specific success criteria.
   * @param {number|string} challengeId Identifier of the active challenge.
   * @param {{x:number,y:number,leftSpeed:number,rightSpeed:number,heading?:number}} robotState Latest simulator robot snapshot.
   * @param {object} sessionData Aggregated telemetry captured during the run.
   * @returns {{success:boolean,message:string}} Result with user-facing feedback.
   */
  function checkSuccess(challengeId, robotState, sessionData) {
    const challenge = get(challengeId);
    const criteria = challenge.successCriteria;

    switch (criteria.type) {
      case "run_without_error":
        return checkRunWithoutError(robotState, sessionData, criteria);

      case "reach_zone": {
        let zone = criteria.zone;
        if (!zone && challenge.maze && typeof Mazes !== "undefined") {
          const maze = Mazes.get(challenge.maze);
          if (maze && maze.endZone) zone = maze.endZone;
        }
        return checkReachZone(robotState, { zone });
      }

      case "complete_circle":
        return checkCompleteCircle(robotState, sessionData, criteria);

      case "stop_at_distance":
        return checkStopAtDistance(robotState, criteria);

      case "return_to_start":
        return checkReturnToStart(robotState, sessionData, criteria);

      case "figure_eight":
        return checkFigureEight(robotState, sessionData, criteria);

      case "manual":
        return { success: false, message: "Manual mode - no auto-check" };

      default:
        return { success: false, message: "Unknown criteria type" };
    }
  }

  /**
   * Determine whether the run completed error-free and covered the minimum distance.
   * @param {{x:number,y:number}} robot Current robot coordinates.
   * @param {{hasError?:boolean,startPosition?:{x:number,y:number}}} session Session metrics for the attempt.
   * @param {{minDistance:number}} criteria Success constraint for movement.
   * @returns {{success:boolean,message:string}} Evaluation outcome.
   */
  function checkRunWithoutError(robot, session, criteria) {
    if (session.hasError) {
      return { success: false, message: "Code has errors" };
    }

    const startPos = session.startPosition || { x: robot.x, y: robot.y };
    const distance = Math.hypot(robot.x - startPos.x, robot.y - startPos.y);

    if (distance < criteria.minDistance) {
      return {
        success: false,
        message: `Move at least ${criteria.minDistance}mm`,
      };
    }

    return { success: true, message: "Code runs correctly!" };
  }

  /**
   * Determine whether the robot currently resides inside the configured zone.
   * @param {{x:number,y:number}} robot Current robot coordinates.
   * @param {{zone:{x:number,y:number,width:number,height:number}}} criteria Zone dimensions to evaluate.
   * @returns {{success:boolean,message:string}} Evaluation outcome.
   */
  function checkReachZone(robot, criteria) {
    const zone = criteria.zone;
    const inZone =
      robot.x >= zone.x &&
      robot.x <= zone.x + zone.width &&
      robot.y >= zone.y &&
      robot.y <= zone.y + zone.height;

    if (inZone) {
      return { success: true, message: "Target zone reached!" };
    }

    return {
      success: false,
      message: "Reach the green target zone",
    };
  }

  /**
   * Confirm the robot completed sufficient rotation and returned near its start point.
   * @param {{x:number,y:number}} robot Current robot coordinates.
   * @param {{startPosition:{x:number,y:number},totalRotation?:number}} session Session metrics.
   * @param {{minRotation:number,centerTolerance:number}} criteria Circle completion bounds.
   * @returns {{success:boolean,message:string}} Evaluation outcome.
   */
  function checkCompleteCircle(robot, session, criteria) {
    const startPos = session.startPosition;
    const totalRotation = session.totalRotation || 0;

    if (Math.abs(totalRotation) < criteria.minRotation) {
      return {
        success: false,
        message: `Complete more rotation (${Math.abs(totalRotation).toFixed(
          0,
        )}° / ${criteria.minRotation}°)`,
      };
    }

    const distanceFromStart = Math.hypot(
      robot.x - startPos.x,
      robot.y - startPos.y,
    );
    if (distanceFromStart > criteria.centerTolerance) {
      return {
        success: false,
        message: `Return closer to start (${distanceFromStart.toFixed(
          0,
        )}mm away)`,
      };
    }

    return { success: true, message: "Circle completed!" };
  }

  /**
   * Verify the robot has stopped and is within the prescribed distance window from the wall.
   * @param {{x:number,y:number,leftSpeed:number,rightSpeed:number}} robot Robot state including wheel speeds.
   * @param {{wallPosition:number,targetDistance:{min:number,max:number}}} criteria Distance tolerances.
   * @returns {{success:boolean,message:string}} Evaluation outcome.
   */
  function checkStopAtDistance(robot, criteria) {
    const distanceToWall = robot.y - criteria.wallPosition;
    const isStopped = robot.leftSpeed === 0 && robot.rightSpeed === 0;

    if (!isStopped) {
      return { success: false, message: "Robot must stop" };
    }

    if (distanceToWall < criteria.targetDistance.min) {
      return { success: false, message: "Too close to wall!" };
    }

    if (distanceToWall > criteria.targetDistance.max) {
      return {
        success: false,
        message: `Get closer to wall (${distanceToWall.toFixed(0)}mm)`,
      };
    }

    return { success: true, message: "Perfect stop!" };
  }

  /**
   * Validate the robot reached the top of the arena and returned to the origin zone.
   * @param {{x:number,y:number}} robot Current robot coordinates.
   * @param {{minY?:number}} session Session tracking with minY metric.
   * @param {{startZone:{x:number,y:number,width:number,height:number},mustReachTop:number}} criteria Required movement bounds.
   * @returns {{success:boolean,message:string}} Evaluation outcome.
   */
  function checkReturnToStart(robot, session, criteria) {
    const zone = criteria.startZone;
    const inStartZone =
      robot.x >= zone.x &&
      robot.x <= zone.x + zone.width &&
      robot.y >= zone.y &&
      robot.y <= zone.y + zone.height;

    // Check if reached top
    const reachedTop = session.minY && session.minY <= criteria.mustReachTop;

    if (!reachedTop) {
      return { success: false, message: "Drive to the top first" };
    }

    if (!inStartZone) {
      return { success: false, message: "Return to the starting area" };
    }

    return { success: true, message: "U-turn complete!" };
  }

  /**
   * Assess figure-eight completion by crossover counts and cumulative rotation.
   * @param {{}} robot Robot state (position not directly used).
   * @param {{crossoverCount?:number,totalRotation?:number}} session Session metrics captured during run.
   * @param {{crossoverCount:number,minRotation:number}} criteria Figure-eight thresholds.
   * @returns {{success:boolean,message:string}} Evaluation outcome.
   */
  function checkFigureEight(robot, session, criteria) {
    const crossovers = session.crossoverCount || 0;
    const totalRotation = Math.abs(session.totalRotation || 0);

    if (crossovers < criteria.crossoverCount) {
      return {
        success: false,
        message: `Cross the center more (${crossovers}/${criteria.crossoverCount})`,
      };
    }

    if (totalRotation < criteria.minRotation) {
      return {
        success: false,
        message: `Complete more turns (${totalRotation.toFixed(0)}° / ${
          criteria.minRotation
        }°)`,
      };
    }

    return { success: true, message: "Figure 8 complete!" };
  }

  /**
   * Build the HTML string representing the grouped challenge dropdown menu.
   * @param {"simulator"|"docs"} [menuType="simulator"] Determines link targets within the menu.
   * @returns {string} HTML snippet for insertion into dropdown menus.
   */
  function generateMenuHTML(menuType = "simulator") {
    const groups = { special: [], basic: [], advanced: [] };

    // Sort challenges into groups
    Object.values(definitions).forEach((challenge) => {
      const group = challenge.menuGroup || "basic";
      if (groups[group]) {
        groups[group].push(challenge);
      }
    });

    let html = "";

    // Special group (debug script) - shown first with divider after
    groups.special.forEach((c) => {
      const href =
        menuType === "docs"
          ? `docs.html?doc=Challenge_${c.id}`
          : `simulator.html?challenge=${c.id}`;
      html += `<li><a class="dropdown-item" href="${href}" data-challenge="${c.id}">`;
      html += `<i class="bi ${c.icon} me-2"></i>${c.title}`;
      html += `</a></li>`;
    });

    if (groups.special.length > 0) {
      html += `<li><hr class="dropdown-divider" /></li>`;
    }

    // Basic group (challenges 1-3: P, PD, PID)
    groups.basic.forEach((c) => {
      const href =
        menuType === "docs"
          ? `docs.html?doc=Challenge_${c.id}`
          : `simulator.html?challenge=${c.id}`;
      const label =
        typeof c.id === "number" ? `Challenge ${c.id}: ${c.title}` : c.title;
      html += `<li><a class="dropdown-item" href="${href}" data-challenge="${c.id}">`;
      html += `<i class="bi ${c.icon} me-2"></i>${label}`;
      html += `</a></li>`;
    });

    if (groups.advanced.length > 0) {
      html += `<li><hr class="dropdown-divider" /></li>`;
    }

    // Advanced group (challenges 4-5: sensor fusion, maze)
    groups.advanced.forEach((c) => {
      const href =
        menuType === "docs"
          ? `docs.html?doc=Challenge_${c.id}`
          : `simulator.html?challenge=${c.id}`;
      const label =
        typeof c.id === "number" ? `Challenge ${c.id}: ${c.title}` : c.title;
      html += `<li><a class="dropdown-item" href="${href}" data-challenge="${c.id}">`;
      html += `<i class="bi ${c.icon} me-2"></i>${label}`;
      html += `</a></li>`;
    });

    return html;
  }

  /**
   * Inject generated challenge menu HTML into the targeted list element.
   * @param {string} selector CSS selector for the container element.
   * @param {"simulator"|"docs"} [menuType="simulator"] Link mode determining menu destination.
   * @returns {void}
   */
  function populateMenu(selector, menuType = "simulator") {
    const menuEl = document.querySelector(selector);
    if (menuEl) {
      menuEl.innerHTML = generateMenuHTML(menuType);
    }
  }

  // Public API
  return {
    get,
    getAll,
    count,
    checkSuccess,
    randomizeSpawn,
    generateMenuHTML,
    populateMenu,
    DIFFICULTY,
  };
})();
