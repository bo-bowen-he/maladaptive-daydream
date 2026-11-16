'use strict';
const $=id=>document.getElementById(id);
const REFERENCE='cycle_030_a100';
let context,master,source,clipGain,buffers={},pendingBuffers={},study,conditions={},waveforms={};
let selected=REFERENCE,playing=false,desiredPlaying=false,offset=0,started=0,duration=30,selectionToken=0;
const status=message=>{$('status').textContent=message;};
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
 fetch('assets/waveforms.json').then(r=>r.ok?r.json():{})
]).then(([data,old])=>{study=data;conditions=Object.fromEntries(data.conditions.map(c=>[c.id,c]));Object.assign(conditions,extra);waveforms={...old,...data.waveforms};updateLabels();return true;}).catch(error=>{status(error.message);return false;});

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
function pause(preserveIntent=false){if(playing)offset=position();playing=false;if(!preserveIntent)desiredPlaying=false;stopNode();$('play').textContent='Play audio';}
function start(){
 if(offset>=duration-.02)offset=0;
 stopNode();source=context.createBufferSource();source.buffer=buffers[selected];clipGain=context.createGain();clipGain.gain.value=0;source.connect(clipGain);clipGain.connect(master);
 const when=context.currentTime+.025;source.start(when,offset);clipGain.gain.setTargetAtTime(1,when,.015);started=when;playing=true;desiredPlaying=true;$('play').textContent='Pause audio';status('Playing '+conditions[selected].label.toLowerCase()+' · '+(conditions[selected].rate_hz===undefined?'recorded dataset comparison.':'actual recorded model output.'));
}
function updateLabels(){
 const c=conditions[selected];if(!c)return;
 duration=c.duration_seconds;$('seek').max=duration;
 document.querySelectorAll('[data-preset]').forEach(button=>{const active=button.dataset.preset===selected;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
 $('track-label').textContent=c.label;$('description').textContent=descriptions[selected];
 if(c.rate_hz!==undefined){
  const extraCoordinate=c.coordinate_2_bias!==undefined?' · coordinate 2 '+(c.coordinate_2_bias>0?'+':'')+c.coordinate_2_bias:' · other exposed coordinates 0';
  $('parameters').textContent='Rate '+c.rate_hz+' Hz · amplitude '+c.amplitude+' · center '+c.bias+extraCoordinate;
  $('patch').style.display='flex';$('mode-label').textContent='RENDERED MODEL OUTPUT · NO AUDIO INPUT';
  $('patch-cycle').textContent=c.rate_hz?'cycle~ '+c.rate_hz:'sig~ 0';$('control-label').textContent='INPUT / FIRST LATENT COORDINATE';
  $('patch').setAttribute('aria-label','First coordinate: rate '+c.rate_hz+' hertz, amplitude '+c.amplitude+', center '+c.bias+'. RAVE decode, then gain to both speakers.');
  $('measurement').textContent=c.rate_hz?'Measured strongest slow output modulation: '+c.energy_envelope_dominant_hz_0p06_to_2+' Hz. All oscillator experiments share one playback gain.':'Control condition: no coordinate movement. All oscillator experiments share one playback gain.';
 }else{
  $('parameters').textContent='24-second recording comparison · shared pair gain';$('patch').style.display='none';$('mode-label').textContent='RECORDED DATASET COMPARISON';$('control-label').textContent='DATASET / ENCODE → DECODE COMPARISON';$('measurement').textContent='Source and reconstruction are energy-aligned. Their playback gain is separate from the oscillator experiments.';
 }
 if(!playing)$('play').textContent=selected===REFERENCE?'Play reference rhythm':'Play audio';
}
async function choose(id){
 if(id===selected)return;
 const token=++selectionToken,wanted=desiredPlaying,previousPosition=position();pause(true);
 try{
  if(!await dataReady)throw new Error('Experiment data is unavailable. Refresh and try again.');if(!conditions[id])throw new Error('Unknown experiment.');
  if(token!==selectionToken)return;
  selected=id;duration=conditions[id].duration_seconds;offset=previousPosition>=duration-.05?0:previousPosition;updateLabels();
  if(wanted){status('Loading '+conditions[id].label.toLowerCase()+'…');await loadBuffer(id);if(token!==selectionToken||!desiredPlaying)return;start();}
  else status('Selected '+conditions[id].label.toLowerCase()+'. Press Play to listen.');
 }catch(error){desiredPlaying=false;status(error.message);}
}
document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.preset)));
$('reset-patch').addEventListener('click',()=>choose(REFERENCE));
$('play').addEventListener('click',async()=>{
 if(playing||desiredPlaying){++selectionToken;pause();status('Paused.');return;}
 const token=++selectionToken;$('play').disabled=true;desiredPlaying=true;
 try{ensureContext();await context.resume();if(!await dataReady)throw new Error('Experiment data is unavailable. Refresh and try again.');status('Loading '+conditions[selected].label.toLowerCase()+'…');const id=selected;await loadBuffer(id);if(token===selectionToken&&id===selected&&desiredPlaying)start();}
 catch(error){desiredPlaying=false;status(error.message||'Unable to start audio.');}
 finally{$('play').disabled=false;}
});
$('restart').addEventListener('click',()=>{const was=playing;pause(true);offset=0;if(was)start();});
$('seek').addEventListener('input',()=>{const was=playing;pause(true);offset=Number($('seek').value);if(was)start();});
$('volume').addEventListener('input',()=>{if(master)master.gain.setTargetAtTime(Number($('volume').value),context.currentTime,.02);});

