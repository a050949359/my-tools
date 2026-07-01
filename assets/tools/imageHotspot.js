// SVG 互動熱區連結 — 把描邊後的 SVG 各區塊綁上超連結,匯出可點擊的互動 SVG。
// 兩種選取:①點選/框選一群 <path> 綁同一連結（適合整句文字）②直接拉矩形熱區。
// 匯出時把選中的 path 包進 <a href>,矩形熱區則加透明 <rect> 包 <a>。

const SVGNS = 'http://www.w3.org/2000/svg';
const XLINKNS = 'http://www.w3.org/1999/xlink';

let baseSVG = '';        // 已標記 data-hs-id 的乾淨 SVG 字串（匯出以此為底）
let svgEl = null;        // 目前 stage 上的 live <svg>
let mode = 'path';       // 'path' | 'rect'
let selected = new Set();// 目前選取的 path id
let hotspots = [];       // {type:'group', ids:[...], href} | {type:'rect', x,y,w,h, href}
let hsSeq = 0;

const $ = id => document.getElementById(id);

// 只放行安全協定,擋 javascript: 等
function safeHref(h) {
  const s = (h || '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:|tel:|\/|#|\.)/i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return 'https://' + s;   // 補協定:example.com → https://
  return '';
}

export function template() {
  return `
    <style>
      #hsRoot { display:flex; flex-direction:column; gap:.8rem; }
      #hsRoot .hs-io { display:flex; flex-direction:column; gap:.5rem; }
      #hsRoot textarea { min-height:90px; font-family:var(--mono); font-size:.8rem; }
      #hsRoot .hs-toolbar { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; }
      #hsRoot .hs-modes { display:inline-flex; border:1px solid var(--outline-variant); border-radius:8px; overflow:hidden; }
      #hsRoot .hs-modes button { border:0; background:var(--surface); padding:.4rem .7rem; cursor:pointer; font-size:.82rem; }
      #hsRoot .hs-modes button.active { background:var(--primary); color:#fff; }
      #hsStageWrap { position:relative; background:var(--surface-low); border:1px solid var(--outline-variant); border-radius:10px; overflow:auto; min-height:220px; }
      #hsStage { position:relative; display:inline-block; min-width:100%; }
      #hsStage svg { display:block; max-width:100%; height:auto; }
      #hsStage.mode-rect svg, #hsStage.mode-path svg { cursor:crosshair; }
      #hsMarquee { position:absolute; border:1.5px dashed var(--primary); background:color-mix(in srgb,var(--primary) 14%,transparent); pointer-events:none; display:none; }
      /* 選取 / 熱區的視覺提示（畫在 SVG 內的 .hs-ui 覆蓋層） */
      .hs-ui-sel { fill:none; stroke:var(--primary); stroke-width:1.5; stroke-dasharray:4 3; vector-effect:non-scaling-stroke; }
      .hs-ui-group { fill:color-mix(in srgb,var(--primary) 16%,transparent); stroke:var(--primary); stroke-width:1; vector-effect:non-scaling-stroke; }
      .hs-ui-rect { fill:color-mix(in srgb,#2ea043 20%,transparent); stroke:#2ea043; stroke-width:1; vector-effect:non-scaling-stroke; }
      #hsList { display:flex; flex-direction:column; gap:6px; }
      #hsList .hs-item { display:flex; gap:8px; align-items:center; font-size:.8rem; background:var(--surface-low); border:1px solid var(--outline-variant); border-radius:8px; padding:.4rem .6rem; }
      #hsList .hs-item .hs-tag { font-family:var(--mono); color:var(--on-surface-variant); flex-shrink:0; }
      #hsList .hs-item .hs-url { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--primary); }
      #hsList .hs-item button { border:0; background:transparent; color:var(--on-surface-variant); cursor:pointer; font-size:1rem; }
      #hsStatus { font-size:.8rem; color:var(--on-surface-variant); }
    </style>
    <div id="hsRoot">
      <p class="muted">把描邊後的 SVG 各區塊綁上<strong>超連結</strong>,匯出可點擊的互動 SVG。可從「圖片 → SVG 描邊」直接傳入,或在下方貼上 / 上傳 SVG。</p>

      <div class="hs-io">
        <textarea id="hsInput" placeholder="貼上 SVG 原始碼…"></textarea>
        <div class="button-row" style="margin:0;">
          <button id="hsLoad" data-primary>載入 SVG</button>
          <button id="hsUploadBtn" class="btn-ghost">上傳 .svg</button>
          <input type="file" id="hsFile" accept=".svg,image/svg+xml" hidden>
        </div>
      </div>

      <div id="hsEditor" hidden>
        <div class="hs-toolbar">
          <div class="hs-modes" id="hsModes">
            <button data-mode="path" class="active">選 path（點/框選）</button>
            <button data-mode="rect">拉矩形熱區</button>
          </div>
          <button id="hsBind">綁連結</button>
          <button id="hsClearSel" class="btn-ghost">清除選取</button>
          <span id="hsStatus"></span>
        </div>

        <div id="hsStageWrap">
          <div id="hsStage" class="mode-path"></div>
          <div id="hsMarquee"></div>
        </div>

        <div id="hsList"></div>

        <div class="button-row" style="margin-top:.4rem;">
          <button id="hsExport">匯出互動 SVG</button>
          <button id="hsCopy">複製原始碼</button>
        </div>
      </div>
    </div>
  `;
}

export function init() {
  baseSVG = ''; svgEl = null; mode = 'path'; selected = new Set(); hotspots = []; hsSeq = 0;

  // 從描邊工具傳入的 SVG（sessionStorage 交接）
  const handoff = sessionStorage.getItem('hs-handoff-svg');
  if (handoff) {
    sessionStorage.removeItem('hs-handoff-svg');
    $('hsInput').value = handoff;
    loadSVG(handoff);
  }

  $('hsLoad').addEventListener('click', () => loadSVG($('hsInput').value));
  $('hsUploadBtn').addEventListener('click', () => $('hsFile').click());
  $('hsFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { $('hsInput').value = r.result; loadSVG(r.result); };
    r.readAsText(f);
  });

  $('hsModes').addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]'); if (!b) return;
    mode = b.dataset.mode;
    $('hsModes').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    $('hsStage').className = 'mode-' + mode;
    clearSelection();
    setStatus(mode === 'path' ? '點 path 選取,或拖曳框選一群' : '在圖上拖曳畫出矩形熱區');
  });

  $('hsBind').addEventListener('click', bindSelected);
  $('hsClearSel').addEventListener('click', () => { clearSelection(); renderUI(); });
  $('hsExport').addEventListener('click', exportSVG);
  $('hsCopy').addEventListener('click', copySVG);

  return () => { if (stageOff) { stageOff(); stageOff = null; } };
}

