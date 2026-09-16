// Interactive combat must preserve the original dice outcomes and turn rules.
"use strict";
const fs = require("fs"),
  path = require("path"),
  vm = require("vm"),
  assert = require("assert");
function load() {
  const context = { window: {}, console, Math };
  vm.createContext(context);
  [
    "data",
    "data_units",
    "geom",
    "rules",
    "battle",
    "army",
    "ai",
    "campaign",
  ].forEach((name) =>
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../js", name + ".js"), "utf8"),
      context,
    ),
  );
  return context.window.SOVL;
}
let totalEngagements = 0,
  checks = 0;
function play(seed, faction, enemy, interactive, scenario) {
  const S = load();
  S.R.setSeed(seed);
  const armies = [
    S.Army.randomArmy({ faction, pts: 1000 }),
    S.Army.randomArmy({ faction: enemy, pts: 1000 }),
  ];
  const b = new S.Battle({
    armies,
    terrain: S.Army.randomTerrain({}),
    interactiveCombat: interactive,
    scenario,
  });
  b.autoDeploy(0);
  b.autoDeploy(1);
  b.start();
  const ais = [new S.AI(b, 0), new S.AI(b, 1)];
  let steps = 0;
  while (b.phase !== "end" && steps++ < 5000) {
    if (b.phase === "combat" && interactive) {
      assert(
        b.pendingCombats.length > 0,
        "An empty combat phase must advance automatically",
      );
      const turn = b.turn,
        count = b.pendingCombats.length;
      assert.strictEqual(
        b.finishCombatPhase(),
        false,
        "Cannot skip unresolved fights",
      );
      const before = JSON.stringify(
        b.units.map((u) => [
          u.uid,
          u.models,
          u.commander && u.commander.wounds,
        ]),
      );
      assert.strictEqual(b.resolveEngagement("missing-id").ok, false);
      assert.strictEqual(
        before,
        JSON.stringify(
          b.units.map((u) => [
            u.uid,
            u.models,
            u.commander && u.commander.wounds,
          ]),
        ),
        "Invalid orders cannot deal damage",
      );
      while (b.pendingCombats.length) {
        const uid = b.pendingCombats[0][0];
        assert(b.resolveEngagement(uid).ok);
        assert.strictEqual(
          b.turn,
          turn,
          "A fight does not prematurely advance the turn",
        );
        assert.strictEqual(
          b.resolveEngagement(uid).ok,
          false,
          "Duplicate clicks cannot fight twice",
        );
        assert(b.combatReports[b.combatReports.length - 1].turn === turn);
        totalEngagements++;
      }
      assert.strictEqual(b.combatReports.length, count);
      assert.strictEqual(b.finishCombatPhase(), true);
      assert.strictEqual(
        b.finishCombatPhase(),
        false,
        "End-turn scoring cannot be applied twice",
      );
      checks += 8;
    } else
      assert(ais[b.active].step(), "AI must continue to make legal progress");
  }
  assert.strictEqual(
    b.phase,
    "end",
    "Battle must finish without a stalled combat phase",
  );
  return JSON.stringify({
    result: b.result,
    turn: b.turn,
    units: b.units
      .concat(b.dead)
      .map((u) => ({
        name: u.name,
        side: u.side,
        models: u.models,
        fleeing: u.fleeing,
        removed: u.removed,
        commander: u.commander && u.commander.alive,
      })),
  });
}
const factions = Object.keys(load().FACTION_DATA);
for (let i = 0; i < factions.length; i++)
  for (let scenario of ["pitched", "objectives"]) {
    const seed = 731 + i * 29 + (scenario === "objectives" ? 1 : 0);
    const auto = play(
      seed,
      factions[i],
      factions[(i + 1) % factions.length],
      false,
      scenario,
    );
    const manual = play(
      seed,
      factions[i],
      factions[(i + 1) % factions.length],
      true,
      scenario,
    );
    assert.strictEqual(
      manual,
      auto,
      "Interactive resolution must preserve seeded outcomes: " +
        factions[i] +
        " " +
        scenario,
    );
    checks++;
  }
assert(
  totalEngagements > 20,
  "Test must reach enough actual melee engagements",
);
console.log(
  "TACTICAL TESTS PASSED: 20 complete battles, " +
    totalEngagements +
    " manual engagements, " +
    checks +
    " phase/integrity checks.",
);
