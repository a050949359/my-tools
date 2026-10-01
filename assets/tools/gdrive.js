// Google 雲端硬碟：Google Picker 選檔 → Drive API 下載 / 預覽
// GIS 與 gapi 只能從 Google 載入（無法放本地），工具開啟時才注入
const GIS_SRC  = 'https://accounts.google.com/gsi/client';
const GAPI_SRC = 'https://apis.google.com/js/api.js';
// drive.file：只能存取使用者在 Picker 選取的檔案，非敏感權限不需審核
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
// 皆為公開值：Client ID 限定授權來源 https://a050949359.github.io、OAuth 僅限測試使用者；
// API Key 限定網站 https://a050949359.github.io/* + 只能呼叫 Picker API
const CLIENT_ID = '763943221610-0gnnu6vtomnen73tmlj6n42267oo1j7m.apps.googleusercontent.com';
const API_KEY   = 'AIzaSyDQDkgrQ8qweEWGzLdZ1ACx_kW6YFvsY8s';
// Client ID 開頭的數字即專案編號，Picker 的 setAppId 需要它才能授權選到的檔案
const APP_ID = CLIENT_ID.split('-')[0];

// Google 原生格式無法直接下載，改用 export 轉成 Office / PNG
const EXPORTS = {
  'application/vnd.google-apps.document':     ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  'application/vnd.google-apps.spreadsheet':  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  'application/vnd.google-apps.presentation': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
  'application/vnd.google-apps.drawing':      ['image/png', 'png'],
};

let _libs = null;       // 載入 GIS + gapi.picker 的 Promise
let _libsReady = false;
let _tokenClient = null;
let _token = null;
let _tokenExp = 0;
let _pending = null;    // 等待中的 token 請求 { resolve, reject }
let _files = [];        // 已選取檔案 { id, name, mimeType, url, size, modified, iconUrl }
let _previews = {};     // id → object URL

export function template() {
  return `
    <p class="muted">從自己的 Google 雲端硬碟選取檔案（Google Picker），可下載或預覽。檔案由 Google 直接傳到瀏覽器，不經過其他伺服器。</p>


    <div class="gd-bar">
      <select id="gdFilter">
        <option value="DOCS">全部檔案</option>
        <option value="DOCS_IMAGES">圖片</option>
        <option value="SPREADSHEETS">試算表</option>
        <option value="DOCUMENTS">文件</option>
        <option value="PRESENTATIONS">簡報</option>
        <option value="PDFS">PDF</option>
      </select>
      <label class="gd-check"><input type="checkbox" id="gdMulti" checked> 多選</label>
      <button id="gdPickBtn" data-primary>選取檔案</button>
      <button class="btn-ghost" id="gdSignOut" hidden>登出 Google</button>
    </div>
    <p id="gdStatus" class="muted gd-status"></p>
    <div id="gdList" class="gd-list"></div>
  `;
}

export function init() {
  document.getElementById('gdPickBtn').addEventListener('click', pick);
  document.getElementById('gdSignOut').addEventListener('click', signOut);
  document.getElementById('gdList').addEventListener('click', onListClick);

  // 工具開啟就先載入函式庫：授權彈窗必須在點擊當下同步開啟，等載入完才開會被瀏覽器擋掉
  loadLibs().catch(e => setStatus(`Google 函式庫載入失敗：${e.message}`, true));
  renderList();
  syncSignOut();

  return () => {
    Object.values(_previews).forEach(URL.revokeObjectURL);
    _previews = {};
  };
}

export function reset() {
  Object.values(_previews).forEach(URL.revokeObjectURL);
  _previews = {};
  _files = [];
  renderList();
  setStatus('');
}

// ── Google 函式庫 / 授權 ─────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = res;
    s.onerror = () => rej(new Error(`無法載入 ${src}`));
    document.head.appendChild(s);
  });
}

function loadLibs() {
  if (!_libs) {
    _libs = Promise.all([loadScript(GIS_SRC), loadScript(GAPI_SRC)])
      .then(() => new Promise((res, rej) => gapi.load('picker', { callback: res, onerror: rej })))
      .then(() => { _libsReady = true; })
      .catch(e => { _libs = null; throw e; });
  }
  return _libs;
}

// 必須在點擊事件中同步呼叫（requestAccessToken 會開彈窗）
function getToken() {
  if (_token && Date.now() < _tokenExp - 60_000) return Promise.resolve(_token);
  if (!_tokenClient) {
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: resp => {
        const p = _pending; _pending = null;
        if (resp.error) { p?.reject(new Error(resp.error_description || resp.error)); return; }
        _token = resp.access_token;
        _tokenExp = Date.now() + resp.expires_in * 1000;
        syncSignOut();
        p?.resolve(_token);
      },
      error_callback: err => {
        const p = _pending; _pending = null;
        p?.reject(new Error(err.type === 'popup_closed' ? '授權視窗已關閉' : (err.message || err.type)));
      },
    });
  }
  return new Promise((resolve, reject) => {
    _pending?.reject(new Error('已重新請求授權'));
    _pending = { resolve, reject };
    _tokenClient.requestAccessToken({ prompt: '' });
  });
}

function signOut() {
  if (_token) google.accounts.oauth2.revoke(_token, () => {});
  _token = null;
  _tokenExp = 0;
  syncSignOut();
  setStatus('已登出');
}

function syncSignOut() {
  const btn = document.getElementById('gdSignOut');
  if (btn) btn.hidden = !_token;
}

