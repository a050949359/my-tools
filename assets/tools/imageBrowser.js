// 本地圖片瀏覽器 + RPG Maker MV/MZ 反解（純瀏覽，不提供匯出）
// 100% 客戶端：用 File System Access API 讀資料夾，圖片不離開本機。
// RPG Maker 加密 = [16-byte 假 header] + [真檔前 16 bytes 與金鑰 XOR]，
// 金鑰取自 data/System.json 的 encryptionKey；MV(.rpgmvp)/MZ(.png_) 演算法相同。

const CELL = 150, GAP = 8, STEP = CELL + GAP, THUMB = 300;
const ENC_IMG = /\.(rpgmvp|png_)$/i;                 // MV / MZ 加密圖
const PLAIN_IMG = /\.(png|jpe?g|webp|gif|bmp)$/i;

const workerSrc = `
self.onmessage = async (e) => {
  const { id, buffer, encrypted, key, maxDim } = e.data;
  try {
    let bytes;
    if (encrypted) {
      bytes = new Uint8Array(buffer.slice(16));               // 丟 16-byte 假 header
      for (let i = 0; i < 16 && i < bytes.length; i++) bytes[i] ^= key[i]; // XOR 還原
    } else {
      bytes = new Uint8Array(buffer);
    }
    const bmp = await createImageBitmap(new Blob([bytes]), { resizeWidth: maxDim, resizeQuality: 'low' });
    self.postMessage({ id, bmp }, [bmp]);
  } catch (err) { self.postMessage({ id, error: String((err && err.message) || err) }); }
};`;

// ── 模組狀態（每次 init 重置）──────────────────────────────────────────────
let items = [];          // {name, path, handle, encrypted}
let keyBytes = null;     // 16-byte 解密金鑰
let cols = 1, rendered = new Map();   // index -> {el, token}
let worker = null, jobId = 0, jobs = new Map();
let cur = -1, urlCache = new Map();   // i -> Promise<objectURL>
let rafId = 0;
let handlers = null;     // 供 cleanup 解除全域監聽

const $ = id => document.getElementById(id);

export function template() {
  return `
    <style>
      #ibRoot { display:flex; flex-direction:column; gap:.75rem; }
      #ibRoot .ib-notice {
        margin:0; padding:.55rem .8rem; border-radius:8px; font-size:.8rem; line-height:1.6;
        background:var(--surface-low); border:1px solid var(--outline-variant);
        color:var(--on-surface-variant);
      }
      #ibRoot .ib-bar { display:flex; gap:.8rem; align-items:center; flex-wrap:wrap; }
      #ibStatus { font-size:.85rem; color:var(--on-surface-variant); }
      #ibGrid {
        position:relative; overflow:auto; height:65vh; min-height:320px;
        background:#15151a; border-radius:10px; border:1px solid var(--outline-variant);
      }
      #ibSpacer { position:relative; width:100%; }
      #ibRoot .ib-cell {
        position:absolute; width:${CELL}px; height:${CELL}px; background:#000;
        border-radius:6px; overflow:hidden; display:flex; align-items:center;
        justify-content:center; cursor:pointer;
      }
      #ibRoot .ib-cell canvas { display:block; }
      #ibRoot .ib-cell .ib-lock { position:absolute; top:4px; right:6px; font-size:.7rem; }
      #ibRoot .ib-cell .ib-nm {
        position:absolute; bottom:0; left:0; right:0; font-size:.62rem; padding:2px 4px;
        background:rgba(0,0,0,.55); color:#eee; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      #ibRoot .ib-empty { margin:auto; color:#888; text-align:center; padding:2rem; }
      /* 防手滑：圖片/縮圖不可選取、不可拖曳 */
      #ibRoot img, #ibRoot canvas {
        user-select:none; -webkit-user-select:none; -webkit-user-drag:none; pointer-events:none;
      }
      #ibViewer {
        position:fixed; inset:0; background:rgba(0,0,0,.93); display:none;
        align-items:center; justify-content:center; z-index:1000;
      }
      #ibViewer img { max-width:96vw; max-height:90vh; object-fit:contain; }
      #ibVinfo { position:fixed; top:10px; left:0; right:0; text-align:center; font-size:.85rem; color:#ccc; pointer-events:none; }
      #ibVhint { position:fixed; bottom:10px; left:0; right:0; text-align:center; font-size:.78rem; color:#888; pointer-events:none; }
    </style>
    <div id="ibRoot">
      <p class="ib-notice">
        ⚠ 僅供瀏覽你<strong>擁有合法授權</strong>的素材（自製遊戲、已購買或引擎內建素材）。
        本工具純客戶端執行、圖片不離開本機，<strong>不提供匯出或下載</strong>；
        還原後的素材版權仍屬原作者，請勿擷取、散布或商用。使用本工具產生的任何後果由使用者自行負責。
      </p>
      <div class="ib-bar">
        <button id="ibPick" data-primary>📁 選資料夾</button>
        <span id="ibStatus">選一個資料夾開始（需 Chrome / Edge，localhost 或 https）</span>
      </div>
      <div id="ibGrid"><div id="ibSpacer"></div><div class="ib-empty" id="ibEmpty">尚未載入</div></div>
      <div id="ibViewer">
        <div id="ibVinfo"></div>
        <img id="ibVimg" alt="" draggable="false" />
        <div id="ibVhint">← / → 切換　Esc 離開</div>
      </div>
    </div>
  `;
}

