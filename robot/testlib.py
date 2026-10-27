"""Helpers shared by the stage tests: prompts, stats and a PASS/FAIL tally."""

from time import ticks_ms, ticks_diff

results = []


def step(title):
    print("\n=== " + title + " ===")


def wait(prompt):
    input(">> " + prompt + "  [Enter]")


def ask(question):
    """Ask the tester to confirm what they saw. Records PASS/FAIL."""
    ok = input("?? " + question + " [y/n] ").strip().lower().startswith("y")
    return record(ok, question)


def record(ok, label):
    results.append((ok, label))
    print(("PASS  " if ok else "FAIL  ") + label)
    return ok


def stats(values):
    n = len(values)
    mean = sum(values) / n
    sd = (sum((v - mean) ** 2 for v in values) / n) ** 0.5
    return mean, sd, min(values), max(values)


def hammer(label, read, n):
    """Read n times as fast as possible. Returns good values; records errors and rate."""
    values = []
    errors = 0
    first_error = None
    start = ticks_ms()
    for _ in range(n):
        try:
            values.append(read())
        except Exception as e:
            errors += 1
            first_error = first_error or repr(e)
    ms = ticks_diff(ticks_ms(), start) or 1
    print(
        "{}: {} reads, {:.0f}/s, {} errors {}".format(
            label, n, n * 1000 / ms, errors, first_error or ""
        )
    )
    record(errors == 0, label + " no read errors")
    return values


def summary():
    failed = [label for ok, label in results if not ok]
    step(
        "SUMMARY: {} passed, {} failed".format(len(results) - len(failed), len(failed))
    )
    for label in failed:
        print("FAIL  " + label)
