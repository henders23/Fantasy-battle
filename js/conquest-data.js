// The Broken March: a territorial campaign for the Empire. Provinces on one map made of the three
// painted landscapes (the green March, the Red Reaches, the Ashen Waste), three named enemy lords
// with their own armies, neutral powers that can be won over or fought, and the story that runs
// through it. The rules that use this data are in js/conquest.js.
'use strict';
(function () {
  var D = {
    title: 'The Broken March',
    faction: 'empires_of_men',
    maxTurns: 24,
    moves: 2,
    maxArmies: 3,
    armyCap: 8,
    startGold: 250,
    grace: 3, // the other powers leave you alone until this turn
    map: { w: 3072, h: 1536, panels: ['borderlands', 'sunlands', 'ashlands'] },
    seasons: ['Spring', 'Summer', 'Autumn', 'Winter'],
    // muster and cap scale the other powers' recruiting and the size of their armies
    difficulties: [
      { id: 'easy', name: 'Recruit', gold: 350, muster: 0.55, cap: 0.78, strength: 0.8, aggression: 0.8, income: 1.15, desc: 'Smaller, more cautious enemies and richer provinces.' },
      { id: 'normal', name: 'Veteran', gold: 250, muster: 0.75, cap: 0.88, strength: 1, aggression: 1, income: 1, desc: 'The intended challenge.' },
      { id: 'hard', name: 'Legend', gold: 200, muster: 1, cap: 1, strength: 1.1, aggression: 1.1, income: 0.95, desc: 'Larger enemy armies that grow faster and strike harder.' }
    ],

    hero: { name: 'Aldric', title: 'Warden of the March', commander: 'captain', army: 'Aldric\'s Border Guard',
      retinue: ['imperial_sword', 15], units: [['imperial_spear', 15], ['imperial_archers', 10], ['imperial_light_cavalry', 5]] },

    regions: {
      march: { name: 'The Greenmarch', bonus: 'The March united: +40 gold a turn, and recruits cost 15% less.', gold: 40, recruit: 0.85 },
      reaches: { name: 'The Red Reaches', bonus: 'The caravan roads: +50 gold a turn.', gold: 50 },
      waste: { name: 'The Ashen Waste', bonus: 'The ash laid to rest: +30 gold a turn.', gold: 30 }
    },

    // what a province's features do while you hold it
    features: {
      capital: { name: 'Capital', desc: 'Your seat. Recruit any foot soldiers, missile troops and light horse here. Lose it and the March is lost.' },
      seat: { name: 'Lord\'s seat', desc: 'A lord\'s castle. Take it and the lord falls.' },
      fortress: { name: 'Fortress', desc: 'Walls. An assault here is fought over the gate and the keep (Scoring Objectives), and its garrison is larger.' },
      town: { name: 'Town', desc: 'Recruit battle-line infantry and missile troops; raise new armies.' },
      village: { name: 'Village', desc: 'Farms and a mill. A little gold.' },
      horse: { name: 'Stud farms', desc: 'While held, cavalry can be recruited in every town you hold.' },
      forge: { name: 'Forges', desc: 'While held, war machines can be recruited in every town you hold.' },
      armoury: { name: 'The Margrave\'s armoury', desc: 'While held, Foot Knights and Imperial Knights can be recruited in every town you hold.' },
      mine: { name: 'Mines', desc: 'Silver and red iron: a rich income.' },
      shrine: { name: 'Shrine', desc: 'While held, armies that rest recover twice as many of their wounded.' },
      market: { name: 'Market', desc: 'While held, magic relics and banners can be bought in your towns.' },
      ford: { name: 'Ford', desc: 'The crossing at Harrow\'s End.' },
      bridge: { name: 'Bridge', desc: 'The only stone bridge over the Greywater.' }
    },

    // x, y: the province's heart on the 3072 x 1536 map; income: gold a turn to its owner
    // garrison: [faction, points] for the levy that holds it at the start (none for your own)
    provinces: [
      { id: 'highmoor', name: 'Highmoor Keep', x: 610, y: 215, region: 'march', biome: 'borderlands', owner: 'rebels', income: 50, features: ['seat', 'fortress', 'town', 'armoury'], garrison: ['empires_of_men', 330],
        desc: 'The Margrave\'s castle above the lakes, now Count Ottokar\'s.' },
      { id: 'dunmar', name: 'Dunmar\'s Gate', x: 175, y: 150, region: 'march', biome: 'badlands', owner: 'neutral', power: 'dwarfs', income: 40, features: ['fortress', 'forge'], garrison: ['dwarf_holds', 620], special: true,
        desc: 'A dwarf hold in the high passes, under siege by Gorrak\'s raiders.' },
      { id: 'mirrormere', name: 'Mirrormere', x: 240, y: 430, region: 'march', biome: 'borderlands', owner: 'rebels', income: 25, features: ['town'], garrison: ['empires_of_men', 230],
        desc: 'A lake town of fishers and boatwrights, loyal to whoever paid last.' },
      { id: 'kingsmeadow', name: 'King\'s Meadow', x: 560, y: 520, region: 'march', biome: 'plains', owner: 'rebels', income: 25, features: ['horse'], garrison: ['empires_of_men', 220],
        desc: 'The Margrave\'s stud farms: the best horses in the March.' },
      { id: 'greywater', name: 'Greywater Bridge', x: 905, y: 545, region: 'march', biome: 'borderlands', owner: 'rebels', income: 25, features: ['town', 'bridge'], garrison: ['empires_of_men', 240],
        desc: 'A toll town on the only stone bridge over the Greywater.' },
      { id: 'elderglade', name: 'The Elder Glade', x: 175, y: 790, region: 'march', biome: 'borderlands', owner: 'neutral', power: 'elves', income: 15, features: ['shrine'], garrison: ['elven_conclaves', 520], special: true,
        desc: 'A wood older than the Empire, kept by the elves of the Glade.' },
      { id: 'oxley', name: 'Oxley Vale', x: 565, y: 880, region: 'march', biome: 'plains', owner: 'player', income: 20, features: ['village'],
        desc: 'Barley, sheep and a mill. The March\'s breadbasket.' },
      { id: 'harrowsend', name: 'Harrow\'s End', x: 880, y: 1150, region: 'march', biome: 'borderlands', owner: 'player', income: 15, features: ['ford'],
        desc: 'The ford where Aldric held off the Broken Tusk.' },
      { id: 'harrowgate', name: 'Harrowgate', x: 455, y: 1265, region: 'march', biome: 'borderlands', owner: 'player', income: 60, features: ['capital', 'fortress', 'town'],
        desc: 'The southern town of the March, and now its last loyal one.' },
      { id: 'fenwick', name: 'Fenwick Mere', x: 130, y: 1290, region: 'march', biome: 'borderlands', owner: 'neutral', income: 15, features: ['village'], garrison: ['empires_of_men', 190], holder: 'The Fenwick brigands',
        desc: 'Reed beds and smugglers\' huts. Brigands have taken it over.' },

      { id: 'redfang', name: 'Redfang Hold', x: 1590, y: 215, region: 'reaches', biome: 'oasis', owner: 'greenskins', income: 50, features: ['seat', 'fortress'], garrison: ['greenskin_tribes', 360],
        desc: 'An old palace at the oasis, now Gorrak Broken-Tusk\'s stronghold.' },
      { id: 'vulture', name: 'Vulture Canyons', x: 1180, y: 370, region: 'reaches', biome: 'badlands', owner: 'greenskins', income: 15, features: [], garrison: ['greenskin_tribes', 220],
        desc: 'Red canyons on the high road to Dunmar. Goblin raiders hold them.' },
      { id: 'escarpment', name: 'The Red Escarpment', x: 1905, y: 370, region: 'reaches', biome: 'badlands', owner: 'greenskins', income: 40, features: ['mine'], garrison: ['greenskin_tribes', 260],
        desc: 'Red iron mines, worked now by goblin slaves.' },
      { id: 'saffron', name: 'The Saffron Dunes', x: 1450, y: 610, region: 'reaches', biome: 'desert', owner: 'greenskins', income: 15, features: [], garrison: ['greenskin_tribes', 210],
        desc: 'Deep sand between the canyons and the oasis.' },
      { id: 'wadi', name: 'Bonewater Wadi', x: 1790, y: 770, region: 'reaches', biome: 'desert', owner: 'greenskins', income: 20, features: [], garrison: ['greenskin_tribes', 210],
        desc: 'A dry river bed lined with old bones.' },
      { id: 'thornveld', name: 'Thornveld', x: 1320, y: 1060, region: 'reaches', biome: 'plains', owner: 'neutral', income: 20, features: ['horse'], garrison: ['empires_of_men', 250], holder: 'The Thornveld riders',
        desc: 'Thorn-scrub grassland. Free riders breed horses here and serve no one.' },
      { id: 'ambergate', name: 'Ambergate', x: 1760, y: 1200, region: 'reaches', biome: 'plains', owner: 'neutral', power: 'ambergate', income: 50, features: ['town', 'market'], garrison: ['dwarf_holds', 400], special: true, holder: 'Ambergate\'s hired guard',
        desc: 'A caravan town that has traded with everyone for three hundred years.' },

      { id: 'ashenspire', name: 'The Ashen Spire', x: 2580, y: 225, region: 'waste', biome: 'ashlands', owner: 'dead', income: 40, features: ['seat', 'fortress'], garrison: ['dead_nations', 420],
        desc: 'A black castle above the lava falls. The Unburied King\'s tomb.' },
      { id: 'cinderfall', name: 'Cinderfall', x: 2200, y: 440, region: 'waste', biome: 'badlands', owner: 'dead', income: 15, features: [], garrison: ['dead_nations', 240],
        desc: 'Lava pours from the cliffs into the ash.' },
      { id: 'barrowfields', name: 'The Barrow Fields', x: 2520, y: 610, region: 'waste', biome: 'ashlands', owner: 'dead', income: 15, features: [], garrison: ['dead_nations', 260],
        desc: 'A plain of grave mounds, every one of them open.' },
      { id: 'emberreach', name: 'Ember Reach', x: 2930, y: 480, region: 'waste', biome: 'badlands', owner: 'dead', income: 20, features: ['mine'], garrison: ['dead_nations', 240],
        desc: 'Old silver workings under the burning cliffs.' },
      { id: 'greyruins', name: 'The Grey Ruins', x: 2480, y: 910, region: 'waste', biome: 'ashlands', owner: 'neutral', income: 20, features: ['shrine'], garrison: ['dead_nations', 220], holder: 'The restless dead of Carrow',
        desc: 'Carrow, a town that died with its king. Its chapel still stands.' },
      { id: 'lastwatch', name: 'Lastwatch', x: 2900, y: 1030, region: 'waste', biome: 'ashlands', owner: 'neutral', income: 30, features: ['town', 'fortress'], garrison: ['empires_of_men', 300], holder: 'The Watch of Lastwatch',
        desc: 'The last living town before the Waste. Its Watch trusts no one.' },
      { id: 'sorrowfen', name: 'Sorrow Fen', x: 2340, y: 1290, region: 'waste', biome: 'badlands', owner: 'neutral', income: 15, features: ['village'], garrison: ['greenskin_tribes', 200], holder: 'The fen goblins',
        desc: 'Black water and fen goblins.' }
    ],

    // the powers on the map. aggression: how readily their armies attack; targets: whom they attack
    powers: {
      player: { name: 'The Warden', color: '#4f8fe0', faction: 'empires_of_men' },
      rebels: { name: 'Count Ottokar', color: '#c8a03c', faction: 'empires_of_men', lord: 'ottokar', seat: 'highmoor', home: 'march', aggression: 0.32, attacks: 1, muster: 20, cap: 720, capTurn: 12, maxArmies: 2, targets: ['player', 'neutral'] },
      greenskins: { name: 'Gorrak\'s tribes', color: '#7aa63a', faction: 'greenskin_tribes', lord: 'gorrak', seat: 'redfang', home: 'reaches', roamFrom: 8, aggression: 0.6, attacks: 2, muster: 25, cap: 640, capTurn: 16, maxArmies: 3, targets: ['player', 'neutral', 'rebels', 'dead'] },
      dead: { name: 'The Unburied King', color: '#9466c9', faction: 'dead_nations', lord: 'vorhal', seat: 'ashenspire', home: 'waste', roamAfterWaking: 3, aggression: 0.5, attacks: 1, muster: 35, cap: 700, capTurn: 20, maxArmies: 3, mend: 0.2, targets: ['player', 'neutral', 'greenskins', 'rebels'] },
      neutral: { name: 'Free lands', color: '#9a9484', faction: null }
    },

    // portraits: index into assets/faction-portraits.webp (empire, dwarf, elf, orc, undead)
    lords: {
      ottokar: { name: 'Count Ottokar Vehl', title: 'the Usurper of Highmoor', power: 'rebels', portrait: 0, battleAggression: 0.4,
        army: { name: 'Ottokar\'s Host', at: 'highmoor', cmd: ['knight_commander', 'imperial_knights', 6], items: ['sword_of_might'], units: [['foot_knights', 12], ['imperial_halberd', 15], ['imperial_crossbowmen', 10], ['imperial_cannon', 1]] },
        taunt: '"A sergeant with a borrowed seal," says Count Ottokar, "and a mob in borrowed coats. Highmoor has walls, Captain. What do you have?"',
        escape: 'Count Ottokar is carried from the field, cursing, and rides hard for Highmoor.' },
      gorrak: { name: 'Gorrak Broken-Tusk', title: 'Warboss of the Red Reaches', power: 'greenskins', portrait: 3, battleAggression: 0.8,
        army: { name: 'Gorrak\'s Horde', at: 'redfang', cmd: ['war_chief', 'orc_brutes', 12], items: ['reaper_axe'], units: [['orc_warriors', 20], ['boar_riders', 6], ['goblin_shortbows', 15], ['trolls', 3]] },
        taunt: '"Little Warden!" Gorrak Broken-Tusk laughs, and the whole horde laughs with him. "Your ford was good fighting. Let\'s have more!"',
        escape: 'Gorrak Broken-Tusk is dragged off the field by his own boyz, still roaring, and taken back to Redfang Hold.' },
      vorhal: { name: 'Vorhal the Unburied', title: 'King under the Ash', power: 'dead', portrait: 4, battleAggression: 0.6,
        army: { name: 'The Unburied Host', at: 'ashenspire', cmd: ['vampire_knight', 'dread_knights', 5], items: ['talisman_of_life'], units: [['wight_guard', 15], ['skeleton_warriors', 20], ['skeleton_spear', 20], ['unearthed_catapult', 1]] },
        taunt: 'The Unburied King does not speak. His herald does, from a jaw that has not moved in a hundred years: "All of this was his. All of this will be his again. You are welcome to lie down in it."',
        escape: 'Vorhal\'s body comes apart on the field. By nightfall it has put itself back together inside the Ashen Spire.' }
    },
    // armies other than the lords' own at the start, or raised by the story
    armies: [
      { power: 'rebels', name: 'The Greywater Levy', at: 'greywater', cmd: ['captain', 'imperial_spear', 15], commander: 'Sir Halvard', units: [['imperial_sword', 12], ['imperial_archers', 10]] },
      { power: 'greenskins', name: 'Skarbad\'s Raiders', at: 'vulture', cmd: ['goblin_king', 'goblin_wolf_riders', 8], commander: 'Skarbad the Thief', units: [['goblin_mob', 20], ['goblin_shortbows', 15]] }
    ],
    risen: { power: 'dead', name: 'The Barrow Legion', at: 'barrowfields', cmd: ['wight_lord', 'skeleton_warriors', 20], commander: 'The Barrow-Wight', units: [['zombies', 20], ['skeleton_bowmen', 10], ['dire_wolves', 6]] },

    // commanders you can hire to lead a new army (raised in a town you hold)
    hires: [
      { id: 'captain', name: 'Captain', retinue: ['imperial_spear', 12], price: 150, desc: 'A steady officer with a company of spears.' },
      { id: 'imperial_wizard', name: 'Imperial Wizard', retinue: ['imperial_archers', 10], price: 210, desc: 'Two spells and a company of archers.' },
      { id: 'knight_commander', name: 'Knight Commander', retinue: ['imperial_knights', 5], price: 260, desc: 'A knight of the March and his lances.' }
    ],

    // a province's levy when you take it (it grows by a quarter a turn)
    levies: {
      village: [['imperial_spear', 15], ['imperial_archers', 10]],
      town: [['imperial_spear', 20], ['imperial_archers', 12], ['imperial_halberd', 15]],
      capital: [['imperial_halberd', 20], ['imperial_spear', 20], ['imperial_crossbowmen', 12], ['imperial_cannon', 1]],
      fortress: [['imperial_handguns', 12]]
    },
    fortifyPrice: 80,
    fortifyUnits: [['imperial_halberd', 12], ['imperial_crossbowmen', 10], ['imperial_spear', 15]]
  };

  // ---------- the story ----------
  // when(s): a test on the campaign state; once true (between turns, or after a battle) the scene
  // plays. choices: each with text and an effect (in js/conquest.js, K.effects) that returns lines
  // for the chronicle. portrait: index into the faction portraits. Scenes fire once.
  D.story = [
    { id: 'opening', when: function (s) { return s.turn === 1; }, eyebrow: 'The Broken March · Spring', title: 'The Margrave is dead', art: 'march',
      text: [
        'Margrave Aldwin died in his bed at Highmoor, and before his body was cold his cousin, Count Ottokar Vehl, had shut the gates, hanged the steward and named himself lord of the March.',
        'The March did not wait for the quarrel to end. Out of the Red Reaches came Gorrak Broken-Tusk and every greenskin who could carry an axe, and in the east the barrow-lights burned again over the Ashen Waste, where nothing living has gone for a hundred years.',
        'The Margrave\'s last seal came south to Harrowgate, to the captain who held the ford at Harrow\'s End: Aldric of the Border Guard, now Warden of the March, with one town, two villages and a year to set things right.'
      ],
      aims: [
        'Take Highmoor Keep from Count Ottokar.',
        'Break Gorrak Broken-Tusk at Redfang Hold.',
        'Find out what is stirring in the Ashen Waste, and end it at the Ashen Spire.',
        'Do it before winter is out: 24 turns. If Harrowgate falls, the March is lost.'
      ],
      note: 'Each turn, march your armies, fight, recruit, then end the turn and the other powers move. Provinces pay gold every turn. You can lead any battle yourself, or let the army\'s commander fight it.',
      choices: [{ text: 'Raise the banner' }] },

    { id: 'letter', when: function (s) { return s.turn === 2; }, eyebrow: 'Turn 2 · A herald from Highmoor', title: 'A letter from Count Ottokar', portrait: 0,
      text: ['A herald in Vehl colours rides into Harrowgate under a white cloth. The Count writes that the Warden\'s seal is a forgery, that Aldric is a sergeant with ideas above his station, and that he will accept the sergeant\'s surrender, and his head, at Highmoor before the month is out.'],
      choices: [
        { text: 'Burn the letter in front of the herald', hint: 'Ottokar\'s armies will come out from behind his walls to fight you for the next four turns.', effect: { stance: ['rebels', 'enraged', 4] } },
        { text: 'Answer politely and stall', hint: 'No rebel attacks for four turns.', effect: { stance: ['rebels', 'truce', 4] } },
        { text: 'Offer the Count\'s own lands if he bends the knee', hint: 'Ottokar will refuse, but his vassal at Mirrormere may waver.', effect: { waver: 'mirrormere' } }
      ] },

    { id: 'dunmar_plea', when: function (s) { return s.turn === 3 && s.provinces.dunmar.owner === 'neutral'; }, eyebrow: 'Turn 3 · A rider from the mountains', title: 'Smoke over Dunmar', portrait: 1,
      text: ['A dwarf with a singed beard and no patience arrives on a pit pony. The Gate of Dunmar, in the mountains to the north-west, has been under siege for a month: Gorrak\'s goblins hold the Vulture Canyons and the high road behind them.', 'Thane Brokk Dunmar does not ask for help. He wants it known that he would not refuse it.'],
      choices: [
        { text: 'Promise to clear the Vulture Canyons', hint: 'Take the Vulture Canyons by the end of turn 10 and Dunmar will join the March.', effect: { quest: ['dunmar', 10] } },
        { text: 'Promise nothing', effect: {} }
      ] },

    { id: 'dunmar_won', when: function (s) { var q = s.quests.dunmar; return q && q.state === 'open' && s.provinces.vulture.owner === 'player'; }, eyebrow: 'Dunmar\'s Gate', title: 'The Thane keeps his word', portrait: 1,
      text: ['The canyons are clear and the high road is open. Thane Brokk Dunmar comes down from his gate with forty dwarfs in full armour, looks at Aldric for a long time, and offers a hand like a block of granite.', '"Dunmar remembers who came," he says. "Our forges are yours. So is this."'],
      choices: [
        { text: 'Accept the rune-blade', hint: 'Dunmar joins the March. Aldric takes up a rune-blade.', effect: { questDone: 'dunmar', province: ['dunmar', 'player'], item: 'runeblade' } },
        { text: 'Ask for gold for the war chest', hint: 'Dunmar joins the March. +150 gold.', effect: { questDone: 'dunmar', province: ['dunmar', 'player'], gold: 150 } }
      ] },

    { id: 'dunmar_lost', when: function (s) { var q = s.quests.dunmar; return q && q.state === 'open' && s.turn > q.until; }, eyebrow: 'Dunmar\'s Gate', title: 'The gate stays shut', portrait: 1,
      text: ['No more riders come from Dunmar. The dwarfs have decided to hold out alone, and they will not forget who did not come.'],
      choices: [{ text: 'So be it', effect: { questFail: 'dunmar' } }] },

    { id: 'barrow_lights', when: function (s) { return !s.flags.deadAwake && (s.turn >= (s.flags.gladeBurned ? 5 : 7) || K().playerNear(s, 'waste')); }, eyebrow: 'The Ashen Waste stirs', title: 'The barrow-lights', portrait: 4,
      text: ['In the night every dog in the March howls at once. In the morning, riders from Lastwatch report that the Ashen Waste is moving: columns of the dead marching west under a banner no one has carried in a hundred years.', 'Vorhal, who was king here before there was a March, has woken, and he remembers all of it as his.'],
      note: 'The dead now march. Their armies mend a fifth of their losses every turn.',
      choices: [{ text: 'Let them come', effect: { wake: true } }] },

    { id: 'snow', when: function (s) { return s.turn === 20; }, eyebrow: 'Turn 20 · Winter', title: 'The first snow', portrait: null, art: 'march',
      text: ['Snow on the passes, and on the roofs of Harrowgate. In four turns the roads close for the winter, and whatever the March looks like then, it will look like that until spring.'],
      choices: [{ text: 'Four turns, then', effect: {} }] }
  ];

  // scenes when a province with a power of its own is entered
  D.visits = {
    dunmar: { eyebrow: 'Dunmar\'s Gate', title: 'The gate of black iron', portrait: 1,
      text: ['The gate is sixty feet of black iron, and the dwarfs behind it have been besieged long enough to be suspicious of everyone. Thane Brokk Dunmar speaks from the wall.', '"Clear the canyons, manling, and we can talk as friends. Until then, the forges are open to anyone who pays."'],
      choices: [
        { text: 'Pay for the use of the forges (150 gold)', gold: 150, hint: 'War machines can be recruited in your towns.', effect: { gold: -150, unlock: 'forge' } },
        { text: 'Storm the gate', hint: 'A hard fight against the dwarfs of the hold.', effect: { attack: true } },
        { text: 'Leave in peace', effect: {} }
      ] },
    elves: { eyebrow: 'The Elder Glade', title: 'Lady Sylvaine', portrait: 2,
      text: ['The Elder Glade is older than the Empire and has never cared who rules the March. Lady Sylvaine meets your outriders at the treeline, alone, as if she had been expecting them.', '"The Unburied King is waking," she says. "When he does, everything you are fighting over will be his. Swear to end him, and the Glade will tend your wounded."'],
      choices: [
        { text: 'Swear the oath', hint: 'The Glade joins you. Resting armies recover twice as fast.', effect: { province: ['elderglade', 'player'], flag: 'oath' } },
        { text: 'Fell the old wood for timber and gold', hint: 'A battle against the elves. Win it for the Glade and 150 gold, and the dead will stir sooner.', effect: { attack: true, flag: 'gladeBurned', goldAfter: 150 } },
        { text: 'Leave her in peace', effect: {} }
      ] },
    ambergate: { eyebrow: 'Ambergate', title: 'The council of Ambergate', portrait: null, art: 'reaches',
      text: ['Ambergate has traded with orcs, dwarfs and dead men\'s heirs for three hundred years, and it has never once been on the losing side. Its council receives the Warden\'s envoy with wine and a ledger.', '"We are listening," says the council\'s speaker. "What does the Warden offer?"'],
      choices: [
        { text: 'The Warden\'s protection and low tolls (200 gold)', gold: 200, hint: 'Ambergate joins you peacefully, market and all.', effect: { gold: -200, province: ['ambergate', 'player'] } },
        { text: 'Take the town', hint: 'Ambergate\'s hired dwarf guard will fight.', effect: { attack: true } },
        { text: 'Ride on', effect: {} }
      ] }
  };

  // when a lord's seat falls
  D.falls = {
    rebels: { eyebrow: 'Highmoor Keep', title: 'The usurper', portrait: 0,
      text: ['Highmoor\'s gates come down at dusk. Count Ottokar Vehl is brought before Aldric in the Margrave\'s chapel, still wearing the Margrave\'s armour.', '"Well, sergeant," he says. "Get on with it."'],
      choices: [
        { text: 'Hang him from his own gate', hint: '+150 gold from his treasury. His remaining lands fall into disorder.', effect: { fate: ['ottokar', 'hanged'], gold: 150, release: 'rebels' } },
        { text: 'Pardon him, and give him a command', hint: 'His lands swear to the Warden, and Ottokar leads a new army for you.', effect: { fate: ['ottokar', 'pardoned'], annex: 'rebels', hireLord: 'ottokar' } },
        { text: 'Exile him for a ransom', hint: '+250 gold. His remaining lands fall into disorder.', effect: { fate: ['ottokar', 'exiled'], gold: 250, release: 'rebels' } }
      ] },
    greenskins: { eyebrow: 'Redfang Hold', title: 'The Warboss', portrait: 3,
      text: ['Redfang Hold is a ruin, and Gorrak Broken-Tusk is sitting on its steps with a broken axe, grinning.', '"Good fight," he says. "Best fight. What now, little Warden?"'],
      choices: [
        { text: 'Finish him', hint: 'The tribes scatter. Their lands fall into disorder.', effect: { fate: ['gorrak', 'slain'], release: 'greenskins' } },
        { text: 'Point him east, at the dead', hint: 'The tribes keep their lands but never attack you again, and throw themselves at the dead.', effect: { fate: ['gorrak', 'unleashed'], stance: ['greenskins', 'unleashed', 99] } },
        { text: 'Make him pay tribute', hint: 'The tribes keep their lands, never attack you again, and pay 40 gold a turn.', effect: { fate: ['gorrak', 'tribute'], stance: ['greenskins', 'tribute', 99] } }
      ] },
    dead: { eyebrow: 'The Ashen Spire', title: 'The Unburied King', portrait: 4,
      text: ['At the top of the Ashen Spire there is a throne, and on it what is left of Vorhal. This time, when he falls, he stays down.', 'The barrow-lights go out across the Waste one by one, and for the first time in a hundred years the wind out of the east smells of nothing at all.'],
      choices: [{ text: 'Burn the throne', effect: { fate: ['vorhal', 'destroyed'], release: 'dead' } }] }
  };

  // the ending, in pieces chosen by what happened
  D.epilogue = {
    victory: 'Spring comes to a March with one lord in it. The Emperor\'s envoy arrives in time for the coronation of the new Margrave, and finds Aldric of the Border Guard already sitting in the chair, looking uncomfortable.',
    partial: 'Winter closes the roads with the March still divided. Aldric holds what he holds, and in spring the fighting will start again.',
    lost: 'Harrowgate falls, and with it the Warden\'s claim. Whatever rules the March now, it will not be Aldric.',
    lostTime: 'Winter closes the roads with most of the March in other hands. The Emperor\'s envoy arrives in spring to find a captain with a borrowed seal and very little else, and by summer the March has a new Warden.',
    fates: {
      ottokar: { hanged: 'Count Ottokar Vehl hung from his own gate for a week, as a lesson to anyone else with ideas.', pardoned: 'Count Ottokar Vehl kept his word, to everyone\'s surprise, his own included.', exiled: 'Count Ottokar Vehl took ship for the south with his ransom paid, and was not heard of again.' },
      gorrak: { slain: 'Gorrak Broken-Tusk\'s head went up over Redfang Hold, and the tribes went back to fighting each other.', unleashed: 'Gorrak Broken-Tusk went east singing, and the dead learned what the March had known for years.', tribute: 'Gorrak Broken-Tusk paid his tribute every month, in gold, goats and once, inexplicably, a war-boar.' },
      vorhal: { destroyed: 'Nothing has come out of the Ashen Waste since the Spire fell.' }
    },
    flags: {
      oath: 'Lady Sylvaine came to the coronation, stayed for one cup of wine, and left a seedling in the castle garden.',
      gladeBurned: 'Where the Elder Glade stood there are stumps now, and the March does not talk about it.',
      dunmar: 'The dwarfs of Dunmar sent a gift of a gate: sixty feet of black iron, for Harrowgate.'
    }
  };

  // late-bound: the rules module (scenes are defined before it loads)
  function K() { return SOVL.Conquest; }

  SOVL.CONQUEST = D;
})();
