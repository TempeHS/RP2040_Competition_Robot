"""
Competition entry point — runs the full Rescue Maze state machine.

Flash this as main.py on the robot (or run it from Thonny) for a competition
round. It builds the AIDriver, hands it to the tick-based MazeController and
loops until the 240 s round ends. The OLED (when fitted) shows the live state
and score; with no OLED attached every display call is a silent no-op, so the
exact same program runs on the bench today.

Wall side: the robot follows the LEFT wall by default — change "left" to
"right" to match how you start the robot against the maze.
"""

from aidriver import AIDriver
import aidriver
from maze_controller import MazeController

aidriver.DEBUG_AIDRIVER = False

# wall_side picks which wall to hug; kit_servo_pin stays None until the
# rescue-kit servo arrives, then set it (e.g. kit_servo_pin=10) to enable drops.
my_robot = AIDriver("left")

controller = MazeController(my_robot, run_seconds=240)

# Show a ready screen before the handler starts the round.
my_robot.display_status("READY", 0, 0)

# One tick = one short slice of work; the loop also keeps the run timer,
# watchdog and OLED serviced between movement commands.
controller.run()

# Round over — hold the final report on the OLED.
my_robot.brake()
