/**
 * AIDriver Simulator - Editor Module
 * ACE Editor configuration and management
 */

const STARTER_VERSION = "v4";

const Editor = {
  instance: null,
  mainSession: null,
  configSession: null,
  activeFile: "main.py",
  requestedFile: "main.py",
  configError: null,
  markers: [],
  executingLine: null,
  saveTimeout: null,

  /**
   * Instantiate and configure the ACE editor, wiring auto-save and validation handlers.
   * @returns {Editor} Fluent reference to the module for chaining.
   */
  init() {
    this.instance = ace.edit("editor");
    this.mainSession = this.instance.session;
    this.configSession = null;
    this.activeFile = "main.py";
    this.requestedFile = "main.py";
    this.configError = null;

    // Configure theme and mode
    this.instance.setTheme("ace/theme/monokai");
    this.instance.session.setMode("ace/mode/python");

    // Editor options
    this.instance.setOptions({
      fontSize: "14px",
      showPrintMargin: false,
      tabSize: 4,
      useSoftTabs: true,
      wrap: true,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: false,
      showGutter: true,
      highlightActiveLine: true,
      displayIndentGuides: true,
    });

    // Set up auto-save and validation on change (debounced)
    this.instance.on("change", () => {
      this.debouncedSave();
      if (this.activeFile === "main.py") this.debouncedValidate();
      else this.clearConfigError();
    });

    // Add custom key bindings
    this.setupKeyBindings();

    console.log("[Editor] Initialized");
    return this;
  },

  /**
   * Register application-specific keyboard shortcuts on the ACE command manager.
   * @returns {void}
   */
  setupKeyBindings() {
    // Ctrl+Enter to run code
    this.instance.commands.addCommand({
      name: "runCode",
      bindKey: { win: "Ctrl-Enter", mac: "Cmd-Enter" },
      exec: () => {
        if (typeof App !== "undefined" && !App.isRunning) {
          runCode();
        }
      },
    });

    // Ctrl+. to stop execution
    this.instance.commands.addCommand({
      name: "stopCode",
      bindKey: { win: "Ctrl-.", mac: "Cmd-." },
      exec: () => {
        if (typeof App !== "undefined" && App.isRunning) {
          stopExecution();
        }
      },
    });
  },

  /**
   * Retrieve the current Python source from the editor session.
   * @returns {string} Full editor contents.
   */
  getCode() {
    return this.mainSession
      ? this.mainSession.getValue()
      : this.instance.getValue();
  },

  getActiveCode() {
    return this.instance.getValue();
  },

  getMainSession() {
    return this.mainSession || this.instance.session;
  },

  switchFile(filename) {
    const session =
      filename === "main.py"
        ? this.mainSession
        : filename === "config.py"
          ? this.configSession
          : null;
    if (!session) throw new Error("File is not loaded: " + filename);
    this.flushSave();
    this.activeFile = filename;
    this.instance.setSession(session);
    this.instance.focus();
  },

  async loadConfig() {
    if (this.configSession) return;
    await ConfigStore.init();
    if (this.configSession) return;
    this.configSession = ace.createEditSession(
      ConfigStore.source,
      "ace/mode/python",
    );
    this.configSession.setTabSize(4);
    this.configSession.setUseSoftTabs(true);
    this.configSession.setUseWrapMode(true);
    if (this.configError) this.markConfigError(this.configError);
  },

  async showFile(filename, line = null) {
    this.requestedFile = filename;
    if (filename === "config.py") await this.loadConfig();
    if (this.requestedFile !== filename) return;
    this.switchFile(filename);
    document.querySelectorAll("[data-editor-file]").forEach((tab) => {
      const active = tab.dataset.editorFile === filename;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.getElementById("editorFilename").textContent = filename;
    document
      .getElementById("editor")
      .setAttribute(
        "aria-labelledby",
        filename === "main.py" ? "mainTab" : "configTab",
      );
    for (const [id, command] of [
      ["btnDownloadMain", "Download"],
      ["btnCopyCode", "Copy"],
      ["btnImportCode", "Import"],
      ["btnResetCode", "Reset"],
    ]) {
      const button = document.getElementById(id);
      button.title = `${command} ${filename}`;
      button.setAttribute("aria-label", button.title);
    }
    const url = new URL(window.location.href);
    if (filename === "config.py") url.searchParams.set("file", filename);
    else url.searchParams.delete("file");
    url.searchParams.delete("line");
    window.history.replaceState(null, "", url);
    const targetLine =
      line || (filename === "config.py" && this.configError?.line);
    if (targetLine) this.instance.gotoLine(targetLine, 0, true);
  },

  markConfigError(location) {
    this.configError = location;
    this.configSession?.setAnnotations([
      {
        row: location.line - 1,
        column: 0,
        text: location.message,
        type: "error",
      },
    ]);
    const tab = document.getElementById("configTab");
    if (tab) {
      tab.classList.add("text-warning");
      tab.title = `config.py:${location.line}: ${location.message}`;
    }
  },

  clearConfigError() {
    this.configError = null;
    this.configSession?.clearAnnotations();
    const tab = document.getElementById("configTab");
    if (tab) {
      tab.classList.remove("text-warning");
      tab.removeAttribute("title");
    }
  },

  async importFile(file) {
    if (!file) return;
    const filename = this.activeFile;
    try {
      if (file.size > 65536) throw new Error("File exceeds 64 KB");
      const source = await file.text();
      if (App.isRunning)
        throw new Error("Stop the simulator before importing a file");
      if (filename === "config.py") await ConfigStore.validate(source);
      if (!window.confirm(`Replace ${filename} with ${file.name}?`)) return;
      if (filename === "config.py") {
        this.configSession.setValue(source);
        this.clearConfigError();
        this.debouncedSave();
      } else {
        this.setCode(source);
      }
      this.flushSave();
    } catch (error) {
      DebugPanel.error(`Could not import ${filename}: ${String(error)}`);
    } finally {
      document.getElementById("editorFile").value = "";
    }
  },

  /**
   * Replace the editor contents and reposition the caret as requested.
   * @param {string} code Source text to load.
   * @param {number} [moveCursor=-1] ACE cursor placement flag (-1 top, 1 bottom).
   * @returns {void}
   */
  setCode(code, moveCursor = -1) {
    if (this.activeFile === "config.py") {
      this.mainSession.setValue(code);
      this.debouncedSave();
      this.debouncedValidate();
    } else {
      this.instance.setValue(code, moveCursor);
    }
    this.clearAllMarkers();
  },

  /**
   * Remove all text and markers from the editor.
   * @returns {void}
   */
  clear() {
    this.setCode("");
  },

  /**
   * Add an error annotation and highlight to the specified line.
   * @param {number} line One-based line number.
   * @param {string} message Description of the error.
   * @returns {void}
   */
  markError(line, message) {
    const lineIndex = line - 1; // ACE uses 0-indexed lines
    const session = this.getMainSession();

    // Add annotation (shows in gutter)
    const annotations = session.getAnnotations();
    annotations.push({
      row: lineIndex,
      column: 0,
      text: message,
      type: "error",
    });
    session.setAnnotations(annotations);

    // Add line highlight marker
    const Range = ace.require("ace/range").Range;
    const markerId = session.addMarker(
      new Range(lineIndex, 0, lineIndex, 1),
      "ace_error-line",
      "fullLine",
      true,
    );
    this.markers.push(markerId);
  },

  /**
   * Add a warning annotation to the specified line without highlighting.
   * @param {number} line One-based line number.
   * @param {string} message Description of the warning.
   * @returns {void}
   */
  markWarning(line, message) {
    const lineIndex = line - 1;
    const session = this.getMainSession();

    const annotations = session.getAnnotations();
    annotations.push({
      row: lineIndex,
      column: 0,
      text: message,
      type: "warning",
    });
    session.setAnnotations(annotations);
  },

  /**
   * Highlight a line to visualize execution progress.
   * @param {?number} line One-based line number, or null to clear the highlight.
   * @returns {void}
   */
  highlightExecutingLine(line) {
    const session = this.getMainSession();
    // Remove previous highlight
    if (this.executingLine !== null) {
      session.removeMarker(this.executingLine);
    }

    if (line === null) {
      this.executingLine = null;
      return;
    }

    const lineIndex = line - 1;
    const Range = ace.require("ace/range").Range;
    this.executingLine = session.addMarker(
      new Range(lineIndex, 0, lineIndex, 1),
      "ace_executing-line",
      "fullLine",
      true,
    );

    // Scroll to line if not visible
    if (this.activeFile === "main.py") {
      this.instance.scrollToLine(lineIndex, true, true);
    }
  },

  /**
   * Alias for highlightExecutingLine used by step-mode playback.
   * @param {number} line One-based line number.
   * @returns {void}
   */
  highlightLine(line) {
    this.highlightExecutingLine(line);
  },

  /**
   * Remove any active line highlight from the editor.
   * @returns {void}
   */
  clearHighlight() {
    this.highlightExecutingLine(null);
  },

  /**
   * Remove annotations, markers, and execution highlights from the session.
   * @returns {void}
   */
  clearAllMarkers() {
    const session = this.getMainSession();
    // Clear annotations
    session.setAnnotations([]);

    // Clear markers
    this.markers.forEach((markerId) => {
      session.removeMarker(markerId);
    });
    this.markers = [];

    // Clear executing line highlight
    this.highlightExecutingLine(null);
  },

  /**
   * Schedule a deferred save operation to persist the editor content.
   * @returns {void}
   */
  debouncedSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.saveCode();
    }, 1000);
  },

  flushSave() {
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
      this.saveCode();
    }
  },

  /**
   * Schedule a deferred validation pass of the editor content.
   * @returns {void}
   */
  debouncedValidate() {
    if (this.validateTimeout) {
      clearTimeout(this.validateTimeout);
    }

    this.validateTimeout = setTimeout(() => {
      this.validateCode();
    }, 500);
  },

  /**
   * Execute validation routines and update UI markers accordingly.
   * @returns {{errors:Array, warnings:Array}} Aggregated validator output.
   */
  validateCode() {
    if (typeof App !== "undefined" && App.isRunning) return;
    if (typeof Validator === "undefined") {
      console.log("[Editor] Validator not available");
      return;
    }

    const code = this.getCode();
    console.log("[Editor] Running validation...");

    // Clear previous validation markers
    this.clearAllMarkers();

    // Run validation
    const result = Validator.validate(code);

    // Also check method usage on AIDriver instances
    const methodWarnings = Validator.validateMethodUsage(code);
    result.warnings.push(...methodWarnings);

    // Check for undefined function calls
    const functionErrors = Validator.validateFunctionCalls(code);
    result.errors.push(...functionErrors);

    // Mark errors
    for (const error of result.errors) {
      this.markError(error.line, error.message);
    }

    // Mark warnings
    for (const warning of result.warnings) {
      this.markWarning(warning.line, warning.message);
    }

    // Update validation status in UI
    if (typeof App !== "undefined" && App.elements && !App.hasRun) {
      const statusEl = App.elements.challengeStatus;
      const runBtn = App.elements.btnRun;

      if (statusEl) {
        if (result.errors.length > 0) {
          statusEl.textContent = `${result.errors.length} error(s)`;
          statusEl.className = "badge bg-danger";
          // Disable Run button when there are errors
          if (runBtn) {
            runBtn.disabled = true;
            runBtn.title = "Fix errors before running";
          }
        } else if (result.warnings.length > 0) {
          statusEl.textContent = `${result.warnings.length} warning(s)`;
          statusEl.className = "badge bg-warning";
          // Enable Run button for warnings (they're not blocking)
          if (runBtn && !App.isRunning && !App.hasRun) {
            runBtn.disabled = false;
            runBtn.title = "Run code";
          }
        } else {
          statusEl.textContent = "Ready";
          statusEl.className = "badge bg-success";
          // Enable Run button when no errors
          if (runBtn && !App.isRunning && !App.hasRun) {
            runBtn.disabled = false;
            runBtn.title = "Run code";
          }
        }
      }
    }

    return result;
  },

  validateTimeout: null,

  /**
   * Persist the current editor contents synchronously.
   * @returns {void}
   */
  saveCode() {
    if (typeof App === "undefined") return;

    const code = this.getCode();
    const key = `aidriver_challenge_${App.currentChallenge}_code_${STARTER_VERSION}`;
    localStorage.setItem(key, code);
    if (this.configSession) {
      ConfigStore.save(this.configSession.getValue());
    }
    console.log(`[Editor] Code saved for challenge ${App.currentChallenge}`);
  },

  /**
   * Fetch previously saved code for a challenge from localStorage.
   * @param {number|string} challengeId Challenge identifier used in the storage key.
   * @returns {string|null} Persisted code or null when absent.
   */
  loadSavedCode(challengeId) {
    const key = `aidriver_challenge_${challengeId}_code_${STARTER_VERSION}`;
    return localStorage.getItem(key);
  },

  /**
   * Remove persisted code for the specified challenge.
   * @param {number|string} challengeId Challenge identifier used in the storage key.
   * @returns {void}
   */
  clearSavedCode(challengeId) {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = null;
    const key = `aidriver_challenge_${challengeId}_code_${STARTER_VERSION}`;
    localStorage.removeItem(key);
  },

  /**
   * Determine whether saved code exists for the given challenge id.
   * @param {number|string} challengeId Challenge identifier.
   * @returns {boolean} True when code is present in storage.
   */
  hasSavedCode(challengeId) {
    const key = `aidriver_challenge_${challengeId}_code_${STARTER_VERSION}`;
    return localStorage.getItem(key) !== null;
  },

  /**
   * Toggle the editor's read-only mode.
   * @param {boolean} readOnly When true the editor prevents edits.
   * @returns {void}
   */
  setReadOnly(readOnly) {
    this.instance.setReadOnly(readOnly);
  },

  /**
   * Move focus to the editor component.
   * @returns {void}
   */
  focus() {
    this.instance.focus();
  },

  /**
   * Recompute editor layout after container size adjustments.
   * @returns {void}
   */
  resize() {
    this.instance.resize();
  },

  /**
   * Report the total number of lines in the current buffer.
   * @returns {number} Active line count.
   */
  getLineCount() {
    return this.getMainSession().getLength();
  },

  /**
   * Retrieve the text content for a specific line.
   * @param {number} line One-based line number.
   * @returns {string} Line contents without trailing newline.
   */
  getLine(line) {
    return this.getMainSession().getLine(line - 1);
  },
};

// Add custom CSS for editor markers
const editorStyles = document.createElement("style");
editorStyles.textContent = `
    .ace_error-line {
        background-color: rgba(255, 68, 68, 0.3);
        position: absolute;
    }
    
    .ace_executing-line {
        background-color: rgba(255, 255, 0, 0.2);
        position: absolute;
    }
    
    .ace_gutter-cell.ace_error {
        background-color: #ff4444;
        color: white;
    }
    
    .ace_gutter-cell.ace_warning {
        background-color: #ffc107;
        color: black;
    }
`;
document.head.appendChild(editorStyles);

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = Editor;
}
