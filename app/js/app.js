/**
 * AIDriver Simulator - Main Application
 * Entry point and module orchestration
 */

// Global application state
const App = {
  // Current state
  currentChallenge: 1,
  isRunning: false,
  isPaused: false,
  hasRun: false, // Track if code has been run (requires reset before running again)
  speedMultiplier: 2,
  startHeadingOffset: 0, // User-selected rotation offset (0, 90, 180, 270)

  // ACE Editor instance
  editor: null,

  // Canvas and context
  canvas: null,
  ctx: null,

  // Robot state
  robot: {
    x: 1000, // Center X (mm)
    y: 1000, // Center Y (mm)
    heading: 0, // Angle in degrees (0 = facing up/north)
    leftSpeed: 0,
    rightSpeed: 0,
    isMoving: false,
    trail: [], // Array of {x, y} positions
    collisionCount: 0,
    collisionFlashUntil: 0,
  },

  // Simulation
  animationFrameId: null,
  commandQueue: [],

  // DOM Elements (cached)
  elements: {},
};

/**
 * Bridge invoked from the Skulpt-side AIDriver constructor command queue.
 * Mounts the side sensor, mirrors the spawn pose if the user picked the
 * non-default wall side, and re-renders. This makes the AIDriver(side)
 * argument the single source of truth for which wall the robot follows.
 *
 * @param {"left"|"right"|undefined} side Wall side requested by user code.
 * @returns {void}
 */
App.onAIDriverInstantiated = function (side) {
  if (typeof Simulator === "undefined") return;
  if (side !== "left" && side !== "right") return;

  const previous = Simulator.getSideSensorSide();
  if (previous === side) {
    return; // already on the requested side, nothing to do
  }

  Simulator.setSideSensorSide(side);

  // Update the HUD label so the banner reflects the active side sensor.
  const sideLabelEl =
    typeof document !== "undefined"
      ? document.getElementById("sideSensorLabel")
      : null;
  if (sideLabelEl) {
    sideLabelEl.textContent = side === "right" ? "Right" : "Left";
  }

  const challenge = App.currentChallengeConfig;

  // Some mazes (e.g. spiral, classic) are inherently chiral and cannot be
  // mirrored without breaking the puzzle. Honour an explicit opt-out so the
  // robot stays in its left-hand spawn for those.
  const canMirror = !challenge || challenge.symmetric !== false;

  // Mirror the spawn pose so the wall the user chose is on the requested
  // side of the robot. Only mirror when switching away from the default.
  if (canMirror && App.robot && challenge && challenge.startPosition) {
    const spawn =
      (App.session && App.session.startPosition) || challenge.startPosition;
    const mirrored = Simulator.mirrorPose({
      x: spawn.x,
      y: spawn.y,
      heading: spawn.heading || 0,
    });
    App.robot.x = mirrored.x;
    App.robot.y = mirrored.y;
    App.robot.heading =
      (mirrored.heading + (App.startHeadingOffset || 0)) % 360;
    App.robot.trail = [];
  }

  // Mirror the success-zone too so e.g. a left-arm dead-end becomes the
  // right-arm dead-end when the user picks AIDriver("right").
  if (
    canMirror &&
    challenge &&
    challenge.successCriteria &&
    challenge.successCriteria.zone
  ) {
    challenge.successCriteria.zone = Simulator.mirrorRect(
      challenge.successCriteria.zone,
    );
  }

  if (typeof DebugPanel !== "undefined") {
    if (canMirror) {
      DebugPanel.info(
        `AIDriver mounted on ${side} wall \u2014 spawn + goal mirrored`,
      );
    } else {
      DebugPanel.warning(
        `AIDriver("${side}") requested but maze is not symmetric \u2014 spawn unchanged`,
      );
    }
  }
  if (typeof render === "function") {
    render();
  }
};

/**
 * Bootstrap the simulator by wiring modules, UI, and initial challenge state.
 * @returns {void}
 */
function init() {
  // Initialize Logger first (before anything else)
  if (typeof Logger !== "undefined") {
    Logger.init();
    Logger.info("APP", "Initializing AIDriver Simulator...");
  }
  console.log("[App] Initializing AIDriver Simulator...");

  // Cache DOM elements
  cacheElements();

  // Populate challenge menus from single source of truth
  if (typeof Challenges !== "undefined" && Challenges.populateMenu) {
    Challenges.populateMenu("#challengeSimulatorMenu", "simulator");
  }

  // Initialize Bootstrap components
  initBootstrapComponents();

  // Initialize Debug Panel
  DebugPanel.init();

  // Initialize Python Runner
  PythonRunner.init();

  // Initialize Gamepad
  if (typeof Gamepad !== "undefined") {
    Gamepad.init();
  }

  // Initialize ACE Editor
  initEditor();

  // Initialize Canvas
  initCanvas();

  // Set up event listeners
  setupEventListeners();

  // Load challenge from URL parameter or default to 0
  const urlParams = new URLSearchParams(window.location.search);
  const challengeParam = urlParams.get("challenge");
  // Support both numeric and string challenge IDs (e.g., "debug")
  const initialChallenge =
    challengeParam !== null
      ? isNaN(parseInt(challengeParam))
        ? challengeParam
        : parseInt(challengeParam)
      : 0;
  loadChallenge(initialChallenge);

  // Hide loading overlay
  hideLoading();

  console.log("[App] Initialization complete");
  DebugPanel.info("Simulator ready - select a challenge to begin");
}

/**
 * Store references to DOM nodes used throughout the simulator to avoid repeated lookups.
 * @returns {void}
 */
function cacheElements() {
  App.elements = {
    // Buttons
    btnRun: document.getElementById("btnRun"),
    btnStop: document.getElementById("btnStop"),
    btnStep: document.getElementById("btnStep"),
    btnReset: document.getElementById("btnReset"),
    btnResetCode: document.getElementById("btnResetCode"),
    btnCopyCode: document.getElementById("btnCopyCode"),
    btnClearDebug: document.getElementById("btnClearDebug"),
    btnConfirmReset: document.getElementById("btnConfirmReset"),
    btnRotateCar: document.getElementById("btnRotateCar"),
    rotationDisplay: document.getElementById("rotationDisplay"),

    // Displays
    ultrasonicDisplay: document.getElementById("ultrasonicDisplay"),
    sideSensorDisplay: document.getElementById("sideSensorDisplay"),
    speedValue: document.getElementById("speedValue"),
    debugConsole: document.getElementById("debugConsole"),
    statusMessage: document.getElementById("statusMessage"),
    challengeStatus: document.getElementById("challengeStatus"),
    statusBar: document.getElementById("statusBar"),

    // Controls
    speedSlider: document.getElementById("speedSlider"),
    challengeDropdown: document.getElementById("challengeDropdown"),

    // Panels
    gamepadPanel: document.getElementById("gamepadPanel"),
    mazeSelector: document.getElementById("mazeSelector"),
    canvasContainer: document.getElementById("canvasContainer"),
    loadingOverlay: document.getElementById("loadingOverlay"),

    // Canvas
    arenaCanvas: document.getElementById("arenaCanvas"),
  };
}

/**
 * Enable Bootstrap-driven UI affordances such as tooltips.
 * @returns {void}
 */
function initBootstrapComponents() {
  // Initialize all tooltips
  const tooltipTriggerList = document.querySelectorAll(
    '[data-bs-toggle="tooltip"]',
  );
  tooltipTriggerList.forEach((el) => new bootstrap.Tooltip(el));

  console.log("[App] Bootstrap components initialized");
}

/**
 * Create and configure the ACE editor instance via the Editor facade.
 * @returns {void}
 */
function initEditor() {
  // Use the Editor module for full functionality
  Editor.init();
  App.editor = Editor.instance;

  // Set placeholder content
  Editor.setCode("# Select a challenge to load starter code\n");

  console.log("[App] ACE Editor initialized via Editor module");
}

/**
 * Prepare the simulation canvas and renderer used for arena drawing.
 * @returns {void}
 */
function initCanvas() {
  App.canvas = App.elements.arenaCanvas;
  App.ctx = App.canvas.getContext("2d");

  // Set canvas size based on container
  resizeCanvas();

  // Initial render
  render();

  console.log("[App] Canvas initialized");
}

