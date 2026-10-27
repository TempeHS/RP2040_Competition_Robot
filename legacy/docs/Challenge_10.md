# Challenge 10: Competition Run - Victims, Score, OLED

## Purpose

Add victim accounting, score estimates, display reporting and rescue-kit requests
to the marker-corridor exercise. Combining this with full maze navigation and
black-zone recovery is a separate extension.

## Shared Config Transition

1. **Keep These Settings:** Robot Setup, Driving and Colour Detection in [config.py](../project/config.py). Navigation/recovery tuning stays saved but is not used by this corridor main.
2. **Tune These Settings:** Competition: victim pause and score constants; review the optional rescue-kit servo setting.
3. **New Main Behaviour:** The existing scaffold adds counters, a score function and OLED setup. Complete its victim and finish TODO branches in main.
4. **Replace Main:** Use the [Challenge 10 main](../app/starter-code/challenge-10.py) as `main.py`. Keep config; counters and marker history reset for each run.

Read the [shared configuration instructions](README.md#shared-configuration). The teacher reference implements victim/finish branches; it uses the same config, not separate hidden tuning.

## Success Criteria

The robot identifies red and green victims, updates estimated score and counts,
requests a rescue kit for each new harmed victim, shows live OLED status, and
completes the run at silver finish. On hardware, separately verify kit movement.
The simulator returns `False` from kit deployment; the estimate still includes
the configured kit bonus per request, not a verified physical delivery.

## Before You Begin

1. Complete Challenge 8 color classification.
2. Complete Challenge 9 recovery behavior.
3. Open simulator Challenge 10 and verify OLED panel visibility.

## Maze Situation

- Maze feature: victim markers and finish marker in one run.
- Trigger condition expected in code: marker classification transitions and run-complete condition.
- New behavior introduced: scoring and competition status state reporting.
- Why previous challenge fails: no victim accounting, no score model, no OLED run status.

## What Is New In This Challenge

New: competition scoring model and status output layer.

Unchanged: core movement and color classification flow.

## Settings Used In This Main

| Group   | Variable                                | Notes                                       |
| ------- | --------------------------------------- | ------------------------------------------- |
| Reused  | Color thresholds and movement control   | Same sensing baseline.                      |
| New     | `unharmed`, `harmed`, score constants   | Competition accounting.                     |
| New     | OLED status strings and state labels    | Live operator/judge feedback.               |
| New     | Rescue-kit action call on harmed marker | Bonus-scoring behavior.                     |
| Removed | None                                    | Challenge flow is marker-driven end-to-end. |

## Algorithm Flow

```mermaid
stateDiagram-v2
    [*] --> START
    START --> SEARCH: run begins
    SEARCH --> GREEN_VIC: green marker
    SEARCH --> HARMED_VIC: red marker
    GREEN_VIC --> SEARCH: count and pause complete
    HARMED_VIC --> SEARCH: count, deploy kit, pause complete
    SEARCH --> RUN_COMPLETE: silver finish
    RUN_COMPLETE --> [*]
```

### State Table

| State name     | Responsibilities                                            | Exit conditions                         |
| -------------- | ----------------------------------------------------------- | --------------------------------------- |
| `START`        | Initialize counters, status, and started flag               | Enter `SEARCH` when moving off start    |
| `SEARCH`       | Drive and classify markers                                  | Exit to victim states or `RUN_COMPLETE` |
| `GREEN_VIC`    | Count unharmed victim, update score/status, pause           | Return to `SEARCH`                      |
| `HARMED_VIC`   | Count harmed victim, deploy kit, update score/status, pause | Return to `SEARCH`                      |
| `RUN_COMPLETE` | Brake and display final report                              | End                                     |

### Trigger Table

| Trigger condition         | From state                  | To state       | Priority |
| ------------------------- | --------------------------- | -------------- | -------- |
| New green marker          | `SEARCH`                    | `GREEN_VIC`    | High     |
| New red marker            | `SEARCH`                    | `HARMED_VIC`   | High     |
| Silver finish after start | `SEARCH`                    | `RUN_COMPLETE` | Highest  |
| Pause complete            | `GREEN_VIC` or `HARMED_VIC` | `SEARCH`       | High     |

## Starter Code Contract

Safe to tune in shared config (display labels remain editable in main):

1. Scoring constants if competition rules change.
2. Pause duration.
3. OLED display text labels.

Keep these algorithm invariants when completing or editing main:

1. New-marker edge detection.
2. Score-update formulas.
3. Run-complete finish guard.

Optional debug edits:

1. Print state, color class, counts, and score each loop.

## Tunables

Carry forward your measured [Challenge 8 colour settings](Challenge_8.md#tuning-guide) in the same config. Do not replace them with generic ratios or brightness counts when loading this main.

| Name                 | Unit         | Purpose                     | Starting point          | Symptoms when too low             | Symptoms when too high |
| -------------------- | ------------ | --------------------------- | ----------------------- | --------------------------------- | ---------------------- |
| `color_min_clear`    | clear counts | Reject very low light       | Retain measured setting | Low-light noise admitted          | Missed markers         |
| `color_red_ratio`    | fraction     | Red victim classification   | Retain measured setting | Other surfaces called red         | Red victims missed     |
| `color_green_ratio`  | fraction     | Green victim classification | Retain measured setting | Other surfaces called green       | Green victims missed   |
| `color_silver_clear` | clear counts | Finish marker detection     | Retain measured setting | Floor called silver; early finish | Missed finish          |
| `VICTIM_PAUSE_TIME`  | s            | Pause on victim marker      | 1.0                     | Insufficient pause                | Slow run               |

## Tuning Guide

1. Verify marker edge detection avoids double counts.
2. Verify finish is only valid after run start.
3. Verify score math with a known marker sequence.

## Debug Checklist

- [ ] Each victim marker increments once.
- [ ] Harmed marker triggers rescue-kit deploy call.
- [ ] OLED status matches current state and score.
- [ ] Final report appears at run completion.

## Common Failure Modes

| Symptom                        | Root cause                    | Verification step                     | Fix                                  |
| ------------------------------ | ----------------------------- | ------------------------------------- | ------------------------------------ |
| Same victim counted repeatedly | Missing edge detection        | Print current and previous marker     | Enforce new-marker condition         |
| Score mismatch                 | Incorrect scoring formula     | Hand-calculate expected score         | Correct constants/formula            |
| Finish at start tile           | Missing started guard         | Log started flag when finish triggers | Require started before finish        |
| OLED unreadable or stale       | No update on state transition | Log display update calls              | Update display on every state change |

## Exit Check

Pass when the Success Criteria are met in at least 3 consecutive simulator runs.

## What Is Next

This challenge completes the student sequence. Next, calibrate on hardware and
transfer the same `config.py` alongside `main.py`; do not copy tuning back into
the main program.
