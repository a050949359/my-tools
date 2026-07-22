export function template() {
  return `
    <p class="muted">使用 Scalar API Reference（本地函式庫）渲染 OpenAPI / Swagger 文件，會在<b>新分頁</b>開啟完整文件頁面（固定現代版面）。可輸入規格網址，或直接貼上 JSON / YAML 內容；貼上的內容優先於網址。下載 HTML 時可另外選擇引擎與版面配置。</p>
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
    </div>
    <div class="button-row" style="margin-top:10px;">
      <select id="oaExportEngine" title="匯出的 HTML 要用哪個引擎渲染">
        <option value="scalar">Scalar</option>
        <option value="swagger">Swagger UI（原始 JS）</option>
      </select>
      <select id="oaLayout" title="僅 Scalar 引擎適用的版面配置">
        <option value="modern">現代（Scalar 側欄）</option>
        <option value="classic">經典（類似 Swagger UI）</option>
      </select>
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
  document.getElementById('oaExportEngine').addEventListener('change', updateLayoutVisibility);
  updateLayoutVisibility();
}

export function reset() {
  document.getElementById('oaUrl').value = '';
  document.getElementById('oaContent').value = '';
  document.getElementById('oaLayout').value = 'modern';
  document.getElementById('oaExportEngine').value = 'scalar';
  updateLayoutVisibility();
}

// 版面配置僅 Scalar 引擎適用，選 Swagger UI 時隱藏
function updateLayoutVisibility() {
  const isScalar = document.getElementById('oaExportEngine').value === 'scalar';
  document.getElementById('oaLayout').hidden = !isScalar;
}

// jsDelivr 上與本地函式庫相同版本，供匯出的獨立 HTML 使用
const SCALAR_CDN_URL = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.62.9/dist/browser/standalone.min.js';
const SWAGGER_CDN_BUNDLE = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.10/swagger-ui-bundle.js';
const SWAGGER_CDN_CSS = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.10/swagger-ui.css';

function readInputs() {
  const url = document.getElementById('oaUrl').value.trim();
  const content = document.getElementById('oaContent').value.trim();
  if (!url && !content) { alert('請輸入規格網址，或貼上 / 上傳規格內容'); return null; }
  return { url, content };
}

function buildScalarHtml(libSrc, inputs, layout) {
  const config = inputs.content
    ? { content: inputs.content, layout }
    : { url: inputs.url, layout, ...(document.getElementById('oaProxy').checked ? { proxyUrl: 'https://proxy.scalar.com' } : {}) };
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

// Swagger UI 原始 JS（swagger-ui-dist 的 SwaggerUIBundle，不含 standalone preset 的搜尋列，因為輸入介面已由本工具提供）
function buildSwaggerHtml(bundleSrc, cssSrc, inputs) {
  const urlJson = JSON.stringify(inputs.url || '').replace(/</g, '\\u003c');
  const contentJson = JSON.stringify(inputs.content || '').replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenAPI 文件 — Swagger UI</title>
<link rel="stylesheet" href="${cssSrc}">
<style>body{margin:0;}</style>
</head>
<body>
<div id="swagger-ui"></div>
<script src="${bundleSrc}"><\/script>
<script>
  var content = ${contentJson};
  var specUrl = ${urlJson};
  if (content) { specUrl = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); }
  SwaggerUIBundle({ url: specUrl, dom_id: '#swagger-ui', presets: [SwaggerUIBundle.presets.apis], layout: 'BaseLayout' });
<\/script>
</body>
</html>`;
}

function openViewer() {
  const inputs = readInputs();
  if (!inputs) return;

  // 新分頁是獨立文件，需要絕對路徑才能載到本地 bundle；固定用現代版面
  const libUrl = new URL('assets/scalar.standalone.min.js', location.href).href;
  const html = buildScalarHtml(libUrl, inputs, 'modern');

  const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const win = window.open(blobUrl, '_blank');
  if (!win) { alert('新分頁被瀏覽器攔截，請允許此網站開啟彈出視窗'); URL.revokeObjectURL(blobUrl); }
  // 不立即 revoke：保留 blob URL 讓新分頁重新整理時仍可載入
}

function exportHtml() {
  const inputs = readInputs();
  if (!inputs) return;

  // 匯出檔改用 CDN 載入函式庫（而非本地絕對路徑），下載後在任何地方開都能連到函式庫
  const engine = document.getElementById('oaExportEngine').value;
  const html = engine === 'swagger'
    ? buildSwaggerHtml(SWAGGER_CDN_BUNDLE, SWAGGER_CDN_CSS, inputs)
    : buildScalarHtml(SCALAR_CDN_URL, inputs, document.getElementById('oaLayout').value);

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
