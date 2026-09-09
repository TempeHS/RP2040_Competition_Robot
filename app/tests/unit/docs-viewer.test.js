const fs = require("fs");
const path = require("path");
const vm = require("vm");

describe("Documentation viewer paths", () => {
  let context;

  beforeEach(() => {
    document.body.innerHTML =
      '<div id="loadingSpinner"></div><div id="markdownContent"></div><div id="errorMessage"></div><span id="errorText"></span>';
    const html = fs.readFileSync(
      path.resolve(__dirname, "../../docs.html"),
      "utf8",
    );
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const source = [...parsed.querySelectorAll("script:not([src])")].find(
      (script) => script.textContent.includes("const DOCS_BASE"),
    ).textContent;
    context = {
      console,
      URL,
      URLSearchParams,
      DOMParser,
      document: {
        getElementById: (id) => document.getElementById(id),
        querySelectorAll: () => [],
        addEventListener: jest.fn(),
      },
      window: {
        location: new URL("https://example.test/robot/docs.html"),
        addEventListener: jest.fn(),
        history: { pushState: jest.fn() },
      },
      marked: { setOptions: jest.fn(), parse: jest.fn((value) => value) },
      DOMPurify: { sanitize: (value) => value },
      mermaid: { run: jest.fn().mockResolvedValue() },
      fetch: jest.fn(),
    };
    vm.createContext(context);
    vm.runInContext(source, context);
  });

  test("development loading falls back to the root docs folder", async () => {
    context.window.location = new URL("https://example.test/app/docs.html");
    context.fetch
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "<h1>Challenge 1</h1>",
      });
    await context.loadMarkdown("Challenge_1");
    expect(context.fetch).toHaveBeenCalledTimes(2);
    expect(document.getElementById("markdownContent").textContent).toContain(
      "Challenge 1",
    );
    expect(document.getElementById("errorMessage").style.display).toBe("none");
  });

  test("staged Markdown links and assets retain the project-site prefix", async () => {
    context.fetch.mockResolvedValue({
      ok: true,
      text: async () =>
        '<a id="next" href="Challenge_2.md#tuning">Next</a><a id="config" href="../project/config.py">Config</a><a id="main" href="../app/starter-code/challenge-1.py">Main</a><img id="photo" src="images/prep_1.png"><a id="external" href="https://elsewhere.test/notes.md">External</a>',
    });
    await context.loadMarkdown("Challenge_1");
    const target = (id, attribute) =>
      new URL(
        document.getElementById(id).getAttribute(attribute),
        context.window.location.href,
      );
    expect(target("next", "href").pathname).toBe("/robot/docs.html");
    expect(target("next", "href").searchParams.get("doc")).toBe("Challenge_2");
    expect(target("next", "href").hash).toBe("#tuning");
    expect(target("config", "href").pathname).toBe("/robot/project/config.py");
    expect(target("main", "href").pathname).toBe(
      "/robot/starter-code/challenge-1.py",
    );
    expect(target("photo", "src").pathname).toBe(
      "/robot/docs/images/prep_1.png",
    );
    expect(target("external", "href").origin).toBe("https://elsewhere.test");
  });
});
