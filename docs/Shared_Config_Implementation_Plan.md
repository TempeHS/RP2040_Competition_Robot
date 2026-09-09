# Shared Configuration and Challenge Progression Plan

Status: source implementation, documentation, host tests, Skulpt contracts, and Chromium workflow checks are complete. Physical deployment and calibration remain unverified; the checked-in UF2 has not been rebuilt for this change. See the [student workflow](Shared_Config_Workflow.md).

## Goal

Students keep one `config.py` throughout the course and replace `main.py` as they move between challenges. Configuration is organised by purpose, not challenge number. Earlier tuning is retained, while each new main program introduces the next capability.

The algorithms remain visible and editable. Most student work is tuning configuration, not copying values between successive starter programs.

## Confirmed Requirements

- Use two Python files on the robot: `config.py` and `main.py`.
- Use one shared configuration for the simulator and physical robot, not separate profiles.
- Provide left-aligned `main.py` and `config.py` tabs spanning the grey editor header's full height, without a duplicate filename label or a separate Config screen. Keep file actions on the right and the simulator available while config is visible.
- Include every configuration section from the start with numeric values set to zero and suggested starting ranges in comments/notes. Keep hardware-selection strings, booleans and optional pins correctly typed.
- Show an explicit Validate action on the config tab. Run and Step always execute main using the latest config snapshot.
- Keep runnable test values in `tests/test-config.py`. Test the two configs' variable-name parity, not value equality. Never silently load test tuning into a student's configuration.
- Changing challenges or resetting a challenge program must not replace configuration.
- Students may edit the algorithms in each main program.
- Later programs consume more configuration as the robot becomes more functional.

## Original Implementation

- [Challenge templates](../app/starter-code/challenge-4.py) mix tuning values, fixed movement parameters, and runtime state. Several templates reset earlier tuning to zero.
- [The current robot main](../project/main.py) is a ToF-based Challenge 4 controller using the library's built-in gyro turn.
- [The hardware library](../project/lib/aidriver/driver.py) owns motor and sensor access. It is a package, not a standalone `aidriver.py` file.
- [Editor storage](../app/js/editor.js) is keyed by challenge and starter version. Shared configuration must have independent storage and must not be invalidated by a starter-version change.
- [Normal simulator execution](../app/js/aidriver-stub.js) and [trace execution](../app/js/python-runner.js) use separate AIDriver implementations. Both need configuration imports.
- [The firmware build](../.devcontainer/common_functions.sh) currently treats only `main.py` as a filesystem file and freezes other root Python files. Adding `project/config.py` without updating this logic would freeze it.

## Configuration Contract

The canonical student template is [project/config.py](../project/config.py). The simulator loads or stages this same zeroed source; there is no second manually maintained set of browser defaults. The host, Skulpt and browser test harnesses explicitly load [test-config.py](../tests/test-config.py) for runnable values. That fixture is excluded from published assets and firmware.

Use flat Python assignments and explicit `import config` in each main. Preserve existing tuning names where practical so students can recognise the equations in the current guides. Do not use wildcard imports, configuration classes, nested settings dictionaries, or challenge-specific configuration files.

Configuration contains scalar settings and simple expressions based on other settings. It does not import AIDriver, construct hardware, run loops, or perform file I/O. Importing it must have no hardware side effects.

### Sections and Variable Inventory

