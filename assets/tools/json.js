let _raw = '';
let _matches = [];
let _cursor = 0;
let _view = 'text'; // 'text' | 'tree'

export function template() {
  return `
    <div class="json-shell">
      <div class="json-panel">
        <div class="json-panel-header">
          <span>INPUT</span>
          <button class="btn-ghost" id="jsonClear">Clear</button>
        </div>
        <textarea id="jsonInput" spellcheck="false" placeholder='{ "key": "value" }'></textarea>
      </div>
      <div class="json-panel">
        <div class="json-panel-header">
          <div class="json-view-toggle">
            <button class="json-view-btn active" data-view="text">Text</button>
            <button class="json-view-btn" data-view="tree">Tree</button>
          </div>
          <div class="json-search-row" id="jsonSearchRow">
            <input type="text" id="jsonSearch" placeholder="搜尋…" autocomplete="off" spellcheck="false">
            <span id="jsonSearchCount"></span>
            <button class="btn-ghost" id="jsonSearchPrev">↑</button>
            <button class="btn-ghost" id="jsonSearchNext">↓</button>
          </div>
          <button class="btn-ghost" id="jsonCopy">Copy</button>
        </div>
        <div class="json-output-wrap" id="jsonOutputWrap">
          <pre id="jsonOutput"></pre>
        </div>
        <div class="json-path-bar" id="jsonPathBar"></div>
      </div>
    </div>
    <div class="json-toolbar">
      <button class="btn-ghost json-op" data-op="format">格式化</button>
      <button class="btn-ghost json-op" data-op="minify">壓縮</button>
      <button class="btn-ghost json-op" data-op="escape">Escape</button>
      <button class="btn-ghost json-op" data-op="unescape">Unescape</button>
      <span id="jsonStatus" class="json-status"></span>
    </div>
  `;
}

export function init() {
  document.getElementById('jsonClear').addEventListener('click', () => {
    document.getElementById('jsonInput').value = '';
    _raw = ''; _matches = []; _cursor = 0;
    document.getElementById('jsonOutput').innerHTML = '';
    document.getElementById('jsonSearch').value = '';
    document.getElementById('jsonSearchCount').textContent = '';
    document.getElementById('jsonPathBar').textContent = '';
    setStatus('', false);
  });

  document.getElementById('jsonCopy').addEventListener('click', () => {
    if (!_raw) return;
    navigator.clipboard.writeText(_raw).then(() => setStatus('已複製', false));
  });

  document.querySelectorAll('.json-op').forEach(btn =>
    btn.addEventListener('click', () => run(btn.dataset.op)));

  document.getElementById('jsonInput').addEventListener('input', validate);

  // View toggle
  document.querySelectorAll('.json-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _view = btn.dataset.view;
      document.querySelectorAll('.json-view-btn').forEach(b =>
        b.classList.toggle('active', b === btn));
      document.getElementById('jsonSearchRow').style.display =
        _view === 'text' ? '' : 'none';
      renderOutput();
    });
  });

  // Search
  document.getElementById('jsonSearch').addEventListener('input', () => {
    _cursor = 0; highlight();
  });
  document.getElementById('jsonSearchPrev').addEventListener('click', () => {
    if (!_matches.length) return;
    _cursor = (_cursor - 1 + _matches.length) % _matches.length;
    highlight(); scrollToCurrent();
  });
  document.getElementById('jsonSearchNext').addEventListener('click', () => {
    if (!_matches.length) return;
    _cursor = (_cursor + 1) % _matches.length;
    highlight(); scrollToCurrent();
  });
}

export function run(op = 'format') {
  const input = document.getElementById('jsonInput').value.trim();
  if (!input) return;
  try {
    if (op === 'escape') {
      _raw = JSON.stringify(input);
      setStatus('OK', false);
    } else if (op === 'unescape') {
      const parsed = JSON.parse(input);
      _raw = typeof parsed === 'object' && parsed !== null
        ? JSON.stringify(parsed, null, 2)
        : String(parsed);
      setStatus('OK', false);
    } else {
      const parsed = JSON.parse(input);
      _raw = op === 'minify' ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2);
      setStatus('Valid JSON', false);
    }
    _cursor = 0;
    renderOutput();
  } catch (e) {
    setStatus(e.message, true);
  }
}

// ── Render dispatcher ─────────────────────────────────────────────────────────
function renderOutput() {
  if (_view === 'tree') renderTree();
  else highlight();
}

