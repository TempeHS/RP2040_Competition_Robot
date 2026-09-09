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
        "typeof ConfigEditor !== 'undefined' && ConfigEditor.instance && "
        "document.getElementById('configResult').textContent.length > 0"
    )


def wait_main(page, number=1):
    page.wait_for_function(
        "number => typeof Editor !== 'undefined' && Editor.instance && "
        "App.currentChallenge === number && Editor.getCode().includes('import config')",
        arg=number,
    )


def return_to_main_with_edit(page, source):
    page.evaluate(
        "source => { ConfigEditor.instance.setValue(source, -1); "
        "document.getElementById('backToMain').click(); }",
        source,
    )
    page.wait_for_url("**/simulator.html?challenge=1")
    wait_main(page)


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
    if page.locator(".config-toolbar").count():
        assert (
            page.locator(".config-toolbar").evaluate(
                "element => getComputedStyle(element).display"
            )
            == "flex"
        )
        elements = page.locator(".config-toolbar > *:not(.visually-hidden)")
        bounds = [element.bounding_box() for element in elements.all()]
        for index, first in enumerate(bounds):
            assert first and first["width"] > 0
            for second in bounds[index + 1 :]:
                assert second
                overlap_x = min(
                    first["x"] + first["width"], second["x"] + second["width"]
                ) - max(first["x"], second["x"])
                overlap_y = min(
                    first["y"] + first["height"], second["y"] + second["height"]
                ) - max(first["y"], second["y"])
                assert overlap_x <= 1 or overlap_y <= 1, (first, second)


def run_once(page, speed):
    page.locator("#btnReset").click()
    page.locator("#btnClearDebug").click()
    page.locator("#btnRun").click()
    expect(page.locator("#challengeStatus")).to_have_text("Completed", timeout=20000)
    expect(page.locator("#debugConsole")).to_contain_text("Config speed: " + str(speed))
    assert page.evaluate("[App.robot.rightSpeed, App.robot.leftSpeed]") == [0, 0]


