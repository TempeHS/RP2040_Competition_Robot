// Standalone probe: load Skulpt+Simulator+aidriver-stub and run challenge-1.py
// with various time-stepping strategies to look for a corkscrew.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.performance = dom.window.performance;
global.DebugPanel = { log:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{} };

function load(file, expose) {
  const src = fs.readFileSync(file, "utf8");
  const tail = expose ? `\n;globalThis.${expose} = ${expose};` : "";
  (0, eval)(src + tail);
}
load("node_modules/skulpt/dist/skulpt.js");
load("node_modules/skulpt/dist/skulpt-stdlib.js");
load("js/simulator.js", "Simulator");
load("js/aidriver-stub.js", "AIDriverStub");

const Sk = global.Sk;
const Simulator = globalThis.Simulator;
const AIDriverStub = globalThis.AIDriverStub;

global.App = {
  robot: null,
  speedMultiplier: 1,
  onAIDriverInstantiated(side) {
    Simulator.setSideSensorSide(side === "right" ? "right" : "left");
  },
};
global.render = () => {};

function runOnce({ spawnX, subSteps, dtTotal, label }) {
  global.App.robot = {
    x: spawnX, y: 1700, heading: 0,
    leftSpeed: 0, rightSpeed: 0, isMoving: false,
    trail: [], collisionCount: 0,
  };
  Simulator.setMazeWalls([
    { x: 500, y: 0, width: 30, height: 2000 },
    { x: 1470, y: 0, width: 30, height: 2000 },
  ]);
  AIDriverStub.commandQueue = [];
  const samples = [];
  let stop = null;

  Sk.configure({
    output: ()=>{},
    read: f => Sk.builtinFiles.files[f],
    __future__: Sk.python3,
    execLimit: null, killableWhile: true, killableFor: true,
    setTimeout: (fn, d) => setTimeout(fn, d),
  });
  Sk.builtinFiles = Sk.builtinFiles || { files: {} };
  const realFactory = AIDriverStub.getModule();
  globalThis.__aidriverModuleFactory = function(name) {
    const mod = realFactory(name);
    mod.hold_state = new Sk.builtin.func(function(seconds) {
      const totalDt = Sk.ffi.remapToJs(seconds) || dtTotal;
      const q = AIDriverStub.commandQueue;
      while (q.length) {
        const c = q.shift();
        switch (c.type) {
          case "drive": case "drive_forward":
            global.App.robot.leftSpeed = c.params.leftSpeed;
            global.App.robot.rightSpeed = c.params.rightSpeed;
            global.App.robot.isMoving = true;
            break;
          case "init":
            global.App.onAIDriverInstantiated(c.params && c.params.side);
            break;
        }
      }
      // sub-step like the browser's rAF loop
      const step = totalDt / subSteps;
      for (let i = 0; i < subSteps; i++) {
        global.App.robot = Simulator.step(global.App.robot, step);
      }
      const r = global.App.robot;
      samples.push({ x:r.x, y:r.y, h:r.heading, l:r.leftSpeed, rt:r.rightSpeed });
      if ((r.collisionCount||0) > 0) { stop="collision"; throw new Sk.builtin.SystemExit(new Sk.builtin.str("__")); }
      if (r.y < 200) { stop="success"; throw new Sk.builtin.SystemExit(new Sk.builtin.str("__")); }
      if (samples.length >= 2000) { stop="timeout"; throw new Sk.builtin.SystemExit(new Sk.builtin.str("__")); }
      return Sk.builtin.none.none$;
    });
    return mod;
  };
  Sk.builtinFiles.files["src/lib/aidriver.js"] =
    "var $builtinmodule = function() { return globalThis.__aidriverModuleFactory('aidriver'); };";

  const code = fs.readFileSync("answers/challenge-1.py", "utf8");
  return Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<probe>", false, code, true))
    .catch(e => { if (!String(e).includes("__test_stop_") && !String(e).includes("__")) throw e; })
    .then(() => {
      let minX=Infinity,maxX=-Infinity,maxAbsH=0;
      for (const s of samples) {
        if (s.x<minX) minX=s.x; if (s.x>maxX) maxX=s.x;
        let h=((s.h%360)+360)%360; if (h>180) h-=360;
        if (Math.abs(h)>maxAbsH) maxAbsH=Math.abs(h);
      }
      const f = samples[samples.length-1];
      console.log(`${label.padEnd(40)} stop=${stop} ticks=${samples.length} xRange=[${minX.toFixed(1)},${maxX.toFixed(1)}] maxH=${maxAbsH.toFixed(2)}° finalY=${f.y.toFixed(1)}`);
    });
}

(async () => {
  // Vary spawn X to see if non-equilibrium spawn corkscrews
  for (const x of [200, 220, 240, 250, 260, 280, 300, 320, 350, 400]) {
    await runOnce({ spawnX: x, subSteps: 1, dtTotal: 0.05, label: `spawn x=${x}, dt=0.05 single-step` });
  }
  console.log("---");
  // Same with browser-like sub-stepping (3 sub-steps per hold_state)
  for (const x of [200, 220, 240, 250, 260, 280, 300, 320, 350, 400]) {
    await runOnce({ spawnX: x, subSteps: 3, dtTotal: 0.05, label: `spawn x=${x}, 3 sub-steps` });
  }
})();
