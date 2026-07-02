# Tempe High School RP2040 Competition Robot

A low-cost, easy-to-assemble differential drive robot, specifically designed for students. This platform provides hands-on experience with fundamental mechatronic components, robot construction, and introductory programming for mechatronics applications.

**🔗 Quick Links:**

- 🎮 [Web Simulator](https://tempehs.github.io/AIDriver_MicroPython_Challanges/) - Test your code without hardware
- 💻 [MicroPython Lab](https://lab-micropython.arduino.cc/) - Online MicroPython IDE

## Build The Robot

### Components

All components can be purchased from [AliExpress](https://www.aliexpress.com/) and the chassis manufactured using a 3D Printer and Laser cutter.

1. [Laser cut chassis](manufacturing_files/LC_Faculty_AIDriverGluelessv2_PP.pdf) using [(3mm Ply)](https://www.bunnings.com.au/2440-x-1220mm-3mm-plywood-pine-premium-bc-grade_p0340267)
2. [3D Printed components](docs/manufacturing_files)
3. [RP2040 Uno Development Board](https://www.aliexpress.com/item/1005009315359179.html)
4. [Seeed Studio Grove - Base Shield V2.0 (Arduino UNO form factor)](https://wiki.seeedstudio.com/Base_Shield_V2/) — carries the Grove sensors
5. 2x [Seeed Studio Grove - Ultrasonic Distance Sensor](https://wiki.seeedstudio.com/Grove-Ultrasonic_Ranger/) (front + side, single-pin SIG)
6. [Seeed Studio Grove - 6-Axis Accelerometer & Gyroscope (LSM6DS3)](https://wiki.seeedstudio.com/Grove-6-Axis_Accelerometer&Gyroscope/) — required for closed-loop gyro turns
7. [Omni Wheel](https://www.aliexpress.com/item/32954940078.html)
8. [L298NH Motor Shield](https://www.aliexpress.com/item/32801279582.html)
9. 4x [Seeed Studio Grove - Universal 4 Pin Cables](https://wiki.seeedstudio.com/Grove-Universal_4_Pin_Buckled_Cable/)
10. 2x [TT Tyre](https://www.aliexpress.com/item/1005005767062155.html)
11. 2x [TT DC plastic geared motor](https://www.aliexpress.com/item/1005004854068015.html)
12. [5x2.1 Barrel Jack](https://www.aliexpress.com/item/33024967273.html)
13. [6x AA Battery Holder with Switch](https://www.aliexpress.com/item/4001266904978.html)
14. 6x AA Batteries

> [!Note]
> This build now uses **Seeed Studio Grove sensors** plugged into a **Grove Base Shield** instead of bare ultrasonic modules. The Grove ultrasonic rangers handle front/side distance, and the Grove LSM6DS3 gyroscope provides the yaw rate used for the closed-loop 90°/180° gyro turns.

### Pin Assignments

Default GPIO map used by the `AIDriver` library (all numbers are RP2040 `GP` pins).

**Motors — via the L298N motor shield**

| Function              | Pin  |
| --------------------- | ---- |
| Right motor PWM/speed | GP3  |
| Right motor direction | GP12 |
| Right motor brake     | GP9  |
| Left motor PWM/speed  | GP11 |
| Left motor direction  | GP13 |
| Left motor brake      | GP8  |

**Sensors & display**

| Device                      | Interface       | Pins                             | I²C address |
| --------------------------- | --------------- | -------------------------------- | ----------- |
| Front ultrasonic (Grove)    | single-wire SIG | GP6                              | —           |
| Side ultrasonic (Grove)     | single-wire SIG | GP4                              | —           |
| Gyroscope LSM6DS3 (Grove)   | SoftI²C         | SDA GP16 / SCL GP17              | `0x6A`      |
| Colour sensor TCS34725      | SoftI²C + INT   | SDA GP16 / SCL GP17, **INT GP7** | `0x29`      |
| OLED display SSD1306        | SoftI²C         | SDA GP16 / SCL GP17              | `0x3C`      |
| Rescue-kit servo (optional) | PWM             | unassigned by default            | —           |

**System**

| Function                  | Pin                                                              |
| ------------------------- | ---------------------------------------------------------------- |
| Firmware recovery / reset | **GP2 → GND during boot** (restores `main.py` + `event_log.txt`) |

> [!Note]
> **GP16 / GP17** are a single shared bit-banged **SoftI²C** bus carrying three devices at once — the gyro (`0x6A`), colour sensor (`0x29`) and OLED (`0x3C`). The **colour sensor's active-low interrupt** is on **GP7**. GP7 is also the legacy HC-SR04 _echo_ pin for the front sensor, but the Grove ultrasonic ranger uses a single-wire SIG on GP6, so GP7 is free for the colour interrupt. Holding **GP2 low at boot** enters firmware recovery mode.

### Preparation

> [!Note]
> TempeHS Senior Software Engineering students have already completed these steps.

| 1                                                                                                       | 2                                                                                                                    | 3                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Using a precision knife, cut the VIN jumpers on underside of the motor shield and test with multimeter. | Cut 9v snap and solder cables to battery pack cables (red to red & black to black) then secure with small cable tie. | Fit motor shield to the headers, then build custom MicroPython firmware with integrated AIDriver libraries using the automated build process. |
| ![Cut Vin on motorshield](images/prep_1.png "Cut Vin on motorshield")                                   | ![Solider 5.5mm jack to battery pack](images/prep_2.png "Solider 5.5mm jack to battery pack")                        | ![Fit motorshield and upload firmware](images/prep_3.png "Fit motorshield and upload firmware")                                               |

### Assembly & Testing

Detailed assembly instructions including hardware testing can be found in the [Assembly_Instructions.md](Assembly_Instructions.md)

### Building Custom Firmware

Build MicroPython firmware with your custom AIDriver libraries integrated. The build system creates firmware with libraries frozen for fast loading and `main.py` on the filesystem for IDE editing.

**🚀 Quick Build (Recommended):**

```bash
cd /workspaces/AIDriver_MicroPython_Challanges/.devcontainer
./build_firmware.sh
```

**�️ Recovery Mode:** If `main.py` becomes corrupted, connect **GPIO pin 2 to ground** during boot to restore the original code.

**📖 Complete Documentation:** [Build_Custom_MicroPython_Firmware.md](Build_Custom_MicroPython_Firmware.md) - Comprehensive build guide with recovery features

### Debugging & Event Logging

- Turn on richer console output by setting `aidriver.DEBUG_AIDRIVER = True` in your `main.py`. The library prints sensor sanity checks, motor actions, and student-friendly error hints without changing behaviour.
- Every boot creates a run-once `event_log.txt` next to `main.py`. It records high-level actions (drive/rotate/brake) with human-readable speed bands and notes when speeds are too low to move or will arc left/right. Clear or delete the file to capture the next run.
- In recovery mode (GPIO2 held low during boot), both `main.py` and `event_log.txt` are restored to their defaults so students start from a clean slate.

### Challenges

Once students have assembled their robot they are to complete the programming challenges to build their skills in programming mechatronics before designing a vehicle automation project.

**🎮 Web Simulator:** Test your code before uploading to the robot using the [AIDriver Simulator](https://tempehs.github.io/AIDriver_MicroPython_Challanges/) - no hardware required!

The challenges build in three stages — each one carries its code forward to the next, so work through them in order.

**Stage 1 — PID wall following** (side sensor + control theory)

1. [Challenge 1](Challenge_1.md) - Wall Follow: P control
2. [Challenge 2](Challenge_2.md) - Wall Follow: PD control
3. [Challenge 3](Challenge_3.md) - Wall Follow: full PID

**Stage 2 — State machine maze solving** (front sensor + gyro turns)

4. [Challenge 4](Challenge_4.md) - Corner detection & your first state machine
5. [Challenge 5](Challenge_5.md) - Outside corners: the nib state
6. [Challenge 6](Challenge_6.md) - Dead ends and nibs: one machine, both turns
7. [Challenge 7](Challenge_7.md) - The full maze: capstone

**Stage 3 — Rescue sensors & competition** (colour sensor + OLED)

8. [Challenge 8](Challenge_8.md) - Ground colour detection: pause on markers
9. [Challenge 9](Challenge_9.md) - No-go zones: detect black and recover
10. [Challenge 10](Challenge_10.md) - Competition run: victims, score & the OLED

### Competition

- [Rescue Maze 2026 — Intermediate Division Summary](Rescue_Maze_Rules_Summary.md) - plain-language guide to the [RoboCup Junior Australia Rescue Maze rules](https://www.robocupjunior.org.au/rescue-maze/)

## Authors

[@benpaddlejones](https://github.com/benpaddlejones)

## License

<p xmlns:cc="http://creativecommons.org/ns#" xmlns:dct="http://purl.org/dc/terms/"><a property="dct:title" rel="cc:attributionURL" href="https://github.com/TempeHS/AIDriver_MicroPython_Challanges">AIDriver_MicroPython_Challanges</a> by <a rel="cc:attributionURL dct:creator" property="cc:attributionName" href="https://github.com/benpaddlejones">Ben Jones</a> is licensed under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/?ref=chooser-v1" target="_blank" rel="license noopener noreferrer" style="display:inline-block;">Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International<img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/cc.svg?ref=chooser-v1" alt=""><img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/by.svg?ref=chooser-v1" alt=""><img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/nc.svg?ref=chooser-v1" alt=""><img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/sa.svg?ref=chooser-v1" alt=""></a></p>
