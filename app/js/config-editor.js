/* global ace, bootstrap, ConfigStore */
const ConfigEditor = {
  instance: null,
  saveTimeout: null,
  sections: [],

  async init() {
    const params = new URLSearchParams(window.location.search);
    document.getElementById("backToMain").href =
      "simulator.html?challenge=" +
      encodeURIComponent(params.get("challenge") || "1");
    try {
      await ConfigStore.init();
      this.instance = ace.edit("configEditor");
      this.instance.setTheme("ace/theme/monokai");
      this.instance.session.setMode("ace/mode/python");
      this.instance.setOptions({
        fontSize: "14px",
        showPrintMargin: false,
        tabSize: 4,
        useSoftTabs: true,
        wrap: true,
      });
      this.instance.setValue(ConfigStore.source, -1);
      this.instance.on("change", () => {
        clearTimeout(this.saveTimeout);
        this.status("Unsaved changes");
        this.saveTimeout = setTimeout(() => this.flushSave(), 300);
      });
      this.updateSections();
      this.status("Saved locally");
      document
        .getElementById("configSection")
        .addEventListener("change", (event) => {
          this.instance.gotoLine(Number(event.target.value), 0, true);
          this.instance.focus();
        });
      document
        .getElementById("foldConfig")
        .addEventListener("click", () => this.foldSections());
      document
        .getElementById("expandConfig")
        .addEventListener("click", () => this.instance.session.unfold());
      document
        .getElementById("validateConfig")
        .addEventListener("click", () => this.validate());
      document
        .getElementById("downloadConfig")
        .addEventListener("click", () => {
          this.flushSave();
          ConfigStore.download(this.instance.getValue(), "config.py");
        });
      document
        .getElementById("importConfig")
        .addEventListener("click", () =>
          document.getElementById("configFile").click(),
        );
      document
        .getElementById("configFile")
        .addEventListener("change", (event) =>
          this.importFile(event.target.files[0]),
        );
      document
        .getElementById("resetConfig")
        .addEventListener("click", () =>
          bootstrap.Modal.getOrCreateInstance(
            document.getElementById("resetConfigModal"),
          ).show(),
        );
      document
        .getElementById("confirmResetConfig")
        .addEventListener("click", () => {
          this.instance.setValue(ConfigStore.defaultSource, -1);
          this.flushSave();
          bootstrap.Modal.getInstance(
            document.getElementById("resetConfigModal"),
          ).hide();
          this.validate();
        });
      document
        .getElementById("backToMain")
        .addEventListener("click", () => this.flushSave());
      window.addEventListener("pagehide", () => this.flushSave());
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.flushSave();
      });
      window.addEventListener("resize", () => this.instance.resize());
      await this.validate();
      if (params.has("line"))
        this.instance.gotoLine(Number(params.get("line")) || 1, 0, true);
    } catch (error) {
      this.status("Not saved");
      this.showError(error);
    }
  },

  status(message) {
    document.getElementById("configSaveStatus").textContent = message;
  },

  flushSave() {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = null;
    if (!this.instance) return false;
    try {
      ConfigStore.save(this.instance.getValue());
      this.updateSections();
      this.status("Saved locally");
      return true;
    } catch (error) {
      this.status("Not saved");
      this.showError(error);
      return false;
    }
  },

  updateSections() {
    const lines = this.instance.getValue().split("\n");
    this.sections = lines.flatMap((line, index) =>
      line.startsWith("# ") ? [{ title: line.slice(2), row: index }] : [],
    );
    const select = document.getElementById("configSection");
    const selected = select.value;
    select.replaceChildren(
      ...this.sections.map(
        (section) => new Option(section.title, section.row + 1),
      ),
    );
    if (this.sections.some((section) => String(section.row + 1) === selected))
      select.value = selected;
  },

  foldSections() {
    this.updateSections();
    this.instance.session.unfold();
    const Range = ace.require("ace/range").Range;
    this.sections.forEach((section, index) => {
      const lastRow =
        index + 1 < this.sections.length
          ? this.sections[index + 1].row - 1
          : this.instance.session.getLength() - 1;
      if (lastRow > section.row) {
        this.instance.session.addFold(
          " ...",
          new Range(
            section.row,
            this.instance.session.getLine(section.row).length,
            lastRow,
            this.instance.session.getLine(lastRow).length,
          ),
        );
      }
    });
  },

  async validate() {
    if (!this.instance) return false;
    this.flushSave();
    const source = this.instance.getValue();
    try {
      await ConfigStore.validate(source);
      if (source !== this.instance.getValue()) return false;
      this.instance.session.clearAnnotations();
      const result = document.getElementById("configResult");
      result.textContent = "Configuration valid";
      result.className = "small mt-2 text-success";
      return true;
    } catch (error) {
      this.showError(error, source);
      return false;
    }
  },

  showError(error, source) {
    const location = ConfigStore.errorLocation(
      error,
      source || this.instance?.getValue(),
    );
    const result = document.getElementById("configResult");
    result.textContent = `${location.filename}:${location.line}: ${location.message}`;
    result.className = "small mt-2 text-danger";
    if (this.instance)
      this.instance.session.setAnnotations([
        {
          row: location.line - 1,
          column: 0,
          text: location.message,
          type: "error",
        },
      ]);
  },

  async importFile(file) {
    if (!file) return;
    try {
      if (file.size > 65536) throw new Error("Config file exceeds 64 KB");
      const source = await file.text();
      await ConfigStore.validate(source);
      if (
        !window.confirm("Replace shared configuration with " + file.name + "?")
      )
        return;
      this.instance.setValue(source, -1);
      this.flushSave();
      await this.validate();
    } catch (error) {
      this.showError(error);
    } finally {
      document.getElementById("configFile").value = "";
    }
  },
};

if (typeof module !== "undefined" && module.exports)
  module.exports = ConfigEditor;
document.addEventListener("DOMContentLoaded", () => ConfigEditor.init());