| Section                              | Configuration names                                                                                                      | Meaning and units                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Robot Setup                          | `WALL_SIDE`, `DISTANCE_SENSOR`, `DEBUG_AIDRIVER`, `KIT_SERVO_PIN`                                                        | Left/right wall, ultrasonic/ToF backend, debug flag, optional servo GPIO or `None`.                                |
| Driving                              | `BASE_SPEED`, `LOOP_DT`, `STARTUP_PAUSE_TIME`                                                                            | Forward PWM, loop interval, and the hardware main's startup display pause in seconds.                              |
| Wall PID                             | `TARGET_WALL_DISTANCE`, `MAX_STEERING`, `side_Kp`, `side_Ki`, `side_Kd`, `side_INTEGRAL_MAX`                             | Side-wall distance in mm, steering limit, gains, and integral anti-windup limit.                                   |
| Front Distance Control               | `FRONT_SLOW_DISTANCE`, `FRONT_STOP_DISTANCE`, `FRONT_Kp`, `MIN_APPROACH_SPEED`                                           | Slowdown/stop thresholds in mm, proportional approach gain, and minimum approach PWM.                              |
| Turn Control                         | `turn_Kp`, `turn_Kd`, `turn_tolerance`, `TURN_ANGLE`, `TURN_MAX_SPEED`, `MIN_TURN_SPEED`, `TURN_TIMEOUT_MS`              | Heading gains, tolerance/angle in degrees, spin PWM limits, and timeout in ms.                                     |
| Turn Mechanics: Sampling and Kick    | `TURN_DT`, `TURN_KICK_SPEED`, `TURN_KICK_STEPS`                                                                          | Sample interval in seconds, initial PWM burst, and burst sample count.                                             |
| Turn Mechanics: Braking and Settle   | `TURN_COAST_TIME`, `TURN_SETTLE_STEPS`, `TURN_CLEAR_TIME`                                                                | Predictive coast duration in seconds, settle samples, and post-turn forward-clearance time in seconds.             |
| Turn Mechanics: Correction Pulses    | `NUDGE_SPEED`, `NUDGE_MS_PER_DEG`, `NUDGE_MIN_MS`, `NUDGE_MAX_MS`, `NUDGE_STEP`, `TURN_MAX_NUDGES`                       | Pulse PWM, duration scaling, duration bounds in ms, sample interval in seconds, and correction budget.             |
| Outside Corners                      | `NIB_LOST_DISTANCE`, `NIB_CONFIRM_TIME`, `NIB_FORWARD_BEFORE`, `NIB_FORWARD_AFTER`, `NIB_REACQUIRE_MS`                   | Wall-loss threshold in mm, confirmation/wrap times in seconds, and reacquisition timeout in ms.                    |
| Colour Detection                     | `color_min_clear`, `color_red_ratio`, `color_green_ratio`, `color_silver_clear`, `color_black_clear`, `COLOR_PAUSE_TIME` | Clear-channel thresholds, channel fractions, and marker pause duration in seconds.                                 |
| Heading Hold                         | `HEADING_Kp`                                                                                                             | Heading correction gain during straight reverse and forward recovery.                                              |
| No-Go Recovery: Reverse              | `REVERSE_SPEED`, `REVERSE_DT`, `REVERSE_CLEAR_STEPS`, `REVERSE_MAX_STEPS`                                                | Reverse PWM, sample interval in seconds, clearance confirmation count, and safety limit.                           |
| No-Go Recovery: Turn and Wall Search | `OPEN_SPACE_DISTANCE`, `FORWARD_SPEED`, `FORWARD_DT`, `WALL_FOUND_DISTANCE`, `FORWARD_MAX_STEPS`                         | Open-space threshold in mm, search PWM, sample interval in seconds, wall pickup threshold in mm, and safety limit. |
| No-Go Recovery: Grid Compensation    | `GRID_CELL_MM`, `GRID_WALL_OFFSET_MM`, `GRID_ERROR_CLAMP_MM`                                                             | Grid geometry and bounded wall-distance compensation, all in mm.                                                   |
| Competition                          | `VICTIM_PAUSE_TIME`, `POINTS_UNHARMED`, `POINTS_HARMED`, `POINTS_KIT`                                                    | Victim pause in seconds and scoring constants.                                                                     |

The three Turn Mechanics rows are subsections of one advanced section. Recovery rows are similarly grouped under No-Go Recovery. Students can fold sections in the editor. Implementation also names the existing `TURN_PAUSE_TIME`, `NUDGE_SETTLE_STEPS`, and `NIB_PAUSE_TIME` mechanics so they are not hidden tuning literals in main.

The front controller currently implements proportional slowdown, and the student turn controller uses P and D. Do not add unused front or turn integral gains merely to label these sections PID.

Each setting needs a short purpose, unit, and suggested starting range in a comment. Distinguish normal tuning settings from fixed algorithm operations and library safety limits. Tuned test values must be checked against the current algorithms; copying unrelated gains from different timing conventions is not acceptable. Fresh student config is deliberately invalid until required positive settings are filled in; validation checks the complete config rather than substituting fixture values.

