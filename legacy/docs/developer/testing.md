# Testing Strategy

Testing lives inside `app/tests/` and uses Jest with the `jest-environment-jsdom` environment. Suites are organised by type:

- `tests/unit/` – Focused coverage for individual modules like the simulator engine, validator, and editor wiring
- `tests/integration/` – Cross-module scenarios covering Python execution and end-to-end challenge completion
- `tests/lint/` – Static analysis harnesses that ensure every HTML and JavaScript file under `app/` stays standards-compliant
- Standalone HTML harnesses (e.g. `tests/integration-test.html`) exist for manual verification in the browser

## Running Tests

```bash
cd app
npm test
```

The default script executes the full suite with coverage reporting and runs the HTML/JS lint harness. Expect jsdom to warn about unimplemented canvas APIs when simulator rendering tests exercise `HTMLCanvasElement.getContext`; these warnings are currently benign.

### Targeted Runs

- `npm run test:unit` – Unit tests only
- `npm run test:integration` – Integration suites only
- `npm run test:watch` – Re-runs affected tests on file changes
- `npm run test:verbose` – Adds verbose reporting with coverage

## Coverage

Coverage data is emitted to `app/coverage/` in multiple formats (`lcov`, `json`, HTML). Use these reports to identify untested branches when extending modules.

## Writing New Tests

1. Place unit tests under `tests/unit/` and mirror the module name, e.g. `simulator.test.js`
2. Import modules via the `@/` alias (mapped to `app/js/` in `package.json`)
3. When simulating Skulpt behaviour, isolate external dependencies with Jest mocks to avoid brittle async behaviour
4. Keep test data deterministic; the simulator’s noise functions can be stubbed by overriding `Math.random`

## Manual Verification

- Open `app/index.html` in a browser and use DevTools to watch `DebugPanel` output while running learner code
- The integration HTML pages provide minimal bootstrapping when diagnosing issues that are hard to reproduce under Jest
- When modifying the MicroPython shim, load `python-runner` step mode to confirm command sequencing looks correct
