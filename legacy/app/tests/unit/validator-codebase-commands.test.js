/**
 * Codebase command coverage for the Pyodide / ACE error system.
 *
 * The browser editor runs the REAL `app/js/validator.js` to annotate the ACE
 * gutter and to gate the Run button before code is handed to Pyodide. This
 * suite asserts that every command (function call and AIDriver method) used by
 * the shipped Python programs — the learner starter scaffolds and the model
 * answers — is recognised by that validator.
 *
 * If a new helper, builtin, or AIDriver method is introduced in the codebase
 * but not added to the validator's allow-lists, these tests fail and point at
 * the exact file / line / command, preventing false-positive error markers.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ── Load the REAL Validator IIFE into an isolated sandbox ──
function loadValidator() {
  const src = fs.readFileSync(
    path.join(__dirname, "../../js/validator.js"),
    "utf8",
  );
  const sandbox = { console: { log() {} } };
  vm.createContext(sandbox);
  vm.runInContext(src + "\n;this.Validator = Validator;", sandbox);
  return sandbox.Validator;
}

// ── Collect every shipped Python program that runs in Pyodide ──
function collectPythonFiles() {
  const dirs = ["starter-code", "answers"];
  const files = [];
  for (const dir of dirs) {
    const abs = path.join(__dirname, "../..", dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      if (name.endsWith(".py")) {
        files.push({
          label: `${dir}/${name}`,
          code: fs.readFileSync(path.join(abs, name), "utf8"),
        });
      }
    }
  }
  return files;
}

const Validator = loadValidator();
const pythonFiles = collectPythonFiles();

describe("ACE/Pyodide validator — codebase command coverage", () => {
  test("there are Python programs to check", () => {
    // Guards against a broken glob silently making every test vacuously pass.
    expect(pythonFiles.length).toBeGreaterThan(0);
  });

  describe.each(pythonFiles.map((f) => [f.label, f.code]))(
    "%s",
    (label, code) => {
      test("uses no unrecognised function commands", () => {
        const errors = Validator.validateFunctionCalls(code);
        const detail = errors
          .map((e) => `  L${e.line}: ${e.message}`)
          .join("\n");
        expect({ label, errors: detail }).toEqual({ label, errors: "" });
      });

      test("uses no unrecognised AIDriver methods", () => {
        const warnings = Validator.validateMethodUsage(code);
        const detail = warnings
          .map((w) => `  L${w.line}: ${w.message}`)
          .join("\n");
        expect({ label, warnings: detail }).toEqual({ label, warnings: "" });
      });

      test("produces no blocking validator errors", () => {
        // These are the hard errors that mark the ACE gutter red and disable
        // the Run button (forbidden APIs, bad imports, syntax heuristics).
        const result = Validator.validate(code);
        const detail = result.errors
          .map((e) => `  L${e.line}: ${e.message}`)
          .join("\n");
        expect({ label, errors: detail }).toEqual({ label, errors: "" });
      });
    },
  );
});
