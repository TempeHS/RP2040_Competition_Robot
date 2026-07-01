# Architecture

## Application Layout

The simulator lives entirely in the `app/` directory. Static assets load directly in the browser, so there is no runtime bundling step.

```
app/
  index.html          # Entry point that bootstraps modules from /js
  js/                 # Main simulator modules
  css/style.css       # UI styles
  assets/             # Images and supporting resources
  tests/              # Jest suites (unit + integration)
```

Browser globals provide loose coupling between modules. Each JavaScript file registers itself on `window`, allowing other modules to consume the exported object without using import/export syntax.

## Execution Flow

1. **App initialisation** (`app/js/app.js`)
   - Configures the ACE editor, simulator canvas, and UI bindings
   - Loads the selected challenge from `challenges.js`
   - Prepares the `PythonRunner` and `Simulator`

2. **Learner code run**
   - `PythonRunner.run()` validates code using `Validator.validate()` before invoking Skulpt
   - The AIDriver stub bridges Python commands into the JavaScript simulator queue
   - `Simulator.step()` updates the robot pose while render loops display state

3. **Trace / Step mode**
   - `PythonRunner.collectTrace()` swaps in a trace-enabled aidriver implementation
   - `PythonRunner.playTrace()` replays the captured execution one line at a time, calling `Simulator` as commands require

4. **Telemetry and logging**
   - `logger.js` and `debug-panel.js` surface progress, warnings, and errors

## Key Dependencies

- **Skulpt**: Embedded Python interpreter exposed globally as `Sk`
- **ACE**: Code editor powering the Python coding experience
- **Bootstrap**: Used lightly for layout/styling (already included in `index.html`)

## Data Flow Summary

- Learner Python → Skulpt → `aidriver` module → command queue → `Simulator`
- Sensor queries in Python → Skulpt → AIDriver stub → `Simulator.simulateUltrasonic()`
- Validation → `Validator` heuristics run before Skulpt executes code

## Extending the Simulator

- Add new robot behaviours by updating both the AIDriver stub (JavaScript) and MicroPython shim (Python generated in `python-runner.js`)
- Introduce additional sensors by extending `Simulator.step()` and the AIDriver interfaces
- UI/UX enhancements should be wired through `app/js/app.js` to keep state changes centralised
