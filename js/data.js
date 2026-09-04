// SOVL browser replica — static rules data.
// Core rules follow the open SOVL ruleset (github.com/Perwahl/SOVLRules).
// Spells, magic items and the campaign structure are not in the public
// rules text and are designed here to match the names the source lists use.
'use strict';
var SOVL = window.SOVL || {};
window.SOVL = SOVL;

SOVL.TABLE = { w: 60, h: 40, deployDepth: 8 };
SOVL.MAX_TURNS = 8;
SOVL.MM = 1 / 25.4; // inches per mm

// Base sizes in mm [width, depth]; movement allowance; pivot cost.
SOVL.UNIT_TYPES = {
  'Infantry':               { base: [20, 20],  move: 8,  pivot: 1,   files: 5, minFiles: 3, maxFiles: 10 },
  'Infantry Large':         { base: [25, 25],  move: 8,  pivot: 1,   files: 5, minFiles: 3, maxFiles: 10 },
  'Cavalry':                { base: [25, 50],  move: 16, pivot: 2,   files: 5, minFiles: 3, maxFiles: 10 },
  'Monstrous Infantry':     { base: [40, 40],  move: 12, pivot: 1.5, files: 3, minFiles: 1, maxFiles: 4 },
  'Large Monster':          { base: [50, 50],  move: 12, pivot: 1.5, files: 1, minFiles: 1, maxFiles: 1 },
  'Large Monster Long Base':{ base: [50, 100], move: 12, pivot: 1.5, files: 1, minFiles: 1, maxFiles: 1 },
  'Chariot':                { base: [50, 100], move: 16, pivot: 2,   files: 1, minFiles: 1, maxFiles: 1 },
  'War Machine':            { base: [50, 50],  move: 0,  pivot: 0,   files: 1, minFiles: 1, maxFiles: 1 },
  'Weapon Team':            { base: [25, 50],  move: 8,  pivot: 1,   files: 1, minFiles: 1, maxFiles: 1 },
  'War Wagon':              { base: [50, 100], move: 12, pivot: 1.5, files: 1, minFiles: 1, maxFiles: 1 },
  'Swarm':                  { base: [40, 40],  move: 8,  pivot: 1,   files: 3, minFiles: 1, maxFiles: 5 },
  'Hounds':                 { base: [20, 40],  move: 12, pivot: 1.5, files: 5, minFiles: 3, maxFiles: 10 },
  'Gargantuan':             { base: [100, 150],move: 12, pivot: 1.5, files: 1, minFiles: 1, maxFiles: 1 }
};

// Melee weapon sets.
SOVL.WEAPONS = {
  'Hand Weapon':            { def: 0, pow: 0, att: 0, chargePow: 1, desc: 'Charge Bonus: +1 Power.' },
  'Hand Weapon and Shield': { def: 1, pow: 0, att: 0, chargePow: 1, desc: '+1 Defense. Charge Bonus: +1 Power.' },
  'Spear and Shield':       { def: 1, pow: 0, att: 0, chargePow: 0, extraRank: true, desc: '+1 Defense. Extra rank of supporting attacks when not charging.' },
  'Greatweapon':            { def: 0, pow: 1, att: 0, chargePow: 1, desc: '+1 Power. Charge Bonus: +1 Power.' },
  'Halberd':                { def: 0, pow: 0, att: 0, chargePow: 0, halberd: true, desc: 'Damage Saves against this weapon are never better than 4+.' },
  'Two Hand Weapons':       { def: 0, pow: 0, att: 1, chargePow: 0, desc: '+1 Attack.' },
  'Lance and Shield':       { def: 1, pow: 0, att: 0, chargePow: 2, desc: '+1 Defense. Charge Bonus: +2 Power.' },
  'Unarmed':                { def: 0, pow: 0, att: 0, chargePow: 0, desc: 'Unarmed attacks.' },
  'Fangs':                  { def: 0, pow: 0, att: 0, chargePow: 1, desc: 'Charge Bonus: +1 Power.' },
  'Claws':                  { def: 0, pow: 0, att: 0, chargePow: 1, desc: 'Charge Bonus: +1 Power.' }
};

