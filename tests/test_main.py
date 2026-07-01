import importlib
import sys


def load_main_module():
    if "project.main" in sys.modules:
        return sys.modules["project.main"]
    return importlib.import_module("project.main")


def test_main_handles_initialisation_failure(monkeypatch, capsys):
    module = load_main_module()

    class Boom(Exception):
        pass

    def failing_driver(*args, **kwargs):  # noqa: D401 - signature matches constructor
        raise Boom("hardware missing")

    monkeypatch.setattr(module, "AIDriver", failing_driver)
    monkeypatch.setattr(module, "hold_state", lambda *_args: None)

    module.main()

    captured = capsys.readouterr()
    assert "Failed to initialise AIDriver" in captured.out
    assert "aidriver.py" in captured.out


def test_main_runs_sequence(monkeypatch, capsys):
    module = load_main_module()

    class FakeRobot:
        # No optional peripherals fitted, so the gyro and colour stages are
        # skipped and the test focuses on the core movement sequence.
        has_gyro = False
        has_color = False

        def __init__(self):
            self.calls = []

        def drive_forward(self, right, left):
            self.calls.append(("drive_forward", right, left))

        def drive_backward(self, right, left):
            self.calls.append(("drive_backward", right, left))

        def rotate_right(self, speed):
            self.calls.append(("rotate_right", speed))

        def rotate_left(self, speed):
            self.calls.append(("rotate_left", speed))

        def brake(self):
            self.calls.append(("brake",))

        def read_distance(self):
            return 500

        def read_distance_2(self):
            return 500

        def show_display(self, *lines):
            # The OLED mirror is output-only; ignored by the test.
            pass

    robot = FakeRobot()

    monkeypatch.setattr(module, "AIDriver", lambda *a, **k: robot)
    monkeypatch.setattr(module, "hold_state", lambda *_args: None)

    module.main()
    captured = capsys.readouterr()

    expected_sequence = [
        ("drive_forward", 200, 200),
        ("brake",),
        ("drive_backward", 200, 200),
        ("brake",),
        ("rotate_right", 200),
        ("brake",),
        ("rotate_left", 200),
        ("brake",),
    ]

    assert robot.calls[: len(expected_sequence)] == expected_sequence
    assert "All tests" in captured.out
    assert "COMPLETE" in captured.out
