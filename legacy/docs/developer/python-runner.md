# Python Execution Pipeline

## Purpose

`app/js/python-runner.js` embeds the Skulpt interpreter and orchestrates everything required to execute learner Python safely inside the browser. It wires simulator-specific IO hooks, enforces validation, and exposes both real-time and step-by-step execution modes.

## Lifecycle

1. **Initialisation**

   - `PythonRunner.init()` registers JavaScript-backed MicroPython modules (currently the AIDriver stub) and configures Skulpt defaults.
   - `registerMicroPythonModules()` ensures `aidriver` resolves during imports.

2. **Standard execution**

   - `run(code)` validates input with `Validator.validate(code)` and clears any residual command queues.
   - Skulpt is configured with custom `output`, `read`, and `setTimeout` hooks so `print()` output and `time.sleep()` calls integrate with the simulator environment.
   - Command processing occurs on every Skulpt suspension (`Sk.promise`) and yield tick (`*` handler) to keep the robot in sync with Python.

3. **Stopping**
   - `stop()` flips `shouldStop`, clears outstanding suspension promises, halts the simulator robot, and flushes command queues.
   - `handleError()` filters out expected stop scenarios and forwards actionable errors to `DebugPanel` and the editor highlights.

## Step Mode

Step mode consists of two phases managed by `runStepMode(code)`:

1. **Trace collection** – `collectTrace(code)` swaps in a tracing version of the MicroPython aidriver module. It instrumented the learner code with `_step_debug()` calls via `injectDebugCalls()`. Each Python line records:

   - Line number and trimmed source text
   - Commands issued during that line
   - Any textual output (captured separately)

2. **Playback** – `playTrace()` replays the captured trace with configurable delays. It highlights source lines, dispatches robot commands, and renders the simulator world after each step. `pauseStep()` and `resumeStep()` manipulate an internal promise to halt/resume the loop.

If trace collection hits the step/time limits, partial traces still play back while warning the learner.

## AIDriver Shim Generation

`getAIDriverPythonModule(forTraceCollection)` emits the Python implementation of `aidriver` that Skulpt imports. Two variants exist:

- **Normal mode** – Minimally wraps commands and prints debug markers when `DEBUG_AIDRIVER` is true.
- **Trace mode** – Disables `time.sleep()` delays, records commands per line, and exposes `_get_trace()` for later retrieval.

Whenever the learner runs code, the JavaScript-side `AIDriverStub` mirrors the Python interface to ensure command queues behave consistently even if the Python module fails to load.

## Command Queue Processing

`processCommandQueue()` pulls commands from both the active Skulpt module (`aidriver._get_commands()`) and the legacy `AIDriverStub` queue. Each command updates `App.robot` directly (wheel speeds, braking, etc.) and triggers a render if motion occurs.

## Error Handling Strategies

- **Validation failures**: Prevent execution and surface errors before Skulpt runs.
- **Runtime errors**: Routed through `handleError()` which extracts line numbers, annotates the editor, and logs formatted messages.
- **Infinite loops**: Enforced via `maxTraceTime` (trace collection) and cooperative yields during normal execution; step mode exposes partial traces with warnings when limits trigger.

## Extending the Pipeline

- To add new simulator operations, update both the Python shim (command emission) and `processCommandQueue()` (execution).
- For custom learner libraries, register them alongside `aidriver` within `registerMicroPythonModules()` and handle import resolution in `handleRead()`.
- When adjusting sleep semantics, remember that Skulpt expects suspensions to resolve with `susp.resume()` as implemented in the `Sk.promise` handler.
