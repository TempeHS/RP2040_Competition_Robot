/* global RobotConfig */
/**
 * Simulator — Rear-Wheel-Drive Differential Drive Robot
 *
 * Two independently driven wheels at the REAR of the robot body.
 * The pivot point (ICR) lies on the rear-axle line.  When turning
 * the front of the robot swings outward — exactly like the real
 * RP2040 competition robot.
 *
 * Coordinate system (screen-space):
 *   x  →  rightward       y  →  downward
 *   heading 0°  =  facing UP (−Y direction)
 *   heading increases clockwise
 *
 * robot.x, robot.y  =  geometric CENTRE of the 200 × 120 mm body.
 * The rear axle is 65 mm behind the centre along the heading axis.
 *
 * Kinematic update every frame:
 *   1. Derive rear-axle position from centre + heading
 *   2. Apply diff-drive equations at the rear axle
 *   3. Derive new centre from updated rear axle + new heading
 *
 * ω = (vL − vR) / wheelTrack   →  positive = clockwise (screen-space)
 *
 * Left wheel faster  → ω > 0 → turns RIGHT   ✓
 * Right wheel faster → ω < 0 → turns LEFT    ✓
 */
const Simulator = (function () {
  "use strict";

  // ═══════════════════════════════════════════════════════════════════
  //  Constants — every value derived from RobotConfig, zero magic
  // ═══════════════════════════════════════════════════════════════════
  var WHEEL_TRACK = RobotConfig.wheelTrack_mm; // 100 mm (left↔right)
  var ROBOT_WIDTH = RobotConfig.robotWidth_mm; // 120 mm
  var ROBOT_LENGTH = RobotConfig.robotLength_mm; // 200 mm
  var MAX_PWM = RobotConfig.maxPWM; // 255
  var DEAD_ZONE = RobotConfig.deadZonePWM; // 64
  var TOP_SPEED = RobotConfig.topSpeed_ms * 1000; // 650 mm/s
  var ACCEL = RobotConfig.acceleration_ms2 * 1000; // 1750 mm/s²
  var DECEL = RobotConfig.deceleration_ms2 * 1000; // 1750 mm/s²
  var ULTRASONIC_MIN = RobotConfig.ultrasonicMin_mm; // 20 mm
  var ULTRASONIC_MAX = RobotConfig.ultrasonicMax_mm; // 2000 mm
  var SENSOR_NOISE = RobotConfig.sensorNoise_mm; // ±2 mm
  var ARENA_WIDTH = RobotConfig.arenaWidth_mm; // 2000 mm
  var ARENA_HEIGHT = RobotConfig.arenaHeight_mm; // 2000 mm

  var DEG2RAD = Math.PI / 180;
  var RAD2DEG = 180 / Math.PI;

  var ACTIVE_PWM = MAX_PWM - DEAD_ZONE; // 191 usable steps
  var REAR_OFFSET = RobotConfig.rearAxleOffset_mm; // 65 mm centre → rear axle
  var FRONT_SENSOR_OFFSET = RobotConfig.frontSensorOffset_mm; // 90 mm ahead of centre
  var SIDE_SENSOR_OFFSET = RobotConfig.sideSensorOffset_mm; // 65 mm from centre

  // ═══════════════════════════════════════════════════════════════════
  //  Mutable state
  // ═══════════════════════════════════════════════════════════════════
  var mazeWalls = [];
  var obstacles = [];
  var sideSensorSide = "left";
  var simulationSpeed = 1;
  // Ground colour markers (Challenge 8). Each: {x,y,width,height,color,rgb:[r,g,b,c]}.
  var colorZones = [];
  // Reading returned when the sensor is over plain (dark) floor.
  var COLOR_FLOOR = [40, 40, 40, 120];

  // ═══════════════════════════════════════════════════════════════════
  //  PWM → velocity   (mm / s)
  //
  //  PWM 0 … DEAD_ZONE  → 0 mm/s   (motor stalls)
  //  PWM DEAD_ZONE+1 … MAX_PWM → linear to TOP_SPEED
  //  Negative PWM → negative velocity (reverse)
  // ═══════════════════════════════════════════════════════════════════
  function pwmToVelocity(pwm) {
    if (pwm === 0) return 0;
    var sign = pwm > 0 ? 1 : -1;
    var abs = Math.abs(pwm);
    if (abs <= DEAD_ZONE) return 0;
    return sign * ((abs - DEAD_ZONE) / ACTIVE_PWM) * TOP_SPEED;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Velocity ramping — motor inertia
  //
  //  Accelerates at ACCEL when |target| ≥ |current|,
  //  decelerates at DECEL otherwise.
  // ═══════════════════════════════════════════════════════════════════
  function rampVelocity(current, target, dt) {
    var diff = target - current;
    if (Math.abs(diff) < 0.01) return target;
    var rate = Math.abs(target) >= Math.abs(current) ? ACCEL : DECEL;
    var maxDv = rate * dt;
    if (Math.abs(diff) <= maxDv) return target;
    return current + (diff > 0 ? maxDv : -maxDv);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Core kinematics — REAR-WHEEL-DRIVE differential drive
  //
  //  The two drive wheels sit on the rear axle, 65 mm behind the
  //  body centre.  All translational motion is computed at the rear
  //  axle, then the body centre is derived from the new rear-axle
  //  position and the new heading.
  //
  //  Straight line  (|ω| < ε):
  //      rearX += v · sin(θ) · dt
  //      rearY -= v · cos(θ) · dt
  //
  //  Arc  (exact closed-form integration):
  //      θ′ = θ + ω · dt
  //      rearX += (v/ω) · [ cos(θ) − cos(θ′) ]
  //      rearY += (v/ω) · [ sin(θ) − sin(θ′) ]
  //
  //  Centre reconstruction:
  //      centreX = rearX + REAR_OFFSET · sin(θ′)
  //      centreY = rearY − REAR_OFFSET · cos(θ′)
  // ═══════════════════════════════════════════════════════════════════
  function updateKinematics(robot, dt) {
    var sDt = dt * simulationSpeed;

    // Target wheel velocities from PWM
    var tgtL = pwmToVelocity(robot.leftSpeed);
    var tgtR = pwmToVelocity(robot.rightSpeed);

    // Ramp actual velocities toward targets (motor inertia)
    var actL = rampVelocity(robot.actualLeftV || 0, tgtL, sDt);
    var actR = rampVelocity(robot.actualRightV || 0, tgtR, sDt);

    // Diff-drive at rear axle
    var v = (actL + actR) / 2; // rear-axle linear velocity (mm/s)
    var omega = (actL - actR) / WHEEL_TRACK; // angular velocity  (rad/s, +cw)

    var theta = robot.heading * DEG2RAD;
    var sinT = Math.sin(theta);
    var cosT = Math.cos(theta);

    // Rear axle is REAR_OFFSET behind centre along heading
    //   forward vector = (sin θ, −cos θ)
    //   backward        = (−sin θ, cos θ)
    var rX = robot.x - REAR_OFFSET * sinT;
    var rY = robot.y + REAR_OFFSET * cosT;

    var thetaN; // new heading (rad)

    if (Math.abs(omega) < 1e-6) {
      // ── Straight line ──
      rX += v * sinT * sDt;
      rY -= v * cosT * sDt;
      thetaN = theta;
    } else {
      // ── Arc — exact integration ──
      thetaN = theta + omega * sDt;
      rX += (v / omega) * (cosT - Math.cos(thetaN));
      rY += (v / omega) * (sinT - Math.sin(thetaN));
    }

    // Reconstruct body centre from new rear-axle position
    var sinN = Math.sin(thetaN);
    var cosN = Math.cos(thetaN);

    return {
      x: rX + REAR_OFFSET * sinN,
      y: rY - REAR_OFFSET * cosN,
      heading: thetaN * RAD2DEG,
      leftSpeed: robot.leftSpeed,
      rightSpeed: robot.rightSpeed,
      actualLeftV: actL,
      actualRightV: actR,
      isMoving: robot.isMoving,
      trail: robot.trail,
      collisionCount: robot.collisionCount || 0,
      collisionFlashUntil: robot.collisionFlashUntil || 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  step  =  kinematics  →  boundary clamp  →  collision check
  //
  //  Substeps the frame so the robot never moves further than
  //  SAFE_SUBSTEP_MM per integration tick. This avoids "tunneling" —
  //  the robot jumping clean through a thin wall in a single frame
  //  because all four body corners happen to land outside the wall
  //  rectangle even though the swept body passed through it.
  // ═══════════════════════════════════════════════════════════════════
  var SAFE_SUBSTEP_MM = 10;

  function step(robot, dt) {
    // Truly idle — nothing to compute
    if (
      !robot.isMoving &&
      robot.leftSpeed === 0 &&
      robot.rightSpeed === 0 &&
      (robot.actualLeftV || 0) === 0 &&
      (robot.actualRightV || 0) === 0
    ) {
      return robot;
    }

    // Decide how many physics substeps to take based on the fastest
    // wheel velocity in play (target PWM or current ramped velocity).
    var topV = Math.max(
      Math.abs(pwmToVelocity(robot.leftSpeed)),
      Math.abs(pwmToVelocity(robot.rightSpeed)),
      Math.abs(robot.actualLeftV || 0),
      Math.abs(robot.actualRightV || 0),
    );
    var simDt = dt * simulationSpeed;
    var nSubsteps = Math.max(1, Math.ceil((topV * simDt) / SAFE_SUBSTEP_MM));
    var subDt = dt / nSubsteps;

    var r = robot;
    // If we entered the frame already overlapping a wall (e.g. resting
    // in contact from the previous step), let the user drive out
    // unconditionally — otherwise every substep would re-detect the
    // existing overlap, revert, and the car would appear stuck.
    var alreadyColliding = isColliding(r);

    for (var i = 0; i < nSubsteps; i++) {
      var prevX = r.x;
      var prevY = r.y;
      var prevH = r.heading;
      var prevCC = r.collisionCount || 0;

      var next = updateKinematics(r, subDt);
      next = applyBoundaryConstraints(next);

      if (!isColliding(next)) {
        r = next;
        continue;
      }

      // A collision is happening this substep — always flag it.
      var bumpedCC = prevCC + 1;
      var bumpedFlash = Date.now() + 300;

      if (alreadyColliding) {
        // Robot was already overlapping when the frame started — trust
        // the requested motion so the user can drive out of contact.
        next.collisionCount = bumpedCC;
        next.collisionFlashUntil = bumpedFlash;
        r = next;
        continue;
      }

      // Try wall-sliding, but only for *grazing* contacts. A translation
      // slide is allowed only when the motion is mostly along that axis
      // — the dominant component must be more than twice the other.
      // This means a head-on or 45° approach gets blocked (the car
      // stops), while brushing a wall while travelling roughly parallel
      // to it still slides smoothly. Rotation-only is always tried last
      // since it can't tunnel through a wall in a single substep.
      var dx = next.x - prevX;
      var dy = next.y - prevY;
      var SLIDE_RATIO = 2;
      var allowSlideX = Math.abs(dx) > SLIDE_RATIO * Math.abs(dy);
      var allowSlideY = Math.abs(dy) > SLIDE_RATIO * Math.abs(dx);

      var slideCandidates = [];
      if (allowSlideX) {
        slideCandidates.push({ ...next, y: prevY, heading: prevH });
      }
      if (allowSlideY) {
        slideCandidates.push({ ...next, x: prevX, heading: prevH });
      }
      slideCandidates.push({ ...next, x: prevX, y: prevY }); // rotation-only

      var accepted = null;
      for (var s = 0; s < slideCandidates.length; s++) {
        if (!isColliding(slideCandidates[s])) {
          accepted = slideCandidates[s];
          break;
        }
      }
      if (accepted) {
        accepted.collisionCount = bumpedCC;
        accepted.collisionFlashUntil = bumpedFlash;
        r = accepted;
        continue;
      }

      // Truly blocked on every axis — revert pose and stop the frame.
      next.x = prevX;
      next.y = prevY;
      next.heading = prevH;
      next.collisionCount = bumpedCC;
      next.collisionFlashUntil = bumpedFlash;
      r = next;
      break;
    }
    return r;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Ray casting  (direction vectors are unit-length)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Ray vs axis-aligned rectangle.
   * @returns {number}  entry distance ≥ 0, or −1 if no hit.
   */
  function rayRect(ox, oy, dx, dy, rx, ry, rw, rh) {
    var tmin = 0;
    var tmax = 1e12;

    // X slab
    if (Math.abs(dx) > 1e-12) {
      var t1 = (rx - ox) / dx;
      var t2 = (rx + rw - ox) / dx;
      if (t1 > t2) {
        var tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    } else if (ox < rx || ox > rx + rw) {
      return -1;
    }

    // Y slab
    if (Math.abs(dy) > 1e-12) {
      var t1y = (ry - oy) / dy;
      var t2y = (ry + rh - oy) / dy;
      if (t1y > t2y) {
        var tmpy = t1y;
        t1y = t2y;
        t2y = tmpy;
      }
      tmin = Math.max(tmin, t1y);
      tmax = Math.min(tmax, t2y);
      if (tmin > tmax) return -1;
    } else if (oy < ry || oy > ry + rh) {
      return -1;
    }

    if (tmin > 0) return tmin;
    if (tmax > 0) return tmax;
    return -1;
  }

  /**
   * Cast a ray from (ox, oy) in unit direction (dx, dy).
   * @returns {number}  distance in mm to nearest surface, or −1.
   */
  function castRay(ox, oy, dx, dy) {
    var best = Infinity;

    // ── Arena boundary edges ──
    if (dx < 0 && ox > 0) {
      var tL = -ox / dx;
      var iyL = oy + tL * dy;
      if (tL > 0.01 && iyL >= 0 && iyL <= ARENA_HEIGHT && tL < best) best = tL;
    }
    if (dx > 0 && ox < ARENA_WIDTH) {
      var tR = (ARENA_WIDTH - ox) / dx;
      var iyR = oy + tR * dy;
      if (tR > 0.01 && iyR >= 0 && iyR <= ARENA_HEIGHT && tR < best) best = tR;
    }
    if (dy < 0 && oy > 0) {
      var tU = -oy / dy;
      var ixU = ox + tU * dx;
      if (tU > 0.01 && ixU >= 0 && ixU <= ARENA_WIDTH && tU < best) best = tU;
    }
    if (dy > 0 && oy < ARENA_HEIGHT) {
      var tD = (ARENA_HEIGHT - oy) / dy;
      var ixD = ox + tD * dx;
      if (tD > 0.01 && ixD >= 0 && ixD <= ARENA_WIDTH && tD < best) best = tD;
    }

    // ── Maze walls + obstacles ──
    var allWalls = mazeWalls.concat(obstacles);
    for (var i = 0; i < allWalls.length; i++) {
      var w = allWalls[i];
      var tw = rayRect(ox, oy, dx, dy, w.x, w.y, w.width, w.height);
      if (tw > 0.01 && tw < best) best = tw;
    }

    return best === Infinity ? -1 : best;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Ultrasonic sensors
  // ═══════════════════════════════════════════════════════════════════

  function applyUltrasonicLimits(dist) {
    if (dist < 0) return -1;
    if (dist < ULTRASONIC_MIN || dist > ULTRASONIC_MAX) return -1;
    var noise = (Math.random() - 0.5) * 2 * SENSOR_NOISE;
    return Math.round(dist + noise);
  }

  /**
   * Front sensor — 90 mm ahead of body centre, pointing forward along
   * the heading axis.
   */
  function simulateUltrasonic(robot) {
    var theta = robot.heading * DEG2RAD;
    var dx = Math.sin(theta);
    var dy = -Math.cos(theta);
    var sx = robot.x + dx * FRONT_SENSOR_OFFSET;
    var sy = robot.y + dy * FRONT_SENSOR_OFFSET;
    return applyUltrasonicLimits(castRay(sx, sy, dx, dy));
  }

  /**
   * Side sensor — 65 mm from body centre, pointing perpendicular to
   * heading.
   *
   * Left  direction at heading θ:  (−cos θ, −sin θ)
   * Right direction at heading θ:  ( cos θ,  sin θ)
   */
  function simulateUltrasonicSide(robot) {
    var theta = robot.heading * DEG2RAD;
    var dx, dy;
    if (sideSensorSide === "left") {
      dx = -Math.cos(theta);
      dy = -Math.sin(theta);
    } else {
      dx = Math.cos(theta);
      dy = Math.sin(theta);
    }
    var sx = robot.x + dx * SIDE_SENSOR_OFFSET;
    var sy = robot.y + dy * SIDE_SENSOR_OFFSET;
    return applyUltrasonicLimits(castRay(sx, sy, dx, dy));
  }

  /**
   * Simulated LSM6DS3 gyroscope — yaw rate about the vertical (Z) axis.
   *
   * Returns the instantaneous angular velocity of the chassis in degrees per
   * second, derived from the SAME differential-drive kinematics that move the
   * robot (so an integrated gyro turn matches the rendered rotation exactly).
   *
   * Sign convention matches the heading: clockwise (heading increasing) is
   * positive, which is what a real LSM6DS3 mounted face-up reports for a
   * right/clockwise turn.
   *
   * @param {object} robot Robot state with actual wheel velocities.
   * @returns {number} Yaw rate in deg/s.
   */
  function simulateGyroZ(robot) {
    var actL = robot.actualLeftV || 0;
    var actR = robot.actualRightV || 0;
    var omega = (actL - actR) / WHEEL_TRACK; // rad/s, +clockwise
    return omega * RAD2DEG;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Colour sensor (TCS34725)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Simulated downward-facing colour sensor.
   *
   * Returns the marker the robot's body centre is currently over, as
   * { r, g, b, c, name } where name is "red" | "green" | "silver" | "none".
   * Off any marker it returns the dark-floor reading (name "none"). Light
   * channel noise is added so students see realistic, non-constant values.
   *
   * @param {object} robot Robot state with x / y in mm.
   * @returns {{r:number,g:number,b:number,c:number,name:string}}
   */
  function simulateColor(robot) {
    var rgb = COLOR_FLOOR;
    var name = "none";
    for (var i = 0; i < colorZones.length; i++) {
      var z = colorZones[i];
      if (
        robot.x >= z.x &&
        robot.x <= z.x + z.width &&
        robot.y >= z.y &&
        robot.y <= z.y + z.height
      ) {
        rgb = z.rgb || COLOR_FLOOR;
        name = z.color || "none";
        break;
      }
    }
    function jitter(v) {
      return Math.max(0, Math.round(v + (Math.random() - 0.5) * 6));
    }
    return {
      r: jitter(rgb[0]),
      g: jitter(rgb[1]),
      b: jitter(rgb[2]),
      c: jitter(rgb[3]),
      name: name,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Collision detection
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Return the four world-space corners of the robot rectangle.
   *
   * Local frame (relative to centre):
   *   front-left  (−hw, −hl)     front-right  (+hw, −hl)
   *   rear-left   (−hw, +hl)     rear-right   (+hw, +hl)
   *
   * Rotation to world:
   *   wx = cx + lx·cos θ − ly·sin θ
   *   wy = cy + lx·sin θ + ly·cos θ
   */
  function getRobotCorners(robot) {
    var hw = ROBOT_WIDTH / 2; // 60
    var hl = ROBOT_LENGTH / 2; // 100
    var theta = robot.heading * DEG2RAD;
    var s = Math.sin(theta);
    var c = Math.cos(theta);
    return [
      { x: robot.x + -hw * c - -hl * s, y: robot.y + -hw * s + -hl * c },
      { x: robot.x + hw * c - -hl * s, y: robot.y + hw * s + -hl * c },
      { x: robot.x + hw * c - hl * s, y: robot.y + hw * s + hl * c },
      { x: robot.x + -hw * c - hl * s, y: robot.y + -hw * s + hl * c },
    ];
  }

  /**
   * Separating-Axis-Theorem overlap test between the (rotated) robot
   * OBB defined by its four corners and an axis-aligned wall rectangle.
   * Returns true when the two shapes overlap.
   *
   * Tests four axes: world X, world Y, and the two body edge directions.
   * This is robust against thin walls — unlike a corner-in-rect check it
   * detects the case where the body straddles a wall whose width is
   * smaller than the distance between body corners (no corner inside
   * the wall, no wall corner inside the body, but the swept regions
   * overlap).
   */
  function obbAabbOverlap(corners, w) {
    var wallCorners = [
      { x: w.x, y: w.y },
      { x: w.x + w.width, y: w.y },
      { x: w.x + w.width, y: w.y + w.height },
      { x: w.x, y: w.y + w.height },
    ];
    var ax1 = {
      x: corners[1].x - corners[0].x,
      y: corners[1].y - corners[0].y,
    };
    var ax2 = {
      x: corners[3].x - corners[0].x,
      y: corners[3].y - corners[0].y,
    };
    var n1 = Math.sqrt(ax1.x * ax1.x + ax1.y * ax1.y) || 1;
    var n2 = Math.sqrt(ax2.x * ax2.x + ax2.y * ax2.y) || 1;
    ax1.x /= n1;
    ax1.y /= n1;
    ax2.x /= n2;
    ax2.y /= n2;
    var axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, ax1, ax2];
    for (var k = 0; k < axes.length; k++) {
      var a = axes[k];
      var bmin = Infinity;
      var bmax = -Infinity;
      var wmin = Infinity;
      var wmax = -Infinity;
      for (var i = 0; i < 4; i++) {
        var bp = corners[i].x * a.x + corners[i].y * a.y;
        if (bp < bmin) bmin = bp;
        if (bp > bmax) bmax = bp;
        var wp = wallCorners[i].x * a.x + wallCorners[i].y * a.y;
        if (wp < wmin) wmin = wp;
        if (wp > wmax) wmax = wp;
      }
      if (bmax < wmin || wmax < bmin) return false; // separating axis
    }
    return true;
  }

  function isColliding(robot) {
    var corners = getRobotCorners(robot);
    var allWalls = mazeWalls.concat(obstacles);
    for (var j = 0; j < allWalls.length; j++) {
      if (obbAabbOverlap(corners, allWalls[j])) return true;
    }
    return false;
  }

  function checkCollision(robot) {
    if (isColliding(robot)) {
      return {
        x: robot.x,
        y: robot.y,
        heading: robot.heading,
        leftSpeed: robot.leftSpeed,
        rightSpeed: robot.rightSpeed,
        actualLeftV: robot.actualLeftV,
        actualRightV: robot.actualRightV,
        isMoving: robot.isMoving,
        trail: robot.trail,
        collisionCount: (robot.collisionCount || 0) + 1,
        collisionFlashUntil: Date.now() + 300,
      };
    }
    return robot;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Boundary constraints — keep centre inside arena with margin
  // ═══════════════════════════════════════════════════════════════════
  function applyBoundaryConstraints(robot) {
    var margin = Math.max(ROBOT_WIDTH / 2, ROBOT_LENGTH / 2); // 100
    var x = Math.max(margin, Math.min(ARENA_WIDTH - margin, robot.x));
    var y = Math.max(margin, Math.min(ARENA_HEIGHT - margin, robot.y));
    if (x !== robot.x || y !== robot.y) {
      return {
        x: x,
        y: y,
        heading: robot.heading,
        leftSpeed: robot.leftSpeed,
        rightSpeed: robot.rightSpeed,
        actualLeftV: robot.actualLeftV,
        actualRightV: robot.actualRightV,
        isMoving: robot.isMoving,
        trail: robot.trail,
        collisionCount: robot.collisionCount || 0,
        collisionFlashUntil: robot.collisionFlashUntil || 0,
      };
    }
    return robot;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Initial state
  // ═══════════════════════════════════════════════════════════════════
  function getInitialRobotState() {
    return {
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
      heading: 0,
      leftSpeed: 0,
      rightSpeed: 0,
      actualLeftV: 0,
      actualRightV: 0,
      isMoving: false,
      trail: [],
      collisionCount: 0,
      collisionFlashUntil: 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Mirror helpers  (for symmetric mazes)
  // ═══════════════════════════════════════════════════════════════════
  function mirrorPose(robot) {
    return {
      x: ARENA_WIDTH - robot.x,
      y: robot.y,
      heading: -robot.heading,
      leftSpeed: robot.leftSpeed,
      rightSpeed: robot.rightSpeed,
      actualLeftV: robot.actualLeftV,
      actualRightV: robot.actualRightV,
      isMoving: robot.isMoving,
      trail: robot.trail,
      collisionCount: robot.collisionCount || 0,
      collisionFlashUntil: robot.collisionFlashUntil || 0,
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

  // ═══════════════════════════════════════════════════════════════════
  //  Setters / getters
  // ═══════════════════════════════════════════════════════════════════
  function setSpeed(s) {
    simulationSpeed = s;
  }
  function setMazeWalls(w) {
    mazeWalls = w || [];
  }
  function setObstacles(o) {
    obstacles = o || [];
  }
  function clearObstacles() {
    mazeWalls = [];
    obstacles = [];
  }
  function setSideSensorSide(s) {
    sideSensorSide = s;
  }
  function getSideSensorSide() {
    return sideSensorSide;
  }
  function setColorZones(z) {
    colorZones = z || [];
  }
  function getColorZones() {
    return colorZones;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Public API
  // ═══════════════════════════════════════════════════════════════════
  return {
    ARENA_WIDTH: ARENA_WIDTH,
    ARENA_HEIGHT: ARENA_HEIGHT,
    ROBOT_WIDTH: ROBOT_WIDTH,
    ROBOT_LENGTH: ROBOT_LENGTH,
    ULTRASONIC_MIN: ULTRASONIC_MIN,
    ULTRASONIC_MAX: ULTRASONIC_MAX,

    step: step,
    simulateUltrasonic: simulateUltrasonic,
    simulateUltrasonicSide: simulateUltrasonicSide,
    simulateGyroZ: simulateGyroZ,
    simulateColor: simulateColor,
    checkCollision: checkCollision,
    getRobotCorners: getRobotCorners,
    applyBoundaryConstraints: applyBoundaryConstraints,
    getInitialRobotState: getInitialRobotState,

    setSpeed: setSpeed,
    setMazeWalls: setMazeWalls,
    setObstacles: setObstacles,
    clearObstacles: clearObstacles,
    setSideSensorSide: setSideSensorSide,
    getSideSensorSide: getSideSensorSide,
    setColorZones: setColorZones,
    getColorZones: getColorZones,
    mirrorPose: mirrorPose,
    mirrorRect: mirrorRect,

    pwmToVelocity: pwmToVelocity,
    rampVelocity: rampVelocity,
  };
})();
