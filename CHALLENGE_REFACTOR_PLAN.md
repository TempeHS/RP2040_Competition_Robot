# Challenge Refactor & Simulator Hardening Plan

> **Goal:** Challenges 1–5 are *building blocks* of Challenge 6. Concatenating
> the unique block from each of C1→C5 (in order) onto the C1 scaffold must
> yield a working Challenge 6 program with **zero edits**. The simulator must
> respect the `AIDriver("left"|"right")` argument as the **single source of
> truth** for wall side, robot start position, and sensor mounting — and it
> must stop the robot at walls instead of letting it drive through them.

> **Status (May 2026):** Pedagogy refactor (answers/ vs starter-code/), block
> contracts, carry-forward scaffolds, doc rewrites, library bug fixes and
> `STARTER_VERSION` cache invalidation are **DONE**. Remaining work is the
> simulator hardening in **Section D**.

---

## Section 0 — Architecture (current)

The challenge ecosystem is split into **three** parallel artefacts per challenge:

| Artefact                                                  | Purpose                                                                                                                                                          | Visible to students? |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `app/answers/challenge-N.py`                              | Reference solution. Used by tests and as a teacher key. Header line `# === ANSWER KEY — Challenge N ===` makes provenance unambiguous.                           | **No**               |
| `app/starter-code/challenge-N.py`                         | The scaffold loaded into the ACE editor. Carries forward every previous challenge's *solved* blocks and exposes only the **new** material as `# TODO` blocks.    | **Yes**              |
| `docs/Challenge_N.md`                                     | Pedagogical guide. Renders the scaffold inline as `## Starter Scaffold` and the answer behind a `<details>` "Reference Solution — only after you've genuinely tried" disclosure. | **Yes**              |

The carry-forward model means a student opening Challenge 4 sees a *working*
PID controller from Challenges 1–3 and only has to write the new front-detect
logic. They never start from a blank file after C1.

---

## Section A — Composability Goal

Every challenge file (both scaffold and answer) follows the **same skeleton**:

```python
from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False
my_robot = AIDriver("left")  # ← only this line decides the wall side

# === BLOCK: CONFIG_BASE START ===
BASE_SPEED            = 160
TARGET_WALL_DISTANCE  = 150
MAX_STEERING          = 40
# === BLOCK: CONFIG_BASE END ===

# === BLOCK: SIDE_KP START ===
side_Kp = 0.40
# === BLOCK: SIDE_KP END ===

# (SIDE_KD added in C2, SIDE_KI added in C3,
#  FRONT_CONFIG + TURN_TIME_180 added in C4/C5,
#  LOST_WALL_DRIFT_FACTOR added in C6)

side_previous_error = 0
side_integral       = 0
side_INTEGRAL_MAX   = 1200

while True:
    # === BLOCK: FRONT_DETECT_DEADEND START ===  (C4+, dead-end variant in C5+)
    # === BLOCK: LOST_WALL_RECOVERY START ===   (C6 only)
    # === BLOCK: SIDE_FOLLOW_PID START ===      (P → PD → PID across C1/C2/C3)
    hold_state(0.05)
```

**Composability rule:** any block introduced in challenge *N* appears
**verbatim** in every later challenge. A block is delimited by paired comment
headers:

```
# === BLOCK: <NAME> START ===
...
# === BLOCK: <NAME> END ===
```

The `composability.test.js` (Section E) parses these markers and asserts every
block in C*N* is a substring of C*N+1*.

---

## Section B — Per-Challenge Block Spec (current scaffold reality)

Block names below match what `app/starter-code/challenge-N.py` and
`app/answers/challenge-N.py` actually contain today.

