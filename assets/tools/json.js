let _raw = '';
let _matches = [];
let _cursor = 0;
let _view = 'text'; // 'text' | 'tree'
let _errPos = null;  // 解析錯誤在輸入框中的字元位置，null 表示無錯誤

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
    <pre id="jsonErrSnippet" class="json-err-snippet" hidden></pre>
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

  // 點錯誤訊息或片段 → 跳到輸入框出錯位置
  document.getElementById('jsonStatus').addEventListener('click', jumpToError);
  document.getElementById('jsonErrSnippet').addEventListener('click', jumpToError);

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
    showParseError(document.getElementById('jsonInput').value, e);
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
  const raw = document.getElementById('jsonInput').value;
  const v = raw.trim();
  if (!v) { setStatus('', false); return; }
  try { JSON.parse(v); setStatus('Valid JSON', false); }
  catch (e) { showParseError(raw, e); }
}

function setStatus(msg, isError) {
  const el = document.getElementById('jsonStatus');
  el.textContent = msg;
  el.title = '';
  el.className = 'json-status' + (isError ? ' json-status-error' : ' json-status-ok');
  _errPos = null;
  document.getElementById('jsonErrSnippet').hidden = true;
}

// ── 錯誤定位 ──────────────────────────────────────────────────────────────────
// raw 為輸入框原文（未 trim），e 為 JSON.parse 拋出的錯誤
function showParseError(raw, e) {
  const loc = locateError(raw, e.message);
  if (!loc) { setStatus(e.message, true); return; }

  const { pos, inStr } = loc;
  const before = raw.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  const hint = hintAt(raw, pos, inStr);

  setStatus(`第 ${line} 行第 ${col} 欄：${hint || e.message}`, true);
  const el = document.getElementById('jsonStatus');
  el.classList.add('json-status-jump');
  el.title = hint ? `${e.message}\n（點擊跳到錯誤位置）` : '點擊跳到錯誤位置';
  _errPos = pos;
  renderSnippet(raw, pos, col);
}

// 找出錯誤在 raw 中的位置 → { pos: 字元 offset, inStr: 是否在字串內 }，找不到回傳 null
// 先用自製掃描器（各瀏覽器結果一致），掃描器沒抓到才退回解析錯誤訊息
//   Chrome: "... at position 42 (line 3 column 5)"，部分錯誤無位置
//   Firefox: "... at line 3 column 5 of the JSON data"
//   Safari: 無位置資訊
function locateError(raw, msg) {
  const lead = raw.length - raw.trimStart().length; // JSON.parse 吃的是 trim 後的字串
  const text = raw.trim();
  const scanned = scanError(text);
  if (scanned) return { pos: lead + scanned.pos, inStr: scanned.inStr };
  const at = off => ({ pos: lead + Math.min(off, text.length), inStr: false });
  let m;
  if ((m = msg.match(/position (\d+)/))) return at(+m[1]);
  if ((m = msg.match(/line (\d+) column (\d+)/))) {
    const lines = text.split('\n');
    const ln = Math.min(+m[1], lines.length);
    let off = 0;
    for (let i = 0; i < ln - 1; i++) off += lines[i].length + 1;
    return at(off + +m[2] - 1);
  }
  if (/unexpected end|end of (json )?(input|data)/i.test(msg)) return at(text.length);
  return null;
}

