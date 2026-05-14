import importlib
import sys


def load_aidriver():
    if "aidriver" not in sys.modules:
        importlib.import_module("aidriver")
    return sys.modules["aidriver"]


def _make_robot(monkeypatch):
    module = load_aidriver()
    messages = []

    class DummyEventLog:
        def log_event(self, message):
            messages.append(message)

    monkeypatch.setattr(module, "eventlog", DummyEventLog())
    return module, module.AIDriver("right"), messages


def test_drive_forward_low_speed_logs_warning(monkeypatch):
    _module, robot, messages = _make_robot(monkeypatch)
    robot.drive_forward(0, 0)

    assert messages
    assert any("stopped" in msg for msg in messages)


def test_drive_forward_arc_message(monkeypatch):
    _module, robot, messages = _make_robot(monkeypatch)
    robot.drive_forward(200, 150)

    assert any("arc toward the right" in msg for msg in messages)


def test_drive_forward_speed_band(monkeypatch):
    _module, robot, messages = _make_robot(monkeypatch)
    robot.drive_forward(230, 230)

    assert any("very fast" in msg for msg in messages)


def test_rotate_left_low_speed(monkeypatch):
    _module, robot, messages = _make_robot(monkeypatch)
    robot.rotate_left(50)

    assert any("may not turn" in msg for msg in messages)


def test_rotate_right_normal_speed(monkeypatch):
    _module, robot, messages = _make_robot(monkeypatch)
    robot.rotate_right(200)

    assert any("on the spot" in msg for msg in messages)
