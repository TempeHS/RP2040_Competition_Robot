# AIDriver Simulator

A browser-based robot simulator for the AIDriver MicroPython Challenges. This web application allows students to practice coding robot control algorithms without needing physical hardware.

## Features

- **ACE Python Editor** - Syntax highlighting, auto-indentation, and error marking
- **Shared Config Editor** - One purpose-organised Python config retained across challenges
- **10 Progressive Challenges** - PID wall-following, maze navigation, markers and recovery
- **Real-time Simulation** - See your robot move in a 2030×2030mm virtual arena
- **Code Validation** - Checks the supported robot API plus config syntax, required names and types
- **Ultrasonic, Gyro & Colour Simulation** - Front/side distance, yaw rate, and ground-colour readings
- **On-screen OLED Panel** - Mirrors the SSD1306 display for the competition challenge
- **Pre-built Mazes** - Corner, outside-corner, dead-end and full-maze layouts

## Challenges

| Challenge | Title                    | Focus                                               |
| --------- | ------------------------ | --------------------------------------------------- |
| Debug     | Debug Script             | [Hardware sanity test](../project/hardware_test.py) |
| 1         | Wall Follow — P Control  | Proportional steering                               |
| 2         | Wall Follow — PD Control | Dampen oscillations                                 |
| 3         | Wall Follow — Full PID   | Integral drift correction                           |
| 4         | Corner Detection         | Front sensor + gyro turn                            |
| 5         | Outside Corners          | Turn left at a nib                                  |
| 6         | Dead End Detection       | Dead ends + nibs                                    |
| 7         | Maze Solver              | Hand-on-wall full maze                              |
| 8         | Colour Markers           | TCS34725 detect & pause                             |
| 9         | No-Go Zones              | Detect black & recover                              |
| 10        | Competition Run          | Victims, score & OLED                               |

## Shared Configuration

Use the full-height **main.py** and **config.py** tabs at the top left of the same editor.
The simulator remains on screen. Run and Step execute main with the latest
config regardless of which tab is visible; edits during execution apply on the
next run. **Validate config.py** (the check-circle button) checks config without
running main and marks invalid settings in that file. Stop before validating.

Numeric settings start at zero, with suggested starting ranges in comments.
Config validation checks required variable names, Python syntax and types only.
It does not validate values or enforce ranges, threshold ordering, string choices
or pin restrictions. Zeroed settings pass; later-challenge settings can stay zero.
Tune the settings used by the current main. A valid config is not a guarantee
of correct or safe motion; runtime errors and hardware-library limits still
apply. Main contains algorithms and runtime state, not duplicate tuning.
Keep config when changing challenges. Both files save independently in this
browser's local storage.

Import, download, copy and reset act on the selected tab. Download both files and transfer
both to the robot initially, then replace only main unless you deliberately
retune. Use firmware built from this implementation, which includes the
configuration checker. The checked-in UF2 may predate that helper.

**Reset Main** and **Reset Robot** preserve config. **Reset Config** requires
confirmation and restores the zeroed template. Existing saved mains are preserved and are not automatically
rewritten; reset a main explicitly to load its new template.

