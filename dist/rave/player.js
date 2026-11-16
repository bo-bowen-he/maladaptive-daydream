'use strict';
const $=id=>document.getElementById(id);
const REFERENCE='cycle_030_a100';
let context,master,source,clipGain,buffers={},pendingBuffers={},study,conditions={},waveforms={};
let selected=REFERENCE,playing=false,desiredPlaying=false,offset=0,started=0,duration=30,selectionToken=0;
let wildcardSelected='wildcard_crossing',displayedWildcard;
const status=message=>{$('status').textContent=message;$('wildcard-status').textContent=message;};
const clockText=seconds=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
const descriptions={
 cycle_030_a100:'The first exposed latent coordinate follows a ±1 sinusoid at 0.3 Hz. The other 15 exposed coordinates stay at zero. No recording is fed into the encoder.',
 cycle_020_a100:'The same ±1 movement slowed to 0.2 Hz. Only its rate changes from the reference rhythm.',
 cycle_050_a100:'The same ±1 movement accelerated to 0.5 Hz. Only its rate changes from the reference rhythm.',
 cycle_030_a050:'The first coordinate moves between −0.5 and +0.5 at 0.3 Hz. This visits a smaller region around the same center.',
 cycle_030_a150:'The first coordinate moves between −1.5 and +1.5 at 0.3 Hz. This visits a wider region; it is not just turning up the audio volume.',
 cycle_030_a100_b050:'The first coordinate moves from −0.5 to +1.5 at 0.3 Hz: the same ±1 excursion, shifted around a center of +0.5.',
 cycle_030_z2pos:'Coordinate 1 keeps the original 0.3 Hz, ±1 motion. Coordinate 2 is held at +0.5; the remaining 14 stay at zero. This is an additional control beyond the reference setup.',
 cycle_030_z2neg:'Coordinate 1 keeps the original 0.3 Hz, ±1 motion. Coordinate 2 is held at −0.5; the remaining 14 stay at zero. Compare its texture and level with the reference.',
 static_zero:'All 16 exposed coordinates are held at zero. The exported decoder still includes internal random components, so a fixed coordinate does not mean silence.',
 source:'A 24-second excerpt from the cleaned sleep recording. This and the reconstruction share a playback gain, separate from the oscillator study.',
 reconstruction:'The same recording passes through encode → decode. Energy-envelope alignment keeps the comparison close in time; it is not phase-matched.'
};
const extra={source:{id:'source',label:'Cleaned source',duration_seconds:24},reconstruction:{id:'reconstruction',label:'Reconstruction',duration_seconds:24}};
const dataReady=Promise.all([
 fetch('assets/cycle-study.json').then(r=>{if(!r.ok)throw new Error('Experiment data could not load.');return r.json();}),
 fetch('assets/waveforms.json').then(r=>r.ok?r.json():{}),
 fetch('assets/wildcards.json').then(r=>{if(!r.ok)throw new Error('Multi-coordinate experiments could not load.');return r.json();})
]).then(([data,old,wildcards])=>{study=data;conditions=Object.fromEntries([...data.conditions,...wildcards.conditions].map(c=>[c.id,c]));Object.assign(conditions,extra);waveforms={...old,...data.waveforms,...wildcards.waveforms};updateWildcard();updateLabels();return true;}).catch(error=>{status(error.message);return false;});