// ── 縮圖工作（Worker）──────────────────────────────────────────────────────
function thumbJob(buffer, encrypted) {
  return new Promise(res => {
    const id = ++jobId; jobs.set(id, res);
    worker.postMessage({ id, buffer, encrypted, key: keyBytes, maxDim: THUMB }, [buffer]);
  });
}

// ── 解密成 Blob（原圖檢視用，主執行緒）─────────────────────────────────────
function decryptBytes(buf) {
  const b = new Uint8Array(buf.slice(16));
  for (let i = 0; i < 16 && i < b.length; i++) b[i] ^= keyBytes[i];
  return b;
}
async function fullBlob(item) {
  const file = await item.handle.getFile();
  if (!item.encrypted) return file;
  const buf = await file.arrayBuffer();
  return new Blob([decryptBytes(buf)], { type: 'image/png' });
}

// ── 遞迴走訪資料夾 ─────────────────────────────────────────────────────────
async function walk(dir, prefix, out) {
  for await (const [name, h] of dir.entries()) {
    const path = prefix ? prefix + '/' + name : name;
    if (h.kind === 'directory') await walk(h, path, out);
    else out.push({ name, path, handle: h });
  }
}

async function pick() {
  let root;
  try { root = await window.showDirectoryPicker(); }
  catch (e) { if (e.name !== 'AbortError') alert('需要 Chrome / Edge，且在 https 或 localhost'); return; }

  $('ibStatus').textContent = '掃描中…';
  const all = [];
  await walk(root, '', all);

  // 找 System.json 取 encryptionKey
  keyBytes = null;
  const sys = all.find(f => /(^|\/)System\.json$/i.test(f.path));
  if (sys) {
    try {
      const txt = await (await sys.handle.getFile()).text();
      const k = JSON.parse(txt).encryptionKey;
      if (k) keyBytes = Uint8Array.from(k.match(/.{2}/g).map(h => parseInt(h, 16)));
    } catch {}
  }

  items = all.filter(f => PLAIN_IMG.test(f.name) || (ENC_IMG.test(f.name) && keyBytes))
             .map(f => ({ ...f, encrypted: ENC_IMG.test(f.name) }));

  const lockedCount = all.filter(f => ENC_IMG.test(f.name)).length;
  $('ibStatus').textContent =
    `共 ${items.length} 張圖` +
    (keyBytes ? `（含解密 ${items.filter(i => i.encrypted).length} 張，金鑰 OK）`
              : (lockedCount ? `（發現 ${lockedCount} 張加密圖但找不到 System.json 金鑰）` : ''));
  $('ibEmpty').style.display = items.length ? 'none' : '';

  // 重新佈局：清掉舊格子
  rendered.forEach(o => o.el.remove()); rendered.clear();
  layout(); renderWindow();
}

// ── 虛擬牆 ─────────────────────────────────────────────────────────────────
function layout() {
  cols = Math.max(1, Math.floor(($('ibGrid').clientWidth + GAP) / STEP));
  $('ibSpacer').style.height = Math.ceil(items.length / cols) * STEP + 'px';
}
function renderWindow() {
  const g = $('ibGrid'); if (!g) return;
  const top = g.scrollTop, vis = g.clientHeight;
  const firstRow = Math.max(0, Math.floor(top / STEP) - 1);
  const lastRow = Math.floor((top + vis) / STEP) + 1;
  const need = new Set();
  for (let r = firstRow; r <= lastRow; r++)
    for (let c = 0; c < cols; c++) { const i = r * cols + c; if (i < items.length) need.add(i); }

  for (const [i, o] of rendered) if (!need.has(i)) { o.token.stale = true; o.el.remove(); rendered.delete(i); }
  for (const i of need) if (!rendered.has(i)) mountCell(i);
}
function mountCell(i) {
  const it = items[i], r = Math.floor(i / cols), c = i % cols;
  const el = document.createElement('div');
  el.className = 'ib-cell';
  el.style.transform = `translate(${c * STEP}px, ${r * STEP}px)`;
  el.innerHTML = `${it.encrypted ? '<span class="ib-lock">🔓</span>' : ''}<span class="ib-nm"></span>`;
  el.querySelector('.ib-nm').textContent = it.name;     // textContent 避免檔名注入 HTML
  el.onclick = () => openViewer(i);
  $('ibSpacer').appendChild(el);
  const token = { stale: false };
  rendered.set(i, { el, token });
  loadThumb(it, el, token);
}
async function loadThumb(it, el, token) {
  try {
    const buf = await (await it.handle.getFile()).arrayBuffer();
    if (token.stale) return;
    const { bmp, error } = await thumbJob(buf, it.encrypted);
    if (token.stale || error || !bmp) { bmp && bmp.close(); return; }
    const cv = document.createElement('canvas'); cv.width = CELL; cv.height = CELL;
    const ctx = cv.getContext('2d');
    const s = Math.min(CELL / bmp.width, CELL / bmp.height), w = bmp.width * s, h = bmp.height * s;
    ctx.drawImage(bmp, (CELL - w) / 2, (CELL - h) / 2, w, h); bmp.close();
    el.insertBefore(cv, el.firstChild);
  } catch {}
}

