import importlib.util
from pathlib import Path
import shlex
import subprocess
import sys
import types

import pytest

ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(name="firmware")
def firmware_fixture(tmp_path, monkeypatch):
    sources = tmp_path / "sources"
    modules = tmp_path / "modules"
    filesystem = tmp_path / "filesystem"
    for directory in (sources, modules, filesystem):
        directory.mkdir()
    main_source = '"""Default with quotes: \' and \\"."""\nimport config\nspeed = config.BASE_SPEED\n'
    config_source = (ROOT / "project/config.py").read_text()
    (sources / "main.py").write_text(main_source)
    (sources / "config.py").write_text(config_source)
    boot = modules / "_boot.py"
    boot.write_text("original_boot = True\n")
    generator = load_module("boot_generator", ROOT / ".devcontainer/create_boot.py")
    assert generator.create_boot_with_main(
        str(sources / "main.py"), str(boot), str(modules / "_boot_original.py")
    )
    recovery = load_module("robot_recovery", modules / "robot_recovery.py")
    monkeypatch.setitem(sys.modules, "robot_recovery", recovery)
    monkeypatch.setitem(
        sys.modules,
        "eventlog",
        types.SimpleNamespace(clear_log=lambda: None, log_separator=lambda: None),
    )
    monkeypatch.chdir(filesystem)

    def run_boot(recover=False):
        class Pin:
            IN = 0
            PULL_UP = 1

            def __init__(self, *_args):
                pass

            def value(self):
                return 0 if recover else 1

        monkeypatch.setitem(sys.modules, "machine", types.SimpleNamespace(Pin=Pin))
        return load_module("boot_test", boot)

    return types.SimpleNamespace(
        run_boot=run_boot,
        recovery=recovery,
        filesystem=filesystem,
        generator=generator,
        sources=sources,
        modules=modules,
        main_source=main_source,
        config_source=config_source,
    )


def test_first_boot_provisions_both_editable_files(firmware):
    firmware.run_boot()
    assert Path("main.py").read_text() == firmware.main_source
    assert Path("config.py").read_text() == firmware.config_source
    assert load_module("provisioned_main", Path("main.py")).speed == 0


def test_normal_boot_preserves_existing_tuning_and_main(firmware):
    Path("main.py").write_text("# student's algorithm\n")
    Path("config.py").write_text("# student's tuning\nBASE_SPEED = 181\n")
    firmware.run_boot()
    assert Path("main.py").read_text() == "# student's algorithm\n"
    assert Path("config.py").read_text() == "# student's tuning\nBASE_SPEED = 181\n"


def test_missing_config_is_created_without_replacing_main(firmware):
    Path("main.py").write_text("# keep main\n")
    firmware.run_boot()
    assert Path("main.py").read_text() == "# keep main\n"
    assert Path("config.py").read_text() == firmware.config_source


def test_gpio_main_recovery_preserves_configuration(firmware):
    Path("main.py").write_text("# custom main\n")
    Path("config.py").write_text("# tuned config\nBASE_SPEED = 182\n")
    firmware.run_boot(recover=True)
    assert Path("main.py").read_text() == firmware.main_source
    assert Path("config.py").read_text() == "# tuned config\nBASE_SPEED = 182\n"


def test_corrupt_config_is_only_replaced_explicitly_and_backups_are_unique(firmware):
    original = "BASE_SPEED = (\n"
    Path("config.py").write_text(original)
    firmware.run_boot(recover=True)
    assert Path("config.py").read_text() == original
    assert firmware.recovery.restore_config() == "config.py.bak"
    assert Path("config.py.bak").read_text() == original
    assert Path("config.py").read_text() == firmware.config_source
    assert firmware.recovery.restore_config() == "config.py.bak.1"
    assert Path("config.py.bak").read_text() == original
    assert Path("config.py.bak.1").read_text() == firmware.config_source


def test_edited_filesystem_config_is_loaded(firmware, monkeypatch):
    firmware.run_boot()
    source = firmware.config_source.replace("BASE_SPEED = 0", "BASE_SPEED = 187")
    Path("config.py").write_text(source)
    config = load_module("config", Path("config.py"))
    monkeypatch.setitem(sys.modules, "config", config)
    assert load_module("edited_main", Path("main.py")).speed == 187


def test_regeneration_preserves_original_boot_once(firmware):
    assert firmware.generator.create_boot_with_main(
        str(firmware.sources / "main.py"),
        str(firmware.modules / "_boot.py"),
        str(firmware.modules / "_boot_original.py"),
    )
    assert (
        firmware.modules / "_boot_original.py"
    ).read_text() == "original_boot = True\n"
    assert (firmware.modules / "_boot.py").read_text().count(
        "original_boot = True"
    ) == 1


def test_frozen_staging_excludes_main_and_config_and_cleans_stale_bytecode(tmp_path):
    project = tmp_path / "project"
    library = project / "lib"
    modules = tmp_path / "modules"
    build = tmp_path / "build"
    frozen = build / "build-RPI_PICO/frozen_mpy"
    for directory in (library, modules, frozen):
        directory.mkdir(parents=True)
    for name in ("main", "config"):
        (project / (name + ".py")).write_text("value = 1\n")
        (modules / (name + ".py")).write_text("old = True\n")
        (frozen / (name + ".mpy")).write_bytes(b"old")
    (library / "config_check.py").write_text(
        "def validate_config(config):\n    return True\n"
    )
    script = "\n".join(
        [
            "source " + shlex.quote(str(ROOT / ".devcontainer/common_functions.sh")),
            "PROJECT_DIR=" + shlex.quote(str(project)),
            "MODULES_DIR=" + shlex.quote(str(modules)),
            "BUILD_DIR=" + shlex.quote(str(build)),
            "CUSTOM_PACKAGES=()",
            "copy_custom_modules",
        ]
    )
    subprocess.run(["bash"], input=script, text=True, capture_output=True, check=True)
    for name in ("main", "config"):
        assert not (modules / (name + ".py")).exists()
        assert not (frozen / (name + ".mpy")).exists()
        assert (build / "build-RPI_PICO" / (name + ".py")).read_text() == "value = 1\n"
    assert (modules / "config_check.py").exists()
