// 精靈圖工作台：影片/幀序列 → 抽幀 → 白底去背 → 質心對位 → sprite sheet + CSS
// 全程純前端（canvas 像素運算），零外部函式庫。
// 設計給「AI 圖生影片 → 網站吉祥物精靈圖」流程：生成時刻意用白底，
// 這裡用白底 un-blend 反解 alpha（半透明光暈也能保留），不需 ML 去背模型。

let frames = [];        // { src: canvas(原始，最長邊 ≤1024), included: bool }
let cells = [];         // 管線輸出：每幀一個 cell canvas（同尺寸）
let cellW = 0, cellH = 0;
let videoFile = null;   // 保留原始影片檔，改抽幀數時重抽
let previewTimer = null;
let previewIdx = 0;
let previewDir = 1;
let pipelineTimer = null;
let extractTimer = null;
let extractionId = 0;  // 抽幀任務世代標記：慢任務完成時若已過期就丟棄，防競態

export function template() {
  return `
    <p class="muted">
      拖入一段短影片（AI 圖生影片產物）或多張同尺寸幀圖，抽幀 → 白底去背 → 對位 →
      打包成 sprite sheet，附 CSS <code>steps()</code> 片段。生成素材時請用<b>純白背景</b>，去背採白底反解，光暈的半透明會保留。
    </p>

    <div id="spDropZone" class="drop-zone">
      拖曳影片（mp4 / webm）或多張幀圖（PNG / JPG）到這裡，或點擊選擇檔案
      <input type="file" id="spFileInput" accept="video/*,image/*" multiple hidden>
    </div>

    <div id="spWork" style="display:none;">
      <div class="grid-4" style="margin-top:1rem;">
        <div id="spExtractWrap">
          <label>抽幀數: <span id="spCountVal">10</span></label>
          <input type="range" id="spCount" min="4" max="24" value="10">
        </div>
        <div>
          <label style="display:flex;align-items:center;gap:7px;">
            <input type="checkbox" id="spMatte" checked> 白底去背
          </label>
          <label style="display:flex;align-items:center;gap:7px;margin-top:6px;">
            <input type="checkbox" id="spAlign" checked> 質心對位（防漂移）
          </label>
        </div>
        <div>
          <label>去背白場（雜訊裁切）: <span id="spLoVal">0.04</span></label>
          <input type="range" id="spLo" min="0" max="0.3" step="0.01" value="0.04">
        </div>
        <div>
          <label>去背實心點（光暈保留）: <span id="spHiVal">0.5</span></label>
          <input type="range" id="spHi" min="0.1" max="1" step="0.05" value="0.5">
        </div>
      </div>

      <label style="margin-top:.5rem;">幀（點擊剔除爛幀，虛化 = 不輸出）:</label>
      <div id="spStrip" style="display:flex;gap:6px;overflow-x:auto;padding:6px 0;"></div>

      <div class="grid-4" style="margin-top:.5rem;">
        <div>
          <label>輸出格高:</label>
          <select id="spCellH">
            <option value="128">128 px</option>
            <option value="256" selected>256 px</option>
            <option value="512">512 px</option>
          </select>
        </div>
        <div>
          <label>邊距 (px):</label>
          <input type="number" id="spPad" value="8" min="0" max="64">
        </div>
        <div>
          <label>預覽 FPS: <span id="spFpsVal">10</span></label>
          <input type="range" id="spFps" min="2" max="30" value="10">
        </div>
        <div>
          <label style="display:flex;align-items:center;gap:7px;">
            <input type="checkbox" id="spPingpong"> 來回播放
          </label>
          <label style="margin-top:6px;">預覽底:</label>
          <select id="spBg">
            <option value="checker" selected>棋盤格</option>
            <option value="#1d2a22">深色</option>
            <option value="#f4f4ea">淺色</option>
          </select>
        </div>
      </div>

      <div style="text-align:center;margin-top:1rem;">
        <canvas id="spPreview" style="max-width:100%;border:1px solid var(--outline-variant);border-radius:8px;"></canvas>
        <p class="muted" id="spInfo"></p>
      </div>

      <div class="button-row">
        <button id="spSheetBtn" data-primary>下載 Sprite Sheet PNG</button>
        <button id="spCssBtn" class="btn-ghost">複製 CSS 片段</button>
        <button id="spJsonBtn" class="btn-ghost">下載 JSON metadata</button>
      </div>
    </div>
  `;
}

