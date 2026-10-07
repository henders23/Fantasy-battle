// Original realistic faction atlases. Bounds are authored at asset preparation time.
'use strict';
(function () {
  var manifest = {
  "empires_of_men": {
    "file": "assets/units/empire.webp?v=overhead2",
    "ids": [
      "captain",
      "knight_commander",
      "imperial_wizard",
      "gryphon",
      "imperial_dragon",
      "imperial_sword",
      "foot_knights",
      "imperial_halberd",
      "imperial_spear",
      "imperial_knights",
      "imperial_light_cavalry",
      "imperial_archers",
      "imperial_crossbowmen",
      "imperial_handguns",
      "imperial_cannon",
      "imperial_mortar",
      "imperial_dreadnought"
    ],
    "rects": [
      [42, 20, 236, 280],
      [355, 20, 250, 280],
      [711, 20, 179, 280],
      [980, 59, 280, 202],
      [1300, 35, 280, 251],
      [59, 340, 202, 280],
      [392, 340, 177, 280],
      [709, 340, 182, 280],
      [1031, 340, 179, 280],
      [1375, 340, 130, 280],
      [77, 660, 166, 280],
      [357, 660, 247, 280],
      [677, 660, 246, 280],
      [1036, 660, 169, 280],
      [1300, 684, 280, 233],
      [20, 983, 280, 275],
      [348, 980, 264, 280],
      [662, 980, 277, 280],
      [993, 980, 254, 280],
      [1343, 980, 195, 280]
    ],
    "standard": 17,
    "mountedStandard": 18
  },
  "dwarf_holds": {
    "file": "assets/units/dwarves.webp?v=overhead2",
    "ids": [
      "dwarf_foreman",
      "ranger_captain",
      "dwarf_engineer",
      "dwarf_warriors",
      "dwarf_veterans",
      "dwarf_miners",
      "dwarf_crossbows",
      "dwarf_handguns",
      "dwarf_rangers",
      "dwarf_cannon",
      "dwarf_bolt_thrower",
      "dwarf_stonethrower",
      "dwarf_berserkers",
      "deep_guard",
      "inferno_cannon",
      "dwarf_flying_machine"
    ],
    "rects": [
      [43, 20, 235, 280],
      [347, 20, 266, 280],
      [684, 20, 233, 280],
      [981, 20, 279, 280],
      [1322, 20, 236, 280],
      [20, 348, 280, 265],
      [359, 340, 242, 280],
      [702, 340, 196, 280],
      [1010, 340, 221, 280],
      [1300, 343, 280, 275],
      [30, 660, 261, 280],
      [356, 660, 248, 280],
      [680, 660, 241, 280],
      [1007, 660, 227, 280],
      [1300, 667, 280, 267],
      [21, 980, 278, 280],
      [359, 980, 243, 280],
      [697, 980, 207, 280],
      [980, 988, 280, 264],
      [1300, 990, 280, 260]
    ],
    "standard": 16,
    "mountedStandard": null
  },
  "elven_conclaves": {
    "file": "assets/units/elves.webp?v=overhead2",
    "ids": [
      "elf_noble",
      "elf_mage",
      "elf_spellsword",
      "ancient_dragon",
      "gryphon",
      "elf_spears",
      "elf_city_guard",
      "weapon_masters",
      "elf_archers",
      "elf_watchers",
      "elf_bolt_thrower",
      "elf_lancers",
      "elf_reavers",
      "elf_chariot",
      "giant_eagle",
      "dragon_knights"
    ],
    "rects": [
      [62, 20, 196, 280],
      [394, 20, 172, 280],
      [709, 20, 183, 280],
      [980, 47, 280, 227],
      [1300, 38, 280, 244],
      [76, 340, 168, 280],
      [389, 340, 182, 280],
      [724, 340, 152, 280],
      [1011, 340, 219, 280],
      [1349, 340, 182, 280],
      [21, 660, 279, 280],
      [422, 660, 116, 280],
      [716, 660, 168, 280],
      [981, 660, 278, 280],
      [1300, 696, 280, 209],
      [20, 986, 280, 268],
      [348, 980, 265, 280],
      [709, 980, 183, 280],
      [1063, 980, 115, 280],
      [1322, 980, 237, 280]
    ],
    "standard": 16,
    "mountedStandard": 19
  },
  "greenskin_tribes": {
    "file": "assets/units/orcs.webp?v=overhead2",
    "ids": [
      "war_chief",
      "goblin_shaman",
      "goblin_king",
      "wyvern",
      "giant_spider",
      "orc_warriors",
      "orc_brutes",
      "goblin_mob",
      "goblin_spear_mob",
      "boar_riders",
      "goblin_wolf_riders",
      "orc_boar_chariot",
      "goblin_shortbows",
      "goblin_bolt_throwers",
      "goblin_stonethrower",
      "trolls",
      "giant"
    ],
    "rects": [
      [37, 20, 247, 280],
      [397, 20, 167, 280],
      [663, 20, 275, 280],
      [980, 53, 280, 215],
      [1300, 23, 280, 275],
      [45, 340, 231, 280],
      [358, 340, 244, 280],
      [673, 340, 255, 280],
      [1021, 340, 199, 280],
      [1339, 340, 202, 280],
      [92, 660, 137, 280],
      [340, 666, 280, 269],
      [688, 660, 225, 280],
      [980, 666, 280, 269],
      [1300, 671, 280, 259],
      [20, 983, 280, 274],
      [340, 992, 280, 256],
      [660, 992, 280, 256],
      [1002, 980, 236, 280],
      [1304, 980, 272, 280]
    ],
    "standard": 17,
    "mountedStandard": null
  },
  "dead_nations": {
    "file": "assets/units/undead.webp?v=overhead2",
    "ids": [
      "wight_lord",
      "vampire_knight",
      "necromancer",
      "bone_dragon",
      "skeleton_warriors",
      "zombies",
      "wight_guard",
      "skeleton_spear",
      "unearthed_catapult",
      "skeleton_bowmen",
      "dire_wolves",
      "skeleton_knights",
      "dread_knights",
      "fell_bats",
      "zombie_giant"
    ],
    "rects": [
      [63, 20, 194, 280],
      [378, 20, 205, 280],
      [709, 20, 183, 280],
      [980, 74, 280, 173],
      [1343, 20, 194, 280],
      [59, 340, 202, 280],
      [390, 340, 181, 280],
      [714, 340, 173, 280],
      [980, 356, 280, 248],
      [1336, 340, 209, 280],
      [94, 660, 132, 280],
      [417, 660, 127, 280],
      [732, 660, 136, 280],
      [980, 737, 280, 126],
      [1300, 664, 280, 272],
      [39, 980, 243, 280],
      [365, 980, 230, 280],
      [713, 980, 175, 280],
      [980, 994, 280, 253],
      [1331, 980, 219, 280]
    ],
    "standard": 15,
    "mountedStandard": 18
  }
};
  var images={}, revision=0;
  Object.keys(manifest).forEach(function(fid){
    var img=new Image();images[fid]=img;
    img.onload=function(){revision++;window.dispatchEvent(new window.Event('unitartready'));};
    img.src=manifest[fid].file;
  });
  function resolve(u,role,cmd) {
    var m=manifest[u.faction];if(!m)return null;
    var id=cmd && (!cmd.mount && cmd.def.type===u.type || SOVL.commanderOnly(u))?cmd.def.id:u.id;
    // Weapon changes follow the nearest matching figure within the same faction.
    if(!cmd && u.faction==='empires_of_men' && /imperial_(sword|spear|halberd)/.test(id)) {
      if(/Halberd/.test(u.weapon))id='imperial_halberd';else if(/Spear/.test(u.weapon))id='imperial_spear';
    }
    if(!cmd && id==='dwarf_warriors' && /Greatweapon/.test(u.weapon))id='dwarf_veterans';
    if(!cmd && id==='skeleton_warriors' && /Spear/.test(u.weapon))id='skeleton_spear';
    var index=m.ids.indexOf(id);
    if(role==='std' && !/Hounds|Monstrous/.test(u.type)) {
      if(u.type==='Cavalry'){if(m.mountedStandard!=null)index=m.mountedStandard;}else index=m.standard;
    }
    // These three authored machines point south on their source sheet; canonical
    // north-facing model space rotates them before the regiment's facing is applied.
    var rotation=u.faction==='dwarf_holds' && /^(dwarf_cannon|inferno_cannon|dwarf_flying_machine)$/.test(id)?Math.PI:0;
    return index<0?null:{image:images[u.faction],rect:m.rects[index],id:id,rotation:rotation};
  }
  function draw(ctx,u,bw,bd,role,cmd) {
    var a=resolve(u,role,cmd);if(!a||!a.image.complete||!a.image.naturalWidth)return false;
    var r=a.rect, single=SOVL.isSingle(u.type)&&!SOVL.commanderOnly(u), cav=/Cavalry|Hounds/.test(u.type);
    // Compact overhead silhouettes live inside their rank, rather than stacking
    // upright portraits over the heads of the soldiers behind them.
    var maxW=bw*(single?1.05:.98),maxH=bd*(single?1.08:cav?.98:1.28);
    var k=Math.min(maxW/r[2],maxH/r[3]),w=r[2]*k,h=r[3]*k;
    ctx.save();
    ctx.fillStyle='rgba(8,9,10,.28)';ctx.beginPath();ctx.ellipse(.035,bd*.12,bw*.29,bd*.19,0,0,Math.PI*2);ctx.fill();
    ctx.rotate(a.rotation||0);
    var top=single||cav?-h/2:bd*.45-h;
    ctx.drawImage(a.image,r[0],r[1],r[2],r[3],-w/2,top,w,h);
    ctx.restore();return true;
  }
  SOVL.RealisticArt={draw:draw,resolve:resolve,manifest:manifest,revision:function(){return revision;},ready:function(){return Object.keys(images).every(function(f){return images[f].complete&&images[f].naturalWidth;});}};
})();
