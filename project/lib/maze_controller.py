"""
MazeController — tick-based competition state machine for the THS Rescue Maze
robot (RoboCup Junior, Intermediate division).

WHY THIS EXISTS
    The challenge answers run their recovery as blocking ``while`` loops, which
    breaks the state-machine model: while the robot is backing off a black tile
    nothing else (run timer, victim latch, OLED) gets a look-in. This controller
    drives the whole run from a single non-blocking ``tick()``: every call does
    one short slice of work for the current state and returns immediately, so the
    main loop can also service the OLED, the run timer and the stuck watchdog.

USES ONLY AIDriver PRIMITIVES
    drive / brake / turn_90 / read_distance / read_distance_2 / read_gyro_z_dps /
    classify_color / color_detected / display_status / deploy_rescue_kit.
    That means the same controller runs on the robot and can be exercised against
    the simulator's AIDriver stub.

STATES
    CALIBRATE      settle, zero heading, then start searching
    SEARCH         wall-follow one slice; watch for black / victims / timeout
    AT_VICTIM      stop, indicate, count, drop a kit for a harmed victim
    BLACK_REVERSE  back straight off a no-go tile, holding heading on the gyro
    BLACK_TURN     pick the open side and turn 90 deg toward it
    BLACK_DRIVE    drive straight until a new wall is found, then resume SEARCH
    STUCK          lack-of-progress nudge (reverse + turn), then resume SEARCH
    AT_EXIT        run time used up: stop and report the final counts
    DONE           idle; tick() does nothing further

The heading-hold correction signs match the proven challenge-9 recovery so the
behaviour on real hardware is unchanged — only the control structure is new.
"""

from time import ticks_ms, ticks_diff

try:
    from aidriver import hold_state
except Exception:  # pragma: no cover - fallback for off-target unit runs
    import time

    def hold_state(seconds):
        time.sleep(seconds)


# ── State labels ──────────────────────────────────────────────────────────
CALIBRATE = "CALIBRATE"
SEARCH = "SEARCH"
AT_VICTIM = "AT_VICTIM"
BLACK_REVERSE = "BLACK_REVERSE"
BLACK_TURN = "BLACK_TURN"
BLACK_DRIVE = "BLACK_DRIVE"
STUCK = "STUCK"
AT_EXIT = "AT_EXIT"
DONE = "DONE"

# Scoring (Intermediate division, used only for the on-screen estimate).
POINTS_UNHARMED = 10
POINTS_HARMED = 25
POINTS_KIT = 10


