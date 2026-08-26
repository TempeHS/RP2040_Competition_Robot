"""Two-file rotating event logger for AIDriver RP2040.

Logs human-readable events to ``event_log.txt``. On each new run, the
previous log is rotated to ``event_log_prev.txt`` so students can compare
their current run with the previous one. Only two files are ever kept.

Files:
    event_log.txt      - Current run (written to)
    event_log_prev.txt - Previous run (read-only reference)
"""

import time

try:
    import os
except ImportError:  # MicroPython naming
    import uos as os  # type: ignore


_LOG_PATH = "event_log.txt"
_LOG_PREV_PATH = "event_log_prev.txt"
_start_ticks = time.ticks_ms()
_LOG_ENABLED = True
_initialized = False

# Every flash write on the RP2040 pauses code execution, so a control loop
# calling hold_state(0.05) would stall the board. Lines are held in RAM and
# written in batches, and an event repeated back-to-back is counted rather
# than re-written.
_BUFFER = []
_BUFFER_LIMIT = 25
_FLUSH_INTERVAL_MS = 2000
_last_flush_ticks = time.ticks_ms()
_last_message = None
_repeat_count = 0


def _rotate_logs():
    """Rotate current log to previous, then start fresh.

    This runs once on first log_event() call to ensure rotation
    happens even if the module is imported but not immediately used.
    """
    global _initialized
    if _initialized:
        return
    _initialized = True

    try:
        # Check if current log exists and has content
        has_current = False
        try:
            stat_result = os.stat(_LOG_PATH)
            if isinstance(stat_result, (tuple, list)) and len(stat_result) > 6:
                has_current = stat_result[6] > 0
            else:
                has_current = getattr(stat_result, "st_size", 0) > 0
        except OSError:
            # File doesn't exist
            has_current = False

        if has_current:
            # Remove old previous log if it exists
            try:
                os.remove(_LOG_PREV_PATH)
            except OSError:
                pass  # File didn't exist, that's fine

            # Rename current to previous
            try:
                os.rename(_LOG_PATH, _LOG_PREV_PATH)
            except OSError:
                # Rename failed - try copy and delete instead
                # (some filesystems don't support rename)
                try:
                    with open(_LOG_PATH, "r") as src:
                        content = src.read()
                    with open(_LOG_PREV_PATH, "w") as dst:
                        dst.write(content)
                    os.remove(_LOG_PATH)
                except Exception:
                    pass  # Give up on rotation, just overwrite

        # Start fresh log with header
        with open(_LOG_PATH, "w") as f:
            f.write("===== RUN START =====\n")
            f.write("t+0.00s : robot start\n")

    except Exception:
        # If anything fails, just continue - logging is best-effort
        pass


def _elapsed_s():
    """Return elapsed seconds (float) since logger import."""
    dt_ms = time.ticks_diff(time.ticks_ms(), _start_ticks)
    return dt_ms / 1000.0


def clear_log():
    """Clear both log files and reset timing."""
    global _start_ticks, _initialized, _last_message, _repeat_count
    del _BUFFER[:]
    _last_message = None
    _repeat_count = 0
    try:
        # Clear current log
        with open(_LOG_PATH, "w") as f:
            f.write("")
        # Clear previous log
        try:
            os.remove(_LOG_PREV_PATH)
        except OSError:
            pass
        _start_ticks = time.ticks_ms()
        _initialized = False  # Allow re-initialization
    except Exception:
        pass


def log_separator():
    """Write a separator and reset the logical t=0 for this run.

    Note: With two-file rotation, this is less commonly needed since
    each run starts with a fresh file. Kept for compatibility.
    """
    global _start_ticks
    if not _LOG_ENABLED:
        return
    _rotate_logs()  # Ensure initialized
    flush()  # Keep buffered events before the separator, not after
    _start_ticks = time.ticks_ms()
    try:
        with open(_LOG_PATH, "a") as f:
            f.write("\n===== SEPARATOR =====\n")
            f.write("t+0.00s : timing reset\n")
    except Exception:
        pass


def log_event(message):
    """Record a single-line, human-readable event.

    Buffered in RAM - call flush() to force it to disk immediately.
    """
    global _last_message, _repeat_count
    if not _LOG_ENABLED:
        return

    # Rotate logs on first event of each run
    _rotate_logs()

    if message == _last_message:
        _repeat_count += 1
        return

    if _repeat_count:
        _BUFFER.append("          (repeated {} more times)\n".format(_repeat_count))
        _repeat_count = 0
    _last_message = message

    _BUFFER.append("t+{:.2f}s : {}\n".format(_elapsed_s(), message))

    if len(_BUFFER) >= _BUFFER_LIMIT or (
        time.ticks_diff(time.ticks_ms(), _last_flush_ticks) >= _FLUSH_INTERVAL_MS
    ):
        flush()


def flush():
    """Write any buffered events to the log file."""
    global _last_flush_ticks
    _last_flush_ticks = time.ticks_ms()
    if not _BUFFER:
        return
    try:
        with open(_LOG_PATH, "a") as f:
            f.write("".join(_BUFFER))
    except Exception:
        pass
    del _BUFFER[:]
