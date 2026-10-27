"""Hardware sanity test for the AIDriver robot.

Runs a short sequence of movements and sensor readings, mirroring each stage to
the console AND the SSD1306 OLED so you can watch the code and the robot move in
step. Most low-level detail is also reported via the AIDriver debug logger.

On the robot this file is the boot script, so main() runs automatically. The
body lives in main() (instead of running at import) so the host tests in
tests/test_main.py can import it and drive main() with a fake robot.
"""

from aidriver import AIDriver, hold_state
import aidriver

aidriver.DEBUG_AIDRIVER = True


def main():
    """Run the full hardware sanity sequence once."""
    print("Initialising AIDriver hardware test...")

    try:
        robot = AIDriver(
            "left"
        )  # wall_side required; change to "right" if following right wall
    except Exception as exc:
        print("Failed to initialise AIDriver:", exc)
        print("Check that 'aidriver.py' is in the 'lib' folder on the device.")
        return

    def announce(*lines):
        """Show the current test stage on the console AND the OLED at the same time.

        This is what lets you *watch the code and the robot together*: every
        stage prints its banner and mirrors it on the SSD1306 OLED, so the
        screen always names the action the robot is performing right now. Each
        OLED line shows up to 16 characters and only the first four lines are
        sent to the display. If no OLED is fitted, show_display() is a harmless
        no-op and only the console prints.
        """
        for line in lines:
            print(line)
        robot.show_display(*lines[:4])

    announce("AIDriver OK", "Self test", "Starting in 3s")
    hold_state(3)

    # Test 1: Drive Forward
    announce("Test 1 of 7", "Drive FORWARD")
    robot.drive_forward(200, 200)
    hold_state(2)
    robot.brake()
    announce("Test 1 of 7", "Stopped")
    hold_state(1)

    # Test 2: Drive Backward
    announce("Test 2 of 7", "Drive BACKWARD")
    robot.drive_backward(200, 200)
    hold_state(2)
    robot.brake()
    announce("Test 2 of 7", "Stopped")
    hold_state(1)

    # Test 3: Rotate Right
    announce("Test 3 of 7", "Rotate RIGHT")
    robot.rotate_right(200)
    hold_state(2)
    robot.brake()
    announce("Test 3 of 7", "Stopped")
    hold_state(1)

    # Test 4: Rotate Left
    announce("Test 4 of 7", "Rotate LEFT")
    robot.rotate_left(200)
    hold_state(2)
    robot.brake()
    announce("Test 4 of 7", "Stopped")
    hold_state(1)

    # Test 5: Gyro closed-loop turns (90 degrees each way)
    if robot.has_gyro:
        announce("Test 5 of 7", "Gyro turn", "RIGHT 90 deg")
        turned = robot.turn_90("right")
        announce("Test 5 of 7", "Right done", "turned " + str(round(turned, 1)))
        hold_state(1)
        announce("Test 5 of 7", "Gyro turn", "LEFT 90 deg")
        turned = robot.turn_90("left")
        announce("Test 5 of 7", "Left done", "turned " + str(round(turned, 1)))
        hold_state(1)
    else:
        announce("Test 5 of 7", "Gyro SKIPPED", "no IMU found")
        hold_state(1)

    # Test 6: Ultrasonic Sensors
    announce("Test 6 of 7", "Ultrasonic", "Front + side")
    for i in range(5):
        distance_1 = robot.read_distance()
        distance_2 = robot.read_distance_2()
        announce(
            "Test 6 of 7",
            "Reading " + str(i + 1) + "/5",
            "S1: " + str(distance_1) + " mm",
            "S2: " + str(distance_2) + " mm",
        )
        hold_state(0.5)

    # Test 7: Colour sensor (TCS34725)
    if robot.has_color:
        announce("Test 7 of 7", "Colour sensor", "Place a marker")
        for i in range(5):
            r, g, b, c = robot.read_color()
            name = robot.classify_color()
            print("Reading", i + 1, "- R:", r, "G:", g, "B:", b, "C:", c, "->", name)
            robot.show_display(
                "Test 7 of 7",
                "Reading " + str(i + 1) + "/5",
                "Clear: " + str(c),
                "Colour: " + name,
            )
            hold_state(0.5)
        print("  (classify_color uses tunable thresholds — see Challenge 8)")
    else:
        announce("Test 7 of 7", "Colour SKIPPED", "no sensor found")
        hold_state(1)

    announce("All tests", "COMPLETE")


if __name__ == "__main__":
    main()