/**
 * Resize the simulation canvas to match its container while keeping aspect ratio square.
 * @returns {void}
 */
function resizeCanvas() {
  const container = App.elements.canvasContainer;
  const size = Math.min(container.clientWidth, container.clientHeight);

  App.canvas.width = size;
  App.canvas.height = size;

  // Re-render after resize
  render();
}

/**
 * Attach DOM, keyboard, and navigation handlers that drive the simulator UI.
 * @returns {void}
 */
function setupEventListeners() {
  // Control buttons
  App.elements.btnRun.addEventListener("click", runCode);
  App.elements.btnStop.addEventListener("click", stopExecution);
  App.elements.btnStep.addEventListener("click", stepCode);
  App.elements.btnReset.addEventListener("click", resetRobot);
  App.elements.btnClearDebug.addEventListener("click", clearDebug);

  // Rotate car button
  App.elements.btnRotateCar.addEventListener("click", () => {
    // Rotate by 90 degrees, wrap at 360
    App.startHeadingOffset = (App.startHeadingOffset + 90) % 360;
    App.elements.rotationDisplay.textContent = `${App.startHeadingOffset}°`;
    // Reset robot to apply new rotation
    resetRobot();
    DebugPanel.info(`Car start direction set to ${App.startHeadingOffset}°`);
  });

  // (Side sensor mounting is driven by the AIDriver("left"|"right")
  // argument in user code via App.onAIDriverInstantiated below — there is
  // no manual UI toggle.)

  // Copy code button
  App.elements.btnCopyCode.addEventListener("click", () => {
    const code = Editor.getCode();
    navigator.clipboard
      .writeText(code)
      .then(() => {
        // Show feedback by temporarily changing icon
        const icon = App.elements.btnCopyCode.querySelector("i");
        icon.classList.remove("bi-clipboard");
        icon.classList.add("bi-clipboard-check");
        setTimeout(() => {
          icon.classList.remove("bi-clipboard-check");
          icon.classList.add("bi-clipboard");
        }, 1500);
      })
      .catch((err) => {
        console.error("Failed to copy code:", err);
      });
  });

  // Reset code button - show modal
  App.elements.btnResetCode.addEventListener("click", () => {
    const modal = new bootstrap.Modal(
      document.getElementById("resetCodeModal"),
    );
    modal.show();
  });

  // Confirm reset code
  App.elements.btnConfirmReset.addEventListener("click", () => {
    resetToStarterCode();
    bootstrap.Modal.getInstance(
      document.getElementById("resetCodeModal"),
    ).hide();
  });

  // Speed slider
  App.elements.speedSlider.addEventListener("input", (e) => {
    App.speedMultiplier = parseInt(e.target.value);
    App.elements.speedValue.textContent = `${App.speedMultiplier}x`;

    // Update Simulator speed
    if (typeof Simulator !== "undefined") {
      Simulator.setSpeed(App.speedMultiplier);
    }
  });

  // Challenge selector
  document.querySelectorAll("[data-challenge]").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      // Stop any running code and reset before changing challenge
      if (App.isRunning) {
        stopExecution();
      }
      App.hasRun = false;
      const rawChallenge = e.currentTarget.dataset.challenge;
      // Support both numeric and string challenge IDs
      const challengeId = isNaN(parseInt(rawChallenge))
        ? rawChallenge
        : parseInt(rawChallenge);

      // Update URL to reflect the new challenge
      const newUrl = `simulator.html?challenge=${challengeId}`;
      window.history.pushState({ challenge: challengeId }, "", newUrl);

      loadChallenge(challengeId);
    });
  });

  // Maze selector
  document.querySelectorAll("[data-maze]").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const mazeId = e.currentTarget.dataset.maze;
      loadMaze(mazeId);
    });
  });

  // Gamepad buttons
  // Window resize
  window.addEventListener("resize", resizeCanvas);

  // Keyboard shortcuts
  document.addEventListener("keydown", handleKeyboardShortcuts);

  // Handle browser back/forward navigation
  window.addEventListener("popstate", (e) => {
    const urlParams = new URLSearchParams(window.location.search);
    const challengeParam = urlParams.get("challenge");
    // Support both numeric and string challenge IDs
    const challengeId =
      challengeParam !== null
        ? isNaN(parseInt(challengeParam))
          ? challengeParam
          : parseInt(challengeParam)
        : 0;

    if (App.isRunning) {
      stopExecution();
    }
    App.hasRun = false;
    loadChallenge(challengeId);
  });

  // Download debug log button
  const btnDownloadLog = document.getElementById("btnDownloadLog");
  if (btnDownloadLog) {
    btnDownloadLog.addEventListener("click", () => {
      if (typeof Logger !== "undefined") {
        Logger.userAction("Download debug log requested");
        Logger.downloadReport();
      } else {
        DebugPanel.error("Logger not available");
      }
    });
  }

  console.log("[App] Event listeners set up");
  if (typeof Logger !== "undefined") {
    Logger.info("APP", "Event listeners initialized");
  }
}

/**
 * Interpret global keyboard shortcuts for running, stopping, and resetting.
 * @param {KeyboardEvent} e Browser keyboard event to evaluate.
 * @returns {void}
 */
function handleKeyboardShortcuts(e) {
  // Ctrl+Enter - Run code
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();
    runCode();
  }
  // Ctrl+. - Stop execution
  if (e.ctrlKey && e.key === ".") {
    e.preventDefault();
    stopExecution();
  }
  // Ctrl+Shift+R - Reset robot
  if (e.ctrlKey && e.shiftKey && e.key === "R") {
    e.preventDefault();
    resetRobot();
  }
}

/**
 * Load the specified challenge configuration, assets, and starter code.
 * @param {number|string} challengeId Identifier for the requested challenge.
 * @returns {void}
 */
