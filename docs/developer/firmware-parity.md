# Firmware Parity

## Purpose

Learner scripts written for the physical RP2040 firmware must behave the same way inside the browser simulator. `PythonRunner.getAIDriverPythonModule()` injects a MicroPython-compatible shim that mirrors the public API of the hardware `aidriver` module while translating commands into JavaScript-friendly payloads.

## AIDriver API Support

| Method                                                      | Hardware Behaviour                                        | Simulator Equivalent                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `AIDriver(wall_side)`                                       | Initializes motor driver and telemetry queue              | Queues an `init` command so the simulator knows a session began                               |
| `drive_forward(right, left)`                                | Sets forward PWM on each motor                            | Enqueues `drive_forward` with rounded integer speeds                                          |
| `drive_backward(right, left)`                               | Sets reverse PWM                                          | Enqueues `drive_backward` for the physics engine                                              |
| `rotate_left(speed)` / `rotate_right(speed)`                | Counter-rotates wheels for on-spot turns                  | Issues `rotate_left` / `rotate_right` commands                                                |
| `turn_90(dir)` / `turn_180(dir)` / `turn_degrees(deg, dir)` | Closed-loop gyro-PID rotation to a target angle (LSM6DS3) | Spins the robot and integrates `simulateGyroZ` until the target angle is reached, then brakes |
| `read_gyro_z_dps()`                                         | Returns the LSM6DS3 yaw rate in deg/s                     | Returns `Simulator.simulateGyroZ(robot)` (wheel-derived yaw rate)                             |
| `set_motor_speeds(right, left)`                             | Direct speed override                                     | Enqueues `set_motor_speeds` and updates cached motor state                                    |
| `brake()`                                                   | Applies motor brakes                                      | Issues `brake` and zeros cached speeds                                                        |
| `read_distance()`                                           | Returns ultrasonic reading (blocking until available)     | Queues `read_distance`; JavaScript fills in actual distance before returning                  |
| `is_moving()` / `get_motor_speeds()`                        | Reflect internal motor state                              | Reads cached state updated by previous commands                                               |
| `service()`                                                 | Handles background maintenance (LED heartbeat)            | No-op, kept for API parity                                                                    |

The shim also provides `hold_state(seconds)` so existing firmware exercises can wait while the simulator advances the command queue. The helper scales delays by the UI-selected speed multiplier and delegates to JavaScript for movement playback.

## Machine Module Facade

The RP2040 firmware exposes MicroPython `machine` primitives. The simulator registers a lightweight factory through `PythonRunner.getMachineModule()` that supports the subset used in classroom lessons:

- `Pin`: Implements `on()`, `off()`, `value()`, and `toggle()` with cached state.
- `PWM`: Stores frequency and duty cycle but does not generate signals.
- `Timer`: Accepts `init()` calls, but callback scheduling is not emulated.

These mocks ensure learner imports succeed while clarifying that real-time interrupts are unavailable in the browser runtime.

## Known Deviations

- **Real-time guarantees:** JavaScript timers are best-effort; long-running tabs may throttle `hold_state` sleeps compared to deterministic firmware delays.
- **Sensor latency:** The simulator returns instantaneous ultrasonic values. Physical hardware introduces sensor settling time, so guide learners to debounce readings when deploying.
- **Unsupported peripherals:** Only modules used by the curriculum are stubbed. Adding I²C, SPI, or NeoPixel support requires extending both the Python shim and the browser engine.
- **Command queue size:** Trace collection enforces a configurable maximum number of commands (`maxTraceSteps`) to prevent infinite loops during step mode. Firmware imposes no such limit.

## Extending Parity

When new capabilities ship in the MicroPython firmware, update both sides:

1. Expand the Python shim with methods that queue appropriately structured commands.
2. Teach `AIDriverStub` and the simulator to consume the new command type.
3. Augment the machine module facade if additional hardware primitives are required.
4. Add Jest coverage that executes learner-style code to confirm browser and firmware stay aligned.