// 依 JSON 規格掃描，回傳第一個不合法字元 { pos, inStr }；合法回傳 null
function scanError(s) {
  let i = 0;
  let inStr = false;
  const fail = () => { throw i; };
  const ws = () => { while (i < s.length && ' \t\n\r'.includes(s[i])) i++; };
  const lit = w => { for (const c of w) { if (s[i] !== c) fail(); i++; } };
  const num = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;
  const str = () => {
    i++; inStr = true;
    while (s[i] !== '"') {
      if (i >= s.length || s[i] < ' ') fail();
      if (s[i] === '\\') {
        i++;
        if (s[i] === 'u') {
          for (let k = 0; k < 4; k++) { i++; if (!/[0-9a-fA-F]/.test(s[i] ?? '')) fail(); }
        } else if (!'"\\/bfnrt'.includes(s[i] ?? 'x')) fail();
      }
      i++;
    }
    i++; inStr = false;
  };
  const value = () => {
    ws();
    const c = s[i];
    if (c === '{') {
      i++; ws();
      if (s[i] === '}') { i++; return; }
      for (;;) {
        ws();
        if (s[i] !== '"') fail();
        str(); ws();
        if (s[i] !== ':') fail();
        i++; value(); ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; return; }
        fail();
      }
    }
    if (c === '[') {
      i++; ws();
      if (s[i] === ']') { i++; return; }
      for (;;) {
        value(); ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return; }
        fail();
      }
    }
    if (c === '"') return str();
    if (c === 't') return lit('true');
    if (c === 'f') return lit('false');
    if (c === 'n') return lit('null');
    num.lastIndex = i;
    if (num.test(s)) { i = num.lastIndex; return; }
    fail();
  };
  try {
    value(); ws();
    if (i < s.length) fail();
    return null;
  } catch (pos) {
    if (typeof pos === 'number') return { pos, inStr };
    throw pos;
  }
}

// 常見錯誤的中文提示，判斷不出來回傳空字串（改顯示原始訊息）
function hintAt(raw, pos, inStr) {
  if (pos >= raw.trimEnd().length) {
    return inStr ? '字串沒有結尾的 "' : '內容不完整，可能缺少 } 或 ]';
  }
  const ch = raw[pos];
  if (inStr) {
    if (ch < ' ') return '字串內不能直接放換行或 Tab，請改用 \\n、\\t';
    if (/\\(u[0-9a-fA-F]{0,3})?$/.test(raw.slice(0, pos))) return '不合法的跳脫字元（只允許 \\" \\\\ \\/ \\b \\f \\n \\r \\t \\uXXXX）';
    return '';
  }
  const prev = raw.slice(0, pos).trimEnd().slice(-1);
  if (/\d/.test(ch) && raw[pos - 1] === '0') return '數字不能以 0 開頭';
  if ((ch === '}' || ch === ']') && prev === ',') return '結尾多了逗號';
  if (ch === "'") return '字串和 key 必須用雙引號 "';
  if (ch === '/') return 'JSON 不支援註解';
  // 值結尾後直接接下一個值 → 少逗號（prev 為字母時代表 true/false/null 結尾）
  if (/["{\[\d\-tfn]/.test(ch) && /["}\]\dela]/.test(prev) && /\s/.test(raw[pos - 1])) return '前面可能少了逗號';
  if (/[A-Za-z_$]/.test(ch)) {
    if (prev === '{') return 'key 必須加雙引號';
    if (!/[A-Za-z]/.test(prev)) return '字串必須加雙引號（或 true / false / null 拼錯）';
  }
  if (/[A-Za-z]/.test(raw[pos - 1] ?? '')) return 'true / false / null 拼錯？';
  if (/["{\[\d-]/.test(ch) && /["}\]\de]/.test(prev)) return '前面可能少了逗號';
  return '';
}

// 錯誤所在行的片段 + ^ 指標（長行只取錯誤附近）
function renderSnippet(raw, pos, col) {
  const lineStart = raw.lastIndexOf('\n', pos - 1) + 1;
  let lineEnd = raw.indexOf('\n', pos);
  if (lineEnd === -1) lineEnd = raw.length;
  const lineText = raw.slice(lineStart, lineEnd).replace(/\t/g, ' ');

  const from = Math.max(0, col - 1 - 40);
  const to = Math.min(lineText.length, col - 1 + 40);
  const snippet = (from > 0 ? '…' : '') + lineText.slice(from, to) + (to < lineText.length ? '…' : '');
  const caretAt = col - 1 - from + (from > 0 ? 1 : 0);

  const pre = document.getElementById('jsonErrSnippet');
  pre.innerHTML = `${esc(snippet)}\n${' '.repeat(caretAt)}<span class="json-err-caret">^</span>`;
  pre.hidden = false;
}

function jumpToError() {
  if (_errPos == null) return;
  const ta = document.getElementById('jsonInput');
  ta.focus();
  ta.setSelectionRange(_errPos, Math.min(_errPos + 1, ta.value.length));
  // 依行號估算捲動位置（長行自動換行時會略有誤差）
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  const line = ta.value.slice(0, _errPos).split('\n').length - 1;
  ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 2);
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