def exercise(page, base_url, output):
    default = (ROOT / "project/config.py").read_text(encoding="utf-8")
    tuned = (
        default.replace("BASE_SPEED = 200", "BASE_SPEED = 185")
        + "\n# Browser round-trip tuning\n"
    )
    page.goto(urljoin(base_url, "config.html?challenge=1"))
    wait_config(page)
    expect(page.locator("#configResult")).to_have_text("Configuration valid")
    assert page.evaluate("ConfigEditor.instance.getValue()") == default
    check_layout(page)
    page.screenshot(path=str(output / "config-desktop.png"), full_page=True)
    page.locator("#foldConfig").click()
    assert page.evaluate("ConfigEditor.instance.session.getAllFolds().length") >= 12
    page.locator("#expandConfig").click()
    assert page.evaluate("ConfigEditor.instance.session.getAllFolds().length") == 0
    page.locator("#configSection").select_option(label="Wall PID")
    assert page.evaluate(
        "ConfigEditor.instance.getCursorPosition().row"
    ) == default.splitlines().index("# Wall PID")

    return_to_main_with_edit(page, tuned)
    assert saved(page, CONFIG_KEY) == tuned
    check_layout(page)
    pixels = page.locator("#arenaCanvas").evaluate(
        "canvas => { const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; "
        "const colors = new Set(); for (let index = 0; index < data.length; index += 64) "
        "colors.add(data[index] + ',' + data[index + 1] + ',' + data[index + 2]); return colors.size; }"
    )
    assert pixels > 10, "Arena canvas is blank"
    page.screenshot(path=str(output / "simulator-desktop.png"), full_page=True)
    start_y = page.evaluate("App.robot.y")
    page.locator("#btnRun").click()
    page.wait_for_function("start => App.robot.y < start - 30", arg=start_y)
    page.locator("#btnStop").click()
    assert saved(page, CONFIG_KEY) == tuned
    page.locator("#btnReset").click()
    assert saved(page, CONFIG_KEY) == tuned

    current_main = page.evaluate("Editor.getCode()")
    assert download_text(page, "#btnDownloadMain", output, "main.py") == current_main
    retained_main = current_main + "\n# Retained algorithm edit\n"
    page.evaluate(
        "source => { Editor.setCode(source); document.querySelector('[data-challenge=\"2\"]').click(); }",
        retained_main,
    )
    wait_main(page, 2)
    assert saved(page, MAIN_KEY) == retained_main
    assert saved(page, CONFIG_KEY) == tuned
    page.evaluate("document.querySelector('[data-challenge=\"1\"]').click()")
    wait_main(page)
    assert page.evaluate("Editor.getCode()") == retained_main
    page.locator("#btnResetCode").click()
    page.locator("#btnConfirmReset").click()
    page.wait_for_function("!Editor.getCode().includes('Retained algorithm edit')")
    assert saved(page, CONFIG_KEY) == tuned

    page.evaluate("source => Editor.setCode(source)", SMOKE_MAIN)
    run_once(page, 185)
    page.locator("#configLink").click()
    wait_config(page)
    fresh = tuned.replace("BASE_SPEED = 185", "BASE_SPEED = 190")
    return_to_main_with_edit(page, fresh)
    run_once(page, 190)
    page.locator("#btnReset").click()
    page.evaluate(
        "const slider = document.getElementById('speedSlider'); slider.value = '5'; slider.dispatchEvent(new Event('input'))"
    )
    page.locator("#btnStep").click()
    expect(page.locator("#challengeStatus")).to_have_text("Completed", timeout=30000)
    assert page.evaluate("PythonRunner.executionTrace.length") > 0
    expect(page.locator("#debugConsole")).to_contain_text("Config speed: 190")

    page.locator("#configLink").click()
    wait_config(page)
    invalid = fresh.replace("BASE_SPEED = 190", "BASE_SPEED = 0")
    return_to_main_with_edit(page, invalid)
    page.locator("#btnRun").click()
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
            "Editor.instance.session.getAnnotations().filter(item => item.type === 'error')"
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
            "Editor.instance.session.getAnnotations().filter(item => item.type === 'error')"
        )
        == []
    )
    page.locator("#configLink").click()
    wait_config(page)
    expect(page.locator("#configResult")).to_contain_text(f"config.py:{line}:")
    page.wait_for_function(
        "line => ConfigEditor.instance.getCursorPosition().row === line - 1", arg=line
    )

    page.once("dialog", lambda dialog: dialog.accept())
    page.locator("#configFile").set_input_files(
        {"name": "config.py", "mimeType": "text/x-python", "buffer": fresh.encode()}
    )
    expect(page.locator("#configResult")).to_have_text("Configuration valid")
    assert page.evaluate("ConfigEditor.instance.getValue()") == fresh
    assert download_text(page, "#downloadConfig", output, "config.py") == fresh
    assert saved(page, MAIN_KEY) == SMOKE_MAIN
    page.locator("#resetConfig").click()
    page.locator("#resetConfigModal button", has_text="Cancel").click()
    assert saved(page, CONFIG_KEY) == fresh
    page.locator("#resetConfig").click()
    page.locator("#confirmResetConfig").click()
    expect(page.locator("#configResult")).to_have_text("Configuration valid")
    page.reload()
    wait_config(page)
    assert page.evaluate("ConfigEditor.instance.getValue()") == default
    assert saved(page, MAIN_KEY) == SMOKE_MAIN

    page.set_viewport_size({"width": 390, "height": 844})
    check_layout(page)
    page.screenshot(path=str(output / "config-mobile.png"), full_page=True)
    page.locator("#backToMain").click()
    wait_main(page)
    check_layout(page)
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
            viewport={"width": 1440, "height": 1000}, accept_downloads=True
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
            for selector in ("#configResult", "#debugConsole"):
                if page.locator(selector).count():
                    print(page.locator(selector).inner_text())
            raise
        finally:
            browser.close()
    print(
        "PASS: shared config persistence, Run/Step, downloads, import, diagnostics, resets and responsive layout"
    )
    print("Screenshots:", args.output)


if __name__ == "__main__":
    main()
