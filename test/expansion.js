// Campaign recovery, repeat-claim protection and deterministic battlefield contracts.
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const ctx={window:{},console,Math};vm.createContext(ctx);
['data','data_units','geom','rules','battle','army','ai','biomes','campaign'].forEach(f=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+f+'.js'),'utf8'),ctx));
const S=ctx.window.SOVL,C=S.Campaign;let checks=0;function ok(v,msg){assert(v,msg);checks++;}
for(const fid of Object.keys(S.FACTION_DATA))for(let act=0;act<3;act++)for(const choice of ['reinforce','train','supplies']){
  S.R.setSeed(100+act);const c=C.create({faction:fid,commander:S.FACTION_DATA[fid].sections[0].units[0].id});c.act=act;c.layer=0;c.nodeIndex=0;let node=C.nodeAt(c,0,0);node.type='camp';node.visited=true;
  c.army.entries.forEach(e=>{let t=e.retinue||e,d=S.findUnitDef(fid,t.id);if(d.per){t.maxSeen=Math.min(d.size[1],d.size[0]+2);t.models=1;}});
  let pre=c.gold,entry=c.army.entries[0];let result=C.campVisit(c,node,choice,entry);
  ok(result&&node.campClaimed,'camp claims once');ok(c.gold-pre===(50+act*25)+(choice==='supplies'?75+act*25:0),'camp gold exact');
  for(const e of c.army.entries){let t=e.retinue||e,d=S.findUnitDef(fid,t.id);if(d.per)ok(t.models>=d.size[0]&&t.models<=d.size[1],'recovery within unit limits');}
  if(choice==='train'){let t=entry.retinue;ok(t.vet===1&&t.battles>=S.CAMPAIGN.veteran[0].at,'training survives later battle thresholds');}
  const saved=JSON.stringify(c);ok(C.campVisit(c,node,choice,entry)===null&&JSON.stringify(c)===saved,'duplicate claim is inert');
  const old=JSON.parse(saved);delete old.map.acts[act].layers[0][0].campClaimed;ok(C.campVisit(old,old.map.acts[act].layers[0][0],'supplies'),'legacy saves need no migration');
}
for(const id of Object.keys(S.Biomes.defs))for(const scenario of ['pitched','meeting','objectives'])for(let seed=1;seed<=10;seed++){
  let field={id,seed},a=S.Biomes.terrain(field,scenario),b=S.Biomes.terrain(field,scenario);ok(JSON.stringify(a)===JSON.stringify(b),'terrain stable across reload');
  for(const t of a){ok(S.TERRAIN_TYPES[t.kind],'every terrain kind has rules');ok(t.x>=0&&t.y>=0&&t.x+t.w<=60&&t.y+t.h<=40,'inside table');if(scenario==='meeting')ok(t.y>=14&&t.y+t.h<=26,'meeting deployment clear');}
  for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const p=a[i],q=a[j];ok(p.x+p.w<=q.x||q.x+q.w<=p.x||p.y+p.h<=q.y||q.y+q.h<=p.y,'no overlapping terrain footprints');}
}
for(let act=0;act<3;act++)for(let layer=0;layer<S.CAMPAIGN.acts[act].layers;layer++){
  let c={act,layer:0,seed:43},n={id:act+'-'+layer+'-0'};ok(S.Biomes.forNode(c,n).id===S.Biomes.forNode({...c,layer},n).id,'map preview matches battlefield');
}
ok(!fs.existsSync(path.join(__dirname,'../assets/sfx/ui_error_1.mp3')),'irritating sound asset removed');
ok(!fs.readFileSync(path.join(__dirname,'../js/sfx.js'),'utf8').includes('ui_error'),'error sound cannot be scheduled or preloaded');
ok(!JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/sfx/sfx.json'),'utf8')).ui_error,'error sound removed from the asset manifest');
console.log('EXPANSION TESTS PASSED: '+checks+' reward, save, terrain and sound checks.');
