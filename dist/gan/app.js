'use strict';
(()=>{
  const $=id=>document.getElementById(id),canvas=$('output'),ctx=canvas.getContext('2d');
  let worker=null,ready=false,busy=false,playing=false,queued=null,position=0,anchors=[],pathVersion=0,lastClock=0;
  const controls=['position','play','mode','speed','radius','save'];
  const modeName=()=>({selected:'selected eight-point loop',random:'seeded eight-point loop',original:'original two-point path'}[$('mode').value]);
  function syncSeedControls(){const enabled=ready&&$('mode').value==='random';['seed','applySeed','newPath'].forEach(id=>$(id).disabled=!enabled);$('seedControls').hidden=$('mode').value!=='random';}
  function updatePosition(){const i=Math.floor(position*anchors.length)%anchors.length;$('position').value=Math.round(position*1000);$('positionValue').value=Math.round(position*100)+'%';$('anchorNote').textContent='Anchor '+(i+1)+' → '+((i+1)%anchors.length+1)+' of '+anchors.length;for(const b of $('anchors').children)b.setAttribute('aria-pressed',Number(b.dataset.index)===i?'true':'false');}
  function choosePath(){
    pathVersion++;anchors=CloudPath.create($('mode').value,Number($('seed').value));position=0;
    const selected=$('mode').value==='selected';$('anchors').replaceChildren();
    anchors.forEach((a,i)=>{const b=document.createElement('button');b.type='button';b.dataset.index=i;b.setAttribute('aria-label','Jump to anchor '+(i+1));b.disabled=!ready;
      if(selected){const img=document.createElement('img');img.src='anchors/seed-'+CloudPath.curatedSeeds[i]+'.jpg';img.alt='';b.append(img);}const n=document.createElement('span');n.textContent=i+1;b.append(n);
      b.addEventListener('click',()=>{setPlaying(false);position=i/anchors.length;updatePosition();requestFrame(position);});$('anchors').append(b);});
    syncSeedControls();updatePosition();
  }
  function requestFrame(p){if(!ready)return;if(busy){queued=p;return;}busy=true;const latent=CloudPath.sample(anchors,p,Number($('radius').value));worker.postMessage({type:'run',latent,position:p,version:pathVersion},[latent.buffer]);}
  function setPlaying(value){playing=value;$('play').textContent=playing?'Pause drift':'Start drift';lastClock=performance.now();if(playing&&!busy)requestAnimationFrame(tick);}
  function tick(){if(!playing||!ready)return;const now=performance.now(),elapsed=(now-lastClock)/1000;lastClock=now;position=(position+elapsed/(Number($('speed').value)*anchors.length))%1;updatePosition();requestFrame(position);}
  function refreshPath(){setPlaying(false);choosePath();queued=busy?0:null;requestFrame(0);}
  $('load').addEventListener('click',()=>{
    $('load').disabled=true;$('progress').hidden=false;$('loadText').textContent='Loading cloud model…';$('status').textContent='Downloading model parts…';
    if(worker)worker.terminate();worker=new Worker('worker.js');
    worker.onerror=()=>{ready=false;busy=false;setPlaying(false);controls.forEach(id=>$(id).disabled=true);syncSeedControls();$('veil').hidden=false;$('load').disabled=false;$('loadText').textContent='The worker could not start. Retry loading.';$('status').textContent='The recorded walk below remains available.';};
    worker.onmessage=event=>{const msg=event.data;
      if(msg.type==='progress'){$('progress').value=msg.value;$('status').textContent='Downloading model: '+Math.round(msg.value*100)+'%';}
      else if(msg.type==='preparing'){$('loadText').textContent='Preparing model…';$('status').textContent='Preparing the inference engine.';}
      else if(msg.type==='ready'){ready=true;controls.forEach(id=>$(id).disabled=id==='save');$('veil').hidden=true;choosePath();requestFrame(0);}
      else if(msg.type==='frame'){
        if(msg.version!==pathVersion){busy=false;const p=queued===null?position:queued;queued=null;requestFrame(p);return;}
        ctx.putImageData(new ImageData(msg.pixels,256,256),0,0);busy=false;$('save').disabled=false;
        $('outputNote').textContent='Live model output · '+modeName();$('status').textContent=Math.round(msg.ms)+' ms per frame · '+Number($('speed').value).toFixed(1)+' s between anchors';
        if(queued!==null){const p=queued;queued=null;requestFrame(p);}else if(playing)requestAnimationFrame(tick);
      }else if(msg.type==='error'){busy=false;queued=null;setPlaying(false);$('status').textContent='Could not '+(msg.during==='load'?'load':'run')+' the model: '+msg.message;if(msg.during==='load'){$('load').disabled=false;$('loadText').textContent='Load failed. Retry, or play the recorded walk.';}}
    };worker.postMessage({type:'load'});
  });
  $('position').addEventListener('input',()=>{setPlaying(false);position=Number($('position').value)/1000;if(position===1)position=.999999;updatePosition();requestFrame(position);});
  $('play').addEventListener('click',()=>setPlaying(!playing));$('mode').addEventListener('change',refreshPath);
  $('speed').addEventListener('input',()=>{$('speedValue').value=Number($('speed').value).toFixed(1)+' s';lastClock=performance.now();});
  $('radius').addEventListener('input',()=>{$('radiusValue').value=Number($('radius').value).toFixed(1)+'×';pathVersion++;queued=busy?position:null;requestFrame(position);});
  $('applySeed').addEventListener('click',()=>{if($('seed').reportValidity())refreshPath();});
  $('newPath').addEventListener('click',()=>{$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0];refreshPath();});
  $('save').addEventListener('click',()=>{const a=document.createElement('a');a.download='cloud-gan-'+$('mode').value+'.png';a.href=canvas.toDataURL('image/png');a.click();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);});window.addEventListener('pagehide',()=>{if(worker)worker.terminate();});
  choosePath();
})();
