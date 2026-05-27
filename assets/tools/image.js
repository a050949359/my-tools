let _img      = null;
let _canvas   = null;
let _ctx      = null;
let _history  = [];        // dataURL stack for undo
let _mode     = 'crop';    // 'crop' | 'resize' | 'watermark'

// Crop interaction state
let _dragging     = false;
let _dragStart    = null;
let _cropRect     = null;   // {x,y,w,h} in canvas coords
let _dragAction   = null;   // 'draw' | 'move' | 'resize'
let _resizeHandle = null;   // 'tl'|'tc'|'tr'|'ml'|'mr'|'bl'|'bc'|'br'
let _rectOrigin   = null;   // {rect, mouse} snapshot when move/resize begins
let _cleanSnap    = null;   // ImageData of canvas after last confirmed operation

export function template() {
  return `
    <div id="editDrop" class="drop-zone">
      拖曳或點擊上傳圖片
      <input type="file" id="editInput" accept="image/*" hidden>
    </div>
    <div id="editShell" style="display:none;">
      <div class="edit-shell">

        <!-- 左側控制 -->
        <div class="edit-controls">
          <div class="edit-tabs">
            <button class="edit-tab active" data-tab="crop">裁切</button>
            <button class="edit-tab" data-tab="resize">縮放</button>
            <button class="edit-tab" data-tab="watermark">浮水印</button>
          </div>

          <!-- 裁切 -->
          <div class="edit-panel" id="panel-crop">
            <p class="muted" style="margin-bottom:10px;">在圖片上拖曳選取區域</p>
            <div class="grid-2">
              <div><label>X</label><input type="number" id="cropX" value="0" min="0"></div>
              <div><label>Y</label><input type="number" id="cropY" value="0" min="0"></div>
              <div><label>寬</label><input type="number" id="cropW" min="1"></div>
              <div><label>高</label><input type="number" id="cropH" min="1"></div>
            </div>
            <button class="btn-ghost" id="cropApplyBtn">套用裁切</button>
          </div>

          <!-- 縮放 -->
          <div class="edit-panel" id="panel-resize" style="display:none;">
            <label>比例</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <input type="range" id="resizeScale" min="5" max="300" step="1" value="100" style="flex:1;">
              <span id="resizeScaleVal" style="font-family:var(--mono);font-size:12px;width:38px;text-align:right;">100%</span>
            </div>
            <p id="resizeDims" class="muted" style="font-size:12px;font-family:var(--mono);margin:6px 0 0;"></p>
            <button class="btn-ghost" id="resizeApplyBtn">套用縮放</button>
          </div>

          <!-- 浮水印 -->
          <div class="edit-panel" id="panel-watermark" style="display:none;">
            <!-- 模式切換 -->
            <div class="edit-tabs" style="margin-bottom:10px;">
              <button class="edit-tab active" id="wmModePoint">單點</button>
              <button class="edit-tab" id="wmModeTile">平鋪</button>
            </div>
            <div><label>文字</label><input type="text" id="wmText" value="© 2025"></div>
            <div class="grid-2">
              <div><label>字體大小</label><input type="number" id="wmSize" value="32" min="8"></div>
              <div><label>顏色</label><input type="color" id="wmColor" value="#ffffff" style="height:40px;"></div>
            </div>
            <label>透明度</label>
            <div style="display:flex;align-items:center;gap:10px;">
              <input type="range" id="wmOpacity" min="0.05" max="1" step="0.05" value="0.6" style="flex:1;">
              <span id="wmOpacityVal" style="font-family:var(--mono);font-size:12px;width:30px;">0.6</span>
            </div>
            <!-- 單點：位置格 -->
            <div id="wmPointOpts">
              <label>位置</label>
              <div class="wm-pos-grid" id="wmPosGrid">
                <button class="wm-pos-btn" data-pos="tl">↖</button>
                <button class="wm-pos-btn" data-pos="tc">↑</button>
                <button class="wm-pos-btn" data-pos="tr">↗</button>
                <button class="wm-pos-btn" data-pos="ml">←</button>
                <button class="wm-pos-btn" data-pos="mc">＋</button>
                <button class="wm-pos-btn" data-pos="mr">→</button>
                <button class="wm-pos-btn" data-pos="bl">↙</button>
                <button class="wm-pos-btn" data-pos="bc">↓</button>
                <button class="wm-pos-btn active" data-pos="br">↘</button>
              </div>
            </div>
            <!-- 平鋪：角度 -->
            <div id="wmTileOpts" style="display:none;">
              <label>角度</label>
              <div style="display:flex;align-items:center;gap:8px;">
                <input type="range" id="wmAngle" min="-90" max="90" step="1" value="-30" style="flex:1;">
                <span id="wmAngleVal" style="font-family:var(--mono);font-size:12px;width:34px;text-align:right;">-30°</span>
              </div>
            </div>
            <button class="btn-ghost" id="wmApplyBtn">套用浮水印</button>
          </div>

          <!-- 操作 / 資訊 / 下載 -->
          <div class="edit-controls-bottom">
            <div class="edit-ops">
              <button class="btn-ghost" id="editUndo">↩ 復原</button>
              <button class="btn-ghost" id="editReset">重置</button>
            </div>
            <p id="editInfo" class="muted" style="font-size:12px;font-family:var(--mono);margin:0;"></p>
            <div style="margin-top:10px;">
              <label>格式</label>
              <select id="editFormat">
                <option value="image/png">PNG</option>
                <option value="image/jpeg">JPG</option>
                <option value="image/webp">WebP</option>
              </select>
            </div>
            <div id="editQualityWrap" style="display:none;margin-top:8px;">
              <label>品質</label>
              <div style="display:flex;align-items:center;gap:8px;">
                <input type="range" id="editQuality" min="0.1" max="1" step="0.05" value="0.85" style="flex:1;">
                <span id="editQualityVal" style="font-family:var(--mono);font-size:12px;width:30px;">0.85</span>
              </div>
            </div>
            <p id="editSizeInfo" class="muted" style="font-size:11px;font-family:var(--mono);margin:6px 0 0;"></p>
            <button id="editDownload" style="margin-top:6px;">下載</button>
            <button id="editCopy" style="margin-top:6px;">複製 Base64</button>
          </div>
        </div>

        <!-- 右側 Canvas -->
        <div class="edit-canvas-wrap">
          <canvas id="editCanvas"></canvas>
        </div>
      </div>
    </div>
  `;
}

