let pngDataURL = '';

export function template() {
  return `
    <p class="muted">支援貼上 SVG 代碼或上傳 SVG，轉成 PNG 後可下載與複製。</p>
    <div><label>SVG 內容:</label>
      <textarea id="svgInput" placeholder="貼入 SVG 代碼，或使用下方上傳 SVG 檔案" rows="8"></textarea>
    </div>
    <div id="svgDropZone" class="drop-zone">
      拖曳 SVG 檔案到這裡，或點擊選擇檔案
      <input type="file" id="svgFileInput" accept=".svg,image/svg+xml" hidden>
    </div>
    <div class="grid-4">
      <div><label>輸出寬度:</label><input type="number" id="svgWidth" value="800" min="1" max="4000"></div>
      <div><label>輸出高度:</label><input type="number" id="svgHeight" value="600" min="1" max="4000"></div>
      <div><label>背景色:</label><input type="color" id="svgBg" value="#ffffff" style="height:40px;"></div>
      <div style="display:flex;align-items:end;">
        <label style="display:flex;align-items:center;gap:7px;margin:0;">
          <input type="checkbox" id="svgTransparent" checked> 透明背景
        </label>
      </div>
    </div>
    <button id="svgConvertBtn" data-primary>轉換為 PNG</button>
    <div id="svgPreviewContainer" style="text-align:center;margin-top:1rem;display:none;">
      <h4>預覽:</h4>
      <img id="svgPreview" class="preview" style="max-height:400px;">
    </div>
    <div id="svgActions" style="display:none;margin-top:1rem;">
      <div class="button-row">
        <button id="svgDownloadBtn">下載 PNG</button>
        <button id="svgCopyBtn">複製 Base64</button>
      </div>
    </div>
  `;
}

export function init() {
  const dropZone = document.getElementById('svgDropZone');
  const fileInput = document.getElementById('svgFileInput');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); loadFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', e => loadFile(e.target.files[0]));
  document.getElementById('svgConvertBtn').addEventListener('click', convert);
  document.getElementById('svgDownloadBtn').addEventListener('click', download);
  document.getElementById('svgCopyBtn').addEventListener('click', copy);
}

function loadFile(file) {
  if (!file || file.type !== 'image/svg+xml') { alert('請選擇 SVG 檔案'); return; }
  const reader = new FileReader();
  reader.onload = () => { document.getElementById('svgInput').value = reader.result; };
  reader.readAsText(file);
}

// 純函式:不碰 DOM,失敗一律 throw(給 UI 的 convert() 和 headless 呼叫共用同一份邏輯)
function renderSvgToPng(svg, width, height, bg, transparent) {
  svg = (svg || '').trim();
  if (!svg) return Promise.reject(new Error('請輸入 SVG 代碼或上傳 SVG 檔案'));
  if (!svg.includes('<svg')) return Promise.reject(new Error('輸入的內容似乎不是有效的 SVG 代碼'));

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = width; canvas.height = height;
    if (!transparent) { ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height); }

    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(width / img.width, height / img.height);
      const sw = img.width * scale, sh = img.height * scale;
      ctx.drawImage(img, (width - sw) / 2, (height - sh) / 2, sw, sh);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG 載入失敗，請檢查 SVG 代碼是否正確')); };
    img.src = url;
  });
}

async function convert() {
  const svgCode = document.getElementById('svgInput').value;
  const w = parseInt(document.getElementById('svgWidth').value) || 800;
  const h = parseInt(document.getElementById('svgHeight').value) || 600;
  const bg = document.getElementById('svgBg').value;
  const transparent = document.getElementById('svgTransparent').checked;

  try {
    pngDataURL = await renderSvgToPng(svgCode, w, h, bg, transparent);
  } catch (e) {
    alert(e.message);
    return;
  }
  document.getElementById('svgPreview').src = pngDataURL;
  document.getElementById('svgPreviewContainer').style.display = 'block';
  document.getElementById('svgActions').style.display = 'block';
}

function download() {
  if (!pngDataURL) { alert('請先轉換 SVG'); return; }
  const w = document.getElementById('svgWidth').value;
  const h = document.getElementById('svgHeight').value;
  const a = document.createElement('a');
  a.download = `svg_to_png_${w}x${h}.png`; a.href = pngDataURL; a.click();
}

function copy() {
  if (!pngDataURL) { alert('請先轉換 SVG'); return; }
  navigator.clipboard.writeText(pngDataURL)
    .then(() => alert('PNG Base64 已複製'))
    .catch(() => { fallbackCopy(pngDataURL); alert('PNG Base64 已複製'); });
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  document.execCommand('copy'); document.body.removeChild(ta);
}