| Challenge                  | Blocks present (in order)                                                                                                                          | New block(s) introduced                                  | TODO count |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------- |
| **C1** Straight Wall (P)   | `CONFIG_BASE`, `SIDE_KP`, `SIDE_FOLLOW_P`                                                                                                          | `CONFIG_BASE`, `SIDE_KP`, `SIDE_FOLLOW_P`                | 7          |
| **C2** PD Smoothing        | `CONFIG_BASE`, `SIDE_KP`, `SIDE_KD`, `SIDE_FOLLOW_PD`                                                                                              | `SIDE_KD`, `SIDE_FOLLOW_PD` (replaces P with PD)         | 5          |
| **C3** Full PID + L-corner | `CONFIG_BASE`, `SIDE_KP`, `SIDE_KD`, `SIDE_KI`, `SIDE_FOLLOW_PID`                                                                                  | `SIDE_KI`, `SIDE_FOLLOW_PID` (replaces PD with PID)      | 6          |
| **C4** Corner (90°)        | + `FRONT_CONFIG`, `FRONT_DETECT_90`                                                                                                                | `FRONT_CONFIG`, `FRONT_DETECT_90`                        | 2          |
| **C5** Dead End (180°)     | + `TURN_TIME_180`, `FRONT_DETECT_DEADEND` (replaces `FRONT_DETECT_90`)                                                                             | `TURN_TIME_180`, `FRONT_DETECT_DEADEND`                  | 3          |
| **C6** Full Maze           | + `LOST_WALL_DRIFT_FACTOR`, `LOST_WALL_RECOVERY`                                                                                                   | `LOST_WALL_DRIFT_FACTOR`, `LOST_WALL_RECOVERY`           | 2          |

**Loop priority order (identical in every challenge that has the block):**

1. Front obstacle (C4+)
2. Lost-wall recovery (C6 only)
3. Side PID follow (C1+)
4. `hold_state(0.05)`

**Note:** C6 is the literal concatenation of C5's blocks plus
`LOST_WALL_DRIFT_FACTOR` (a constant) and `LOST_WALL_RECOVERY` (a loop branch).
The block-marker check enforces this; see `composability.test.js`.

---

## Section C — Naming & Convention Rules (current)

- Constants `UPPER_SNAKE_CASE` (canonical values shown):
  - `BASE_SPEED = 160`           (must be > `MIN_MOTOR_SPEED = 120`)
  - `TARGET_WALL_DISTANCE = 150`
  - `MAX_STEERING = 40`          (must satisfy `BASE_SPEED − MAX_STEERING ≥ 120`)
  - `FRONT_SLOW_DISTANCE = 400`
  - `FRONT_STOP_DISTANCE = 120`
  - `FRONT_Kp = 0.5`
  - `TURN_SPEED = 180`
  - `TURN_TIME_90 = 0.5`
  - `TURN_TIME_180 = TURN_TIME_90 * 2`
  - `LOST_WALL_DRIFT = 0.20`     (max ~0.25 for `BASE_SPEED = 160`; see below)
  - `side_INTEGRAL_MAX = 1200`
- PID gains/state prefixed `side_`: `side_Kp = 0.40`, `side_Kd = 0.15`,
  `side_Ki = 0.003`, `side_integral`, `side_previous_error`, `side_derivative`.
- Steering formula (single canonical form, used in every challenge):
  ```python
  right_speed = BASE_SPEED - (my_robot.wall_sign * steering)
  left_speed  = BASE_SPEED + (my_robot.wall_sign * steering)
  ```
- **Never** call `rotate_left`/`rotate_right` directly. Use:
  ```python
  my_robot.drive(-TURN_SPEED * my_robot.wall_sign,
                  TURN_SPEED * my_robot.wall_sign)
  ```
- `AIDriver("left")` / `AIDriver("right")` (lowercase). The library accepts
  any case (`str.upper() == "LEFT"`) but starters use lowercase.
- Every loop ends with `hold_state(0.05)`.
- Imports: `from aidriver import AIDriver, hold_state` (lowercase `aidriver`).

### Hard library constraint

`AIDriver.MIN_MOTOR_SPEED = 120`. Any `drive()` call with `|speed| < 120` is
clamped to `0`. This forces:

