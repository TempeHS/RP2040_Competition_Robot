/**
 * OLED Panel Unit Tests
 *
 * Verifies the simulated SSD1306 status panel renders the four-line display
 * the way the hardware would: clipped to 4 lines of 16 characters, powered
 * "on" while showing text, and blanked on reset.
 */

const OLEDPanel = require("../../js/oled-panel.js");

describe("OLEDPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="oledPanel"></div>';
    OLEDPanel.element = null;
    OLEDPanel.init();
  });

  test("renders up to four lines as .oled-line children", () => {
    OLEDPanel.render(["one", "two", "three", "four"]);
    const lines = OLEDPanel.element.querySelectorAll(".oled-line");
    expect(lines).toHaveLength(4);
    expect(lines[0].textContent).toBe("one");
    expect(lines[3].textContent).toBe("four");
  });

  test("pads missing lines so the panel always has four rows", () => {
    OLEDPanel.render(["only one"]);
    const lines = OLEDPanel.element.querySelectorAll(".oled-line");
    expect(lines).toHaveLength(4);
    expect(lines[1].textContent).toBe("");
    expect(lines[3].textContent).toBe("");
  });

  test("clips each line to 16 characters (hardware width)", () => {
    OLEDPanel.render(["0123456789ABCDEFGHIJ"]);
    const first = OLEDPanel.element.querySelector(".oled-line");
    expect(first.textContent).toBe("0123456789ABCDEF");
    expect(first.textContent).toHaveLength(16);
  });

  test("ignores extra lines beyond four", () => {
    OLEDPanel.render(["a", "b", "c", "d", "e", "f"]);
    const lines = OLEDPanel.element.querySelectorAll(".oled-line");
    expect(lines).toHaveLength(4);
  });

  test("powers the panel on when rendering", () => {
    OLEDPanel.render(["hello"]);
    expect(OLEDPanel.element.classList.contains("on")).toBe(true);
  });

  test("clear() blanks the text but keeps the panel on", () => {
    OLEDPanel.render(["hello", "world"]);
    OLEDPanel.clear();
    expect(OLEDPanel.element.querySelectorAll(".oled-line")).toHaveLength(0);
    expect(OLEDPanel.element.textContent).toBe("");
    expect(OLEDPanel.element.classList.contains("on")).toBe(true);
  });

  test("reset() blanks the text and powers the panel off", () => {
    OLEDPanel.render(["hello"]);
    OLEDPanel.reset();
    expect(OLEDPanel.element.textContent).toBe("");
    expect(OLEDPanel.element.classList.contains("on")).toBe(false);
  });

  test("tolerates non-array / null input without throwing", () => {
    expect(() => OLEDPanel.render(null)).not.toThrow();
    expect(() => OLEDPanel.render(undefined)).not.toThrow();
    const lines = OLEDPanel.element.querySelectorAll(".oled-line");
    expect(lines).toHaveLength(4);
  });

  test("coerces non-string line values to text", () => {
    OLEDPanel.render(["Score:" + 55, 42, null, ""]);
    const lines = OLEDPanel.element.querySelectorAll(".oled-line");
    expect(lines[0].textContent).toBe("Score:55");
    expect(lines[1].textContent).toBe("42");
    expect(lines[2].textContent).toBe("");
  });
});
