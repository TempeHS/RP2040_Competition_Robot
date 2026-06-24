# AIDriver Simulator

A browser-based robot simulator for the AIDriver MicroPython Challenges. This web application allows students to practice coding robot control algorithms without needing physical hardware.

## Features

- **ACE Python Editor** - Syntax highlighting, auto-indentation, and error marking
- **8 Progressive Challenges** - From basic motor control to maze navigation
- **Real-time Simulation** - See your robot move in a 2000×2000mm virtual arena
- **Strict Validation** - Ensures code uses only the AIDriver library
- **Ultrasonic Sensor Simulation** - Distance readings update in real-time
- **Gamepad Control** - Challenge 7 uses on-screen/keyboard controls
- **5 Pre-built Mazes** - For Challenge 6 maze navigation practice

## Challenges

| Challenge | Title                    | Description                                |
| --------- | ------------------------ | ------------------------------------------ |
| 0         | Fix the Code             | Debug syntax errors in provided code       |
| 1         | Drive in a Straight Line | Balance motor speeds for straight driving  |
| 2         | Drive a Circle           | Use differential drive for circular motion |
| 3         | Detect and Stop          | Use ultrasonic sensor to stop near wall    |
| 4         | U-Turn                   | Drive, detect wall, turn 180°, return      |
| 5         | Figure 8                 | Complex path with alternating turns        |
| 6         | Maze Navigation          | Autonomous maze solving                    |
| 7         | Gamepad Control          | Manual driving practice                    |

## AIDriver API (Simulated)

The simulator implements these AIDriver methods:

```python
from aidriver import AIDriver, hold_state

robot = AIDriver("left")

# Motor control
robot.drive_forward(right_speed, left_speed)  # 0-255
robot.drive_backward(right_speed, left_speed)
robot.rotate_left(turn_speed)
robot.rotate_right(turn_speed)
robot.brake()

# Gyro turns (closed-loop, LSM6DS3 gyroscope)
robot.turn_90("left")          # or "right" — turns exactly 90°
robot.turn_180("right")        # or "left" — turns exactly 180°
robot.turn_degrees(135, "left")  # arbitrary angle
rate = robot.read_gyro_z_dps()   # yaw rate, deg/s

# Sensors
distance = robot.read_distance()  # mm, -1 for out of range
moving = robot.is_moving()  # True/False
speeds = robot.get_motor_speeds()  # (right, left)

# Timing
hold_state(seconds)  # Wait without blocking
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
│   ├── mazes.js        # Maze definitions
│   └── gamepad.js      # Gamepad controller
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