- `BASE_SPEED − MAX_STEERING ≥ 120`     → with `BASE_SPEED=160`, `MAX_STEERING ≤ 40`.
- `BASE_SPEED × (1 − LOST_WALL_DRIFT) ≥ 120` → `LOST_WALL_DRIFT ≤ 0.25` at `BASE=160`.

These constraints are surfaced in the C6 scaffold header docstring.

---

## Section D — Simulator / Emulator Required Changes

Status legend: ✅ done · ⚠️ partial · ❌ pending

### D1. Remove the manual side-sensor toggle  ⚠️ partial

The simulator must respond purely to the instantiated `AIDriver` object.

- ✅ `btnToggleSideSensor` button + `sideSensorLabel` are **already removed**
  from [app/index.html](app/index.html).
- ❌ [app/js/app.js](app/js/app.js#L120-L237) still defines orphan element
  references and a click handler guarded by `if (App.elements.btnToggleSideSensor)`.
  Cosmetic dead code — delete the three references.

### D2. `AIDriver(...)` is the single source of truth  ⚠️ partial

In [app/js/python-runner.js](app/js/python-runner.js#L192) `getAIDriverPythonModule()`:

- ✅ Case-insensitive: `self.wall_sign = -1 if str(wall_side).upper() == "LEFT" else 1`.
- ❌ **No bridge** to `Simulator.setSideSensorSide(side)`. Result: instantiating
  `AIDriver("right")` correctly flips `wall_sign`, but the simulator's side
  sensor stays on the left wall — `read_distance_2()` measures the wrong wall
  and the right-side challenge run produces nonsense.

**Required:** queue an `init` command carrying the side string, and let
`processAIDriverCommands` in app.js call `Simulator.setSideSensorSide(side)`
plus `App.onAIDriverInstantiated(side)`. The hook then:

  1. Sets the side sensor mounting.
  2. Mirrors spawn pose + success zone if needed (see D3).
  3. Calls `Simulator.reset()` so the robot snaps to the correct start.

### D3. Mirror geometry helper  ❌ pending

Add `Simulator.mirrorPose(pose)` and `Simulator.mirrorRect(rect)`:

```js
mirrorPose: ({x, y, heading}) =>
  ({ x: ARENA_WIDTH - x, y, heading: (360 - heading) % 360 }),
mirrorRect: ({x, y, width, height}) =>
  ({ x: ARENA_WIDTH - x - width, y, width, height }),
```

The side-sensor cone in `read_distance_2()` already uses `sideSensorSide`; no
ray-cast math change is needed beyond pose/zone mirroring.

### D4. Fix wall traversal (collision actually blocks motion)  ❌ pending

[app/js/simulator.js](app/js/simulator.js#L490) `step()` currently:

1. Computes `newState` via `updateKinematics`.
2. If collision → sets speeds to 0 **but keeps `newState.x/y` already
   advanced into the wall.**

Required change:

```js
let candidate = updateKinematics(robot, dt);
candidate     = applyBoundaryConstraints(candidate);
if (checkCollision(candidate, obstacles.concat(mazeWalls))) {
  // Reject the move: keep previous position, zero motion, flag collision.
  return {
    ...robot,
    leftSpeed: 0, rightSpeed: 0, isMoving: false,
    collisionCount: (robot.collisionCount || 0) + 1,
  };
}
return { ...candidate, trail: [...] };
```

At small `dt` this prevents tunnelling. For larger steps, **substep** the
integrator at most every 5 mm of travel and bail on first collision.

### D5. Visual feedback  ❌ pending

On collision, flash robot red for 200 ms and call
`DebugPanel.error("Wall hit at (x,y)")`. Increment a `collisionCount` exposed
in the debug panel — the integration tests below assert it stays at 0 for a
passing run.

---

## Section E — Test Plan (`app/tests/`)

### Unit tests (Jest, jsdom) — `app/tests/unit/`

1. **`aidriver-side.test.js`** *(new)*
   - `new AIDriver("left").wall_sign === -1`
   - `new AIDriver("RIGHT").wall_sign === 1`
   - Instantiation triggers `Simulator.setSideSensorSide(side)`.

2. **`mirror.test.js`** *(new, blocked on D3)*
   - `Simulator.mirrorPose({x:300, y:1700, heading:0})` → `{x:1700, y:1700, heading:0}`.
   - `mirrorRect` symmetric.

3. **`collision.test.js`** *(new, blocked on D4)*
   - Spawn at (300,1000), wall rect at (350..400, 0..2000), drive forward 2 s.
   - Assert `robot.x < 350 - ROBOT_WIDTH/2` (did not enter wall).
   - Assert `robot.collisionCount > 0`.

4. **`composability.test.js`** *(new)*
   - For each `app/starter-code/challenge-{1..6}.py` and each
     `app/answers/challenge-{1..6}.py`:
     - Extract `# === BLOCK: <name> START === ... # === BLOCK: <name> END ===` regions.
     - Assert: every block in `challenge-N` appears verbatim in `challenge-(N+1)` (modulo new blocks added at N+1).
     - Assert: `challenge-6` block set ⊇ blocks introduced across C1..C5 plus the two C6-only blocks.

5. **`naming.test.js`** *(new lint)*
   - Forbid `rotate_left(`/`rotate_right(` in starter and answer files.
   - Forbid `AIDriver("LEFT"`/`AIDriver("RIGHT"` (require lowercase).
   - Require `hold_state(0.05)` at loop tail.

### Integration tests — `app/tests/integration/`

6. **`run-answers.test.js`** *(new)* — for each of C1..C6:
   - Load default maze for that challenge.
   - Run `app/answers/challenge-N.py` for `successCriteria.timeLimit || 60` s sim time.
   - Assert `collisionCount === 0`.
   - For C1–C3: assert avg side distance within ±30 mm of `TARGET_WALL_DISTANCE`.
   - For C4–C6: assert `successCriteria.reach_zone` satisfied.

7. **`right-side-mirror.test.js`** *(new, blocked on D2/D3)*
   - Replace `AIDriver("left")` with `AIDriver("right")` in each answer file.
   - Assert robot spawns mirrored, side sensor reports right-side wall, run
     still completes without collisions.

### Manual: dev-container has no `npm`

Documented in [app/README.md](app/README.md): tests require `npm install` in a
host with Node ≥ 18. CI hook (GitHub Actions) should run `npm test` on PR.

---

## Section F — Remaining Implementation Steps (Ordered)

The challenge/scaffold/answer/doc trio is complete. Remaining work:

1. **D1 cleanup** — delete the three orphan `btnToggleSideSensor` /
   `sideSensorLabel` references in [app/js/app.js](app/js/app.js).
2. **D2 bridge** — queue `init` command with `side` string from the AIDriver
   constructor in [app/js/python-runner.js](app/js/python-runner.js#L192);
   handle it in app.js to invoke `Simulator.setSideSensorSide(side)` and
   `App.onAIDriverInstantiated(side)`.
3. **D3 mirroring helpers** + spawn/zone mirroring in
   [app/js/simulator.js](app/js/simulator.js).
4. **D4 collision blocking + 5 mm substepping** in
   [app/js/simulator.js](app/js/simulator.js#L490).
5. **D5 collision visualisation** + `collisionCount` exposed to debug panel.
6. **Section E tests** — write unit + integration tests against
   `app/answers/`.

### Already shipped (do not redo)

- ✅ `app/answers/challenge-{1..6}.py` reference solutions with ANSWER KEY header.
- ✅ `app/starter-code/challenge-{1..6}.py` carry-forward scaffolds with
   block markers and `TODO` counts 7/5/6/2/3/2.
- ✅ `docs/Challenge_{1..6}.md` updated to "Starter Scaffold + collapsible
   Reference Solution"; C1 stale `BASE_SPEED=165` / `Kp=0.55` removed; C2
   Mermaid flowchart fixed; C2 tuning table aligned to `Kd=0.15` target.
- ✅ `STARTER_VERSION = "v2"` in [app/js/editor.js](app/js/editor.js) — wired
   into all 4 `localStorage` cache key sites so returning students with stale
   cached code receive the new scaffolds.
- ✅ Library [project/lib/aidriver.py](project/lib/aidriver.py): `L298N.set_speed`
   debug-log indentation fixed; `service()` reduced to a documented no-op
   (PWM heartbeat is hardware-driven and does not need polling).
- ✅ Navbar wiring for "PID Turn Tuning" doc across all HTML pages.

---

## Section G — Risks & Open Questions

1. **`localStorage` cached code** *(resolved)* — `STARTER_VERSION` is now
   embedded in every cache key, so any code saved against a prior starter
   shape (or an accidentally-saved answer) is invalidated automatically on
   next load. Bump the constant whenever scaffold shape changes meaningfully.
2. **When does mirroring happen?** — Decision: the simulator detects the
   AIDriver argument from the ACE editor source as soon as it is known and
   repositions the robot immediately; the side does not change mid-run.
   Implementation:
   - Add `parseAIDriverSide(code)` in [app/js/app.js](app/js/app.js): regex
     `/AIDriver\s*\(\s*["']\s*(left|right)\s*["']\s*\)/i`, returns the
     lowercase side or `null`.
   - Call it on (a) editor load, (b) every ACE `change` event (debounced
     ~150 ms), (c) immediately before `Run` executes.
   - When the parsed side differs from the current
     `Simulator.getSideSensorSide()`, invoke `App.onAIDriverInstantiated(side)`
     to mirror spawn pose, mirror success zone, set sensor side, and call
     `Simulator.reset()` so the user sees the robot snap to the correct
     start before pressing Run.
   - During execution, the runtime `AIDriver.__init__` bridge (D2) is a
     no-op if the side already matches; if it differs (user edited code
     mid-run), log a warning and ignore — the static parse wins.
3. **Side sensor cone direction** — `simulateUltrasonicSide()` already
   rotates ±90° relative to heading when `sideSensorSide` flips. Needs unit
   test (Section E #1).
4. **Tuned constants** — `TURN_TIME_90`, `TURN_TIME_180`, `FRONT_Kp` need
   simulator-calibrated values; integration tests will surface drift.
5. **Substepping cost** — at high `simulationSpeed` (5×) substepping every
   5 mm could halve frame rate. Acceptable trade-off for correctness.
6. **Hardware parity** — `wall_sign` is on-device behaviour; none of these
   changes alter the firmware contract. See
   [docs/developer/firmware-parity.md](docs/developer/firmware-parity.md).

---

## Acceptance Checklist

Pedagogy / structure (done):

- [x] `app/answers/` and `app/starter-code/` separated; ANSWER KEY header on
      every reference file.
- [x] Carry-forward scaffolds: each `challenge-N.py` ships prior challenge's
      solved blocks pre-filled; only new material is `TODO`.
- [x] Block markers `# === BLOCK: <NAME> START/END ===` balanced in every
      starter; markers carry forward identically.
- [x] All starter and answer files use lowercase `"left"` / `"right"` and
      `wall_sign`-driven steering only (verified by `naming.test.js` once
      written).
- [x] `STARTER_VERSION` cache invalidation in `editor.js`.

Simulator hardening (pending):

- [ ] D1 — orphan `btnToggleSideSensor` references removed from `app.js`.
- [ ] D2 — AIDriver constructor pushes `side` to the simulator; right-wall
      runs measure the right wall.
- [ ] D3 — `mirrorPose` / `mirrorRect` helpers + spawn/zone mirroring.
- [ ] D4 — `collision.test.js` passes — robot cannot enter any wall AABB.
- [ ] D5 — collision flash + `collisionCount` surfaced in debug panel.

Tests (pending):

- [ ] `composability.test.js` passes — each challenge ⊆ next challenge's
      block set; C6 = C5 ∪ {`LOST_WALL_DRIFT_FACTOR`, `LOST_WALL_RECOVERY`}.
- [ ] `right-side-mirror.test.js` passes for all 6 answer files.
- [ ] Integration test for C6 reaches exit in zigzag maze with 0 collisions.