function loadSVG(str) {
  const src = (str || '').trim();
  if (!src.includes('<svg')) { alert('請提供有效的 SVG 內容'); return; }
  const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  if (!svg || doc.querySelector('parsererror')) { alert('SVG 解析失敗'); return; }

  // 給每個 path 標上穩定 id,讓選取 ↔ 匯出對得上
  svg.querySelectorAll('path').forEach((p, i) => p.setAttribute('data-hs-id', 'p' + i));
  baseSVG = new XMLSerializer().serializeToString(svg);

  // 注入 stage
  const stage = $('hsStage');
  stage.innerHTML = baseSVG;
  svgEl = stage.querySelector('svg');
  svgEl.removeAttribute('width'); svgEl.removeAttribute('height');   // 讓 CSS 控制縮放
  if (!svgEl.getAttribute('viewBox')) {
    const w = svg.getAttribute('width') || 300, h = svg.getAttribute('height') || 150;
    svgEl.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
  }

  hotspots = []; selected = new Set(); hsSeq = 0;
  $('hsEditor').hidden = false;
  bindStageEvents();
  renderUI();
  setStatus(`已載入,${svgEl.querySelectorAll('path').length} 條 path`);
}

// 螢幕座標 → SVG user 座標
function toSvgPoint(clientX, clientY) {
  const pt = svgEl.createSVGPoint(); pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svgEl.getScreenCTM().inverse());
}

let stageOff = null;   // 解除 stage 的全域拖曳監聽

