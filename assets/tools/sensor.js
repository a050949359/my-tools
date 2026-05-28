const CSS = `
.sensor-wrap {
  background: #0f0f0f; border-radius: 8px; padding: 16px; min-height: 400px;
}
.sensor-wrap h2 {
  color: #7eb8f7; margin-bottom: 14px; font-size: 1rem;
  letter-spacing: 2px; font-family: monospace; font-weight: 600;
}
.sensor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 12px;
}
.s-card {
  background: #1a1a1a; border: 1px solid #2a2a2a;
  border-radius: 8px; padding: 12px; font-family: monospace;
  transition: border-color 0.2s;
}
.s-card.active { border-color: #3a6a9f; }
.s-card.error  { border-color: #7a2020; }
.s-card-hd {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 8px;
}
.s-card-title { font-size: 0.72rem; color: #999; letter-spacing: 1px; }
.s-card-sub   { font-size: 0.62rem; color: #444; margin-top: 2px; }
.s-tog { position: relative; width: 38px; height: 20px; flex-shrink: 0; }
.s-tog input { opacity: 0; width: 0; height: 0; }
.s-tog-sl {
  position: absolute; inset: 0; background: #2a2a2a;
  border-radius: 10px; cursor: pointer; transition: background 0.2s;
}
.s-tog-sl::before {
  content: ''; position: absolute;
  width: 14px; height: 14px; left: 3px; top: 3px;
  background: #555; border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}
.s-tog input:checked + .s-tog-sl { background: #1e3a5f; }
.s-tog input:checked + .s-tog-sl::before { transform: translateX(18px); background: #7eb8f7; }
.s-status { font-size: 0.63rem; color: #444; margin-bottom: 6px; min-height: 13px; }
.s-vals {
  display: grid; grid-template-columns: auto 1fr;
  gap: 3px 10px; margin-bottom: 8px; font-size: 0.72rem;
}
.s-lbl { color: #555; }
.s-num { color: #b0ccec; font-variant-numeric: tabular-nums; }
canvas.s-cv { width: 100%; height: 72px; display: block; border-radius: 3px; background: #111; }
.s-batt-wrap { background: #111; border-radius: 3px; height: 16px; overflow: hidden; margin-top: 4px; }
.s-batt-fill { height: 100%; border-radius: 3px; transition: width 1s; background: #5fa85f; }
.s-batt-fill.mid { background: #c8a020; }
.s-batt-fill.low { background: #e05555; }
`;

const HISTORY = 180;
const CH_COLORS = ['#7eb8f7', '#f7a87e', '#7ef7c0'];

class Ring {
  constructor() { this.d = new Array(HISTORY).fill(null); this.i = 0; }
  push(v) { this.d[this.i++ % HISTORY] = v; }
  get() {
    const out = [];
    for (let k = 0; k < HISTORY; k++) out.push(this.d[(this.i + k) % HISTORY]);
    return out;
  }
}

export function template() {
  return `
    <div class="sensor-wrap">
      <h2>📱 SENSOR MONITOR</h2>
      <div class="sensor-grid" id="sensor-grid"></div>
    </div>
  `;
}

