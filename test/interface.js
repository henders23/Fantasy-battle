// DOM integration + native Canvas rendering, without a browser or dev server.
// Optional test dependencies: linkedom and @napi-rs/canvas.
"use strict";
const fs = require("fs"),
  path = require("path"),
  vm = require("vm"),
  assert = require("assert");
const { parseHTML } = require("linkedom");
const { createCanvas, Image } = require("@napi-rs/canvas");
const root = path.resolve(__dirname, "..");
const { window } = parseHTML(
  fs.readFileSync(path.join(root, "index.html"), "utf8"),
);
const { document } = window,
  storage = new Map(),
  timers = new Map();
let timerID = 0;
const width = 1100,
  height = 700;
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
  get() {
    return this.id === "camp-map" ? 850 : width;
  },
});
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", {
  get() {
    return height;
  },
});
const selectGet = Object.getOwnPropertyDescriptor(
  window.HTMLSelectElement.prototype,
  "value",
).get;
Object.defineProperty(window.HTMLSelectElement.prototype, "value", {
  get: selectGet,
  set(v) {
    this.querySelectorAll("option").forEach((o) =>
      o.removeAttribute("selected"),
    );
    const chosen = Array.from(this.querySelectorAll("option")).find(
      (o) => String(o.value) === String(v),
    );
    if (chosen) chosen.setAttribute("selected", "");
  },
});
const canvasPrototype = window.HTMLCanvasElement.prototype;
canvasPrototype.getContext = function () {
  if (!this.native) {
    this.native = createCanvas(this.width || width, this.height || height);
    const ctx = this.native.getContext("2d");
    const pattern = ctx.createPattern.bind(ctx),
      draw = ctx.drawImage.bind(ctx);
    ctx.createPattern = (c, ...args) => pattern(c.native || c, ...args);
    ctx.drawImage = (c, ...args) => draw(c.native || c, ...args);
    this.context = ctx;
  }
  return this.context;
};
for (const key of ["width", "height"])
  Object.defineProperty(canvasPrototype, key, {
    get() {
      return this.native
        ? this.native[key]
        : Number(this.getAttribute(key)) || 0;
    },
    set(v) {
      this.setAttribute(key, v);
      if (this.native) this.native[key] = v;
    },
  });
class LocalImage extends Image {
  set src(v) {
    super.src = fs.readFileSync(path.join(root, v));
  }
  get src() {
    return super.src;
  }
}
function Option(text, value) {
  const o = document.createElement("option");
  o.textContent = text;
  o.value = value;
  return o;
}
const clock = {
  setTimeout(fn) {
    const id = ++timerID;
    timers.set(id, fn);
    return id;
  },
  clearTimeout(id) {
    timers.delete(id);
  },
};
window.matchMedia = () => ({ matches: false });
window.devicePixelRatio = 1;
window.innerWidth = 1440;
window.innerHeight = 900;
const context = {
  window,
  document,
  console,
  Math,
  Image: LocalImage,
  Option,
  MutationObserver: window.MutationObserver,
  performance,
  requestAnimationFrame: () => 1,
  localStorage: {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  },
  ...clock,
};
vm.createContext(context);
for (const script of document.querySelectorAll("script[src]"))
  vm.runInContext(
    fs.readFileSync(path.join(root, script.getAttribute("src")), "utf8"),
    context,
    { filename: script.getAttribute("src") },
  );
const S = context.window.SOVL,
  U = S.UI,
  $ = (id) => document.getElementById(id);