function loadChallenge(challengeId) {
  App.currentChallenge = challengeId;

  // Log challenge load event
  if (typeof Logger !== "undefined") {
    Logger.userAction(`Load Challenge ${challengeId}`);
  }

  // Get challenge definition
  const challenge =
    typeof Challenges !== "undefined" ? Challenges.get(challengeId) : null;

  // Update dropdown text
  const dropdownItems = document.querySelectorAll("[data-challenge]");
  dropdownItems.forEach((item) => {
    // Compare as strings to support both numeric and string IDs
    const itemChallenge = item.dataset.challenge;
    const isActive =
      itemChallenge === String(challengeId) ||
      parseInt(itemChallenge) === challengeId;
    item.classList.toggle("active", isActive);
    if (isActive) {
      App.elements.challengeDropdown.innerHTML = item.innerHTML;
    }
  });

  // Show/hide maze selector when challenge uses a maze
  const hasMaze = challenge && challenge.maze;
  App.elements.mazeSelector.classList.toggle("d-none", !hasMaze);

  // Show/hide gamepad for challenges with gamepadEnabled and adjust editor height
  const isGamepadChallenge = challenge && challenge.gamepadEnabled === true;
  App.elements.gamepadPanel.classList.toggle("d-none", !isGamepadChallenge);

  // Explicitly add/remove gamepad-mode class based on challenge type
  const editorEl = document.getElementById("editor");
  const editorCardEl = document.getElementById("editorCard");
  if (isGamepadChallenge) {
    editorEl.classList.add("gamepad-mode");
    editorCardEl.classList.add("gamepad-mode");
  } else {
    editorEl.classList.remove("gamepad-mode");
    editorCardEl.classList.remove("gamepad-mode");
  }

  // Resize ACE editor when toggling gamepad mode
  if (typeof Editor !== "undefined" && Editor.resize) {
    setTimeout(() => Editor.resize(), 100);
  }

  // Enable/disable gamepad control
  if (typeof Gamepad !== "undefined") {
    if (isGamepadChallenge) {
      Gamepad.enable();
    } else {
      Gamepad.disable();
    }
  }

  // Clear any existing error markers
  Editor.clearAllMarkers();

  // Debug challenge always loads fresh from main.py (no saved code)
  // Other challenges try saved code first, then starter code
  if (challengeId === "debug") {
    loadStarterCode(challengeId);
  } else {
    const savedCode = Editor.loadSavedCode(challengeId);
    if (savedCode) {
      Editor.setCode(savedCode);
      logDebug(`Loaded saved code for Challenge ${challengeId}`);
    } else {
      loadStarterCode(challengeId);
    }
  }

  // Store current challenge config
  App.currentChallengeConfig = challenge;

  // Snapshot the canonical (left-frame) success zone so resetRobot can
  // restore it after a previous run mirrored it for AIDriver("right").
  if (
    challenge &&
    challenge.successCriteria &&
    challenge.successCriteria.zone
  ) {
    challenge._canonicalZone = { ...challenge.successCriteria.zone };
  }
  if (challenge && challenge.startPosition) {
    challenge._canonicalStart = { ...challenge.startPosition };
  }

  // Roll a random spawn position (uses spawnXRange / spawnHeadingRange if defined)
  const spawnPos =
    challenge && typeof Challenges !== "undefined"
      ? Challenges.randomizeSpawn(challenge)
      : challenge && challenge.startPosition
        ? { ...challenge.startPosition }
        : { x: 1000, y: 1800, heading: 0 };

  // Initialize session tracking
  App.session = {
    startPosition: { ...spawnPos },
    hasError: false,
    totalRotation: 0,
    lastHeading: spawnPos.heading || 0,
    minY: 2000,
    crossoverCount: 0,
    startTime: null,
  };

  // Set robot start position from randomised spawn
  if (challenge && challenge.startPosition) {
    App.robot.x = spawnPos.x;
    App.robot.y = spawnPos.y;
    App.robot.heading = spawnPos.heading || 0;
    App.robot.trail = [];
    App.robot.leftSpeed = 0;
    App.robot.rightSpeed = 0;
    App.robot.isMoving = false;
  } else {
    resetRobot();
  }

  // Set obstacles from challenge
  if (typeof Simulator !== "undefined") {
    if (challenge && challenge.obstacles) {
      Simulator.setObstacles(challenge.obstacles);
    } else {
      Simulator.clearObstacles();
    }
  }

  // Load maze walls if the challenge references a maze. We set walls and
  // App.currentMaze directly here (rather than calling loadMaze) so the
  // challenge's own startPosition / spawnXRange remains the source of
  // truth for the spawn pose.
  if (typeof Simulator !== "undefined") {
    if (challenge && challenge.maze && typeof Mazes !== "undefined") {
      const maze = Mazes.get(challenge.maze);
      if (maze) {
        App.currentMaze = maze;
        Simulator.setMazeWalls(maze.walls || []);
      } else {
        App.currentMaze = null;
        Simulator.setMazeWalls([]);
      }
    } else {
      App.currentMaze = null;
      Simulator.setMazeWalls([]);
    }
  }

  // Clear success/failure overlay from previous challenge
  App.elements.canvasContainer.classList.remove("success", "failure");

  // Render initial state
  render();

  // Update ultrasonic display
  updateUltrasonicDisplay(calculateDistance());

  // Update status
  updateStatus(
    `Challenge ${challengeId}: ${
      challenge ? challenge.title : "Unknown"
    } loaded`,
    "info",
  );
  App.elements.challengeStatus.textContent = "Ready";
  App.elements.challengeStatus.className = "badge bg-secondary";

  // Show challenge info in debug
  if (challenge) {
    DebugPanel.info(`=== Challenge ${challengeId}: ${challenge.title} ===`);
    DebugPanel.info(challenge.description);
    DebugPanel.info(`Goal: ${challenge.goal}`);
  }

  console.log(`[App] Challenge ${challengeId} loaded`);
}

/**
 * Populate the editor with challenge starter code, fetching debug code from project/main.py when needed.
 * @param {number|string} challengeId Identifier for the challenge whose starter script should load.
 * @returns {Promise<void>} Resolves once code is applied to the editor.
 */
