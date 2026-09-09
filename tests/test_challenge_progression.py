import pytest

from conftest import StopChallenge


@pytest.mark.parametrize("folder", ["starter-code", "answers"])
@pytest.mark.parametrize(
    "number,expected", [(1, [6, 12]), (2, [10, 16]), (3, [12, 22])]
)
def test_p_pd_pid_activation(
    number,
    expected,
    folder,
    challenge_loader,
    isolated_config,
    recording_robot,
    fake_clock,
):
    isolated_config.side_Kp = 0.3
    isolated_config.side_Kd = 0.2
    isolated_config.side_Ki = 0.1
    isolated_config.side_INTEGRAL_MAX = 100
    recording_robot.set_readings("side", [120, 140])
    fake_clock.limit = 2
    with pytest.raises(StopChallenge):
        challenge_loader(number, folder).main()
    steering = [call[2] for call in recording_robot.calls if call[0] == "steer"]
    assert steering == pytest.approx(expected)


@pytest.mark.parametrize("folder", ["starter-code", "answers"])
def test_integral_clamps_and_resets_on_wall_loss(
    folder, challenge_loader, isolated_config, recording_robot, fake_clock
):
    isolated_config.side_Kp = 0
    isolated_config.side_Kd = 0
    isolated_config.side_Ki = 1
    isolated_config.side_INTEGRAL_MAX = 25
    recording_robot.set_readings("side", [120, 120, -1, 105, 50])
    fake_clock.limit = 5
    with pytest.raises(StopChallenge):
        challenge_loader(3, folder).main()
    steering = [call[2] for call in recording_robot.calls if call[0] == "steer"]
    assert steering == [20, 25, 5, -25]


def test_new_run_resets_history_without_resetting_config(
    challenge_loader, isolated_config, recording_robot, fake_clock
):
    isolated_config.side_Kp = 0.3
    isolated_config.side_Kd = 0.2
    isolated_config.side_Ki = 0.1
    module = challenge_loader(3)
    for _ in range(2):
        recording_robot.calls.clear()
        recording_robot.set_readings("side", [120])
        fake_clock.limit = 1
        fake_clock.holds = 0
        with pytest.raises(StopChallenge):
            module.main()
        assert ("steer", 200, 12, 60) in recording_robot.calls
        assert isolated_config.side_Ki == 0.1


def test_fake_clock_wrap_is_deterministic(fake_clock):
    fake_clock.time_ms = 0x3FFFFFF0
    before = fake_clock.ticks_ms()
    fake_clock.hold_state(0.05)
    assert fake_clock.ticks_diff(fake_clock.ticks_ms(), before) == 50


@pytest.fixture(name="controller")
def controller_fixture(challenge_loader, recording_robot, isolated_config):
    def load(number, folder="starter-code"):
        module = challenge_loader(number, folder)
        module.my_robot = recording_robot(
            isolated_config.WALL_SIDE,
            min_approach_speed=isolated_config.MIN_APPROACH_SPEED,
        )
        return module

    return load


@pytest.mark.parametrize("folder", ["starter-code", "answers"])
@pytest.mark.parametrize("number", [4, 5, 6, 7])
def test_front_wall_takes_priority_over_lost_side(
    number, folder, controller, recording_robot, isolated_config
):
    module = controller(number, folder)
    module.side_integral = 50
    module.side_previous_error = 20
    recording_robot.set_readings("front", [isolated_config.FRONT_STOP_DISTANCE])
    recording_robot.set_readings("side", [-1])
    assert module.follow_wall() == "TURN"
    assert module.side_integral == 0
    assert module.side_previous_error == 0
    assert not any(call[0] in ("side", "drive") for call in recording_robot.calls)


@pytest.mark.parametrize("number", [4, 5, 6, 7])
def test_front_approach_uses_configured_floor_and_steering_limit(
    number, controller, recording_robot, isolated_config
):
    isolated_config.MIN_APPROACH_SPEED = 170
    isolated_config.MAX_STEERING = 20
    isolated_config.side_Kp = 10
    module = controller(number)
    recording_robot.set_readings("front", [180])
    recording_robot.set_readings("side", [130])
    assert module.follow_wall() == "FOLLOW_WALL"
    assert ("drive", 190, 150) in recording_robot.calls


@pytest.mark.parametrize("number", [4, 5, 6, 7, 9, "project"])
@pytest.mark.parametrize(
    "side,angle,right",
    [
        ("left", 90, True),
        ("left", -90, False),
        ("right", 90, False),
        ("right", -90, True),
    ],
)
def test_turn_direction_uses_wall_side(
    number, side, angle, right, controller, recording_robot, isolated_config, fake_clock
):
    isolated_config.WALL_SIDE = side
    isolated_config.TURN_KICK_SPEED = 235
    module = controller(number)
    fake_clock.limit = 1
    with pytest.raises(StopChallenge):
        module.gyro_turn_pid(angle)
    expected = ("drive", -235, 235) if right else ("drive", 235, -235)
    assert expected in recording_robot.calls


