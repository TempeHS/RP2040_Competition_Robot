import ast
from pathlib import Path
import runpy
import sys
import types

import pytest

from config_check import validate_config

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(name="settings")
def settings_fixture():
    values = runpy.run_path(str(ROOT / "project/config.py"))
    return types.SimpleNamespace(
        **{name: value for name, value in values.items() if not name.startswith("__")}
    )


def test_default_config_is_valid(settings):
    assert validate_config(settings)


def test_config_contains_only_unique_constant_assignments():
    tree = ast.parse((ROOT / "project/config.py").read_text())
    names = []
    allowed = (
        ast.Assign,
        ast.Name,
        ast.Store,
        ast.Load,
        ast.Constant,
        ast.BinOp,
        ast.Mult,
        ast.Add,
        ast.Sub,
        ast.Div,
        ast.UnaryOp,
        ast.USub,
        ast.UAdd,
    )
    for statement in tree.body[1:]:
        assert isinstance(statement, ast.Assign)
        assert all(isinstance(node, allowed) for node in ast.walk(statement))
        names.append(statement.targets[0].id)
    assert len(names) == len(set(names))
    assert not set(names) & {
        "state",
        "side_integral",
        "side_previous_error",
        "started",
        "harmed",
        "unharmed",
    }


@pytest.mark.parametrize(
    "name,value",
    [
        ("BASE_SPEED", 0),
        ("BASE_SPEED", True),
        ("LOOP_DT", 0),
        ("side_Kp", float("nan")),
        ("side_Kd", float("inf")),
        ("WALL_SIDE", "middle"),
        ("DISTANCE_SENSOR", "laser"),
        ("TURN_KICK_STEPS", 1.5),
        ("DEBUG_AIDRIVER", 1),
        ("FRONT_STOP_DISTANCE", 500),
        ("MIN_APPROACH_SPEED", 255),
        ("KIT_SERVO_PIN", 26),
        ("color_red_ratio", 1.2),
    ],
)
def test_invalid_settings_are_named(settings, name, value):
    setattr(settings, name, value)
    with pytest.raises(ValueError, match="config\\." + name):
        validate_config(settings)


def test_missing_setting_is_not_silently_defaulted(settings):
    del settings.side_Kp
    with pytest.raises(ValueError, match="side_Kp is missing"):
        validate_config(settings)


def test_zero_unused_pid_terms_are_valid(settings):
    settings.side_Ki = 0
    settings.side_Kd = 0
    assert validate_config(settings)


def test_challenge_one_consumes_config_without_running_on_import(monkeypatch, settings):
    calls = []

    class StopRun(Exception):
        pass

    class Robot:
        MIN_MOTOR_SPEED = 120

        def __init__(self, side, **kwargs):
            calls.append(("init", side, kwargs))

        def read_distance_2(self):
            return 130

        def steer(self, *values):
            calls.append(("steer",) + values)

        def brake(self):
            calls.append(("brake",))

    def hold(seconds):
        calls.append(("hold", seconds))
        raise StopRun()

    settings.BASE_SPEED = 180
    settings.side_Kp = 1.2
    monkeypatch.setitem(sys.modules, "config", settings)
    monkeypatch.setitem(
        sys.modules, "aidriver", types.SimpleNamespace(AIDriver=Robot, hold_state=hold)
    )
    module = runpy.run_path(
        str(ROOT / "app/starter-code/challenge-1.py"), run_name="challenge_test"
    )
    assert calls == []
    with pytest.raises(StopRun):
        module["main"]()
    assert calls[0] == (
        "init",
        settings.WALL_SIDE,
        {
            "distance_sensor": settings.DISTANCE_SENSOR,
            "min_approach_speed": settings.MIN_APPROACH_SPEED,
            "kit_servo_pin": settings.KIT_SERVO_PIN,
        },
    )
    assert ("steer", 180, 36.0, settings.MAX_STEERING) in calls
    assert ("hold", settings.LOOP_DT) in calls
    assert calls[-1] == ("brake",)
