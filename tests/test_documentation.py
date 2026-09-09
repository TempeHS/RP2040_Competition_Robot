from pathlib import Path
import re

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
    assert "Shared_Config_Workflow.md" in source
    assert "Do not edit unless instructed:" not in source


def test_shared_workflow_links_and_fences_are_valid():
    path = ROOT / "docs/Shared_Config_Workflow.md"
    source = path.read_text(encoding="utf-8")
    assert source.count("```") % 2 == 0
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", source):
        assert (path.parent / target).resolve().is_file(), target


def test_simulator_readme_describes_shared_config_and_http_serving():
    source = (ROOT / "app/README.md").read_text(encoding="utf-8")
    assert "Shared_Config_Workflow.md" in source
    assert "http://localhost:8000/app/simulator.html?challenge=1" in source
    assert "No server required" not in source
    assert "project/hardware_test.py" in source
    assert "placeholder sensor values" in source


@pytest.mark.parametrize(
    "filename", ["README.md", "Build_Custom_MicroPython_Firmware.md"]
)
def test_hardware_guides_describe_two_file_recovery(filename):
    source = (ROOT / "docs" / filename).read_text(encoding="utf-8")
    assert "config.py" in source
    assert "robot_recovery.restore_config()" in source
    assert "Shared_Config_Workflow.md" in source
    assert "AI_Driver_RP2040.uf2" not in source