export async function init() {
  const dropZone = document.getElementById('spDropZone');
  const fileInput = document.getElementById('spFileInput');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); loadFiles(e.dataTransfer.files); });
  fileInput.addEventListener('change', e => loadFiles(e.target.files));

  const rerun = () => schedulePipeline();
  // 拖滑桿會連續觸發，抽幀又慢：debounce + 世代標記，只留最後一次的結果
  bindSlider('spCount', 'spCountVal', () => {
    if (!videoFile) return;
    clearTimeout(extractTimer);
    extractTimer = setTimeout(reExtract, 300);
  });
  bindSlider('spLo', 'spLoVal', rerun);
  bindSlider('spHi', 'spHiVal', rerun);
  bindSlider('spFps', 'spFpsVal', () => {});
  document.getElementById('spMatte').addEventListener('change', rerun);
  document.getElementById('spAlign').addEventListener('change', rerun);
  document.getElementById('spCellH').addEventListener('change', rerun);
  document.getElementById('spPad').addEventListener('change', rerun);
  document.getElementById('spPingpong').addEventListener('change', () => {});
  document.getElementById('spBg').addEventListener('change', () => {});

  document.getElementById('spSheetBtn').addEventListener('click', downloadSheet);
  document.getElementById('spCssBtn').addEventListener('click', copyCss);
  document.getElementById('spJsonBtn').addEventListener('click', downloadJson);

  startPreviewLoop();
  return () => {           // cleanup
    stopPreviewLoop();
    abortPending();
    frames = []; cells = []; videoFile = null;
  };
}

export function reset() {
  stopPreviewLoop();
  abortPending();
  frames = []; cells = []; videoFile = null; cellW = cellH = 0;
  document.getElementById('spWork').style.display = 'none';
  document.getElementById('spStrip').innerHTML = '';
  document.getElementById('spFileInput').value = '';
  startPreviewLoop();
}

// 讓進行中/排程中的非同步工作全部失效（切工具、重置、換檔案時呼叫）
function abortPending() {
  extractionId++;
  clearTimeout(extractTimer);
  clearTimeout(pipelineTimer);
}

async function reExtract() {
  const id = ++extractionId;
  try {
    const extracted = await extractFrames(videoFile, count());
    if (id !== extractionId) return; // 已有更新的任務或已重置，丟棄
    frames = extracted;
    renderStrip();
    schedulePipeline();
  } catch (err) {
    console.error(err);
    if (id === extractionId) alert('抽幀失敗：' + (err.message || '未知錯誤'));
  }
}

// ── 輸入 ─────────────────────────────────────────────────────────────────────

function count() { return parseInt(document.getElementById('spCount').value); }

async function loadFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;

  try {
    if (files[0].type.startsWith('video/')) {
      videoFile = files[0];
      const id = ++extractionId; // 換新檔案：讓進行中的舊抽幀失效
      const extracted = await extractFrames(videoFile, count());
      if (id !== extractionId) return;
      frames = extracted;
      document.getElementById('spExtractWrap').style.display = '';
    } else {
      videoFile = null;
      extractionId++; // 改餵圖片序列：同樣廢止進行中的影片抽幀
      document.getElementById('spExtractWrap').style.display = 'none';
      const imgs = files.filter(f => f.type.startsWith('image/'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (imgs.length < 2) { alert('幀序列請一次選擇至少 2 張圖片'); return; }
      frames = [];
      for (const f of imgs) frames.push({ src: await imageToCanvas(f), included: true });
    }
  } catch (err) {
    console.error(err);
    alert('讀取失敗：' + (err.message || '格式不支援'));
    return;
  }

  document.getElementById('spWork').style.display = 'block';
  renderStrip();
  schedulePipeline();
}

async function extractFrames(file, n) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  video.src = url;
  await new Promise((res, rej) => {
    video.onloadedmetadata = res;
    video.onerror = () => rej(new Error('影片載入失敗'));
  });
  // 部分瀏覽器 metadata 後尚不能 seek 繪圖，先等首幀可用；
  // 這裡也要掛 onerror，否則解碼失敗會讓 Promise 永遠懸置
  await new Promise((res, rej) => {
    if (video.readyState >= 2) return res();
    video.oncanplay = res;
    video.onerror = () => rej(new Error('影片解碼失敗'));
  });
  if (!isFinite(video.duration) || video.duration <= 0) {
    throw new Error('無法取得影片長度');
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const t = video.duration * i / n;
    await new Promise(res => { video.onseeked = res; video.currentTime = Math.min(t, video.duration - 0.05); });
    out.push({ src: frameToCanvas(video, video.videoWidth, video.videoHeight), included: true });
  }
  URL.revokeObjectURL(url);
  return out;
}

function imageToCanvas(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { res(frameToCanvas(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(file.name + ' 載入失敗')); };
    img.src = url;
  });
}

