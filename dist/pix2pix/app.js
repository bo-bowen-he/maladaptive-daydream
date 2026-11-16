
(() => {
  'use strict';

  const MODEL_URL = 'model/clouds.pict';
  const EXAMPLES = ['000050', '000300', '000480', '000600', '000650'].map(n => `examples/${n}.png`);
  const N = 256;            // the model's input and output size
  const UNDO_LIMIT = 30;

  const $ = id => document.getElementById(id);
  const draw = $('draw'), ctx = draw.getContext('2d', { willReadFrequently: true });
  const out = $('out');
  const cursor = $('cursor'), frame = $('drawFrame');
  const statusEl = $('status'), veil = $('veil'), veilText = $('veilText'), veilBar = $('veilBar');
  const sizeEl = $('size'), sizeOut = $('sizeOut');
  const undoBtn = $('undo'), goBtn = $('go'), saveBtn = $('save'), liveEl = $('live');

  const small = document.createElement('canvas');
  small.width = small.height = N;
  const sctx = small.getContext('2d', { willReadFrequently: true });

  let weights = null;       // variable name -> tensor
  let busy = false, queued = false;
  let ink = '#000';
  const undoStack = [];

  // ---------- model: read a .pict file ----------
  // Layout: three length-prefixed chunks (big-endian uint32 length, then bytes):
  //   1. JSON list of {name, shape}   2. 256 float32 values   3. one byte per weight, indexing chunk 2
  function parsePict(buf) {
    const view = new DataView(buf);
    const parts = [];
    let off = 0;
    while (off < buf.byteLength) {
      if (off + 4 > buf.byteLength) throw new Error('Incomplete model header.');
      const len = view.getUint32(off); off += 4;
      if (off + len > buf.byteLength) throw new Error('Incomplete model data.');
      parts.push(buf.slice(off, off + len)); off += len;
    }
    if (parts.length !== 3) throw new Error('This file is not a pix2pix .pict model.');
    const shapes = JSON.parse(new TextDecoder().decode(parts[0]));
    const index = new Float32Array(parts[1]);
    const codes = new Uint8Array(parts[2]);
    if (index.length !== 256) throw new Error('Invalid model lookup table.');
    const vars = {};
    let p = 0;
    for (const { name, shape } of shapes) {
      const size = shape.reduce((a, b) => a * b, 1);
      if (!Number.isSafeInteger(size) || size <= 0 || p + size > codes.length) throw new Error('Invalid model weight shape.');
      const vals = new Float32Array(size);
      for (let i = 0; i < size; i++) vals[i] = index[codes[p + i]];
      p += size;
      vars[name] = tf.tensor(vals, shape);
    }
    if (!vars['generator/encoder_1/conv2d/kernel']) throw new Error('This .pict has no pix2pix generator in it.');
    return vars;
  }

  async function fetchWithProgress(url, onProgress) {
    const manifestResponse = await fetch('model/manifest.json');
    if (!manifestResponse.ok) throw new Error('The model manifest could not be loaded.');
    const manifest = await manifestResponse.json();
    const all = new Uint8Array(manifest.bytes);
    let loaded = 0;
    const offsets = [];
    let expected = 0;
    for (const part of manifest.chunks) { offsets.push(expected); expected += part.size; }
    if (expected !== manifest.bytes) throw new Error('Invalid model manifest.');
    // Two concurrent requests reduce startup round trips without changing model bytes.
    for (let i = 0; i < manifest.chunks.length; i += 2) {
      await Promise.all(manifest.chunks.slice(i, i + 2).map(async (part, j) => {
        const res = await fetch('model/' + part.file);
        if (!res.ok) throw new Error('A model part could not be loaded. Reload to retry.');
        const data = new Uint8Array(await res.arrayBuffer());
        if (data.length !== part.size) throw new Error('An incomplete model part was received. Reload to retry.');
        all.set(data, offsets[i + j]); loaded += data.length; onProgress(loaded / manifest.bytes);
      }));
    }
    return all.buffer;
  }

  function useModel(buf, label) {
    const next = parsePict(buf);
    if (weights) Object.values(weights).forEach(t => t.dispose());
    weights = next;
    $('modelName').textContent = `Model: ${label}`;
    goBtn.disabled = false;
    veil.hidden = true;
  }

  // ---------- model: the pix2pix generator (U-Net, 8 down / 8 up) ----------
  function generate(input) {            // input: [1, 256, 256, 3] in -1..1
    const w = weights;
    const norm = (x, scope) => {
      const { mean, variance } = tf.moments(x, [0, 1, 2]);
      return tf.batchNorm(x, mean, variance,
        w[`${scope}/batch_normalization/beta`], w[`${scope}/batch_normalization/gamma`], 1e-5);
    };
    const down = (x, scope) =>
      tf.conv2d(x, w[`${scope}/conv2d/kernel`], 2, 'same').add(w[`${scope}/conv2d/bias`]);
    const up = (x, scope) => {
      const k = w[`${scope}/conv2d_transpose/kernel`];
      const [, h, wd] = x.shape;
      return tf.conv2dTranspose(x, k, [1, h * 2, wd * 2, k.shape[2]], 2, 'same')
        .add(w[`${scope}/conv2d_transpose/bias`]);
    };

    const layers = [down(input, 'generator/encoder_1')];
    for (let i = 2; i <= 8; i++) {
      const scope = `generator/encoder_${i}`;
      layers.push(norm(down(tf.leakyRelu(layers[layers.length - 1], 0.2), scope), scope));
    }
    for (let i = 8; i >= 2; i--) {
      const scope = `generator/decoder_${i}`;
      const last = layers[layers.length - 1];
      const x = i === 8 ? last : tf.concat([last, layers[i - 1]], 3);
      layers.push(norm(up(tf.relu(x), scope), scope));
    }
    const x = tf.concat([layers[layers.length - 1], layers[0]], 3);
    return tf.tanh(up(tf.relu(x), 'generator/decoder_1'));
  }

  async function run() {
    if (!weights) return;
    if (busy) { queued = true; return; }
    busy = true;
    statusEl.textContent = 'Generating…';
    try {
      sctx.drawImage(draw, 0, 0, N, N);
      const t0 = performance.now();
      const img = tf.tidy(() => {
        const input = tf.browser.fromPixels(small).toFloat().div(127.5).sub(1).expandDims(0);
        return generate(input).squeeze([0]).add(1).div(2).clipByValue(0, 1);
      });
      try { await tf.browser.toPixels(img, out); } finally { img.dispose(); }
      statusEl.textContent = `${Math.round(performance.now() - t0)} ms`;
      saveBtn.disabled = false;
      $('outputNote').textContent = 'Live model output · 256 × 256';
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Generation failed. Reload the page and try again.';
    }
    busy = false;
    if (queued) { queued = false; run(); }
  }

  // ---------- drawing ----------
  function fillWhite() { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, draw.width, draw.height); }

  function snapshot() {
    undoStack.push(ctx.getImageData(0, 0, draw.width, draw.height));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    undoBtn.disabled = false;
  }
  function undo() {
    $('reference').hidden=true; $('referenceNote').textContent='Edited input — no paired source photograph';
    const last = undoStack.pop();
    if (!last) return;
    ctx.putImageData(last, 0, 0);
    undoBtn.disabled = undoStack.length === 0;
    changed();
  }
  function changed() { if (liveEl.checked) run(); }

  function pos(e) {
    const r = draw.getBoundingClientRect();
    return { x: (e.clientX - r.left) * draw.width / r.width, y: (e.clientY - r.top) * draw.height / r.height, r };
  }
  function moveCursor(e) {
    const { r } = pos(e);
    const d = sizeEl.value * r.width / draw.width;
    cursor.style.width = cursor.style.height = `${d}px`;
    cursor.style.left = `${e.clientX - r.left}px`;
    cursor.style.top = `${e.clientY - r.top}px`;
  }

  let last = null;
  draw.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    draw.setPointerCapture(e.pointerId);
    snapshot();
    const p = pos(e);
    $('referenceNote').textContent = 'Custom drawing — no paired source photograph';
    $('reference').hidden = true;
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(p.x, p.y, sizeEl.value / 2, 0, Math.PI * 2); ctx.fill();
    last = p;
    e.preventDefault();
  });
  draw.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') { cursor.style.display = 'block'; moveCursor(e); }
    if (!last) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    ctx.strokeStyle = ink; ctx.lineWidth = sizeEl.value; ctx.lineCap = ctx.lineJoin = 'round';
    for (const ev of (events.length ? events : [e])) {
      const p = pos(ev);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
    }
  });
  const endStroke = () => { if (last) { last = null; changed(); } };
  draw.addEventListener('pointerup', endStroke);
  draw.addEventListener('pointercancel', endStroke);
  draw.addEventListener('pointerleave', () => { cursor.style.display = 'none'; });

  function setSize(v) {
    sizeEl.value = Math.max(sizeEl.min, Math.min(sizeEl.max, Math.round(v)));
    sizeOut.textContent = `${sizeEl.value} px`;
    const r = draw.getBoundingClientRect();
    cursor.style.width = cursor.style.height = `${sizeEl.value * r.width / draw.width}px`;
  }
  sizeEl.addEventListener('input', () => setSize(sizeEl.value));

  function setInk(v) {
    ink = v;
    document.querySelector(`input[name="ink"][value="${v}"]`).checked = true;
  }
  document.querySelectorAll('input[name="ink"]').forEach(el =>
    el.addEventListener('change', () => { ink = el.value; }));

  undoBtn.addEventListener('click', undo);
  $('clear').addEventListener('click', () => { $('reference').hidden=true; $('referenceNote').textContent='Edited input — no paired source photograph'; snapshot(); fillWhite(); changed(); });
  $('invert').addEventListener('click', () => { $('reference').hidden=true; $('referenceNote').textContent='Edited input — no paired source photograph';
    snapshot();
    const d = ctx.getImageData(0, 0, draw.width, draw.height);
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = 255 - d.data[i]; d.data[i + 1] = 255 - d.data[i + 1]; d.data[i + 2] = 255 - d.data[i + 2];
    }
    ctx.putImageData(d, 0, 0);
    changed();
  });

  function placeImage(img) {            // centre-crop to a square, like the training data
    snapshot();
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    fillWhite();
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, draw.width, draw.height);
    changed();
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file could not be read as an image.'));
      img.src = src;
    });
  }
  $('openImage').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    try { placeImage(await loadImage(url)); $('reference').hidden=true; $('referenceNote').textContent='Custom image — no paired source photograph'; }
    catch (err) { statusEl.textContent = err.message; }
    URL.revokeObjectURL(url);
    e.target.value = '';
  });

  goBtn.addEventListener('click', run);
  saveBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'sky.png';
    a.href = out.toDataURL('image/png');
    a.click();
  });

  $('openModel').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    statusEl.textContent = 'Reading model…';
    try { useModel(await file.arrayBuffer(), file.name); await run(); }
    catch (err) { console.error(err); statusEl.textContent = err.message; }
    e.target.value = '';
  });

  window.addEventListener('keydown', e => {
    if (e.target.matches('input,select,textarea,button') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === '[') setSize(sizeEl.value * 0.8 - 1);
    else if (k === ']') setSize(sizeEl.value * 1.25 + 1);
    else if (k === 'x' && !e.metaKey && !e.ctrlKey) setInk(ink === '#000' ? '#fff' : '#000');
    else if (k === 'z') { e.preventDefault(); undo(); }
  });

  // ---------- start ----------
  const list = $('examples');
  EXAMPLES.forEach((src, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.setAttribute('aria-label', `Use training contour ${i + 1}`);
    const im = document.createElement('img');
    im.src = src; im.alt = ''; im.loading = 'lazy';
    b.append(im);
    b.addEventListener('click', async () => {
      try { placeImage(await loadImage(src)); $('reference').src=src.replace('.png','-photo.png'); $('reference').hidden=false; $('referenceNote').textContent='Paired source photograph · example '+(i+1); } catch (err) { statusEl.textContent = err.message; }
    });
    li.append(b); list.append(li);
  });

  fillWhite();
  setSize(sizeEl.value);

  async function startModel() {
    $('loadModel').disabled=true;
    $('loadModel').hidden=true;
    veilText.textContent='Loading cloud model…';
    veilBar.hidden=false;
    try {
      const buf = await fetchWithProgress(MODEL_URL, f => { veilBar.value = f; });
      veilText.textContent = 'Preparing the model…';
      await tf.ready();
      await new Promise(requestAnimationFrame);
      useModel(buf, MODEL_URL.split('/').pop());
      await run();
    } catch (err) {
      console.error(err);
      veilBar.hidden = true;
      $('loadModel').hidden=false;
      veilText.textContent = location.protocol === 'file:'
        ? 'This page has to be served over http to load the model. Run "python3 -m http.server" in the docs folder and open http://localhost:8000.'
        : `${err.message} Try again, or load a .pict model below.`;
    }
    $('loadModel').disabled=false;
  }
  $('loadModel').addEventListener('click', startModel);
  startModel();
  loadImage(EXAMPLES[0]).then(img=>ctx.drawImage(img,0,0,draw.width,draw.height)).catch(err=>statusEl.textContent=err.message);
})();