@pytest.mark.parametrize("gain,expected", [(1, 180), (100, 200)])
@pytest.mark.parametrize("folder", ["starter-code", "answers"])
def test_turn_gain_limits_timeout_and_nudge_budget(
    gain, expected, folder, controller, recording_robot, isolated_config, fake_clock
):
    isolated_config.turn_Kp = gain
    isolated_config.turn_Kd = 0
    isolated_config.MIN_TURN_SPEED = 180
    isolated_config.TURN_MAX_SPEED = 200
    isolated_config.TURN_KICK_SPEED = 230
    isolated_config.TURN_KICK_STEPS = 1
    isolated_config.TURN_TIMEOUT_MS = 40
    isolated_config.TURN_SETTLE_STEPS = 1
    isolated_config.NUDGE_SETTLE_STEPS = 1
    isolated_config.TURN_MAX_NUDGES = 2
    isolated_config.NUDGE_SPEED = 210
    isolated_config.NUDGE_MIN_MS = 5
    isolated_config.NUDGE_MAX_MS = 10
    recording_robot.set_readings("gyro", [0] * 100)
    module = controller(4, folder)
    assert module.gyro_turn_pid(90) == 0
    drives = [call for call in recording_robot.calls if call[0] == "drive"]
    assert drives[0] == ("drive", -230, 230)
    assert ("drive", -expected, expected) in drives
    assert drives.count(("drive", -210, 210)) == 2
    assert fake_clock.time_ms < 250
    assert recording_robot.calls[-1][0] == "gyro"
    assert module.my_robot.speeds == (0, 0)


@pytest.mark.parametrize("number", [5, 6, 7])
def test_nib_debounce_tracks_configured_loop_interval(
    number, controller, recording_robot, isolated_config
):
    isolated_config.LOOP_DT = 0.08
    isolated_config.NIB_CONFIRM_TIME = 0.21
    module = controller(number)
    recording_robot.set_readings("side", [-1, -1, 100, -1, -1, -1])
    assert module.follow_wall() == "FOLLOW_WALL"
    assert module.follow_wall() == "FOLLOW_WALL"
    assert module.follow_wall() == "FOLLOW_WALL"
    assert module.nib_lost_time == 0
    assert module.follow_wall() == "FOLLOW_WALL"
    assert module.follow_wall() == "FOLLOW_WALL"
    assert module.follow_wall() == "NIB_WALL"
    assert module.nib_lost_time == 0


def test_nib_wrap_uses_config_and_bounds_reacquisition(
    controller, recording_robot, isolated_config, fake_clock, monkeypatch
):
    isolated_config.NIB_FORWARD_BEFORE = 0.11
    isolated_config.NIB_FORWARD_AFTER = 0.12
    isolated_config.NIB_REACQUIRE_MS = 130
    module = controller(5)
    turns = []
    monkeypatch.setattr(module, "gyro_turn_pid", turns.append)
    recording_robot.set_readings("side", [-1] * 20)
    assert module.nib_wall() == "FOLLOW_WALL"
    assert turns == [-isolated_config.TURN_ANGLE]
    assert ("hold", 0.11) in recording_robot.calls
    assert ("hold", 0.12) in recording_robot.calls
    assert fake_clock.time_ms <= 610
    assert recording_robot.calls[-1] == ("brake",)


@pytest.mark.parametrize("folder", ["starter-code", "answers"])
def test_black_is_polled_without_a_bright_marker_interrupt(
    folder, controller, recording_robot
):
    module = controller(9, folder)
    recording_robot.set_readings("color", ["black"])
    assert module.follow_wall() == "RECOVER"
    assert not any(call[0] in ("interrupt", "drive") for call in recording_robot.calls)


@pytest.mark.parametrize("folder", ["starter-code", "answers"])
def test_reverse_clearance_is_consecutive_and_heading_gain_is_used(
    folder, controller, recording_robot, isolated_config
):
    isolated_config.REVERSE_SPEED = 177
    isolated_config.REVERSE_DT = 0.02
    isolated_config.REVERSE_CLEAR_STEPS = 2
    isolated_config.HEADING_Kp = 5
    module = controller(9, folder)
    recording_robot.set_readings("color", ["black", "none", "black", "none", "none"])
    recording_robot.set_readings("gyro", [10] * 5)
    module.reverse_off_black()
    drives = [call for call in recording_robot.calls if call[0] == "drive"]
    assert len(drives) == 5
    assert drives[0] == ("drive", -176, -178)
    assert recording_robot.calls[-1] == ("brake",)


