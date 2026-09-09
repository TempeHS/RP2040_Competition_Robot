import ast
from pathlib import Path

import pytest

from conftest import StopChallenge

ROOT = Path(__file__).resolve().parents[1]
PROGRAMS = [
    (number, folder)
    for number in range(1, 11)
    for folder in ("starter-code", "answers")
]


@pytest.mark.parametrize(
    "filename",
    [f"app/{folder}/challenge-{number}.py" for number, folder in PROGRAMS]
    + ["project/main.py"],
)
def test_supplied_scripts_keep_tuning_and_pauses_in_config(filename, isolated_config):
    tree = ast.parse((ROOT / filename).read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            assert not node.id.isupper(), f"Local constant {node.id} belongs in config"
            assert not hasattr(isolated_config, node.id), node.id
        if (
            isinstance(node, ast.Attribute)
            and isinstance(node.value, ast.Name)
            and node.value.id == "config"
        ):
            assert isinstance(
                node.ctx, ast.Load
            ), "Runtime state must not mutate config"
            assert hasattr(isolated_config, node.attr), node.attr
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "hold_state"
        ):
            assert len(node.args) == 1
            pause = node.args[0]
            assert isinstance(pause, ast.Attribute) and isinstance(
                pause.value, ast.Name
            )
            assert pause.value.id == "config", "Pause durations belong in config"


@pytest.mark.parametrize("number,folder", PROGRAMS)
def test_import_safe_and_config_references_resolve(
    number, folder, challenge_loader, isolated_config, recording_robot
):
    module = challenge_loader(number, folder)
    assert recording_robot.calls == []
    assert callable(module.main)
    tree = ast.parse(Path(module.__file__).read_text())
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Attribute)
            and isinstance(node.value, ast.Name)
            and node.value.id == "config"
        ):
            assert isinstance(
                node.ctx, ast.Load
            ), "Programs must not write back into config"
            assert hasattr(isolated_config, node.attr), node.attr
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            assert not hasattr(isolated_config, node.id), (
                "Local tuning duplicated: " + node.id
            )


@pytest.mark.parametrize("number,folder", PROGRAMS)
def test_constructor_and_driving_consume_retained_config(
    number, folder, challenge_loader, isolated_config, recording_robot, fake_clock
):
    isolated_config.WALL_SIDE = "right"
    isolated_config.DISTANCE_SENSOR = "ultrasonic"
    isolated_config.BASE_SPEED = 185
    isolated_config.LOOP_DT = 0.07
    fake_clock.limit = 1
    module = challenge_loader(number, folder)
    with pytest.raises(StopChallenge):
        module.main()
    assert recording_robot.calls[0] == (
        "init",
        "right",
        {
            "distance_sensor": "ultrasonic",
            "min_approach_speed": 130,
            "kit_servo_pin": None,
        },
    )
    assert ("drive", 185, 185) in recording_robot.calls
    assert ("hold", 0.07) in recording_robot.calls
    assert recording_robot.calls[-1] == ("brake",)
    assert isolated_config.BASE_SPEED == 185


@pytest.mark.parametrize("number,folder", PROGRAMS)
def test_invalid_config_stops_before_hardware_init(
    number, folder, challenge_loader, isolated_config, recording_robot
):
    isolated_config.LOOP_DT = 0
    module = challenge_loader(number, folder)
    with pytest.raises(ValueError, match="LOOP_DT"):
        module.main()
    assert recording_robot.calls == []