// Ranged weapons. perModel: every model shoots; shots: dice per model;
// hits: fixed hits on a successful roll (string dice expr); pow: Power.
SOVL.RANGED = {
  'Longbows':        { range: 30, pow: 3, perModel: true, shots: 1, desc: 'Range 30. Power 3.' },
  'Shortbows':       { range: 20, pow: 3, perModel: true, shots: 1, desc: 'Range 20. Power 3.' },
  'Crossbows':       { range: 30, pow: 3, perModel: true, shots: 1, desc: 'Range 30. Power 3.' },
  'Handguns':        { range: 24, pow: 4, perModel: true, shots: 1, desc: 'Range 24. Power 4.' },
  'Bows':            { range: 20, pow: 3, perModel: true, shots: 2, desc: 'Range 20. 2 shots. Power 3.' },
  'Brace of Pistols':{ range: 18, pow: 4, perModel: true, shots: 2, desc: 'Range 18. 2 shots. Power 4.' },
  'Dwarf Pistol':    { range: 18, pow: 4, perModel: true, shots: 2, desc: 'Range 18. 2 shots. Power 4.' },
  'Marksman Rifle':  { range: 48, pow: 4, perModel: true, shots: 2, desc: 'Range 48. 2 shots. Power 4.' },
  'Cannon':          { range: 48, pow: 8, perModel: false, hits: '1d3', desc: 'Range 48. D3 hits. Power 8.' },
  'Catapult':        { range: 48, pow: 5, perModel: false, hits: '2d3', desc: 'Range 48. 2D3 hits. Power 5.' },
  'Bolt Thrower':    { range: 48, pow: 6, perModel: false, shots: 3, hits: '1', desc: 'Range 48. 3 shots. Power 6.' },
  'Mortar':          { range: 48, pow: 4, perModel: false, hits: '2d3+1', desc: 'Range 48. 2D3+1 hits. Power 4.' },
  'Inferno Cannon':  { range: 16, pow: 5, perModel: false, hits: '3d3', desc: 'Range 16. 3D3 hits. Power 5.' },
  'Steam Gun':       { range: 12, pow: 3, perModel: false, hits: '2d3', desc: 'Range 12. 2D3 hits. Power 3.' },
  'Fire Breath':     { range: 12, pow: 5, perModel: false, hits: '2d3', desc: 'Range 12. 2D3 hits. Power 5.' },
  'Explosive Charges':{ range: 8, pow: 4, perModel: false, hits: '1d6', once: true, desc: 'Range 8. D6 hits. Power 4. One use per battle.' }
};