function setupCanvas(id){
 const canvas=$(id),width=canvas.clientWidth,height=canvas.clientHeight,dpr=window.devicePixelRatio||1;
 if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);return{ctx,width,height};
}
function draw(){
 const p=position(),c=conditions[selected];
 {const{ctx,width,height}=setupCanvas('control');
  ctx.strokeStyle='#344a55';ctx.beginPath();ctx.moveTo(0,height/2);ctx.lineTo(width,height/2);ctx.stroke();
  if(c&&c.rate_hz!==undefined){
   const maxValue=Math.max(1,Math.abs(c.bias)+c.amplitude),scale=height*.43/maxValue;
   ctx.strokeStyle='#7ad1c9';ctx.lineWidth=1.8;ctx.beginPath();
   for(let x=0;x<=width;x++){const t=x/width*duration,y=height/2-(c.bias+c.amplitude*Math.cos(2*Math.PI*c.rate_hz*t))*scale;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
   const x=p/duration*width,y=height/2-(c.bias+c.amplitude*Math.cos(2*Math.PI*c.rate_hz*p))*scale;ctx.fillStyle='#f6f8f5';ctx.beginPath();ctx.arc(x,y,4,0,2*Math.PI);ctx.fill();
  }else{ctx.fillStyle='#a6bac2';ctx.font='13px system-ui';ctx.fillText('Source audio enters the encoder for this comparison.',10,height/2-12);}
 }
 {const{ctx,width,height}=setupCanvas('waveform'),values=waveforms[selected]||[],maximum=Math.max(...values,.0001);
  ctx.strokeStyle='#344a55';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,height/2);ctx.lineTo(width,height/2);ctx.stroke();
  values.forEach((value,i)=>{const x=i/(values.length-1)*width,extent=Math.max(1,value/maximum*height*.43);ctx.strokeStyle=x<=p/duration*width?'#7ad1c9':'#566c77';ctx.beginPath();ctx.moveTo(x,height/2-extent);ctx.lineTo(x,height/2+extent);ctx.stroke();});
  ctx.strokeStyle='#f6f8f5';ctx.beginPath();ctx.moveTo(p/duration*width,0);ctx.lineTo(p/duration*width,height);ctx.stroke();
 }
 $('clock').textContent=clockText(p)+' / '+clockText(duration);$('seek').value=p;$('seek').setAttribute('aria-valuetext',p.toFixed(1)+' seconds');
 if(playing&&p>=duration-.015){pause();if($('loop').checked){offset=0;start();}else{offset=duration;status('Finished. Choose another experiment or replay.');}}
 requestAnimationFrame(draw);
}
draw();
