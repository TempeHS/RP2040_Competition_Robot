/**
 * @jest-environment jsdom
 *
 * Static-asset and navbar-consistency tests.
 *
 * Catches things like:
 *   - one navbar referencing a firmware filename the others don't
 *   - a navbar dropdown linking to a file that no longer exists
 *   - a <script src="..."> pointing at a missing local JS module
 *
 * The deploy workflow (.github/workflows/deploy-pages.yml) copies
 * `_Firmware/` and `docs/` into `app/` before publishing, so any path
 * under those two folders is treated as resolvable when the file exists
 * at the repo root.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "../../..");
const APP_ROOT = path.join(__dirname, "../..");

const PAGES_WITH_NAV = ["docs.html", "simulator.html"];
// Pages that ship a (possibly redirect-only) HTML file but are not
// expected to render the full primary navbar.
const REDIRECT_PAGES = ["index.html", "pid-tuning.html"];

// Required primary nav items every full-navbar page must expose, by id.
const REQUIRED_NAV_IDS = [
  "challengeDocsDropdown",
  "pidTuningDropdown",
  "challengeDropdown",
  "downloadsDropdown",
];

function loadDoc(file) {
  const html = fs.readFileSync(path.join(APP_ROOT, file), "utf8");
  // jest-environment-jsdom exposes DOMParser as a global.
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

/**
 * Resolve a relative href against the app/ root. The deploy step copies
 * `_Firmware/` and `docs/` into `app/`, so look in the repo root for
 * those prefixes if the file isn't already inside app/.
 */
function resolveAsset(href) {
  // Strip query strings and fragments — `style.css?v=7` → `style.css`.
  const clean = href.split("?")[0].split("#")[0];
  const local = path.join(APP_ROOT, clean);
  if (fs.existsSync(local)) return local;
  if (clean.startsWith("_Firmware/") || clean.startsWith("docs/")) {
    const fromRoot = path.join(REPO_ROOT, clean);
    if (fs.existsSync(fromRoot)) return fromRoot;
  }
  return null;
}

function isExternal(href) {
  return /^(https?:|mailto:|tel:|#|javascript:)/i.test(href);
}

describe("Navbar consistency across pages", () => {
  describe.each(PAGES_WITH_NAV)("%s", (file) => {
    let doc;
    let nav;

    beforeAll(() => {
      doc = loadDoc(file);
      nav = doc.querySelector("nav.navbar");
    });

    test("has a top-level navbar element", () => {
      expect(nav).not.toBeNull();
    });

    test.each(REQUIRED_NAV_IDS)("contains required nav item #%s", (id) => {
      expect(nav.querySelector(`#${id}`)).not.toBeNull();
    });

    test("brand links to index.html", () => {
      const brand = nav.querySelector(".navbar-brand");
      expect(brand).not.toBeNull();
      expect(brand.getAttribute("href")).toBe("index.html");
    });

    test("includes the MicroPython Lab external link", () => {
      const links = Array.from(nav.querySelectorAll("a.nav-link"));
      const lab = links.find((a) =>
        /MicroPython Lab/i.test(a.textContent || ""),
      );
      expect(lab).toBeDefined();
      expect(lab.getAttribute("href")).toMatch(/^https?:\/\//);
    });

    test("every internal navbar href resolves to an existing file or anchor", () => {
      const broken = [];
      for (const a of nav.querySelectorAll("a[href]")) {
        const href = a.getAttribute("href");
        if (!href || isExternal(href)) continue;
        // In-page anchors / Bootstrap toggles are not file refs.
        if (a.hasAttribute("data-bs-toggle")) continue;
        // For navigation links (e.g. docs.html?doc=Challenge_1) only the
        // pathname matters for existence.
        const file = href.split("?")[0].split("#")[0];
        if (!file) continue;
        if (!resolveAsset(file))
          broken.push({ href, text: a.textContent.trim() });
      }
      expect(broken).toEqual([]);
    });
  });

  test("Firmware download paths agree across pages", () => {
    const firmwareLinks = {};
    for (const file of PAGES_WITH_NAV) {
      const doc = loadDoc(file);
      const link = doc.querySelector(
        'a[href*="_Firmware/"][href$=".uf2"]:not([href*="Brick_recovery"]):not([href*="PiPico"])',
      );
      firmwareLinks[file] = link ? link.getAttribute("href") : null;
    }
    const unique = new Set(Object.values(firmwareLinks).filter(Boolean));
    expect({ firmwareLinks, unique: [...unique] }).toMatchObject({
      unique: [expect.stringMatching(/^_Firmware\/.+\.uf2$/)],
    });
    // And the file actually exists.
    const filename = [...unique][0];
    expect(resolveAsset(filename)).not.toBeNull();
  });

  test("Required nav items appear in the same order on every page", () => {
    const orderPerPage = PAGES_WITH_NAV.map((file) => {
      const doc = loadDoc(file);
      const nav = doc.querySelector("nav.navbar");
      const order = [];
      for (const id of REQUIRED_NAV_IDS) {
        const el = nav.querySelector(`#${id}`);
        if (el) order.push(id);
      }
      return order;
    });
    // All pages must share the same ordering.
    const firstJson = JSON.stringify(orderPerPage[0]);
    for (const o of orderPerPage) {
      expect(JSON.stringify(o)).toBe(firstJson);
    }
  });

  test("PID Tuning dropdown links to one docs.html page per .md guide", () => {
    const expectedDocs = [
      "PID_Real_World_Tuning_Quickstart",
      "PID_Front_Distance_Tuning_Quickstart",
      "PID_Turn_Tuning_Quickstart",
    ];
    for (const file of PAGES_WITH_NAV) {
      const doc = loadDoc(file);
      const items = Array.from(
        doc.querySelectorAll(
          '[aria-labelledby="pidTuningDropdown"] a.dropdown-item',
        ),
      );
      const hrefs = items.map((a) => a.getAttribute("href"));
      expect({ file, hrefs }).toMatchObject({
        hrefs: expectedDocs.map((name) => `docs.html?doc=${name}`),
      });
      for (const name of expectedDocs) {
        expect(resolveAsset(`docs/${name}.md`)).not.toBeNull();
      }
    }
  });

  test("the legacy pid-tuning.html still resolves and forwards to a PID guide", () => {
    const doc = loadDoc("pid-tuning.html");
    const refresh = doc.querySelector('meta[http-equiv="refresh" i]');
    expect(refresh).not.toBeNull();
    expect(refresh.getAttribute("content")).toMatch(/docs\.html\?doc=PID_/);
  });
});

describe("HTML script and stylesheet references resolve", () => {
  describe.each([...REDIRECT_PAGES, ...PAGES_WITH_NAV])("%s", (file) => {
    test('every local <script src="…"> file exists', () => {
      const doc = loadDoc(file);
      const broken = [];
      for (const s of doc.querySelectorAll("script[src]")) {
        const src = s.getAttribute("src");
        if (isExternal(src)) continue;
        if (!resolveAsset(src)) broken.push(src);
      }
      expect(broken).toEqual([]);
    });

    test('every local <link rel="stylesheet"> file exists', () => {
      const doc = loadDoc(file);
      const broken = [];
      for (const l of doc.querySelectorAll('link[rel="stylesheet"][href]')) {
        const href = l.getAttribute("href");
        if (isExternal(href)) continue;
        if (!resolveAsset(href)) broken.push(href);
      }
      expect(broken).toEqual([]);
    });
  });
});
