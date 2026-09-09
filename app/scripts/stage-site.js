const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const output = path.resolve(process.argv[2] || path.join(root, "_site"));
if (
  output === root ||
  root.startsWith(output + path.sep) ||
  output === path.join(root, "app") ||
  output.startsWith(path.join(root, "project") + path.sep)
) {
  throw new Error("Choose a separate generated site directory");
}
fs.mkdirSync(output, { recursive: true });
for (const entry of fs.readdirSync(path.join(root, "app"), {
  withFileTypes: true,
})) {
  if (
    entry.name.endsWith(".html") ||
    ["assets", "css", "js", "starter-code", "answers"].includes(entry.name)
  ) {
    fs.cpSync(
      path.join(root, "app", entry.name),
      path.join(output, entry.name),
      { recursive: true },
    );
  }
}
for (const directory of ["docs", "_Firmware"]) {
  fs.cpSync(path.join(root, directory), path.join(output, directory), {
    recursive: true,
  });
}
for (const file of [
  "main.py",
  "hardware_test.py",
  "config.py",
  "lib/config_check.py",
]) {
  const destination = path.join(output, "project", file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, "project", file), destination);
}
console.log("Staged simulator and canonical Python sources in " + output);
