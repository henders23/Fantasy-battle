// Visual and interaction regression checks for the campaign expansion.
// Requires Playwright + Chromium. Pass the static server URL and screenshot directory.
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),pw=require('playwright');
(async()=>{
 const browser=await pw.chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
 const base=process.argv[2]||'http://127.0.0.1:8123/index.html',out=process.argv[3]||'/tmp/fantasy-expansion';fs.mkdirSync(out,{recursive:true});
 await page.goto(base);await page.waitForFunction(()=>SOVL.RealisticArt.ready());
 const art=await page.evaluate(()=>{let misses=[],count=0;for(const[fid,f]of Object.entries(SOVL.FACTION_DATA))for(const section of f.sections)for(const d of section.units){const u=SOVL.Thumbs.fromDef(fid,d.id);const a=SOVL.RealisticArt.resolve(u,'r',null);if(!a||!a.rect||!a.image.naturalWidth)misses.push(fid+'/'+d.id);count++;}return{misses,count};});
 assert.deepStrictEqual(art.misses,[]);console.log('All '+art.count+' named unit definitions have loaded artwork.');
 await page.click('#btn-quick');await page.waitForTimeout(600);
 const hint=await page.evaluate(()=>{const U=SOVL.UI,b=U.battle;U.settings.music=false;U.settings.sound=true;window.__sfxTrace=[];b.phase='strategic';b.active=0;let us=b.unitsOf(0);b.activeUnit=us[0].uid;U.sel=us[0].uid;U.canvasClick({x:us[1].x,y:us[1].y},{});return{text:document.getElementById('battle-hint').textContent,active:b.activeUnit,expected:us[0].uid,trace:window.__sfxTrace.slice()};});
 assert.match(hint.text,/Finish the current/);assert.strictEqual(hint.active,hint.expected);assert(!hint.trace.includes('ui_error'));
 await page.evaluate(()=>{const U=SOVL.UI;U.closeModal();U.settings.sound=false;U.campaign=SOVL.Campaign.create({faction:'empires_of_men',commander:'captain',name:'Aldric'});U.showCampaign();U.closeModal();});
 for(let act=0;act<3;act++){
  await page.evaluate(act=>{let U=SOVL.UI,c=U.campaign;c.act=act;c.nodeIndex=null;c.layer=0;U.renderCampaign();document.getElementById('camp-map').scrollTop=0;},act);
  await page.waitForTimeout(150);await page.screenshot({path:path.join(out,'world-act-'+act+'.png')});
  const counts=await page.evaluate(()=>{const c=SOVL.UI.campaign;return{buttons:document.querySelectorAll('.trail-map .node.avail').length,available:SOVL.Campaign.availableNodes(c).length};});assert.strictEqual(counts.buttons,counts.available);
 }
 for(const choice of ['reinforce','train','supplies']){
  await page.evaluate(()=>{const U=SOVL.UI,C=SOVL.Campaign,c=U.campaign;c.act=1;c.layer=0;c.nodeIndex=0;const n=C.nodeAt(c,0,0);n.type='camp';n.visited=true;delete n.campClaimed;c.army.entries.forEach(e=>{let t=e.retinue||e;t.models=2;t.vet=0;});window.beforeGold=c.gold;U.renderCampaign();U.campaignCamp(n);});
  await page.waitForTimeout(100);if(choice==='reinforce')await page.screenshot({path:path.join(out,'camp-choices.png')});
  if(choice==='train'){assert(await page.locator('.cp-drill').isDisabled());await page.locator('.cp-opt:not([disabled])').first().click();await page.locator('.cp-drill').click();}
  else await page.locator(choice==='reinforce'?'.cp-card:first-child > button.primary':'.cp-supplies > button.primary').click();
  assert(await page.locator('#modal-body.m-dawn').count());const state=await page.evaluate(()=>{let c=SOVL.UI.campaign,n=SOVL.Campaign.nodeAt(c,0,0);return{gold:c.gold-window.beforeGold,claimed:n.campClaimed,models:c.army.entries.map(e=>(e.retinue||e).models),vet:c.army.entries[0].retinue.vet};});
  assert.strictEqual(state.gold,choice==='supplies'?175:75);assert(state.claimed);assert(state.models.every(n=>n>=10));if(choice==='train')assert.strictEqual(state.vet,1);
  await page.locator('#m-ok').click();
 }
 // Reloading while still at camp resumes the choice instead of silently spending the stop.
 await page.evaluate(()=>{let c=SOVL.UI.campaign;let n=SOVL.Campaign.nodeAt(c,0,0);delete n.campClaimed;SOVL.Campaign.save(c);});
 await page.reload();await page.click('#btn-continue');await page.waitForSelector('.cp-supplies');await page.locator('.cp-supplies > button.primary').click();await page.locator('#m-ok').click();
 for(const spec of [{act:1,layer:0,id:'plains'},{act:1,layer:2,id:'desert'},{act:1,layer:4,id:'oasis'},{act:2,layer:1,id:'badlands'},{act:2,layer:6,id:'ashlands'}]){
  await page.evaluate(({act,layer})=>{let U=SOVL.UI,c=U.campaign;U.closeModal();c.pendingBattle=null;c.act=act;c.layer=layer;c.nodeIndex=0;let n=SOVL.Campaign.nodeAt(c,layer,0);n.type='battle';U.show('campaign');U.campaignBattle(n);},spec);
  assert(await page.locator('.brief-scen').first().textContent());await page.click('#m-fight');await page.waitForTimeout(800);
  const result=await page.evaluate(()=>{let b=SOVL.UI.battle;return{id:b.biome,terrain:b.terrain.map(t=>t.kind),placed:b.units.filter(u=>!u.placed).length};});assert.strictEqual(result.id,spec.id);assert.strictEqual(result.placed,0);
  await page.screenshot({path:path.join(out,'battle-'+spec.id+'.png')});
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{const U=SOVL.UI,c=U.campaign;U.closeModal();c.pendingBattle=null;c.act=1;c.layer=0;c.nodeIndex=null;U.showCampaign();});await page.waitForTimeout(200);
 await page.screenshot({path:path.join(out,'mobile-map.png')});
 const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,map:document.querySelector('.trail-map').getBoundingClientRect().width}));assert(dimensions.scroll<=dimensions.width+1,'no mobile horizontal overflow');
 await page.evaluate(()=>{let c=SOVL.UI.campaign;c.layer=0;c.nodeIndex=0;let n=SOVL.Campaign.nodeAt(c,0,0);n.type='camp';delete n.campClaimed;n.visited=true;SOVL.UI.campaignCamp(n);});
 await page.locator('.cp-supplies > button.primary').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'mobile-camp.png')});await page.locator('.cp-supplies > button.primary').click();assert(await page.locator('#modal-body.m-dawn').count());
 assert.deepStrictEqual(errors,[]);assert.deepStrictEqual(failed,[]);console.log('BROWSER EXPANSION PASSED: unit coverage, silent blocked selection, 3 world maps, 3 camp rewards, camp reload, 5 later battlefields, mobile map/camp; no errors or failed assets.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
