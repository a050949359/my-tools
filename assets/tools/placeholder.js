let _dataURL = '';

export function template() {
  return `
    <p class="muted">快速產生展示用占位圖，可直接下載或複製資料 URL。</p>
    <div class="grid-4">
      <div><label>寬度 (px):</label><input type="number" id="phWidth" value="600"></div>
      <div><label>高度 (px):</label><input type="number" id="phHeight" value="200"></div>
      <div><label>背景色:</label><input type="color" id="phBg" value="#cccccc" style="height:40px;"></div>
      <div><label>文字色:</label><input type="color" id="phColor" value="#000000" style="height:40px;"></div>
    </div>
    <div><label>文字:</label><input type="text" id="phText" value="600x200"></div>
    <div><label>檔案類型:</label>
      <select id="phFormat">
        <option value="png">PNG</option>
        <option value="jpeg">JPG</option>
        <option value="webp">WebP</option>
      </select>
    </div>
    <img id="phPreview" class="preview">
    <div class="button-row">
      <button id="phCopyBtn">複製 Base64</button>
      <button id="phDownloadBtn">下載圖片</button>
    </div>
  `;
}

export function init() {
  const inputs = ['phWidth', 'phHeight', 'phBg', 'phColor', 'phText', 'phFormat'];
  inputs.forEach(id => document.getElementById(id).addEventListener('input', generate));

  document.getElementById('phCopyBtn').addEventListener('click', copy);
  document.getElementById('phDownloadBtn').addEventListener('click', download);

  generate(); // 初始渲染
}

function build() {
  const w = parseInt(document.getElementById('phWidth').value) || 600;
  const h = parseInt(document.getElementById('phHeight').value) || 200;
  const txt = document.getElementById('phText').value || `${w}x${h}`;
  const bg = document.getElementById('phBg').value;
  const color = document.getElementById('phColor').value;
  const format = document.getElementById('phFormat').value;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = w; canvas.height = h;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.font = `${Math.min(w, h) / 10}px Arial, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, w / 2, h / 2);
  const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
  return { dataURL: canvas.toDataURL(mime, format === 'jpeg' ? 0.9 : undefined), format, w, h };
}

function generate() {
  const { dataURL } = build();
  _dataURL = dataURL;
  document.getElementById('phPreview').src = dataURL;
}

function copy() {
  if (!_dataURL) return;
  navigator.clipboard.writeText(_dataURL);
  alert('Base64 圖片數據已複製');
}

function download() {
  const { dataURL, format, w, h } = build();
  const a = document.createElement('a');
  a.download = `placeholder_${w}x${h}.${format === 'jpeg' ? 'jpg' : format}`;
  a.href = dataURL; a.click();
}
