/**
 * AIDriver Simulator — Physics and Robot Simulation Module
 *
 * Rewritten from scratch around the real-world measurements in RobotConfig.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  PHYSICS MODEL                                                  │
 * │                                                                 │
 * │  PWM → wheel velocity                                           │
 * │    |pwm| ≤ deadZonePWM  →  0 m/s  (motor stalls)               │
 * │    |pwm| > deadZonePWM  →  linear map to 0 … topSpeed_ms       │
 * │    velocity = ((|pwm| − dead) / (max − dead)) × topSpeed       │
 * │    sign preserved: negative pwm → negative velocity (reverse)   │
 * │                                                                 │
 * │  Acceleration / deceleration ramp                                │
 * │    Each wheel velocity ramps at acceleration_ms2 (speeding up)  │
 * │    or deceleration_ms2 (slowing down).                          │
 * │                                                                 │
 * │  Differential-drive kinematics                                   │
 * │    v = (vL + vR) / 2                                            │
 * │    ω = (vR − vL) / wheelBase           (rad/s)                  │
 * │                                                                 │
 * │  Heading convention (screen space)                               │
 * │    heading 0° = up (−Y on screen)                               │
 * │    heading 90° = right (+X on screen)                           │
 * │    forward direction:                                            │
 * │      dx =  sin(heading)                                         │
 * │      dy = −cos(heading)                                         │
 * │                                                                 │
 * │  Position integration                                            │
 * │    Straight (|ω| < ε):                                          │
 * │      x += v · sin(θ) · dt                                      │
 * │      y += v · (−cos(θ)) · dt                                   │
 * │    Arc (|ω| ≥ ε):                                               │
 * │      R = v / ω    (instantaneous turning radius)                │
 * │      θ₁ = θ₀ + ω·dt                                            │
 * │      x += R · (cos(θ₀) − cos(θ₁))                              │
 * │      y −= R · (sin(θ₁) − sin(θ₀))                              │
 * │                                                                 │
 * │  Turn convention                                                 │
 * │    vR > vL  →  ω > 0  →  heading increases  →  turns RIGHT     │
 * │    vL > vR  →  ω < 0  →  heading decreases  →  turns LEFT      │
 * └─────────────────────────────────────────────────────────────────┘
 */

