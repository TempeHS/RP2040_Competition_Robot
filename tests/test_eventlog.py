import importlib
import sys
from pathlib import Path


def reload_eventlog(log_path: Path):
    if "eventlog" in sys.modules:
        del sys.modules["eventlog"]
    module = importlib.import_module("eventlog")
    module._LOG_PATH = str(log_path)  # noqa: SLF001 - adjust module path for tests
    module._initialize_state()  # noqa: SLF001 - reset state after path change
    return module


def test_log_separator_and_event_when_file_absent(tmp_path):
    log_file = tmp_path / "event_log.txt"
    module = reload_eventlog(log_file)

    module.log_separator()
    module.log_event("Drive forward at normal speed")

    content = log_file.read_text()
    assert "===== NEW RUN" in content
    assert "Drive forward" in content


def test_logging_disabled_when_existing_content(tmp_path):
    log_file = tmp_path / "event_log.txt"
    log_file.write_text("previous run\n")

    module = reload_eventlog(log_file)
    module.log_event("should not be logged")

    assert log_file.read_text() == "previous run\n"


def test_clear_log_reenables_logging(tmp_path):
    log_file = tmp_path / "event_log.txt"
    log_file.write_text("existing\n")

    module = reload_eventlog(log_file)
    module.log_event("ignored")
    module.clear_log()

    module.log_separator()
    module.log_event("now active")

    content = log_file.read_text()
    assert "===== NEW RUN" in content
    assert "now active" in content
