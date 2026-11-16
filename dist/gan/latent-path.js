'use strict';
(function(root){
  const curatedSeeds=[4,5,15,12,21,23,13,16];
  function random(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function normal(rnd,scale=1){return Float32Array.from({length:256},()=>Math.sqrt(-2*Math.log(Math.max(1e-8,rnd())))*Math.cos(2*Math.PI*rnd())*scale);}
  function create(mode,seed=42){
    if(mode==='selected')return curatedSeeds.map(s=>normal(random(s)));
    const rnd=random(mode==='original'?42:seed);
    return Array.from({length:mode==='original'?2:8},()=>normal(rnd,mode==='original'?.8:1));
  }
  function sample(anchors,phase,radius=1){
    const x=((phase%1+1)%1)*anchors.length,i=Math.floor(x),t=x-i,a=anchors[i],b=anchors[(i+1)%anchors.length];
    let dot=0,na=0,nb=0;for(let j=0;j<256;j++){dot+=a[j]*b[j];na+=a[j]*a[j];nb+=b[j]*b[j];}
    const omega=Math.acos(Math.max(-.9999999,Math.min(.9999999,dot/Math.sqrt(na*nb)))),s=Math.sin(omega);
    const wa=Math.abs(s)<1e-6?1-t:Math.sin((1-t)*omega)/s,wb=Math.abs(s)<1e-6?t:Math.sin(t*omega)/s;
    return Float32Array.from(a,(v,j)=>radius*(wa*v+wb*b[j]));
  }
  const api={curatedSeeds,create,sample};if(typeof module==='object')module.exports=api;else root.CloudPath=api;
})(typeof self!=='undefined'?self:globalThis);
