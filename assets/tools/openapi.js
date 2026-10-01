import { listOperations, operationToApiJson, apiJsonFileName, buildZip } from './openapi-export.js';

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
    <hr style="border:none;border-top:1px solid var(--outline-variant);margin:18px 0;">
    <p class="muted">匯出 API 匯入 JSON：解析上方規格後勾選 API，每支產生一個 .json（多支打包成 zip）。分類取第一個 tag（含 <code>parent</code> 巢狀）；請求欄位含 query / path / header 參數；回應變體依 200 回應的 examples 拆，code 取回應 body 的 <code>code</code>。</p>
    <div class="button-row">
      <button id="oaListBtn">列出 API</button>
      <label id="oaSelectAllWrap" style="display:none;align-items:center;gap:7px;margin:0;">
        <input type="checkbox" id="oaSelectAll"> 全選
      </label>
      <button id="oaJsonExportBtn" style="display:none;">⬇ 匯出勾選的 JSON</button>
    </div>
    <div id="oaApiList" style="font-family:var(--mono);font-size:13px;"></div>
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
  document.getElementById('oaListBtn').addEventListener('click', listApis);
  document.getElementById('oaJsonExportBtn').addEventListener('click', exportApiJson);
  document.getElementById('oaSelectAll').addEventListener('change', e => {
    document.querySelectorAll('#oaApiList input[type=checkbox]').forEach(cb => { cb.checked = e.target.checked; });
  });
  updateLayoutVisibility();
}

export function reset() {
  document.getElementById('oaUrl').value = '';
  document.getElementById('oaContent').value = '';
  document.getElementById('oaLayout').value = 'modern';
  document.getElementById('oaExportEngine').value = 'scalar';
  updateLayoutVisibility();
  clearApiList();
}

// headless：spec 可為字串（JSON / YAML）或物件；operations 省略時匯出全部
export async function runHeadless(action, params) {
  if (action !== 'exportApiJson') throw new Error(`unknown action: ${action}`);
  const { spec, operations } = params || {};
  const parsed = typeof spec === 'string' ? await parseSpec(spec) : spec;
  if (!parsed?.paths) throw new Error('spec 缺少 paths');
  const targets = operations || listOperations(parsed).map(({ method, path }) => ({ method, path }));
  return targets.map(({ method, path }) => operationToApiJson(parsed, method.toLowerCase(), path));
}

// 版面配置僅 Scalar 引擎適用，選 Swagger UI 時隱藏
function updateLayoutVisibility() {
  const isScalar = document.getElementById('oaExportEngine').value === 'scalar';
  document.getElementById('oaLayout').hidden = !isScalar;
}

// jsDelivr 上與本地函式庫相同版本，供匯出的獨立 HTML 使用
const SCALAR_CDN_URL = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.3/dist/browser/standalone.js';
const SWAGGER_CDN_BUNDLE = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.10/swagger-ui-bundle.js';
const SWAGGER_CDN_CSS = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.10/swagger-ui.css';

function readInputs() {
  const url = document.getElementById('oaUrl').value.trim();
  const content = document.getElementById('oaContent').value.trim();
  if (!url && !content) { alert('請輸入規格網址，或貼上 / 上傳規格內容'); return null; }
  return { url, content };
}

// 關閉遙測、Ask AI、Generate MCP（會把 spec 上傳到 Scalar 伺服器）、
// Open API Client（開新分頁到 client.scalar.com）；頁內的 Test Request 保留
const SCALAR_BASE_CONFIG = {
  telemetry: false,
  agent: { disabled: true },
  mcp: { disabled: true },
  hideClientButton: true,
};

function buildScalarHtml(libSrc, inputs, layout) {
  const config = inputs.content
    ? { ...SCALAR_BASE_CONFIG, content: inputs.content, layout }
    : { ...SCALAR_BASE_CONFIG, url: inputs.url, layout, ...(document.getElementById('oaProxy').checked ? { proxyUrl: 'https://proxy.scalar.com' } : {}) };
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

// ---------- 匯出 API 匯入 JSON ----------

let listedSpec = null;

function loadYamlLib() {
  if (typeof jsyaml !== 'undefined') return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/js-yaml.min.js';
    s.onload = res; s.onerror = () => rej(new Error('js-yaml 載入失敗'));
    document.head.appendChild(s);
  });
}

