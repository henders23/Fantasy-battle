// Production preparation only: separate alpha islands, trim and pack, without painting
// or synthesising pixels. Usage: node tools/pack-unit-atlas.cjs source.png faction
// Requires sharp. The generated illustration must contain a 5 x 4 sprite layout.
'use strict';
const fs = require('fs'), path = require('path'), sharp = require('sharp');
async function pack(source, name) {
  const {data, info} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const W=info.width,H=info.height,N=W*H, seen=new Uint8Array(N), labels=new Int32Array(N), islands=[];
  const queue=new Int32Array(N);
  for(let start=0;start<N;start++) {
    if(seen[start] || data[start*4+3]<8) continue;
    let head=0,tail=1, x0=W,y0=H,x1=0,y1=0,sx=0,sy=0;
    queue[0]=start;seen[start]=1;const id=islands.length+1;
    while(head<tail) {
      const p=queue[head++],x=p%W,y=Math.floor(p/W);labels[p]=id;
      x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);sx+=x;sy+=y;
      for(const q of [x? p-1:-1,x<W-1?p+1:-1,y?p-W:-1,y<H-1?p+W:-1]) {
        if(q<0||seen[q]||data[q*4+3]<8)continue;seen[q]=1;queue[tail++]=q;
      }
    }
    islands.push({id,x0,y0,x1,y1,n:tail,cx:sx/tail,cy:sy/tail});
  }
  const major=islands.filter(x=>x.n>600).sort((a,b)=>b.n-a.n);
  const groups=Array.from({length:20},()=>[]), owner=new Int16Array(islands.length+1).fill(-1);
  for(const a of major) {
    const col=Math.min(4,Math.floor(a.cx/W*5)),row=Math.min(3,Math.floor(a.cy/H*4));
    const cell=row*5+col;groups[cell].push(a);owner[a.id]=cell;
  }
  for(const a of islands.filter(x=>x.n<=600)) {
    if(a.n<4)continue;
    let nearest=null,best=Infinity;
    for(const b of major) {const dx=Math.max(b.x0-a.x1,a.x0-b.x1,0),dy=Math.max(b.y0-a.y1,a.y0-b.y1,0),dist=dx*dx+dy*dy;if(dist<best){best=dist;nearest=b;}}
    if(nearest&&best<1600){const cell=owner[nearest.id];groups[cell].push(a);owner[a.id]=cell;}
  }
  const composite=[],rects=[],audit=[];
  for(let cell=0;cell<20;cell++) {
    const g=groups[cell];if(!g.length)throw Error('Empty cell '+cell+' in '+name);
    const x0=Math.min(...g.map(a=>a.x0)),y0=Math.min(...g.map(a=>a.y0)),x1=Math.max(...g.map(a=>a.x1)),y1=Math.max(...g.map(a=>a.y1));
    const w=x1-x0+1,h=y1-y0+1,raw=Buffer.alloc(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {const p=(y+y0)*W+x+x0;if(owner[labels[p]]===cell)data.copy(raw,(y*w+x)*4,p*4,p*4+4);}
    const k=Math.min(280/w,280/h),sw=Math.round(w*k),sh=Math.round(h*k),left=(cell%5)*320+Math.round((320-sw)/2),top=Math.floor(cell/5)*320+Math.round((320-sh)/2);
    const input=await sharp(raw,{raw:{width:w,height:h,channels:4}}).resize(sw,sh).png().toBuffer();
    composite.push({input,left,top});rects.push([left,top,sw,sh]);audit.push({cell,source:[x0,y0,w,h],pixels:g.reduce((n,a)=>n+a.n,0)});
  }
  const dir=path.resolve(__dirname,'../assets/units');
  await sharp({create:{width:1600,height:1280,channels:4,background:'#00000000'}}).composite(composite).webp({quality:94,alphaQuality:100,effort:6}).toFile(path.join(dir,name+'.webp'));
  fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(rects)+'\n');
  const manifestFile=path.resolve(__dirname,'../js/realistic-art.js'),src=fs.readFileSync(manifestFile,'utf8');
  const begin=src.indexOf('  var manifest = '),end=src.indexOf('\n  var images='),prefix='  var manifest = ';
  const manifest=JSON.parse(src.slice(begin+prefix.length,end).trim().replace(/;$/,''));
  for(const faction of Object.values(manifest)) {
    const file=faction.file.split('?')[0];
    faction.rects=JSON.parse(fs.readFileSync(path.resolve(__dirname,'..',file.replace('.webp','.json'))));
    faction.file=file+'?v=overhead2';
  }
  const json=JSON.stringify(manifest,null,2).replace(/\[\n +(\d+),\n +(\d+),\n +(\d+),\n +(\d+)\n +\]/g,'[$1, $2, $3, $4]');
  fs.writeFileSync(manifestFile,src.slice(0,begin)+prefix+json+';'+src.slice(end));
  console.log(JSON.stringify({name,sourceSize:[W,H],audit}));return rects;
}
if(require.main===module)pack(process.argv[2],process.argv[3]).catch(e=>{console.error(e);process.exit(1);});
module.exports=pack;
