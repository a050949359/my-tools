let app = null;

export function template() {
  return `
    <p class="muted">使用 Scalar API Reference（本地、延遲載入）渲染 OpenAPI / Swagger 文件。可輸入規格網址，或直接貼上 JSON / YAML 內容；貼上的內容優先於網址。</p>
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
    <button id="oaRenderBtn" data-primary>載入文件</button>
    <div id="oaViewer" style="margin-top:1rem;border:1px solid var(--outline-variant);border-radius:8px;overflow:hidden;display:none;"></div>
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
  document.getElementById('oaRenderBtn').addEventListener('click', render);

  return () => destroyApp();
}

export function reset() {
  destroyApp();
  document.getElementById('oaUrl').value = '';
  document.getElementById('oaContent').value = '';
  document.getElementById('oaViewer').style.display = 'none';
}

function destroyApp() {
  if (app && typeof app.destroy === 'function') app.destroy();
  app = null;
}

function loadLib() {
  if (typeof Scalar !== 'undefined') return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/scalar.standalone.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function render() {
  const btn = document.getElementById('oaRenderBtn');
  if (btn.disabled) return;

  const url = document.getElementById('oaUrl').value.trim();
  const content = document.getElementById('oaContent').value.trim();
  if (!url && !content) { alert('請輸入規格網址，或貼上 / 上傳規格內容'); return; }

  const config = content
    ? { content }
    : { url, ...(document.getElementById('oaProxy').checked ? { proxyUrl: 'https://proxy.scalar.com' } : {}) };

  btn.disabled = true;
  try {
    await loadLib();
    destroyApp();
    const viewer = document.getElementById('oaViewer');
    viewer.innerHTML = '';
    viewer.style.display = 'block';
    app = Scalar.createApiReference(viewer, config);
  } catch (e) {
    alert('載入 Scalar 函式庫失敗: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

function loadFile(file) {
  if (!file || !/\.(json|ya?ml)$/i.test(file.name)) { alert('請選擇 .json / .yaml / .yml 檔案'); return; }
  const reader = new FileReader();
  reader.onload = () => { document.getElementById('oaContent').value = reader.result; render(); };
  reader.readAsText(file);
}
