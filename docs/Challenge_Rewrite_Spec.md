# Challenge Documentation Rewrite Specification

## Purpose

This document defines the exact rewrite standard for Challenge 1 to Challenge 10 so the challenge sequence is consistent, technically accurate, and easy for students to extend.

Primary goals:

1. Improve code quality guidance.
2. Improve internal documentation so student code is easy to understand and modify.
3. Ensure clear alignment between maze geometry and challenge objective.
4. Make each new code block easy to add without breaking prior work.
5. Improve black-zone recovery behavior in Challenge 9 with a deterministic, measurable flow.

## In Scope

Files to rewrite:

1. docs/Challenge_1.md
2. docs/Challenge_2.md
3. docs/Challenge_3.md
4. docs/Challenge_4.md
5. docs/Challenge_5.md
6. docs/Challenge_6.md
7. docs/Challenge_7.md
8. docs/Challenge_8.md
9. docs/Challenge_9.md
10. docs/Challenge_10.md

## Out of Scope

1. Firmware API redesign.
2. Simulator physics changes.
3. Reordering challenge numbers.
4. Introducing unsupported hardware paths.

## Global Writing Standard

All challenge files must use the same structure and heading names.

Required section order:

1. Challenge title.
2. Purpose (one short paragraph).
3. Success Criteria.
4. Before You Begin.
5. Maze Situation.
6. What Is New In This Challenge.
7. Carry Forward From Previous Challenge.
8. Algorithm Flow.
9. Starter Code Contract.
10. Tunables.
11. Tuning Guide.
12. Debug Checklist.
13. Common Failure Modes.
14. Exit Check.
15. What Is Next.

Language and style rules:

1. Use one term per concept and keep it fixed across all files.
2. Use explicit units for all tunables and measurements.
3. Keep examples realistic and aligned with actual starter code.
4. Explain why behavior happens, not just what to type.
5. Keep challenge delta explicit: what changed and what stayed the same.

## Canonical Terminology

Use these exact terms across all files:

1. Inside corner or dead end.
2. Outside corner or nib.
3. Front sensor.
4. Side sensor.
5. Wall lost.
6. Marker.
7. Black zone.
8. Recovery state.
9. Follow wall state.
10. Turn state.

Do not alternate with mixed synonyms unless defined once in parentheses.

## Code Teaching Standard

Every challenge code explanation must follow one consistent control-loop pattern:

1. Read sensors.
2. Validate sensor values.
3. Compute control terms.
4. Clamp control output.
5. Actuate motors.
6. Update history variables.
7. Hold loop timing.

Every code section must identify:

1. Student-tunable constants.
2. Required safety clamps.
3. Required fail-safe behavior.
4. Variables that must be updated every loop.

## Starter Code Contract (Required Block in Every Challenge)

Each challenge must include a short contract section with this intent:

1. Safe to edit: tunable constants listed in Tunables table.
2. Do not edit: loop skeleton, state transition guards, and safety clamps unless challenge explicitly says to.
3. Optional debug edits: print statements in designated debug area only.

## Carry-Forward Contract (Required Block in Every Challenge)

Each challenge must include a carry-forward table with three groups:

1. Reused variables.
2. New variables.
3. Removed or no-longer-used variables.

This ensures students can migrate code incrementally without guessing.

## Maze Alignment Matrix

Each challenge must contain a short alignment block with these four lines:

1. Maze feature being tested.
2. Trigger condition expected in code.
3. New behavior introduced.
4. Why previous challenge fails on this maze.

Expected progression:

1. Challenge 1: straight corridor, side P control.
2. Challenge 2: off-center angled start, add derivative damping.
3. Challenge 3: L corner drift, add integral and anti-windup.
4. Challenge 4: front wall corner, add first state transition and gyro turn.
5. Challenge 5: outside corner nib, add nib state and wall-lost debounce.
6. Challenge 6: mixed corners, validate trigger precedence and FSM reuse.
7. Challenge 7: full maze, tune for long-run robustness.
8. Challenge 8: red/green/silver markers, add color thresholding with interrupt gate.
9. Challenge 9: black zone, add polled dark-surface detection and recovery state.
10. Challenge 10: victim run, add scoring, OLED reporting, and kit deployment.