### State That Remains in Main

Keep current state labels, accumulated integral, previous error, wall-loss timers, gyro heading, previous colour, started flags, victim counters, and calculated score in the main program. They reset for each run and are never persisted as configuration.

Keep hardware pin maps, register constants, display geometry, and library safety constants inside AIDriver unless an existing public setting needs explicit configuration. Avoid duplicating the motor dead-zone threshold in the learner configuration.

### Consumption Rules

- Read tunables explicitly, for example `config.side_Kp` and `config.BASE_SPEED`.
- Apply public AIDriver settings from configuration during main-program setup, including colour thresholds and minimum approach speed.
- Do not embed a second set of tuning values or silently assign new values back into `config`.
- Do not use missing-setting fallbacks that conceal an outdated or misspelled configuration. Report the missing setting clearly before movement.
- Keep control loops and state transitions visible in each main. Do not replace them with an opaque `run_challenge()` call.
- Keep PID timing conventions stable during the configuration migration. The current side PID uses per-loop sums/deltas, whereas gyro angle integration uses elapsed time.
- Reconcile the student turn routine and later library-turn calls before making one set of turn gains control both. Prefer carrying the visible student routine forward rather than giving the same setting different meanings.
- Configuration is not a live control channel. Each run uses a fixed snapshot; changes apply to the next run.

## Challenge Progression

| Challenge | Newly active capability                                | Settings retained                                             |
| --------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| 1         | Driving and wall P control.                            | Robot setup and driving baseline.                             |
| 2         | Wall derivative damping.                               | Driving, target distance, steering limit, and P gain.         |
| 3         | Wall integral correction and anti-windup.              | Existing P and D tuning.                                      |
| 4         | Front approach control and gyro turns.                 | Wall PID and driving tuning.                                  |
| 5         | Outside-corner detection, wrapping, and reacquisition. | Wall, front, and turn settings.                               |
| 6         | Front-trigger/dead-end reliability.                    | Existing navigation settings; no new configuration structure. |
| 7         | Full-maze reliability.                                 | Existing navigation settings; no new configuration structure. |
| 8         | Marker classification and pauses.                      | Earlier navigation tuning.                                    |
| 9         | Black-zone recovery and heading hold.                  | Earlier navigation and colour tuning.                         |
| 10        | Victim accounting, kit requests, and OLED reporting.   | Earlier navigation, detection, and recovery tuning.           |

Challenge 1 must not use D or I merely because those gains already exist in configuration. Challenge 2 adds D, and Challenge 3 adds I. The main algorithm, not a collection of challenge-enable switches, defines the learning stage.

Earlier settings can need retuning for new geometry. Document that explicitly; never reset them automatically or secretly substitute a known solution.

### Cumulative Navigation Proposal

The existing Challenge 8 and 10 programs drive straight instead of retaining the earlier maze controller. The recommended design is to preserve navigation and layer marker handling, recovery, and scoring over it.

**Deferred:** this behavior change is not part of the config migration. Challenges 8 and 10 retain their marker-corridor algorithms; Challenge 9 retains its existing recovery exercise and the Challenge 10 starter retains its student TODOs. Earlier settings remain saved even when a main does not use them. A cumulative-navigation extension requires its own explicit scope and tests.

Each guide should contain the same transition block:

1. **Keep These Settings:** purpose-based sections reused without copying.
2. **Tune These Settings:** newly relevant settings and any justified retuning.
3. **New Main Behaviour:** new equations, triggers, and states.
4. **Replace Main:** the new complete, editable program importing the existing configuration.

Convert both learner templates and teacher references to this contract. Preserve student-edited mains per challenge; replacing a main does not automatically merge algorithm edits into the next template.

## Simulator Work

### Config Tabs and Persistence

