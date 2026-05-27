let dataURL = '';
let iconFile = null;

function loadLib() {
  if (typeof QRCode !== 'undefined') return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/qrcode.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

export function template() {
  return `
    <p class="muted">可選尺寸與容錯級別，產生後可下載或複製 Base64。</p>
    <div><label>文字/網址:</label>
      <textarea id="qrInput" placeholder="輸入要產生 QR Code 的文字或網址" rows="3"></textarea>
    </div>
    <div class="grid-2">
      <div><label>尺寸:</label>
        <select id="qrSize">
          <option value="256">256x256</option>
          <option value="512" selected>512x512</option>
          <option value="1024">1024x1024</option>
        </select>
      </div>
      <div><label>容錯等級:</label>
        <select id="qrLevel">
          <option value="L">L (低)</option>
          <option value="M" selected>M (中)</option>
          <option value="Q">Q (高)</option>
          <option value="H">H (最高)</option>
        </select>
      </div>
    </div>
    <div><label>中央 Icon（選填，自動升為容錯 H）:</label>
      <div id="iconDropZone" class="drop-zone" style="padding:16px;">
        拖曳或點擊上傳 Icon（PNG / JPG / SVG）
        <input type="file" id="iconInput" accept="image/*" hidden>
      </div>
      <p class="muted" style="margin:6px 0 0;font-size:12px;">建議使用正方形圖片，非正方形可能會變形，尺寸上限 512×512。</p>
      <div id="iconPreviewWrap" style="display:none;margin-top:8px;display:none;align-items:center;gap:10px;">
        <img id="iconPreview" style="width:48px;height:48px;object-fit:contain;border:1px solid #e0c0b1;border-radius:8px;">
        <button id="iconClearBtn" style="margin-top:0;background:#f4f2fd;color:#1a1b22;font-weight:500;padding:6px 12px;font-size:13px;">移除 Icon</button>
      </div>
    </div>
    <button id="qrGenBtn">生成 QR Code</button>
    <div id="qrResult" style="text-align:center;margin-top:12px;"></div>
    <div id="qrActions" style="display:none;margin-top:1rem;">
      <div class="button-row">
        <button id="qrDownloadBtn">下載 QR Code</button>
        <button id="qrCopyBtn">複製 Base64</button>
      </div>
    </div>
  `;
}

export async function init() {
  await loadLib();
  iconFile = null;

  const iconDrop  = document.getElementById('iconDropZone');
  const iconInput = document.getElementById('iconInput');

  iconDrop.addEventListener('click', () => iconInput.click());
  iconDrop.addEventListener('dragover', e => { e.preventDefault(); iconDrop.classList.add('dragover'); });
  iconDrop.addEventListener('dragleave', () => iconDrop.classList.remove('dragover'));
  iconDrop.addEventListener('drop', e => { e.preventDefault(); iconDrop.classList.remove('dragover'); setIcon(e.dataTransfer.files[0]); });
  iconInput.addEventListener('change', e => setIcon(e.target.files[0]));
  document.getElementById('iconClearBtn').addEventListener('click', clearIcon);

  document.getElementById('qrGenBtn').addEventListener('click', generate);
  document.getElementById('qrDownloadBtn').addEventListener('click', download);
  document.getElementById('qrCopyBtn').addEventListener('click', copy);
}

const ICON_MAX_PX = 512;

function setIcon(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (img.naturalWidth > ICON_MAX_PX || img.naturalHeight > ICON_MAX_PX) {
      URL.revokeObjectURL(url);
      alert(`Icon 尺寸過大（${img.naturalWidth}×${img.naturalHeight}），請使用 ${ICON_MAX_PX}×${ICON_MAX_PX} 以內的圖片。`);
      return;
    }
    iconFile = file;
    document.getElementById('iconPreview').src = url;
    document.getElementById('iconPreviewWrap').style.display = 'flex';
    // 自動升容錯至 H
    const lvlEl = document.getElementById('qrLevel');
    if (lvlEl.value !== 'H') lvlEl.value = 'H';
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('無法讀取圖片'); };
  img.src = url;
}

