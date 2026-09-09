"""Exercise shared config in an isolated Chromium profile against a served site."""

import argparse
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[3]
CONFIG_KEY = "aidriver_shared_config"
MAIN_KEY = "aidriver_challenge_1_code_v4"
SMOKE_MAIN = """from aidriver import AIDriver, hold_state
from config_check import validate_config
import aidriver
import config


def main():
    validate_config(config, AIDriver.MIN_MOTOR_SPEED)
    aidriver.DEBUG_AIDRIVER = config.DEBUG_AIDRIVER
    robot = AIDriver(
        config.WALL_SIDE,
        distance_sensor=config.DISTANCE_SENSOR,
        min_approach_speed=config.MIN_APPROACH_SPEED,
        kit_servo_pin=config.KIT_SERVO_PIN,
    )
    try:
        print("Config speed: " + str(config.BASE_SPEED))
        robot.drive(config.BASE_SPEED, config.BASE_SPEED)
        hold_state(config.LOOP_DT)
    finally:
        robot.brake()


if __name__ == "__main__":
    main()
"""


def saved(page, key):
    return page.evaluate("key => localStorage.getItem(key)", key)


def wait_config(page):
    page.wait_for_function(
        "typeof Editor !== 'undefined' && Editor.configSession && "
        "Editor.activeFile === 'config.py'"
    )
    expect(page.locator("#configTab")).to_have_attribute("aria-selected", "true")


def wait_main(page, number=1):
    page.wait_for_function(
        "number => typeof Editor !== 'undefined' && Editor.instance && "
        "App.currentChallenge === number && Editor.getCode().includes('import config')",
        arg=number,
    )


def download_text(page, button, output, filename):
    with page.expect_download() as event:
        page.locator(button).click()
    download = event.value
    assert download.suggested_filename == filename
    path = output / filename
    download.save_as(path)
    return path.read_text(encoding="utf-8")


def check_layout(page):
    dimensions = page.evaluate(
        "({ width: innerWidth, scroll: document.documentElement.scrollWidth })"
    )
    assert dimensions["scroll"] <= dimensions["width"], dimensions
    if dimensions["width"] < 992 and page.locator("#statusBar").count():
        status = page.locator("#statusBar").bounding_box()
        arena = page.locator("#canvasContainer").bounding_box()
        assert status and arena
        assert status["y"] >= arena["y"] + arena["height"], (status, arena)
    bounds = [
        element.bounding_box() for element in page.locator("#editorTools button").all()
    ]
    for index, first in enumerate(bounds):
        assert first and first["width"] > 0
        assert 0 <= first["x"] <= dimensions["width"] - first["width"]
        for second in bounds[index + 1 :]:
            assert second
            overlap_x = min(
                first["x"] + first["width"], second["x"] + second["width"]
            ) - max(first["x"], second["x"])
            overlap_y = min(
                first["y"] + first["height"], second["y"] + second["height"]
            ) - max(first["y"], second["y"])
            assert overlap_x <= 1 or overlap_y <= 1, (first, second)


def run_once(page, speed, source=None):
    page.locator("#btnReset").click()
    page.locator("#btnClearDebug").click()
    if source is None:
        page.locator("#btnRun").click()
    else:
        page.evaluate(
            "source => { Editor.instance.setValue(source, -1); document.getElementById('btnRun').click(); }",
            source,
        )
    expect(page.locator("#challengeStatus")).to_have_text("Completed", timeout=20000)
    expect(page.locator("#debugConsole")).to_contain_text("Config speed: " + str(speed))
    assert page.evaluate("[App.robot.rightSpeed, App.robot.leftSpeed]") == [0, 0]
    wait_config(page)


