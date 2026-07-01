# UI Customization

## Entry Points

All simulator UI wiring originates from `init()` in app/js/app.js. During bootstrap the module caches DOM nodes, initialises Bootstrap tooltips, configures the ACE editor, and renders the arena canvas. Custom UI additions should either:

- Extend `cacheElements()` with the new control IDs so downstream helpers can reference them.
- Hook into `setupEventListeners()` to attach behaviour at load time.
- Update the HTML in app/index.html to place new controls inside the existing layout containers (`#controls`, etc.).

## Styling Panels

Global styles live in app/css/style.css. To tweak the appearance of panels or buttons:

- Adjust Bootstrap utility classes inside the HTML template for quick colour or spacing changes.
- Override or add selectors in the stylesheet (e.g., `.debug-panel`, `.arena-container`) to reshape components.
- Keep the canvas container square; `resizeCanvas()` reads the container dimensions and picks the smaller edge to preserve a 1:1 arena.

## Debug Panel

`DebugPanel` handles all console-like output. To change formatting:

1. Edit the colour assignments inside `DebugPanel.log()` to re-theme success/error/info lines.
2. Increase `DebugPanel.maxLines` if a longer history is required.
3. Call `DebugPanel.separator()` to insert custom markers when integrating new subsystems.

Because the logger runs independently of `console.log`, UI messages surface reliably even when developers mute browser logging.

## Editor Surface

The ACE editor configuration in app/js/editor.js surfaces key shims for curriculum tweaks:

- Swap the theme via `this.instance.setTheme("ace/theme/<theme>")`.
- Change font sizing or wrapping options inside `setOptions()`.
- Register additional keyboard shortcuts in `setupKeyBindings()`; commands have access to global helpers like `runCode()` and `stopExecution()`.

Remember to adjust CSS (`#editor`) if you resize the container so the editor remains responsive.

## Adding New Panels

When introducing a new control surface (e.g., telemetry charts):

1. Insert the markup into app/index.html under the `#rightColumn` stack so it scrolls alongside existing widgets.
2. Define supporting styles in app/css/style.css.
3. Cache the root element in `cacheElements()` and initialize any required components during `init()`.
4. If the panel listens to simulator updates, subscribe through existing emitters (e.g., `Logger`, `DebugPanel`, or the `Simulator` render loop) to avoid redundant polling.