// ── 檢視模式 + 鍵盤 + 鄰居預載 ─────────────────────────────────────────────
function ensureUrl(i) {
  if (i < 0 || i >= items.length) return Promise.resolve(null);
  if (!urlCache.has(i)) urlCache.set(i, fullBlob(items[i]).then(b => URL.createObjectURL(b)));
  return urlCache.get(i);
}
function revoke(p) { Promise.resolve(p).then(u => u && URL.revokeObjectURL(u)); }
function trimCache(center) { for (const [i, p] of urlCache) if (Math.abs(i - center) > 2) { revoke(p); urlCache.delete(i); } }
async function show(i) {
  cur = i;
  const url = await ensureUrl(i);
  if (cur !== i) return;                               // 已被更快的切換取代
  $('ibVimg').src = url || '';
  $('ibVinfo').textContent = `${i + 1} / ${items.length}　${items[i].name}${items[i].encrypted ? '　🔓已解密' : ''}`;
  ensureUrl(i + 1); ensureUrl(i - 1); trimCache(i);    // 預載鄰居
}
function openViewer(i) { $('ibViewer').style.display = 'flex'; show(i); }
function closeViewer() {
  $('ibViewer').style.display = 'none';
  $('ibVimg').src = '';
  for (const [, p] of urlCache) revoke(p);
  urlCache.clear(); cur = -1;
}
function nav(d) { let n = cur + d; if (n < 0) n = items.length - 1; if (n >= items.length) n = 0; show(n); }
function viewerOpen() { return $('ibViewer') && $('ibViewer').style.display === 'flex'; }

export async function init() {
  // 重置狀態
  items = []; keyBytes = null; cols = 1; rendered = new Map();
  jobId = 0; jobs = new Map(); cur = -1; urlCache = new Map();
  worker = new Worker(URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' })));
  worker.onmessage = (e) => { const cb = jobs.get(e.data.id); if (cb) { jobs.delete(e.data.id); cb(e.data); } };

  $('ibPick').onclick = pick;

  const onScroll = () => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(renderWindow); };
  $('ibGrid').addEventListener('scroll', onScroll);

  // 鍵盤：檢視模式導覽 + 攔截複製/存檔（防手滑）
  const onKeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && ['c', 's', 'a', 'p'].includes(e.key.toLowerCase())) {
      // 焦點在本工具內、或檢視模式開啟時，攔下複製/存檔/全選/列印
      if (viewerOpen() || $('ibRoot')?.contains(document.activeElement)) {
        e.preventDefault(); return;
      }
    }
    if (!viewerOpen()) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nav(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); }
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(items.length - 1);
    else if (e.key === 'Escape') closeViewer();
  };
  addEventListener('keydown', onKeydown);

  // 停右鍵選單（避免「另存圖片」）
  const onContextMenu = (e) => { if (viewerOpen() || $('ibRoot')?.contains(e.target)) e.preventDefault(); };
  $('ibRoot').addEventListener('contextmenu', onContextMenu);

  // 阻止拖曳圖片出去
  const onDragStart = (e) => { if ($('ibRoot')?.contains(e.target)) e.preventDefault(); };
  $('ibRoot').addEventListener('dragstart', onDragStart);

  const onViewerClick = (e) => { if (e.target === $('ibViewer')) closeViewer(); };
  $('ibViewer').addEventListener('click', onViewerClick);

  const onResize = () => { if (!$('ibGrid')) return; layout(); rendered.forEach(o => o.el.remove()); rendered.clear(); renderWindow(); };
  addEventListener('resize', onResize);

  handlers = { onKeydown, onResize };

  // cleanup：切走工具時釋放資源
  return () => {
    cancelAnimationFrame(rafId);
    removeEventListener('keydown', handlers.onKeydown);
    removeEventListener('resize', handlers.onResize);
    for (const [, p] of urlCache) revoke(p);
    urlCache.clear();
    rendered.forEach(o => o.token.stale = true);
    rendered.clear();
    if (worker) { worker.terminate(); worker = null; }
    items = []; keyBytes = null; jobs.clear(); cur = -1;
  };
}
