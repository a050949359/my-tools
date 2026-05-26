let heicFile = null;
let pngDataURL = '';
let detectedType = 'unknown';

function loadLib() {
  if (typeof heic2any !== 'undefined') return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/heic2any.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

export function template() {
  return `
    <p class="muted">支援上傳或拖曳 HEIC/HEIF，轉成 PNG 後可下載與複製 Base64。</p>
    <div id="heicDropZone" class="drop-zone">
      拖曳 HEIC 檔案到這裡，或點擊選擇檔案
      <input type="file" id="heicFileInput" accept=".heic,.heif,image/heic,image/heif" hidden>
    </div>
    <p id="heicStatus" class="muted">尚未選擇檔案</p>
    <div class="grid-2">
      <div><label>輸出品質 (0.1 ~ 1.0):</label>
        <input type="number" id="heicQuality" value="0.92" min="0.1" max="1" step="0.01">
      </div>
      <div style="display:flex;align-items:end;">
        <button id="heicConvertBtn">轉換為 PNG</button>
      </div>
    </div>
    <div id="heicPreviewContainer" style="text-align:center;margin-top:1rem;display:none;">
      <h4>預覽:</h4>
      <img id="heicPreview" class="preview" style="max-height:400px;">
    </div>
    <div id="heicActions" style="display:none;margin-top:1rem;">
      <div class="button-row">
        <button id="heicDownloadBtn">下載 PNG</button>
        <button id="heicCopyBtn">複製 Base64</button>
      </div>
    </div>
  `;
}

export async function init() {
  await loadLib();
  const dropZone = document.getElementById('heicDropZone');
  const fileInput = document.getElementById('heicFileInput');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
  document.getElementById('heicConvertBtn').addEventListener('click', convert);
  document.getElementById('heicDownloadBtn').addEventListener('click', download);
  document.getElementById('heicCopyBtn').addEventListener('click', copy);
}

async function handleFile(file) {
  if (!file) return;
  const name = (file.name || '').toLowerCase();
  if (!name.endsWith('.heic') && !name.endsWith('.heif') && file.type !== 'image/heic' && file.type !== 'image/heif') {
    alert('請選擇 HEIC/HEIF 檔案'); return;
  }
  heicFile = file;
  detectedType = await detectContainer(file);
  pngDataURL = '';
  document.getElementById('heicActions').style.display = 'none';
  document.getElementById('heicPreviewContainer').style.display = 'none';
  const kb = Math.round(file.size / 1024);
  document.getElementById('heicStatus').textContent =
    `已選擇：${file.name} (${kb} KB)，偵測格式：${detectedType}，正在轉換...`;
  convert();
}

async function convert() {
  if (!heicFile) { alert('請先選擇 HEIC/HEIF 檔案'); return; }
  const quality = Math.min(1, Math.max(0.1, parseFloat(document.getElementById('heicQuality').value) || 0.92));
  const status = document.getElementById('heicStatus');

  if (detectedType === 'jpeg' || detectedType === 'png') {
    try {
      status.textContent = `偵測到 ${detectedType.toUpperCase()}，直接轉為 PNG...`;
      await convertNative(heicFile, quality);
      status.textContent = '轉換完成，可下載 PNG 或複製 Base64。';
    } catch (e) {
      status.textContent = '原生轉換失敗。'; alert('HEIC 轉換失敗：' + e.message);
    }
    return;
  }

  try {
    const result = await heic2any({ blob: heicFile, toType: 'image/png', quality });
    const blob = Array.isArray(result) ? result[0] : result;
    const reader = new FileReader();
    reader.onload = () => {
      pngDataURL = reader.result;
      showPreview();
      status.textContent = '轉換完成，可下載 PNG 或複製 Base64。';
    };
    reader.readAsDataURL(blob);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg.includes('ERR_USER Image is already browser readable')) {
      try { await convertNative(heicFile, quality); status.textContent = '轉換完成。'; }
      catch (fe) { status.textContent = '轉換失敗。'; alert('HEIC 轉換失敗：' + fe.message); }
      return;
    }
    status.textContent = 'HEIC 轉換失敗。'; alert('HEIC 轉換失敗：' + msg);
  }
}

function convertNative(file, quality) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        pngDataURL = c.toDataURL('image/png', quality);
        showPreview();
        URL.revokeObjectURL(url); res();
      } catch (e) { URL.revokeObjectURL(url); rej(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('瀏覽器無法讀取該圖片資料')); };
    img.src = url;
  });
}

function showPreview() {
  document.getElementById('heicPreview').src = pngDataURL;
  document.getElementById('heicPreviewContainer').style.display = 'block';
  document.getElementById('heicActions').style.display = 'block';
}

async function detectContainer(file) {
  try {
    const b = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
    const s = Array.from(b).map(x => String.fromCharCode(x)).join('');
    if (s.includes('ftyp') && ['heic','heix','hevc','hevx','heim','heis','mif1','msf1'].some(t => s.includes(t))) return 'heic';
    return 'unknown';
  } catch (_) { return 'unknown'; }
}

function download() {
  if (!pngDataURL) { alert('請先完成轉換'); return; }
  const name = heicFile && heicFile.name ? heicFile.name.replace(/\.[^.]+$/, '') : 'heic_image';
  const a = document.createElement('a');
  a.download = `${name}.png`; a.href = pngDataURL; a.click();
}

function copy() {
  if (!pngDataURL) { alert('請先完成轉換'); return; }
  navigator.clipboard.writeText(pngDataURL)
    .then(() => alert('PNG Base64 已複製'))
    .catch(() => { fallbackCopy(pngDataURL); alert('PNG Base64 已複製'); });
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  document.execCommand('copy'); document.body.removeChild(ta);
}
