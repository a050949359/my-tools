export function template() {
  return `
    <p class="muted">使用 Scalar API Reference（本地函式庫）渲染 OpenAPI / Swagger 文件，會在<b>新分頁</b>開啟完整文件頁面。可輸入規格網址，或直接貼上 JSON / YAML 內容；貼上的內容優先於網址。</p>
    <div class="grid-2">
      <div><label>OpenAPI 規格網址:</label>
        <input type="url" id="oaUrl" placeholder="https://example.com/openapi.json">
      </div>
      <div style="display:flex;align-items:end;">
        <label style="display:flex;align-items:center;gap:7px;margin:0;">
          <input type="checkbox" id="oaProxy" checked> 透過 Scalar CORS Proxy 讀取網址
        </label>
      </div>
    </div>
    <div><label>或貼上規格內容 (JSON / YAML):</label>
      <textarea id="oaContent" placeholder="貼入 OpenAPI JSON 或 YAML，或使用下方上傳檔案" rows="6" style="font-family:var(--mono);"></textarea>
    </div>
    <div id="oaDropZone" class="drop-zone">
      拖曳 .json / .yaml / .yml 檔案到這裡，或點擊選擇檔案
      <input type="file" id="oaFileInput" accept=".json,.yaml,.yml,application/json" hidden>
    </div>
    <div class="button-row">
      <button id="oaRenderBtn" data-primary>在新分頁開啟文件</button>
      <button id="oaExportBtn">⬇ 下載 HTML</button>
    </div>
  `;
}

export function init() {
  const dropZone = document.getElementById('oaDropZone');
  const fileInput = document.getElementById('oaFileInput');
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); loadFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', e => loadFile(e.target.files[0]));
  document.getElementById('oaRenderBtn').addEventListener('click', openViewer);
  document.getElementById('oaExportBtn').addEventListener('click', exportHtml);
}

export function reset() {
  document.getElementById('oaUrl').value = '';
  document.getElementById('oaContent').value = '';
}

// jsDelivr 上與本地 assets/scalar.standalone.min.js 相同版本，供匯出的獨立 HTML 使用
const SCALAR_CDN_URL = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.62.9/dist/browser/standalone.min.js';

function getConfig() {
  const url = document.getElementById('oaUrl').value.trim();
  const content = document.getElementById('oaContent').value.trim();
  if (!url && !content) { alert('請輸入規格網址，或貼上 / 上傳規格內容'); return null; }
  return content
    ? { content }
    : { url, ...(document.getElementById('oaProxy').checked ? { proxyUrl: 'https://proxy.scalar.com' } : {}) };
}

function buildHtml(libSrc, config) {
  // JSON 內嵌進 <script>，把 < 轉義避免 </script> 提前斷開
  const configJson = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenAPI 文件 — Scalar</title>
<style>body{margin:0;}</style>
</head>
<body>
<div id="app"></div>
<script src="${libSrc}"><\/script>
<script>Scalar.createApiReference('#app', ${configJson});<\/script>
</body>
</html>`;
}

function openViewer() {
  const config = getConfig();
  if (!config) return;

  // 新分頁是獨立文件，需要絕對路徑才能載到本地 bundle
  const libUrl = new URL('assets/scalar.standalone.min.js', location.href).href;
  const html = buildHtml(libUrl, config);

  const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const win = window.open(blobUrl, '_blank');
  if (!win) { alert('新分頁被瀏覽器攔截，請允許此網站開啟彈出視窗'); URL.revokeObjectURL(blobUrl); }
  // 不立即 revoke：保留 blob URL 讓新分頁重新整理時仍可載入
}

function exportHtml() {
  const config = getConfig();
  if (!config) return;

  // 匯出檔改用 CDN 載入函式庫（而非本地絕對路徑），下載後在任何地方開都能連到函式庫
  const html = buildHtml(SCALAR_CDN_URL, config);

  const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = 'openapi-doc.html';
  a.click();
  URL.revokeObjectURL(blobUrl);
}

function loadFile(file) {
  if (!file || !/\.(json|ya?ml)$/i.test(file.name)) { alert('請選擇 .json / .yaml / .yml 檔案'); return; }
  const reader = new FileReader();
  reader.onload = () => { document.getElementById('oaContent').value = reader.result; openViewer(); };
  reader.readAsText(file);
}
