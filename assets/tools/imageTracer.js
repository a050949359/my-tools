// 圖片 → SVG 描邊（ImageTracer.js，延遲載入）
// 把點陣圖向量化成可縮放 SVG；色塊分明的圖（logo / 圖示 / 扁平插圖）效果最佳。

const MAX_DIM = 1200;          // 過大圖先縮，避免描邊卡 UI
const PRESETS = ['default', 'posterized2', 'detailed', 'smoothed', 'grayscale', 'artistic1'];

let lastSVG = '';              // 供下載 / 複製
let srcImageData = null;       // 目前載入圖的 ImageData
let srcDataURL = '';           // 原圖 dataURL（交接給熱區工具做「原圖內嵌版」）
let downscaled = false;

function loadLib() {
  if (typeof ImageTracer !== 'undefined') return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/imagetracer.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// 保留 width/height（預設尺寸）再補 viewBox（可縮放、預覽與原圖一致、便於疊圖對齊）
function addViewBox(svgStr) {
  const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) return svgStr;   // 解析失敗就原樣回傳
  if (!svg.getAttribute('viewBox')) {
    const w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
    if (w > 0 && h > 0) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  return new XMLSerializer().serializeToString(svg);
}

export function template() {
  return `
    <style>
      #itRoot { display:flex; flex-direction:column; gap:.9rem; }
      #itRoot .it-controls label { font-size:.78rem; color:var(--on-surface-variant); }
      #itRoot .it-range { display:flex; flex-direction:column; gap:4px; }
      #itRoot .it-range .it-val { font-family:var(--mono); color:var(--primary); font-weight:600; }
      #itRoot input[type=range] { width:100%; accent-color:var(--primary); }
      #itCompare { display:grid; grid-template-columns:1fr 1fr; gap:.8rem; }
      #itCompare figure { margin:0; }
      #itCompare figcaption { font-size:.72rem; color:var(--on-surface-variant); margin-bottom:4px; }
      #itCompare .it-box {
        background:var(--surface-low); border:1px solid var(--outline-variant);
        border-radius:8px; min-height:160px; display:flex; align-items:center; justify-content:center;
        overflow:auto; padding:6px;
      }
      #itCompare .it-box img, #itCompare .it-box svg { max-width:100%; max-height:380px; height:auto; display:block; }
      #itStats { font-size:.8rem; color:var(--on-surface-variant); font-family:var(--mono); }
      @media (max-width:720px){ #itCompare { grid-template-columns:1fr; } }
    </style>
    <div id="itRoot">
      <p class="muted">上傳點陣圖（PNG / JPG / WebP…），用 <strong>ImageTracer</strong> 描邊轉成可縮放 SVG。色塊分明的圖（logo、圖示、扁平插圖）效果最好；照片類向量化先天有限。</p>

      <div id="itDropZone" class="drop-zone">
        <span id="itDropMsg">拖曳圖片到這裡，或點擊選擇檔案</span>
        <input type="file" id="itFileInput" accept="image/*" hidden>
      </div>

      <div class="grid-4 it-controls">
        <div>
          <label>預設風格</label>
          <select id="itPreset">
            <option value="custom">自訂（用下方滑桿）</option>
            ${PRESETS.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <div class="it-range">
          <label>色數 numberofcolors <span class="it-val" id="itColorsVal">16</span></label>
          <input type="range" id="itColors" min="2" max="64" value="16">
        </div>
        <div class="it-range">
          <label>去躁 pathomit <span class="it-val" id="itOmitVal">8</span></label>
          <input type="range" id="itOmit" min="0" max="40" value="8">
        </div>
        <div class="it-range">
          <label>模糊 blurradius <span class="it-val" id="itBlurVal">0</span></label>
          <input type="range" id="itBlur" min="0" max="10" value="0">
        </div>
      </div>

      <button id="itRunBtn" data-primary>描邊轉換</button>

      <div id="itResult" hidden>
        <div id="itStats"></div>
        <div id="itCompare">
          <figure><figcaption>原圖</figcaption><div class="it-box"><img id="itOrig" alt=""></div></figure>
          <figure><figcaption>SVG 描邊結果</figcaption><div class="it-box" id="itSvgBox"></div></figure>
        </div>
        <div class="button-row" style="margin-top:.8rem;">
          <button id="itDownload">下載 SVG</button>
          <button id="itCopy">複製 SVG 原始碼</button>
          <button id="itToHotspot" class="btn-ghost">→ 加互動連結</button>
        </div>
      </div>
    </div>
  `;
}

export function init() {
  lastSVG = ''; srcImageData = null; downscaled = false;

  const $ = id => document.getElementById(id);
  const dropZone = $('itDropZone'), fileInput = $('itFileInput');
  const presetSel = $('itPreset');

  // 滑桿即時顯示數值
  const bind = (rangeId, valId) => {
    const r = $(rangeId), v = $(valId);
    r.addEventListener('input', () => { v.textContent = r.value; presetSel.value = 'custom'; toggleRanges(); });
  };
  bind('itColors', 'itColorsVal'); bind('itOmit', 'itOmitVal'); bind('itBlur', 'itBlurVal');

  // 選了命名預設 → 停用滑桿（改用預設內建參數）
  function toggleRanges() {
    const custom = presetSel.value === 'custom';
    ['itColors', 'itOmit', 'itBlur'].forEach(id => { $(id).disabled = !custom; });
  }
  presetSel.addEventListener('change', toggleRanges);
  toggleRanges();

  // 上傳
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); loadFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', e => loadFile(e.target.files[0]));

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) { alert('請選擇圖片檔'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // 過大先等比縮，避免描邊太慢
        let w = img.width, h = img.height; downscaled = false;
        const m = Math.max(w, h);
        if (m > MAX_DIM) { const k = MAX_DIM / m; w = Math.round(w * k); h = Math.round(h * k); downscaled = true; }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        srcImageData = ctx.getImageData(0, 0, w, h);
        srcDataURL = reader.result;
        $('itOrig').src = reader.result;
        $('itDropMsg').textContent = `已載入：${file.name}（${img.width}×${img.height}${downscaled ? ` → 縮至 ${w}×${h}` : ''}）`;
      };
      img.onerror = () => alert('圖片載入失敗');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  $('itRunBtn').addEventListener('click', convert);
  $('itDownload').addEventListener('click', download);
  $('itCopy').addEventListener('click', copy);
  $('itToHotspot').addEventListener('click', () => {
    if (!lastSVG) { alert('請先描邊產生 SVG'); return; }
    try {
      sessionStorage.setItem('hs-handoff-svg', lastSVG);            // 描邊 SVG(編輯用)
      sessionStorage.setItem('hs-handoff-img', srcDataURL || '');   // 原圖(原圖內嵌版用)
      location.hash = 'imageHotspot';
    } catch (e) {
      console.error(e);
      sessionStorage.removeItem('hs-handoff-svg'); sessionStorage.removeItem('hs-handoff-img');
      alert('圖太大,無法透過瀏覽器暫存交接,請改用「複製 SVG 原始碼」到熱區工具貼上(原圖內嵌版則需另存)。');
    }
  });

  async function convert() {
    if (!srcImageData) { alert('請先上傳圖片'); return; }
    const btn = $('itRunBtn'); const old = btn.textContent;
    btn.disabled = true; btn.textContent = '描邊中…';
    try {
      await loadLib();
      if (typeof ImageTracer === 'undefined') { alert('ImageTracer 函式庫載入失敗'); return; }

      const preset = presetSel.value;
      const options = preset === 'custom'
        ? { numberofcolors: +$('itColors').value, pathomit: +$('itOmit').value, blurradius: +$('itBlur').value }
        : preset;

      // 用 setTimeout 讓「描邊中…」先繪出，再跑同步重運算
      await new Promise(r => setTimeout(r, 20));
      const td = ImageTracer.imagedataToTracedata(srcImageData, options);
      // 傳同一份 options 給 getsvgstring:內部會 checkoptions() 解析字串預設並補預設值，
      // 才能套用預設風格的 SVG 渲染參數（strokewidth 等）；td 本身不帶 options。
      lastSVG = addViewBox(ImageTracer.getsvgstring(td, options));

      const paths = (lastSVG.match(/<path/g) || []).length;
      const layers = td.layers ? td.layers.length : 0;
      const kb = (new Blob([lastSVG]).size / 1024).toFixed(1);
      $('itStats').textContent = `色彩層 ${layers}　·　路徑 ${paths}　·　SVG ${kb} KB`;
      $('itSvgBox').innerHTML = lastSVG;       // 來源為本地函式庫處理使用者自有圖，非外部 HTML
      $('itResult').hidden = false;
    } catch (e) {
      console.error(e); alert('描邊失敗：' + (e && e.message || e));
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }

  function download() {
    if (!lastSVG) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lastSVG], { type: 'image/svg+xml' }));
    a.download = 'traced.svg'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function copy() {
    if (!lastSVG) return;
    const done = () => alert('SVG 原始碼已複製');
    (navigator.clipboard?.writeText(lastSVG) ?? Promise.reject())
      .then(done)
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = lastSVG; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta); done();
      });
  }
}

export function reset() {
  const $ = id => document.getElementById(id);
  lastSVG = ''; srcImageData = null; srcDataURL = '';
  if ($('itResult')) $('itResult').hidden = true;
  if ($('itSvgBox')) $('itSvgBox').innerHTML = '';
  if ($('itOrig')) $('itOrig').src = '';
  if ($('itStats')) $('itStats').textContent = '';
  if ($('itDropMsg')) $('itDropMsg').textContent = '拖曳圖片到這裡，或點擊選擇檔案';
  if ($('itPreset')) $('itPreset').value = 'custom';
  // 滑桿數值、顯示文字、停用狀態一併還原初始值
  const defaults = { itColors: '16', itOmit: '8', itBlur: '0' };
  Object.entries(defaults).forEach(([id, val]) => {
    const input = $(id);
    if (input) { input.value = val; input.disabled = false; }
    const label = $(id + 'Val');
    if (label) label.textContent = val;
  });
}