See the [config source](../project/config.py) for section meanings and the
[firmware guide](../docs/Build_Custom_MicroPython_Firmware.md) for recovery.
Calibrate front and side targets separately using the
[physical distance settings](../docs/README.md#physical-distance-settings).

## AIDriver API (Simulated)

Run implements the robot API with live simulated sensors. Step uses a captured
trace with placeholder sensor values, not a live feedback simulation. Neither
mode verifies real sensor health, actuator movement or hardware calibration.
The following calls belong inside the main program:

```python
from aidriver import AIDriver, hold_state
from config_check import validate_config
import aidriver
import config

validate_config(config, AIDriver.MIN_MOTOR_SPEED)
aidriver.DEBUG_AIDRIVER = config.DEBUG_AIDRIVER
my_robot = AIDriver(
    config.WALL_SIDE,
    distance_sensor=config.DISTANCE_SENSOR,
    min_approach_speed=config.MIN_APPROACH_SPEED,
    kit_servo_pin=config.KIT_SERVO_PIN,
)

# Motor control (signed speeds, dead zone handled for you)
my_robot.drive(right_speed, left_speed)   # -255…255
my_robot.brake()

# Gyro turns (closed-loop, LSM6DS3 gyroscope)
my_robot.turn_90("left")               # target 90° (or "right")
my_robot.turn_180("right")             # target 180°
my_robot.turn_degrees(135, "left")     # arbitrary angle
rate = my_robot.read_gyro_z_dps()      # yaw rate, deg/s

# Distance sensors (mm, -1 when out of range)
front = my_robot.read_distance()       # front ultrasonic
side = my_robot.read_distance_2()      # side ultrasonic

# Colour sensor (TCS34725)
r, g, b, c = my_robot.read_color()     # raw counts
name = my_robot.classify_color()       # "red"/"green"/"silver"/"black"/"none"
seen = my_robot.color_detected()       # marker interrupt fired

# OLED display (SSD1306)
my_robot.display_status(state, score, victims)
my_robot.show_display(line1, line2, line3, line4)

# Rescue-kit servo
my_robot.deploy_rescue_kit()

# Timing
hold_state(seconds)                    # retain motor outputs during the pause
```

The motor floor is 120 PWM in hardware and both simulator paths. The visible
student turn helper consumes the shared turn settings; the separate library
turn methods have different gain conventions. Use `try/finally` to brake on
exit, as the challenge templates do.

## Local Development

Serve the **repository root**, not just this app directory. Fetching Python
sources and guides requires HTTP; opening an HTML file directly is insufficient.

```bash
# From the repository root
python -m http.server 8000
```

Then open <http://localhost:8000/app/simulator.html?challenge=1>.

For host and simulator checks:

```bash
python -m pip install -r requirements.txt
python -m pytest -q tests
cd app
npm install
npm test -- --runInBand
```

Runnable script checks load [test-config.py](../tests/test-config.py), not the
zeroed student defaults. Python and Skulpt tests keep the two files' variable
names in sync without requiring equal values. The tuned fixture is excluded
from the published site and firmware; it is never an automatic fallback for
unfinished student tuning.

### Optional Browser Check

The [Chromium workflow check](tests/browser/shared_config.py) is separate from
pytest and Jest. It uses an isolated browser profile and checks the full-height left-aligned
tabs, zeroed first load, Config validation, pending saves, challenge changes,
fresh test-config values on Run and Step while config stays visible, diagnostics,
import/export, independent resets, robot movement, and desktop/mobile layout.
It saves screenshots and downloaded Python files under the selected output
directory without touching your browser's saved work.

With the repository-root HTTP server above still running, use another terminal:

```bash
# From the repository root
python -m pip install -r app/tests/browser/requirements.txt
python -m playwright install --with-deps --only-shell chromium
python app/tests/browser/shared_config.py \
    --url http://127.0.0.1:8000/app/ \
    --output build/browser-checks/development

node app/scripts/stage-site.js build/shared-config-site
python app/tests/browser/shared_config.py \
    --url http://127.0.0.1:8000/build/shared-config-site/ \
    --output build/browser-checks/staged
```

Installing Chromium's Linux system dependencies may require administrator
access. The check needs network access to the same CDN assets as the app.
It verifies the browser workflow, not physical robot calibration or live sensor
feedback in trace mode.

## Deployment to GitHub Pages

Use the [Pages workflow](../.github/workflows/deploy-pages.yml) with repository
Pages configured for **GitHub Actions**. It stages the app together with docs,
firmware downloads and the canonical Python config/checker sources. Do not
publish the app folder alone or maintain a second browser config default.

To build the same static site locally, run `node app/scripts/stage-site.js _site`
from the repository root. Serve the resulting directory over HTTP.

## File Structure

```text
app/
├── index.html          # Main HTML page
├── simulator.html      # Main editor and simulator
├── config.html         # Legacy link redirects to the simulator config tab
├── README.md           # This file
├── css/
│   └── style.css       # Custom styles
├── js/
│   ├── app.js          # Main application
│   ├── editor.js       # Main/config sessions, validation and file actions
│   ├── config-redirect.js # Preserve legacy Config URLs
│   ├── config-store.js # Independent storage and Skulpt config modules
│   ├── simulator.js    # Physics engine
│   ├── python-runner.js # Skulpt integration
│   ├── aidriver-stub.js # AIDriver mock for Skulpt
│   ├── debug-panel.js  # Console output
│   ├── validator.js    # Code validation
│   ├── challenges.js   # Challenge definitions
│   └── mazes.js        # Maze definitions
└── assets/
    └── robot.svg       # Robot sprite
```

## Dependencies (CDN)

- Bootstrap 5.3 - UI framework
- Bootstrap Icons - Icon library
- ACE Editor - Code editor
- Skulpt - Python interpreter

Runtime dependencies are loaded from CDN, so internet access is needed on first
load. npm dependencies are required for development tests, not for using the site.

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License

Part of the AIDriver MicroPython Challenges project.
