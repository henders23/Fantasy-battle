// Actual browser renders, atlas validation and visual-review contact sheets.
// CHROMIUM_PATH=/path/to/chromium node test/visual-art.js [output directory]
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),http=require('http'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||'/tmp/fantasy-art-review');
fs.mkdirSync(out,{recursive:true});
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file===root)file=path.join(root,'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>SOVL.RealisticArt.ready()&&SOVL.BiomeArt.ready());
  const coverage=await page.evaluate(()=>{
    let count=0,issues=[];
    for(const[fid,f]of Object.entries(SOVL.FACTION_DATA))for(const sec of f.sections)for(const d of sec.units){
      count++;const u=SOVL.Thumbs.fromDef(fid,d.id),a=SOVL.RealisticArt.resolve(u,'r',null);
      if(!a){issues.push('Missing '+fid+'/'+d.id);continue;}
      const[x,y,w,h]=a.rect;if(x<0||y<0||x+w>a.image.naturalWidth||y+h>a.image.naturalHeight)issues.push('Bounds '+d.id);
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');c.drawImage(a.image,x,y,w,h,0,0,w,h);const p=c.getImageData(0,0,w,h).data;
      let solid=0;for(let i=3;i<p.length;i+=4)if(p[i]>100)solid++;
      if(solid<w*h*.07)issues.push('Empty '+d.id);
    }
    return{count,issues};
  });assert.strictEqual(coverage.count,81);assert.deepStrictEqual(coverage.issues,[]);
  await page.click('#btn-quick');await page.waitForTimeout(1800);await page.evaluate(()=>{SOVL.UI.closeModal();SOVL.UI.settings.music=false;SOVL.UI.settings.sound=false;});
  await page.screenshot({path:path.join(out,'after-table.png')});
  await page.evaluate(()=>{const r=SOVL.UI.renderer;r.zoom=2.5;r.resize();r.panX=0;r.panY=0;r.resize();const pt=r.toScreen(27,34);r.panX+=r.cw/2-pt.x;r.panY+=r.ch*.57-pt.y;});
  await page.waitForTimeout(400);await page.screenshot({path:path.join(out,'after-close.png')});
  const covered=await page.evaluate(()=>{
    const U=SOVL.UI,r=U.renderer,overlaps=[];
    for(const label of r.labelRects)for(const u of U.battle.units.filter(u=>u.placed&&u.side===0)) {
      const pts=SOVL.G.corners({x:u._rx,y:u._ry,a:u._ra,w:u.w,d:u.d}).map(p=>r.toScreen(p.x,p.y));
      const x0=Math.min(...pts.map(p=>p.x)),x1=Math.max(...pts.map(p=>p.x)),y0=Math.min(...pts.map(p=>p.y)),y1=Math.max(...pts.map(p=>p.y));
      if(label.x<x1&&label.x+label.w>x0&&label.y<y1&&label.y+label.h>y0)overlaps.push([label.uid,u.uid]);
    }return overlaps;
  });assert.deepStrictEqual(covered,[],'unit labels must not cover formations');
  const ids=await page.evaluate(()=>Object.keys(SOVL.FACTION_DATA));
  for(const fid of ids){
    await page.evaluate(fid=>{
      document.getElementById('art-review')?.remove();const box=document.createElement('div');box.id='art-review';box.style='position:fixed;inset:0;z-index:999999;background:#141c23;color:#e7e5d9;padding:24px;font-family:Arial;overflow:auto;';
      const f=SOVL.FACTION_DATA[fid];box.innerHTML='<h2 style="margin:0 0 18px">'+f.name+' · all unit definitions</h2><div id="art-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px"></div>';document.body.appendChild(box);
      for(const sec of f.sections)for(const d of sec.units){const card=document.createElement('div');card.style='height:190px;background:#242e30;border:1px solid #52605e;border-radius:6px;position:relative;text-align:center';const cv=document.createElement('canvas');cv.width=260;cv.height=155;const g=cv.getContext('2d');
        const u=SOVL.Thumbs.fromDef(fid,d.id),a=SOVL.RealisticArt.resolve(u,'r',null),[x,y,w,h]=a.rect,k=Math.min(150/w,138/h);
        g.save();g.translate(95,78);g.rotate(a.rotation||0);g.drawImage(a.image,x,y,w,h,-w*k/2,-h*k/2,w*k,h*k);g.restore();
        // Second sample is the actual table-fit size (the full sprite fits in 20px).
        const tiny=20/Math.max(w,h);g.save();g.translate(214,75);g.rotate(a.rotation||0);g.drawImage(a.image,x,y,w,h,-w*tiny/2,-h*tiny/2,w*tiny,h*tiny);g.restore();g.fillStyle='#abb7bb';g.font='11px Arial';g.fillText('20px',201,109);
        cv.style='display:block;margin:0 auto';card.append(cv);card.append(document.createTextNode(d.name));document.getElementById('art-grid').append(card);
      }
    },fid);
    await page.screenshot({path:path.join(out,'roster-'+fid+'.png')});
  }
  await page.evaluate(()=>document.getElementById('art-review').remove());
  for(const fid of ids) {
    await page.evaluate(fid=>{
      document.getElementById('art-review')?.remove();
      const samples={empires_of_men:['imperial_sword','imperial_spear','imperial_knights','imperial_dragon'],dwarf_holds:['dwarf_warriors','dwarf_crossbows','dwarf_berserkers','dwarf_cannon'],elven_conclaves:['elf_spears','elf_archers','dragon_knights','ancient_dragon'],greenskin_tribes:['orc_warriors','goblin_spear_mob','boar_riders','trolls'],dead_nations:['skeleton_warriors','skeleton_bowmen','skeleton_knights','bone_dragon']};
      const entries=samples[fid].map(id=>SOVL.Army.defaultEntry(fid,id,SOVL.findUnitDef(fid,id).size[0]));
      const b=new SOVL.Battle({armies:[{faction:fid,entries},{faction:fid,entries:[]}],terrain:[]});b.phase='strategic';
      const box=document.createElement('div');box.id='art-review';box.style='position:fixed;inset:0;z-index:999999;background:#141c23;color:#e7e5d9;padding:16px;font-family:Arial;overflow:auto';box.innerHTML='<h2 style="margin:0 0 8px">'+SOVL.FACTION_DATA[fid].name+' · actual formation renderer · north / east / south / west</h2><div id="art-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px"></div>';document.body.appendChild(box);
      for(const u of b.units)for(let dir=0;dir<4;dir++) {
        const card=document.createElement('div');card.style='text-align:center;background:#293531;border:1px solid #647265';const cv=document.createElement('canvas');cv.width=370;cv.height=197;const r=new SOVL.Renderer(cv);r.scale=25;r.dpr=1;
        const c=r.ctx;c.drawImage(SOVL.BiomeArt.texture('borderlands'),0,0,370,197);c.fillStyle='rgba(30,38,34,.45)';c.fillRect(0,0,370,197);c.translate(185,98);c.scale(25,25);
        u.x=u._rx=0;u.y=u._ry=0;u.a=u._ra=-Math.PI/2+dir*Math.PI/2;u.placed=true;u._comp=null;
        r.drawUnit(u,b,{playerSide:0},0);card.append(cv);card.append(document.createTextNode(u.name));document.getElementById('art-grid').append(card);
      }
    },fid);
    await page.screenshot({path:path.join(out,'formation-'+fid+'.png')});
  }
  await page.evaluate(()=>document.getElementById('art-review').remove());
  // Exercise real renderer with different environments and stable obstacle placement.
  const maps=await page.evaluate(()=>Object.keys(SOVL.Biomes.defs));
  for(const id of maps){
    await page.evaluate(id=>{
      const U=SOVL.UI,b=U.battle,r=U.renderer;b.biome=id;b.terrain=SOVL.Biomes.terrain({id,seed:77},'pitched');r.zoom=1;r.panX=r.panY=0;
    },id);await page.waitForTimeout(1500);
    await page.screenshot({path:path.join(out,'map-'+id+'.png')});
  }
  const checks=await page.evaluate(()=>{
    const t=SOVL.UI.battle.terrain,before=JSON.stringify(t),a=SOVL.BiomeArt.texture('ashlands',t),again=SOVL.BiomeArt.texture('ashlands',t);
    return{same:a===again,unchanged:before===JSON.stringify(t),width:a.width,height:a.height};
  });assert(checks.same&&checks.unchanged);assert(checks.width>=1600);
  // The renderer must also work on small screens without horizontal overflow.
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await page.screenshot({path:path.join(out,'mobile.png')});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert(!overflow,'mobile overflow');
  assert.deepStrictEqual(errors,[]);assert.deepStrictEqual(failed,[]);
  console.log('PASS: 81 unit definitions, nonempty transparent sprites, cached high-resolution ground, six biome screenshots, desktop/zoom/mobile, no page or asset errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