// Unit properties. Mechanical flags are read by the engine.
SOVL.PROPS = {
  'Heavy Armor':      { move: -1, def: 1, desc: '-1 Movement. +1 Defense.' },
  'Fearless':         { fearless: true, desc: 'Ignores all penalties to Discipline tests.' },
  'Frenzy':           { frenzy: true, desc: 'Must charge the closest valid target. Re-roll missed Attack Rolls in the first round of combat.' },
  'Sturdy':           { move: -1, sturdy: true, desc: '-1 Movement. Ignores the movement penalty from Heavy Armor.' },
  'Swift':            { move: 1, desc: '+1 Movement.' },
  'Reanimated':       { move: -1, reanimated: true, desc: '-1 Movement. Never fails Discipline tests; loses D3 wounds when it loses a combat (Crumble).' },
  'Scout':            { scout: true, desc: 'Ignores movement penalties from Difficult Terrain.' },
  'Ambusher':         { ambusher: true, desc: 'Can be deployed anywhere on its owner\'s half of the table.' },
  'Flying':           { flying: true, flyMove: 20, desc: 'Fly Speed 20. Ignores terrain.' },
  'Regeneration':     { regen: true, desc: 'Recovers all missing wounds at the end of the turn.' },
  'Poisoned Attacks': { poison: true, desc: 'Enemies re-roll 6s on Damage Saves.' },
  'Armor Plating':    { def: 1, move: -4, desc: '+1 Defense. -4 Movement.' },
  'Bodyguard':        { bodyguard: true, desc: 'If a Commander is part of this unit it re-rolls failed Discipline tests.' },
  'Crewed Weapon':    { crewed: true, desc: 'Always counts as being in cover. -2 Defense in close combat. Cannot charge.' },
  'Crushing Charge':  { chargePow: 2, chargeAtt: 2, desc: 'Charge Bonus: +2 Power, +2 Attacks.' },
  'Elven Mastery':    { rerollMiss: true, desc: 'Re-roll missed Attack Rolls.' },
  'Eternal Reign':    { crumbleReduce: 1, regen: true, desc: 'Reduce Crumble by 1. Regeneration.' },
  'Lethal Shots':     { lethal: true, desc: 'Ranged attacks deal 2 wounds against multi-wound targets.' },
  'Masterwork Armor': { saveBonus: 1, desc: '+1 to Damage Saves.' },
  'Putrid Stench':    { stench: true, desc: 'Opponents re-roll successful hits in close combat.' },
  'Ramming Speed':    { chargePow: 1, desc: 'Charge Bonus: +1 Power.' },
  'Ranger':           { retinueMove: 2, desc: 'Retinue has +2 Movement.' },
  'Reposition':       { ability: 'reposition', desc: 'Activate: +6 Movement this turn.' },
  'Full Steam':       { ability: 'fullsteam', desc: 'Activate: +4 Movement this turn.' },
  'Web':              { ability: 'web', desc: 'Activate: an enemy unit within 12 loses 4 Movement this turn.' },
  'Mountain\'s Will': { ability: 'mountains_will', once: true, desc: 'Once per battle: all your units have +1 Defense for one turn.' },
  'Inspire Valor':    { ability: 'inspire_valor', once: true, desc: 'Once per battle: all your units have +1 Combat Score for one turn.' },
  'Furious Charge':   { ability: 'furious_charge', once: true, desc: 'Once per battle: Commander and Retinue re-roll Attack Rolls this turn.' },
  'Warcry':           { ability: 'warcry', once: true, desc: 'Once per battle: all your units have +1 Power for one turn.' },
  'Power Of Many':    { ability: 'power_of_many', once: true, desc: 'Once per battle: all your Goblins are Fearless for one turn.' },
  'Rallying Cry':     { ability: 'rallying_cry', once: true, desc: 'Once per battle: rally a fleeing unit within 12.' },
  'Mechanical Expertise': { ability: 'mech_expertise', once: true, desc: 'Once per battle: a war machine within 12 gets +2 Defense and re-rolls 1s on Ranged Attacks.' }
};

// Spells. kind: bolt (ranged damage), buff (friendly), hex (enemy), summon.
// cv: casting value on 2d6 (+ caster level).
SOVL.SPELLS = {
  'Fireball':       { cv: 7, kind: 'bolt', range: 24, hits: '2d3', pow: 4, desc: 'Range 24. 2D3 hits, Power 4.' },
  'Shadow Bolt':    { cv: 7, kind: 'bolt', range: 24, hits: '1d3', pow: 5, lethal: true, desc: 'Range 24. D3 hits, Power 5, Lethal.' },
  'Reality Rift':   { cv: 10, kind: 'bolt', range: 18, hits: '1d6', pow: 6, desc: 'Range 18. D6 hits, Power 6.' },
  'Thousand Mouths':{ cv: 8, kind: 'bolt', range: 18, hits: '2d6', pow: 2, desc: 'Range 18. 2D6 hits, Power 2.' },
  'Plague':         { cv: 8, kind: 'hex', range: 18, effect: { power: -1, hits: '1d6', pow: 3 }, desc: 'Range 18. D6 hits, Power 3, and the target has -1 Power this turn.' },
  'Hex Of Ruin':    { cv: 7, kind: 'hex', range: 18, effect: { skill: -1, defense: -1 }, desc: 'Range 18. Target enemy has -1 Skill and -1 Defense this turn.' },
  'Arcane Web':     { cv: 8, kind: 'hex', range: 18, effect: { rooted: true }, desc: 'Range 18. Target enemy cannot move or charge next turn.' },
  'Frost Ward':     { cv: 7, kind: 'hex', range: 18, effect: { move: -4, toHit: -1 }, desc: 'Range 18. Target enemy has -4 Movement and -1 to hit this turn.' },
  'Divine Favour':  { cv: 7, kind: 'buff', range: 12, effect: { rerollSaves: true }, desc: 'Range 12. Friendly unit re-rolls failed Damage Saves this turn.' },
  'Radiant Shield': { cv: 6, kind: 'buff', range: 12, effect: { defense: 1 }, desc: 'Range 12. Friendly unit has +1 Defense this turn.' },
  'Shroud':         { cv: 6, kind: 'buff', range: 12, effect: { shrouded: true }, desc: 'Range 12. Friendly unit cannot be targeted by ranged attacks or spells this turn.' },
  'Fiery Blades':   { cv: 7, kind: 'buff', range: 12, effect: { power: 1, rerollMiss: true }, desc: 'Range 12. Friendly unit has +1 Power and re-rolls missed attacks this turn.' },
  'Primal Fury':    { cv: 7, kind: 'buff', range: 12, effect: { attacks: 1, fearless: true }, desc: 'Range 12. Friendly unit has +1 Attack and is Fearless this turn.' },
  'Wildform':       { cv: 8, kind: 'buff', range: 0, effect: { power: 2, attacks: 1 }, self: true, desc: 'The caster\'s unit has +2 Power and +1 Attack this turn.' },
  'Unholy Vigour':  { cv: 6, kind: 'buff', range: 12, effect: { power: 1, attacks: 1 }, desc: 'Range 12. Friendly unit has +1 Power and +1 Attack this turn.' },
  'Reanimate':      { cv: 7, kind: 'heal', range: 12, heal: '1d6', desc: 'Range 12. A friendly Reanimated unit recovers D6 wounds (models return).' },
  'Raise Dead':     { cv: 9, kind: 'summon', range: 6, summon: 'zombies', count: 10, desc: 'Summon a unit of 10 Zombies within 6 of the caster.' }
};