async function loadStarterCode(challengeId) {
  const starterCodePath = getStarterCodePath(challengeId);
  if (!starterCodePath) {
    Editor.setCode("# No starter code available\n");
    logDebug(
      `[App] No starter code file configured for Challenge ${challengeId}`,
    );
    return;
  }

  try {
    const response = await fetch(starterCodePath, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const code = await response.text();
    Editor.setCode(code);
    logDebug(`[App] Loaded starter code from ${starterCodePath}`);
  } catch (err) {
    console.warn(
      `[App] Could not fetch starter code at ${starterCodePath}:`,
      err,
    );
    Editor.setCode(
      `# Could not load starter code\n# Expected file: ${starterCodePath}\n`,
    );
  }
}

/**
 * Restore the current challenge editor contents to the original starter template.
 * @returns {Promise<void>} Resolves after starter code loads.
 */
async function resetToStarterCode() {
  Editor.clearSavedCode(App.currentChallenge);
  await loadStarterCode(App.currentChallenge);
  logDebug("[App] Code reset to starter code");
}

/**
 * Persist the editor content via the Editor module storage abstraction.
 * @returns {void}
 */
function saveCode() {
  Editor.saveCode();
}

/**
 * Load the maze definition for Challenge 6 and reconfigure the simulator.
 * @param {string} mazeId Identifier of the maze to load from Mazes.
 * @returns {void}
 */
function loadMaze(mazeId) {
  if (typeof Mazes === "undefined") {
    logDebug("Mazes module not available");
    return;
  }

  const maze = Mazes.get(mazeId);
  App.currentMaze = maze;

  // Reset the side sensor to the canonical "left" orientation so that the
  // next AIDriver("right") instantiation will correctly mirror the maze's
  // recorded left-side spawn + endZone. Without this, switching mazes
  // while running in right-wall mode would leave geometry in the wrong frame.
  if (typeof Simulator !== "undefined") {
    Simulator.setSideSensorSide("left");
  }
  const sideLabelReset =
    typeof document !== "undefined"
      ? document.getElementById("sideSensorLabel")
      : null;
  if (sideLabelReset) {
    sideLabelReset.textContent = "Left";
  }

  // Set maze walls in simulator
  if (typeof Simulator !== "undefined") {
    Simulator.setMazeWalls(maze.walls);
  }

  // Update robot start position
  if (maze.startPosition) {
    App.robot.x = maze.startPosition.x;
    App.robot.y = maze.startPosition.y;
    App.robot.heading = maze.startPosition.heading || 0;
    App.robot.trail = [];
    App.robot.leftSpeed = 0;
    App.robot.rightSpeed = 0;
    App.robot.isMoving = false;
  }

  // Update success criteria zone for the maze
  if (App.currentChallengeConfig && maze.endZone) {
    App.currentChallengeConfig.successCriteria.zone = maze.endZone;
  }

  // Re-render
  render();

  // Update ultrasonic
  updateUltrasonicDisplay(calculateDistance());

  DebugPanel.info(`Maze "${maze.name}" loaded`);
  updateStatus(`Maze: ${maze.name} (${maze.difficulty})`, "info");
}

/**
 * Collapse the editor panel to provide more vertical room while code executes.
 * @returns {void}
 */
function expandDebugPanel() {
  console.log("[App] expandDebugPanel called");
  const editor = document.getElementById("editor");

  if (editor) {
    editor.classList.add("running-mode");
    console.log("[App] Added running-mode class to editor");
  }

  // Resize ACE editor after animation
  setTimeout(() => {
    if (App.editor) {
      App.editor.resize();
    }
  }, 350);
}

/**
 * Restore the editor panel height after execution concludes.
 * @returns {void}
 */
function collapseDebugPanel() {
  const editor = document.getElementById("editor");

  if (editor) {
    editor.classList.remove("running-mode");
  }

  // Resize ACE editor after animation
  setTimeout(() => {
    if (App.editor) {
      App.editor.resize();
    }
  }, 350);
}

/**
 * Execute the learner's Python code through the Python runner pipeline.
 * @returns {void}
 */
function runCode() {
  if (App.isRunning) return;

  App.isRunning = true;
  App.isPaused = false;
  App.hasRun = true; // Track that code has been run (requires reset)

  // Log run event
  if (typeof Logger !== "undefined") {
    Logger.userAction(`Run code - Challenge ${App.currentChallenge}`);
    Logger.captureAppState();
  }

  // Expand debug panel with animation
  expandDebugPanel();

  // Reset session tracking for fresh run
  if (App.session) {
    App.session.totalRotation = 0;
    App.session.startTime = Date.now();
    App.session.lastHeading = App.robot.heading;
  }

  // Update UI
  App.elements.btnRun.disabled = true;
  App.elements.btnStop.disabled = false;
  App.elements.btnStep.disabled = true;

  DebugPanel.info("Running code...");
  updateStatus("Running...", "primary");
  App.elements.challengeStatus.textContent = "Running";
  App.elements.challengeStatus.className = "badge bg-primary";

  // Get code from editor
  const code = Editor.getCode();

  // Run with PythonRunner
  PythonRunner.run(code)
    .then(() => {
      DebugPanel.success("Execution completed");
      if (typeof Logger !== "undefined") {
        Logger.info("APP", "Execution completed successfully");
      }
      if (App.isRunning) {
        stopExecution();
        updateStatus("Completed", "success");
        App.elements.challengeStatus.textContent = "Completed";
        App.elements.challengeStatus.className = "badge bg-success";
      }
    })
    .catch((err) => {
      const errorMsg = err.message || String(err);
      DebugPanel.error(`Execution error: ${errorMsg}`);
      if (typeof Logger !== "undefined") {
        Logger.error(`Python execution error: ${errorMsg}`, err.stack);
      }
      stopExecution();
      updateStatus("Error", "danger");
      App.elements.challengeStatus.textContent = "Error";
      App.elements.challengeStatus.className = "badge bg-danger";
    });
}

/**
 * Halt execution, reset UI state, and stop robot motion.
 * @returns {void}
 */
function stopExecution() {
  // Log stop event
  if (typeof Logger !== "undefined") {
    Logger.userAction("Stop execution");
  }

  // Stop Python execution
  PythonRunner.stop();

  App.isRunning = false;
  App.isPaused = false;

  // Collapse debug panel with animation
  collapseDebugPanel();

  // Update UI - Run stays disabled until Reset
  App.elements.btnRun.disabled = App.hasRun; // Only enable if hasn't run yet
  App.elements.btnStop.disabled = true;
  App.elements.btnStep.disabled = App.hasRun;

  // Stop robot
  App.robot.leftSpeed = 0;
  App.robot.rightSpeed = 0;
  App.robot.isMoving = false;

  DebugPanel.warning("Execution stopped");
  updateStatus("Stopped", "warning");
  App.elements.challengeStatus.textContent = "Stopped";
  App.elements.challengeStatus.className = "badge bg-warning";
}

/**
 * Run code in deterministic step mode by capturing a trace and replaying it with delays.
 * The first pass collects execution trace without delays, then the trace is replayed for visualization.
 * @returns {Promise<void>} Resolves when stepping completes or rejects on failure.
 */
async function stepCode() {
  // If already playing trace, toggle pause
  if (PythonRunner.stepMode && PythonRunner.isPlayingTrace) {
    if (PythonRunner.stepPaused) {
      PythonRunner.resumeStep();
      App.elements.btnStep.textContent = "Pause";
    } else {
      PythonRunner.pauseStep();
      App.elements.btnStep.textContent = "Resume";
    }
    return;
  }

  // Get code from editor
  const code = Editor.getCode();

  // Validate code first
  if (typeof Validator !== "undefined") {
    const validation = Validator.validate(code);
    if (!validation.valid) {
      expandDebugPanel();
      DebugPanel.error("Code has errors that must be fixed before stepping:");
      for (const error of validation.errors) {
        DebugPanel.error(`  Line ${error.line}: ${error.message}`);
      }
      return;
    }
  }

  // Start step mode
  expandDebugPanel();
  App.isRunning = true;
  App.hasRun = true;

  // Update UI
  App.elements.btnRun.disabled = true;
  App.elements.btnStep.textContent = "Pause";
  App.elements.btnStop.disabled = false;

  DebugPanel.info(
    "Step Mode - collecting execution trace and playing back with delays",
  );
  updateStatus("Stepping...", "info");
  App.elements.challengeStatus.textContent = "Stepping";
  App.elements.challengeStatus.className = "badge bg-info";

  try {
    // Run in step mode with trace collection and playback
    await PythonRunner.runStepMode(code);
    DebugPanel.success("Step mode completed - click Reset to run again");
  } catch (error) {
    if (error.message !== "Execution stopped") {
      DebugPanel.error("Execution error: " + error.message);
    }
  }

  // Reset UI
  PythonRunner.stepMode = false;
  App.isRunning = false;
  App.elements.btnRun.disabled = true; // Require reset
  App.elements.btnStep.disabled = true; // Require reset
  App.elements.btnStep.textContent = "Step";
  App.elements.btnStop.disabled = true;
  updateStatus("Completed", "success");
  App.elements.challengeStatus.textContent = "Completed";
  App.elements.challengeStatus.className = "badge bg-success";
}

/**
 * Restore robot state, session tracking, and UI elements to their initial values.
 * Applies the user-selected heading offset before rendering.
 * @returns {void}
 */
function resetRobot() {
  // Log reset event
  if (typeof Logger !== "undefined") {
    Logger.userAction("Reset robot");
  }

  // Clear hasRun flag FIRST - so stopExecution doesn't disable Run button
  App.hasRun = false;

  // Reset step mode and trace state
  PythonRunner.stepMode = false;
  PythonRunner.stepPaused = false;
  PythonRunner.isCollectingTrace = false;
  PythonRunner.isPlayingTrace = false;
  PythonRunner.executionTrace = [];
  PythonRunner.currentTraceStep = 0;

  // Stop any running script
  if (App.isRunning) {
    stopExecution();
  }

  // Collapse debug panel with animation
  collapseDebugPanel();

  // Ensure Run button is enabled and Step button text reset
  App.elements.btnRun.disabled = false;
  App.elements.btnStep.disabled = false;
  App.elements.btnStep.textContent = "Step";

  // Reset session tracking — roll a NEW random spawn each run
  const challenge = App.currentChallengeConfig;
  const spawnPos =
    challenge && typeof Challenges !== "undefined"
      ? Challenges.randomizeSpawn(challenge)
      : challenge && challenge.startPosition
        ? { ...challenge.startPosition }
        : { x: 1000, y: 1800, heading: 0 };

  App.session = {
    startPosition: { ...spawnPos },
    hasError: false,
    totalRotation: 0,
    lastHeading: spawnPos.heading || 0,
    minY: 2000,
    crossoverCount: 0,
    startTime: null,
  };

  // Reset robot state to current challenge's start position
  // Also snap the side sensor back to the canonical "left" frame so that the
  // next AIDriver("right") call will re-apply the mirroring fresh.
  if (typeof Simulator !== "undefined") {
    Simulator.setSideSensorSide("left");
  }
  const sideLabelResetRun =
    typeof document !== "undefined"
      ? document.getElementById("sideSensorLabel")
      : null;
  if (sideLabelResetRun) {
    sideLabelResetRun.textContent = "Left";
  }
  // Restore canonical (un-mirrored) success zone if a previous run mirrored it
  if (
    challenge &&
    challenge._canonicalZone &&
    challenge.successCriteria &&
    challenge.successCriteria.zone
  ) {
    challenge.successCriteria.zone = { ...challenge._canonicalZone };
  }
  if (challenge && challenge.startPosition) {
    const baseHeading = spawnPos.heading || 0;
    App.robot = {
      x: spawnPos.x,
      y: spawnPos.y,
      heading: (baseHeading + App.startHeadingOffset) % 360,
      leftSpeed: 0,
      rightSpeed: 0,
      isMoving: false,
      trail: [],
      collisionCount: 0,
      collisionFlashUntil: 0,
    };
  } else if (typeof Simulator !== "undefined") {
    const initialState = Simulator.getInitialRobotState();
    initialState.heading =
      (initialState.heading + App.startHeadingOffset) % 360;
    initialState.collisionCount = 0;
    initialState.collisionFlashUntil = 0;
    App.robot = initialState;
  } else {
    App.robot = {
      x: 1000,
      y: 1800, // Start near bottom
      heading: App.startHeadingOffset,
      leftSpeed: 0,
      rightSpeed: 0,
      isMoving: false,
      trail: [],
      collisionCount: 0,
      collisionFlashUntil: 0,
    };
  }

  // Clear success/failure overlay
  App.elements.canvasContainer.classList.remove("success", "failure");

  // Re-render
  render();

  // Update ultrasonic display
  updateUltrasonicDisplay(calculateDistance());

  DebugPanel.info("Robot reset to starting position");
  updateStatus("Robot reset", "info");
}

/**
 * Remove all entries from the debug panel output.
 * @returns {void}
 */
function clearDebug() {
  DebugPanel.clear();
}

/**
 * Route a message to the debug panel using the desired severity style.
 * @param {string} message Message to display in the debug panel.
 * @param {"info"|"error"|"success"|"warning"} [type="info"] Visual style key for the entry.
 * @returns {void}
 */
function logDebug(message, type = "info") {
  // Use DebugPanel module
  switch (type) {
    case "error":
      DebugPanel.error(message);
      break;
    case "success":
      DebugPanel.success(message);
      break;
    case "warning":
      DebugPanel.warning(message);
      break;
    default:
      DebugPanel.info(message);
  }
}

/**
 * Present a status message in the UI banner with contextual styling.
 * @param {string} message Text to display to the user.
 * @param {string} [type="info"] Bootstrap alert variant (primary, success, etc.).
 * @returns {void}
 */
function updateStatus(message, type = "info") {
  App.elements.statusMessage.textContent = message;
  App.elements.statusBar.className = `alert alert-${type} mb-0 rounded-0 py-2 d-flex align-items-center`;
}

/**
 * Update the ultrasonic sensor readout badge with distance and severity color.
 * @param {number} distance Simulated distance measurement in millimeters or -1 when invalid.
 * @returns {void}
 */
function updateUltrasonicDisplay(distance) {
  const display = App.elements.ultrasonicDisplay;

  if (distance === -1) {
    display.textContent = "Front: --- mm";
    display.className = "badge bg-danger";
  } else {
    display.textContent = `Front: ${Math.round(distance)} mm`;

    // Color code based on distance
    if (distance < 100) {
      display.className = "badge bg-danger";
    } else if (distance < 300) {
      display.className = "badge bg-warning text-dark";
    } else {
      display.className = "badge bg-info";
    }
  }

  // Update side sensor display
  updateSideSensorDisplay();
}

/**
 * Update the side ultrasonic sensor readout badge.
 * @returns {void}
 */
function updateSideSensorDisplay() {
  const display = App.elements.sideSensorDisplay;
  if (!display) return;

  let distance = -1;
  if (typeof Simulator !== "undefined" && App.robot) {
    distance = Simulator.simulateUltrasonicSide(App.robot);
  }

  const side = Simulator.getSideSensorSide();
  const label = side.charAt(0).toUpperCase() + side.slice(1);

  if (distance === -1) {
    display.textContent = `${label}: --- mm`;
    display.className = "badge bg-danger";
  } else {
    display.textContent = `${label}: ${Math.round(distance)} mm`;

    if (distance < 100) {
      display.className = "badge bg-danger";
    } else if (distance < 300) {
      display.className = "badge bg-warning text-dark";
    } else {
      display.className = "badge bg-secondary";
    }
  }
}

/**
 * Determine the distance from the robot to the nearest obstacle using the simulator fallback logic.
 * @returns {number} Distance in millimeters or -1 when out of range.
 */
function calculateDistance() {
  // Use Simulator for accurate ultrasonic calculation
  if (typeof Simulator !== "undefined") {
    return Simulator.simulateUltrasonic(App.robot);
  }

  // Fallback: simple calculation to top wall
  const distanceToTop = App.robot.y;
  if (distanceToTop < 20 || distanceToTop > 2000) {
    return -1;
  }
  return distanceToTop;
}

/**
 * Render the full arena including grid, path, walls, trail, and robot.
 * @returns {void}
 */
function render() {
  const ctx = App.ctx;
  const canvas = App.canvas;
  const scale = canvas.width / 2000; // Scale factor from mm to pixels

  // Clear canvas
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  drawGrid(ctx, scale);

  // Draw path (if any for current challenge)
  drawPath(ctx, scale);

  // Draw walls
  drawWalls(ctx, scale);

  // Draw robot trail
  drawTrail(ctx, scale);

  // Draw robot
  drawRobot(ctx, scale);

  // Draw sensor beams
  drawSensorBeams(ctx, scale);

  // Note: Physics updates are handled by startAnimationLoop() which calls Simulator.step()
  // This render function is purely for drawing - no position updates here
}

/**
 * Draw the metric grid overlay that aids navigation within the arena.
 * @param {CanvasRenderingContext2D} ctx Drawing context for the canvas.
 * @param {number} scale Conversion from millimeters to pixels.
 * @returns {void}
 */
function drawGrid(ctx, scale) {
  ctx.strokeStyle = "#2a2a4a";
  ctx.lineWidth = 1;

  // Draw grid every 200mm
  const gridSize = 200 * scale;

  for (let x = gridSize; x < ctx.canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ctx.canvas.height);
    ctx.stroke();
  }

  for (let y = gridSize; y < ctx.canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ctx.canvas.width, y);
    ctx.stroke();
  }
}

