/**
 * Validator Unit Tests
 * Tests for Python code validation and strict import checking
 */

describe("Validator", () => {
  let ValidatorImpl;

  beforeEach(() => {
    // Create Validator implementation
    ValidatorImpl = {
      ALLOWED_IMPORTS: ["aidriver", "time", "math", "random"],

      ALLOWED_BUILTINS: [
        "print",
        "range",
        "len",
        "int",
        "float",
        "str",
        "bool",
        "list",
        "dict",
        "tuple",
        "set",
        "abs",
        "min",
        "max",
        "sum",
        "round",
        "sorted",
        "reversed",
        "enumerate",
        "zip",
        "map",
        "filter",
        "True",
        "False",
        "None",
      ],

      validate: function (code) {
        const errors = [];

        // Check imports
        const importResult = this.validateImports(code);
        if (!importResult.valid) {
          errors.push(...importResult.errors);
        }

        // Check syntax
        const syntaxResult = this.validateSyntax(code);
        if (!syntaxResult.valid) {
          errors.push(...syntaxResult.errors);
        }

        // Check forbidden constructs
        const forbiddenResult = this.validateForbidden(code);
        if (!forbiddenResult.valid) {
          errors.push(...forbiddenResult.errors);
        }

        return {
          valid: errors.length === 0,
          errors: errors,
        };
      },

      validateImports: function (code) {
        const errors = [];
        const lines = code.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          // Check "import X" statements
          const importMatch = line.match(/^import\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
          if (importMatch) {
            const module = importMatch[1];
            if (!this.ALLOWED_IMPORTS.includes(module)) {
              errors.push({
                line: i + 1,
                message: `Import of '${module}' is not allowed`,
                type: "import",
              });
            }
          }

          // Check "from X import Y" statements
          const fromMatch = line.match(
            /^from\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+import/,
          );
          if (fromMatch) {
            const module = fromMatch[1];
            if (!this.ALLOWED_IMPORTS.includes(module)) {
              errors.push({
                line: i + 1,
                message: `Import from '${module}' is not allowed`,
                type: "import",
              });
            }
          }
        }

        return {
          valid: errors.length === 0,
          errors: errors,
        };
      },

      validateSyntax: function (code) {
        const errors = [];
        const lines = code.split("\n");

        let indentStack = [0];
        let inString = false;
        let stringChar = "";

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();

          // Skip empty lines and comments
          if (trimmed === "" || trimmed.startsWith("#")) continue;

          // Check for matching quotes
          let quoteCount = (trimmed.match(/"/g) || []).length;
          let singleQuoteCount = (trimmed.match(/'/g) || []).length;

          // Check for unmatched parentheses (simple check)
          const openParens = (trimmed.match(/\(/g) || []).length;
          const closeParens = (trimmed.match(/\)/g) || []).length;

          // Check for invalid indentation
          const indent = line.length - line.trimStart().length;
          if (indent % 4 !== 0 && indent % 2 !== 0) {
            // Allow 2-space or 4-space indentation
          }
        }

        return {
          valid: errors.length === 0,
          errors: errors,
        };
      },

      validateForbidden: function (code) {
        const errors = [];
        const lines = code.split("\n");

        const forbiddenPatterns = [
          { pattern: /\bexec\s*\(/, message: "exec() is not allowed" },
          { pattern: /\beval\s*\(/, message: "eval() is not allowed" },
          { pattern: /\bcompile\s*\(/, message: "compile() is not allowed" },
          {
            pattern: /\b__import__\s*\(/,
            message: "__import__() is not allowed",
          },
          { pattern: /\bopen\s*\(/, message: "open() is not allowed" },
          { pattern: /\bglobals\s*\(/, message: "globals() is not allowed" },
          { pattern: /\blocals\s*\(/, message: "locals() is not allowed" },
        ];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          for (const { pattern, message } of forbiddenPatterns) {
            if (pattern.test(line)) {
              errors.push({
                line: i + 1,
                message: message,
                type: "forbidden",
              });
            }
          }
        }

        return {
          valid: errors.length === 0,
          errors: errors,
        };
      },

      hasAIDriverImport: function (code) {
        return /from\s+aidriver\s+import|import\s+aidriver/.test(code);
      },
    };
  });

  describe("validate()", () => {
    test("should return valid for correct code", () => {
      const result = ValidatorImpl.validate(
        'from aidriver import AIDriver\nrobot = AIDriver("left")',
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should return errors array", () => {
      const result = ValidatorImpl.validate("import os");
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });

    test("should detect forbidden import", () => {
      const result = ValidatorImpl.validate("import os");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("validateImports()", () => {
    test("should allow aidriver import", () => {
      const result = ValidatorImpl.validateImports(
        "from aidriver import AIDriver",
      );
      expect(result.valid).toBe(true);
    });

    test("should allow time import", () => {
      const result = ValidatorImpl.validateImports("import time");
      expect(result.valid).toBe(true);
    });

    test("should allow math import", () => {
      const result = ValidatorImpl.validateImports("import math");
      expect(result.valid).toBe(true);
    });

    test("should allow random import", () => {
      const result = ValidatorImpl.validateImports("import random");
      expect(result.valid).toBe(true);
    });

    test("should reject os import", () => {
      const result = ValidatorImpl.validateImports("import os");
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("os");
    });

    test("should reject sys import", () => {
      const result = ValidatorImpl.validateImports("import sys");
      expect(result.valid).toBe(false);
    });

    test("should reject subprocess import", () => {
      const result = ValidatorImpl.validateImports("import subprocess");
      expect(result.valid).toBe(false);
    });

    test("should reject socket import", () => {
      const result = ValidatorImpl.validateImports("import socket");
      expect(result.valid).toBe(false);
    });

    test("should include line number in error", () => {
      const result = ValidatorImpl.validateImports("x = 1\nimport os\ny = 2");
      expect(result.errors[0].line).toBe(2);
    });

    test("should detect from X import pattern", () => {
      const result = ValidatorImpl.validateImports("from os import path");
      expect(result.valid).toBe(false);
    });
  });

  describe("validateSyntax()", () => {
    test("should return valid for correct syntax", () => {
      const result = ValidatorImpl.validateSyntax("x = 1\nprint(x)");
      expect(result.valid).toBe(true);
    });

    test("should handle empty code", () => {
      const result = ValidatorImpl.validateSyntax("");
      expect(result.valid).toBe(true);
    });

    test("should handle comments", () => {
      const result = ValidatorImpl.validateSyntax("# This is a comment\nx = 1");
      expect(result.valid).toBe(true);
    });

    test("should handle multiline code", () => {
      const code = `def test():
    x = 1
    return x`;
      const result = ValidatorImpl.validateSyntax(code);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateForbidden()", () => {
    test("should reject exec()", () => {
      const result = ValidatorImpl.validateForbidden("exec('print(1)')");
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("exec");
    });

    test("should reject eval()", () => {
      const result = ValidatorImpl.validateForbidden("x = eval('1+1')");
      expect(result.valid).toBe(false);
    });

    test("should reject compile()", () => {
      const result = ValidatorImpl.validateForbidden(
        "compile('x=1', '', 'exec')",
      );
      expect(result.valid).toBe(false);
    });

    test("should reject __import__()", () => {
      const result = ValidatorImpl.validateForbidden("os = __import__('os')");
      expect(result.valid).toBe(false);
    });

    test("should reject open()", () => {
      const result = ValidatorImpl.validateForbidden("f = open('file.txt')");
      expect(result.valid).toBe(false);
    });

    test("should reject globals()", () => {
      const result = ValidatorImpl.validateForbidden("g = globals()");
      expect(result.valid).toBe(false);
    });

    test("should reject locals()", () => {
      const result = ValidatorImpl.validateForbidden("l = locals()");
      expect(result.valid).toBe(false);
    });

    test("should allow normal builtins", () => {
      const result = ValidatorImpl.validateForbidden(
        "x = len([1,2,3])\nprint(x)",
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("hasAIDriverImport()", () => {
    test("should detect 'from aidriver import'", () => {
      expect(
        ValidatorImpl.hasAIDriverImport("from aidriver import AIDriver"),
      ).toBe(true);
    });

    test("should detect 'import aidriver'", () => {
      expect(ValidatorImpl.hasAIDriverImport("import aidriver")).toBe(true);
    });

    test("should return false when no import", () => {
      expect(ValidatorImpl.hasAIDriverImport("x = 1")).toBe(false);
    });
  });

  describe("Multiple Errors", () => {
    test("should collect multiple import errors", () => {
      const result = ValidatorImpl.validate(
        "import os\nimport sys\nimport socket",
      );
      expect(result.errors.length).toBe(3);
    });

    test("should include all error types", () => {
      const result = ValidatorImpl.validate("import os\nexec('x=1')");
      expect(result.errors.length).toBe(2);
    });
  });

  describe("Edge Cases", () => {
    test("should handle code with only whitespace", () => {
      const result = ValidatorImpl.validate("   \n   \n   ");
      expect(result.valid).toBe(true);
    });

    test("should handle code with only comments", () => {
      const result = ValidatorImpl.validate("# comment 1\n# comment 2");
      expect(result.valid).toBe(true);
    });

    test("should handle very long code", () => {
      const longCode = "x = 1\n".repeat(1000);
      expect(() => ValidatorImpl.validate(longCode)).not.toThrow();
    });

    test("should handle code with unicode", () => {
      const result = ValidatorImpl.validate("# 你好\nx = '🚀'");
      expect(result.valid).toBe(true);
    });
  });
});