// Magic weapons and items for commanders. kind: weapon | item.
SOVL.MAGIC_ITEMS = [
  { id: 'sword_of_might', name: 'Sword of Might', kind: 'weapon', cost: 20, effect: { power: 1 }, desc: '+1 Power.' },
  { id: 'blade_of_swiftness', name: 'Blade of Swiftness', kind: 'weapon', cost: 20, effect: { attacks: 1 }, desc: '+1 Attack.' },
  { id: 'runeblade', name: 'Runeblade', kind: 'weapon', cost: 30, effect: { skill: 1, power: 1 }, desc: '+1 Skill, +1 Power.' },
  { id: 'reaper_axe', name: 'Reaper Axe', kind: 'weapon', cost: 35, effect: { lethalMelee: true }, desc: 'Commander\'s attacks deal 2 wounds to multi-wound models.' },
  { id: 'enchanted_shield', name: 'Enchanted Shield', kind: 'item', cost: 15, effect: { defense: 1 }, desc: '+1 Defense.' },
  { id: 'talisman_of_life', name: 'Talisman of Life', kind: 'item', cost: 25, effect: { regen: true }, desc: 'Commander recovers all wounds at the end of each turn.' },
  { id: 'crown_of_command', name: 'Crown of Command', kind: 'item', cost: 25, effect: { discipline: 1, retinueDiscipline: 1 }, desc: '+1 Discipline for the commander and retinue.' },
  { id: 'boots_of_haste', name: 'Boots of Haste', kind: 'item', cost: 15, effect: { retinueMove: 2 }, desc: 'Commander\'s unit has +2 Movement.' },
  { id: 'staff_of_power', name: 'Staff of Power', kind: 'item', cost: 20, effect: { casting: 1 }, desc: '+1 to casting rolls.' },
  { id: 'amulet_of_warding', name: 'Amulet of Warding', kind: 'item', cost: 20, effect: { ward: true }, desc: 'Commander\'s unit cannot be targeted by enemy spells.' }
];

SOVL.BANNERS = [
  { id: 'war_banner', name: 'War Banner', cost: 25, effect: { combatScore: 1 }, desc: '+1 Combat Score.' },
  { id: 'banner_of_discipline', name: 'Banner of Discipline', cost: 25, effect: { discipline: 1 }, desc: '+1 Discipline.' },
  { id: 'banner_of_swiftness', name: 'Banner of Swiftness', cost: 25, effect: { move: 1 }, desc: '+1 Movement.' },
  { id: 'banner_of_fortitude', name: 'Banner of Fortitude', cost: 50, effect: { rerollBreak: true }, desc: 'Re-roll failed Break Tests.' },
  { id: 'banner_of_fury', name: 'Banner of Fury', cost: 50, effect: { chargePow: 1 }, desc: 'Charge Bonus: +1 Power.' },
  { id: 'banner_of_iron', name: 'Banner of Iron', cost: 100, effect: { defense: 1 }, desc: '+1 Defense.' },
  { id: 'banner_of_wrath', name: 'Banner of Wrath', cost: 100, effect: { power: 1 }, desc: '+1 Power.' }
];