- Use two ACE sessions in the existing editor for main and config, preserving the arena, run controls, cursor positions and undo history while switching tabs.
- Provide purpose-based config headings, a Config-only validation button, selected-file import/download/copy, and an explicitly confirmed reset. Config reset restores the zeroed template.
- Redirect legacy Config-page URLs into the simulator's config tab.
- Preserve formatting and comments by storing the actual Python source.
- Store configuration once per browser origin, independently of challenge IDs and `STARTER_VERSION`. This is local browser storage, not account-based syncing.
- Flush pending saves before tab switches, navigation, challenge changes, exports, and runs. Hidden-file edits must not be saved under the wrong challenge.
- Reset Main affects only the selected program; Reset Robot affects only runtime state. Neither resets configuration.
- Preserve existing student programs during rollout. Offer explicit template replacement and config creation without attempting a destructive, regex-based migration of arbitrary Python.
- Later default/template updates must not overwrite saved values. Any missing-setting migration must be explicit and preserve the student's original source.

### Execution and Validation

- Register the configuration snapshot as an importable Python module in Skulpt for both normal execution and trace collection.
- Clear stale module caches at run boundaries so edits are reflected in the next run.
- Extend the import allowlist for `config`, while preserving existing restrictions on unrelated modules.
- Validate configuration without main-program warnings such as a missing AIDriver instance. Use parsing rather than regex rewriting to inspect Python structure.
- Manual validation never starts main and is blocked during execution so it cannot reconfigure an active Skulpt run.
- Attribute syntax and runtime errors to the correct source file and line, and open the relevant editor.
- Check types, units, positive timing/budget values, front slow/stop ordering, and motor ranges. Do not require an unused PID term to be nonzero.
- Accept the selected distance backend and optional hardware settings in both simulator AIDriver implementations. Do not silently reinterpret the ToF argument as minimum approach speed.
- Resolve the currently different hardware/browser motor floors where shared configuration depends on them. Test turn gain consumption and wall-relative direction explicitly.
- Keep the current trace-mode sensor limitations explicit. Loading configuration in step mode does not make it a live-feedback simulation.
- Allow separate downloads named `config.py` and `main.py`, preserving the same configuration on transfer. Remove or adapt copy-time constructor rewriting so it cannot contradict the configuration.
- Ensure GitHub Pages staging includes the canonical default configuration at the URL used by the simulator.

## Robot and Firmware Work

- Add `project/config.py` and update the default main to import it.
- Keep both files on the device filesystem; exclude both from frozen modules and stale frozen build artifacts.
- Extend first-boot provisioning so a missing configuration can be created from the bundled default without overwriting an existing configuration.
- Preserve a saved configuration when restoring the default main. If configuration is corrupt, provide an explicit recovery path that backs it up before replacement.
- Ensure the restored main and configuration contract are compatible. Missing configuration must not leave a boot loop that prevents recovery.
- Keep normal tuning independent of firmware rebuilds.
- Update deployment and recovery documentation. Do not change the canonical firmware artifact name.

## Pytest Updates

The following test modules and fixtures have been added alongside the implementation. The original hardware diagnostic, motor/log and event-log regression tests are retained.

### Existing Suite and Collection

| Existing file                                       | Planned update                                                                                                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [tests/conftest.py](../tests/conftest.py)           | Extend the existing MicroPython stubs with reusable fake-clock, scripted-sensor, recording-robot, and isolated-config fixtures. Retain exclusions for on-robot diagnostics.                        |
| [tests/test_main.py](../tests/test_main.py)         | Retain its hardware diagnostic initialization-failure and movement-sequence coverage. It currently imports `project.hardware_test`, not `project.main`; do not replace that coverage accidentally. |
| [tests/test_aidriver.py](../tests/test_aidriver.py) | Retain existing motor/log tests. Add focused regressions only for constructor or public API behavior changed by configuration support.                                                             |
| [tests/test_eventlog.py](../tests/test_eventlog.py) | Keep as regression coverage for logging; do not change expectations merely to make the configuration workstream pass.                                                                              |
| [requirements.txt](../requirements.txt)             | Declare the host pytest dependency in the currently empty dependency file. Keep host test tooling out of robot deployment.                                                                         |

Add a root `pytest.ini` with `testpaths = tests` so ordinary host test discovery does not recurse into the vendored MicroPython repository. Preserve exclusions for diagnostic scripts that operate hardware on import.

### Deterministic Fixtures

