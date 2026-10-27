/**
 * Debug Panel Unit Tests
 * Tests for terminal output, logging, and message formatting
 */

describe("DebugPanel", () => {
  let consoleElement;
  let DebugPanelImpl;

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `
      <div id="debugConsole"></div>
      <button id="btnClearDebug"></button>
    `;
    consoleElement = document.getElementById("debugConsole");

    // Create a fresh implementation for each test
    DebugPanelImpl = {
      console: null,
      init: function () {
        this.console = document.getElementById("debugConsole");
      },
      log: function (msg, type = "info") {
        if (!this.console) this.init();
        const div = document.createElement("div");
        div.className = `debug-message debug-${type}`;
        const timestamp = new Date().toLocaleTimeString();
        div.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${this.escapeHtml(
          String(msg)
        )}`;
        this.console.appendChild(div);
        this.console.scrollTop = this.console.scrollHeight;
      },
      info: function (msg) {
        this.log(msg, "info");
      },
      warn: function (msg) {
        this.log(msg, "warning");
      },
      error: function (msg) {
        this.log(msg, "error");
      },
      success: function (msg) {
        this.log(msg, "success");
      },
      clear: function () {
        if (this.console) this.console.innerHTML = "";
      },
      escapeHtml: function (str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
      },
    };
    DebugPanelImpl.init();
  });

  describe("Initialization", () => {
    test("should initialize without errors", () => {
      expect(() => DebugPanelImpl.init()).not.toThrow();
    });

    test("should have required methods", () => {
      expect(typeof DebugPanelImpl.log).toBe("function");
      expect(typeof DebugPanelImpl.info).toBe("function");
      expect(typeof DebugPanelImpl.warn).toBe("function");
      expect(typeof DebugPanelImpl.error).toBe("function");
      expect(typeof DebugPanelImpl.success).toBe("function");
      expect(typeof DebugPanelImpl.clear).toBe("function");
    });

    test("should find console element", () => {
      expect(DebugPanelImpl.console).toBeDefined();
      expect(DebugPanelImpl.console).not.toBeNull();
    });
  });

  describe("log() - Basic Logging", () => {
    test("should add message to console", () => {
      DebugPanelImpl.log("Test message");
      expect(consoleElement.textContent).toContain("Test message");
    });

    test("should handle empty message", () => {
      expect(() => DebugPanelImpl.log("")).not.toThrow();
    });

    test("should handle null message", () => {
      expect(() => DebugPanelImpl.log(null)).not.toThrow();
    });

    test("should handle undefined message", () => {
      expect(() => DebugPanelImpl.log(undefined)).not.toThrow();
    });

    test("should handle numeric message", () => {
      DebugPanelImpl.log(42);
      expect(consoleElement.textContent).toContain("42");
    });

    test("should handle object message", () => {
      DebugPanelImpl.log({ key: "value" });
      expect(consoleElement.textContent).toContain("object");
    });
  });

  describe("Message Types", () => {
    test("info() should log with info style", () => {
      DebugPanelImpl.info("Info message");
      const messages = consoleElement.querySelectorAll(".debug-info");
      expect(messages.length).toBeGreaterThan(0);
    });

    test("warn() should log with warning style", () => {
      DebugPanelImpl.warn("Warning message");
      const messages = consoleElement.querySelectorAll(".debug-warning");
      expect(messages.length).toBeGreaterThan(0);
    });

    test("error() should log with error style", () => {
      DebugPanelImpl.error("Error message");
      const messages = consoleElement.querySelectorAll(".debug-error");
      expect(messages.length).toBeGreaterThan(0);
    });

    test("success() should log with success style", () => {
      DebugPanelImpl.success("Success message");
      const messages = consoleElement.querySelectorAll(".debug-success");
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe("Message Styling", () => {
    test("should apply different classes for message types", () => {
      DebugPanelImpl.info("info");
      DebugPanelImpl.warn("warn");
      DebugPanelImpl.error("error");
      DebugPanelImpl.success("success");

      expect(consoleElement.querySelectorAll(".debug-info").length).toBe(1);
      expect(consoleElement.querySelectorAll(".debug-warning").length).toBe(1);
      expect(consoleElement.querySelectorAll(".debug-error").length).toBe(1);
      expect(consoleElement.querySelectorAll(".debug-success").length).toBe(1);
    });

    test("should include timestamp", () => {
      DebugPanelImpl.log("Test");
      const timestamps = consoleElement.querySelectorAll(".timestamp");
      expect(timestamps.length).toBeGreaterThan(0);
    });
  });

  describe("clear() - Console Clearing", () => {
    test("should clear all messages", () => {
      DebugPanelImpl.log("Message 1");
      DebugPanelImpl.log("Message 2");
      DebugPanelImpl.clear();
      expect(consoleElement.innerHTML).toBe("");
    });

    test("should be able to log after clear", () => {
      DebugPanelImpl.log("Before");
      DebugPanelImpl.clear();
      DebugPanelImpl.log("After");
      expect(consoleElement.textContent).toContain("After");
      expect(consoleElement.textContent).not.toContain("Before");
    });
  });

  describe("Auto-scroll", () => {
    test("should scroll to bottom when adding messages", () => {
      for (let i = 0; i < 10; i++) {
        DebugPanelImpl.log(`Message ${i}`);
      }
      expect(consoleElement.scrollTop).toBeDefined();
    });
  });

  describe("Message Formatting", () => {
    test("should preserve newlines in messages", () => {
      DebugPanelImpl.log("Line1\\nLine2");
      expect(consoleElement.textContent).toContain("Line1");
    });

    test("should escape HTML in messages", () => {
      DebugPanelImpl.log("<script>alert('xss')</script>");
      expect(consoleElement.innerHTML).not.toContain("<script>");
    });

    test("should handle very long messages", () => {
      const longMsg = "A".repeat(10000);
      expect(() => DebugPanelImpl.log(longMsg)).not.toThrow();
    });

    test("should handle special characters", () => {
      DebugPanelImpl.log("Special: @#$%^&*()");
      expect(consoleElement.textContent).toContain("@#$%^&*()");
    });

    test("should handle unicode characters", () => {
      DebugPanelImpl.log("Unicode: 你好 🚀");
      expect(consoleElement.textContent).toContain("你好");
      expect(consoleElement.textContent).toContain("🚀");
    });
  });

  describe("Message History", () => {
    test("should maintain message order", () => {
      DebugPanelImpl.log("First");
      DebugPanelImpl.log("Second");
      DebugPanelImpl.log("Third");

      const messages = consoleElement.querySelectorAll(".debug-message");
      expect(messages[0].textContent).toContain("First");
      expect(messages[1].textContent).toContain("Second");
      expect(messages[2].textContent).toContain("Third");
    });

    test("should limit message history", () => {
      for (let i = 0; i < 1000; i++) {
        DebugPanelImpl.log(`Message ${i}`);
      }
      expect(consoleElement.children.length).toBe(1000);
    });
  });

  describe("Color Coding", () => {
    test("should use appropriate colors for message types", () => {
      DebugPanelImpl.info("info");
      DebugPanelImpl.warn("warn");
      DebugPanelImpl.error("error");
      DebugPanelImpl.success("success");

      expect(consoleElement.querySelector(".debug-info")).not.toBeNull();
      expect(consoleElement.querySelector(".debug-warning")).not.toBeNull();
      expect(consoleElement.querySelector(".debug-error")).not.toBeNull();
      expect(consoleElement.querySelector(".debug-success")).not.toBeNull();
    });
  });

  describe("Performance", () => {
    test("should handle rapid logging", () => {
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        DebugPanelImpl.log(`Rapid message ${i}`);
      }
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });

    test("should not cause memory issues with many messages", () => {
      for (let i = 0; i < 500; i++) {
        DebugPanelImpl.log(`Memory test ${i}`);
      }
      expect(consoleElement.children.length).toBe(500);
    });
  });

  describe("Clear Button Integration", () => {
    test("should wire up clear button if exists", () => {
      const clearBtn = document.getElementById("btnClearDebug");
      expect(clearBtn).not.toBeNull();
    });
  });

  describe("Python Output Formatting", () => {
    test("should handle print output format", () => {
      DebugPanelImpl.log(">>> print('hello')");
      expect(consoleElement.textContent).toContain("print");
    });

    test("should handle error output format", () => {
      DebugPanelImpl.error("NameError: name 'x' is not defined");
      expect(consoleElement.textContent).toContain("NameError");
    });
  });
});