SOVL.ARMY_SIZES = [
  { id: 'warband', name: 'Warband', pts: 500 },
  { id: 'battalion', name: 'Battalion', pts: 1000 },
  { id: 'legion', name: 'Legion', pts: 1500 }
];

SOVL.FACTION_INFO = {
  empires_of_men:   { color: '#b63a2e', accent: '#f0d27a', tagline: 'Disciplined blocks of state troops, knights and black powder.', symbol: '⚜' },
  dwarf_holds:      { color: '#2f6fb3', accent: '#e9c46a', tagline: 'Slow, stubborn and armoured, with the best artillery in the world.', symbol: '⚒' },
  elven_conclaves:  { color: '#3c9d8a', accent: '#f7f3e3', tagline: 'Swift, skilled and fragile. Strike where you choose.', symbol: '✦' },
  greenskin_tribes: { color: '#5a8f2b', accent: '#e0b34a', tagline: 'Big mobs, bigger brutes, and things that should not be ridden.', symbol: '☠' },
  dead_nations:     { color: '#6b4c9a', accent: '#c9d6c2', tagline: 'Endless tireless dead that never break, bound to their master.', symbol: '☽' }
};

// Terrain templates: kind, and size range in inches.
SOVL.TERRAIN_TYPES = {
  forest:   { name: 'Forest',   difficult: true,  impassable: false, blocksLos: true,  color: '#2d5a27' },
  cliff:    { name: 'Cliff',    difficult: false, impassable: true,  blocksLos: true,  color: '#6e6a63' },
  building: { name: 'Ruin',     difficult: false, impassable: true,  blocksLos: true,  color: '#8b7d6b' },
  lake:     { name: 'Lake',     difficult: false, impassable: true,  blocksLos: false, color: '#3b6f9e' },
  swamp:    { name: 'Swamp',    difficult: true,  impassable: false, blocksLos: false, color: '#4f6b3a' }
};

SOVL.COMMANDER_NAMES = {
  empires_of_men: ['Aldric', 'Ludovic', 'Magda', 'Konrad', 'Elise', 'Wolfram', 'Brunhild', 'Ottokar'],
  dwarf_holds: ['Grimnar', 'Thora', 'Brokk', 'Hilda', 'Durin', 'Ingrid', 'Snorri', 'Gudrun'],
  elven_conclaves: ['Aelwen', 'Caradoc', 'Ithil', 'Sylvara', 'Faelar', 'Lirien', 'Thalion', 'Nimue'],
  greenskin_tribes: ['Grotsnik', 'Skarbad', 'Mogrul', 'Gnashfang', 'Zogrot', 'Bruzz', 'Uggok', 'Snikkit'],
  dead_nations: ['Vorlath', 'Mireille', 'Kazimir', 'Ysolde', 'Draven', 'Morwenna', 'Sallow', 'Ophelia']
};