function runTimer(id) {
  const fn = timers.get(id);
  timers.delete(id);
  if (fn) fn();
}
function cancelAI() {
  clock.clearTimeout(U.aiTimer);
  U.aiTimer = null;
}
function capture(name) {
  const r = U.renderer;
  U.battle.units.forEach((u) => {
    u._rx = u.x;
    u._ry = u.y;
    u._ra = u.a;
  });
  r.draw(
    U.battle,
    {
      playerSide: 0,
      selected: U.sel || U.deploySel,
      hover: U.hover,
      mode: U.mode,
      targets: U.targets,
      preview: U.preview,
    },
    performance.now(),
  );
  const out = process.env.SOVL_SHOTS;
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      path.join(out, name + ".png"),
      $("battle-canvas").native.toBuffer("image/png"),
    );
  }
}
(async () => {
  window.dispatchEvent(new window.Event("load"));
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(U.screen, "menu");
  assert($("btn-quick").onclick);
  $("btn-quick").click();
  assert.strictEqual(U.battle.phase, "deploy");
  assert(U.battle.allPlaced(0));
  assert.strictEqual(
    S.Army.validate(U.battle.armies[0], 500).length,
    0,
    "The first battle must have a valid army",
  );
  assert($("battle-roster").children.length >= 4);
  assert($("screen-battle").classList.contains("is-deploy"));
  capture("deployment");
  U.showGuide();
  assert(U.modalOpen);
  assert($("modal-body").textContent.includes("Fight on the field"));
  U.closeModal();
  U.showSettings();
  assert($("modal-body").querySelectorAll("select").length === 4);
  U.closeModal();
  U.beginBattle();
  cancelAI();
  const b = U.battle,
    ais = [new S.AI(b, 0), new S.AI(b, 1)];
  let iterations = 0,
    engagements = 0,
    moved = false,
    shot = false;
  while (b.phase !== "end" && iterations++ < 3000) {
    if (b.phase === "combat") {
      assert(!$("engagement-panel").hidden);
      assert(!U.modalOpen, "Combat must not hide the battlefield in a modal");
      U.selectEngagement(b.pendingCombats[0][0]);
      if (!engagements) capture("engagement");
      const n = b.pendingCombats.length;
      U.fightEngagement();
      U.fightEngagement();
      assert.strictEqual(
        b.pendingCombats.length,
        n - 1,
        "Double click must resolve exactly one fight",
      );
      runTimer(U.combatTimer);
      assert(U.combatReport);
      assert($("engagement-panel").textContent.includes("Inspect dice"));
      U.continueCombat();
      cancelAI();
      engagements++;
      continue;
    }
    // Exercise mouse-order routing before allowing AI to complete that activation.
    if (b.phase === "strategic" && b.active === 0 && !b.activeUnit && !moved) {
      const u = b.activatable(0).find((u) => !u.fleeing && !b.isEngaged(u));
      if (u) {
        U.canvasClick({ x: u.x, y: u.y }, {});
        assert.strictEqual(U.sel, u.uid);
        assert.strictEqual(b.activeUnit, u.uid);
        const prev = { x: u.x, y: u.y };
        U.canvasClick({ x: u.x, y: u.y - 4 }, {});
        moved = Math.hypot(u.x - prev.x, u.y - prev.y) > 0;
        assert($("battle-actions").textContent.includes("Pivot"));
        capture("movement");
        U.endActivation();
        cancelAI();
        continue;
      }
    }
    ais[b.active].step();
    U.processEvents();
    U.updateHud();
    cancelAI();
    if (b.events.some((e) => e.type === "shoot")) shot = true;
  }
  assert.strictEqual(b.phase, "end");
  assert(engagements > 0);
  assert(moved);
  U.onEnd();
  for (const id of Array.from(timers.keys())) runTimer(id);
  assert(U.modalOpen);
  assert($("modal-body").textContent.includes("Battle Over"));
  U.closeModal();
  U.show("menu");
  // Existing faction selection, catalogue, army costs and campaign remain reachable.
  U.showSetup("skirmish");
  assert.strictEqual(
    $("setup-factions").querySelectorAll(".faction-art").length,
    5,
  );
  const cards = $("setup-factions").querySelectorAll(".faction-card");
  cards[1].click();
  assert.strictEqual(U.setup.faction, "dwarf_holds");
  $("setup-next").click();
  assert.strictEqual(U.screen, "builder");
  $("builder-auto").click();
  await new Promise((r) => setTimeout(r, 0));
  assert(U.builder.army.entries.length > 1);
  assert($("builder-catalog").querySelector(".mini-portrait"));
  U.showSetup("campaign");
  $("setup-name").value = "Test Commander";
  $("setup-next").click();
  assert.strictEqual(U.screen, "campaign");
  assert(U.campaign);
  U.closeModal();
  assert($("camp-map").querySelector(".campaign-heading"));
  assert($("camp-map").querySelector(".node.avail[tabindex]"));
  assert(S.Campaign.load(), "Campaign still saves");
  // Each faction can start, auto-deploy, render, and enter its first turn.
  for (const faction of Object.keys(S.FACTION_DATA)) {
    const army = S.Army.randomArmy({ faction, pts: 1000 }),
      enemy = S.Army.randomArmy({ faction: "empires_of_men", pts: 1000 });
    U.startBattle({
      armies: [army, enemy],
      terrain: S.Army.randomTerrain({}),
      scenario: "objectives",
      names: ["You", "Enemy"],
    });
    assert(U.battle.allPlaced(0));
    capture(faction);
    U.beginBattle();
    cancelAI();
    assert(U.battle.phase !== "deploy");
  }
  console.log(
    "INTERFACE TESTS PASSED: quick battle to results (" +
      engagements +
      " engagements), movement orders, duplicate-click guard, guide/settings, five factions, builder, campaign and native Canvas renders.",
  );
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
