# Simulator Engine

`app/js/simulator.js` encapsulates robot physics, collision checks, and sensor emulation. The module exposes a plain object with constants and helper functions so the rest of the application can read state without maintaining its own geometry logic.

## Core Concepts

- **Units** – All positions and distances are expressed in millimetres; time deltas use seconds.
- **Differential drive** – Motor speeds correspond to wheel velocity. The engine converts integer speed values (0–255) into millimetres per second using `MM_PER_SPEED_UNIT` and the configured `simulationSpeed` multiplier.
- **Arena** – The workspace is a 2×2 metre square. Robot size constants ensure boundary constraints consider the full chassis footprint.

## Motion Integration

`updateKinematics(robot, dt)` performs the canonical differential drive calculation:

- Derives linear (`v`) and angular (`ω`) velocities from the left/right wheel speeds
- Integrates heading in radians, normalises back to degrees, and produces a fresh state object without mutating the input
- Supports both straight-line and arc trajectories depending on the angular velocity

`step(robot, dt)` ties the whole frame together:

1. Early exits if the robot is stationary
2. Updates kinematics and clamps the resulting position using `applyBoundaryConstraints()`
3. Runs `checkCollision()` against static obstacles and maze walls, halting movement on contact
4. Appends the new position to the `trail`, trimming the history above 1000 samples

## Collision Detection

- `getRobotCorners()` rotates the rectangular chassis to compute four world-space points.
- `rectanglesOverlap()` compares the robot’s bounding box with axis-aligned rectangles supplied as obstacles.
- Maze geometry is stored as simple rectangles, so collision checks unify obstacles and maze walls before testing.

## Sensor Simulation

`simulateUltrasonic(robot)` casts a ray from the robot’s nose forward, measuring the nearest intersection with arena walls, obstacles, or maze segments. It returns `-1` when distances fall outside `ULTRASONIC_MIN`/`ULTRASONIC_MAX`, and injects ±2 mm of noise to mimic real sensor jitter. The helper relies on `rayBoxIntersection()` which implements a standard slab-based ray/AABB intersection routine.

## Configuration Helpers

- `setSpeed(speed)` clamps the simulation multiplier between 0.1× and 5×
- `setObstacles(obstacleList)` and `setMazeWalls(walls)` replace the respective collision lists
- `clearObstacles()` wipes both sets, restoring an empty arena
- `getInitialRobotState()` returns the canonical spawn point near the bottom of the arena with a cleared trail

## Extending the Engine

- Introduce new sensors by following the ultrasonic pattern: compute origin, direction, and environment intersections, then expose a helper for the AIDriver layer.
- For more complex obstacles (e.g. polygons), swap the bounding-box collision helpers with SAT or another broad-phase algorithm, but maintain the same API shape.
- Keep physics pure; return new state objects instead of mutating inputs so calling code can reason about state transitions.
