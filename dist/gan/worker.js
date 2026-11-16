'use strict';
importScripts('lib/ort.wasm.min.js');
let session=null;
self.onmessage=async event=>{
  const msg=event.data;
  try{
    if(msg.type==='load'){
      ort.env.wasm.numThreads=1;
      ort.env.wasm.wasmPaths=new URL('lib/',self.location.href).href;
      const manifestResponse=await fetch('model/manifest.json');
      if(!manifestResponse.ok)throw new Error('Model manifest unavailable.');
      const manifest=await manifestResponse.json();
      const bytes=new Uint8Array(manifest.bytes);let offset=0;
      for(const part of manifest.chunks){
        const response=await fetch('model/'+part.file);
        if(!response.ok)throw new Error('A model part could not be downloaded.');
        const partBytes=new Uint8Array(await response.arrayBuffer());
        if(partBytes.length!==part.size)throw new Error('An incomplete model part was downloaded.');
        bytes.set(partBytes,offset);offset+=partBytes.length;
        postMessage({type:'progress',value:offset/manifest.bytes});
      }
      postMessage({type:'preparing'});
      session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
      postMessage({type:'ready'});
    }else if(msg.type==='run'){
      if(!session)throw new Error('Load the model first.');
      const start=performance.now();
      const tensor=new ort.Tensor('float32',msg.latent,[1,256]);
      const results=await session.run({[session.inputNames[0]]:tensor});
      const output=results[session.outputNames[0]];
      if(output.dims.join(',')!=='1,3,256,256')throw new Error('Unexpected model output shape.');
      const image=new Uint8ClampedArray(256*256*4), data=output.data;
      for(let i=0;i<256*256;i++){
        image[4*i]=Math.round(Math.max(0,Math.min(1,data[i]))*255);
        image[4*i+1]=Math.round(Math.max(0,Math.min(1,data[65536+i]))*255);
        image[4*i+2]=Math.round(Math.max(0,Math.min(1,data[131072+i]))*255);
        image[4*i+3]=255;
      }
      if(tensor.dispose)tensor.dispose();
      if(output.dispose)output.dispose();
      postMessage({type:'frame',pixels:image,ms:performance.now()-start,position:msg.position,version:msg.version},[image.buffer]);
    }
  }catch(error){postMessage({type:'error',message:error.message||String(error),during:msg.type});}
};
