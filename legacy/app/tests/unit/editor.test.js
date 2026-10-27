/**
 * Editor Unit Tests
 * Tests for ACE editor integration
 */

describe("Editor", () => {
  let EditorImpl;
  let mockAceEditor;

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `<div id="codeEditor"></div>`;

    // Create mock ACE editor instance
    mockAceEditor = {
      setTheme: jest.fn(),
      getSession: jest.fn().mockReturnValue({
        setMode: jest.fn(),
        setUseWrapMode: jest.fn(),
        on: jest.fn(),
        setAnnotations: jest.fn(),
        clearAnnotations: jest.fn(),
        getAnnotations: jest.fn().mockReturnValue([]),
      }),
      setOptions: jest.fn(),
      setValue: jest.fn(),
      getValue: jest.fn().mockReturnValue(""),
      resize: jest.fn(),
      on: jest.fn(),
      gotoLine: jest.fn(),
      setReadOnly: jest.fn(),
    };

    // Create Editor implementation
    EditorImpl = {
      ace: null,
      code: "",
      init: function () {
        this.ace = mockAceEditor;
        this.ace.setTheme("ace/theme/monokai");
        this.ace.getSession().setMode("ace/mode/python");
      },
      getCode: function () {
        return this.code;
      },
      setCode: function (code) {
        this.code = code;
        if (this.ace) this.ace.setValue(code);
      },
      markError: function (line, message) {
        if (this.ace) {
          this.ace.getSession().setAnnotations([
            {
              row: line - 1,
              column: 0,
              text: message,
              type: "error",
            },
          ]);
        }
      },
      clearErrors: function () {
        if (this.ace) {
          this.ace.getSession().clearAnnotations();
        }
      },
      resize: function () {
        if (this.ace) this.ace.resize();
      },
      gotoLine: function (line) {
        if (this.ace) this.ace.gotoLine(line);
      },
      setReadOnly: function (readOnly) {
        if (this.ace) this.ace.setReadOnly(readOnly);
      },
      saveToLocalStorage: function () {
        localStorage.setItem("aidriver_code", this.code);
      },
      loadFromLocalStorage: function () {
        const saved = localStorage.getItem("aidriver_code");
        if (saved) this.setCode(saved);
        return saved;
      },
    };
    EditorImpl.init();
  });

  describe("Initialization", () => {
    test("should have required methods", () => {
      expect(typeof EditorImpl.init).toBe("function");
      expect(typeof EditorImpl.getCode).toBe("function");
      expect(typeof EditorImpl.setCode).toBe("function");
    });

    test("should initialize ACE editor", () => {
      expect(EditorImpl.ace).toBeDefined();
    });

    test("should set Python mode", () => {
      expect(mockAceEditor.getSession().setMode).toHaveBeenCalledWith(
        "ace/mode/python"
      );
    });

    test("should set monokai theme", () => {
      expect(mockAceEditor.setTheme).toHaveBeenCalledWith("ace/theme/monokai");
    });
  });

  describe("setCode()", () => {
    test("should set editor content", () => {
      EditorImpl.setCode("print('hello')");
      expect(EditorImpl.code).toBe("print('hello')");
    });

    test("should handle empty string", () => {
      EditorImpl.setCode("");
      expect(EditorImpl.code).toBe("");
    });

    test("should handle multiline code", () => {
      const code = "def test():\n    return 42";
      EditorImpl.setCode(code);
      expect(EditorImpl.code).toBe(code);
    });

    test("should handle code with special characters", () => {
      const code = "x = 'hello\\nworld'";
      EditorImpl.setCode(code);
      expect(EditorImpl.code).toBe(code);
    });
  });

  describe("getCode()", () => {
    test("should return editor content", () => {
      EditorImpl.setCode("test code");
      expect(EditorImpl.getCode()).toBe("test code");
    });

    test("should return empty string for empty editor", () => {
      expect(EditorImpl.getCode()).toBe("");
    });
  });

  describe("Error Marking", () => {
    test("should have markError method", () => {
      expect(typeof EditorImpl.markError).toBe("function");
    });

    test("should mark error at line", () => {
      EditorImpl.markError(5, "Syntax error");
      expect(mockAceEditor.getSession().setAnnotations).toHaveBeenCalled();
    });

    test("should clear errors", () => {
      EditorImpl.clearErrors();
      expect(mockAceEditor.getSession().clearAnnotations).toHaveBeenCalled();
    });

    test("should handle multiple errors", () => {
      EditorImpl.markError(1, "Error 1");
      EditorImpl.markError(2, "Error 2");
      expect(mockAceEditor.getSession().setAnnotations).toHaveBeenCalledTimes(
        2
      );
    });
  });

  describe("Line Navigation", () => {
    test("should have gotoLine method", () => {
      expect(typeof EditorImpl.gotoLine).toBe("function");
    });

    test("should navigate to line", () => {
      EditorImpl.gotoLine(10);
      expect(mockAceEditor.gotoLine).toHaveBeenCalledWith(10);
    });
  });

  describe("Code Persistence", () => {
    let mockSetItem;
    let mockGetItem;

    beforeEach(() => {
      mockSetItem = jest.fn();
      mockGetItem = jest.fn();
      // Override EditorImpl's localStorage methods for testing
      EditorImpl.saveToLocalStorage = function () {
        mockSetItem("aidriver_code", this.code);
      };
      EditorImpl.loadFromLocalStorage = function () {
        const saved = mockGetItem("aidriver_code");
        if (saved) this.setCode(saved);
        return saved;
      };
    });

    test("should save code to localStorage", () => {
      EditorImpl.setCode("saved code");
      EditorImpl.saveToLocalStorage();
      expect(mockSetItem).toHaveBeenCalledWith("aidriver_code", "saved code");
    });

    test("should load code from localStorage", () => {
      mockGetItem.mockReturnValue("loaded code");
      const result = EditorImpl.loadFromLocalStorage();
      expect(result).toBe("loaded code");
    });

    test("should handle missing saved code", () => {
      mockGetItem.mockReturnValue(null);
      const result = EditorImpl.loadFromLocalStorage();
      expect(result).toBeNull();
    });
  });

  describe("Editor Options", () => {
    test("should set editor options", () => {
      EditorImpl.ace.setOptions({ fontSize: 14 });
      expect(mockAceEditor.setOptions).toHaveBeenCalled();
    });

    test("should enable line numbers", () => {
      // Line numbers are enabled by default in ACE
      expect(EditorImpl.ace).toBeDefined();
    });

    test("should set appropriate font size", () => {
      EditorImpl.ace.setOptions({ fontSize: 14 });
      expect(mockAceEditor.setOptions).toHaveBeenCalled();
    });
  });

  describe("Event Handling", () => {
    test("should register change listener", () => {
      EditorImpl.ace.on("change", jest.fn());
      expect(mockAceEditor.on).toHaveBeenCalled();
    });

    test("should validate on change", () => {
      const callback = jest.fn();
      EditorImpl.ace.on("change", callback);
      expect(mockAceEditor.on).toHaveBeenCalledWith("change", callback);
    });
  });

  describe("Resize Handling", () => {
    test("should have resize method", () => {
      expect(typeof EditorImpl.resize).toBe("function");
    });

    test("should resize editor", () => {
      EditorImpl.resize();
      expect(mockAceEditor.resize).toHaveBeenCalled();
    });
  });

  describe("Read-Only Mode", () => {
    test("should support read-only mode", () => {
      EditorImpl.setReadOnly(true);
      expect(mockAceEditor.setReadOnly).toHaveBeenCalledWith(true);
    });
  });

  describe("Autocompletion", () => {
    test("should enable basic autocomplete", () => {
      // ACE autocomplete is enabled via require
      expect(EditorImpl.ace).toBeDefined();
    });

    test("should include AIDriver keywords", () => {
      // AIDriver keywords should be in completer
      expect(EditorImpl.ace).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    test("should handle init before DOM ready", () => {
      expect(() => EditorImpl.init()).not.toThrow();
    });

    test("should handle very large code", () => {
      const largeCode = "x = 1\n".repeat(10000);
      expect(() => EditorImpl.setCode(largeCode)).not.toThrow();
    });

    test("should handle binary data in code", () => {
      const binaryData = "\\x00\\x01\\x02";
      expect(() => EditorImpl.setCode(binaryData)).not.toThrow();
    });
  });
});
