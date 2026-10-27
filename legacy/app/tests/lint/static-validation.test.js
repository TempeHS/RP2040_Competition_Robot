const fs = require("fs");
const path = require("path");
const glob = require("glob");
const { ESLint } = require("eslint");
const { HTMLHint } = require("htmlhint");

jest.setTimeout(60000);

const appRoot = path.resolve(__dirname, "..", "..");
const htmlHintConfigPath = path.join(appRoot, ".htmlhintrc");
const htmlHintConfig = fs.existsSync(htmlHintConfigPath)
  ? JSON.parse(fs.readFileSync(htmlHintConfigPath, "utf8"))
  : {};

const globOptions = {
  cwd: appRoot,
  absolute: true,
  nodir: true,
  ignore: ["node_modules/**", "coverage/**", "assets/**", "lcov-report/**"],
};

describe("Static validation", () => {
  test("JavaScript files pass ESLint", async () => {
    const eslint = new ESLint({ cwd: appRoot });
    const results = await eslint.lintFiles(["**/*.js"]);

    const errorResults = ESLint.getErrorResults(results);
    if (errorResults.length > 0) {
      const formatter = await eslint.loadFormatter("stylish");
      const output = formatter.format(errorResults);
      throw new Error(`ESLint reported errors\n${output}`);
    }
  });

  test("HTML files pass HTMLHint", () => {
    const htmlFiles = glob.sync("**/*.html", globOptions);
    const failures = [];

    htmlFiles.forEach((file) => {
      const source = fs.readFileSync(file, "utf8");
      const messages = HTMLHint.verify(source, htmlHintConfig);

      if (messages.length > 0) {
        const relativePath = path.relative(appRoot, file);
        const formatted = messages
          .map((msg) => `${relativePath}:${msg.line}:${msg.col} ${msg.message}`)
          .join("\n");
        failures.push(formatted);
      }
    });

    if (failures.length > 0) {
      throw new Error(`HTMLHint reported errors\n${failures.join("\n\n")}`);
    }
  });
});
