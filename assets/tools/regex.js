export function template() {
  return `
    <div class="regex-shell">

      <!-- 上：輸入區 -->
      <div class="regex-input-row">
        <span class="regex-engine-badge" title="使用瀏覽器內建 JS (ECMAScript) 引擎，不支援 PCRE 語法（\K、possessive quantifier、可變長度 lookbehind 等）">JS Engine</span>
        <span class="regex-slash">/</span>
        <input type="text" id="regexPattern" placeholder="pattern" spellcheck="false" autocomplete="off">
        <span class="regex-slash">/</span>
        <span id="regexError" class="regex-error"></span>
      </div>
      <div class="regex-flags">
        <label title="global — 找出所有匹配（不加只找第一個）"><input type="checkbox" id="flagG" checked> g</label>
        <label title="ignore case — 忽略大小寫"><input type="checkbox" id="flagI"> i</label>
        <label title="multiline — ^ $ 匹配每行開頭／結尾"><input type="checkbox" id="flagM"> m</label>
        <label title="dotAll — . 可匹配換行符 \n"><input type="checkbox" id="flagS"> s</label>
      </div>

      <!-- 中：測試文字 -->
      <div class="regex-test-wrap">
        <div id="regexHighlight" class="regex-highlight" aria-hidden="true"></div>
        <textarea id="regexTest" class="regex-textarea" placeholder="貼入測試文字…" spellcheck="false"></textarea>
      </div>

      <!-- 下：匹配清單 -->
      <div class="regex-result-bar">
        <span id="regexCount" class="muted"></span>
      </div>
      <div id="regexMatches" class="regex-matches"></div>
    </div>
  `;
}

export function init() {
  const patternEl = document.getElementById('regexPattern');
  const testEl    = document.getElementById('regexTest');
  const highlight = document.getElementById('regexHighlight');

  ['regexPattern','flagG','flagI','flagM','flagS','regexTest'].forEach(id =>
    document.getElementById(id).addEventListener('input', run)
  );

  // 同步 highlight 捲動
  testEl.addEventListener('scroll', () => {
    highlight.scrollTop  = testEl.scrollTop;
    highlight.scrollLeft = testEl.scrollLeft;
  });

  run();
}

function getRegex() {
  const pattern = document.getElementById('regexPattern').value;
  if (!pattern) return null;
  const flags =
    (document.getElementById('flagG').checked ? 'g' : '') +
    (document.getElementById('flagI').checked ? 'i' : '') +
    (document.getElementById('flagM').checked ? 'm' : '') +
    (document.getElementById('flagS').checked ? 's' : '');
  return new RegExp(pattern, flags);
}

function run() {
  const errorEl   = document.getElementById('regexError');
  const countEl   = document.getElementById('regexCount');
  const matchesEl = document.getElementById('regexMatches');
  const highlight = document.getElementById('regexHighlight');
  const text      = document.getElementById('regexTest').value;

  errorEl.textContent = '';

  if (!document.getElementById('regexPattern').value) {
    highlight.innerHTML = esc(text);
    countEl.textContent = '';
    matchesEl.innerHTML = '';
    return;
  }

  let re;
  try { re = getRegex(); } catch (e) {
    errorEl.textContent = e.message;
    highlight.innerHTML = esc(text);
    countEl.textContent = '';
    matchesEl.innerHTML = '';
    return;
  }

  // 收集所有匹配
  const matches = [];
  if (re.flags.includes('g')) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      matches.push(m);
      if (m[0].length === 0) re.lastIndex++; // 避免無限迴圈
    }
  } else {
    const m = re.exec(text);
    if (m) matches.push(m);
  }

  // 高亮
  let html = '', pos = 0;
  for (const m of matches) {
    html += esc(text.slice(pos, m.index));
    html += `<mark class="regex-mark">${esc(m[0])}</mark>`;
    pos = m.index + m[0].length;
  }
  html += esc(text.slice(pos));
  highlight.innerHTML = html;

  // 計數
  countEl.textContent = matches.length ? `${matches.length} 個匹配` : '無匹配';

  // 清單
  if (!matches.length) { matchesEl.innerHTML = ''; return; }
  matchesEl.innerHTML = matches.map((m, i) => {
    const groups = m.slice(1).map((g, gi) =>
      `<span class="regex-group">$${gi + 1}: ${g === undefined ? '<span class="muted">undefined</span>' : `<code>${esc(g)}</code>`}</span>`
    ).join('');
    return `
      <div class="regex-match-item">
        <span class="regex-match-idx">[${i}]</span>
        <code class="regex-match-val">${esc(m[0])}</code>
        <span class="muted" style="font-size:11px;">index: ${m.index}</span>
        ${groups ? `<div class="regex-groups">${groups}</div>` : ''}
      </div>`;
  }).join('');
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
