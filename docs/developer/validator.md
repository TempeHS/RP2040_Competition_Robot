# Validation Pipeline

`app/js/validator.js` statically analyses learner Python before execution. The goal is to block dangerous APIs, encourage best practices, and surface clear feedback in the UI. Validation runs synchronously inside `PythonRunner.run()` so the code never reaches Skulpt when disallowed patterns are present.

## Import Checks

- `parseImports(code)` collects all `import` and `from … import …` statements with line numbers.
- Only `aidriver` and `time` are permitted modules. Additional names trigger hard errors.
- When importing from `aidriver`, the validator warns about unexpected exports but allows the run to continue.

## Forbidden Patterns

`FORBIDDEN_PATTERNS` contains regexes for banned functions (`exec`, `eval`, `open`, etc.) and risky modules (`os`, `sys`, `subprocess`). When a pattern matches, the validator records a blocking error with the offending line number.

## Usage Guidance

- Missing imports: If no `aidriver` import is detected, learners receive a warning encouraging them to set up their robot object.
- Missing AIDriver instance: Another warning nudges the learner to instantiate `AIDriver("left")` or `AIDriver("right")`.

## Syntax Heuristics

`checkBasicSyntax(code)` performs lightweight checks for common mistakes:

- Missing colons at the end of control statements (`if`, `for`, `def`, …)
- Frequent typos (e.g. `pritn`, `whlie`, `ture`)
- Comments-and-strings aware handling of triple quotes
- Warns when parentheses appear heavily unbalanced on single lines

## API Conformance

- `validateMethodUsage(code)` locates variables assigned to `AIDriver("left")` or `AIDriver("right")` and ensures subsequent method calls belong to the approved set (`drive_forward`, `brake`, `read_distance`, etc.). Anything else yields a warning with line numbers.
- `validateFunctionCalls(code)` flags standalone function calls that are neither builtins from `ALLOWED_FUNCTIONS`, user-defined functions, nor previously assigned variables. These generate errors because execution would fail at runtime.

## Suggestions

`getSuggestion(errorMessage)` maps common Python exception names (e.g. `SyntaxError`, `IndentationError`) to short remediation hints displayed alongside runtime errors.

## Extending Validation

- To allow new modules or functions, add entries to `ALLOWED_IMPORTS`, `ALLOWED_FUNCTIONS`, and the relevant sets near the top of the file.
- Introduce new forbidden behaviours by appending regex definitions to `FORBIDDEN_PATTERNS`.
- If richer syntax analysis is required, consider integrating a lightweight Python parser compiled to JavaScript, but be mindful of bundle size.
