// Ground relief is decorative; collision and movement use the authored terrain pieces.
'use strict';
(function () {
  var P=SOVL.Renderer.prototype, original=P.draw, ground=P.groundImage, cache={};
  function texture(id) {
    if(cache[id]) return cache[id];
    var cv=document.createElement('canvas');cv.width=1200;cv.height=800;
    var c=cv.getContext('2d'), img=c.createImageData(cv.width,cv.height), d=img.data;
    var col=SOVL.Biomes.defs[id].palette, rnd=SOVL.R.makeRng(id.length*113+col[0]);
    // Multi-scale continuous relief, with fine mineral/grass grain and windblown ridges.
    var grids=[[] ,[], []], sizes=[12,36,120];
    sizes.forEach(function(n,k){for(var j=0;j<(n+1)*(n+1);j++)grids[k][j]=rnd();});
    function noise(x,y,k){var n=sizes[k],xx=x/1200*n,yy=y/800*n,ix=Math.floor(xx),iy=Math.floor(yy),u=xx-ix,v=yy-iy;u=u*u*(3-2*u);v=v*v*(3-2*v);var q=grids[k],a=q[iy*(n+1)+ix],b=q[iy*(n+1)+ix+1],e=q[(iy+1)*(n+1)+ix],f=q[(iy+1)*(n+1)+ix+1];return a*(1-u)*(1-v)+b*u*(1-v)+e*(1-u)*v+f*u*v;}
    for(var y=0;y<800;y++)for(var x=0;x<1200;x++){
      var n=noise(x,y,0),m=noise(x,y,1),fine=noise(x,y,2),k=.78+n*.28+m*.16+(rnd()-.5)*.12;
      if(id==='desert'||id==='oasis')k+=Math.sin(y*.1+Math.sin(x*.009)*4+n*9)*.024;
      if(id==='badlands'||id==='ashlands')k+=(fine-.5)*.19;
      var i=(y*1200+x)*4;d[i]=col[0]*k;d[i+1]=col[1]*k;d[i+2]=col[2]*k;d[i+3]=255;
    }
    c.putImageData(img,0,0);
    if(id==='plains')for(var j=0;j<18000;j++){var x=rnd()*1200,y=rnd()*800;c.strokeStyle=j%2?'rgba(229,203,119,.16)':'rgba(65,66,37,.18)';c.lineWidth=.7;c.beginPath();c.moveTo(x,y);c.lineTo(x+1.5,y-2-rnd()*3);c.stroke();}
    cache[id]=cv;return cv;
  }
  P.draw=function(battle){var id=battle&&battle.biome||'borderlands';this.groundImage=id==='borderlands'?ground:texture(id);return original.apply(this,arguments);};
  SOVL.BiomeArt={texture:texture};
})();