// 進場統一縮到最長邊 ≤1024：輸出格高上限 512，保留餘裕即可，處理管線快很多。
// w/h 可能為 0（影片未就緒、圖片損壞），夾到 ≥1 避免 0 尺寸 canvas 炸 drawImage
function frameToCanvas(source, w, h) {
  w = Math.max(1, w || 1); h = Math.max(1, h || 1);
  const scale = Math.min(1, 1024 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c;
}

// ── 幀列表 ───────────────────────────────────────────────────────────────────

function renderStrip() {
  const strip = document.getElementById('spStrip');
  strip.innerHTML = '';
  frames.forEach((f, i) => {
    const th = document.createElement('canvas');
    const s = 72 / f.src.height;
    th.width = Math.round(f.src.width * s); th.height = 72;
    th.getContext('2d').drawImage(f.src, 0, 0, th.width, th.height);
    th.style.cssText = `border-radius:6px;cursor:pointer;flex-shrink:0;border:2px solid var(--outline-variant);opacity:${f.included ? 1 : 0.25};`;
    th.title = `幀 ${i + 1}（點擊${f.included ? '剔除' : '恢復'}）`;
    th.addEventListener('click', () => {
      f.included = !f.included;
      th.style.opacity = f.included ? 1 : 0.25;
      schedulePipeline();
    });
    strip.appendChild(th);
  });
}

// ── 處理管線 ─────────────────────────────────────────────────────────────────

function schedulePipeline() {
  clearTimeout(pipelineTimer);
  pipelineTimer = setTimeout(runPipeline, 150);
}

function runPipeline() {
  const included = frames.filter(f => f.included);
  cells = []; cellW = cellH = 0;
  if (!included.length) { updateInfo(); return; }

  const matte = document.getElementById('spMatte').checked;
  const align = document.getElementById('spAlign').checked;
  const lo = parseFloat(document.getElementById('spLo').value);
  const hi = Math.max(parseFloat(document.getElementById('spHi').value), lo + 0.01);
  const targetH = parseInt(document.getElementById('spCellH').value);
  // pad 夾在格高一半以下，否則 targetH - pad*2 ≤ 0 會讓 scale 歸零炸 drawImage
  const rawPad = parseInt(document.getElementById('spPad').value) || 0;
  const pad = Math.min(Math.max(0, rawPad), Math.floor(targetH / 2) - 1);

  // 1) 去背 + 逐幀量測（bbox 與質心）
  const measured = included.map(f => {
    const c = document.createElement('canvas');
    c.width = f.src.width; c.height = f.src.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(f.src, 0, 0);
    const im = ctx.getImageData(0, 0, c.width, c.height);
    if (matte) whiteKey(im.data, lo, hi);
    const m = measure(im, c.width, c.height);
    ctx.putImageData(im, 0, 0);
    return { canvas: c, ...m };
  });

  // 2) 決定 cell 尺寸（原始像素座標系）
  //    對位：以質心為中心，取所有幀的最大半徑；不對位：取聯集 bbox
  let srcW, srcH;
  if (align) {
    let rx = 0, ry = 0;
    for (const m of measured) {
      rx = Math.max(rx, m.cx - m.x0, m.x1 - m.cx);
      ry = Math.max(ry, m.cy - m.y0, m.y1 - m.cy);
    }
    srcW = rx * 2; srcH = ry * 2;
  } else {
    const x0 = Math.min(...measured.map(m => m.x0));
    const y0 = Math.min(...measured.map(m => m.y0));
    const x1 = Math.max(...measured.map(m => m.x1));
    const y1 = Math.max(...measured.map(m => m.y1));
    srcW = x1 - x0; srcH = y1 - y0;
    measured.forEach(m => { m.cx = (x0 + x1) / 2; m.cy = (y0 + y1) / 2; }); // 共用中心
  }
  if (srcW < 2 || srcH < 2) { updateInfo(); return; }

  // 3) 縮放到輸出格高，逐幀以中心對齊畫入 cell
  const scale = (targetH - pad * 2) / srcH;
  cellH = targetH;
  cellW = Math.round(srcW * scale) + pad * 2;
  for (const m of measured) {
    const c = document.createElement('canvas');
    c.width = cellW; c.height = cellH;
    const ctx = c.getContext('2d');
    ctx.drawImage(
      m.canvas,
      cellW / 2 - m.cx * scale,
      cellH / 2 - m.cy * scale,
      m.canvas.width * scale,
      m.canvas.height * scale,
    );
    cells.push(c);
  }
  updateInfo();
}

// 白底 un-blend：假設像素 = 前景×α + 白×(1-α)，以 min(r,g,b) 反解 α，
// 再用 lo/hi 做 levels（lo 裁雜訊、hi 之上視為實心），最後還原前景色
function whiteKey(d, lo, hi) {
  for (let i = 0; i < d.length; i += 4) {
    const a = (255 - Math.min(d[i], d[i + 1], d[i + 2])) / 255;
    const t = Math.min(1, Math.max(0, (a - lo) / (hi - lo)));
    if (t <= 0) { d[i + 3] = 0; continue; }
    for (let k = 0; k < 3; k++) {
      d[i + k] = Math.min(255, Math.max(0, (d[i + k] - 255 * (1 - t)) / t));
    }
    d[i + 3] = Math.round(t * 255);
  }
}

// alpha 加權質心 + bbox（alpha > 5 才計入）
function measure(im, w, h) {
  const d = im.data;
  let sum = 0, sx = 0, sy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = d[(y * w + x) * 4 + 3];
      if (a < 6) continue;
      sum += a; sx += x * a; sy += y * a;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (!sum) return { cx: w / 2, cy: h / 2, x0: 0, y0: 0, x1: w, y1: h };
  return { cx: sx / sum, cy: sy / sum, x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

function updateInfo() {
  const info = document.getElementById('spInfo');
  info.textContent = cells.length
    ? `${cells.length} 幀 · 格 ${cellW}×${cellH} px · sheet ${cellW * cells.length}×${cellH} px`
    : '無可輸出的幀（全部被剔除或畫面為空）';
}

// ── 預覽 ─────────────────────────────────────────────────────────────────────

function startPreviewLoop() {
  stopPreviewLoop();
  const tick = () => {
    drawPreview();
    const fps = parseInt(document.getElementById('spFps')?.value || 10);
    previewTimer = setTimeout(tick, 1000 / fps);
  };
  tick();
}

function stopPreviewLoop() {
  clearTimeout(previewTimer);
  previewTimer = null;
}

function drawPreview() {
  const cvs = document.getElementById('spPreview');
  if (!cvs) return;
  if (!cells.length) { cvs.width = 0; cvs.height = 0; return; }

  if (document.getElementById('spPingpong').checked && cells.length > 1) {
    if (previewIdx + previewDir >= cells.length || previewIdx + previewDir < 0) previewDir *= -1;
    previewIdx += previewDir;
  } else {
    previewIdx = (previewIdx + 1) % cells.length;
  }
  const cell = cells[Math.min(previewIdx, cells.length - 1)];

  cvs.width = cell.width; cvs.height = cell.height;
  const ctx = cvs.getContext('2d');
  const bg = document.getElementById('spBg').value;
  if (bg === 'checker') {
    for (let y = 0; y < cvs.height; y += 16) {
      for (let x = 0; x < cvs.width; x += 16) {
        ctx.fillStyle = ((x + y) / 16) % 2 ? '#d5d5d5' : '#efefef';
        ctx.fillRect(x, y, 16, 16);
      }
    }
  } else {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cvs.width, cvs.height);
  }
  ctx.drawImage(cell, 0, 0);
}

// ── 匯出 ─────────────────────────────────────────────────────────────────────

function buildSheet() {
  if (!cells.length) { alert('尚無可輸出的幀'); return null; }
  const sheet = document.createElement('canvas');
  sheet.width = cellW * cells.length; sheet.height = cellH;
  const ctx = sheet.getContext('2d');
  cells.forEach((c, i) => ctx.drawImage(c, i * cellW, 0));
  return sheet;
}

function downloadSheet() {
  const sheet = buildSheet();
  if (!sheet) return;
  const a = document.createElement('a');
  a.download = `sprite-sheet-${cells.length}x-${cellW}x${cellH}.png`;
  a.href = sheet.toDataURL('image/png');
  a.click();
}

function copyCss() {
  if (!cells.length) { alert('尚無可輸出的幀'); return; }
  const n = cells.length;
  const fps = parseInt(document.getElementById('spFps').value);
  const pp = document.getElementById('spPingpong').checked;
  const css = `.sprite {
  width: ${cellW}px;
  height: ${cellH}px;
  background: url('sprite-sheet.png') 0 0 / ${cellW * n}px ${cellH}px no-repeat;
  animation: sprite-play ${(n / fps).toFixed(2)}s steps(${n}) infinite${pp ? ' alternate' : ''};
}
@keyframes sprite-play {
  to { background-position-x: ${-cellW * n}px; }
}`;
  navigator.clipboard.writeText(css)
    .then(() => alert('CSS 已複製'))
    .catch(() => alert('複製失敗，請手動複製主控台輸出\n\n' + css));
}

function downloadJson() {
  if (!cells.length) { alert('尚無可輸出的幀'); return; }
  const meta = {
    frames: cells.length,
    cellWidth: cellW,
    cellHeight: cellH,
    fps: parseInt(document.getElementById('spFps').value),
    pingpong: document.getElementById('spPingpong').checked,
    generator: 'my-tools sprite workbench',
  };
  const a = document.createElement('a');
  a.download = 'sprite-sheet.json';
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(meta, null, 2));
  a.click();
}

// ── 小工具 ───────────────────────────────────────────────────────────────────

function bindSlider(id, valId, onChange) {
  const el = document.getElementById(id);
  el.addEventListener('input', () => {
    document.getElementById(valId).textContent = el.value;
    onChange();
  });
}
