from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("number", range(1, 11))
def test_each_guide_has_a_two_file_transition(number):
    source = (ROOT / "docs" / f"Challenge_{number}.md").read_text(encoding="utf-8")
    for label in (
        "Keep These Settings",
        "Tune These Settings",
        "New Main Behaviour",
        "Replace Main",
    ):
        assert f"**{label}:**" in source
    assert "../project/config.py" in source
    assert f"../app/starter-code/challenge-{number}.py" in source
    assert "../app/README.md#shared-configuration" in source
    assert "Do not edit unless instructed:" not in source


def test_shared_configuration_links_and_fences_are_valid():
    path = ROOT / "app/README.md"
    source = path.read_text(encoding="utf-8")
    assert "## Shared Configuration" in source
    assert "### Physical Distance Settings" in source
    assert source.count("```") % 2 == 0
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", source):
        parsed = urlsplit(target)
        if not parsed.scheme and not parsed.netloc and parsed.path:
            assert (path.parent / unquote(parsed.path)).resolve().is_file(), target


def test_simulator_readme_describes_shared_config_and_http_serving():
    source = (ROOT / "app/README.md").read_text(encoding="utf-8")
    assert "../docs/Build_Custom_MicroPython_Firmware.md" in source
    assert "http://localhost:8000/app/simulator.html?challenge=1" in source
    assert "No server required" not in source
    assert "project/hardware_test.py" in source
    assert "placeholder sensor values" in source


def test_browser_check_is_documented_as_optional_and_repeatable():
    source = (ROOT / "app/README.md").read_text(encoding="utf-8")
    assert "### Optional Browser Check" in source
    assert "python -m pip install -r app/tests/browser/requirements.txt" in source
    assert "python -m playwright install --with-deps --only-shell chromium" in source
    assert "python app/tests/browser/shared_config.py" in source
    assert "--url http://127.0.0.1:8000/app/" in source
    assert "--url http://127.0.0.1:8000/build/shared-config-site/" in source
    assert (ROOT / "app/tests/browser/shared_config.py").is_file()
    assert "playwright" not in (ROOT / "requirements.txt").read_text(encoding="utf-8")


def test_config_guide_describes_tabs_zero_defaults_and_test_settings():
    source = (ROOT / "app/README.md").read_text(encoding="utf-8")
    assert "**main.py**" in source and "**config.py**" in source
    assert "Validate config.py" in source
    assert "Numeric settings start at zero" in source
    assert "../tests/test-config.py" in source
    assert "required variable names" in source
    assert "Python syntax and types only" in source
    assert "does not validate values" in source
    assert "zero-value rejection" not in source
    assert "usable starting values" not in source
    assert "Main & Simulator" not in source


@pytest.mark.parametrize(
    "filename", ["README.md", "Build_Custom_MicroPython_Firmware.md"]
)
def test_hardware_guides_describe_two_file_recovery(filename):
    source = (ROOT / "docs" / filename).read_text(encoding="utf-8")
    assert "config.py" in source
    assert "robot_recovery.restore_config()" in source
    assert "../app/README.md#shared-configuration" in source
    assert "AI_Driver_RP2040.uf2" not in source
