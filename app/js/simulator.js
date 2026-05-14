/**
 * AIDriver Simulator - Physics and Robot Simulation Module
 * Handles differential drive kinematics, collision detection, and sensor simulation.
 *
 * All physical constants are derived from RobotConfig (robot-config.js).
 * Change numbers there — not here — to recalibrate the sim.
 */

const Simulator = (function () {
  "use strict";

  // ── Derived constants from RobotConfig ──────────────────────────
  const cfg = typeof RobotConfig !== "undefined" ? RobotConfig : {};

  const WHEEL_BASE = cfg.wheelBase_mm || 120;
  const MAX_MOTOR_SPEED = cfg.maxPWM || 255;
  const DEAD_ZONE_PWM = cfg.deadZonePWM || 64;
  const TOP_SPEED_MM_S = (cfg.topSpeed_ms || 0.65) * 1000; // 650 mm/s
  const MAX_ACCEL_MM_S2 = (cfg.acceleration_ms2 || 1.75) * 1000; // 1750 mm/s²
  const MAX_DECEL_MM_S2 = (cfg.deceleration_ms2 || 1.75) * 1000; // 1750 mm/s²

  // Arena dimensions
  const ARENA_WIDTH = cfg.arenaWidth_mm || 2000;
  const ARENA_HEIGHT = cfg.arenaHeight_mm || 2000;
  const ROBOT_WIDTH = cfg.robotWidth_mm || 120;
  const ROBOT_LENGTH = cfg.robotLength_mm || 150;

  // Ultrasonic sensor
  const ULTRASONIC_MIN = cfg.ultrasonicMin_mm || 20;
  const ULTRASONIC_MAX = cfg.ultrasonicMax_mm || 2000;
  const SENSOR_NOISE = cfg.sensorNoise_mm || 2;
  const ULTRASONIC_CONE_ANGLE = 15; // degrees half-angle (not currently ray-traced)

  // Side sensor placement: "left" or "right" (relative to robot heading)
  let sideSensorSide = "left";

  // Simulation state
  let lastUpdateTime = 0;
  let simulationSpeed = 1.0;
  let obstacles = [];
  let mazeWalls = [];

  // ── Speed conversion ────────────────────────────────────────────
  // Linear mapping:  DEAD_ZONE_PWM → 0 mm/s,  MAX_MOTOR_SPEED → TOP_SPEED.
  // Anything below the dead zone produces zero velocity.
  const LIVE_RANGE = MAX_MOTOR_SPEED - DEAD_ZONE_PWM; // 191

  /**
   * Convert a PWM command to a target wheel velocity in mm/s.
   * Handles negative PWM for reverse (rotate_left / rotate_right).
   * Models the real motor dead-zone: |pwm| ≤ DEAD_ZONE_PWM → 0.
   * Linear between dead-zone and max in both directions.
   */
  function pwmToVelocity(pwm) {
    const absPwm = Math.abs(pwm);
    if (absPwm <= DEAD_ZONE_PWM) return 0;
    const v = ((absPwm - DEAD_ZONE_PWM) / LIVE_RANGE) * TOP_SPEED_MM_S;
    return pwm >= 0 ? v : -v;
  }

  /**
   * Ramp `current` toward `target` at the given rate (mm/s² × dt = mm/s
   * delta). Separate accel / decel rates for future tuning flexibility.
   */
  function rampVelocity(current, target, dt) {
    const diff = target - current;
    // Choose accel or decel rate depending on whether speed is increasing
    // toward its magnitude (accelerating) or decreasing (braking).
    const rate =
      Math.abs(target) >= Math.abs(current) ? MAX_ACCEL_MM_S2 : MAX_DECEL_MM_S2;
    const maxDelta = rate * dt;
    if (Math.abs(diff) <= maxDelta) return target;
    return current + Math.sign(diff) * maxDelta;
  }

  /**
   * Integrate a single timestep of differential-drive motion.
   *
   * 1. Convert commanded PWM → target wheel velocity (with dead-zone).
   * 2. Ramp actual wheel velocities toward targets (motor inertia).
   * 3. Compute differential-drive kinematics from actual velocities.
   *
   * @param {{x:number,y:number,heading:number,leftSpeed:number,rightSpeed:number,actualLeftV:number,actualRightV:number}} robot
   * @param {number} dt Seconds since previous update.
   * @returns {object} New state snapshot.
   */
  function updateKinematics(robot, dt) {
    // --- Target velocities from commanded PWM (scaled by sim speed) ---
    const leftTargetV = pwmToVelocity(robot.leftSpeed) * simulationSpeed;
    const rightTargetV = pwmToVelocity(robot.rightSpeed) * simulationSpeed;

    // --- Motor inertia: ramp actual velocities toward targets ----------
    const scaledDt = dt * simulationSpeed; // accel also scales with sim speed
    const actualLeftV = rampVelocity(
      robot.actualLeftV || 0,
      leftTargetV,
      scaledDt,
    );
    const actualRightV = rampVelocity(
      robot.actualRightV || 0,
      rightTargetV,
      scaledDt,
    );

    // --- Differential drive kinematics --------------------------------
    // v = (vL + vR) / 2,  ω = (vL - vR) / L
    // Heading convention: forward = (sin h, −cos h) in screen space.
    // right > left ⇒ ω < 0 ⇒ turn left on screen.
    const linearVelocity = (actualLeftV + actualRightV) / 2;
    const angularVelocity = (actualLeftV - actualRightV) / WHEEL_BASE;

    const headingRad = (robot.heading * Math.PI) / 180;
    const newHeadingRad = headingRad + angularVelocity * dt;

    let newX, newY;
    if (Math.abs(angularVelocity) < 0.001) {
      // Straight-line motion
      newX = robot.x + linearVelocity * Math.sin(headingRad) * dt;
      newY = robot.y - linearVelocity * Math.cos(headingRad) * dt;
    } else {
      // Arc motion
      const R = linearVelocity / angularVelocity;
      newX = robot.x + R * (Math.cos(headingRad) - Math.cos(newHeadingRad));
      newY = robot.y - R * (Math.sin(newHeadingRad) - Math.sin(headingRad));
    }

    let newHeading = (newHeadingRad * 180) / Math.PI;
    newHeading = ((newHeading % 360) + 360) % 360;

    return {
      ...robot,
      x: newX,
      y: newY,
      heading: newHeading,
      actualLeftV,
      actualRightV,
    };
  }

  /**
   * Clamp the robot position so it remains entirely within the rectangular
   * arena. Accounts for the robot footprint rather than just its centre point
   * to prevent clipping through walls when positioned near an edge.
   *
   * @param {{x:number,y:number}} robot Robot state to constrain.
   * @returns {{x:number,y:number}} New state with x/y clamped to arena bounds.
   */
  function applyBoundaryConstraints(robot) {
    const halfWidth = ROBOT_WIDTH / 2;
    const halfLength = ROBOT_LENGTH / 2;
    const maxRadius = Math.max(halfWidth, halfLength);

    return {
      ...robot,
      x: Math.max(maxRadius, Math.min(ARENA_WIDTH - maxRadius, robot.x)),
      y: Math.max(maxRadius, Math.min(ARENA_HEIGHT - maxRadius, robot.y)),
    };
  }

  /**
   * Determine whether the robot intersects any supplied obstacle rectangles.
   * Robot geometry is approximated as a rotated rectangle while obstacles are
   * treated as axis-aligned boxes.
   *
   * @param {{x:number,y:number,heading:number}} robot Robot pose to test.
   * @param {Array<{x:number,y:number,width:number,height:number}>} obstacles List of potential collision boxes.
   * @returns {boolean} True if any overlap is detected.
   */
  function checkCollision(robot, obstacles) {
    const robotCorners = getRobotCorners(robot);

    for (const obstacle of obstacles) {
      if (rectanglesOverlap(robotCorners, obstacle)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compute the four world-space corner coordinates of the robot chassis using
   * its current heading. The result feeds collision and rendering routines.
   *
   * @param {{x:number,y:number,heading:number}} robot Current robot pose.
   * @returns {Array<{x:number,y:number}>} Ordered corner list starting at front-left and rotating clockwise.
   */
  function getRobotCorners(robot) {
    const halfWidth = ROBOT_WIDTH / 2;
    const halfLength = ROBOT_LENGTH / 2;
    const headingRad = (robot.heading * Math.PI) / 180;

    const cos = Math.cos(headingRad);
    const sin = Math.sin(headingRad);

    // Local corners (relative to center)
    const localCorners = [
      { x: -halfWidth, y: -halfLength },
      { x: halfWidth, y: -halfLength },
      { x: halfWidth, y: halfLength },
      { x: -halfWidth, y: halfLength },
    ];

    // Transform to world coordinates
    return localCorners.map((c) => ({
      x: robot.x + c.x * cos - c.y * sin,
      y: robot.y + c.x * sin + c.y * cos,
    }));
  }

  /**
   * Test whether the axis-aligned bounding box of a rotated robot overlaps a
   * second, axis-aligned rectangle. Used as a coarse but efficient collision
   * check.
   *
   * @param {Array<{x:number,y:number}>} corners1 Rotated rectangle corners in world space.
   * @param {{x:number,y:number,width:number,height:number}} rect2 Static axis-aligned rectangle to compare against.
   * @returns {boolean} True when bounding boxes intersect.
   */
  function rectanglesOverlap(corners1, rect2) {
    // Get AABB of rotated robot
    const xs = corners1.map((c) => c.x);
    const ys = corners1.map((c) => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Check against obstacle AABB
    const rect2MinX = rect2.x;
    const rect2MaxX = rect2.x + rect2.width;
    const rect2MinY = rect2.y;
    const rect2MaxY = rect2.y + rect2.height;

    return !(
      maxX < rect2MinX ||
      minX > rect2MaxX ||
      maxY < rect2MinY ||
      minY > rect2MaxY
    );
  }

  /**
   * Simulate the front-facing ultrasonic sensor, tracing a ray from the robot
   * nose outwards and returning the closest hit among arena walls, obstacles,
   * and maze segments. Adds small random noise and reports -1 when outside the
   * measurable range.
   *
   * @param {{x:number,y:number,heading:number}} robot Robot pose to sample.
   * @returns {number} Millimetres to the nearest surface or -1 when no valid reading.
   */
  function simulateUltrasonic(robot) {
    const headingRad = (robot.heading * Math.PI) / 180;

    // Sensor position (front center of robot)
    const sensorX = robot.x + Math.sin(headingRad) * (ROBOT_LENGTH / 2);
    const sensorY = robot.y - Math.cos(headingRad) * (ROBOT_LENGTH / 2);

    // Ray direction
    const rayDirX = Math.sin(headingRad);
    const rayDirY = -Math.cos(headingRad);

    // Check distance to walls
    let minDistance = ULTRASONIC_MAX + 1;

    // Top wall (y = 0)
    if (rayDirY < 0) {
      const t = -sensorY / rayDirY;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Bottom wall (y = ARENA_HEIGHT)
    if (rayDirY > 0) {
      const t = (ARENA_HEIGHT - sensorY) / rayDirY;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Left wall (x = 0)
    if (rayDirX < 0) {
      const t = -sensorX / rayDirX;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Right wall (x = ARENA_WIDTH)
    if (rayDirX > 0) {
      const t = (ARENA_WIDTH - sensorX) / rayDirX;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Check distance to obstacles
    for (const obstacle of obstacles) {
      const obstDist = rayBoxIntersection(
        sensorX,
        sensorY,
        rayDirX,
        rayDirY,
        obstacle.x,
        obstacle.y,
        obstacle.width,
        obstacle.height,
      );
      if (obstDist !== null && obstDist < minDistance) {
        minDistance = obstDist;
      }
    }

    // Check distance to maze walls
    for (const wall of mazeWalls) {
      const wallDist = rayBoxIntersection(
        sensorX,
        sensorY,
        rayDirX,
        rayDirY,
        wall.x,
        wall.y,
        wall.width,
        wall.height,
      );
      if (wallDist !== null && wallDist < minDistance) {
        minDistance = wallDist;
      }
    }

    // Apply sensor limits
    if (minDistance < ULTRASONIC_MIN) {
      return -1; // Too close
    }
    if (minDistance > ULTRASONIC_MAX) {
      return -1; // Too far / no reading
    }

    // Add noise (±SENSOR_NOISE mm)
    const noise = (Math.random() - 0.5) * SENSOR_NOISE * 2;
    return Math.round(minDistance + noise);
  }

  /**
   * Simulate the side-facing ultrasonic sensor mounted perpendicular to the
   * robot chassis. The side is determined by the current sideSensorSide
   * setting ("left" or "right"). Uses the same ray-casting logic as the
   * front sensor but fires the ray at 90 degrees relative to the heading.
   *
   * @param {{x:number,y:number,heading:number}} robot Robot pose to sample.
   * @returns {number} Millimetres to the nearest surface or -1 when no valid reading.
   */
  function simulateUltrasonicSide(robot) {
    const headingRad = (robot.heading * Math.PI) / 180;

    // The simulator uses a heading convention where forward is
    //   (sin(heading), -cos(heading)).
    // The perpendicular directions in this system are:
    //   Left  = (-cos(heading), -sin(heading))
    //   Right = ( cos(heading),  sin(heading))
    let rayDirX, rayDirY;
    if (sideSensorSide === "left") {
      rayDirX = -Math.cos(headingRad);
      rayDirY = -Math.sin(headingRad);
    } else {
      rayDirX = Math.cos(headingRad);
      rayDirY = Math.sin(headingRad);
    }

    // Sensor position: centre of the relevant side of the robot body
    const sensorX = robot.x + rayDirX * (ROBOT_WIDTH / 2);
    const sensorY = robot.y + rayDirY * (ROBOT_WIDTH / 2);

    // Check distance to walls
    let minDistance = ULTRASONIC_MAX + 1;

    // Top wall (y = 0)
    if (rayDirY < 0) {
      const t = -sensorY / rayDirY;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Bottom wall (y = ARENA_HEIGHT)
    if (rayDirY > 0) {
      const t = (ARENA_HEIGHT - sensorY) / rayDirY;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Left wall (x = 0)
    if (rayDirX < 0) {
      const t = -sensorX / rayDirX;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Right wall (x = ARENA_WIDTH)
    if (rayDirX > 0) {
      const t = (ARENA_WIDTH - sensorX) / rayDirX;
      if (t > 0 && t < minDistance) {
        minDistance = t;
      }
    }

    // Check distance to obstacles
    for (const obstacle of obstacles) {
      const obstDist = rayBoxIntersection(
        sensorX,
        sensorY,
        rayDirX,
        rayDirY,
        obstacle.x,
        obstacle.y,
        obstacle.width,
        obstacle.height,
      );
      if (obstDist !== null && obstDist < minDistance) {
        minDistance = obstDist;
      }
    }

    // Check distance to maze walls
    for (const wall of mazeWalls) {
      const wallDist = rayBoxIntersection(
        sensorX,
        sensorY,
        rayDirX,
        rayDirY,
        wall.x,
        wall.y,
        wall.width,
        wall.height,
      );
      if (wallDist !== null && wallDist < minDistance) {
        minDistance = wallDist;
      }
    }

    // Apply sensor limits
    if (minDistance < ULTRASONIC_MIN) {
      return -1; // Too close
    }
    if (minDistance > ULTRASONIC_MAX) {
      return -1; // Too far / no reading
    }

    // Add noise (±SENSOR_NOISE mm)
    const noise = (Math.random() - 0.5) * SENSOR_NOISE * 2;
    return Math.round(minDistance + noise);
  }

  /**
   * Set which side the secondary ultrasonic sensor is mounted on.
   * @param {"left"|"right"} side The side to mount the sensor.
   */
  function setSideSensorSide(side) {
    if (side === "left" || side === "right") {
      sideSensorSide = side;
    }
  }

  /**
   * Get the current side sensor placement.
   * @returns {"left"|"right"} Current side sensor side.
   */
  function getSideSensorSide() {
    return sideSensorSide;
  }

  /**
   * Mirror a pose across the vertical centreline of the arena.
   * Used so that switching from `AIDriver("left")` to `AIDriver("right")`
   * mirrors the spawn position without requiring duplicated maze layouts.
   *
   * @param {{x:number,y:number,heading?:number}} pose Pose to mirror.
   * @returns {{x:number,y:number,heading:number}} Mirrored pose.
   */
  function mirrorPose(pose) {
    const heading = pose && typeof pose.heading === "number" ? pose.heading : 0;
    return {
      x: ARENA_WIDTH - pose.x,
      y: pose.y,
      heading: (((360 - heading) % 360) + 360) % 360,
    };
  }

  /**
   * Mirror an axis-aligned rectangle across the vertical centreline of the arena.
   * Used to mirror challenge success zones for right-wall play.
   *
   * @param {{x:number,y:number,width:number,height:number}} rect Rectangle to mirror.
   * @returns {{x:number,y:number,width:number,height:number}} Mirrored rectangle.
   */
  function mirrorRect(rect) {
    return {
      x: ARENA_WIDTH - rect.x - rect.width,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }

  /**
   * Compute the parametric distance from a ray origin to an axis-aligned box.
   * Returns null when the ray misses or faces away from the volume.
   *
   * @param {number} rayX Ray origin X coordinate.
   * @param {number} rayY Ray origin Y coordinate.
   * @param {number} dirX Normalised ray direction X component.
   * @param {number} dirY Normalised ray direction Y component.
   * @param {number} boxX Box minimum X.
   * @param {number} boxY Box minimum Y.
   * @param {number} boxW Box width.
   * @param {number} boxH Box height.
   * @returns {number|null} Parametric distance to first intersection, or null if no hit.
   */
  function rayBoxIntersection(rayX, rayY, dirX, dirY, boxX, boxY, boxW, boxH) {
    let tmin = 0;
    let tmax = Infinity;

    // X slab
    if (Math.abs(dirX) > 0.0001) {
      const t1 = (boxX - rayX) / dirX;
      const t2 = (boxX + boxW - rayX) / dirX;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (rayX < boxX || rayX > boxX + boxW) {
      return null;
    }

    // Y slab
    if (Math.abs(dirY) > 0.0001) {
      const t1 = (boxY - rayY) / dirY;
      const t2 = (boxY + boxH - rayY) / dirY;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (rayY < boxY || rayY > boxY + boxH) {
      return null;
    }

    if (tmin > tmax || tmax < 0) {
      return null;
    }

    return tmin > 0 ? tmin : tmax;
  }

  /**
   * Advance the simulator by one frame, applying kinematics, boundary
   * clamping, collision detection, and trail bookkeeping. Stops the robot when
   * a collision is detected and logs the event to the debug panel.
   *
   * @param {{isMoving:boolean,leftSpeed:number,rightSpeed:number,trail:Array<object>}} robot Current robot state snapshot.
   * @param {number} dt Delta time in seconds since the previous frame.
   * @returns {object} New robot state with updated pose, speeds, and trail samples.
   */
  function step(robot, dt) {
    // Skip if truly stationary: no commanded motion AND no residual velocity.
    if (
      !robot.isMoving &&
      robot.leftSpeed === 0 &&
      robot.rightSpeed === 0 &&
      (robot.actualLeftV || 0) === 0 &&
      (robot.actualRightV || 0) === 0
    ) {
      return robot;
    }

    // --- Substep so fast motion cannot tunnel through walls. -----------
    // Use *actual* wheel velocity (post-ramp) for the travel estimate,
    // not the commanded PWM which may be much higher than reality.
    const avgActualV =
      (Math.abs(robot.actualLeftV || 0) + Math.abs(robot.actualRightV || 0)) /
      2;
    const frameTravelMm = avgActualV * dt;
    const SUBSTEP_MAX_MM = 5;
    const substeps = Math.max(1, Math.ceil(frameTravelMm / SUBSTEP_MAX_MM));
    const subDt = dt / substeps;

    let current = robot;
    const allObstacles = obstacles.concat(mazeWalls);

    for (let i = 0; i < substeps; i++) {
      let candidate = updateKinematics(current, subDt);
      candidate = applyBoundaryConstraints(candidate);

      if (checkCollision(candidate, allObstacles)) {
        // Reject the move: keep the previous good pose, zero motion,
        // bump the collision counter and flash the chassis briefly.
        const newCount = (current.collisionCount || 0) + 1;
        if (typeof DebugPanel !== "undefined") {
          DebugPanel.error(
            `Wall hit at (${Math.round(current.x)}, ${Math.round(current.y)}) — collision #${newCount}`,
          );
        }
        const blockedTrail = [
          ...(robot.trail || []),
          { x: current.x, y: current.y },
        ];
        return {
          ...current,
          leftSpeed: 0,
          rightSpeed: 0,
          actualLeftV: 0,
          actualRightV: 0,
          isMoving: false,
          collisionCount: newCount,
          collisionFlashUntil: Date.now() + 200,
          trail:
            blockedTrail.length > 1000
              ? blockedTrail.slice(-1000)
              : blockedTrail,
        };
      }
      current = candidate;
    }

    // No collision in any substep — accept the move.
    const newTrail = [...(robot.trail || []), { x: current.x, y: current.y }];
    return {
      ...current,
      collisionCount: robot.collisionCount || 0,
      collisionFlashUntil: robot.collisionFlashUntil || 0,
      trail: newTrail.length > 1000 ? newTrail.slice(-1000) : newTrail,
    };
  }

  /**
   * Set the global simulation speed multiplier, constraining values to a safe
   * range so physics remain stable.
   *
   * @param {number} speed Desired speed factor where 1.0 represents real time.
   */
  function setSpeed(speed) {
    simulationSpeed = Math.max(0.1, Math.min(5.0, speed));
  }

  /**
   * Replace the current obstacle list used for collision detection.
   *
   * @param {Array<{x:number,y:number,width:number,height:number}>} obstacleList Obstacles to track; falsy values clear the list.
   */
  function setObstacles(obstacleList) {
    obstacles = obstacleList || [];
  }

  /**
   * Replace the maze wall collection, typically supplied by challenge data.
   *
   * @param {Array<{x:number,y:number,width:number,height:number}>} walls Walls to enable; falsy values clear the wall list.
   */
  function setMazeWalls(walls) {
    mazeWalls = walls || [];
  }

  /**
   * Remove every obstacle and maze wall, restoring an empty arena.
   */
  function clearObstacles() {
    obstacles = [];
    mazeWalls = [];
  }

  /**
   * Generate the canonical starting robot state positioned near the arena
   * bottom, facing upward, with no motion or trail history.
   *
   * @returns {{x:number,y:number,heading:number,leftSpeed:number,rightSpeed:number,isMoving:boolean,trail:Array<object>}} Default robot state snapshot.
   */
  function getInitialRobotState() {
    return {
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT - 200, // Near bottom
      heading: 0, // Facing up
      leftSpeed: 0,
      rightSpeed: 0,
      actualLeftV: 0, // current real wheel velocity (mm/s)
      actualRightV: 0, // current real wheel velocity (mm/s)
      isMoving: false,
      trail: [],
    };
  }

  // Public API
  return {
    // Constants
    ARENA_WIDTH,
    ARENA_HEIGHT,
    ROBOT_WIDTH,
    ROBOT_LENGTH,
    ULTRASONIC_MIN,
    ULTRASONIC_MAX,

    // Methods
    step,
    simulateUltrasonic,
    simulateUltrasonicSide,
    checkCollision,
    getRobotCorners,
    setSpeed,
    setObstacles,
    setMazeWalls,
    clearObstacles,
    getInitialRobotState,
    applyBoundaryConstraints,
    setSideSensorSide,
    getSideSensorSide,
    mirrorPose,
    mirrorRect,
  };
})();