// ---- Campaign: Trail of Death ----
SOVL.CAMPAIGN = {
  startGold: 120,
  acts: [
    { name: 'Act I — The Borderlands', layers: 6, pts: [220, 420], elitePts: 1.35, boss: { name: 'The Warlord of the Marches', pts: 650 } },
    { name: 'Act II — The Blackwater', layers: 7, pts: [500, 800], elitePts: 1.35, boss: { name: 'The Drowned Court', pts: 1000 } },
    { name: 'Act III — The Trail\'s End', layers: 7, pts: [850, 1200], elitePts: 1.3, boss: { name: 'The Deathless Host', pts: 1500, final: true } }
  ],
  // veterancy thresholds (battles survived)
  veteran: [
    { at: 2, name: 'Veteran', discipline: 1 },
    { at: 4, name: 'Elite', skill: 1 },
    { at: 6, name: 'Legendary', power: 1 }
  ],
  events: [
    { id: 'deserters', title: 'Deserters at the Ford', text: 'A band of deserters from a broken army begs to join your column. They look hungry, and they look like they can fight.',
      choices: [
        { text: 'Take them in (recruit a random small unit of your faction)', effect: { recruitRandom: true } },
        { text: 'Take their weapons and send them away (+40 gold)', effect: { gold: 40 } },
        { text: 'Hang them as an example (+1 Discipline to all units this run... and a reputation)', effect: { disciplineAll: 1, reputation: -1 } }
      ] },
    { id: 'shrine', title: 'A Wayside Shrine', text: 'An old shrine stands at the crossroads. Offerings of coin glint in the dust at its base.',
      choices: [
        { text: 'Leave an offering (-30 gold). Your commander gains a blessing (+1 Wound)', effect: { gold: -30, commanderWounds: 1 } },
        { text: 'Pocket the offerings (+50 gold)', effect: { gold: 50, curse: true } },
        { text: 'Pass by', effect: {} }
      ] },
    { id: 'merchant_caravan', title: 'Merchant Caravan', text: 'A caravan of nervous merchants asks for escort through bandit country in exchange for a share of their wares.',
      choices: [
        { text: 'Escort them (fight a small battle, then +120 gold)', effect: { battle: 'small', goldAfter: 120 } },
        { text: 'Rob them (+80 gold, lose 1 Discipline on all units)', effect: { gold: 80, disciplineAll: -1 } },
        { text: 'Decline', effect: {} }
      ] },
    { id: 'plague', title: 'Sickness in the Camp', text: 'A fever spreads through the tents. The camp surgeon says it will pass, but not without cost.',
      choices: [
        { text: 'Rest until it passes (lose 10% of models in each unit)', effect: { loseModelsPct: 0.1 } },
        { text: 'Buy medicine (-60 gold)', effect: { gold: -60 } }
      ] },
    { id: 'armoury', title: 'An Abandoned Armoury', text: 'Beneath a burnt-out keep you find a dry cellar stacked with old but serviceable arms and armour.',
      choices: [
        { text: 'Arm a unit with Heavy Armor', effect: { grantProp: 'Heavy Armor' } },
        { text: 'Sell the lot (+70 gold)', effect: { gold: 70 } }
      ] },
    { id: 'hermit', title: 'The Hermit of the Pass', text: 'A ragged hermit offers to read your commander\'s fortune for a small price.',
      choices: [
        { text: 'Pay him (-20 gold): a random magic item', effect: { gold: -20, randomItem: true } },
        { text: 'Ignore him', effect: {} }
      ] },
    { id: 'mercenaries', title: 'Sellswords', text: 'A company of sellswords sits at the inn, drinking your future gold. Their captain names a price.',
      choices: [
        { text: 'Hire them (-90 gold): recruit a unit', effect: { gold: -90, recruitRandom: true, big: true } },
        { text: 'Walk on', effect: {} }
      ] },
    { id: 'drill', title: 'A Week of Drill', text: 'The road ahead is quiet. Your sergeants suggest putting the time to use.',
      choices: [
        { text: 'Drill the troops: one unit gains a veterancy rank', effect: { trainOne: true } },
        { text: 'Forage instead (+45 gold)', effect: { gold: 45 } }
      ] },
    { id: 'ambush', title: 'Ambush!', text: 'Arrows hiss from the treeline. Raiders have been shadowing your column.',
      choices: [
        { text: 'Fight through (a small battle)', effect: { battle: 'small', goldAfter: 60 } },
        { text: 'Run for it (lose 15% of models, keep the road)', effect: { loseModelsPct: 0.15 } }
      ] },
    { id: 'tomb', title: 'The Barrow', text: 'A barrow mound looms beside the trail. Legend says a hero\'s blade lies within, guarded by something that does not sleep.',
      choices: [
        { text: 'Break in (fight an undead warband, then a magic weapon)', effect: { battle: 'undead', itemAfter: 'weapon' } },
        { text: 'Leave the dead to their rest', effect: {} }
      ] },
    { id: 'tax', title: 'The Toll Bridge', text: 'A baron\'s men hold the only bridge for miles and demand a toll of every army that passes.',
      choices: [
        { text: 'Pay the toll (-50 gold)', effect: { gold: -50 } },
        { text: 'Refuse and force the bridge (battle)', effect: { battle: 'normal', goldAfter: 80 } }
      ] },
    { id: 'feast', title: 'A Grateful Village', text: 'The villagers you have kept safe hold a feast in your honour. Morale soars.',
      choices: [
        { text: 'Enjoy the feast: all units recover losses', effect: { healAll: true } }
      ] }
  ]
};
