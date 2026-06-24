/**
 * AIDriver Simulator - AIDriver Stub Module
 * Browser-based mock of the AIDriver MicroPython library
 * Implements all AIDriver methods and queues commands for the simulator
 */

const AIDriverStub = {
  // Command queue for simulator to consume
  commandQueue: [],

  // Debug flag
  DEBUG_AIDRIVER: false,

  // Robot instance state
  robotInstance: null,

  /**
   * Reset the simulator command queue so pending actions are discarded.
   */
  clearQueue() {
    this.commandQueue = [];
  },

  /**
   * Enqueue a structured command for the simulator and optionally log it.
   * @param {{type: string, params: Record<string, unknown>}} cmd Command payload.
   */
  queueCommand(cmd) {
    console.log("[AIDriverStub] queueCommand:", cmd.type, cmd.params);
    this.commandQueue.push(cmd);

    if (this.DEBUG_AIDRIVER) {
      DebugPanel.log(
        `[AIDriver] ${cmd.type}: ${JSON.stringify(cmd.params)}`,
        "info",
      );
    }
  },

  /**
   * Dequeue the next pending command.
   * @returns {{type: string, params: Record<string, unknown>}|undefined} Oldest command or undefined.
   */
  getNextCommand() {
    return this.commandQueue.shift();
  },

  /**
   * Determine whether commands remain in the queue.
   * @returns {boolean} True when at least one command is waiting to be processed.
   */
  hasCommands() {
    return this.commandQueue.length > 0;
  },

  /**
   * Build the Skulpt module definition that the Python runtime imports as `aidriver`.
   * @returns {(name: string) => object|undefined} Module factory compatible with Skulpt expectations.
   */
  getModule() {
    const self = this;

    return function (name) {
      console.log("[AIDriverStub] getModule called with name:", name);
      if (name !== "aidriver") return undefined;

      const mod = {};

      // DEBUG_AIDRIVER flag
      mod.DEBUG_AIDRIVER = new Sk.builtin.bool(false);

      // AIDriver class
      mod.AIDriver = Sk.misceval.buildClass(
        mod,
        function ($gbl, $loc) {
          /**
           * Initialize the stub and register the robot instance.
           * @returns {null}
           */
          $loc.__init__ = new Sk.builtin.func(function (self, wallSide) {
            // Resolve the wall_side argument (defaults to "left" if omitted).
            let sideStr = "left";
            if (
              wallSide !== undefined &&
              !(wallSide instanceof Sk.builtin.none)
            ) {
              try {
                sideStr = String(Sk.ffi.remapToJs(wallSide)).toLowerCase();
              } catch (e) {
                sideStr = "left";
              }
            }
            if (sideStr !== "left" && sideStr !== "right") {
              sideStr = "left";
            }

            // Expose `wall_sign` as a Python attribute so PID code can do
            //   right = BASE - (my_robot.wall_sign * steering)
            // Convention: left wall → -1, right wall → +1.
            // NOTE: a plain JS assignment (`self.wall_sign = …`) only sets a
            // property on the wrapper; Skulpt looks attributes up via
            // tp$setattr / the instance dict, so we must go through that path.
            self.tp$setattr(
              new Sk.builtin.str("wall_sign"),
              new Sk.builtin.int_(sideStr === "left" ? -1 : 1),
            );

            self.rightSpeed = 0;
            self.leftSpeed = 0;
            self.isMoving = false;

            AIDriverStub.robotInstance = self;
            AIDriverStub.queueCommand({
              type: "init",
              params: { side: sideStr },
            });

            if (AIDriverStub.DEBUG_AIDRIVER) {
              DebugPanel.log(
                "[AIDriver] Robot initialized, wall_side=" + sideStr,
                "info",
              );
            }

            return Sk.builtin.none.none$;
          });

          /**
           * Queue a forward driving command with discrete wheel speeds.
           * @param {Sk.builtin.int_} rightSpeed Mapped to right wheel speed.
           * @param {Sk.builtin.int_} leftSpeed Mapped to left wheel speed.
           * @returns {null}
           */
          $loc.drive_forward = new Sk.builtin.func(function (
            self,
            rightSpeed,
            leftSpeed,
          ) {
            const rs = Sk.ffi.remapToJs(rightSpeed);
            const ls = Sk.ffi.remapToJs(leftSpeed);

            self.rightSpeed = rs;
            self.leftSpeed = ls;
            self.isMoving = true;

            AIDriverStub.queueCommand({
              type: "drive_forward",
              params: { rightSpeed: rs, leftSpeed: ls },
            });

            return Sk.builtin.none.none$;
          });

          /**
           * Queue a backward driving command with discrete wheel speeds.
           * @param {Sk.builtin.int_} rightSpeed Mapped to right wheel speed.
           * @param {Sk.builtin.int_} leftSpeed Mapped to left wheel speed.
           * @returns {null}
           */
          $loc.drive_backward = new Sk.builtin.func(function (
            self,
            rightSpeed,
            leftSpeed,
          ) {
            const rs = Sk.ffi.remapToJs(rightSpeed);
            const ls = Sk.ffi.remapToJs(leftSpeed);

            self.rightSpeed = rs;
            self.leftSpeed = ls;
            self.isMoving = true;

            AIDriverStub.queueCommand({
              type: "drive_backward",
              params: { rightSpeed: rs, leftSpeed: ls },
            });

            return Sk.builtin.none.none$;
          });

          /**
           * Queue a left rotation command using a single turn speed.
           * @param {Sk.builtin.int_} turnSpeed Desired rotation speed value.
           * @returns {null}
           */
          $loc.rotate_left = new Sk.builtin.func(function (self, turnSpeed) {
            const ts = Sk.ffi.remapToJs(turnSpeed);

            self.rightSpeed = ts;
            self.leftSpeed = ts;
            self.isMoving = true;

            AIDriverStub.queueCommand({
              type: "rotate_left",
              params: { turnSpeed: ts },
            });

            return Sk.builtin.none.none$;
          });

          /**
           * Queue a right rotation command using a single turn speed.
           * @param {Sk.builtin.int_} turnSpeed Desired rotation speed value.
           * @returns {null}
           */
          $loc.rotate_right = new Sk.builtin.func(function (self, turnSpeed) {
            const ts = Sk.ffi.remapToJs(turnSpeed);

            self.rightSpeed = ts;
            self.leftSpeed = ts;
            self.isMoving = true;

            AIDriverStub.queueCommand({
              type: "rotate_right",
              params: { turnSpeed: ts },
            });

            return Sk.builtin.none.none$;
          });

          /**
           * Read the simulated gyroscope yaw rate (deg/s) about the Z axis.
           * Mirrors the hardware LSM6DS3.read_gyro_z_dps().
           * @returns {Sk.builtin.float_} Yaw rate in degrees per second.
           */
          $loc.read_gyro_z_dps = new Sk.builtin.func(function (self) {
            let rate = 0;
            if (
              typeof Simulator !== "undefined" &&
              typeof App !== "undefined" &&
              App.robot
            ) {
              rate = Simulator.simulateGyroZ(App.robot);
            }
            return new Sk.builtin.float_(rate);
          });

          /**
           * Closed-loop gyro turn shared by turn_degrees/turn_90/turn_180.
           * Spins the robot and integrates the simulated gyro until the target
           * angle is reached, then brakes — accurate regardless of "battery"
           * or "friction" (which the timed turns could not guarantee).
           * @param {object} self Python instance.
           * @param {number} target Magnitude of the turn in degrees.
           * @param {boolean} isRight True = clockwise/right, false = left.
           * @returns {Sk.misceval.Suspension} Resolves when the turn completes.
           */
          function runGyroTurn(self, target, isRight) {
            const Kp = readTurnGain(self, "turn_Kp", 6.0);
            const Ki = readTurnGain(self, "turn_Ki", 0.0);
            const Kd = readTurnGain(self, "turn_Kd", 0.4);
            const tolerance = readTurnGain(self, "turn_tolerance", 2.0);
            const maxSpeed = readTurnGain(self, "turn_max_speed", 200);
            const timeoutMs = readTurnGain(self, "turn_timeout_ms", 4000);
            const MIN_SPEED = 100;

            function applySpin(speed) {
              if (typeof App === "undefined" || !App.robot) return;
              if (isRight) {
                // clockwise: left wheel forward, right wheel backward
                App.robot.leftSpeed = speed;
                App.robot.rightSpeed = -speed;
              } else {
                App.robot.leftSpeed = -speed;
                App.robot.rightSpeed = speed;
              }
              App.robot.isMoving = true;
            }

            self.isMoving = true;

            return new Sk.misceval.promiseToSuspension(
              new Promise((resolve) => {
                let heading = 0;
                let integral = 0;
                let prevError = target;
                let settle = 0;
                let simElapsed = 0; // simulated seconds
                let last = performance.now();

                function finish() {
                  if (typeof App !== "undefined" && App.robot) {
                    App.robot.leftSpeed = 0;
                    App.robot.rightSpeed = 0;
                    App.robot.actualLeftV = 0;
                    App.robot.actualRightV = 0;
                    App.robot.isMoving = false;
                  }
                  self.isMoving = false;
                  AIDriverStub.queueCommand({ type: "brake", params: {} });
                  resolve(Sk.builtin.none.none$);
                }

                function tick() {
                  const now = performance.now();
                  let dt = ((now - last) / 1000) * (App.speedMultiplier || 1);
                  last = now;
                  if (dt <= 0) dt = 0.001;
                  simElapsed += dt;

                  const gz =
                    typeof Simulator !== "undefined" && App.robot
                      ? Simulator.simulateGyroZ(App.robot)
                      : 0;
                  heading += Math.abs(gz) * dt;
                  const error = target - heading;

                  if (Math.abs(error) <= tolerance) {
                    settle++;
                    if (settle >= 2) {
                      finish();
                      return;
                    }
                  } else {
                    settle = 0;
                  }

                  if (simElapsed * 1000 > timeoutMs) {
                    finish();
                    return;
                  }

                  integral += error * dt;
                  const derivative = (error - prevError) / dt;
                  prevError = error;
                  let output = Kp * error + Ki * integral + Kd * derivative;
                  let speed = Math.round(output);
                  if (speed < MIN_SPEED) speed = MIN_SPEED;
                  if (speed > maxSpeed) speed = maxSpeed;
                  applySpin(speed);

                  setTimeout(tick, 15);
                }

                applySpin(maxSpeed);
                setTimeout(tick, 15);
              }),
            );
          }

          /**
           * Read a turn-gain attribute off the Python instance, falling back to
           * a default when the learner has not overridden it.
           */
          function readTurnGain(self, name, fallback) {
            try {
              const v = self.tp$getattr(new Sk.builtin.str(name));
              if (v !== undefined && !(v instanceof Sk.builtin.none)) {
                return Sk.ffi.remapToJs(v);
              }
            } catch (e) {
              /* attribute not set — use fallback */
            }
            return fallback;
          }

          /**
           * Turn on the spot by target_deg using the simulated gyro-PID loop.
           * @param {Sk.builtin.int_} targetDeg Magnitude of the turn (deg).
           * @param {Sk.builtin.str} [direction] "left"/"right"; sign of
           *        targetDeg is used when omitted (positive = right).
           * @returns {Sk.misceval.Suspension}
           */
          $loc.turn_degrees = new Sk.builtin.func(function (
            self,
            targetDeg,
            direction,
          ) {
            const raw = Sk.ffi.remapToJs(targetDeg);
            const target = Math.abs(raw);
            let isRight;
            if (
              direction !== undefined &&
              !(direction instanceof Sk.builtin.none)
            ) {
              isRight =
                String(Sk.ffi.remapToJs(direction)).toLowerCase()[0] === "r";
            } else {
              isRight = raw >= 0;
            }
            return runGyroTurn(self, target, isRight);
          });

          /**
           * Turn 90° left or right using the gyro-PID loop.
           * @param {Sk.builtin.str} direction "left" or "right".
           * @returns {Sk.misceval.Suspension}
           */
          $loc.turn_90 = new Sk.builtin.func(function (self, direction) {
            const isRight =
              String(Sk.ffi.remapToJs(direction)).toLowerCase()[0] === "r";
            return runGyroTurn(self, 90, isRight);
          });

          /**
           * Turn 180° left or right using the gyro-PID loop.
           * @param {Sk.builtin.str} direction "left" or "right".
           * @returns {Sk.misceval.Suspension}
           */
          $loc.turn_180 = new Sk.builtin.func(function (self, direction) {
            const isRight =
              String(Sk.ffi.remapToJs(direction)).toLowerCase()[0] === "r";
            return runGyroTurn(self, 180, isRight);
          });

          /**
           * Immediately stop all movement and queue a brake command.
           * @returns {null}
           */
          $loc.brake = new Sk.builtin.func(function (self) {
            self.rightSpeed = 0;
            self.leftSpeed = 0;
            self.isMoving = false;

            AIDriverStub.queueCommand({
              type: "brake",
              params: {},
            });

            return Sk.builtin.none.none$;
          });

          /**
           * Minimum reliable motor speed constant matching the hardware library.
           */
          $loc.MIN_MOTOR_SPEED = new Sk.builtin.int_(100);

          /**
           * Drive with signed speeds for PID control.
           * Positive = forward, negative = backward.
           * Speeds below MIN_MOTOR_SPEED magnitude are treated as zero.
           * @param {Sk.builtin.int_} rightSpeed -255 to 255.
           * @param {Sk.builtin.int_} leftSpeed -255 to 255.
           * @returns {null}
           */
          $loc.drive = new Sk.builtin.func(function (
            self,
            rightSpeed,
            leftSpeed,
          ) {
            const MIN_MOTOR_SPEED = 100;
            let rs = Math.max(
              -255,
              Math.min(255, Sk.ffi.remapToJs(rightSpeed)),
            );
            let ls = Math.max(-255, Math.min(255, Sk.ffi.remapToJs(leftSpeed)));

            if (Math.abs(rs) < MIN_MOTOR_SPEED) rs = 0;
            if (Math.abs(ls) < MIN_MOTOR_SPEED) ls = 0;

            if (rs === 0 && ls === 0) {
              self.rightSpeed = 0;
              self.leftSpeed = 0;
              self.isMoving = false;
              AIDriverStub.queueCommand({ type: "brake", params: {} });
              return Sk.builtin.none.none$;
            }

            self.rightSpeed = rs;
            self.leftSpeed = ls;
            self.isMoving = true;

            AIDriverStub.queueCommand({
              type: "drive",
              params: { rightSpeed: rs, leftSpeed: ls },
            });

            return Sk.builtin.none.none$;
          });

          /**
           * Measure distance using the simulator abstraction.
           * @returns {Sk.builtin.int_} Integer distance in simulated centimeters.
           */
          $loc.read_distance = new Sk.builtin.func(function (self) {
            // Get distance from simulator using current robot state
            let distance = 1000;
            if (
              typeof Simulator !== "undefined" &&
              typeof App !== "undefined" &&
              App.robot
            ) {
              distance = Simulator.simulateUltrasonic(App.robot);
            }

            AIDriverStub.queueCommand({
              type: "read_distance",
              params: { result: distance },
            });

            return new Sk.builtin.int_(distance);
          });

          /**
           * Measure distance using the side-facing ultrasonic sensor.
           * @returns {Sk.builtin.int_} Integer distance in mm from the side sensor.
           */
          $loc.read_distance_2 = new Sk.builtin.func(function (self) {
            let distance = 1000;
            if (
              typeof Simulator !== "undefined" &&
              typeof App !== "undefined" &&
              App.robot
            ) {
              distance = Simulator.simulateUltrasonicSide(App.robot);
            }

            AIDriverStub.queueCommand({
              type: "read_distance_2",
              params: { result: distance },
            });

            return new Sk.builtin.int_(distance);
          });

          /**
           * Report whether motion commands are currently active.
           * @returns {Sk.builtin.bool} True when the robot is moving.
           */
          $loc.is_moving = new Sk.builtin.func(function (self) {
            return new Sk.builtin.bool(self.isMoving);
          });

          /**
           * Return a tuple capturing the cached motor speeds.
           * @returns {Sk.builtin.tuple} Pair of right and left speed integers.
           */
          $loc.get_motor_speeds = new Sk.builtin.func(function (self) {
            return new Sk.builtin.tuple([
              new Sk.builtin.int_(self.rightSpeed),
              new Sk.builtin.int_(self.leftSpeed),
            ]);
          });

          /**
           * Update the cached motor speeds without changing direction indicators.
           * @param {Sk.builtin.int_} rightSpeed New right wheel speed.
           * @param {Sk.builtin.int_} leftSpeed New left wheel speed.
           * @returns {null}
           */
          $loc.set_motor_speeds = new Sk.builtin.func(function (
            self,
            rightSpeed,
            leftSpeed,
          ) {
            const rs = Sk.ffi.remapToJs(rightSpeed);
            const ls = Sk.ffi.remapToJs(leftSpeed);

            self.rightSpeed = rs;
            self.leftSpeed = ls;

            AIDriverStub.queueCommand({
              type: "set_motor_speeds",
              params: { rightSpeed: rs, leftSpeed: ls },
            });

            return Sk.builtin.none.none$;
          });
        },
        "AIDriver",
        [],
      );

      /**
       * Suspend execution for the requested time while keeping the last state.
       * @param {Sk.builtin.int_|Sk.builtin.float_} seconds Duration expressed in seconds.
       * @returns {Sk.misceval.Suspension} Suspension resolving when the duration elapses.
       */
      mod.hold_state = new Sk.builtin.func(function (seconds) {
        const secs = Sk.ffi.remapToJs(seconds);

        console.log("[AIDriverStub] hold_state JS called with seconds:", secs);

        AIDriverStub.queueCommand({
          type: "hold_state",
          params: { seconds: secs },
        });

        if (AIDriverStub.DEBUG_AIDRIVER) {
          DebugPanel.log(`[AIDriver] hold_state: ${secs} second(s)`, "info");
        }

        // Return a suspension to pause execution
        const scaledMs = (secs * 1000) / (App.speedMultiplier || 1);
        console.log(
          "[AIDriverStub] Creating promiseToSuspension with scaledMs:",
          scaledMs,
        );

        return new Sk.misceval.promiseToSuspension(
          new Promise((resolve) => {
            console.log(
              "[AIDriverStub] Promise created, setting setTimeout for",
              scaledMs,
              "ms",
            );
            setTimeout(() => {
              console.log("[AIDriverStub] setTimeout fired, resolving promise");
              resolve(Sk.builtin.none.none$);
            }, scaledMs);
          }),
        );
      });

      return mod;
    };
  },
};

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = AIDriverStub;
}
