import importlib
import sys


def reload_eventlog(tmp_path):
    """Import a fresh eventlog pointed at temp files with reset state."""
    if "eventlog" in sys.modules:
        del sys.modules["eventlog"]
    module = importlib.import_module("eventlog")
    module._LOG_PATH = str(tmp_path / "event_log.txt")  # noqa: SLF001 - test redirect
    module._LOG_PREV_PATH = str(tmp_path / "event_log_prev.txt")  # noqa: SLF001
    module._LOG_ENABLED = True  # noqa: SLF001 - ensure logging on for the test
    module._initialized = False  # noqa: SLF001 - force rotation on first event
    return module


def test_log_event_writes_fresh_header_and_message(tmp_path):
    module = reload_eventlog(tmp_path)

    module.log_event("Drive forward at normal speed")

    content = (tmp_path / "event_log.txt").read_text()
    assert "===== RUN START =====" in content
    assert "Drive forward" in content


def test_existing_log_is_rotated_to_previous(tmp_path):
    current = tmp_path / "event_log.txt"
    current.write_text("t+0.00s : earlier run\n")

    module = reload_eventlog(tmp_path)
    module.log_event("brand new run")

    prev = tmp_path / "event_log_prev.txt"
    assert prev.read_text() == "t+0.00s : earlier run\n"

    new_content = current.read_text()
    assert "===== RUN START =====" in new_content
    assert "brand new run" in new_content
    assert "earlier run" not in new_content


def test_clear_log_starts_a_clean_run(tmp_path):
    current = tmp_path / "event_log.txt"
    current.write_text("stale\n")

    module = reload_eventlog(tmp_path)
    module.log_event("ignored after rotation")
    module.clear_log()

    module.log_event("now active")

    content = current.read_text()
    assert "===== RUN START =====" in content
    assert "now active" in content
    assert not (tmp_path / "event_log_prev.txt").exists()