- `fake_clock`: implements `hold_state`, `ticks_ms`, and wrap-aware `ticks_diff` without real sleeping; permits deterministic timeout and wraparound tests.
- `recording_robot`: records motor, brake, display, and kit commands and supplies scripted distance, gyro, colour, and interrupt results.
- `isolated_config`: loads a fresh `tests/test-config.py` module namespace per test and restores `sys.modules` afterward. Parameterized tests must not leak settings into one another.
- `challenge_loader`: loads each main without starting an infinite loop or touching hardware. Introduce a guarded `main()` entry point while keeping algorithms visible and test helpers out of learner configuration.
- Execute state functions directly where possible. Bound whole-program tests with a test-owned stop sentinel and operation budget; do not rely on wall-clock waits or unbounded imports.
- Use temporary directories for exports, logs, boot simulation, and filesystem fixtures. Tests must not overwrite a student's configuration or generated firmware.

### New Test Modules

The following files now exist and test the configuration contract and progression behavior.

The config checks enforce zero numeric student values, valid tuned test values,
and identical variable-name sets without requiring equal values. All twenty
challenge programs and the hardware main are checked for local tuning copies,
unresolved config references, config mutation, and literal pause durations.

| Proposed file                         | Required coverage                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/test_config.py`                | Parse the canonical config with `ast`; verify unique setting names, supported scalar/constant-expression values, required fields, and no hardware side effects. Check validation of types, timing limits, motor ranges, and front threshold ordering. Assert runtime state is absent.                                                               |
| `tests/test_challenge_config.py`      | Parameterize over all ten starter mains and teacher references. Verify required config references resolve and no owned tunables are reassigned locally. Override representative settings and assert actual constructor, drive, turn, colour, and recovery behavior consumes them. Static name checks alone are insufficient.                        |
| `tests/test_challenge_progression.py` | Test P-only, PD, and PID activation; derivative/integral history; wall-loss reset and anti-windup; front priority and slowdown; turn sign, clamp, timeout, and correction budget; nib debounce and reacquisition. Test fresh runtime state with the same retained config across mains.                                                              |
| `tests/test_challenge_progression.py` | Add scripted marker and recovery cases: bright marker edge detection, black polling without an interrupt, bounded reverse clearance, open-side choice, forward wall pickup and grid compensation, one count/kit request per victim, and the silver-start/finish guard. Add cumulative-navigation cases only when that proposal is implemented.      |
| `tests/test_firmware_config.py`       | Test provisioning against temporary filesystem data: clean first boot, missing config, existing modified config, main recovery, and corrupt-config backup. Check that config is excluded from frozen-module staging and that a changed filesystem config is loaded. Exercise the boot generator in a temporary tree, not a complete firmware build. |

Preserve the distinction between estimated score and physical kit deployment. The current simulator kit method is a no-op returning `False`; a host test must not claim an actuator moved. Document the scoring policy before changing it.

Host tests establish logic and configuration contracts. They do not prove that a real robot completes a maze or that browser storage and Skulpt behave correctly.

### Commands and CI

Record existing test failures before changing behavior. Use the selected host Python interpreter; do not infer editor interpreter configuration from historical notes.

Baseline commands, once pytest is available:

```sh
python -m pytest --collect-only -q tests
python -m pytest -q tests/test_aidriver.py tests/test_eventlog.py tests/test_main.py
```

Commands for implementation verification:

```sh
python -m pip install -r requirements.txt
python -m pytest -q tests/test_config.py tests/test_challenge_config.py
python -m pytest -q tests/test_challenge_progression.py tests/test_firmware_config.py
python -m pytest -q tests
```

Add a lightweight Python-test CI job scoped to the host `tests/` directory. It must not require an attached robot, build firmware, or run the vendored MicroPython tests. Include relevant configuration, challenge, dependency, and boot-generator changes in its triggers.

Do not hide unrelated baseline failures by skipping tests or weakening assertions. Report them separately.

## Browser Verification

Extend the existing Jest suite and add focused browser checks for responsibilities pytest cannot establish:

- Shared configuration survives challenge changes, page navigation, reloads, main resets, and starter-version changes.
- A pending save completes before switching editors or starting a run.
- Both Skulpt paths can import the latest config, including a second run after changing a value.
- Invalid config produces a config-file diagnostic, not a misleading main-file highlight.
- Import/export round-trips preserve source and comments; downloaded programs import the downloaded config without rewriting tuning.
- Config-tab reset requires confirmation, restores zeros and leaves saved mains intact.
- Legacy saved mains remain accessible during migration.
- API consistency checks cover the configuration-facing constructor/settings as well as public method names.
- The Config editor and controls work at desktop and mobile sizes, and the deployed default-config asset loads successfully.

Run controlled simulator exercises with one carried-forward configuration, explicitly recording any tuning changes between challenges. Reaching a goal zone alone is not proof of correct pauses, recovery, or scoring.

### Verification Results

- The host pytest suite passes, including all twenty challenge programs, configuration consumption, progression logic, documentation, and generated filesystem provisioning/recovery.
- The complete Jest suite passes, including real Skulpt execution of all twenty programs in both normal and trace paths with test-owned limits. P/PD/PID trajectory comparisons use the same test-config fixture without per-challenge rewrites.
- The [optional Chromium check](../app/tests/browser/shared_config.py) passes against both the repository-root development server and the staged project-site URL. It verifies full-height left-aligned tabs, Config-only validation, the zeroed first load, independent persistence, imports/downloads, Run/Step errors, and reset isolation. Runnable cases explicitly load the test fixture, changing `BASE_SPEED` to 185, 190 and 195 to check fresh imports while config remains visible, and reject 0 before movement.
- Desktop (1440 by 1000) and mobile (390 by 844) screenshots were inspected. Canvas pixel and movement checks pass; controls do not overflow horizontally, and the mobile status bar does not cover the arena. Reproduction commands are in the [simulator README](../app/README.md#optional-browser-check).
- No board was flashed and no physical calibration was performed. The checked-in UF2 is unchanged. Downloaded mains require a firmware build containing `config_check` or deployment of that helper; the new recovery module requires the updated firmware build.

## Implementation Phases

1. **Contract and test baseline:** inventory tunables, settle default values and timing conventions, document the cumulative-navigation decision, and establish scoped pytest collection.
2. **Configuration foundation:** add the canonical config, deterministic fixtures, a guarded main, and a single migrated challenge. Validate consumption with focused pytest before converting the remaining programs.
3. **Simulator support:** add independent storage, the Config editor, module loading in both modes, diagnostics, and two-file export. Validate save/load and execution contracts with Jest and browser checks.
4. **Challenge migration:** migrate all starter mains, teacher references, and guides. Validate retained tuning and each newly activated algorithm. Keep behavior changes separate from mechanical config extraction.
5. **Cumulative behaviors:** if approved, layer colour, recovery, and scoring onto navigation; add the corresponding progression tests and simulator exercises.
6. **Firmware transfer:** implement filesystem provisioning and recovery, test them without hardware, then verify actual two-file deployment on the robot.
7. **Release checks:** run the scoped host and browser suites, test deployment assets, and complete a documented simulator/hardware smoke test.

## Acceptance Checklist

- [x] One purpose-based config supplies every learner-facing tuning value.
- [x] Student numeric defaults are zero; test-only tuned values have matching variable names without requiring matching values.
- [x] Full-height left-aligned main/config tabs replace the duplicate filename label and retain the simulator view, with explicit Config-only validation.
- [x] Students replace main without copying or losing prior tuning.
- [x] Algorithms remain visible and editable.
- [x] Configuration persists independently of challenge and template versions.
- [x] P, D, and I become active only in the intended main programs.
- [x] Normal and step execution load fresh configuration and identify errors by file.
- [ ] Downloaded `config.py` and `main.py` run together on supported hardware.
- [x] Both device files remain editable without rebuilding firmware (filesystem staging and provisioning verified on the host).
- [x] Recovery preserves existing tuning or backs it up before explicit replacement (generated recovery code tested on the host).
- [x] Pytest collection is scoped, deterministic, and does not start hardware scripts or infinite loops.
- [x] Tests cover configuration consumption and progression behavior, not only matching variable names.
- [x] Browser persistence, imports, exports, diagnostics, and responsive layout are verified separately.
- [x] Documentation consistently states what stays, what is newly tuned, and what main behavior changes.
- [x] Remaining physical calibration and trace-mode limitations are documented, not presented as verified parity.