export function init() {
  const drop  = document.getElementById('editDrop');
  const input = document.getElementById('editInput');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('dragover'); loadFile(e.dataTransfer.files[0]); });
  input.addEventListener('change', e => loadFile(e.target.files[0]));

  // Tabs
  document.querySelectorAll('.edit-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _mode = btn.dataset.tab;
      _cropRect = null;
      document.querySelectorAll('.edit-tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.edit-panel').forEach(p => p.style.display = 'none');
      document.getElementById(`panel-${_mode}`).style.display = 'block';
      if (_img) redraw();
    });
  });

  // Crop inputs sync → redraw
  ['cropX','cropY','cropW','cropH'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      if (!_img) return;
      _cropRect = {
        x: +document.getElementById('cropX').value,
        y: +document.getElementById('cropY').value,
        w: +document.getElementById('cropW').value,
        h: +document.getElementById('cropH').value,
      };
      redraw();
    });
  });

  document.getElementById('cropApplyBtn').addEventListener('click', applyCrop);

  // Resize scale slider
  document.getElementById('resizeScale').addEventListener('input', () => {
    const pct = +document.getElementById('resizeScale').value;
    document.getElementById('resizeScaleVal').textContent = `${pct}%`;
    if (_canvas) {
      const w = Math.max(1, Math.round(_canvas.width  * pct / 100));
      const h = Math.max(1, Math.round(_canvas.height * pct / 100));
      document.getElementById('resizeDims').textContent = `${w} × ${h} px`;
    }
  });
  document.getElementById('resizeApplyBtn').addEventListener('click', applyResize);

  // Watermark
  document.getElementById('wmOpacity').addEventListener('input', e => {
    document.getElementById('wmOpacityVal').textContent = parseFloat(e.target.value).toFixed(2);
  });
  document.getElementById('wmAngle').addEventListener('input', e => {
    document.getElementById('wmAngleVal').textContent = `${e.target.value}°`;
  });

  let _wmPos  = 'br';
  let _wmMode = 'point'; // 'point' | 'tile'

  // 模式切換
  document.getElementById('wmModePoint').addEventListener('click', () => {
    _wmMode = 'point';
    document.getElementById('wmModePoint').classList.add('active');
    document.getElementById('wmModeTile').classList.remove('active');
    document.getElementById('wmPointOpts').style.display = '';
    document.getElementById('wmTileOpts').style.display = 'none';
  });
  document.getElementById('wmModeTile').addEventListener('click', () => {
    _wmMode = 'tile';
    document.getElementById('wmModeTile').classList.add('active');
    document.getElementById('wmModePoint').classList.remove('active');
    document.getElementById('wmTileOpts').style.display = '';
    document.getElementById('wmPointOpts').style.display = 'none';
  });

  document.querySelectorAll('.wm-pos-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.pos === 'br') btn.classList.add('active');
    btn.addEventListener('click', () => {
      _wmPos = btn.dataset.pos;
      document.querySelectorAll('.wm-pos-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.getElementById('wmApplyBtn').addEventListener('click', () => {
    if (_wmMode === 'tile') applyTiledWatermark();
    else applyWatermark(_wmPos);
  });

  // Undo / Reset
  document.getElementById('editUndo').addEventListener('click', undo);
  document.getElementById('editReset').addEventListener('click', reset);

  // Format / Quality
  document.getElementById('editFormat').addEventListener('change', e => {
    const lossy = ['image/jpeg', 'image/webp'].includes(e.target.value);
    document.getElementById('editQualityWrap').style.display = lossy ? '' : 'none';
    updateSizeInfo();
  });
  document.getElementById('editQuality').addEventListener('input', e => {
    document.getElementById('editQualityVal').textContent =
      parseFloat(e.target.value).toFixed(2);
    updateSizeInfo();
  });

  // Download / Copy
  document.getElementById('editDownload').addEventListener('click', () => {
    const { dataURL, ext } = getOutput();
    const a = document.createElement('a');
    a.download = `edited.${ext}`;
    a.href = dataURL;
    a.click();
  });
  document.getElementById('editCopy').addEventListener('click', () => {
    const { dataURL } = getOutput();
    navigator.clipboard.writeText(dataURL).then(() => alert('Base64 已複製'));
  });

}

// ── Load ──────────────────────────────────────────────────────────────────────
function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) { alert('請選擇圖片'); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    _img = img;
    _history = [];
    _cropRect = null;
    _cleanSnap = null;
    initCanvas(img.naturalWidth, img.naturalHeight);
    _ctx.drawImage(img, 0, 0);
    saveClean();
    syncCropInputs(0, 0, img.naturalWidth, img.naturalHeight);
    document.getElementById('editDrop').style.display = 'none';
    document.getElementById('editShell').style.display = 'block';
    updateInfo();
    updateSizeInfo();
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function initCanvas(w, h) {
  _canvas = document.getElementById('editCanvas');
  _ctx    = _canvas.getContext('2d');
  _canvas.width  = w;
  _canvas.height = h;
  bindCanvasEvents();
}

// ── Canvas mouse events (crop) ────────────────────────────────────────────────
const HANDLES = ['tl','tc','tr','ml','mr','bl','bc','br'];
const HANDLE_CURSORS = {
  tl:'nwse-resize', tr:'nesw-resize', bl:'nesw-resize', br:'nwse-resize',
  tc:'ns-resize',   bc:'ns-resize',   ml:'ew-resize',   mr:'ew-resize',
};

function getHandlePoints(r) {
  return {
    tl:{x:r.x,       y:r.y},       tc:{x:r.x+r.w/2, y:r.y},
    tr:{x:r.x+r.w,   y:r.y},       ml:{x:r.x,       y:r.y+r.h/2},
    mr:{x:r.x+r.w,   y:r.y+r.h/2}, bl:{x:r.x,       y:r.y+r.h},
    bc:{x:r.x+r.w/2, y:r.y+r.h},   br:{x:r.x+r.w,   y:r.y+r.h},
  };
}

function hitTolerance() {
  const disp = _canvas.getBoundingClientRect();
  return Math.max(6, 10 * _canvas.width / disp.width);
}

function hitHandle(pt) {
  if (!_cropRect || !_cropRect.w || !_cropRect.h) return null;
  const tol = hitTolerance();
  const pts = getHandlePoints(_cropRect);
  for (const h of HANDLES) {
    if (Math.abs(pt.x - pts[h].x) <= tol && Math.abs(pt.y - pts[h].y) <= tol) return h;
  }
  return null;
}

function hitInside(pt) {
  if (!_cropRect || !_cropRect.w || !_cropRect.h) return false;
  const { x, y, w, h } = _cropRect;
  return pt.x > x && pt.x < x + w && pt.y > y && pt.y < y + h;
}

function bindCanvasEvents() {
  _canvas.addEventListener('mousedown', e => {
    if (_mode !== 'crop') return;
    const pt = canvasCoord(e);
    const handle = hitHandle(pt);
    if (handle) {
      _dragging = true; _dragAction = 'resize'; _resizeHandle = handle;
      _rectOrigin = { rect: { ..._cropRect }, mouse: pt };
    } else if (hitInside(pt)) {
      _dragging = true; _dragAction = 'move';
      _rectOrigin = { rect: { ..._cropRect }, mouse: pt };
    } else {
      _dragging = true; _dragAction = 'draw';
      _dragStart = pt;
      _cropRect  = { x: pt.x, y: pt.y, w: 0, h: 0 };
    }
  });

  _canvas.addEventListener('mousemove', e => {
    const pt = canvasCoord(e);

    if (!_dragging) {
      // update cursor on hover
      const h = hitHandle(pt);
      if (h) _canvas.style.cursor = HANDLE_CURSORS[h];
      else if (hitInside(pt)) _canvas.style.cursor = 'move';
      else _canvas.style.cursor = 'crosshair';
      return;
    }

    if (_dragAction === 'draw') {
      _cropRect = {
        x: Math.min(_dragStart.x, pt.x), y: Math.min(_dragStart.y, pt.y),
        w: Math.abs(pt.x - _dragStart.x), h: Math.abs(pt.y - _dragStart.y),
      };

    } else if (_dragAction === 'move') {
      const dx = pt.x - _rectOrigin.mouse.x;
      const dy = pt.y - _rectOrigin.mouse.y;
      const { rect } = _rectOrigin;
      _cropRect = {
        x: Math.max(0, Math.min(_canvas.width  - rect.w, rect.x + dx)),
        y: Math.max(0, Math.min(_canvas.height - rect.h, rect.y + dy)),
        w: rect.w, h: rect.h,
      };

    } else if (_dragAction === 'resize') {
      const { rect, mouse } = _rectOrigin;
      const dx = pt.x - mouse.x, dy = pt.y - mouse.y;
      let { x, y, w, h } = rect;

      if (_resizeHandle.includes('l')) { x = Math.min(rect.x + rect.w - 1, rect.x + dx); w = rect.w - (x - rect.x); }
      if (_resizeHandle.includes('r')) { w = Math.max(1, rect.w + dx); }
      if (_resizeHandle.includes('t')) { y = Math.min(rect.y + rect.h - 1, rect.y + dy); h = rect.h - (y - rect.y); }
      if (_resizeHandle.includes('b')) { h = Math.max(1, rect.h + dy); }
      // clamp to canvas
      x = Math.max(0, x); y = Math.max(0, y);
      w = Math.min(w, _canvas.width  - x);
      h = Math.min(h, _canvas.height - y);
      _cropRect = { x, y, w, h };
    }

    redraw();
    syncCropInputs(_cropRect.x, _cropRect.y, _cropRect.w, _cropRect.h);
  });

  const stopDrag = () => {
    _dragging = false; _dragAction = null;
    _resizeHandle = null; _rectOrigin = null;
  };
  _canvas.addEventListener('mouseup', stopDrag);
  _canvas.addEventListener('mouseleave', stopDrag);
}

function canvasCoord(e) {
  const rect  = _canvas.getBoundingClientRect();
  const scaleX = _canvas.width  / rect.width;
  const scaleY = _canvas.height / rect.height;
  return {
    x: Math.round(Math.max(0, Math.min(_canvas.width,  (e.clientX - rect.left) * scaleX))),
    y: Math.round(Math.max(0, Math.min(_canvas.height, (e.clientY - rect.top)  * scaleY))),
  };
}

// ── Clean snapshot ────────────────────────────────────────────────────────────
function saveClean() {
  _cleanSnap = _ctx.getImageData(0, 0, _canvas.width, _canvas.height);
}

// ── Redraw with crop overlay ──────────────────────────────────────────────────
function redraw() {
  if (_cleanSnap) {
    _ctx.putImageData(_cleanSnap, 0, 0);
  } else {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    _ctx.drawImage(_img, 0, 0, _canvas.width, _canvas.height);
  }

  if (_mode !== 'crop' || !_cropRect || !_cropRect.w || !_cropRect.h) return;
  const { x, y, w, h } = _cropRect;

  // 暗色遮罩
  _ctx.fillStyle = 'rgba(0,0,0,0.45)';
  _ctx.fillRect(0, 0, _canvas.width, y);
  _ctx.fillRect(0, y + h, _canvas.width, _canvas.height - y - h);
  _ctx.fillRect(0, y, x, h);
  _ctx.fillRect(x + w, y, _canvas.width - x - w, h);

  // 選框
  _ctx.strokeStyle = '#fff';
  _ctx.lineWidth = Math.max(1, _canvas.width / 500);
  _ctx.setLineDash([6, 3]);
  _ctx.strokeRect(x, y, w, h);
  _ctx.setLineDash([]);

  // Handle 控制點
  const hs = Math.max(4, _canvas.width / 120);
  _ctx.fillStyle = '#fff';
  _ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  _ctx.lineWidth = 1;
  for (const pt of Object.values(getHandlePoints(_cropRect))) {
    _ctx.fillRect(pt.x - hs / 2, pt.y - hs / 2, hs, hs);
    _ctx.strokeRect(pt.x - hs / 2, pt.y - hs / 2, hs, hs);
  }
}

// ── Operations ────────────────────────────────────────────────────────────────
function applyCrop() {
  const x = +document.getElementById('cropX').value;
  const y = +document.getElementById('cropY').value;
  const w = +document.getElementById('cropW').value;
  const h = +document.getElementById('cropH').value;
  if (!w || !h) { alert('請先選取裁切範圍'); return; }

  pushHistory();
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').drawImage(_canvas, x, y, w, h, 0, 0, w, h);

  _canvas.width = w; _canvas.height = h;
  _ctx.drawImage(tmp, 0, 0);
  saveClean();
  _cropRect = null;
  syncCropInputs(0, 0, w, h);
  updateInfo();
}

function applyResize() {
  const pct = +document.getElementById('resizeScale').value;
  const w = Math.max(1, Math.round(_canvas.width  * pct / 100));
  const h = Math.max(1, Math.round(_canvas.height * pct / 100));

  pushHistory();
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').drawImage(_canvas, 0, 0, w, h);

  _canvas.width = w; _canvas.height = h;
  _ctx.drawImage(tmp, 0, 0);
  saveClean();
  syncResizeInputs();
  updateInfo();
}

function applyWatermark(pos) {
  const text    = document.getElementById('wmText').value;
  const size    = +document.getElementById('wmSize').value || 32;
  const color   = document.getElementById('wmColor').value;
  const opacity = +document.getElementById('wmOpacity').value;
  if (!text) return;

  pushHistory();
  _ctx.save();
  _ctx.globalAlpha = opacity;
  _ctx.font = `bold ${size}px Geist, sans-serif`;
  _ctx.fillStyle = color;

  const pad = size * 0.8;
  const tw  = _ctx.measureText(text).width;
  const th  = size;
  const W   = _canvas.width, H = _canvas.height;

  const positions = {
    tl: [pad, pad + th],         tc: [W/2 - tw/2, pad + th],         tr: [W - pad - tw, pad + th],
    ml: [pad, H/2 + th/2],       mc: [W/2 - tw/2, H/2 + th/2],       mr: [W - pad - tw, H/2 + th/2],
    bl: [pad, H - pad],          bc: [W/2 - tw/2, H - pad],           br: [W - pad - tw, H - pad],
  };

  const [px, py] = positions[pos] || positions.br;
  _ctx.fillText(text, px, py);
  _ctx.restore();
  saveClean();
}

function applyTiledWatermark() {
  const text    = document.getElementById('wmText').value;
  const size    = +document.getElementById('wmSize').value || 32;
  const color   = document.getElementById('wmColor').value;
  const opacity = +document.getElementById('wmOpacity').value;
  const angle   = +document.getElementById('wmAngle').value * Math.PI / 180;
  if (!text) return;

  pushHistory();
  _ctx.save();
  _ctx.globalAlpha = opacity;
  _ctx.font = `bold ${size}px Geist, sans-serif`;
  _ctx.fillStyle = color;

  const tw      = _ctx.measureText(text).width;
  const gapX    = tw * 1.6;
  const gapY    = size * 3;
  const W = _canvas.width, H = _canvas.height;
  const diag    = Math.ceil(Math.sqrt(W * W + H * H));

  _ctx.translate(W / 2, H / 2);
  _ctx.rotate(angle);

  const cols = Math.ceil(diag / gapX) + 2;
  const rows = Math.ceil(diag / gapY) + 2;

  for (let r = -rows; r <= rows; r++) {
    for (let c = -cols; c <= cols; c++) {
      const x = c * gapX + (r % 2) * (gapX / 2);
      const y = r * gapY;
      _ctx.fillText(text, x - tw / 2, y + size / 3);
    }
  }

  _ctx.restore();
  saveClean();
}

// ── History ───────────────────────────────────────────────────────────────────
function pushHistory() {
  if (_history.length >= 10) _history.shift();
  if (_cleanSnap) {
    const tmp = document.createElement('canvas');
    tmp.width = _canvas.width; tmp.height = _canvas.height;
    tmp.getContext('2d').putImageData(_cleanSnap, 0, 0);
    _history.push(tmp.toDataURL());
  } else {
    _history.push(_canvas.toDataURL());
  }
}

function undo() {
  if (!_history.length) return;
  const url = _history.pop();
  const img = new Image();
  img.onload = () => {
    _cropRect = null;
    _canvas.width  = img.naturalWidth;
    _canvas.height = img.naturalHeight;
    _ctx.drawImage(img, 0, 0);
    saveClean();
    syncCropInputs(0, 0, img.naturalWidth, img.naturalHeight);
    syncResizeInputs(img.naturalWidth, img.naturalHeight);
    updateInfo();
  };
  img.src = url;
}

export function reset() {
  if (!_img) return;
  _history = [];
  _cropRect = null;
  _canvas.width  = _img.naturalWidth;
  _canvas.height = _img.naturalHeight;
  _ctx.drawImage(_img, 0, 0);
  saveClean();
  syncCropInputs(0, 0, _img.naturalWidth, _img.naturalHeight);
  syncResizeInputs(_img.naturalWidth, _img.naturalHeight);
  updateInfo();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function syncCropInputs(x, y, w, h) {
  document.getElementById('cropX').value = Math.round(x);
  document.getElementById('cropY').value = Math.round(y);
  document.getElementById('cropW').value = Math.round(w);
  document.getElementById('cropH').value = Math.round(h);
}

function syncResizeInputs() {
  document.getElementById('resizeScale').value = 100;
  document.getElementById('resizeScaleVal').textContent = '100%';
  if (_canvas) {
    document.getElementById('resizeDims').textContent =
      `${_canvas.width} × ${_canvas.height} px`;
  }
}

function updateInfo() {
  document.getElementById('editInfo').textContent =
    `${_canvas.width} × ${_canvas.height} px`;
  if (_canvas) updateSizeInfo();
}

function updateSizeInfo() {
  if (!_canvas) return;
  const fmt = b => b < 1024 * 1024
    ? `${(b / 1024).toFixed(1)} KB`
    : `${(b / 1024 / 1024).toFixed(2)} MB`;

  const pngURL  = _canvas.toDataURL('image/png');
  const pngBytes = Math.round((pngURL.length - pngURL.indexOf(',') - 1) * 3 / 4);

  const { dataURL, ext } = getOutput();
  const outBytes = Math.round((dataURL.length - dataURL.indexOf(',') - 1) * 3 / 4);

  const format = document.getElementById('editFormat').value;
  const label  = format === 'image/png' ? 'PNG' : ext.toUpperCase();

  document.getElementById('editSizeInfo').textContent =
    format === 'image/png'
      ? `PNG ${fmt(pngBytes)}`
      : `PNG ${fmt(pngBytes)} → ${label} ${fmt(outBytes)}`;
}

function getOutput() {
  const format  = document.getElementById('editFormat').value;
  const quality = parseFloat(document.getElementById('editQuality').value);
  const lossy   = ['image/jpeg', 'image/webp'].includes(format);
  const dataURL = _canvas.toDataURL(format, lossy ? quality : undefined);
  const extMap  = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  return { dataURL, ext: extMap[format] || 'png' };
}