function bindStageEvents() {
  if (stageOff) { stageOff(); stageOff = null; }
  const wrap = $('hsStageWrap'), marquee = $('hsMarquee');
  let dragging = false, startCX = 0, startCY = 0, startLX = 0, startLY = 0, moved = false;
  const DRAG_MIN = 3;   // 小於此位移視為單擊

  // 相對 stageWrap（含捲動）的座標,供 marquee 顯示
  const localXY = e => {
    const r = wrap.getBoundingClientRect();
    return [e.clientX - r.left + wrap.scrollLeft, e.clientY - r.top + wrap.scrollTop];
  };

  const onDown = e => {
    if (e.button !== 0) return;
    dragging = true; moved = false;
    startCX = e.clientX; startCY = e.clientY;
    [startLX, startLY] = localXY(e);
    marquee.style.display = 'block';
    marquee.style.left = startLX + 'px'; marquee.style.top = startLY + 'px';
    marquee.style.width = '0px'; marquee.style.height = '0px';
    e.preventDefault();
  };
  const onMove = e => {
    if (!dragging) return;
    if (Math.abs(e.clientX - startCX) > DRAG_MIN || Math.abs(e.clientY - startCY) > DRAG_MIN) moved = true;
    const [lx, ly] = localXY(e);
    marquee.style.left = Math.min(startLX, lx) + 'px';
    marquee.style.top = Math.min(startLY, ly) + 'px';
    marquee.style.width = Math.abs(lx - startLX) + 'px';
    marquee.style.height = Math.abs(ly - startLY) + 'px';
  };
  const onUp = e => {
    if (!dragging) return;
    dragging = false;
    marquee.style.display = 'none';
    if (!moved) { handleClick(e); return; }
    finishDrag(e);
  };

  // 單擊:path 模式下切換該 path 選取
  function handleClick(e) {
    if (mode !== 'path') return;
    const p = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('path[data-hs-id]');
    if (!p || !svgEl.contains(p)) return;
    const id = p.getAttribute('data-hs-id');
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    renderUI();
  }

  // 拖曳結束:rect 模式→建熱區;path 模式→框選相交的 path
  function finishDrag(e) {
    const p1 = toSvgPoint(startCX, startCY), p2 = toSvgPoint(e.clientX, e.clientY);
    const rect = { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y) };
    if (mode === 'rect') {
      const href = promptHref();
      if (href) hotspots.push({ type: 'rect', id: ++hsSeq, ...rect, href });
    } else {
      svgEl.querySelectorAll('path[data-hs-id]').forEach(p => {
        const b = p.getBBox();
        if (b.x < rect.x + rect.w && b.x + b.width > rect.x && b.y < rect.y + rect.h && b.y + b.height > rect.y)
          selected.add(p.getAttribute('data-hs-id'));
      });
    }
    renderUI();
  }

  svgEl.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  stageOff = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
}

function promptHref() {
  const raw = prompt('輸入連結網址（http(s):// 、mailto: 、相對路徑…）');
  if (raw === null) return '';
  const h = safeHref(raw);
  if (!h) { alert('網址無效或不允許的協定'); return ''; }
  return h;
}

function bindSelected() {
  if (mode !== 'path') { setStatus('請切到「選 path」模式'); return; }
  if (!selected.size) { setStatus('尚未選取任何 path'); return; }
  const href = promptHref();
  if (!href) return;
  hotspots.push({ type: 'group', id: ++hsSeq, ids: [...selected], href });
  clearSelection();
  renderUI();
}

function clearSelection() { selected = new Set(); }

// 重畫:選取外框、群組/矩形熱區預覽、清單
function renderUI() {
  if (!svgEl) return;
  svgEl.querySelector('.hs-ui')?.remove();
  const g = document.createElementNS(SVGNS, 'g');
  g.setAttribute('class', 'hs-ui');
  g.setAttribute('pointer-events', 'none');

  const rectEl = (x, y, w, h, cls) => {
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('class', cls);
    return r;
  };

  // 已綁定的群組:外框
  hotspots.forEach(hs => {
    if (hs.type === 'rect') { g.appendChild(rectEl(hs.x, hs.y, hs.w, hs.h, 'hs-ui-rect')); return; }
    const bb = groupBBox(hs.ids);
    if (bb) g.appendChild(rectEl(bb.x, bb.y, bb.w, bb.h, 'hs-ui-group'));
  });

  // 目前選取:每條 path 外框
  selected.forEach(id => {
    const p = svgEl.querySelector(`path[data-hs-id="${id}"]`);
    if (!p) return;
    const b = p.getBBox();
    g.appendChild(rectEl(b.x, b.y, b.width, b.height, 'hs-ui-sel'));
  });

  svgEl.appendChild(g);
  renderList();
  setStatus(`選取 ${selected.size} 條　·　熱區 ${hotspots.length} 個`);
}

