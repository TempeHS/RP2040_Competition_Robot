# Tempe High School RP2040 Competition Robot

This project is a low-cost differential-drive robot platform built for students learning mechatronics and embedded programming. It combines practical robot assembly with staged MicroPython challenges, from basic wall-following PID to competition-style rescue behavior.

## Quick Links

- Web Simulator: https://tempehs.github.io/AIDriver_MicroPython_Challanges/
- MicroPython Lab: https://lab-micropython.arduino.cc/

## Build the Robot

### Components

All parts are available from common suppliers (for example, AliExpress), with chassis parts made by laser cutting and 3D printing.

1. [Laser-cut chassis file](manufacturing_files/LC_Faculty_AIDriverGluelessv2_PP.pdf) and 3 mm plywood
2. 3D-printed components (see [manufacturing_files](manufacturing_files))
3. [RP2040 Uno development board](https://www.aliexpress.com/item/1005009315359179.html)
4. [Seeed Grove Base Shield V2.0 (UNO form factor)](https://wiki.seeedstudio.com/Base_Shield_V2/)
5. 2x [Seeed Grove Ultrasonic Ranger](https://wiki.seeedstudio.com/Grove-Ultrasonic_Ranger/) (front and side, default distance backend)
6. 2x VL53L0X ToF distance sensors (optional alternative distance backend)
7. [Seeed Grove LSM6DS3 6-axis accelerometer + gyroscope](https://wiki.seeedstudio.com/Grove-6-Axis_Accelerometer&Gyroscope/)
8. [Omni wheel](https://www.aliexpress.com/item/32954940078.html)
9. [L298N(H) motor shield](https://www.aliexpress.com/item/32801279582.html)
10. 4x [Seeed Grove 4-pin cables](https://wiki.seeedstudio.com/Grove-Universal_4_Pin_Buckled_Cable/)
11. 2x [TT tyres](https://www.aliexpress.com/item/1005005767062155.html)
12. 2x [TT DC geared motors](https://www.aliexpress.com/item/1005004854068015.html)
13. [5.5x2.1 mm barrel jack](https://www.aliexpress.com/item/33024967273.html)
14. [6x AA battery holder with switch](https://www.aliexpress.com/item/4001266904978.html)
15. 6x AA batteries

> [!NOTE]
> This build uses Grove sensors on a Grove Base Shield. The default classroom path uses Grove ultrasonic sensors for front/side distance and an LSM6DS3 for closed-loop gyro turns.

Distance backend choice is simple: use 2x Ultrasonic sensors OR 2x ToF sensors.

## Pin Assignments

Default GPIO map used by `AIDriver` (all pin numbers are RP2040 `GP` values).

### Motors (L298N Shield)

| Function              | Pin  |
| --------------------- | ---- |
| Right motor PWM/speed | GP3  |
| Right motor direction | GP12 |
| Right motor brake     | GP9  |
| Left motor PWM/speed  | GP11 |
| Left motor direction  | GP13 |
| Left motor brake      | GP8  |

### Distance Sensors (Choose One Backend: Ultrasonic OR ToF)

| Mode                       | Front Sensor Pins  | Side Sensor Pins | Notes                                                 |
| -------------------------- | ------------------ | ---------------- | ----------------------------------------------------- |
| Ultrasonic (Grove default) | GP6 SIG            | GP4 SIG          | Single-wire Grove interface                           |
| ToF (VL53L0X)              | GP27 SDA, GP26 SCL | GP6 SDA, GP5 SCL | Separate SoftI2C buses; both sensors use address 0x29 |

> [!NOTE]
> In ToF mode, the front and side VL53L0X sensors are on separate SoftI2C buses, so both can use 0x29 without an address conflict.

### Shared Sensors and Display (Both Modes)

| Device                      | Interface     | Pins                        | I2C Address |
| --------------------------- | ------------- | --------------------------- | ----------- |
| LSM6DS3 gyroscope           | SoftI2C       | SDA GP16, SCL GP17          | 0x6A        |
| TCS34725 color sensor       | SoftI2C + INT | SDA GP16, SCL GP17, INT GP7 | 0x29        |
| SSD1306 OLED display        | SoftI2C       | SDA GP16, SCL GP17          | 0x3C        |
| Rescue-kit servo (optional) | PWM           | Unassigned by default       | -           |

### System Pins

| Function                | Pin                    |
| ----------------------- | ---------------------- |
| Firmware recovery/reset | GP2 -> GND during boot |
| Onboard status LED      | GP25                   |

> [!NOTE]
> GP16 and GP17 form one shared bit-banged SoftI2C bus for the gyro (0x6A), color sensor (0x29), and OLED (0x3C). GP7 is used for the color sensor interrupt line.

## Preparation

> [!NOTE]
> TempeHS senior software engineering students may have already completed these steps.

| Step 1                                                                             | Step 2                                                                                                       | Step 3                                                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Cut VIN jumpers on the underside of the motor shield and verify with a multimeter. | Solder the battery pack leads to the barrel jack leads (red-red, black-black), then secure with a cable tie. | Fit the motor shield to headers, then build and flash custom MicroPython firmware with integrated AIDriver libraries. |
| ![Cut VIN on motorshield](images/prep_1.png)                                       | ![Solder barrel jack to battery pack](images/prep_2.png)                                                     | ![Fit motor shield and upload firmware](images/prep_3.png)                                                            |

## Assembly and Hardware Testing

See [Assembly_Instructions.md](Assembly_Instructions.md) for full assembly and hardware test steps.

## Build Custom Firmware

The build system produces firmware with AIDriver libraries frozen for fast import while keeping `main.py` on the device filesystem for easy IDE editing.

Quick build:

```bash
cd /workspaces/AIDriver_MicroPython_Challanges/.devcontainer
./build_firmware.sh
```

Recovery mode:

- If `main.py` is corrupted, hold GPIO2 low (connect GP2 to GND) during boot.
- Recovery restores default `main.py` and clears `event_log.txt`.

Full guide: [Build_Custom_MicroPython_Firmware.md](Build_Custom_MicroPython_Firmware.md)

## Debugging and Event Logging

- Set `aidriver.DEBUG_AIDRIVER = True` in `main.py` for richer runtime logs.
- The firmware creates a run-scoped `event_log.txt` next to `main.py`.
- In recovery mode (GPIO2 held low at boot), both `main.py` and `event_log.txt` are reset to defaults.

## Challenges

Students complete challenge stages in order, carrying code forward each time.

Stage 1: PID wall following

1. [Challenge_1.md](Challenge_1.md) - P control
2. [Challenge_2.md](Challenge_2.md) - PD control
3. [Challenge_3.md](Challenge_3.md) - Full PID

Stage 2: State-machine maze solving

1. [Challenge_4.md](Challenge_4.md) - Corner detection and first state machine
2. [Challenge_5.md](Challenge_5.md) - Outside corners (nib state)
3. [Challenge_6.md](Challenge_6.md) - Dead ends and nibs in one machine
4. [Challenge_7.md](Challenge_7.md) - Full maze capstone

Stage 3: Rescue sensors and competition behavior

1. [Challenge_8.md](Challenge_8.md) - Ground color detection
2. [Challenge_9.md](Challenge_9.md) - No-go zones and recovery
3. [Challenge_10.md](Challenge_10.md) - Competition run, victims, score, OLED

Use the web simulator to test before uploading to hardware:
https://tempehs.github.io/AIDriver_MicroPython_Challanges/

## Competition

- [Rescue_Maze_Rules_Summary.md](Rescue_Maze_Rules_Summary.md): plain-language guide to the RoboCup Junior Australia Rescue Maze rules.

## Author

- [@benpaddlejones](https://github.com/benpaddlejones)

## License

Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0).
