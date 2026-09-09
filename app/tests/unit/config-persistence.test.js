const ConfigStore = require("../../js/config-store");
const Editor = require("../../js/editor");

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
    Editor.configError = null;
    Editor.saveTimeout = null;
    ConfigStore.source = null;
    document.body.innerHTML =
      '<button id="btnValidateConfig"></button><span id="configValidation"></span>';
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

  test("tabs identify the active file without a duplicate filename label", async () => {
    document.body.innerHTML = `
      <button id="mainTab" data-editor-file="main.py"></button>
      <button id="configTab" data-editor-file="config.py"></button>
      <button id="btnDownloadMain"></button><button id="btnCopyCode"></button>
      <button id="btnImportCode"></button><button id="btnResetCode"></button>
      <button id="btnValidateConfig" hidden></button><span id="configValidation" hidden></span>
      <div id="editor"></div>`;
    Editor.mainSession = { getValue: () => code };
    Editor.configSession = { getValue: () => "BASE_SPEED = 0\n" };
    Editor.instance.setSession = jest.fn();
    Editor.instance.focus = jest.fn();
    await Editor.showFile("config.py");
    expect(Editor.instance.setSession).toHaveBeenCalledWith(
      Editor.configSession,
    );
    expect(
      document.getElementById("configTab").getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      document.getElementById("editor").getAttribute("aria-labelledby"),
    ).toBe("configTab");
    expect(document.getElementById("btnDownloadMain").title).toBe(
      "Download config.py",
    );
    expect(document.getElementById("editorFilename")).toBeNull();
    expect(document.getElementById("btnValidateConfig").hidden).toBe(false);
    await Editor.showFile("main.py");
    expect(document.getElementById("btnValidateConfig").hidden).toBe(true);
  });

  test("Validate checks the config buffer without running main", async () => {
    const source = "BASE_SPEED = 185\n";
    Editor.activeFile = "config.py";
    Editor.configSession = {
      getValue: () => source,
      clearAnnotations: jest.fn(),
    };
    const validate = jest
      .spyOn(ConfigStore, "validate")
      .mockResolvedValue(true);
    expect(await Editor.validateConfig()).toBe(true);
    expect(validate).toHaveBeenCalledWith(source);
    expect(document.getElementById("configValidation").textContent).toBe(
      "Config valid",
    );
    expect(document.getElementById("btnValidateConfig").disabled).toBe(false);
    expect(App.isRunning).toBeUndefined();
  });

  test("Validate marks invalid config, not main, and skips running simulations", async () => {
    const source = 'BASE_SPEED = "fast"\n';
    Editor.activeFile = "config.py";
    Editor.mainSession = { setAnnotations: jest.fn() };
    Editor.configSession = {
      getValue: () => source,
      clearAnnotations: jest.fn(),
      setAnnotations: jest.fn(),
    };
    Editor.instance.gotoLine = jest.fn();
    const validate = jest
      .spyOn(ConfigStore, "validate")
      .mockRejectedValue(new Error("BASE_SPEED must be an integer"));
    jest
      .spyOn(ConfigStore, "errorLocation")
      .mockReturnValue({ line: 1, message: "BASE_SPEED must be an integer" });
    expect(await Editor.validateConfig()).toBe(false);
    expect(Editor.configSession.setAnnotations).toHaveBeenCalledWith([
      {
        row: 0,
        column: 0,
        text: "BASE_SPEED must be an integer",
        type: "error",
      },
    ]);
    expect(Editor.mainSession.setAnnotations).not.toHaveBeenCalled();
    expect(document.getElementById("configValidation").textContent).toBe(
      "Invalid config",
    );
    App.isRunning = true;
    expect(await Editor.validateConfig()).toBe(false);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(document.getElementById("configValidation").textContent).toBe(
      "Stop before validating",
    );
  });

  test("config errors stay in their session and clear after editing", () => {
    document.body.innerHTML = '<button id="configTab">config.py</button>';
    Editor.mainSession = { setAnnotations: jest.fn() };
    Editor.configSession = {
      setAnnotations: jest.fn(),
      clearAnnotations: jest.fn(),
    };
    Editor.markConfigError({ line: 10, message: "Invalid BASE_SPEED" });
    expect(Editor.configSession.setAnnotations).toHaveBeenCalledWith([
      { row: 9, column: 0, text: "Invalid BASE_SPEED", type: "error" },
    ]);
    expect(Editor.mainSession.setAnnotations).not.toHaveBeenCalled();
    expect(document.getElementById("configTab").title).toContain(
      "config.py:10:",
    );
    Editor.clearConfigError();
    expect(Editor.configError).toBeNull();
    expect(Editor.configSession.clearAnnotations).toHaveBeenCalled();
    expect(document.getElementById("configTab").title).toBe("");
  });
});