function ensureContext(){
 if(context)return;
 const AudioCtx=window.AudioContext||window.webkitAudioContext;
 if(!AudioCtx)throw new Error('This browser does not support Web Audio. Try a current desktop browser.');
 context=new AudioCtx();master=context.createGain();master.gain.value=Number($('volume').value);master.connect(context.destination);
}
async function loadBuffer(id){
 if(buffers[id])return buffers[id];
 if(!pendingBuffers[id])pendingBuffers[id]=(async()=>{
  const response=await fetch('assets/'+id+'.wav');
  if(!response.ok)throw new Error('Audio could not load ('+response.status+'). Try again.');
  const buffer=await context.decodeAudioData(await response.arrayBuffer());buffers[id]=buffer;delete pendingBuffers[id];return buffer;
 })().catch(error=>{delete pendingBuffers[id];throw error;});
 return pendingBuffers[id];
}
function position(){return playing?Math.max(0,Math.min(duration,offset+context.currentTime-started)):offset;}
function stopNode(){if(source){try{source.stop();}catch{}source.disconnect();source=null;}if(clipGain){clipGain.disconnect();clipGain=null;}}
function syncTransport(){
 $('play').textContent=playing?'Pause audio':desiredPlaying?'Cancel loading':selected===REFERENCE?'Play reference rhythm':'Play audio';
 const active=selected===wildcardSelected;
 $('wildcard-play').textContent=active&&playing?'Pause audio':active&&desiredPlaying?'Cancel loading':'Play '+(conditions[wildcardSelected]?.label||'crossing cycles').toLowerCase();
}
function pause(preserveIntent=false){if(playing)offset=position();playing=false;if(!preserveIntent)desiredPlaying=false;stopNode();syncTransport();}
function start(){
 if(offset>=duration-.02)offset=0;
 stopNode();source=context.createBufferSource();source.buffer=buffers[selected];clipGain=context.createGain();clipGain.gain.value=0;source.connect(clipGain);clipGain.connect(master);
 const when=context.currentTime+.025;source.start(when,offset);clipGain.gain.setTargetAtTime(1,when,.015);started=when;playing=true;desiredPlaying=true;syncTransport();status('Playing '+conditions[selected].label.toLowerCase()+' · '+(selected==='source'||selected==='reconstruction'?'recorded dataset comparison.':'actual recorded model output.'));
}
function updateLabels(){
 const c=conditions[selected];if(!c)return;
 duration=c.duration_seconds;$('seek').max=duration;
 document.querySelectorAll('[data-preset]').forEach(button=>{const active=button.dataset.preset===selected;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
 $('track-label').textContent=c.label;$('description').textContent=descriptions[selected]||c.summary+' '+c.listen_for;
 if(c.kind==='wildcard'){
  wildcardSelected=selected;updateWildcard();
  $('parameters').textContent=c.controls.length+' moving coordinates · exact settings below';$('patch').style.display='none';$('mode-label').textContent='RENDERED MODEL OUTPUT · NO AUDIO INPUT';$('control-label').textContent='INPUT / '+c.controls.length+' MOVING COORDINATES';
  $('control').setAttribute('aria-label','Input curves for '+c.label+'. Individual curves and exact settings are shown below.');
  $('measurement').textContent='These three multi-coordinate examples share one playback gain, separate from the earlier experiments.';
 }else if(c.rate_hz!==undefined){
  const extraCoordinate=c.coordinate_2_bias!==undefined?' · coordinate 2 '+(c.coordinate_2_bias>0?'+':'')+c.coordinate_2_bias:' · other exposed coordinates 0';
  $('parameters').textContent='Rate '+c.rate_hz+' Hz · amplitude '+c.amplitude+' · center '+c.bias+extraCoordinate;
  $('patch').style.display='flex';$('mode-label').textContent='RENDERED MODEL OUTPUT · NO AUDIO INPUT';
  $('patch-cycle').textContent=c.rate_hz?'cycle~ '+c.rate_hz:'sig~ 0';$('control-label').textContent='INPUT / FIRST LATENT COORDINATE';
  $('control').setAttribute('aria-label','First coordinate control curve with current playback position');
  $('patch').setAttribute('aria-label','First coordinate: rate '+c.rate_hz+' hertz, amplitude '+c.amplitude+', center '+c.bias+'. RAVE decode, then gain to both speakers.');
  $('measurement').textContent=c.rate_hz?'Measured strongest slow output modulation: '+c.energy_envelope_dominant_hz_0p06_to_2+' Hz. This first set of experiments shares one playback gain.':'Control condition: no coordinate movement. This first set of experiments shares one playback gain.';
 }else{
  $('parameters').textContent='24-second recording comparison · shared pair gain';$('patch').style.display='none';$('mode-label').textContent='RECORDED DATASET COMPARISON';$('control-label').textContent='DATASET / ENCODE → DECODE COMPARISON';$('measurement').textContent='Source and reconstruction are energy-aligned. Their playback gain is separate from the oscillator experiments.';
  $('control').setAttribute('aria-label',selected==='source'?'Cleaned source audio, with no model processing':'Source audio passes through the encoder and decoder');
 }
 syncTransport();
}
async function choose(id,requestedOffset){
 if(id===selected&&requestedOffset===undefined)return true;
 const token=++selectionToken,wanted=desiredPlaying,previousPosition=position();pause(true);
 try{
  if(!await dataReady)throw new Error('Experiment data is unavailable. Refresh and try again.');if(!conditions[id])throw new Error('Unknown experiment.');
  if(token!==selectionToken)return false;
  selected=id;duration=conditions[id].duration_seconds;offset=requestedOffset===undefined?(previousPosition>=duration-.05?0:previousPosition):Math.min(duration,Math.max(0,requestedOffset));updateLabels();
  if(wanted){status('Loading '+conditions[id].label.toLowerCase()+'…');await loadBuffer(id);if(token!==selectionToken||!desiredPlaying)return false;start();}
  else status('Selected '+conditions[id].label.toLowerCase()+'. Press Play to listen.');
  return true;
 }catch(error){if(token===selectionToken){desiredPlaying=false;syncTransport();status(error.message);}return false;}
}
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.preset)));
document.querySelectorAll('[data-wildcard]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.wildcard)));
$('reset-patch').addEventListener('click',()=>choose(REFERENCE));
async function togglePlayback(id){
 if(id===selected&&(playing||desiredPlaying)){++selectionToken;pause();status('Paused.');return;}
 const token=++selectionToken,previousPosition=position();pause();desiredPlaying=true;syncTransport();
 try{
  ensureContext();await context.resume();if(!await dataReady)throw new Error('Experiment data is unavailable. Refresh and try again.');if(token!==selectionToken)return;
  if(!conditions[id])throw new Error('Unknown experiment.');
  selected=id;duration=conditions[id].duration_seconds;offset=previousPosition>=duration-.05?0:previousPosition;updateLabels();status('Loading '+conditions[id].label.toLowerCase()+'…');
  await loadBuffer(id);if(token===selectionToken&&id===selected&&desiredPlaying)start();
 }catch(error){if(token===selectionToken){desiredPlaying=false;status(error.message||'Unable to start audio.');}}
 finally{syncTransport();}
}
$('play').addEventListener('click',()=>togglePlayback(selected));
$('wildcard-play').addEventListener('click',()=>togglePlayback(wildcardSelected));
$('restart').addEventListener('click',()=>choose(selected,0));
$('wildcard-restart').addEventListener('click',()=>choose(wildcardSelected,0));
$('seek').addEventListener('input',()=>choose(selected,Number($('seek').value)));
$('wildcard-seek').addEventListener('input',()=>choose(wildcardSelected,Number($('wildcard-seek').value)));
for(const id of ['volume','wildcard-volume'])$(id).addEventListener('input',()=>{
 const value=Number($(id).value);$('volume').value=value;$('wildcard-volume').value=value;
 if(master)master.gain.setTargetAtTime(value,context.currentTime,.02);
});
for(const id of ['loop','wildcard-loop'])$(id).addEventListener('change',()=>{
 const value=$(id).checked;$('loop').checked=value;$('wildcard-loop').checked=value;
});

const number=value=>String(Math.round(value*10000)/10000).replace('-', '−');
const coordinateColor=coordinate=>['#7ad1c9','#d8bc86','#b7abe3','#91bddc','#dfadbb'][coordinate%5];
function controlAt(c,t){
 if(c.shape==='steps'){
  const step=t*c.steps_per_second,index=Math.floor(step),n=c.values.length;
  const u=Math.min(1,Math.max(0,(step-index)/(c.steps_per_second*c.transition_seconds))),blend=.5-.5*Math.cos(Math.PI*u);
  return c.values[((index-1)%n+n)%n]*(1-blend)+c.values[((index)%n+n)%n]*blend;
 }
 const phase=c.rate_hz*t+c.phase_degrees/360;
 const wave=c.shape==='cosine'?Math.cos(2*Math.PI*phase):1-4*Math.abs(((phase+.5)%1+1)%1-.5);
 return c.center+c.amplitude*wave;
}
function updateWildcard(){
 const c=conditions[wildcardSelected];if(!c)return;
 document.querySelectorAll('[data-wildcard]').forEach(button=>{const active=button.dataset.wildcard===wildcardSelected;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
 $('wildcard-count').textContent=c.controls.length+' MOVING COORDINATES';$('wildcard-title').textContent=c.label;$('wildcard-summary').textContent=c.summary;$('wildcard-listen').textContent=c.listen_for;$('wildcard-pattern').textContent=c.pattern_note;
 if(displayedWildcard===wildcardSelected)return;displayedWildcard=wildcardSelected;
 const grid=$('coordinate-grid');grid.replaceChildren();
 for(let i=1;i<=16;i++){
  const control=c.controls.find(item=>item.coordinate===i),card=document.createElement('div');
  card.className='coordinate-card'+(control?' active':'');card.style.setProperty('--coordinate-color',coordinateColor(i));
  const head=document.createElement('div');head.className='coordinate-head';
  const label=document.createElement('span');label.textContent='CONTROL '+String(i).padStart(2,'0');head.append(label);
  const state=document.createElement('span');state.textContent=control?'MOVING':'HELD';head.append(state);card.append(head);
  const title=document.createElement('h4');title.textContent=!control?'Held at zero':control.shape==='steps'?'Eight-step sequence':control.shape==='triangle'?'Triangle ramp':'Cosine cycle';card.append(title);
  const canvas=document.createElement('canvas');canvas.dataset.coordinate=i;canvas.setAttribute('aria-label','Input signal for coordinate '+i);card.append(canvas);
  const settings=document.createElement('p');settings.className='coordinate-settings';
  const line=document.createElement('span'),detail=document.createElement('span');
  if(!control){line.textContent='Constant 0';detail.textContent='No movement';}
  else if(control.shape==='steps'){
   line.textContent=number(control.steps_per_second)+' steps/s · '+Math.round(control.transition_seconds*1000)+' ms glide';
   detail.textContent=control.values.map(number).join(', ');detail.className='step-values';
  }else{
   line.textContent=number(control.rate_hz)+' Hz · range '+number(control.center-control.amplitude)+' to '+number(control.center+control.amplitude);
   detail.textContent='Center '+number(control.center)+' · phase '+control.phase_degrees+'°';
  }
  settings.append(line,detail);card.append(settings);grid.append(card);
 }
}

function setupCanvas(id){
 const canvas=typeof id==='string'?$(id):id,width=canvas.clientWidth,height=canvas.clientHeight,dpr=window.devicePixelRatio||1;
 if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);return{ctx,width,height};
}
function drawWaveform(id,track,p,seconds){
 const{ctx,width,height}=setupCanvas(id),values=waveforms[track]||[],maximum=Math.max(...values,.0001);
 ctx.strokeStyle='#344a55';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,height/2);ctx.lineTo(width,height/2);ctx.stroke();
 values.forEach((value,i)=>{const x=i/(values.length-1)*width,extent=Math.max(1,value/maximum*height*.43);ctx.strokeStyle=x<=p/seconds*width?'#7ad1c9':'#566c77';ctx.beginPath();ctx.moveTo(x,height/2-extent);ctx.lineTo(x,height/2+extent);ctx.stroke();});
 ctx.strokeStyle='#f6f8f5';ctx.beginPath();ctx.moveTo(p/seconds*width,0);ctx.lineTo(p/seconds*width,height);ctx.stroke();
}
function drawControl(ctx,width,height,c,p,seconds){
 const range=c.shape==='steps'?Math.max(...c.values.map(Math.abs),1):Math.max(1,Math.abs(c.center)+c.amplitude),scale=height*.4/range;
 ctx.strokeStyle=coordinateColor(c.coordinate);ctx.lineWidth=1.4;ctx.beginPath();
 for(let x=0;x<=width;x++){const y=height/2-controlAt(c,x/width*seconds)*scale;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
 ctx.fillStyle='#f6f8f5';ctx.beginPath();ctx.arc(p/seconds*width,height/2-controlAt(c,p)*scale,2.5,0,Math.PI*2);ctx.fill();
}
function draw(){
 const p=position(),c=conditions[selected];
 {const{ctx,width,height}=setupCanvas('control');
  ctx.strokeStyle='#344a55';ctx.beginPath();ctx.moveTo(0,height/2);ctx.lineTo(width,height/2);ctx.stroke();
  if(c?.kind==='wildcard'){
   c.controls.forEach(control=>drawControl(ctx,width,height,control,p,duration));
  }else if(c&&c.rate_hz!==undefined){
   const maxValue=Math.max(1,Math.abs(c.bias)+c.amplitude),scale=height*.43/maxValue;
   ctx.strokeStyle='#7ad1c9';ctx.lineWidth=1.8;ctx.beginPath();
   for(let x=0;x<=width;x++){const t=x/width*duration,y=height/2-(c.bias+c.amplitude*Math.cos(2*Math.PI*c.rate_hz*t))*scale;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
   const x=p/duration*width,y=height/2-(c.bias+c.amplitude*Math.cos(2*Math.PI*c.rate_hz*p))*scale;ctx.fillStyle='#f6f8f5';ctx.beginPath();ctx.arc(x,y,4,0,2*Math.PI);ctx.fill();
  }else{ctx.fillStyle='#a6bac2';ctx.font='13px system-ui';ctx.fillText(selected==='source'?'Cleaned source audio, with no model processing.':'Source audio → encoder → decoder.',10,height/2-12);}
 }
 drawWaveform('waveform',selected,p,duration);
 const wildPosition=selected===wildcardSelected?p:0,wild=conditions[wildcardSelected];
 drawWaveform('wildcard-waveform',wildcardSelected,wildPosition,30);
 $('wildcard-clock').textContent=clockText(wildPosition)+' / 0:30';$('wildcard-seek').value=wildPosition;$('wildcard-seek').setAttribute('aria-valuetext',wildPosition.toFixed(1)+' seconds');
 if(wild)for(const canvas of $('coordinate-grid').querySelectorAll('canvas')){
  const control=wild.controls.find(item=>item.coordinate===Number(canvas.dataset.coordinate)),{ctx,width,height}=setupCanvas(canvas);
  ctx.strokeStyle='#344a55';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,height/2);ctx.lineTo(width,height/2);ctx.stroke();
  if(control)drawControl(ctx,width,height,control,wildPosition,30);
 }
 $('clock').textContent=clockText(p)+' / '+clockText(duration);$('seek').value=p;$('seek').setAttribute('aria-valuetext',p.toFixed(1)+' seconds');
 if(playing&&p>=duration-.015){pause();if($('loop').checked){offset=0;start();}else{offset=duration;status('Finished. Choose another experiment or replay.');}}
 requestAnimationFrame(draw);
}
draw();
