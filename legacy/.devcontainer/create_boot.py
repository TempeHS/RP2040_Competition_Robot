#!/usr/bin/env python3
"""Generate frozen provisioning helpers from the editable main and config files."""

import sys
import os


def create_boot_with_main(
    main_py_path, boot_py_path, boot_backup_path, config_py_path=None
):
    """Generate boot provisioning and explicit, non-destructive config recovery."""
    if config_py_path is None:
        config_py_path = os.path.join(os.path.dirname(main_py_path), "config.py")
    for path in (main_py_path, config_py_path):
        if not os.path.isfile(path):
            print("Error: required filesystem source not found:", path)
            return False

    if not os.path.exists(boot_backup_path):
        with open(boot_py_path, "r", encoding="utf-8") as source, open(
            boot_backup_path, "w", encoding="utf-8"
        ) as backup:
            backup.write(source.read())
    with open(main_py_path, "r", encoding="utf-8") as source:
        main_content = source.read()
    with open(config_py_path, "r", encoding="utf-8") as source:
        config_content = source.read()
    with open(boot_backup_path, "r", encoding="utf-8") as source:
        original_boot = source.read()

    recovery_content = (
        '"""Bundled defaults. Restore config only by explicit request at the REPL."""\n'
    )
    recovery_content += "import os\n\nMAIN_PY_CONTENT = " + repr(main_content)
    recovery_content += "\nCONFIG_PY_CONTENT = " + repr(config_content) + "\n\n"
    recovery_content += '''
def _exists(path):
    try:
        os.stat(path)
        return True
    except OSError:
        return False


def _write(path, content):
    temporary = path + ".new"
    with open(temporary, "w") as output:
        output.write(content)
    os.rename(temporary, path)


def provision_files():
    """Create missing files only; never import or rewrite saved configuration."""
    for path, content in (("config.py", CONFIG_PY_CONTENT), ("main.py", MAIN_PY_CONTENT)):
        if not _exists(path):
            _write(path, content)
            print("Created editable", path)


def restore_main():
    """Restore the bundled main without changing configuration."""
    _write("main.py", MAIN_PY_CONTENT)
    print("Restored main.py; config.py preserved")


def restore_config():
    """Back up existing tuning before explicitly restoring the bundled config."""
    backup = None
    with open("config.py.new", "w") as output:
        output.write(CONFIG_PY_CONTENT)
    if _exists("config.py"):
        backup = "config.py.bak"
        suffix = 0
        while _exists(backup):
            suffix += 1
            backup = "config.py.bak." + str(suffix)
        os.rename("config.py", backup)
    os.rename("config.py.new", "config.py")
    print("Restored config.py; previous file:", backup, "- restart the robot")
    return backup
'''
    recovery_path = os.path.join(os.path.dirname(boot_py_path), "robot_recovery.py")
    with open(recovery_path, "w", encoding="utf-8") as output:
        output.write(recovery_content)

    boot_content = original_boot + """

import gc
from machine import Pin
import robot_recovery

try:
    import eventlog
except Exception:
    eventlog = None


def check_recovery_mode():
    try:
        return Pin(2, Pin.IN, Pin.PULL_UP).value() == 0
    except Exception:
        return False


try:
    robot_recovery.provision_files()
    if check_recovery_mode():
        robot_recovery.restore_main()
        if eventlog is not None:
            eventlog.clear_log()
except Exception as error:
    print("Provisioning warning:", error)

if eventlog is not None:
    try:
        eventlog.log_separator()
    except Exception:
        pass

gc.collect()
"""
    with open(boot_py_path, "w", encoding="utf-8") as output:
        output.write(boot_content)
    print("Created boot provisioning for editable main.py and config.py")
    return True


if __name__ == "__main__":
    if len(sys.argv) not in (4, 5):
        print(
            "Usage: create_boot.py <main_py_path> <boot_py_path> <boot_backup_path> [config_py_path]"
        )
        sys.exit(1)

    main_py_path = sys.argv[1]
    boot_py_path = sys.argv[2]
    boot_backup_path = sys.argv[3]

    config_py_path = sys.argv[4] if len(sys.argv) == 5 else None
    success = create_boot_with_main(
        main_py_path, boot_py_path, boot_backup_path, config_py_path
    )
    sys.exit(0 if success else 1)