// ── Picker ────────────────────────────────────────────────────────────────────
async function pick() {
  if (!_libsReady) {
    setStatus('Google 函式庫載入中，請稍候再按一次');
    loadLibs().then(() => setStatus('載入完成，可以選取檔案了')).catch(e => setStatus(`Google 函式庫載入失敗：${e.message}`, true));
    return;
  }

  let token;
  try {
    token = await getToken();
  } catch (e) {
    setStatus(`授權失敗：${e.message}`, true);
    return;
  }

  const P = google.picker;
  const viewId = P.ViewId[document.getElementById('gdFilter').value];
  const myDrive = new P.DocsView(viewId).setIncludeFolders(true).setSelectFolderEnabled(false);
  const shared = new P.DocsView(viewId).setEnableDrives(true).setIncludeFolders(true).setSelectFolderEnabled(false);
  const builder = new P.PickerBuilder()
    .addView(myDrive)
    .addView(shared)
    .enableFeature(P.Feature.SUPPORT_DRIVES)
    .setOAuthToken(token)
    .setDeveloperKey(API_KEY)
    .setAppId(APP_ID)
    .setLocale('zh-TW')
    .setCallback(onPicked);
  if (document.getElementById('gdMulti').checked) builder.enableFeature(P.Feature.MULTISELECT_ENABLED);
  builder.build().setVisible(true);
}

function onPicked(data) {
  const P = google.picker;
  const action = data[P.Response.ACTION];
  if (action === P.Action.CANCEL) { setStatus('已取消'); return; }
  if (action !== P.Action.PICKED) return;

  const docs = data[P.Response.DOCUMENTS] || [];
  let added = 0;
  for (const d of docs) {
    const id = d[P.Document.ID];
    if (_files.some(f => f.id === id)) continue;
    _files.push({
      id,
      name: d[P.Document.NAME],
      mimeType: d[P.Document.MIME_TYPE],
      url: d[P.Document.URL],
      iconUrl: d[P.Document.ICON_URL],
      size: d.sizeBytes != null ? Number(d.sizeBytes) : null,
      modified: d[P.Document.LAST_EDITED_UTC] || null,
    });
    added++;
  }
  setStatus(`已選取 ${docs.length} 個檔案${added < docs.length ? `（${docs.length - added} 個已在清單中）` : ''}`);
  renderList();
}

// ── 檔案清單 ──────────────────────────────────────────────────────────────────
function renderList() {
  const el = document.getElementById('gdList');
  if (!el) return;
  if (!_files.length) { el.innerHTML = ''; return; }
  el.innerHTML = _files.map(f => {
    const canDownload = !f.mimeType.startsWith('application/vnd.google-apps.') || EXPORTS[f.mimeType];
    const isImage = f.mimeType.startsWith('image/');
    const exp = EXPORTS[f.mimeType];
    return `
      <div class="gd-item" data-id="${esc(f.id)}">
        <div class="gd-item-main">
          ${f.iconUrl ? `<img class="gd-icon" src="${esc(f.iconUrl)}" alt="">` : ''}
          <div class="gd-item-info">
            <a class="gd-name" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>
            <div class="gd-meta">${esc(f.mimeType)}${f.size != null ? ` · ${fmtSize(f.size)}` : ''}${f.modified ? ` · ${new Date(f.modified).toLocaleString('zh-TW')}` : ''}</div>
          </div>
          <div class="gd-actions">
            ${isImage ? '<button class="btn-ghost" data-act="preview">預覽</button>' : ''}
            ${canDownload
              ? `<button class="btn-ghost" data-act="download">下載${exp ? `（.${exp[1]}）` : ''}</button>`
              : '<span class="muted">此類型無法下載</span>'}
            <button class="btn-ghost" data-act="remove" title="從清單移除">✕</button>
          </div>
        </div>
        ${_previews[f.id] ? `<img class="gd-preview" src="${_previews[f.id]}" alt="">` : ''}
      </div>`;
  }).join('');
}

function onListClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('.gd-item').dataset.id;
  const file = _files.find(f => f.id === id);
  if (!file) return;
  if (btn.dataset.act === 'remove') {
    if (_previews[id]) { URL.revokeObjectURL(_previews[id]); delete _previews[id]; }
    _files = _files.filter(f => f.id !== id);
    renderList();
  } else if (btn.dataset.act === 'preview') {
    if (_previews[id]) {
      URL.revokeObjectURL(_previews[id]); delete _previews[id];
      renderList();
      return;
    }
    withBlob(file, btn, blob => { _previews[id] = URL.createObjectURL(blob); renderList(); });
  } else if (btn.dataset.act === 'download') {
    withBlob(file, btn, blob => {
      const exp = EXPORTS[file.mimeType];
      const name = exp && !file.name.toLowerCase().endsWith(`.${exp[1]}`) ? `${file.name}.${exp[1]}` : file.name;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setStatus(`已下載 ${name}（${fmtSize(blob.size)}）`);
    });
  }
}

// 取得檔案內容後交給 done；token 在點擊當下同步請求（過期時才會跳授權視窗）
function withBlob(file, btn, done) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '讀取中…';
  getToken()
    .then(token => fetchBlob(file, token))
    .then(done)
    .catch(e => setStatus(`${file.name}：${e.message}`, true))
    .finally(() => { btn.disabled = false; btn.textContent = label; });
}

async function fetchBlob(file, token) {
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`;
  const exp = EXPORTS[file.mimeType];
  const url = exp
    ? `${base}/export?mimeType=${encodeURIComponent(exp[0])}`
    : `${base}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401) { _token = null; syncSignOut(); }
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error?.message || msg; } catch {}
    throw new Error(res.status === 401 ? '授權已過期，請再按一次' : msg);
  }
  return res.blob();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(msg, isError = false) {
  const el = document.getElementById('gdStatus');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('gd-status-error', isError);
}

function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
