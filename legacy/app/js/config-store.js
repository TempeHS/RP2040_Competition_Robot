const ConfigStore = {
  key: "aidriver_shared_config",
  source: null,
  defaultSource: null,
  checkSource: null,
  loading: null,

  async loadSource(path) {
    for (const location of [path, "../" + path]) {
      const response = await fetch(location, { cache: "no-cache" });
      if (response.ok) return response.text();
      if (response.status !== 404)
        throw new Error(
          "Could not load " + path + " (HTTP " + response.status + ")",
        );
    }
    throw new Error("Could not find " + path);
  },

  async init() {
    if (!this.loading) {
      this.loading = Promise.all([
        this.loadSource("project/config.py"),
        this.loadSource("project/lib/config_check.py"),
      ])
        .then((sources) => {
          [this.defaultSource, this.checkSource] = sources;
          this.source = localStorage.getItem(this.key) ?? this.defaultSource;
          return this;
        })
        .catch((error) => {
          this.loading = null;
          throw error;
        });
    }
    return this.loading;
  },

  save(source) {
    localStorage.setItem(this.key, source);
    this.source = source;
  },

  async snapshot() {
    await this.init();
    const source = localStorage.getItem(this.key) ?? this.source;
    this.source = source;
    try {
      await this.validate(source);
    } catch (error) {
      const location = this.errorLocation(error, source);
      error.filename = location.filename;
      error.lineNumber = location.line;
      throw error;
    }
    return { source, checkSource: this.checkSource };
  },

  inspect(source) {
    if (!Sk.__future__) Sk.configure({ __future__: Sk.python3 });
    const parsed = Sk.parse("config.py", source);
    const tree = Sk.astFromParse(parsed.cst, "config.py", parsed.flags);
    const definitions = new Map();
    const text = (value) =>
      typeof value === "string" ? value : Sk.ffi.remapToJs(value);
    const fail = (node, message) => {
      const error = new Error(message);
      error.filename = "config.py";
      error.lineNumber = node.lineno || 1;
      throw error;
    };
    const expression = (node) => {
      if (["Num", "Str", "NameConstant"].includes(node._astname)) return;
      if (node._astname === "Name") {
        const name = text(node.id);
        if (["True", "False", "None"].includes(name) || definitions.has(name))
          return;
      }
      if (
        node._astname === "BinOp" &&
        ["Add", "Sub", "Mult", "Div", "FloorDiv", "Mod"].includes(
          node.op.prototype?._astname || node.op._astname,
        )
      ) {
        expression(node.left);
        expression(node.right);
        return;
      }
      if (
        node._astname === "UnaryOp" &&
        ["UAdd", "USub"].includes(
          node.op.prototype?._astname || node.op._astname,
        )
      ) {
        expression(node.operand);
        return;
      }
      fail(
        node,
        "Config values must be scalar constants or arithmetic using earlier settings",
      );
    };
    tree.body.forEach((statement, index) => {
      if (
        index === 0 &&
        statement._astname === "Expr" &&
        statement.value._astname === "Str"
      )
        return;
      if (
        statement._astname !== "Assign" ||
        statement.targets.length !== 1 ||
        statement.targets[0]._astname !== "Name"
      ) {
        fail(statement, "Config must contain only setting assignments");
      }
      const name = text(statement.targets[0].id);
      if (name.startsWith("_") || definitions.has(name))
        fail(statement, "Duplicate or reserved setting: " + name);
      expression(statement.value);
      definitions.set(name, statement.lineno);
    });
    return definitions;
  },

  register(snapshot) {
    Sk.builtinFiles = Sk.builtinFiles || { files: {} };
    Sk.builtinFiles.files["src/lib/config.py"] = snapshot.source;
    Sk.builtinFiles.files["src/lib/config_check.py"] = snapshot.checkSource;
    for (const name of ["config", "config_check"]) {
      if (Sk.sysmodules && Sk.sysmodules.mp$del_subscript) {
        try {
          Sk.sysmodules.mp$del_subscript(new Sk.builtin.str(name));
        } catch (_) {
          // An uncached module needs no invalidation.
        }
      }
    }
  },

  async validate(source) {
    this.inspect(source);
    await this.init();
    Sk.configure({
      output: () => {},
      read: (filename) => {
        const content = Sk.builtinFiles.files[filename];
        if (content !== undefined) return content;
        throw new Sk.builtin.ImportError("No module named " + filename);
      },
      __future__: Sk.python3,
      execLimit: 1000,
      killableWhile: true,
      killableFor: true,
    });
    this.register({ source, checkSource: this.checkSource });
    await Sk.misceval.asyncToPromise(() =>
      Sk.importMainWithBody(
        "config_validation",
        false,
        "import config\nfrom config_check import validate_config\nvalidate_config(config)\n",
        true,
      ),
    );
    return true;
  },

  errorLocation(error, source = this.source) {
    const traceback = error.traceback || [];
    const frame = traceback.find((entry) =>
      /(^|\/)config\.py$/.test(entry.filename || ""),
    );
    const setting = String(error).match(/config\.([A-Za-z_][A-Za-z_0-9]*)/);
    let line = error.lineNumber || (frame && frame.lineno);
    if (!line && error.args?.v?.[1]?.v?.[1])
      line = Sk.ffi.remapToJs(error.args.v[1].v[1]);
    if (!line && setting && source) {
      try {
        line = this.inspect(source).get(setting[1]);
      } catch (_) {
        line = 1;
      }
    }
    return { filename: "config.py", line: line || 1, message: String(error) };
  },

  download(source, filename) {
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/x-python;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  },
};

if (typeof module !== "undefined" && module.exports)
  module.exports = ConfigStore;