def exercise(page, base_url, output):
    default = (ROOT / "project/config.py").read_text(encoding="utf-8")
    tuned = (
        default.replace("BASE_SPEED = 200", "BASE_SPEED = 185")
        + "\n# Browser round-trip tuning\n"
    )
    page.goto(urljoin(base_url, "simulator.html?challenge=1"))
    wait_main(page)
    page.evaluate(
        "window.originalEditor = Editor.instance; window.originalRobot = App.robot"
    )
    page.locator("#configTab").click()
    wait_config(page)
    assert page.evaluate("Editor.getActiveCode()") == default
    expect(page.locator("#arenaCanvas")).to_be_visible()
    expect(page.locator("#btnRun")).to_be_visible()
    assert page.evaluate(
        "Editor.instance === window.originalEditor && App.robot === window.originalRobot"
    )
    check_layout(page)
    page.screenshot(path=str(output / "config-desktop.png"), full_page=True)
    pixels = page.locator("#arenaCanvas").evaluate(
        "canvas => { const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; "
        "const colors = new Set(); for (let index = 0; index < data.length; index += 64) "
        "colors.add(data[index] + ',' + data[index + 1] + ',' + data[index + 2]); return colors.size; }"
    )
    assert pixels > 10, "Arena canvas is blank"
    start_y = page.evaluate("App.robot.y")
    page.evaluate(
        "source => { Editor.instance.setValue(source, -1); document.getElementById('btnRun').click(); }",
        tuned,
    )
    page.wait_for_function("start => App.robot.y < start - 30", arg=start_y)
    wait_config(page)
    assert saved(page, CONFIG_KEY) == tuned
    page.locator("#mainTab").click()
    expect(page.locator("#mainTab")).to_have_attribute("aria-selected", "true")
    page.locator("#configTab").click()
    wait_config(page)
    assert page.evaluate("App.isRunning && App.robot === window.originalRobot")
    page.locator("#btnStop").click()
    assert saved(page, CONFIG_KEY) == tuned
    page.locator("#btnReset").click()
    assert saved(page, CONFIG_KEY) == tuned
    assert download_text(page, "#btnDownloadMain", output, "config.py") == tuned
    page.locator("#btnCopyCode").click()
    assert page.evaluate("navigator.clipboard.readText()") == tuned
    page.evaluate("Editor.instance.gotoLine(22, 0, true)")
    config_position = page.evaluate("Editor.instance.getCursorPosition()")
    page.locator("#mainTab").click()
    page.evaluate("Editor.instance.gotoLine(8, 0, true)")
    page.locator("#configTab").click()
    wait_config(page)
    assert page.evaluate("Editor.instance.getCursorPosition()") == config_position
    page.locator("#mainTab").click()
    expect(page.locator("#mainTab")).to_have_attribute("aria-selected", "true")
    page.screenshot(path=str(output / "simulator-desktop.png"), full_page=True)

    current_main = page.evaluate("Editor.getCode()")
    assert download_text(page, "#btnDownloadMain", output, "main.py") == current_main
    retained_main = current_main + "\n# Retained algorithm edit\n"
    page.evaluate(
        "source => { Editor.setCode(source); document.getElementById('configTab').click(); }",
        retained_main,
    )
    wait_config(page)
    assert saved(page, MAIN_KEY) == retained_main
    page.evaluate("document.querySelector('[data-challenge=\"2\"]').click()")
    wait_main(page, 2)
    wait_config(page)
    assert page.evaluate("Editor.getActiveCode()") == tuned
    assert saved(page, MAIN_KEY) == retained_main
    assert saved(page, CONFIG_KEY) == tuned
    page.evaluate("document.querySelector('[data-challenge=\"1\"]').click()")
    wait_main(page)
    assert page.evaluate("Editor.getCode()") == retained_main
    page.locator("#mainTab").click()
    page.locator("#btnResetCode").click()
    expect(page.locator("#resetCodeModal .modal-title")).to_have_text("Reset main.py?")
    page.locator("#btnConfirmReset").click()
    page.wait_for_function("!Editor.getCode().includes('Retained algorithm edit')")
    assert saved(page, CONFIG_KEY) == tuned

    page.evaluate("source => Editor.setCode(source)", SMOKE_MAIN)
    page.locator("#configTab").click()
    wait_config(page)
    run_once(page, 185)
    fresh = tuned.replace("BASE_SPEED = 185", "BASE_SPEED = 190")
    run_once(page, 190, fresh)
    page.locator("#btnReset").click()
    page.locator("#btnClearDebug").click()
    step_source = fresh.replace("BASE_SPEED = 190", "BASE_SPEED = 195")
    page.evaluate(
        "const slider = document.getElementById('speedSlider'); slider.value = '5'; slider.dispatchEvent(new Event('input'))"
    )
    page.evaluate(
        "source => { Editor.instance.setValue(source, -1); document.getElementById('btnStep').click(); }",
        step_source,
    )
    expect(page.locator("#challengeStatus")).to_have_text("Completed", timeout=30000)
    assert page.evaluate("PythonRunner.executionTrace.length") > 0
    expect(page.locator("#debugConsole")).to_contain_text("Config speed: 195")
    wait_config(page)

    page.locator("#btnReset").click()
    invalid = fresh.replace("BASE_SPEED = 190", "BASE_SPEED = 0")
    page.evaluate(
        "source => { Editor.instance.setValue(source, -1); document.getElementById('btnRun').click(); }",
        invalid,
    )
    expect(page.locator("#challengeStatus")).to_have_text("Error", timeout=20000)
    line = next(
        index + 1
        for index, text in enumerate(default.splitlines())
        if text.startswith("BASE_SPEED =")
    )
    expect(page.locator("#debugConsole")).to_contain_text(f"config.py:{line}:")
    assert page.evaluate("[App.robot.rightSpeed, App.robot.leftSpeed]") == [0, 0]
    assert (
        page.evaluate(
            "Editor.mainSession.getAnnotations().filter(item => item.type === 'error')"
        )
        == []
    )
    page.locator("#btnReset").click()
    page.locator("#btnClearDebug").click()
    page.locator("#btnStep").click()
    expect(page.locator("#challengeStatus")).to_have_text("Error", timeout=20000)
    expect(page.locator("#debugConsole")).to_contain_text(f"config.py:{line}:")
    assert page.evaluate("[App.robot.rightSpeed, App.robot.leftSpeed]") == [0, 0]
    assert page.evaluate("PythonRunner.executionTrace.length") == 0
    assert (
        page.evaluate(
            "Editor.mainSession.getAnnotations().filter(item => item.type === 'error')"
        )
        == []
    )
    page.locator("#configTab").click()
    wait_config(page)
    expect(page.locator("#configTab")).to_have_attribute(
        "title", f"config.py:{line}: " + page.evaluate("Editor.configError.message")
    )
    assert page.evaluate("Editor.configSession.getAnnotations()[0].row") == line - 1
    page.wait_for_function(
        "line => Editor.instance.getCursorPosition().row === line - 1", arg=line
    )

    page.once("dialog", lambda dialog: dialog.accept())
    page.locator("#editorFile").set_input_files(
        {"name": "config.py", "mimeType": "text/x-python", "buffer": fresh.encode()}
    )
    page.wait_for_function("source => Editor.getActiveCode() === source", arg=fresh)
    assert page.evaluate("Editor.configError") is None
    assert download_text(page, "#btnDownloadMain", output, "config.py") == fresh
    assert saved(page, MAIN_KEY) == SMOKE_MAIN
    page.locator("#btnResetCode").click()
    expect(page.locator("#resetCodeModal .modal-title")).to_have_text(
        "Reset config.py?"
    )
    page.locator("#resetCodeModal button", has_text="Cancel").click()
    assert saved(page, CONFIG_KEY) == fresh
    page.locator("#btnResetCode").click()
    page.locator("#btnConfirmReset").click()
    page.wait_for_function("source => Editor.getActiveCode() === source", arg=default)
    assert saved(page, MAIN_KEY) == SMOKE_MAIN
    page.reload()
    wait_config(page)
    wait_main(page)
    assert page.evaluate("Editor.getActiveCode()") == default
    assert saved(page, MAIN_KEY) == SMOKE_MAIN
    page.locator("#configTab").focus()
    page.keyboard.press("ArrowLeft")
    expect(page.locator("#mainTab")).to_have_attribute("aria-selected", "true")
    page.keyboard.press("ArrowRight")
    wait_config(page)

    page.set_viewport_size({"width": 390, "height": 844})
    check_layout(page)
    page.screenshot(path=str(output / "config-mobile.png"), full_page=True)
    config_bounds = page.locator("#editor").bounding_box()
    page.locator("#mainTab").click()
    expect(page.locator("#mainTab")).to_have_attribute("aria-selected", "true")
    check_layout(page)
    assert page.locator("#editor").bounding_box() == config_bounds
    page.screenshot(path=str(output / "simulator-mobile.png"), full_page=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8765/app/")
    parser.add_argument("--output", type=Path, default=ROOT / "build/browser-checks")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 1000},
            accept_downloads=True,
            permissions=["clipboard-read", "clipboard-write"],
        )
        page = context.new_page()
        page.set_default_timeout(20000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            exercise(page, args.url.rstrip("/") + "/", args.output)
            assert not errors, errors
        except Exception:
            page.screenshot(path=str(args.output / "failure.png"), full_page=True)
            print("Failed page:", page.url)
            print("Browser errors:", errors)
            for selector in ("#editorFilename", "#debugConsole"):
                if page.locator(selector).count():
                    print(page.locator(selector).inner_text())
            raise
        finally:
            browser.close()
    print(
        "PASS: in-place tabs, config-visible Run/Step, persistence, downloads, import, diagnostics, resets and responsive layout"
    )
    print("Screenshots:", args.output)


if __name__ == "__main__":
    main()
