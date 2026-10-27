/**
 * AIDriver Simulator - Debug Panel Module
 * Terminal-like output display with centralized logging
 */

const DebugPanel = {
  element: null,
  maxLines: 500,

  /**
   * Capture and store the debug console element reference, wiring logger integration.
   * @returns {void}
   */
  init() {
    this.element = document.getElementById("debugConsole");
    if (typeof Logger !== "undefined") {
      Logger.info("DEBUG_PANEL", "Debug panel initialized");
    }
    console.log("[DebugPanel] Initialized");
  },

  /**
   * Append a styled message line to the debug console.
   * @param {string} message Message to display to the learner.
   * @param {"info"|"error"|"success"|"warning"|"output"} [type="info"] Presentation style.
   * @returns {void}
   */
  log(message, type = "info") {
    if (!this.element) {
      this.element = document.getElementById("debugConsole");
    }

    // Also log to centralized Logger
    if (typeof Logger !== "undefined") {
      const logLevel =
        type === "error" ? "error" : type === "warning" ? "warn" : "info";
      Logger.log("DEBUG_PANEL", message, null, logLevel);
    }

    if (!this.element) {
      console.log(`[DebugPanel ${type}]`, message);
      return;
    }

    const timestamp = new Date().toLocaleTimeString();
    const line = document.createElement("span");
    line.className = type;

    // Format based on type
    switch (type) {
      case "error":
        line.style.color = "#f85149";
        break;
      case "success":
        line.style.color = "#3fb950";
        break;
      case "warning":
        line.style.color = "#d29922";
        break;
      case "info":
        line.style.color = "#58a6ff";
        break;
      case "output":
        line.style.color = "#c9d1d9"; // Default text color
        break;
    }

    // Don't add timestamp for output (print statements)
    if (type === "output") {
      line.textContent = message + "\n";
    } else {
      line.textContent = `[${timestamp}] ${message}\n`;
    }

    this.element.appendChild(line);

    // Limit number of lines
    while (this.element.childNodes.length > this.maxLines) {
      this.element.removeChild(this.element.firstChild);
    }

    // Auto-scroll to bottom
    this.element.scrollTop = this.element.scrollHeight;
  },

  /**
   * Convenience helper for informational log entries.
   * @param {string} message Text to display.
   * @returns {void}
   */
  info(message) {
    this.log(message, "info");
  },

  /**
   * Convenience helper for error log entries.
   * @param {string} message Text to display.
   * @returns {void}
   */
  error(message) {
    this.log(message, "error");
  },

  /**
   * Convenience helper for success log entries.
   * @param {string} message Text to display.
   * @returns {void}
   */
  success(message) {
    this.log(message, "success");
  },

  /**
   * Convenience helper for warning log entries.
   * @param {string} message Text to display.
   * @returns {void}
   */
  warning(message) {
    this.log(message, "warning");
  },

  /**
   * Record stdout-style program output without timestamps.
   * @param {string} message Text to display.
   * @returns {void}
   */
  output(message) {
    this.log(message, "output");
  },

  /**
   * Remove all previously rendered log entries.
   * @returns {void}
   */
  clear() {
    if (this.element) {
      this.element.textContent = "";
    }
  },

  /**
   * Insert a visual separator to delineate log sections.
   * @returns {void}
   */
  separator() {
    this.log("─".repeat(50), "info");
  },
};

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = DebugPanel;
}
