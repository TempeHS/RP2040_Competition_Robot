import importlib
from types import SimpleNamespace

import pytest


@pytest.fixture(name="bench")
def bench_context(monkeypatch, fake_clock, isolated_config):
    module = importlib.import_module("project.real_world_check")
    fake_clock.limit = 1000

    class Robot:
        has_gyro = True
        has_color = True
        gyro_rate = 0.0

        def __init__(self):
            self.calls = []
            self.speeds = (0, 0)
            self.cached = (0, 0)
            self.pwm = (65535, 65535)
            self.motor_right = SimpleNamespace(
                _pin_enable=SimpleNamespace(duty_u16=lambda: self.pwm[0])
            )
            self.motor_left = SimpleNamespace(
                _pin_enable=SimpleNamespace(duty_u16=lambda: self.pwm[1])
            )

        def brake(self):
            self.calls.append(("brake",))
            self.speeds = (0, 0)

        def drive(self, right, left):
            self.calls.append(("drive", right, left))
            self.speeds = (right, left)
            self.cached = (right * 257, left * 257)
            self.pwm = self.cached

        def set_motor_speeds(self, right, left):
            self.calls.append(("set_motor_speeds", right, left))
            self.cached = (right * 257, left * 257)

        def get_motor_speeds(self):
            return self.cached

        def read_distance(self):
            return 150

        def read_distance_2(self):
            return 100

        def read_color(self):
            return (40, 30, 20, 100)

        def read_gyro_z_dps(self):
            return self.gyro_rate

    robot = Robot()
    constructed = []

    def make_robot(*args, **kwargs):
        constructed.append((args, kwargs))
        return robot

    monkeypatch.setattr(module, "config", isolated_config)
    monkeypatch.setattr(module, "aidriver", SimpleNamespace(DEBUG_AIDRIVER=False))
    monkeypatch.setattr(module, "AIDriver", make_robot)
    monkeypatch.setattr(module, "hold_state", fake_clock.hold_state)
    monkeypatch.setattr(module, "ticks_ms", fake_clock.ticks_ms)
    monkeypatch.setattr(module, "ticks_diff", fake_clock.ticks_diff)
    return SimpleNamespace(
        module=module, robot=robot, clock=fake_clock, constructed=constructed
    )


def test_default_check_is_sensor_only(bench, capsys):
    assert bench.module.CHECK == "sensors"
    assert bench.module.ALLOW_MOTION is False
    assert bench.constructed == []
    bench.module.main()
    assert bench.robot.calls == [("brake",), ("brake",)]
    assert bench.clock.holds == 20
    assert "20,150,100,40,30,20,100,0.0" in capsys.readouterr().out
    assert bench.constructed == [
        (("left",), {"distance_sensor": bench.module.config.DISTANCE_SENSOR})
    ]


@pytest.mark.parametrize("check", ["wheel", "speed_change"])
def test_motion_requires_explicit_enable(bench, monkeypatch, check):
    monkeypatch.setattr(bench.module, "CHECK", check)
    bench.module.main()
    assert bench.constructed == []
    assert bench.clock.holds == 0


@pytest.mark.parametrize(
    ("wheel", "speeds"), [("right", (200, 0)), ("left", (0, 200)), ("both", (200, 200))]
)
def test_wheel_pulse_is_bounded_and_uses_shared_config(
    bench, monkeypatch, wheel, speeds
):
    monkeypatch.setattr(bench.module, "CHECK", "wheel")
    monkeypatch.setattr(bench.module, "WHEEL", wheel)
    monkeypatch.setattr(bench.module, "ALLOW_MOTION", True)
    bench.module.main()
    assert ("drive", *speeds) in bench.robot.calls
    assert bench.clock.calls == [("hold", 1)] * 3 + [("hold", 0.25)]
    assert bench.robot.speeds == (0, 0)
    assert bench.robot.calls[-1] == ("brake",)


@pytest.mark.parametrize("failure", [KeyboardInterrupt, RuntimeError])
def test_interrupted_pulse_brakes(bench, monkeypatch, failure):
    monkeypatch.setattr(bench.module, "CHECK", "wheel")
    monkeypatch.setattr(bench.module, "ALLOW_MOTION", True)

    def interrupt_pulse(seconds):
        if seconds == 0.25:
            raise failure()

    monkeypatch.setattr(bench.module, "hold_state", interrupt_pulse)
    with pytest.raises(failure):
        bench.module.main()
    assert ("drive", 200, 0) in bench.robot.calls
    assert bench.robot.speeds == (0, 0)
    assert bench.robot.calls[-1] == ("brake",)


def test_sensor_exception_still_brakes(bench, monkeypatch):
    def failed_sensor():
        raise OSError("sensor read failed")

    monkeypatch.setattr(bench.robot, "read_distance", failed_sensor)
    with pytest.raises(OSError, match="sensor read failed"):
        bench.module.main()
    assert bench.robot.calls == [("brake",), ("brake",)]


def test_manual_gyro_uses_elapsed_time_across_tick_wrap(bench, monkeypatch, capsys):
    monkeypatch.setattr(bench.module, "CHECK", "gyro")
    bench.clock.time_ms = (1 << 30) - 1000
    bench.robot.gyro_rate = 9.0
    bench.module.main()
    assert bench.clock.holds == 500
    assert bench.robot.calls == [("brake",), ("brake",)]
    assert "Integrated angle (degrees): 90.0" in capsys.readouterr().out


def test_missing_gyro_is_not_reported_as_zero_rotation(bench, monkeypatch, capsys):
    monkeypatch.setattr(bench.module, "CHECK", "gyro")
    bench.robot.has_gyro = False
    bench.module.main()
    assert bench.clock.holds == 0
    assert "Gyro missing" in capsys.readouterr().out


def test_speed_check_reports_cached_and_actual_pwm_separately(
    bench, monkeypatch, capsys
):
    monkeypatch.setattr(bench.module, "CHECK", "speed_change")
    monkeypatch.setattr(bench.module, "ALLOW_MOTION", True)
    bench.module.main()
    output = capsys.readouterr().out
    assert "After set_motor_speeds: ((33410, 33410), (51400, 51400))" in output
    assert "After drive reapplies: ((33410, 33410), (33410, 33410))" in output
    assert bench.clock.calls == [("hold", 1)] * 3 + [("hold", 0.25)] * 3
    assert bench.robot.speeds == (0, 0)
