# AIDriver Simulator

A browser-based robot simulator for the AIDriver MicroPython Challenges. This web application allows students to practice coding robot control algorithms without needing physical hardware.

## Features

- **ACE Python Editor** - Syntax highlighting, auto-indentation, and error marking
- **10 Progressive Challenges** - PID wall-following through a full Rescue-Maze competition run
- **Real-time Simulation** - See your robot move in a 2030×2030mm virtual arena
- **Strict Validation** - Ensures code uses only the AIDriver library
- **Ultrasonic, Gyro & Colour Simulation** - Front/side distance, yaw rate, and ground-colour readings
- **On-screen OLED Panel** - Mirrors the SSD1306 display for the competition challenge
- **Pre-built Mazes** - Corner, outside-corner, dead-end and full-maze layouts

## Challenges

| Challenge | Title                    | Focus                                    |
| --------- | ------------------------ | ---------------------------------------- |
| Debug     | Debug Script             | Hardware sanity test (`project/main.py`) |
| 1         | Wall Follow — P Control  | Proportional steering                    |
| 2         | Wall Follow — PD Control | Dampen oscillations                      |
| 3         | Wall Follow — Full PID   | Integral drift correction                |
| 4         | Corner Detection         | Front sensor + gyro turn                 |
| 5         | Outside Corners          | Turn left at a nib                       |
| 6         | Dead End Detection       | Dead ends + nibs                         |
| 7         | Maze Solver              | Hand-on-wall full maze                   |
| 8         | Colour Markers           | TCS34725 detect & pause                  |
| 9         | No-Go Zones              | Detect black & recover                   |
| 10        | Competition Run          | Victims, score & OLED                    |

## AIDriver API (Simulated)

The simulator implements the same AIDriver methods as the firmware:

```python
from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = False        # True to print sensor + motor values
my_robot = AIDriver("left")            # "left" or "right" — match the scene

# Motor control (signed speeds, dead zone handled for you)
my_robot.drive(right_speed, left_speed)   # -255…255
my_robot.brake()

# Gyro turns (closed-loop, LSM6DS3 gyroscope)
my_robot.turn_90("left")               # exactly 90° (or "right")
my_robot.turn_180("right")             # exactly 180°
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
hold_state(seconds)                    # non-blocking wait
```

## Local Development

Simply open `index.html` in a modern web browser. No server required!

For development with live reload:

```bash
# Using Python's built-in server
python -m http.server 8000

# Or with Node.js
npx serve .
```

Then open http://localhost:8000

## Deployment to GitHub Pages

1. Push the `app/` directory to your repository
2. Go to repository Settings → Pages
3. Set Source to "Deploy from a branch"
4. Select `main` branch and `/app` folder (or root if app is at root)
5. Save and wait for deployment

Or use GitHub Actions for automatic deployment.

## File Structure

```
app/
├── index.html          # Main HTML page
├── README.md           # This file
├── css/
│   └── style.css       # Custom styles
├── js/
│   ├── app.js          # Main application
│   ├── editor.js       # ACE Editor module
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

All dependencies are loaded from CDN - no npm install required!

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License

Part of the AIDriver MicroPython Challenges project.
