/**
 * API Consistency Tests
 *
 * Compares the simulator's aidriver stub API with the real MicroPython aidriver.py
 * to identify any differences that could cause code to work in the simulator
 * but fail on the real robot (or vice versa).
 */

const fs = require("fs");
const path = require("path");

describe("AIDriver API Consistency", () => {
  let realAidriverSource;
  let simulatorAidriverSource;

  beforeAll(() => {
    // Read the real aidriver.py
    const realPath = path.join(__dirname, "../../../project/lib/aidriver.py");
    realAidriverSource = fs.readFileSync(realPath, "utf8");

    // Read the simulator's python-runner.js to extract the stub
    const simulatorPath = path.join(__dirname, "../../js/python-runner.js");
    simulatorAidriverSource = fs.readFileSync(simulatorPath, "utf8");
  });

  /**
   * Extract method signatures from Python class definition
   */
  function extractPythonMethods(source, className) {
    const methods = [];
    // Match class definition and its methods
    const classPattern = new RegExp(
      `class ${className}[^:]*:[\\s\\S]*?(?=\\nclass |\\ndef [a-z]|$)`,
      "g",
    );
    const classMatch = source.match(classPattern);

    if (!classMatch) return methods;

    const classSource = classMatch[0];
    // Match method definitions: def method_name(self, ...)
    const methodPattern =
      /def\s+([a-z_][a-z0-9_]*)\s*\(\s*self(?:,\s*([^)]*))?\)/gi;
    let match;

    while ((match = methodPattern.exec(classSource)) !== null) {
      const methodName = match[1];
      const params = match[2]
        ? match[2]
            .split(",")
            .map((p) => p.trim().split("=")[0].trim())
            .filter((p) => p)
        : [];
      methods.push({ name: methodName, params });
    }

    return methods;
  }

  /**
   * Extract module-level functions from Python source
   */
  function extractPythonFunctions(source) {
    const functions = [];
    // Match def at module level (not indented)
    const funcPattern = /^def\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gim;
    let match;

    while ((match = funcPattern.exec(source)) !== null) {
      const funcName = match[1];
      // Skip private functions (starting with _)
      if (funcName.startsWith("_")) continue;

      const params = match[2]
        ? match[2]
            .split(",")
            .map((p) => p.trim().split("=")[0].trim())
            .filter((p) => p)
        : [];
      functions.push({ name: funcName, params });
    }

    return functions;
  }

  /**
   * Extract module-level variables/constants from Python source
   */
  function extractPythonModuleVariables(source) {
    const variables = [];
    // Match module-level variable assignments (not indented)
    const varPattern = /^([A-Z][A-Z0-9_]*)\s*=/gm;
    let match;

    while ((match = varPattern.exec(source)) !== null) {
      variables.push(match[1]);
    }

    return variables;
  }

  describe("AIDriver class methods", () => {
    let realMethods;
    let simulatorMethods;

    beforeAll(() => {
      realMethods = extractPythonMethods(realAidriverSource, "AIDriver");
      simulatorMethods = extractPythonMethods(
        simulatorAidriverSource,
        "AIDriver",
      );
    });

    test("should have the same methods in both implementations", () => {
      // Only compare public methods — private helpers (leading underscore)
      // are implementation details and need not exist in both, matching the
      // module-level function comparison.
      const realMethodNames = realMethods
        .map((m) => m.name)
        .filter((m) => !m.startsWith("_"))
        .sort();
      const simMethodNames = simulatorMethods
        .map((m) => m.name)
        .filter((m) => !m.startsWith("_"))
        .sort();

      const missingInSimulator = realMethodNames.filter(
        (m) => !simMethodNames.includes(m),
      );
      const extraInSimulator = simMethodNames.filter(
        (m) => !realMethodNames.includes(m),
      );

      if (missingInSimulator.length > 0) {
        console.warn(
          "Methods in real aidriver.py but MISSING from simulator:",
          missingInSimulator,
        );
      }
      if (extraInSimulator.length > 0) {
        console.warn(
          "Methods in simulator but NOT in real aidriver.py:",
          extraInSimulator,
        );
      }

      expect(missingInSimulator).toEqual([]);
      expect(extraInSimulator).toEqual([]);
    });

    test("drive_forward should have matching parameters", () => {
      const realMethod = realMethods.find((m) => m.name === "drive_forward");
      const simMethod = simulatorMethods.find(
        (m) => m.name === "drive_forward",
      );

      expect(realMethod).toBeDefined();
      expect(simMethod).toBeDefined();

      // Real uses: right_wheel_speed, left_wheel_speed
      // Simulator uses: right_speed, left_speed
      // Parameter names may differ but count should match
      expect(simMethod.params.length).toBe(realMethod.params.length);
    });

    test("drive_backward should have matching parameters", () => {
      const realMethod = realMethods.find((m) => m.name === "drive_backward");
      const simMethod = simulatorMethods.find(
        (m) => m.name === "drive_backward",
      );

      expect(realMethod).toBeDefined();
      expect(simMethod).toBeDefined();
      expect(simMethod.params.length).toBe(realMethod.params.length);
    });

    test("rotate_left should have matching parameters", () => {
      const realMethod = realMethods.find((m) => m.name === "rotate_left");
      const simMethod = simulatorMethods.find((m) => m.name === "rotate_left");

      expect(realMethod).toBeDefined();
      expect(simMethod).toBeDefined();
      expect(simMethod.params.length).toBe(realMethod.params.length);
    });

    test("rotate_right should have matching parameters", () => {
      const realMethod = realMethods.find((m) => m.name === "rotate_right");
      const simMethod = simulatorMethods.find((m) => m.name === "rotate_right");

      expect(realMethod).toBeDefined();
      expect(simMethod).toBeDefined();
      expect(simMethod.params.length).toBe(realMethod.params.length);
    });

    test("brake should exist in both", () => {
      const realMethod = realMethods.find((m) => m.name === "brake");
      const simMethod = simulatorMethods.find((m) => m.name === "brake");

      expect(realMethod).toBeDefined();
      expect(simMethod).toBeDefined();
    });

    test("read_distance should exist in both", () => {
      const realMethod = realMethods.find((m) => m.name === "read_distance");
      const simMethod = simulatorMethods.find(
        (m) => m.name === "read_distance",
      );

      expect(realMethod).toBeDefined();
      expect(simMethod).toBeDefined();
    });

    test("is_moving should exist in both", () => {
      const realMethod = realMethods.find((m) => m.name === "is_moving");
      const simMethod = simulatorMethods.find((m) => m.name === "is_moving");

      expect(realMethod).toBeDefined();
      expect(simMethod).toBeDefined();
    });

    test("get_motor_speeds should exist in both", () => {
      const realMethod = realMethods.find((m) => m.name === "get_motor_speeds");
      const simMethod = simulatorMethods.find(
        (m) => m.name === "get_motor_speeds",
      );

      expect(realMethod).toBeDefined();
      expect(simMethod).toBeDefined();
    });
  });

  describe("Module-level functions", () => {
    test("hold_state should exist in both implementations", () => {
      const realFunctions = extractPythonFunctions(realAidriverSource);
      const simFunctions = extractPythonFunctions(simulatorAidriverSource);

      const realHoldState = realFunctions.find((f) => f.name === "hold_state");
      const simHoldState = simFunctions.find((f) => f.name === "hold_state");

      expect(simHoldState).toBeDefined();
      // Note: hold_state might be defined differently in real vs simulator
      if (!realHoldState) {
        console.warn(
          "hold_state not found as module function in real aidriver.py - may be defined elsewhere",
        );
      }
    });

    test("heartbeat should exist in real implementation", () => {
      const realFunctions = extractPythonFunctions(realAidriverSource);
      const heartbeat = realFunctions.find((f) => f.name === "heartbeat");

      expect(heartbeat).toBeDefined();
      // Simulator doesn't need heartbeat (no LED to blink)
    });
  });

  describe("Module-level variables", () => {
    test("DEBUG_AIDRIVER should exist in both implementations", () => {
      const realHasDebug = /^DEBUG_AIDRIVER\s*=/m.test(realAidriverSource);
      const simHasDebug = /DEBUG_AIDRIVER\s*=/.test(simulatorAidriverSource);

      expect(realHasDebug).toBe(true);
      expect(simHasDebug).toBe(true);
    });
  });

  describe("Debug output consistency", () => {
    test("simulator debug messages should match real implementation format", () => {
      // Check that both use [AIDriver] prefix for debug messages
      const realDebugPattern = /\[AIDriver\]/;
      const simDebugPattern = /\[AIDriver\]/;

      expect(realDebugPattern.test(realAidriverSource)).toBe(true);
      expect(simDebugPattern.test(simulatorAidriverSource)).toBe(true);
    });

    test("real implementation uses _d() helper for debug output", () => {
      // The real implementation uses _d("message") for conditional debug
      const realUsesD = /_d\s*\(/.test(realAidriverSource);
      expect(realUsesD).toBe(true);
    });

    test("simulator should print debug for read_distance like real implementation", () => {
      // Real implementation: _d("read_distance:", distance_mm, "mm")
      // Check if simulator also logs distance readings when DEBUG_AIDRIVER is True
      const realHasDistanceDebug = /read_distance.*mm/i.test(
        realAidriverSource,
      );
      const simHasDistanceDebug = /read_distance/i.test(
        simulatorAidriverSource,
      );

      expect(realHasDistanceDebug).toBe(true);
      // Simulator's read_distance should have debug output capability
      if (!simHasDistanceDebug) {
        console.warn(
          "⚠️  Simulator read_distance may not have debug output matching real implementation",
        );
      }
    });
  });

  describe("API differences report", () => {
    test("generate comprehensive API comparison", () => {
      const realMethods = extractPythonMethods(realAidriverSource, "AIDriver");
      const simMethods = extractPythonMethods(
        simulatorAidriverSource,
        "AIDriver",
      );

      const realMethodNames = new Set(realMethods.map((m) => m.name));
      const simMethodNames = new Set(simMethods.map((m) => m.name));

      const report = {
        realOnlyMethods: [...realMethodNames].filter(
          (m) => !simMethodNames.has(m),
        ),
        simulatorOnlyMethods: [...simMethodNames].filter(
          (m) => !realMethodNames.has(m),
        ),
        commonMethods: [...realMethodNames].filter((m) =>
          simMethodNames.has(m),
        ),
      };

      console.log("\n=== AIDriver API Comparison Report ===");
      console.log("Common methods (in both):", report.commonMethods);
      console.log(
        "Real-only methods (need simulation):",
        report.realOnlyMethods,
      );
      console.log(
        "Simulator-only methods (not on real robot):",
        report.simulatorOnlyMethods,
      );

      // This test always passes but generates the report
      expect(report).toBeDefined();

      // Warn if there are differences
      if (report.realOnlyMethods.length > 0) {
        console.warn(
          "\n⚠️  MISSING IN SIMULATOR:",
          report.realOnlyMethods.join(", "),
        );
      }
      if (report.simulatorOnlyMethods.length > 0) {
        console.warn(
          "\n⚠️  EXTRA IN SIMULATOR:",
          report.simulatorOnlyMethods.join(", "),
        );
      }
    });
  });

  describe("OLED + rescue-kit parity across all three paths", () => {
    let stubSource;
    let validatorSource;

    beforeAll(() => {
      stubSource = fs.readFileSync(
        path.join(__dirname, "../../js/aidriver-stub.js"),
        "utf8",
      );
      validatorSource = fs.readFileSync(
        path.join(__dirname, "../../js/validator.js"),
        "utf8",
      );
    });

    const NEW_METHODS = [
      "show_display",
      "display_status",
      "clear_display",
      "deploy_rescue_kit",
    ];

    test.each(NEW_METHODS)(
      "%s exists in the real firmware (aidriver.py)",
      (method) => {
        expect(realAidriverSource).toContain(`def ${method}(`);
      },
    );

    test.each(NEW_METHODS)("%s exists in the python-runner shim", (method) => {
      expect(simulatorAidriverSource).toContain(`def ${method}(`);
    });

    test.each(NEW_METHODS)(
      "%s exists in the Skulpt stub (aidriver-stub.js)",
      (method) => {
        expect(stubSource).toContain(`$loc.${method}`);
      },
    );

    test.each(NEW_METHODS)(
      "%s is allow-listed in validator.js so learner code is not rejected",
      (method) => {
        expect(validatorSource).toContain(`"${method}"`);
      },
    );
  });
});
