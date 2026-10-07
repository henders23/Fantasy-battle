// High-resolution ground dressing. All collision and movement still use battle.terrain.
'use strict';
(function () {
  var P=SOVL.Renderer.prototype, original=P.draw, cache={}, order=[], revision=0;
  var ids=['borderlands','plains','desert','oasis','badlands','ashlands'];
  var atlas=new Image();
  atlas.onload=function(){revision++;cache={};order=[];};
  atlas.src='assets/ground/biomes.webp';
  var W=1800,H=1200;
  function hashString(str) {var n=2166136261;for(var i=0;i<str.length;i++)n=Math.imul(n^str.charCodeAt(i),16777619);return n>>>0;}
  function line(c,x,y,dx,dy,col,width) {c.strokeStyle=col;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x+dx,y+dy);c.stroke();}
  function texture(id,terrain) {
    if(!SOVL.Biomes.defs[id])id='borderlands';
    terrain=terrain||[];
    var signature=terrain.map(function(t){return[t.kind,t.seed,t.x,t.y,t.w,t.h].join(',');}).join(';');
    var key=id+'|'+revision+'|'+signature;if(cache[key])return cache[key];
    var cv=document.createElement('canvas');cv.width=W;cv.height=H;
    var c=cv.getContext('2d'), col=SOVL.Biomes.defs[id].palette, rnd=SOVL.R.makeRng(hashString(id+signature));
    c.fillStyle='rgb('+col.join(',')+')';c.fillRect(0,0,W,H);
    if(atlas.complete&&atlas.naturalWidth) {
      var slot=ids.indexOf(id),sw=atlas.naturalWidth/3,sh=atlas.naturalHeight/2;
      c.imageSmoothingQuality='high';
      // Overlapping, feathered texture patches preserve miniature scale without
      // visible tile seams or the repeated diamonds of mirrored textures.
      var tile=420,patch=document.createElement('canvas');patch.width=patch.height=tile;
      var pc=patch.getContext('2d'),mask=pc.createRadialGradient(tile/2,tile/2,tile*.24,tile/2,tile/2,tile*.50);
      mask.addColorStop(0,'rgba(0,0,0,1)');mask.addColorStop(1,'rgba(0,0,0,0)');
      for(var row=-1;row<=Math.ceil(H/190);row++)for(var column=-1;column<=Math.ceil(W/190);column++) {
        pc.clearRect(0,0,tile,tile);pc.save();pc.translate(tile/2,tile/2);
        pc.rotate(id==='desert'?(rnd()-.5)*.25:rnd()*Math.PI*2);
        var size=tile*(1.15+rnd()*.22);
        pc.drawImage(atlas,(slot%3)*sw,Math.floor(slot/3)*sh,sw,sh,-size/2,-size/2,size,size);pc.restore();
        pc.globalCompositeOperation='destination-in';pc.fillStyle=mask;pc.fillRect(0,0,tile,tile);pc.globalCompositeOperation='source-over';
        c.drawImage(patch,column*190+(rnd()-.5)*80-tile/2,row*190+(rnd()-.5)*80-tile/2);
      }
      // Keep ground quieter than metal, bone and faction cloth at table-fit zoom.
      c.fillStyle='rgba('+col.join(',')+',.32)';c.fillRect(0,0,W,H);
    }
    var green=id==='borderlands'||id==='plains'||id==='oasis', sand=id==='desert'||id==='oasis', ash=id==='ashlands';
    // Broad soil patches give a coherent material surface even if the atlas fails to load.
    for(var p=0;p<160;p++) {
      var px=rnd()*W,py=rnd()*H,rad=25+rnd()*110,g=c.createRadialGradient(px,py,0,px,py,rad);
      g.addColorStop(0,green?'rgba(49,58,26,.09)':ash?'rgba(186,178,169,.07)':'rgba(109,76,46,.08)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(px-rad,py-rad,rad*2,rad*2);
    }
    // Faint old wheel ruts and a worn centre. These are cosmetic, not roads in the rules.
    var phase=rnd()*6.28,offset=(rnd()-.5)*180;
    function road(y){return W*.50+offset+Math.sin(y/H*5+phase)*85+Math.sin(y/H*11+phase)*18;}
    c.lineCap='round';
    for(var pass=0;pass<3;pass++) {
      c.strokeStyle=ash?'rgba(48,45,44,.10)':sand?'rgba(131,102,68,.10)':'rgba(139,118,76,.10)';c.lineWidth=pass===0?48:2.4;
      c.beginPath();for(var y=-5;y<=H+5;y+=8){var xx=road(y)+(pass===1?-12:pass===2?12:0);if(y===-5)c.moveTo(xx,y);else c.lineTo(xx,y);}c.stroke();
    }
    // Fine geometry stays sharp at inspection zoom: blades, scattered grit, leaf litter.
    for(var j=0;j<26000;j++) {
      var x=rnd()*W,y=rnd()*H,t=rnd(),v=rnd(),nearRoad=Math.abs(x-road(y))<28;
      if(green && !nearRoad && t<.60) {
        var h=1.6+rnd()*4.2,wind=1+rnd()*1.8;
        line(c,x,y,wind,-h,id==='plains'?'rgba(221,195,116,.24)':'rgba(157,157,80,.23)',.8);
        if(v>.8)line(c,x,y,-wind*.6,-h*.7,'rgba(37,44,24,.27)',.9);
      } else if(t<.87) {
        var r=.45+rnd()*1.5;
        c.fillStyle=ash?'rgba(19,23,28,.25)':'rgba(44,38,29,.23)';c.beginPath();c.ellipse(x+.6,y+.8,r*1.25,r*.6,0,0,6.28);c.fill();
        c.fillStyle=ash?'rgba(182,178,165,.26)':sand?'rgba(233,205,158,.36)':'rgba(198,177,133,.25)';c.fillRect(x,y,r*1.3,r*.65);
      } else if(id==='borderlands') {
        c.save();c.translate(x,y);c.rotate(rnd()*6.28);c.fillStyle=v>.5?'rgba(177,130,52,.31)':'rgba(63,59,27,.29)';c.beginPath();c.ellipse(0,0,1.7,.7,0,0,6.28);c.fill();c.restore();
      }
    }
    if(sand) {
      // Wind combs the sand; fine discontinuous marks avoid suggesting impassable ridges.
      for(var k=0;k<1600;k++) {
        var x=rnd()*W,y=rnd()*H,len=5+rnd()*20;
        line(c,x,y,len,Math.sin(x*.008+y*.004)*2,'rgba(250,219,158,.14)',.8);
      }
    }
    // Each rules obstacle receives a matching, low-contrast transition into the ground.
    terrain.forEach(function(t) {
      var tx=t.x/SOVL.TABLE.w*W,ty=t.y/SOVL.TABLE.h*H,tw=t.w/SOVL.TABLE.w*W,th=t.h/SOVL.TABLE.h*H;
      var leaf=t.kind==='forest'||t.kind==='scrub', water=t.kind==='lake'||t.kind==='swamp';
      for(var i=0;i<320;i++) {
        var edge=Math.floor(rnd()*4),x=tx+rnd()*tw,y=ty+rnd()*th,d=(rnd()-.35)*22;
        if(edge===0)x=tx-d;else if(edge===1)x=tx+tw+d;else if(edge===2)y=ty-d;else y=ty+th+d;
        var r=.6+rnd()*2.2;
        c.fillStyle=leaf?'rgba(80,74,31,.25)':water?'rgba(37,51,42,.16)':ash?'rgba(172,166,153,.21)':'rgba(188,155,105,.24)';
        c.beginPath();c.ellipse(x,y,r*1.4,r*.7,rnd()*3.14,0,6.28);c.fill();
      }
    });
    cache[key]=cv;order.push(key);if(order.length>6)delete cache[order.shift()];return cv;
  }
  P.draw=function(battle){this.groundImage=texture(battle&&battle.biome||'borderlands',battle&&battle.terrain);return original.apply(this,arguments);};
  SOVL.BiomeArt={texture:texture,ready:function(){return atlas.complete&&atlas.naturalWidth>0;}};
})();
