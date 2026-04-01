/**
 * AIDriver Simulator - Editor Module
 * ACE Editor configuration and management
 */

const Editor = {
  instance: null,
  markers: [],
  executingLine: null,
  saveTimeout: null,

  /**
   * Instantiate and configure the ACE editor, wiring auto-save and validation handlers.
   * @returns {Editor} Fluent reference to the module for chaining.
   */
  init() {
    this.instance = ace.edit("editor");

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
      this.debouncedValidate();
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
    return this.instance.getValue();
  },

  /**
   * Replace the editor contents and reposition the caret as requested.
   * @param {string} code Source text to load.
   * @param {number} [moveCursor=-1] ACE cursor placement flag (-1 top, 1 bottom).
   * @returns {void}
   */
  setCode(code, moveCursor = -1) {
    this.instance.setValue(code, moveCursor);
    this.clearAllMarkers();
  },

  /**
   * Remove all text and markers from the editor.
   * @returns {void}
   */
  clear() {
    this.instance.setValue("", -1);
    this.clearAllMarkers();
  },

  /**
   * Add an error annotation and highlight to the specified line.
   * @param {number} line One-based line number.
   * @param {string} message Description of the error.
   * @returns {void}
   */
  markError(line, message) {
    const lineIndex = line - 1; // ACE uses 0-indexed lines

    // Add annotation (shows in gutter)
    const annotations = this.instance.session.getAnnotations();
    annotations.push({
      row: lineIndex,
      column: 0,
      text: message,
      type: "error",
    });
    this.instance.session.setAnnotations(annotations);

    // Add line highlight marker
    const Range = ace.require("ace/range").Range;
    const markerId = this.instance.session.addMarker(
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

    const annotations = this.instance.session.getAnnotations();
    annotations.push({
      row: lineIndex,
      column: 0,
      text: message,
      type: "warning",
    });
    this.instance.session.setAnnotations(annotations);
  },

  /**
   * Highlight a line to visualize execution progress.
   * @param {?number} line One-based line number, or null to clear the highlight.
   * @returns {void}
   */
  highlightExecutingLine(line) {
    // Remove previous highlight
    if (this.executingLine !== null) {
      this.instance.session.removeMarker(this.executingLine);
    }

    if (line === null) {
      this.executingLine = null;
      return;
    }

    const lineIndex = line - 1;
    const Range = ace.require("ace/range").Range;
    this.executingLine = this.instance.session.addMarker(
      new Range(lineIndex, 0, lineIndex, 1),
      "ace_executing-line",
      "fullLine",
      true,
    );

    // Scroll to line if not visible
    this.instance.scrollToLine(lineIndex, true, true);
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
    // Clear annotations
    this.instance.session.setAnnotations([]);

    // Clear markers
    this.markers.forEach((markerId) => {
      this.instance.session.removeMarker(markerId);
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
      this.saveCode();
    }, 1000);
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
    if (typeof App !== "undefined" && App.elements) {
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
    const key = `aidriver_challenge_${App.currentChallenge}_code`;
    localStorage.setItem(key, code);
    console.log(`[Editor] Code saved for challenge ${App.currentChallenge}`);
  },

  /**
   * Fetch previously saved code for a challenge from localStorage.
   * @param {number|string} challengeId Challenge identifier used in the storage key.
   * @returns {string|null} Persisted code or null when absent.
   */
  loadSavedCode(challengeId) {
    const key = `aidriver_challenge_${challengeId}_code`;
    return localStorage.getItem(key);
  },

  /**
   * Remove persisted code for the specified challenge.
   * @param {number|string} challengeId Challenge identifier used in the storage key.
   * @returns {void}
   */
  clearSavedCode(challengeId) {
    const key = `aidriver_challenge_${challengeId}_code`;
    localStorage.removeItem(key);
  },

  /**
   * Determine whether saved code exists for the given challenge id.
   * @param {number|string} challengeId Challenge identifier.
   * @returns {boolean} True when code is present in storage.
   */
  hasSavedCode(challengeId) {
    const key = `aidriver_challenge_${challengeId}_code`;
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
    return this.instance.session.getLength();
  },

  /**
   * Retrieve the text content for a specific line.
   * @param {number} line One-based line number.
   * @returns {string} Line contents without trailing newline.
   */
  getLine(line) {
    return this.instance.session.getLine(line - 1);
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
