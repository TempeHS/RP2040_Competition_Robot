const ConfigStore = require("../../js/config-store");
const Editor = require("../../js/editor");
const ConfigEditor = require("../../js/config-editor");

describe("Separate main and config persistence", () => {
  let saved;
  let code;

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    saved = {
      get: (key) => localStorage.getItem(key),
      set: (key, value) => localStorage.setItem(key, value),
      has: (key) => localStorage.getItem(key) !== null,
    };
    code = "# edited main\n";
    global.App = { currentChallenge: 1 };
    global.ConfigStore = ConfigStore;
    Editor.instance = { getValue: () => code };
    Editor.mainSession = null;
    Editor.configSession = null;
    Editor.activeFile = "main.py";
    Editor.saveTimeout = null;
    ConfigStore.source = null;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("flush saves the previous main before a challenge switch", () => {
    Editor.debouncedSave();
    Editor.flushSave();
    App.currentChallenge = 2;
    code = "# new challenge\n";
    jest.runAllTimers();
    expect(saved.get("aidriver_challenge_1_code_v4")).toBe("# edited main\n");
    expect(saved.has("aidriver_challenge_2_code_v4")).toBe(false);
  });

  test("resetting a main leaves config and other mains intact", () => {
    ConfigStore.save("# my tuning\nBASE_SPEED = 180\n");
    Editor.saveCode();
    saved.set("aidriver_challenge_2_code_v4", "# keep this\n");
    Editor.clearSavedCode(1);
    expect(saved.get(ConfigStore.key)).toBe("# my tuning\nBASE_SPEED = 180\n");
    expect(Editor.loadSavedCode(2)).toBe("# keep this\n");
  });

  test("existing and deliberately empty mains are not replaced", () => {
    saved.set("aidriver_challenge_1_code_v4", "");
    expect(Editor.loadSavedCode(1)).toBe("");
    expect(Editor.loadSavedCode(2)).toBeNull();
  });

  test("config stays visible while execution reads and saves the main session", () => {
    const config = "# Wall PID\nside_Kp = 0.72\n";
    Editor.mainSession = { getValue: () => code };
    Editor.configSession = { getValue: () => config };
    Editor.instance = {
      session: Editor.mainSession,
      getValue() {
        return this.session.getValue();
      },
      setSession(session) {
        this.session = session;
      },
      focus: jest.fn(),
    };
    Editor.debouncedSave();
    Editor.switchFile("config.py");
    expect(Editor.getActiveCode()).toBe(config);
    expect(Editor.getCode()).toBe(code);
    Editor.debouncedSave();
    Editor.flushSave();
    expect(saved.get("aidriver_challenge_1_code_v4")).toBe(code);
    expect(saved.get(ConfigStore.key)).toBe(config);
    Editor.switchFile("main.py");
    expect(Editor.instance.session).toBe(Editor.mainSession);
    expect(Editor.getActiveCode()).toBe(code);
  });

  test("main errors and execution markers never annotate or scroll config", () => {
    jest.spyOn(ace, "require").mockReturnValue({ Range: jest.fn() });
    const session = {
      getAnnotations: jest.fn(() => []),
      setAnnotations: jest.fn(),
      addMarker: jest.fn(() => 1),
      removeMarker: jest.fn(),
    };
    Editor.mainSession = session;
    Editor.configSession = { setAnnotations: jest.fn(), addMarker: jest.fn() };
    Editor.instance = {
      session: Editor.configSession,
      scrollToLine: jest.fn(),
    };
    Editor.activeFile = "config.py";
    Editor.markers = [];
    Editor.executingLine = null;
    Editor.markError(8, "main failure");
    Editor.highlightExecutingLine(9);
    expect(session.setAnnotations).toHaveBeenCalledWith([
      { row: 7, column: 0, text: "main failure", type: "error" },
    ]);
    expect(session.addMarker).toHaveBeenCalledTimes(2);
    expect(Editor.configSession.setAnnotations).not.toHaveBeenCalled();
    expect(Editor.configSession.addMarker).not.toHaveBeenCalled();
    expect(Editor.instance.scrollToLine).not.toHaveBeenCalled();
  });

  test("config flush preserves comments and unsaved text on navigation", () => {
    document.body.innerHTML =
      '<select id="configSection"></select><span id="configSaveStatus"></span><div id="configResult"></div>';
    const source = "# Wall PID\nside_Kp = 0.72  # measured on my robot\n";
    ConfigEditor.instance = { getValue: () => source };
    expect(ConfigEditor.flushSave()).toBe(true);
    expect(saved.get(ConfigStore.key)).toBe(source);
    expect(document.getElementById("configSaveStatus").textContent).toBe(
      "Saved locally",
    );
    expect(saved.has("aidriver_challenge_1_code_v4")).toBe(false);
  });
});
