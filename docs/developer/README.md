# AIDriver Simulator Developer Guide

## Overview

The AIDriver simulator is a browser-hosted training environment that mirrors the behaviour of the classroom robot kit. This guide introduces the project layout, highlights the key runtime modules, and explains how the simulator wraps the Skulpt Python interpreter to execute learner submissions. Use these pages to navigate the JavaScript codebase, extend features, and diagnose issues.

## Quick Start

1. Install dependencies inside the `app/` folder: `npm install`
2. Run the full Jest suite: `npm test`
3. Launch the static site (e.g. via a local web server) and open `app/index.html`
4. Modify simulator modules under `app/js/` and reload the page to test changes

## Module Reference

- [Architecture](architecture.md) – top-level application flow and module responsibilities
- [Python Execution Pipeline](python-runner.md) – Skulpt configuration, command bridging, and step mode internals
- [Simulator Engine](simulator-engine.md) – physics model, collision handling, and sensor simulation
- [Validation Pipeline](validator.md) – static analysis safeguards applied to learner code
- [Challenge Data](challenges.md) – challenge metadata fields, success criteria, and maze integration
- [Hardware Integration](hardware-integration.md) – I²C peripherals (IMU, colour, OLED) and the rescue-kit servo
- [Firmware Parity](firmware-parity.md) – MicroPython shim coverage and known differences
- [UI Customization](ui-customization.md) – extending panels, styling, and editor tweaks
- [Testing Strategy](testing.md) – automated coverage and manual test workflows

## Conventions

- All simulator code uses plain ES modules without a formal bundler; keep dependencies relative to `app/js/`
- Stick with ASCII text and Unix line endings when editing shared files
- Prefer JSDoc for describing exported functions; the codebase now contains full annotations for each module

## Getting Help

- Review console output in the browser for `DebugPanel` logs
- Consult the unit and integration tests in `app/tests/` for usage examples
- When touching Skulpt execution paths, rerun the Full Application integration suite