## Tunables Standard

Every challenge Tunables section must include a table with these columns:

1. Name.
2. Unit.
3. Purpose.
4. Typical start value.
5. Symptoms when too low.
6. Symptoms when too high.

Units must be explicit:

1. mm for distance.
2. s for time.
3. deg for angle.
4. deg per second when discussing gyro rates.
5. PWM scale context for motor speed.

## Debug Checklist Standard

Every challenge must include a checklist with objective pass criteria:

1. Sensor values are valid and not stuck at error state.
2. Controller output remains clamped.
3. State transitions occur at expected trigger thresholds.
4. Robot exits challenge maze section as required.

## Common Failure Modes Standard

Every challenge must include a table:

1. Symptom.
2. Root cause.
3. Verification step.
4. Fix.

Root causes must map to actual variables in that challenge.

## Challenge 9 Black-Zone Recovery Rewrite (Concrete Spec)

Challenge 9 must be rewritten to use this explicit recovery sequence.

Recovery sequence:

1. Detect black-zone entry using polled classify_color result.
2. Enter RECOVER state and latch entry condition.
3. Reverse fixed distance using front distance delta as progress measure.
4. Rotate 90 degrees using gyro closed-loop control.
5. Move forward 290 mm using front distance delta as progress measure.
6. If wall is detected inside wall pickup threshold, return to FOLLOW_WALL.
7. If no wall is detected, rotate back 90 degrees.
8. Move forward another 290 mm using hand-on-wall orientation.
9. Recheck wall pickup.
10. Repeat up to max attempts.
11. If still not recovered, brake and report fail-safe status.

Required Challenge 9 tunables:

1. color_black_clear.
2. recover_reverse_mm.
3. recover_turn_deg.
4. recover_forward_mm with default 290.
5. wall_pickup_distance_mm.
6. recover_max_attempts.
7. phase_timeout_s.

Required safeguards:

1. Clamp motor outputs in every phase.
2. Timeout each phase.
3. Maximum attempt counter.
4. Final safe stop with clear status output.

## State Machine Documentation Standard (Challenges 4 to 10)

Every FSM challenge must include two tables:

1. State table:
   - State name.
   - Responsibilities.
   - Exit conditions.
2. Trigger table:
   - Trigger condition.
   - From state.
   - To state.
   - Priority when multiple conditions are possible.

This prevents hidden transition logic and improves student comprehension.

## Acceptance Criteria

The rewrite is complete when all criteria below are true.

Structure consistency:

1. All ten challenge files use the required section order.
2. Shared heading names match exactly.

Technical consistency:

1. Variable naming patterns are consistent challenge to challenge.
2. Tunable units are explicit and consistent.
3. Sensor error handling guidance is consistent.

Maze consistency:

1. Every challenge clearly states maze feature and trigger.
2. Success criteria are observable in simulator behavior.

Learning progression consistency:

1. Each challenge adds one principal concept.
2. Carry-forward tables explicitly show reuse.

Challenge 9 recovery consistency:

1. Documentation contains the deterministic sequence above.
2. Distances and angles are measurable in mm and deg.
3. Fail-safe behavior is documented.

## Rewrite Execution Plan

Phase 1: Foundation pass

1. Rewrite Challenge 1 to Challenge 3 using full section template.
2. Normalize terminology and units.

Phase 2: FSM pass

1. Rewrite Challenge 4 to Challenge 7 using shared FSM table format.
2. Verify trigger ordering clarity.

Phase 3: Sensor and competition pass

1. Rewrite Challenge 8 to Challenge 10 with consistent sensor-state language.
2. Apply concrete Challenge 9 recovery rewrite.

Phase 4: Final harmonization

1. Cross-file terminology audit.
2. Cross-file carry-forward audit.
3. Cross-file tunable naming audit.
4. Final readability pass for student level.

## Authoring Notes for Maintainers

1. Keep all behavior descriptions aligned to actual starter code and simulator assumptions.
2. Do not describe optional legacy hardware paths in challenge core flow.
3. Prefer deterministic procedures over vague tuning advice.
4. Keep examples short but executable.
5. When introducing a new state, always show why existing states are insufficient.