/**
 * Visualize the active challenge path including lanes and highlighting.
 * @param {CanvasRenderingContext2D} ctx Drawing context for the canvas.
 * @param {number} scale Conversion from millimeters to pixels.
 * @returns {void}
 */
function drawPath(ctx, scale) {
  if (!App.currentChallengeConfig || !App.currentChallengeConfig.path) return;

  const path = App.currentChallengeConfig.path;
  const criteria = App.currentChallengeConfig.successCriteria;

  ctx.save();

  // Consistent styling for all path types
  const pathColor = "rgba(0, 255, 136, 0.6)"; // Main path line
  const boundaryColor = "rgba(0, 255, 136, 0.25)"; // Lane boundaries
  const fillColor = "rgba(0, 255, 136, 0.08)"; // Lane fill
  const markerColor = "rgba(0, 255, 136, 0.4)"; // Corner/point markers

  ctx.setLineDash([10, 5]);

  switch (path.type) {
    case "line":
      // Draw a line corridor
      const halfWidth = (path.width / 2) * scale;

      // Fill lane area
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(path.start.x * scale - halfWidth, path.start.y * scale);
      ctx.lineTo(path.end.x * scale - halfWidth, path.end.y * scale);
      ctx.lineTo(path.end.x * scale + halfWidth, path.end.y * scale);
      ctx.lineTo(path.start.x * scale + halfWidth, path.start.y * scale);
      ctx.closePath();
      ctx.fill();

      // Draw lane boundaries
      ctx.strokeStyle = boundaryColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw center line
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(path.start.x * scale, path.start.y * scale);
      ctx.lineTo(path.end.x * scale, path.end.y * scale);
      ctx.stroke();
      break;

    case "circle":
      // Fill lane area
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(
        path.center.x * scale,
        path.center.y * scale,
        (path.radius + path.width / 2) * scale,
        0,
        Math.PI * 2,
      );
      ctx.arc(
        path.center.x * scale,
        path.center.y * scale,
        (path.radius - path.width / 2) * scale,
        0,
        Math.PI * 2,
        true,
      );
      ctx.fill("evenodd");

      // Draw main circle path
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        path.center.x * scale,
        path.center.y * scale,
        path.radius * scale,
        0,
        Math.PI * 2,
      );
      ctx.stroke();

      // Draw lane boundaries
      ctx.strokeStyle = boundaryColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        path.center.x * scale,
        path.center.y * scale,
        (path.radius - path.width / 2) * scale,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(
        path.center.x * scale,
        path.center.y * scale,
        (path.radius + path.width / 2) * scale,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      break;

    case "figure_eight":
      // Draw figure-8 pattern with consistent styling
      const loopRadius = path.loopRadius * scale;
      const laneW = ((path.width || 150) * scale) / 2;

      // Fill lane areas for both loops
      ctx.fillStyle = fillColor;
      // Left loop fill
      ctx.beginPath();
      ctx.arc(
        (path.center.x - path.loopRadius) * scale,
        path.center.y * scale,
        loopRadius + laneW,
        0,
        Math.PI * 2,
      );
      ctx.arc(
        (path.center.x - path.loopRadius) * scale,
        path.center.y * scale,
        loopRadius - laneW,
        0,
        Math.PI * 2,
        true,
      );
      ctx.fill("evenodd");
      // Right loop fill
      ctx.beginPath();
      ctx.arc(
        (path.center.x + path.loopRadius) * scale,
        path.center.y * scale,
        loopRadius + laneW,
        0,
        Math.PI * 2,
      );
      ctx.arc(
        (path.center.x + path.loopRadius) * scale,
        path.center.y * scale,
        loopRadius - laneW,
        0,
        Math.PI * 2,
        true,
      );
      ctx.fill("evenodd");

      // Draw main path lines
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        (path.center.x - path.loopRadius) * scale,
        path.center.y * scale,
        loopRadius,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(
        (path.center.x + path.loopRadius) * scale,
        path.center.y * scale,
        loopRadius,
        0,
        Math.PI * 2,
      );
      ctx.stroke();

      // Draw lane boundaries
      ctx.strokeStyle = boundaryColor;
      ctx.lineWidth = 2;
      // Left loop boundaries
      ctx.beginPath();
      ctx.arc(
        (path.center.x - path.loopRadius) * scale,
        path.center.y * scale,
        loopRadius - laneW,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(
        (path.center.x - path.loopRadius) * scale,
        path.center.y * scale,
        loopRadius + laneW,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      // Right loop boundaries
      ctx.beginPath();
      ctx.arc(
        (path.center.x + path.loopRadius) * scale,
        path.center.y * scale,
        loopRadius - laneW,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(
        (path.center.x + path.loopRadius) * scale,
        path.center.y * scale,
        loopRadius + laneW,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      break;

    case "uturn":
      // Draw U-turn path with lane
      const uHalfWidth = ((path.width || 150) / 2) * scale;

      // Fill lane area
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.rect(
        1000 * scale - uHalfWidth,
        path.endY * scale,
        uHalfWidth * 2,
        (path.startY - path.endY) * scale,
      );
      ctx.fill();

      // Draw lane boundaries
      ctx.strokeStyle = boundaryColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(1000 * scale - uHalfWidth, path.startY * scale);
      ctx.lineTo(1000 * scale - uHalfWidth, path.endY * scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1000 * scale + uHalfWidth, path.startY * scale);
      ctx.lineTo(1000 * scale + uHalfWidth, path.endY * scale);
      ctx.stroke();

      // Draw center line
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(1000 * scale, path.startY * scale);
      ctx.lineTo(1000 * scale, path.endY * scale);
      ctx.stroke();
      break;

    case "square":
      // Draw square path with lane
      const x = path.corner.x * scale;
      const y = path.corner.y * scale;
      const size = path.size * scale;
      const laneWidth = (path.width || 150) * scale;
      const halfLane = laneWidth / 2;

      // Fill the lane area
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      // Outer square
      ctx.moveTo(x - halfLane, y + halfLane);
      ctx.lineTo(x - halfLane, y - size - halfLane);
      ctx.lineTo(x + size + halfLane, y - size - halfLane);
      ctx.lineTo(x + size + halfLane, y + halfLane);
      ctx.closePath();
      // Inner square (counter-clockwise for cutout)
      ctx.moveTo(x + halfLane, y - halfLane);
      ctx.lineTo(x + size - halfLane, y - halfLane);
      ctx.lineTo(x + size - halfLane, y - size + halfLane);
      ctx.lineTo(x + halfLane, y - size + halfLane);
      ctx.closePath();
      ctx.fill("evenodd");

      // Draw center line (main path)
      ctx.strokeStyle = pathColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - size); // Up
      ctx.lineTo(x + size, y - size); // Right
      ctx.lineTo(x + size, y); // Down
      ctx.lineTo(x, y); // Back to start
      ctx.stroke();

      // Draw outer lane boundary
      ctx.strokeStyle = boundaryColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - halfLane, y + halfLane);
      ctx.lineTo(x - halfLane, y - size - halfLane); // Up
      ctx.lineTo(x + size + halfLane, y - size - halfLane); // Right
      ctx.lineTo(x + size + halfLane, y + halfLane); // Down
      ctx.lineTo(x - halfLane, y + halfLane); // Back to start
      ctx.stroke();

      // Draw inner lane boundary
      ctx.beginPath();
      ctx.moveTo(x + halfLane, y - halfLane);
      ctx.lineTo(x + halfLane, y - size + halfLane); // Up
      ctx.lineTo(x + size - halfLane, y - size + halfLane); // Right
      ctx.lineTo(x + size - halfLane, y - halfLane); // Down
      ctx.lineTo(x + halfLane, y - halfLane); // Back to start
      ctx.stroke();

      // Draw corner markers
      ctx.fillStyle = markerColor;
      const markerSize = 20 * scale;
      ctx.fillRect(
        x - markerSize / 2,
        y - markerSize / 2,
        markerSize,
        markerSize,
      );
      ctx.fillRect(
        x - markerSize / 2,
        y - size - markerSize / 2,
        markerSize,
        markerSize,
      );
      ctx.fillRect(
        x + size - markerSize / 2,
        y - size - markerSize / 2,
        markerSize,
        markerSize,
      );
      ctx.fillRect(
        x + size - markerSize / 2,
        y - markerSize / 2,
        markerSize,
        markerSize,
      );
      break;

    case "none":
      // No path to draw - just show obstacles and target
      break;

    case "obstacle_course":
      // Draw a path with waypoints
      if (path.waypoints && path.waypoints.length >= 2) {
        const halfWidth = (path.width / 2) * scale;

        // First pass: fill the entire path including corners
        ctx.fillStyle = fillColor;
        ctx.beginPath();

        // Build a continuous path outline
        // Start from first waypoint, go along one side
        const wp = path.waypoints;

        // Draw each segment and corner squares to fill gaps
        for (let i = 0; i < wp.length - 1; i++) {
          const start = wp[i];
          const end = wp[i + 1];
          const isVertical =
            Math.abs(end.x - start.x) < Math.abs(end.y - start.y);

          // Fill segment
          ctx.fillStyle = fillColor;
          if (isVertical) {
            const minY = Math.min(start.y, end.y);
            const maxY = Math.max(start.y, end.y);
            ctx.fillRect(
              (start.x - path.width / 2) * scale,
              minY * scale,
              path.width * scale,
              (maxY - minY) * scale,
            );
          } else {
            const minX = Math.min(start.x, end.x);
            const maxX = Math.max(start.x, end.x);
            ctx.fillRect(
              minX * scale,
              (start.y - path.width / 2) * scale,
              (maxX - minX) * scale,
              path.width * scale,
            );
          }

          // Fill corner square at each waypoint to avoid gaps
          ctx.fillRect(
            (end.x - path.width / 2) * scale,
            (end.y - path.width / 2) * scale,
            path.width * scale,
            path.width * scale,
          );
        }

        // Fill start corner
        ctx.fillRect(
          (wp[0].x - path.width / 2) * scale,
          (wp[0].y - path.width / 2) * scale,
          path.width * scale,
          path.width * scale,
        );

        // Draw lane boundaries
        ctx.strokeStyle = boundaryColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);

        for (let i = 0; i < wp.length - 1; i++) {
          const start = wp[i];
          const end = wp[i + 1];
          const isVertical =
            Math.abs(end.x - start.x) < Math.abs(end.y - start.y);

          if (isVertical) {
            const minY = Math.min(start.y, end.y);
            const maxY = Math.max(start.y, end.y);
            ctx.strokeRect(
              (start.x - path.width / 2) * scale,
              minY * scale,
              path.width * scale,
              (maxY - minY) * scale,
            );
          } else {
            const minX = Math.min(start.x, end.x);
            const maxX = Math.max(start.x, end.x);
            ctx.strokeRect(
              minX * scale,
              (start.y - path.width / 2) * scale,
              (maxX - minX) * scale,
              path.width * scale,
            );
          }
        }

        // Draw center line through all waypoints
        ctx.strokeStyle = pathColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(wp[0].x * scale, wp[0].y * scale);
        for (let i = 1; i < wp.length; i++) {
          ctx.lineTo(wp[i].x * scale, wp[i].y * scale);
        }
        ctx.stroke();

        // Draw waypoint markers
        ctx.fillStyle = markerColor;
        for (const point of wp) {
          ctx.beginPath();
          ctx.arc(point.x * scale, point.y * scale, 10 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
  }

  ctx.setLineDash([]);

  // Draw obstacles
  if (App.currentChallengeConfig && App.currentChallengeConfig.obstacles) {
    const obstacles = App.currentChallengeConfig.obstacles;
    for (const obs of obstacles) {
      // Fill with dark red
      ctx.fillStyle = "rgba(200, 50, 50, 0.7)";
      ctx.fillRect(
        obs.x * scale,
        obs.y * scale,
        obs.width * scale,
        obs.height * scale,
      );
      // Border
      ctx.strokeStyle = "rgba(255, 100, 100, 0.9)";
      ctx.lineWidth = 3;
      ctx.strokeRect(
        obs.x * scale,
        obs.y * scale,
        obs.width * scale,
        obs.height * scale,
      );
      // Label
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = `${12 * scale}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText(
        "OBSTACLE",
        (obs.x + obs.width / 2) * scale,
        (obs.y + obs.height / 2 + 4) * scale,
      );
    }
  }

  // Draw finish zone for circle challenges (return to start indicator)
  // (Visual marker removed — success is still evaluated by the validator.)

  // Draw finish zone for square challenges (return to start zone)
  // (Visual marker removed — success is still evaluated by the validator.)

  ctx.restore();
}

/**
 * Render the arena boundary and, when active, the selected maze layout.
 * @param {CanvasRenderingContext2D} ctx Drawing context for the canvas.
 * @param {number} scale Conversion from millimeters to pixels.
 * @returns {void}
 */
function drawWalls(ctx, scale) {
  // Draw arena border
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, ctx.canvas.width - 4, ctx.canvas.height - 4);

  // Draw maze walls if applicable
  if (App.currentMaze && typeof Mazes !== "undefined") {
    Mazes.draw(ctx, scale, App.currentMaze.id);
  }
}

/**
 * Plot the historical path of the robot as a translucent polyline.
 * @param {CanvasRenderingContext2D} ctx Drawing context for the canvas.
 * @param {number} scale Conversion from millimeters to pixels.
 * @returns {void}
 */
function drawTrail(ctx, scale) {
  if (App.robot.trail.length < 2) return;

  ctx.strokeStyle = "rgba(255, 107, 107, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(App.robot.trail[0].x * scale, App.robot.trail[0].y * scale);

  for (let i = 1; i < App.robot.trail.length; i++) {
    ctx.lineTo(App.robot.trail[i].x * scale, App.robot.trail[i].y * scale);
  }
  ctx.stroke();
}

/**
 * Draw front and side ultrasonic sensor beams extending from the robot.
 * @param {CanvasRenderingContext2D} ctx Drawing context for the canvas.
 * @param {number} scale Conversion from millimeters to pixels.
 * @returns {void}
 */
function drawSensorBeams(ctx, scale) {
  if (!App.robot) return;

  const headingRad = (App.robot.heading * Math.PI) / 180;

  // --- Front sensor beam (cyan) ---
  const frontDist = Simulator.simulateUltrasonic(App.robot);
  if (frontDist > 0) {
    const fx = App.robot.x * scale;
    const fy = App.robot.y * scale;
    const endX = fx + Math.sin(headingRad) * frontDist * scale;
    const endY = fy - Math.cos(headingRad) * frontDist * scale;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 255, 255, 0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // --- Side sensor beam (yellow) ---
  const sideDist = Simulator.simulateUltrasonicSide(App.robot);
  if (sideDist > 0) {
    const side = Simulator.getSideSensorSide();
    // Match the simulator heading convention:
    // Left  = (-cos(h), -sin(h))
    // Right = ( cos(h),  sin(h))
    let rayDirX, rayDirY;
    if (side === "left") {
      rayDirX = -Math.cos(headingRad);
      rayDirY = -Math.sin(headingRad);
    } else {
      rayDirX = Math.cos(headingRad);
      rayDirY = Math.sin(headingRad);
    }

    const sx = App.robot.x + rayDirX * (Simulator.ROBOT_WIDTH / 2);
    const sy = App.robot.y + rayDirY * (Simulator.ROBOT_WIDTH / 2);
    const ex = sx + rayDirX * sideDist;
    const ey = sy + rayDirY * sideDist;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 0, 0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sx * scale, sy * scale);
    ctx.lineTo(ex * scale, ey * scale);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

/**
 * Draw the robot avatar using a stylized top-down car representation.
 * @param {CanvasRenderingContext2D} ctx Drawing context for the canvas.
 * @param {number} scale Conversion from millimeters to pixels.
 * @returns {void}
 */
function drawRobot(ctx, scale) {
  const x = App.robot.x * scale;
  const y = App.robot.y * scale;
  const heading = (App.robot.heading * Math.PI) / 180;

  // Car dimensions (length x width) - rotated 90 degrees so length is along heading
  const carLength = 100 * scale;
  const carWidth = 50 * scale;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading - Math.PI / 2); // Rotate -90 degrees so car faces up

  // Main car body (red, flashes brighter on collision for ~200 ms)
  const isFlashing =
    App.robot.collisionFlashUntil && App.robot.collisionFlashUntil > Date.now();
  ctx.fillStyle = isFlashing ? "#ff3333" : "#cc0000";
  if (isFlashing) {
    ctx.shadowColor = "#ff0000";
    ctx.shadowBlur = 20 * scale;
  }
  ctx.beginPath();
  // Rounded rectangle for car body
  const bodyX = -carLength / 2;
  const bodyY = -carWidth / 2;
  const radius = 8 * scale;
  ctx.moveTo(bodyX + radius, bodyY);
  ctx.lineTo(bodyX + carLength - radius, bodyY);
  ctx.quadraticCurveTo(
    bodyX + carLength,
    bodyY,
    bodyX + carLength,
    bodyY + radius,
  );
  ctx.lineTo(bodyX + carLength, bodyY + carWidth - radius);
  ctx.quadraticCurveTo(
    bodyX + carLength,
    bodyY + carWidth,
    bodyX + carLength - radius,
    bodyY + carWidth,
  );
  ctx.lineTo(bodyX + radius, bodyY + carWidth);
  ctx.quadraticCurveTo(
    bodyX,
    bodyY + carWidth,
    bodyX,
    bodyY + carWidth - radius,
  );
  ctx.lineTo(bodyX, bodyY + radius);
  ctx.quadraticCurveTo(bodyX, bodyY, bodyX + radius, bodyY);
  ctx.closePath();
  ctx.fill();

  // Clear the collision-flash glow before drawing the rest of the car details
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  // Front windshield (dark, at the front/right of car heading up)
  ctx.fillStyle = "#3a1a1a";
  ctx.beginPath();
  ctx.moveTo(carLength * 0.15, -carWidth * 0.35);
  ctx.lineTo(carLength * 0.35, -carWidth * 0.4);
  ctx.lineTo(carLength * 0.35, carWidth * 0.4);
  ctx.lineTo(carLength * 0.15, carWidth * 0.35);
  ctx.closePath();
  ctx.fill();

  // Rear windshield (dark)
  ctx.fillStyle = "#3a1a1a";
  ctx.beginPath();
  ctx.moveTo(-carLength * 0.15, -carWidth * 0.35);
  ctx.lineTo(-carLength * 0.38, -carWidth * 0.38);
  ctx.lineTo(-carLength * 0.38, carWidth * 0.38);
  ctx.lineTo(-carLength * 0.15, carWidth * 0.35);
  ctx.closePath();
  ctx.fill();

  // Hood vents (decorative lines on front)
  ctx.strokeStyle = "#990000";
  ctx.lineWidth = 1 * scale;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(carLength * 0.25, -carWidth * 0.15 + i * 5 * scale);
    ctx.lineTo(carLength * 0.4, -carWidth * 0.15 + i * 5 * scale);
    ctx.stroke();
  }

  // Headlights (front)
  ctx.fillStyle = "#ffff99";
  ctx.beginPath();
  ctx.ellipse(
    carLength * 0.45,
    -carWidth * 0.3,
    4 * scale,
    3 * scale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(
    carLength * 0.45,
    carWidth * 0.3,
    4 * scale,
    3 * scale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Taillights (rear)
  ctx.fillStyle = "#ff3333";
  ctx.fillRect(-carLength * 0.48, -carWidth * 0.35, 4 * scale, 6 * scale);
  ctx.fillRect(
    -carLength * 0.48,
    carWidth * 0.35 - 6 * scale,
    4 * scale,
    6 * scale,
  );

  // Wheels (4 wheels at corners)
  ctx.fillStyle = "#222222";
  // Front left
  ctx.fillRect(
    carLength * 0.25,
    -carWidth / 2 - 4 * scale,
    12 * scale,
    6 * scale,
  );
  // Front right
  ctx.fillRect(
    carLength * 0.25,
    carWidth / 2 - 2 * scale,
    12 * scale,
    6 * scale,
  );
  // Rear left
  ctx.fillRect(
    -carLength * 0.37,
    -carWidth / 2 - 4 * scale,
    12 * scale,
    6 * scale,
  );
  // Rear right
  ctx.fillRect(
    -carLength * 0.37,
    carWidth / 2 - 2 * scale,
    12 * scale,
    6 * scale,
  );

  ctx.restore();
}

/**
 * @deprecated Physics updates are computed by startAnimationLoop via Simulator.step().
 * Legacy helper retained for compatibility logging only.
 * @returns {void}
 */
function updateRobotPosition() {
  // Note: This function is deprecated and no longer used.
  // All physics updates are now handled by startAnimationLoop() -> Simulator.step()
  // which provides consistent physics regardless of speed multiplier.
  console.warn(
    "[Deprecated] updateRobotPosition called - use Simulator.step() instead",
  );
}

/**
 * Merge AIDriver command state into the robot cache and trigger a redraw.
 * @param {{leftSpeed?: number, rightSpeed?: number, isMoving?: boolean}} state Partial state payload.
 * @returns {void}
 */
function updateRobot(state) {
  if (state.leftSpeed !== undefined) {
    App.robot.leftSpeed = state.leftSpeed;
  }
  if (state.rightSpeed !== undefined) {
    App.robot.rightSpeed = state.rightSpeed;
  }
  if (state.isMoving !== undefined) {
    App.robot.isMoving = state.isMoving;
  }

  // Note: Physics updates are handled by startAnimationLoop() which calls Simulator.step()
  // Just trigger a render to show the updated state
  render();
}

/**
 * Conceal the startup loading overlay once initialization concludes.
 * @returns {void}
 */
function hideLoading() {
  App.elements.loadingOverlay.classList.add("hidden");
}

/**
 * Resolve a challenge id to the starter-code file path used by the ACE editor.
 * @param {number|string} challengeId Identifier for the active challenge.
 * @returns {string|null} Relative path to starter code file, or null when no mapping exists.
 */
function getStarterCodePath(challengeId) {
  const starterCodeFiles = {
    debug: "../project/main.py",
    1: "starter-code/challenge-1.py",
    2: "starter-code/challenge-2.py",
    3: "starter-code/challenge-3.py",
    4: "starter-code/challenge-4.py",
    5: "starter-code/challenge-5.py",
    6: "starter-code/challenge-6.py",
  };

  if (Object.prototype.hasOwnProperty.call(starterCodeFiles, challengeId)) {
    return starterCodeFiles[challengeId];
  }

  const numericId = parseInt(challengeId, 10);
  if (
    Number.isInteger(numericId) &&
    Object.prototype.hasOwnProperty.call(starterCodeFiles, numericId)
  ) {
    return starterCodeFiles[numericId];
  }

  return null;
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", init);

/**
 * Continuously advance the simulation, rendering updates and checking success each frame.
 * @returns {void}
 */
function startAnimationLoop() {
  let lastTime = performance.now();
  let frameCount = 0;

  function animate(currentTime) {
    const dt = (currentTime - lastTime) / 1000; // Convert to seconds
    lastTime = currentTime;
    frameCount++;

    // Debug every 60 frames (roughly once per second)
    if (frameCount % 60 === 0) {
      console.log(
        "[AnimLoop] Frame",
        frameCount,
        "isMoving:",
        App.robot.isMoving,
        "speeds:",
        App.robot.leftSpeed,
        App.robot.rightSpeed,
        "pos:",
        App.robot.x.toFixed(0),
        App.robot.y.toFixed(0),
      );
    }

    // Update robot using Simulator physics if moving
    if (
      App.robot.isMoving ||
      App.robot.leftSpeed !== 0 ||
      App.robot.rightSpeed !== 0
    ) {
      if (typeof Simulator !== "undefined") {
        App.robot = Simulator.step(App.robot, dt);
      }

      // === TRACE: per-frame trajectory dump for debugging ===
      // Set window.__TRACE_TRAJECTORY = true in DevTools to enable.
      // Output is one CSV line per frame: t_ms,x,y,heading,L,R
      if (typeof window !== "undefined" && window.__TRACE_TRAJECTORY) {
        if (window.__TRACE_T0 == null) {
          window.__TRACE_T0 = currentTime;
          console.log("TRACE,t_ms,x,y,heading,L,R");
        }
        const t = (currentTime - window.__TRACE_T0).toFixed(1);
        console.log(
          `TRACE,${t},${App.robot.x.toFixed(2)},${App.robot.y.toFixed(2)},${App.robot.heading.toFixed(3)},${App.robot.leftSpeed},${App.robot.rightSpeed}`,
        );
      }

      // Track session data for success checking
      updateSessionTracking();

      render();
      updateUltrasonicDisplay(calculateDistance());

      // Check success criteria if running
      if (App.isRunning) {
        checkChallengeSuccess();
      }
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

/**
 * Track aggregate session metrics used during challenge evaluation.
 * @returns {void}
 */
function updateSessionTracking() {
  if (!App.session) return;

  // Track minimum Y position (for U-turn challenge)
  if (App.robot.y < App.session.minY) {
    App.session.minY = App.robot.y;
  }

  // Track total rotation
  const headingDelta = App.robot.heading - App.session.lastHeading;
  // Handle wraparound
  let normalizedDelta = headingDelta;
  if (normalizedDelta > 180) normalizedDelta -= 360;
  if (normalizedDelta < -180) normalizedDelta += 360;
  App.session.totalRotation += normalizedDelta;
  App.session.lastHeading = App.robot.heading;

  // Track center crossovers (for figure-8)
  if (
    App.currentChallengeConfig &&
    App.currentChallengeConfig.successCriteria.type === "figure_eight"
  ) {
    const crossover = App.currentChallengeConfig.successCriteria.crossoverPoint;
    const distToCenter = Math.hypot(
      App.robot.x - crossover.x,
      App.robot.y - crossover.y,
    );
    if (distToCenter < 100 && !App.session.nearCenter) {
      App.session.crossoverCount++;
      App.session.nearCenter = true;
    } else if (distToCenter > 200) {
      App.session.nearCenter = false;
    }
  }
}

/**
 * Evaluate the current challenge success criteria and surface completion UI.
 * @returns {void}
 */
function checkChallengeSuccess() {
  if (!App.currentChallengeConfig || typeof Challenges === "undefined") return;

  // Don't check success during step mode playback
  if (PythonRunner.isPlayingTrace) return;

  // Require at least 2 seconds of running before checking success
  if (App.session && App.session.startTime) {
    const elapsed = Date.now() - App.session.startTime;
    if (elapsed < 2000) return; // Don't check success in first 2 seconds
  }

  // Don't check success while Python code is still actively running
  // Success should only be checked after code completes naturally
  if (PythonRunner.isRunning) return;

  const result = Challenges.checkSuccess(
    App.currentChallenge,
    App.robot,
    App.session,
  );

  if (result.success) {
    // Success!
    stopExecution();
    App.elements.canvasContainer.classList.add("success");
    App.elements.challengeStatus.textContent = "SUCCESS!";
    App.elements.challengeStatus.className = "badge bg-success";
    DebugPanel.success(`🎉 ${result.message}`);
    updateStatus("Challenge Complete!", "success");
  }
}

// Also initialize render loop
document.addEventListener("DOMContentLoaded", () => {
  startAnimationLoop();
});

// Expose App globally for Python runner integration
window.App = App;
window.updateRobot = updateRobot;
window.updateRobotPosition = updateRobotPosition;
window.render = render;
window.calculateDistance = calculateDistance;
window.updateUltrasonicDisplay = updateUltrasonicDisplay;
