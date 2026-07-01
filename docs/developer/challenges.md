# Challenge Data

## Overview

Challenge metadata lives in `app/js/challenges.js`. Each entry describes how the UI presents the activity, where the robot spawns, and how completion is evaluated. The exported helper functions (`get`, `getAll`, `count`, `checkSuccess`) treat the definitions as immutable runtime configuration.

## Challenge Definition Shape

| Field             | Type                                                             | Purpose                                                            |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `id`              | `number \| string`                                               | Unique identifier used in menus and persistence.                   |
| `title`           | `string`                                                         | Display name rendered in the challenge picker.                     |
| `subtitle`        | `string`                                                         | Short descriptor shown under the title.                            |
| `icon`            | `string`                                                         | Bootstrap icon (without `bi-` prefix trimming) for the menu badge. |
| `menuGroup`       | `"basic" \| "advanced" \| "special"`                             | Controls which section the picker groups the challenge into.       |
| `difficulty`      | `"success" \| "info" \| "warning" \| "danger"`                   | Colour token used to render the difficulty pill.                   |
| `description`     | `string`                                                         | Learner-facing overview displayed beside the editor.               |
| `goal`            | `string`                                                         | One-line success statement shown in the UI.                        |
| `hints`           | `Array<string>`                                                  | Ordered guidance rendered in the hint list.                        |
| `startPosition`   | `{ x: number, y: number, heading: number }`                      | Robot spawn location in millimetres plus heading (degrees).        |
| `successCriteria` | `object`                                                         | Type-specific configuration consumed by `checkSuccess`.            |
| `path`            | `null \| object`                                                 | Optional visual guide for the simulator overlay.                   |
| `obstacles`       | `Array<{ x: number, y: number, width: number, height: number }>` | Static rectangular obstacles injected into the simulator.          |
| `maze`            | `string`                                                         | Maze id passed to the maze renderer (Challenge 6 only).            |

### Success Criteria Variants

`successCriteria.type` defines which evaluator runs inside `checkSuccess`:

- `run_without_error`: Requires the code to finish without raising errors and travel at least `minDistance` millimetres.
- `reach_zone`: Passes when the robot is inside `zone` (axis-aligned rectangle). Optional `maxDeviation` restricts lateral drift.
- `complete_circle`: Validates circular driving via `centerTolerance` and `minRotation` plus path alignment.
- `stop_at_distance`: Ensures the robot stops within `[min, max]` millimetres of a target wall.
- `complete_square`, `figure_eight`, `return_to_start`: Use geometric heuristics baked into their respective helpers.

### Path Helpers

When present, `path` hints at the intended trajectory for render overlays:

- `line`: Straight path with `start`, `end`, and `width`.
- `circle`: Circular track defined by `center`, `radius`, and `width`.
- `square`: Axis-aligned square with `corner`, `size`, and `width`.
- `obstacle_course`: Waypoint series with `waypoints` array and `width` corridor.

The simulator uses these shapes purely for visual feedback; they do not affect physics directly.

## Maze Integration

Challenge 6 references the maze catalog in `app/js/mazes.js`. Each maze definition exposes:

- `id`, `name`, `difficulty`, and `description` for UI presentation.
- `startPosition` to override the challenge default when a specific maze loads.
- `endZone` to highlight the exit area.
- `walls`: array of millimetre rectangles matching the simulator coordinate system.

The maze module supplies helper methods:

- `get(mazeId)`: Returns a single definition, defaulting to `simple`.
- `getAll()`: Provides the full record for configuration panels.
- `getList()`: Produces lightweight summaries for drop-down menus.
- `draw(ctx, scale, mazeId)`: Renders walls and exit zones on the simulator canvas.

Any additional mazes should follow the documented shape so Challenge 6 can swap layouts without further code changes.