// ── Text mode with search highlight ──────────────────────────────────────────
function highlight() {
  const keyword = document.getElementById('jsonSearch').value;
  const countEl = document.getElementById('jsonSearchCount');
  const pre = document.getElementById('jsonOutput');
  if (!_raw) { pre.innerHTML = ''; countEl.textContent = ''; return; }
  if (!keyword) { pre.textContent = _raw; _matches = []; countEl.textContent = ''; return; }

  _matches = [];
  const lower = _raw.toLowerCase();
  const kw = keyword.toLowerCase();
  let i = 0;
  while ((i = lower.indexOf(kw, i)) !== -1) { _matches.push(i); i += kw.length; }

  if (!_matches.length) { pre.textContent = _raw; countEl.textContent = '0 / 0'; return; }
  _cursor = Math.min(_cursor, _matches.length - 1);
  countEl.textContent = `${_cursor + 1} / ${_matches.length}`;

  let html = '', pos = 0;
  _matches.forEach((start, idx) => {
    html += esc(_raw.slice(pos, start));
    const cls = idx === _cursor ? 'json-mark-cur' : 'json-mark';
    html += `<mark class="${cls}">${esc(_raw.slice(start, start + keyword.length))}</mark>`;
    pos = start + keyword.length;
  });
  html += esc(_raw.slice(pos));
  pre.innerHTML = html;
}

function scrollToCurrent() {
  document.querySelector('.json-mark-cur')?.scrollIntoView({ block: 'nearest' });
  const countEl = document.getElementById('jsonSearchCount');
  if (_matches.length) countEl.textContent = `${_cursor + 1} / ${_matches.length}`;
}

// ── Tree mode ─────────────────────────────────────────────────────────────────
function renderTree() {
  const pre = document.getElementById('jsonOutput');
  try {
    const data = JSON.parse(_raw);
    pre.innerHTML = '';
    pre.className = 'jt-root';
    pre.appendChild(buildNode(data, null, '$'));
  } catch {
    pre.textContent = _raw;
  }
}

function buildNode(data, key, path) {
  const wrap = document.createElement('div');
  wrap.className = 'jt-node';

  const row = document.createElement('div');
  row.className = 'jt-row';

  const isObj = data !== null && typeof data === 'object';
  const isArr = Array.isArray(data);
  const count = isObj ? Object.keys(data).length : 0;

  // Toggle button
  if (isObj) {
    const tog = document.createElement('span');
    tog.className = 'jt-toggle open';
    tog.textContent = '▾';
    row.appendChild(tog);
  } else {
    const sp = document.createElement('span');
    sp.className = 'jt-toggle-placeholder';
    row.appendChild(sp);
  }

  // Key
  if (key !== null) {
    const k = document.createElement('span');
    k.className = 'jt-key';
    k.textContent = isArr ? key : `"${key}"`;
    row.appendChild(k);
    const colon = document.createElement('span');
    colon.className = 'jt-colon';
    colon.textContent = ': ';
    row.appendChild(colon);
  }

  if (isObj) {
    // Bracket + count
    const bracket = document.createElement('span');
    bracket.className = 'jt-bracket';
    bracket.textContent = isArr ? `[ ${count} ]` : `{ ${count} }`;
    row.appendChild(bracket);

    // Children
    const ul = document.createElement('ul');
    ul.className = 'jt-children';
    const entries = isArr
      ? data.map((v, i) => [i, v])
      : Object.entries(data);
    entries.forEach(([k, v]) => {
      const li = document.createElement('li');
      li.appendChild(buildNode(v, k, `${path}${isArr ? `[${k}]` : `.${k}`}`));
      ul.appendChild(li);
    });

    // 箭頭：展開/收縮
    row.querySelector('.jt-toggle').addEventListener('click', e => {
      e.stopPropagation();
      const hidden = ul.classList.toggle('jt-hidden');
      row.querySelector('.jt-toggle').textContent = hidden ? '▸' : '▾';
    });

    wrap.appendChild(row);
    wrap.appendChild(ul);
  } else {
    // Primitive
    const val = document.createElement('span');
    val.className = `jt-val jt-${getType(data)}`;
    val.textContent = JSON.stringify(data);
    row.appendChild(val);
    wrap.appendChild(row);
  }

  // Key：複製該節點的內容（含子節點）
  const keyEl = row.querySelector('.jt-key');
  if (keyEl) {
    keyEl.title = '點擊複製內容';
    keyEl.addEventListener('click', e => {
      e.stopPropagation();
      const content = typeof data === 'object' && data !== null
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);
      navigator.clipboard.writeText(content);
      document.getElementById('jsonPathBar').textContent = `已複製：${path}`;
    });
  }

  return wrap;
}

function getType(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return 'number';
  return 'string';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function validate() {
  const v = document.getElementById('jsonInput').value.trim();
  if (!v) { setStatus('', false); return; }
  try { JSON.parse(v); setStatus('Valid JSON', false); }
  catch (e) { setStatus(e.message, true); }
}

function setStatus(msg, isError) {
  const el = document.getElementById('jsonStatus');
  el.textContent = msg;
  el.className = 'json-status' + (isError ? ' json-status-error' : ' json-status-ok');
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