function groupBBox(ids) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, found = false;
  ids.forEach(id => {
    const p = svgEl.querySelector(`path[data-hs-id="${id}"]`);
    if (!p) return;
    const b = p.getBBox(); found = true;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
  });
  return found ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

function renderList() {
  const list = $('hsList');
  list.innerHTML = '';
  hotspots.forEach(hs => {
    const el = document.createElement('div');
    el.className = 'hs-item';
    const tag = hs.type === 'rect' ? '▭ 矩形' : `⌘ ${hs.ids.length} path`;
    el.innerHTML = `<span class="hs-tag">${tag}</span><span class="hs-url"></span><button title="移除">✕</button>`;
    el.querySelector('.hs-url').textContent = hs.href;
    el.querySelector('button').onclick = () => { hotspots = hotspots.filter(x => x.id !== hs.id); renderUI(); };
    list.appendChild(el);
  });
}

// 產出最終互動 SVG:以 baseSVG 為乾淨底,套上 <a> 包裹與矩形熱區
function buildExport() {
  const doc = new DOMParser().parseFromString(baseSVG, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  svg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', XLINKNS);

  hotspots.forEach(hs => {
    if (hs.type === 'group') {
      // 每條 path 各自包一個 <a>（同一 href）:保留原本 DOM 順序/樣式/堆疊,
      // 避免把跨父層或交錯的 path 集中搬進單一 <a> 而破壞渲染。點擊行為完全相同。
      hs.ids.map(id => svg.querySelector(`path[data-hs-id="${id}"]`)).filter(Boolean).forEach(p => {
        const a = doc.createElementNS(SVGNS, 'a');
        setHref(a, hs.href);
        p.parentNode.insertBefore(a, p);
        a.appendChild(p);
      });
    } else {
      const a = doc.createElementNS(SVGNS, 'a');
      setHref(a, hs.href);
      const r = doc.createElementNS(SVGNS, 'rect');
      r.setAttribute('x', hs.x); r.setAttribute('y', hs.y);
      r.setAttribute('width', hs.w); r.setAttribute('height', hs.h);
      r.setAttribute('fill', 'transparent'); r.setAttribute('pointer-events', 'all');
      a.appendChild(r);
      svg.appendChild(a);                               // 疊在最上層
    }
  });

  svg.querySelectorAll('[data-hs-id]').forEach(p => p.removeAttribute('data-hs-id'));  // 清掉輔助屬性
  return new XMLSerializer().serializeToString(svg);
}

function setHref(a, href) {
  a.setAttribute('href', href);
  a.setAttributeNS(XLINKNS, 'xlink:href', href);       // 舊瀏覽器相容
  if (/^https?:/i.test(href)) {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');      // 防 reverse tabnabbing
  }
}

function exportSVG() {
  if (!hotspots.length) { setStatus('尚未建立任何熱區'); return; }
  const out = buildExport();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out], { type: 'image/svg+xml' }));
  a.download = 'interactive.svg'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function copySVG() {
  if (!hotspots.length) { setStatus('尚未建立任何熱區'); return; }
  const out = buildExport();
  const done = () => setStatus('已複製互動 SVG 原始碼');
  (navigator.clipboard?.writeText(out) ?? Promise.reject())
    .then(done)
    .catch(() => { const ta = document.createElement('textarea'); ta.value = out; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done(); });
}

function setStatus(msg) { const el = $('hsStatus'); if (el) el.textContent = msg; }

export function reset() {
  if (stageOff) { stageOff(); stageOff = null; }   // 解除全域拖曳監聽
  baseSVG = ''; svgEl = null; selected = new Set(); hotspots = []; mode = 'path';
  if ($('hsInput')) $('hsInput').value = '';
  if ($('hsEditor')) $('hsEditor').hidden = true;
  if ($('hsStage')) $('hsStage').innerHTML = '';
  if ($('hsList')) $('hsList').innerHTML = '';
  setStatus('');
}