@pytest.mark.parametrize("folder", ["starter-code", "answers"])
def test_recovery_searches_have_operation_caps(
    folder, controller, recording_robot, isolated_config
):
    isolated_config.REVERSE_MAX_STEPS = 4
    isolated_config.REVERSE_CLEAR_STEPS = 2
    isolated_config.FORWARD_MAX_STEPS = 3
    module = controller(9, folder)
    recording_robot.set_readings("color", ["black"] * 10)
    module.reverse_off_black()
    assert len([call for call in recording_robot.calls if call[0] == "drive"]) == 4
    recording_robot.calls.clear()
    recording_robot.set_readings("front", [-1] * 10)
    module.drive_forward_to_wall()
    assert len([call for call in recording_robot.calls if call[0] == "drive"]) == 3
    assert recording_robot.calls[-1] == ("brake",)


@pytest.mark.parametrize(
    "wall,reading,expected",
    [
        ("left", 200, "right"),
        ("right", 200, "left"),
        ("left", -1, "left"),
        ("right", 500, "right"),
    ],
)
def test_recovery_selects_open_side(
    wall, reading, expected, controller, recording_robot, isolated_config
):
    isolated_config.WALL_SIDE = wall
    module = controller(9)
    recording_robot.set_readings("side", [reading])
    assert module.choose_open_direction() == expected


@pytest.mark.parametrize("folder", ["starter-code", "answers"])
def test_wall_search_stops_at_configured_distance(
    folder, controller, recording_robot, isolated_config
):
    isolated_config.WALL_FOUND_DISTANCE = 240
    isolated_config.FORWARD_SPEED = 185
    module = controller(9, folder)
    recording_robot.set_readings("front", [500, 200])
    module.drive_forward_to_wall()
    assert [call for call in recording_robot.calls if call[0] == "drive"] == [
        ("drive", 185, 185)
    ]


def test_grid_compensation_uses_configured_clamp(
    controller, recording_robot, isolated_config
):
    isolated_config.GRID_ERROR_CLAMP_MM = 25
    module = controller(9)
    recording_robot.set_readings("front", [320])
    recording_robot.set_readings("side", [270])
    module.drive_forward_to_wall()
    assert not any(call[0] == "drive" for call in recording_robot.calls)


@pytest.mark.parametrize("folder", ["starter-code", "answers"])
def test_marker_edges_and_silver_start_finish_guard(
    folder, challenge_loader, recording_robot, isolated_config
):
    isolated_config.COLOR_PAUSE_TIME = 1.7
    colors = [
        "silver",
        "silver",
        "none",
        "green",
        "green",
        "none",
        "red",
        "red",
        "none",
        "silver",
    ]
    recording_robot.set_readings("interrupt", [True] * len(colors))
    recording_robot.set_readings("color", colors)
    module = challenge_loader(8, folder)
    module.main()
    assert module.started
    assert recording_robot.calls.count(("hold", 1.7)) == 2
    assert recording_robot.calls[-1] == ("brake",)


def test_victim_counts_reset_and_score_remains_an_estimate(
    challenge_loader, recording_robot, isolated_config
):
    isolated_config.POINTS_UNHARMED = 7
    isolated_config.POINTS_HARMED = 17
    isolated_config.POINTS_KIT = 3
    isolated_config.VICTIM_PAUSE_TIME = 1.25
    module = challenge_loader(10, "answers")
    colors = [
        "silver",
        "none",
        "green",
        "green",
        "none",
        "red",
        "red",
        "none",
        "silver",
    ]
    for _ in range(2):
        recording_robot.calls.clear()
        recording_robot.set_readings("interrupt", [True] * len(colors))
        recording_robot.set_readings("color", colors)
        module.main()
        assert (module.unharmed, module.harmed, module.score()) == (1, 1, 27)
        assert recording_robot.calls.count(("kit",)) == 1
        assert recording_robot.calls.count(("hold", 1.25)) == 2
        assert (
            "display",
            ("RUN COMPLETE", "Unharmed:1", "Harmed:1", "Score:27"),
            False,
        ) in recording_robot.calls


def test_default_robot_main_retains_config_and_oled_contract(
    challenge_loader, isolated_config, recording_robot, fake_clock
):
    isolated_config.BASE_SPEED = 185
    module = challenge_loader("project")
    assert recording_robot.calls == []
    fake_clock.limit = 2
    with pytest.raises(StopChallenge):
        module.main()
    assert ("drive", 185, 185) in recording_robot.calls
    assert (
        "display",
        ("FOLLOW P", "S:100", "e:0", "R185L185"),
        False,
    ) in recording_robot.calls
    assert recording_robot.calls[-1] == ("brake",)
