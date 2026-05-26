let dataURL = '';

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
  document.getElementById('qrGenBtn').addEventListener('click', generate);
  document.getElementById('qrDownloadBtn').addEventListener('click', download);
  document.getElementById('qrCopyBtn').addEventListener('click', copy);
}

function generate() {
  const text = document.getElementById('qrInput').value.trim();
  const size = parseInt(document.getElementById('qrSize').value);
  const level = document.getElementById('qrLevel').value;
  const resultDiv = document.getElementById('qrResult');
  const actionsDiv = document.getElementById('qrActions');
  if (!text) { alert('請輸入要產生 QR Code 的文字'); return; }
  resultDiv.innerHTML = ''; actionsDiv.style.display = 'none';

  const tmp = document.createElement('div');
  tmp.style.display = 'none';
  document.body.appendChild(tmp);
  const lvl = { L: QRCode.CorrectLevel.L, M: QRCode.CorrectLevel.M, Q: QRCode.CorrectLevel.Q, H: QRCode.CorrectLevel.H };
  new QRCode(tmp, { text, width: size, height: size, colorDark: '#000', colorLight: '#fff', correctLevel: lvl[level] });

  setTimeout(() => {
    try {
      const canvas = tmp.querySelector('canvas');
      const img = tmp.querySelector('img');
      if (!canvas && !img) throw new Error('無法找到生成的 QR Code');
      dataURL = canvas ? canvas.toDataURL('image/png') : img.src;
      const el = document.createElement('img');
      el.src = dataURL; el.style.maxWidth = '100%'; el.style.border = '1px solid #ccc';
      resultDiv.appendChild(el);
      actionsDiv.style.display = 'block';
    } catch (e) { resultDiv.innerHTML = '生成失敗：' + e.message; }
    document.body.removeChild(tmp);
  }, 100);
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
