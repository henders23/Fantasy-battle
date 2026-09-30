// Authored battlefields. Local seeded randomness keeps a node's map stable on reload.
'use strict';
(function () {
  var B = {};
  B.defs = {
    borderlands: { name: 'The Borderlands', desc: 'Wooded flanks and an open road through the centre.', palette: [87, 94, 55] },
    plains: { name: 'The Golden Plains', desc: 'Wide cavalry lanes. Scrub conceals no approach but slows the unwary.', palette: [143, 132, 77] },
    desert: { name: 'The Saffron Dunes', desc: 'Deep sand slows movement. Sandstone outcrops shelter the flanks.', palette: [194, 156, 104] },
    oasis: { name: 'The Lost Oasis', desc: 'Fight around the water and the ruins of an abandoned caravanserai.', palette: [178, 146, 100] },
    badlands: { name: 'The Red Escarpment', desc: 'Rocky flanks, loose scree and an exposed central pass.', palette: [134, 102, 81] },
    ashlands: { name: 'The Ashen Fields', desc: 'Shattered ruins and black rock interrupt a broad plain of ash.', palette: [105, 104, 103] }
  };
  var plans = {
    borderlands: [['forest',7,12,8,7],['forest',44,22,8,7],['building',46,11,5,5],['scrub',15,24,8,5]],
    plains: [['scrub',8,12,9,5],['scrub',43,23,10,5],['building',48,12,4,4]],
    desert: [['dunes',8,11,10,7],['dunes',42,23,11,7],['cliff',45,11,7,6],['dunes',23,22,8,5]],
    oasis: [['lake',7,13,11,8],['building',43,11,6,5],['dunes',43,23,10,6],['scrub',23,24,7,5]],
    badlands: [['cliff',5,11,9,7],['cliff',46,22,9,7],['scree',17,24,9,5],['scree',37,12,7,6]],
    ashlands: [['building',8,12,7,6],['cliff',45,22,9,7],['scree',16,23,9,6],['building',44,11,5,5],['scree',28,13,7,5]]
  };
  B.forNode = function (camp, node) {
    var act = Math.max(0, Math.min(2, camp.act)), layer = camp.layer || 0;
    if (node && node.id) { var n = node.id.split('-'); if (n.length === 3 && isFinite(+n[1])) layer = +n[1]; }
    var sequence = [['borderlands','plains','borderlands','plains','borderlands','borderlands'],['plains','plains','desert','desert','oasis','desert','oasis'],['desert','badlands','plains','badlands','ashlands','ashlands','ashlands']];
    var id = sequence[act][Math.min(sequence[act].length-1, layer)];
    var salt = 0, key = (node && node.id) || act + '-' + layer;
    for (var i=0;i<key.length;i++) salt = (salt*31+key.charCodeAt(i))>>>0;
    return { id:id, name:B.defs[id].name, desc:B.defs[id].desc, seed:((camp.seed || 1) ^ salt)>>>0 };
  };
  B.terrain = function (field, scenario) {
    var rnd=SOVL.R.makeRng(field.seed), flip=rnd()<0.5, meeting=scenario==='meeting';
    return plans[field.id].map(function(p) {
      var x=p[1]+(rnd()-.5)*1.4, y=p[2]+(rnd()-.5)*1.1, w=p[3], h=p[4];
      if (flip) x=SOVL.TABLE.w-x-w;
      if (meeting) { h=Math.min(h,4.5); y=15+(y>20?5.5:0); }
      return {kind:p[0],x:x,y:y,w:w,h:h,seed:Math.floor(rnd()*1e6),biome:field.id};
    });
  };
  SOVL.Biomes=B;
})();