function clearIcon() {
  iconFile = null;
  document.getElementById('iconInput').value = '';
  document.getElementById('iconPreview').src = '';
  document.getElementById('iconPreviewWrap').style.display = 'none';
}

function generate() {
  const text = document.getElementById('qrInput').value.trim();
  const size  = parseInt(document.getElementById('qrSize').value);
  const level = document.getElementById('qrLevel').value;
  const resultDiv  = document.getElementById('qrResult');
  const actionsDiv = document.getElementById('qrActions');
  if (!text) { alert('請輸入要產生 QR Code 的文字'); return; }
  resultDiv.innerHTML = '生成中…'; actionsDiv.style.display = 'none';

  const tmp = document.createElement('div');
  tmp.style.display = 'none';
  document.body.appendChild(tmp);
  const lvl = { L: QRCode.CorrectLevel.L, M: QRCode.CorrectLevel.M, Q: QRCode.CorrectLevel.Q, H: QRCode.CorrectLevel.H };
  new QRCode(tmp, { text, width: size, height: size, colorDark: '#000', colorLight: '#fff', correctLevel: lvl[level] });

  setTimeout(() => {
    try {
      const canvas = tmp.querySelector('canvas');
      const img    = tmp.querySelector('img');
      if (!canvas && !img) throw new Error('無法找到生成的 QR Code');

      // 取得原始 QR dataURL
      const qrDataURL = canvas ? canvas.toDataURL('image/png') : img.src;

      if (iconFile) {
        overlayIcon(qrDataURL, size, iconFile)
          .then(result => { dataURL = result; showResult(resultDiv, actionsDiv); })
          .catch(e => { resultDiv.innerHTML = '疊加 Icon 失敗：' + e.message; });
      } else {
        dataURL = qrDataURL;
        showResult(resultDiv, actionsDiv);
      }
    } catch (e) { resultDiv.innerHTML = '生成失敗：' + e.message; }
    document.body.removeChild(tmp);
  }, 100);
}

function overlayIcon(qrDataURL, size, file) {
  return new Promise((resolve, reject) => {
    const iconURL = URL.createObjectURL(file);
    const qrImg   = new Image();
    const iconImg = new Image();
    let loaded = 0;

    const onLoad = () => {
      if (++loaded < 2) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');

        // 畫 QR Code
        ctx.drawImage(qrImg, 0, 0, size, size);

        // Icon 佔 QR 的 22%，外圈留白圓角背景
        const iconSize   = Math.round(size * 0.22);
        const padding    = Math.round(iconSize * 0.15);
        const boxSize    = iconSize + padding * 2;
        const x = Math.round((size - boxSize) / 2);
        const y = Math.round((size - boxSize) / 2);
        const radius = Math.round(boxSize * 0.18);

        // 白色圓角背景
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(x, y, boxSize, boxSize, radius);
        ctx.fill();

        // Icon 置中
        ctx.drawImage(iconImg, x + padding, y + padding, iconSize, iconSize);

        URL.revokeObjectURL(iconURL);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) { reject(e); }
    };

    qrImg.onload  = onLoad;
    iconImg.onload = onLoad;
    qrImg.onerror  = () => reject(new Error('QR 圖片載入失敗'));
    iconImg.onerror = () => reject(new Error('Icon 載入失敗'));
    qrImg.src  = qrDataURL;
    iconImg.src = iconURL;
  });
}

function showResult(resultDiv, actionsDiv) {
  resultDiv.innerHTML = '';
  const el = document.createElement('img');
  el.src = dataURL; el.style.maxWidth = '100%'; el.style.border = '1px solid #e0c0b1'; el.style.borderRadius = '8px';
  resultDiv.appendChild(el);
  actionsDiv.style.display = 'block';
}

function download() {
  if (!dataURL) return;
  const size = document.getElementById('qrSize').value;
  const a = document.createElement('a');
  a.download = `qrcode_${size}x${size}.png`; a.href = dataURL; a.click();
}

function copy() {
  if (!dataURL) return;
  navigator.clipboard.writeText(dataURL)
    .then(() => alert('QR Code Base64 已複製'))
    .catch(() => { fallbackCopy(dataURL); alert('QR Code Base64 已複製'); });
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  document.execCommand('copy'); document.body.removeChild(ta);
}