export async function init() {
  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  const grid = document.getElementById('sensor-grid');
  const jobs = {};

  function makeCard({ id, title, sub, fields, chart = true, extra = '' }) {
    const div = document.createElement('div');
    div.className = 's-card'; div.id = 'sc-' + id;
    div.innerHTML = `
      <div class="s-card-hd">
        <div><div class="s-card-title">${title}</div><div class="s-card-sub">${sub}</div></div>
        <label class="s-tog"><input type="checkbox" id="stog-${id}"><span class="s-tog-sl"></span></label>
      </div>
      <div class="s-status" id="sst-${id}">— 未啟動</div>
      <div class="s-vals" id="svl-${id}">
        ${fields.map(f => `<span class="s-lbl">${f.l}</span><span class="s-num" id="sv-${id}-${f.k}">—</span>`).join('')}
      </div>
      ${chart ? `<canvas class="s-cv" id="scv-${id}"></canvas>` : ''}
      ${extra}
    `;
    grid.appendChild(div);
  }

  function setStatus(id, msg, ok) {
    const el = document.getElementById('sst-' + id); if (!el) return;
    el.textContent = msg;
    el.style.color = ok === true ? '#5fa85f' : ok === false ? '#e05555' : '#444';
    const card = document.getElementById('sc-' + id);
    card.classList.toggle('active', ok === true);
    card.classList.toggle('error',  ok === false);
  }

  function setVal(id, key, v, dec = 2) {
    const el = document.getElementById(`sv-${id}-${key}`);
    if (el) el.textContent = v == null ? '—' : isFinite(v) ? Number(v).toFixed(dec) : '—';
  }

  function drawMini(id, bufs, min, max) {
    const cv = document.getElementById('scv-' + id); if (!cv) return;
    const W = cv.offsetWidth, H = cv.offsetHeight;
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#111'; cx.fillRect(0, 0, W, H);
    if (min < 0 && max > 0) {
      const zy = H * (1 - (0 - min) / (max - min));
      cx.strokeStyle = '#1e1e1e'; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(0, zy); cx.lineTo(W, zy); cx.stroke();
    }
    bufs.forEach((buf, bi) => {
      const data = buf.get();
      cx.strokeStyle = CH_COLORS[bi % 3]; cx.lineWidth = 1.2;
      cx.beginPath(); let first = true;
      data.forEach((v, i) => {
        if (v == null) return;
        const x = (i / (HISTORY - 1)) * W;
        const y = H * (1 - (v - min) / (max - min));
        first ? cx.moveTo(x, y) : cx.lineTo(x, y);
        first = false;
      });
      cx.stroke();
    });
  }

  function reg(id, bufs, min, max) { jobs[id] = { bufs, min, max }; }

  let rafId = null;
  function startRaf() {
    function loop() {
      rafId = requestAnimationFrame(loop);
      for (const [id, j] of Object.entries(jobs)) drawMini(id, j.bufs, j.min, j.max);
    }
    loop();
  }

  // ── 1. ACCELEROMETER ──────────────────────────────────────
  makeCard({ id: 'accel', title: 'ACCELEROMETER', sub: 'DeviceMotion · 含重力',
    fields: [{ l: 'X (m/s²)', k: 'x' }, { l: 'Y (m/s²)', k: 'y' }, { l: 'Z (m/s²)', k: 'z' }] });
  const aBufs = [new Ring(), new Ring(), new Ring()];
  reg('accel', aBufs, -20, 20);

  function onAccel(e) {
    const g = e.accelerationIncludingGravity; if (!g) return;
    aBufs[0].push(g.x); aBufs[1].push(g.y); aBufs[2].push(g.z);
    setVal('accel','x',g.x); setVal('accel','y',g.y); setVal('accel','z',g.z);
  }
  document.getElementById('stog-accel').addEventListener('change', async e => {
    if (e.target.checked) {
      if (typeof DeviceMotionEvent === 'undefined') { setStatus('accel','✗ 不支援',false); e.target.checked=false; return; }
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); }
        catch { setStatus('accel','✗ 拒絕授權',false); e.target.checked=false; return; }
      }
      window.addEventListener('devicemotion', onAccel);
      setStatus('accel','✓ 運作中',true);
    } else {
      window.removeEventListener('devicemotion', onAccel);
      setStatus('accel','— 已停止',null);
    }
  });

  // ── 2. GYROSCOPE ──────────────────────────────────────────
  makeCard({ id: 'gyro', title: 'GYROSCOPE', sub: 'DeviceMotion · rotationRate',
    fields: [{ l: 'α (°/s)', k: 'a' }, { l: 'β (°/s)', k: 'b' }, { l: 'γ (°/s)', k: 'g' }] });
  const gBufs = [new Ring(), new Ring(), new Ring()];
  reg('gyro', gBufs, -200, 200);

  function onGyro(e) {
    const r = e.rotationRate; if (!r) return;
    gBufs[0].push(r.alpha); gBufs[1].push(r.beta); gBufs[2].push(r.gamma);
    setVal('gyro','a',r.alpha); setVal('gyro','b',r.beta); setVal('gyro','g',r.gamma);
  }
  document.getElementById('stog-gyro').addEventListener('change', async e => {
    if (e.target.checked) {
      if (typeof DeviceMotionEvent === 'undefined') { setStatus('gyro','✗ 不支援',false); e.target.checked=false; return; }
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); }
        catch { setStatus('gyro','✗ 拒絕授權',false); e.target.checked=false; return; }
      }
      window.addEventListener('devicemotion', onGyro);
      setStatus('gyro','✓ 運作中',true);
    } else {
      window.removeEventListener('devicemotion', onGyro);
      setStatus('gyro','— 已停止',null);
    }
  });

  // ── 3. ORIENTATION ────────────────────────────────────────
  makeCard({ id: 'orient', title: 'ORIENTATION', sub: 'DeviceOrientation · 絕對姿態',
    fields: [{ l: 'Alpha (°)', k: 'a' }, { l: 'Beta (°)', k: 'b' }, { l: 'Gamma (°)', k: 'g' }] });
  const oBufs = [new Ring(), new Ring(), new Ring()];
  reg('orient', oBufs, -180, 360);

  function onOrient(e) {
    oBufs[0].push(e.alpha); oBufs[1].push(e.beta); oBufs[2].push(e.gamma);
    setVal('orient','a',e.alpha,1); setVal('orient','b',e.beta,1); setVal('orient','g',e.gamma,1);
  }
  document.getElementById('stog-orient').addEventListener('change', async e => {
    if (e.target.checked) {
      if (typeof DeviceOrientationEvent === 'undefined') { setStatus('orient','✗ 不支援',false); e.target.checked=false; return; }
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try { await DeviceOrientationEvent.requestPermission(); }
        catch { setStatus('orient','✗ 拒絕授權',false); e.target.checked=false; return; }
      }
      window.addEventListener('deviceorientation', onOrient);
      setStatus('orient','✓ 運作中',true);
    } else {
      window.removeEventListener('deviceorientation', onOrient);
      setStatus('orient','— 已停止',null);
    }
  });

  // ── 4. MAGNETOMETER ───────────────────────────────────────
  makeCard({ id: 'mag', title: 'MAGNETOMETER', sub: 'Generic Sensor API · Chrome Android',
    fields: [{ l: 'X (μT)', k: 'x' }, { l: 'Y (μT)', k: 'y' }, { l: 'Z (μT)', k: 'z' }] });
  const mBufs = [new Ring(), new Ring(), new Ring()];
  reg('mag', mBufs, -100, 100);

  let magSensor = null;
  document.getElementById('stog-mag').addEventListener('change', e => {
    if (e.target.checked) {
      if (typeof Magnetometer === 'undefined') { setStatus('mag','✗ 不支援（需 Chrome Android）',false); e.target.checked=false; return; }
      try {
        magSensor = new Magnetometer({ frequency: 20 });
        magSensor.addEventListener('reading', () => {
          mBufs[0].push(magSensor.x); mBufs[1].push(magSensor.y); mBufs[2].push(magSensor.z);
          setVal('mag','x',magSensor.x); setVal('mag','y',magSensor.y); setVal('mag','z',magSensor.z);
        });
        magSensor.addEventListener('error', ev => setStatus('mag','✗ '+ev.error.message,false));
        magSensor.start();
        setStatus('mag','✓ 運作中',true);
      } catch(err) { setStatus('mag','✗ '+err.message,false); e.target.checked=false; }
    } else {
      magSensor?.stop(); magSensor = null;
      setStatus('mag','— 已停止',null);
    }
  });

  // ── 5. AMBIENT LIGHT ──────────────────────────────────────
  makeCard({ id: 'light', title: 'AMBIENT LIGHT', sub: 'AmbientLightSensor · Chrome Android',
    fields: [{ l: 'Lux', k: 'lux' }] });
  const lBufs = [new Ring()];
  reg('light', lBufs, 0, 1000);

  let lightSensor = null;
  document.getElementById('stog-light').addEventListener('change', e => {
    if (e.target.checked) {
      if (typeof AmbientLightSensor === 'undefined') { setStatus('light','✗ 不支援',false); e.target.checked=false; return; }
      try {
        lightSensor = new AmbientLightSensor({ frequency: 5 });
        lightSensor.addEventListener('reading', () => {
          lBufs[0].push(lightSensor.illuminance);
          setVal('light','lux',lightSensor.illuminance,0);
        });
        lightSensor.addEventListener('error', ev => setStatus('light','✗ '+ev.error.message,false));
        lightSensor.start();
        setStatus('light','✓ 運作中',true);
      } catch(err) { setStatus('light','✗ '+err.message,false); e.target.checked=false; }
    } else {
      lightSensor?.stop(); lightSensor = null;
      setStatus('light','— 已停止',null);
    }
  });

  // ── 6. GEOLOCATION ────────────────────────────────────────
  makeCard({ id: 'gps', title: 'GEOLOCATION', sub: 'GPS / Network',
    fields: [
      { l: '緯度', k: 'lat' }, { l: '經度', k: 'lon' },
      { l: '速度 (m/s)', k: 'spd' }, { l: '方位 (°)', k: 'hdg' },
      { l: '精度 (m)',   k: 'acc' },
    ], chart: false });

  let gpsWatch = null;
  document.getElementById('stog-gps').addEventListener('change', e => {
    if (e.target.checked) {
      if (!navigator.geolocation) { setStatus('gps','✗ 不支援',false); e.target.checked=false; return; }
      setStatus('gps','⌛ 定位中…',null);
      gpsWatch = navigator.geolocation.watchPosition(
        pos => {
          const c = pos.coords;
          setVal('gps','lat',c.latitude,5); setVal('gps','lon',c.longitude,5);
          setVal('gps','spd',c.speed,2);   setVal('gps','hdg',c.heading,1);
          setVal('gps','acc',c.accuracy,1);
          setStatus('gps','✓ 運作中',true);
        },
        err => setStatus('gps','✗ '+err.message,false),
        { enableHighAccuracy: true }
      );
    } else {
      navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null;
      setStatus('gps','— 已停止',null);
    }
  });

  // ── 7. BATTERY ────────────────────────────────────────────
  makeCard({ id: 'batt', title: 'BATTERY', sub: 'Battery Status API',
    fields: [
      { l: '電量', k: 'lvl' }, { l: '狀態', k: 'chg' },
      { l: '充電剩餘', k: 'ct' }, { l: '放電剩餘', k: 'dt' },
    ],
    chart: false,
    extra: `<div class="s-batt-wrap"><div class="s-batt-fill" id="s-batt-bar" style="width:0%"></div></div>`,
  });

  let battObj = null;
  function updateBatt(b) {
    const pct = (b.level * 100).toFixed(0);
    document.getElementById('sv-batt-lvl').textContent = pct + ' %';
    document.getElementById('sv-batt-chg').textContent = b.charging ? '充電中 ⚡' : '放電中';
    const ct = b.chargingTime, dt = b.dischargingTime;
    document.getElementById('sv-batt-ct').textContent = isFinite(ct) ? Math.round(ct/60)+' 分' : '—';
    document.getElementById('sv-batt-dt').textContent = isFinite(dt) ? Math.round(dt/60)+' 分' : '—';
    const bar = document.getElementById('s-batt-bar');
    bar.style.width = pct + '%';
    bar.className = 's-batt-fill' + (b.level < 0.2 ? ' low' : b.level < 0.4 ? ' mid' : '');
  }

  document.getElementById('stog-batt').addEventListener('change', async e => {
    if (e.target.checked) {
      if (!navigator.getBattery) { setStatus('batt','✗ 不支援',false); e.target.checked=false; return; }
      try {
        battObj = await navigator.getBattery();
        updateBatt(battObj);
        ['levelchange','chargingchange','chargingtimechange','dischargingtimechange']
          .forEach(ev => battObj.addEventListener(ev, () => updateBatt(battObj)));
        setStatus('batt','✓ 運作中',true);
      } catch(err) { setStatus('batt','✗ '+err.message,false); e.target.checked=false; }
    } else {
      battObj = null;
      setStatus('batt','— 已停止',null);
    }
  });

  // ── 8. MICROPHONE ────────────────────────────────────────
  makeCard({ id: 'mic', title: 'MICROPHONE', sub: 'Web Audio API · getUserMedia',
    fields: [
      { l: '取樣率 (Hz)', k: 'sr'   },
      { l: 'RMS (dBFS)',  k: 'rms'  },
      { l: '峰值頻率 (Hz)', k: 'pk' },
      { l: '峰值 (dBFS)', k: 'pkdb' },
    ] });
  const micBufs = [new Ring()];
  reg('mic', micBufs, -1, 1);

  let micStream = null, micCtx = null, micAnalyser = null;
  let micRaf = null, micFftRaf = null;
  const micFftSize = 2048;

  function micOscLoop() {
    micRaf = requestAnimationFrame(micOscLoop);
    if (!micAnalyser) return;
    const buf = new Float32Array(micAnalyser.fftSize);
    micAnalyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const db  = rms > 1e-9 ? 20 * Math.log10(rms) : -100;
    setVal('mic', 'rms', db, 1);

    const cv = document.getElementById('scv-mic');
    if (!cv) return;
    const W = cv.offsetWidth, H = cv.offsetHeight;
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#111'; cx.fillRect(0, 0, W, H);
    cx.strokeStyle = '#1e1e1e'; cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(0, H/2); cx.lineTo(W, H/2); cx.stroke();
    cx.strokeStyle = 'rgba(126,247,192,0.7)'; cx.lineWidth = 1.2;
    cx.beginPath();
    const step = W / buf.length;
    for (let i = 0; i < buf.length; i++) {
      const x = i * step, y = (1 - (buf[i] + 1) / 2) * H;
      i === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
    }
    cx.stroke();
  }

  let micLastFft = 0;
  function micFftLoop() {
    micFftRaf = requestAnimationFrame(micFftLoop);
    if (!micAnalyser || !micCtx) return;
    const now = performance.now();
    if (now - micLastFft < 100) return;
    micLastFft = now;
    const freq = new Float32Array(micAnalyser.frequencyBinCount);
    micAnalyser.getFloatFrequencyData(freq);
    let pk = 0;
    for (let i = 1; i < freq.length; i++) if (freq[i] > freq[pk]) pk = i;
    const hz = pk * micCtx.sampleRate / micFftSize;
    setVal('mic', 'pk',   hz,       1);
    setVal('mic', 'pkdb', freq[pk], 1);
  }

  document.getElementById('stog-mic').addEventListener('change', async e => {
    if (e.target.checked) {
      if (!navigator.mediaDevices?.getUserMedia) { setStatus('mic','✗ 不支援',false); e.target.checked=false; return; }
      try {
        micStream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micCtx      = new (window.AudioContext || window.webkitAudioContext)();
        micAnalyser = micCtx.createAnalyser();
        micAnalyser.fftSize = micFftSize;
        micAnalyser.smoothingTimeConstant = 0.8;
        micCtx.createMediaStreamSource(micStream).connect(micAnalyser);
        setVal('mic', 'sr', micCtx.sampleRate, 0);
        setStatus('mic','✓ 運作中',true);
        micOscLoop(); micFftLoop();
      } catch(err) { setStatus('mic','✗ '+err.message,false); e.target.checked=false; }
    } else {
      cancelAnimationFrame(micRaf); cancelAnimationFrame(micFftRaf);
      micStream?.getTracks().forEach(t => t.stop());
      micCtx?.close();
      micCtx = micAnalyser = micStream = null;
      setStatus('mic','— 已停止',null);
    }
  });

  startRaf();

  return function cleanup() {
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    styleEl.remove();
    window.removeEventListener('devicemotion', onAccel);
    window.removeEventListener('devicemotion', onGyro);
    window.removeEventListener('deviceorientation', onOrient);
    magSensor?.stop();
    lightSensor?.stop();
    if (gpsWatch != null) { navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; }
    cancelAnimationFrame(micRaf); cancelAnimationFrame(micFftRaf);
    micCtx?.close();
    micStream?.getTracks().forEach(t => t.stop());
  };
}