class MazeController:
    """Run the Rescue Maze as a non-blocking tick-based state machine."""

    def __init__(self, robot, run_seconds=240):
        """
        Args:
            robot: A constructed AIDriver (hardware or simulator stub).
            run_seconds: Total round length; SEARCH hands off to AT_EXIT when
                         this elapses (RoboCup Intermediate default 240 s).
        """
        self.robot = robot
        self.run_seconds = run_seconds

        # ── Wall-follow tunables (carried from the challenges) ──────────────
        self.BASE_SPEED = 200
        self.TARGET_WALL_DISTANCE = 200
        self.MAX_STEERING = 60
        self.side_Kp = 0.25
        self.side_Kd = 0.40
        self._side_previous_error = 0

        # ── Recovery tunables ──────────────────────────────────────────────
        self.HEADING_KP = 4.0
        self.TICK_DT = 0.05
        self.REVERSE_SPEED = 180
        self.REVERSE_CLEAR_STEPS = 6
        self.REVERSE_MAX_STEPS = 80
        self.OPEN_SPACE_DISTANCE = 400
        self.FORWARD_SPEED = 200
        self.WALL_FOUND_DISTANCE = 300
        self.FORWARD_MAX_STEPS = 200

        # ── Detection tunables ─────────────────────────────────────────────
        self.BLACK_DEBOUNCE = 2  # consecutive black reads before recovering
        self.VICTIM_HOLD_S = 1.2  # stop time on a victim (rules: >= 1 s)

        # ── Watchdog tunables ──────────────────────────────────────────────
        self.WATCHDOG_TICKS = 60  # SEARCH ticks between progress checks
        self.PROGRESS_MM = 20  # min front-distance change to count as moving

        # ── Runtime state ──────────────────────────────────────────────────
        self.state = CALIBRATE
        self._heading = 0.0
        self._black_count = 0
        self._black_clear_count = 0
        self._reverse_steps = 0
        self._drive_steps = 0
        self._victim_latched = False
        self._pending_kind = None

        self.victims_unharmed = 0
        self.victims_harmed = 0

        self._start_ms = ticks_ms()
        self._watch_ms = self._start_ms
        self._watch_front = 0
        self._watch_counter = 0

    # ── Public helpers ─────────────────────────────────────────────────────
    @property
    def score(self):
        """Estimated running score for the OLED (judges award the real one)."""
        return (
            self.victims_unharmed * POINTS_UNHARMED
            + self.victims_harmed * POINTS_HARMED
            + getattr(self.robot, "kit_deploy_count", 0) * POINTS_KIT
        )

    @property
    def victims(self):
        return self.victims_unharmed + self.victims_harmed

    def elapsed_s(self):
        return ticks_diff(ticks_ms(), self._start_ms) / 1000.0

    def time_up(self):
        return self.elapsed_s() >= self.run_seconds

    def run(self):
        """Convenience loop: tick until the round finishes."""
        while self.state != DONE:
            self.tick()
        self.robot.brake()

    # ── Main dispatch ──────────────────────────────────────────────────────
    def tick(self):
        """Advance the state machine by one slice and return the new state."""
        if self.state == CALIBRATE:
            self._tick_calibrate()
        elif self.state == SEARCH:
            self._tick_search()
        elif self.state == AT_VICTIM:
            self._tick_at_victim()
        elif self.state == BLACK_REVERSE:
            self._tick_black_reverse()
        elif self.state == BLACK_TURN:
            self._tick_black_turn()
        elif self.state == BLACK_DRIVE:
            self._tick_black_drive()
        elif self.state == STUCK:
            self._tick_stuck()
        elif self.state == AT_EXIT:
            self._tick_at_exit()
        # DONE: nothing to do.
        return self.state

    def _set_state(self, new_state):
        """Change state and refresh the OLED (no-op if no panel attached)."""
        self.state = new_state
        self.robot.display_status(new_state, self.score, self.victims)

    # ── State implementations ──────────────────────────────────────────────
    def _tick_calibrate(self):
        self.robot.brake()
        self._heading = 0.0
        self._start_ms = ticks_ms()
        self._watch_ms = self._start_ms
        self._watch_front = self._safe_front()
        self.robot.display_status("CALIBRATE", 0, 0)
        hold_state(self.TICK_DT)
        self._set_state(SEARCH)

    def _tick_search(self):
        # End the round on the clock.
        if self.time_up():
            self.robot.brake()
            self._set_state(AT_EXIT)
            return

        color = self.robot.classify_color()

        # Black no-go tile → debounce, then recover.
        if color == "black":
            self._black_count += 1
            if self._black_count >= self.BLACK_DEBOUNCE:
                self.robot.brake()
                self._black_count = 0
                self._heading = 0.0
                self._reverse_steps = 0
                self._black_clear_count = 0
                self._set_state(BLACK_REVERSE)
                return
        else:
            self._black_count = 0

        # Victim marker → only fire once per marker (latched until we leave it).
        if color in ("red", "green"):
            if not self._victim_latched:
                self._victim_latched = True
                self._pending_kind = color
                self.robot.brake()
                self._set_state(AT_VICTIM)
                return
        elif color == "none":
            # Re-arm once the robot has driven off the marker.
            self._victim_latched = False

        # Otherwise: follow the wall for one slice.
        self._wall_follow_step()
        self._watchdog_step()

    def _tick_at_victim(self):
        kind = self._pending_kind
        if kind == "red":
            self.victims_harmed += 1
            self.robot.display_status("HARMED VIC", self.score, self.victims)
            self.robot.deploy_rescue_kit()  # +10 bonus when the servo is fitted
        else:
            self.victims_unharmed += 1
            self.robot.display_status("GREEN VIC", self.score, self.victims)
        # Rules: stop for >= 1 s with a clear indication.
        hold_state(self.VICTIM_HOLD_S)
        self._pending_kind = None
        self._set_state(SEARCH)

    def _tick_black_reverse(self):
        gz = self.robot.read_gyro_z_dps()
        self._heading = self._heading + gz * self.TICK_DT
        correction = self.HEADING_KP * self._heading
        self.robot.drive(
            int(-self.REVERSE_SPEED + correction),
            int(-self.REVERSE_SPEED - correction),
        )
        hold_state(self.TICK_DT)
        self._reverse_steps += 1

        if self.robot.classify_color() != "black":
            self._black_clear_count += 1
        else:
            self._black_clear_count = 0

        done = (
            self._black_clear_count >= self.REVERSE_CLEAR_STEPS
            or self._reverse_steps >= self.REVERSE_MAX_STEPS
        )
        if done:
            self.robot.brake()
            self._set_state(BLACK_TURN)

    def _tick_black_turn(self):
        direction = self._choose_open_direction()
        self.robot.turn_90(direction)  # discrete gyro-PID turn (one action)
        self._heading = 0.0
        self._drive_steps = 0
        self._set_state(BLACK_DRIVE)

    def _tick_black_drive(self):
        front = self._safe_front()
        if (
            front <= self.WALL_FOUND_DISTANCE
            or self._drive_steps >= self.FORWARD_MAX_STEPS
        ):
            self.robot.brake()
            self._heading = 0.0
            self._set_state(SEARCH)
            return
        gz = self.robot.read_gyro_z_dps()
        self._heading = self._heading + gz * self.TICK_DT
        correction = self.HEADING_KP * self._heading
        self.robot.drive(
            int(self.FORWARD_SPEED + correction),
            int(self.FORWARD_SPEED - correction),
        )
        hold_state(self.TICK_DT)
        self._drive_steps += 1

    def _tick_stuck(self):
        # Lack of progress: back up a little, turn away, then search again.
        self.robot.drive(-self.REVERSE_SPEED, -self.REVERSE_SPEED)
        hold_state(self.TICK_DT * 4)
        self.robot.brake()
        self.robot.turn_90(self._choose_open_direction())
        self._heading = 0.0
        self._watch_ms = ticks_ms()
        self._watch_front = self._safe_front()
        self._set_state(SEARCH)

    def _tick_at_exit(self):
        self.robot.brake()
        self.robot.show_display(
            "RUN COMPLETE",
            "Unharmed:{}".format(self.victims_unharmed),
            "Harmed:{}".format(self.victims_harmed),
            "Score:{}".format(self.score),
        )
        self.state = DONE

    # ── Shared building blocks ─────────────────────────────────────────────
    def _wall_follow_step(self):
        """One slice of side-PID wall following (challenge-1/2 logic)."""
        side = self.robot.read_distance_2()
        if side == -1:
            self.robot.drive(self.BASE_SPEED, self.BASE_SPEED)
            hold_state(self.TICK_DT)
            return

        error = side - self.TARGET_WALL_DISTANCE
        derivative = error - self._side_previous_error
        steering = (self.side_Kp * error) + (self.side_Kd * derivative)
        if steering > self.MAX_STEERING:
            steering = self.MAX_STEERING
        elif steering < -self.MAX_STEERING:
            steering = -self.MAX_STEERING

        right = self.BASE_SPEED - (self.robot.wall_sign * steering)
        left = self.BASE_SPEED + (self.robot.wall_sign * steering)
        self.robot.drive(int(right), int(left))
        self._side_previous_error = error
        hold_state(self.TICK_DT)

    def _choose_open_direction(self):
        """Turn toward open space, away from the nearest wall (challenge-9)."""
        side = self.robot.read_distance_2()
        sensor_on_left = self.robot.wall_sign < 0
        wall_on_sensor_side = side != -1 and side < self.OPEN_SPACE_DISTANCE
        if wall_on_sensor_side:
            return "right" if sensor_on_left else "left"
        return "left" if sensor_on_left else "right"

    def _watchdog_step(self):
        """Detect lack of progress over WATCHDOG_TICKS SEARCH slices."""
        self._watch_counter += 1
        if self._watch_counter < self.WATCHDOG_TICKS:
            return
        self._watch_counter = 0
        front = self._safe_front()
        moved = abs(front - self._watch_front) >= self.PROGRESS_MM
        self._watch_front = front
        if not moved:
            self.robot.brake()
            self._set_state(STUCK)

    def _safe_front(self):
        """Front distance with the sensor's -1 'no echo' mapped to a big value."""
        front = self.robot.read_distance()
        if front == -1:
            return 9999
        return front