// JSON 先試，失敗再當 YAML（YAML 是 JSON 的超集，但 JSON.parse 快且錯誤訊息清楚）
async function parseSpec(text) {
  try { return JSON.parse(text); } catch { /* 不是 JSON，改用 YAML */ }
  await loadYamlLib();
  return jsyaml.load(text);
}

// 貼上的內容優先；否則抓網址（勾選 proxy 時走 Scalar CORS Proxy）
async function fetchSpecText(inputs) {
  if (inputs.content) return inputs.content;
  const useProxy = document.getElementById('oaProxy').checked;
  const target = useProxy ? `https://proxy.scalar.com/?${new URLSearchParams({ scalar_url: inputs.url })}` : inputs.url;
  const res = await fetch(target);
  if (!res.ok) throw new Error(`讀取規格失敗：HTTP ${res.status}`);
  return res.text();
}

function clearApiList() {
  listedSpec = null;
  document.getElementById('oaApiList').innerHTML = '';
  document.getElementById('oaSelectAllWrap').style.display = 'none';
  document.getElementById('oaJsonExportBtn').style.display = 'none';
}

async function listApis() {
  const inputs = readInputs();
  if (!inputs) return;
  let spec;
  try {
    spec = await parseSpec(await fetchSpecText(inputs));
  } catch (e) {
    alert(`規格解析失敗：${e.message}`);
    return;
  }
  if (!spec?.paths) { alert('規格裡沒有 paths'); return; }

  const ops = listOperations(spec);
  listedSpec = spec;
  const list = document.getElementById('oaApiList');
  list.innerHTML = '';
  for (const op of ops) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0;font-weight:normal;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.method = op.method;
    cb.dataset.path = op.path;
    const text = document.createElement('span');
    text.textContent = `${op.method.toUpperCase().padEnd(6)} ${op.path}  ${op.summary}`;
    const cat = document.createElement('span');
    cat.className = 'muted';
    cat.textContent = `[${op.category}]`;
    row.append(cb, text, cat);
    list.appendChild(row);
  }
  if (!ops.length) list.innerHTML = '<p class="muted">沒有任何 API</p>';
  document.getElementById('oaSelectAll').checked = false;
  document.getElementById('oaSelectAllWrap').style.display = ops.length ? 'flex' : 'none';
  document.getElementById('oaJsonExportBtn').style.display = ops.length ? '' : 'none';
}

function exportApiJson() {
  const checked = [...document.querySelectorAll('#oaApiList input[type=checkbox]:checked')];
  if (!listedSpec || !checked.length) { alert('請先勾選要匯出的 API'); return; }

  const used = new Set();
  let files;
  try {
    files = checked.map(cb => {
      const { method, path } = cb.dataset;
      // 不同 path 轉成檔名可能撞名（如 /a-b 與 /a_b），撞名時加序號
      let name = apiJsonFileName(method, path);
      for (let i = 2; used.has(name); i++) name = apiJsonFileName(method, path).replace(/\.json$/, `_${i}.json`);
      used.add(name);
      return { name, text: JSON.stringify(operationToApiJson(listedSpec, method, path), null, 4) };
    });
  } catch (e) {
    alert(`轉換失敗：${e.message}`);
    return;
  }

  if (files.length === 1) download(new Blob([files[0].text], { type: 'application/json' }), files[0].name);
  else download(new Blob([buildZip(files)], { type: 'application/zip' }), 'api-json.zip');
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function loadFile(file) {
  if (!file || !/\.(json|ya?ml)$/i.test(file.name)) { alert('請選擇 .json / .yaml / .yml 檔案'); return; }
  const reader = new FileReader();
  reader.onload = () => { document.getElementById('oaContent').value = reader.result; openViewer(); };
  reader.readAsText(file);
}
