/**
 * Real-world robot configuration.
 *
 * Every number here comes from physical measurement of the RP2040
 * competition robot.  The simulator reads these values and derives
 * its physics constants — change a number here and the sim updates
 * automatically.  No magic constants buried in simulator.js.
 */
const RobotConfig = Object.freeze({
  // ── Chassis ──────────────────────────────────────────────────────
  wheelTrack_mm: 100, // left↔right drive-wheel centre distance (sets turn rate)
  wheelBase_mm: 135, // front↔rear axle distance (informational, rear-wheel drive)
  robotWidth_mm: 120, // overall body width
  robotLength_mm: 200, // overall body length (front to back)
  wheelDiameter_mm: 125, // drive wheel outer diameter
  rearAxleOffset_mm: 65, // body centre → rear drive axle (the turning pivot line)

  // ── Motor / drive-train ──────────────────────────────────────────
  maxPWM: 255, // firmware PWM ceiling
  deadZonePWM: 64, // PWM at or below which the motors stall (0 m/s)
  topSpeed_ms: 0.65, // measured top speed at maxPWM  (m/s)
  acceleration_ms2: 1.75, // linear acceleration           (m/s²)  [1.5–2.0]
  deceleration_ms2: 1.75, // braking / coast-down rate     (m/s²)

  // ── Ultrasonic sensors ───────────────────────────────────────────
  ultrasonicMin_mm: 20, // minimum detectable distance
  ultrasonicMax_mm: 2000, // maximum detectable distance
  sensorNoise_mm: 2, // ± random noise added each reading
  frontSensorOffset_mm: 90, // front sensor ahead of body centre, faces forward
  sideSensorOffset_mm: 65, // side sensor from body centre, faces 90° sideways

  // ── Arena ────────────────────────────────────────────────────────
  arenaWidth_mm: 2000,
  arenaHeight_mm: 2000,
});
