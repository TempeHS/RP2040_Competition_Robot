const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const ConfigStore = require("../../js/config-store");

const root = path.resolve(__dirname, "../../..");

describe("Canonical config deployment", () => {
  test("static site contains the canonical config and frozen-helper source", () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), "robot-site-"));
    try {
      execFileSync(process.execPath, [
        path.join(root, "app/scripts/stage-site.js"),
        output,
      ]);
      for (const relative of [
        "project/config.py",
        "project/lib/config_check.py",
        "project/hardware_test.py",
      ]) {
        expect(fs.readFileSync(path.join(output, relative), "utf8")).toBe(
          fs.readFileSync(path.join(root, relative), "utf8"),
        );
      }
      expect(fs.existsSync(path.join(output, "config.html"))).toBe(true);
      expect(fs.existsSync(path.join(output, "node_modules"))).toBe(false);
      expect(
        fs.existsSync(path.join(output, "_Firmware/THS_Comp_RP2040.uf2")),
      ).toBe(true);
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  });

  test("deployed paths resolve under the site, including project-site prefixes", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, text: async () => "BASE_SPEED = 200\n" });
    expect(await ConfigStore.loadSource("project/config.py")).toBe(
      "BASE_SPEED = 200\n",
    );
    expect(fetch).toHaveBeenCalledWith("project/config.py", {
      cache: "no-cache",
    });
    expect(
      new URL("project/config.py", "https://example.test/robot/config.html")
        .pathname,
    ).toBe("/robot/project/config.py");
  });

  test("a repository-root dev server can load canonical files without copies", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "# canonical source\n",
      });
    expect(await ConfigStore.loadSource("project/config.py")).toBe(
      "# canonical source\n",
    );
    expect(fetch).toHaveBeenLastCalledWith("../project/config.py", {
      cache: "no-cache",
    });
  });
});
