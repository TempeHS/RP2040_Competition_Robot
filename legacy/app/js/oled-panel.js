/**
 * AIDriver Simulator - OLED Status Panel
 *
 * Renders the four-line SSD1306 status display in the simulator so students
 * can SEE exactly what their `my_robot.display_status(...)` / `show_display(...)`
 * calls would show on the real 128x64 OLED. Output-only, mirroring the panel.
 *
 * The hardware caps each line at 16 characters (8x8 font, 128 px wide), so the
 * simulated panel clips to 16 characters per line too — what you see here is
 * what the robot's screen shows.
 */

const OLEDPanel = {
  element: null,
  MAX_LINES: 4,
  MAX_CHARS: 16,

  /**
   * Capture the panel element and blank it.
   * @returns {void}
   */
  init() {
    if (typeof document === "undefined") return;
    this.element = document.getElementById("oledPanel");
    this.reset();
  },

  /**
   * Show up to four lines of text on the simulated OLED.
   * @param {string[]} lines Up to four strings (extra lines/characters clipped).
   * @returns {void}
   */
  render(lines) {
    if (!this.element) {
      this.init();
    }
    if (!this.element) return;

    const safe = Array.isArray(lines) ? lines.slice(0, this.MAX_LINES) : [];
    while (safe.length < this.MAX_LINES) {
      safe.push("");
    }

    this.element.innerHTML = "";
    safe.forEach((text) => {
      const line = document.createElement("div");
      line.className = "oled-line";
      line.textContent = String(text == null ? "" : text).slice(
        0,
        this.MAX_CHARS,
      );
      this.element.appendChild(line);
    });
    this.element.classList.add("on");
  },

  /**
   * Blank the panel but keep it powered (mirrors clear_display()).
   * @returns {void}
   */
  clear() {
    if (!this.element) {
      this.init();
    }
    if (!this.element) return;
    this.element.innerHTML = "";
    this.element.classList.add("on");
  },

  /**
   * Power the panel off (blank + dim). Used on run start / robot reset.
   * @returns {void}
   */
  reset() {
    if (!this.element) {
      if (typeof document === "undefined") return;
      this.element = document.getElementById("oledPanel");
    }
    if (!this.element) return;
    this.element.innerHTML = "";
    this.element.classList.remove("on");
  },
};

// Auto-initialise once the DOM is ready (no-op under Node/Jest without a DOM).
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("DOMContentLoaded", () => OLEDPanel.init());
}

// Export for the Jest unit tests.
if (typeof module !== "undefined" && module.exports) {
  module.exports = OLEDPanel;
}