const Simulator = (function () {
  "use strict";

  // ── Real-world constants from RobotConfig ──────────────────────
  const cfg = typeof RobotConfig !== "undefined" ? RobotConfig : {};

  const WHEEL_BASE_MM = cfg.wheelBase_mm || 120;
  const MAX_PWM = cfg.maxPWM || 255;
  const DEAD_ZONE_PWM = cfg.deadZonePWM || 64;
  const TOP_SPEED_MMS = (cfg.topSpeed_ms || 0.65) * 1000; // mm/s
  const ACCEL_MMS2 = (cfg.acceleration_ms2 || 1.75) * 1000; // mm/s²
  const DECEL_MMS2 = (cfg.deceleration_ms2 || 1.75) * 1000; // mm/s²

  const ARENA_WIDTH = cfg.arenaWidth_mm || 2000;
  const ARENA_HEIGHT = cfg.arenaHeight_mm || 2000;
  const ROBOT_WIDTH = cfg.robotWidth_mm || 120;
  const ROBOT_LENGTH = cfg.robotLength_mm || 150;

  const ULTRASONIC_MIN = cfg.ultrasonicMin_mm || 20;
  const ULTRASONIC_MAX = cfg.ultrasonicMax_mm || 2000;
  const SENSOR_NOISE = cfg.sensorNoise_mm || 2;

  // Derived
  const LIVE_RANGE = MAX_PWM - DEAD_ZONE_PWM; // 191

  // ── Mutable state ──────────────────────────────────────────────
  let sideSensorSide = "left";
  let simulationSpeed = 1.0;
  let obstacles = [];
  let mazeWalls = [];

  // ═══════════════════════════════════════════════════════════════
  //  PWM → VELOCITY
  // ═══════════════════════════════════════════════════════════════

  /**
   * Convert a PWM command (−255…+255) to a target wheel velocity in mm/s.
   *
   *   |pwm| ≤ DEAD_ZONE_PWM  →  0
   *   |pwm| > DEAD_ZONE_PWM  →  linear map [dead+1 … MAX_PWM] → (0 … TOP_SPEED]
   *
   * Sign is preserved so negative PWM yields negative velocity (reverse).
   */
  function pwmToVelocity(pwm) {
    const abs = Math.abs(pwm);
    if (abs <= DEAD_ZONE_PWM) return 0;
    const clamped = Math.min(abs, MAX_PWM);
    const v = ((clamped - DEAD_ZONE_PWM) / LIVE_RANGE) * TOP_SPEED_MMS;
    return pwm >= 0 ? v : -v;
  }

  // ═══════════════════════════════════════════════════════════════
  //  VELOCITY RAMPING  (motor inertia)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Ramp `current` towards `target` respecting accel/decel limits.
   *
   *   Accelerating: |target| > |current|  →  use ACCEL rate
   *   Decelerating: |target| < |current|  →  use DECEL rate
   *
   * maxDelta = rate × dt   (mm/s per frame)
   * If the remaining gap ≤ maxDelta, snap to target (no overshoot).
   */
  function rampVelocity(current, target, dt) {
    const diff = target - current;
    if (diff === 0) return target;
    const rate =
      Math.abs(target) >= Math.abs(current) ? ACCEL_MMS2 : DECEL_MMS2;
    const maxDelta = rate * dt;
    if (Math.abs(diff) <= maxDelta) return target;
    return current + Math.sign(diff) * maxDelta;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DIFFERENTIAL-DRIVE KINEMATICS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Integrate one timestep of differential-drive motion.
   *
   * @param {object} robot  Must contain: x, y, heading (degrees),
   *                        leftSpeed, rightSpeed (commanded PWM),
   *                        actualLeftV, actualRightV (current mm/s).
   * @param {number} dt     Seconds since previous update.
   * @returns {object}      New state (x, y, heading, actualLeftV, actualRightV).
   */
  function updateKinematics(robot, dt) {
    // 1. Target velocities from commanded PWM
    const leftTargetV = pwmToVelocity(robot.leftSpeed) * simulationSpeed;
    const rightTargetV = pwmToVelocity(robot.rightSpeed) * simulationSpeed;

    // 2. Ramp actual velocities (motor inertia)
    const scaledDt = dt * simulationSpeed;
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

    // 3. Differential-drive equations
    //    v = (vL + vR) / 2
    //    ω = (vR − vL) / wheelBase
    const v = (actualLeftV + actualRightV) / 2;
    const omega = (actualRightV - actualLeftV) / WHEEL_BASE_MM;

    const theta = (robot.heading * Math.PI) / 180;

    let newX, newY, newTheta;

    if (Math.abs(omega) < 1e-6) {
      // Straight-line motion
      newX = robot.x + v * Math.sin(theta) * dt;
      newY = robot.y - v * Math.cos(theta) * dt;
      newTheta = theta;
    } else {
      // Arc motion
      const R = v / omega;
      newTheta = theta + omega * dt;
      newX = robot.x + R * (Math.cos(theta) - Math.cos(newTheta));
      newY = robot.y - R * (Math.sin(newTheta) - Math.sin(theta));
    }

    // Normalise heading to [0, 360)
    let newHeading = ((newTheta * 180) / Math.PI) % 360;
    if (newHeading < 0) newHeading += 360;

    return {
      ...robot,
      x: newX,
      y: newY,
      heading: newHeading,
      actualLeftV,
      actualRightV,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  BOUNDARY CONSTRAINTS
  // ═══════════════════════════════════════════════════════════════

  function applyBoundaryConstraints(robot) {
    const halfW = ROBOT_WIDTH / 2;
    const halfL = ROBOT_LENGTH / 2;
    const margin = Math.max(halfW, halfL);
    return {
      ...robot,
      x: Math.max(margin, Math.min(ARENA_WIDTH - margin, robot.x)),
      y: Math.max(margin, Math.min(ARENA_HEIGHT - margin, robot.y)),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  COLLISION DETECTION
  // ═══════════════════════════════════════════════════════════════

  function getRobotCorners(robot) {
    const halfW = ROBOT_WIDTH / 2;
    const halfL = ROBOT_LENGTH / 2;
    const rad = (robot.heading * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const local = [
      { x: -halfW, y: -halfL },
      { x: halfW, y: -halfL },
      { x: halfW, y: halfL },
      { x: -halfW, y: halfL },
    ];

    return local.map((c) => ({
      x: robot.x + c.x * cos - c.y * sin,
      y: robot.y + c.x * sin + c.y * cos,
    }));
  }

  function rectanglesOverlap(corners, rect) {
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return !(
      maxX < rect.x ||
      minX > rect.x + rect.width ||
      maxY < rect.y ||
      minY > rect.y + rect.height
    );
  }

  function checkCollision(robot, obstacleList) {
    const corners = getRobotCorners(robot);
    for (const o of obstacleList) {
      if (rectanglesOverlap(corners, o)) return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  //  RAY CASTING  (ultrasonic sensors)
  // ═══════════════════════════════════════════════════════════════

  function rayBoxIntersection(rayX, rayY, dirX, dirY, bx, by, bw, bh) {
    let tmin = 0;
    let tmax = Infinity;

    if (Math.abs(dirX) > 1e-8) {
      const t1 = (bx - rayX) / dirX;
      const t2 = (bx + bw - rayX) / dirX;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (rayX < bx || rayX > bx + bw) {
      return null;
    }

    if (Math.abs(dirY) > 1e-8) {
      const t1 = (by - rayY) / dirY;
      const t2 = (by + bh - rayY) / dirY;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    } else if (rayY < by || rayY > by + bh) {
      return null;
    }

    if (tmin > tmax || tmax < 0) return null;
    return tmin > 0 ? tmin : tmax;
  }

  function castRay(sensorX, sensorY, dirX, dirY) {
    let minDist = ULTRASONIC_MAX + 1;

    // Arena walls
    if (dirY < 0) {
      const t = -sensorY / dirY;
      if (t > 0 && t < minDist) minDist = t;
    }
    if (dirY > 0) {
      const t = (ARENA_HEIGHT - sensorY) / dirY;
      if (t > 0 && t < minDist) minDist = t;
    }
    if (dirX < 0) {
      const t = -sensorX / dirX;
      if (t > 0 && t < minDist) minDist = t;
    }
    if (dirX > 0) {
      const t = (ARENA_WIDTH - sensorX) / dirX;
      if (t > 0 && t < minDist) minDist = t;
    }

    // Obstacles + maze walls
    const all = obstacles.concat(mazeWalls);
    for (const box of all) {
      const d = rayBoxIntersection(
        sensorX,
        sensorY,
        dirX,
        dirY,
        box.x,
        box.y,
        box.width,
        box.height,
      );
      if (d !== null && d < minDist) minDist = d;
    }

    return minDist;
  }

  function applyUltrasonicLimits(distance) {
    if (distance < ULTRASONIC_MIN || distance > ULTRASONIC_MAX) return -1;
    const noise = (Math.random() - 0.5) * SENSOR_NOISE * 2;
    return Math.round(distance + noise);
  }

  function simulateUltrasonic(robot) {
    const rad = (robot.heading * Math.PI) / 180;
    const sensorX = robot.x + Math.sin(rad) * (ROBOT_LENGTH / 2);
    const sensorY = robot.y - Math.cos(rad) * (ROBOT_LENGTH / 2);
    const dirX = Math.sin(rad);
    const dirY = -Math.cos(rad);
    return applyUltrasonicLimits(castRay(sensorX, sensorY, dirX, dirY));
  }

  function simulateUltrasonicSide(robot) {
    const rad = (robot.heading * Math.PI) / 180;

    let dirX, dirY;
    if (sideSensorSide === "left") {
      dirX = -Math.cos(rad);
      dirY = -Math.sin(rad);
    } else {
      dirX = Math.cos(rad);
      dirY = Math.sin(rad);
    }

    const sensorX = robot.x + dirX * (ROBOT_WIDTH / 2);
    const sensorY = robot.y + dirY * (ROBOT_WIDTH / 2);

    return applyUltrasonicLimits(castRay(sensorX, sensorY, dirX, dirY));
  }

  // ═══════════════════════════════════════════════════════════════
  //  SIDE SENSOR ACCESSORS
  // ═══════════════════════════════════════════════════════════════

  function setSideSensorSide(side) {
    if (side === "left" || side === "right") sideSensorSide = side;
  }

  function getSideSensorSide() {
    return sideSensorSide;
  }

  // ═══════════════════════════════════════════════════════════════
  //  MIRROR HELPERS  (left ↔ right wall play)
  // ═══════════════════════════════════════════════════════════════

  function mirrorPose(pose) {
    const h = pose && typeof pose.heading === "number" ? pose.heading : 0;
    return {
      x: ARENA_WIDTH - pose.x,
      y: pose.y,
      heading: (((360 - h) % 360) + 360) % 360,
    };
  }

  function mirrorRect(rect) {
    return {
      x: ARENA_WIDTH - rect.x - rect.width,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  STEP  (main simulation tick)
  // ═══════════════════════════════════════════════════════════════

  function step(robot, dt) {
    // Skip truly stationary robots
    if (
      !robot.isMoving &&
      robot.leftSpeed === 0 &&
      robot.rightSpeed === 0 &&
      (robot.actualLeftV || 0) === 0 &&
      (robot.actualRightV || 0) === 0
    ) {
      return robot;
    }

    // Sub-step to prevent tunnelling through walls
    const avgV =
      (Math.abs(robot.actualLeftV || 0) + Math.abs(robot.actualRightV || 0)) /
      2;
    const travelMM = avgV * dt;
    const SUBSTEP_MAX = 5; // mm per substep
    const substeps = Math.max(1, Math.ceil(travelMM / SUBSTEP_MAX));
    const subDt = dt / substeps;

    let current = robot;
    const allWalls = obstacles.concat(mazeWalls);

    for (let i = 0; i < substeps; i++) {
      let candidate = updateKinematics(current, subDt);
      candidate = applyBoundaryConstraints(candidate);

      if (checkCollision(candidate, allWalls)) {
        const count = (current.collisionCount || 0) + 1;
        if (typeof DebugPanel !== "undefined") {
          DebugPanel.error(
            `Wall hit at (${Math.round(current.x)}, ${Math.round(current.y)}) — collision #${count}`,
          );
        }
        const trail = [...(robot.trail || []), { x: current.x, y: current.y }];
        return {
          ...current,
          leftSpeed: 0,
          rightSpeed: 0,
          actualLeftV: 0,
          actualRightV: 0,
          isMoving: false,
          collisionCount: count,
          collisionFlashUntil: Date.now() + 200,
          trail: trail.length > 1000 ? trail.slice(-1000) : trail,
        };
      }
      current = candidate;
    }

    const trail = [...(robot.trail || []), { x: current.x, y: current.y }];
    return {
      ...current,
      collisionCount: robot.collisionCount || 0,
      collisionFlashUntil: robot.collisionFlashUntil || 0,
      trail: trail.length > 1000 ? trail.slice(-1000) : trail,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  function setSpeed(speed) {
    simulationSpeed = Math.max(0.1, Math.min(5.0, speed));
  }

  function setObstacles(list) {
    obstacles = list || [];
  }
  function setMazeWalls(walls) {
    mazeWalls = walls || [];
  }
  function clearObstacles() {
    obstacles = [];
    mazeWalls = [];
  }

  function getInitialRobotState() {
    return {
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT - 200,
      heading: 0,
      leftSpeed: 0,
      rightSpeed: 0,
      actualLeftV: 0,
      actualRightV: 0,
      isMoving: false,
      trail: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

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
