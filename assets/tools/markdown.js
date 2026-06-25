const SAMPLE = `# Markdown 預覽

支援完整 CommonMark + GFM，左側輸入、右側即時渲染。

## 文字樣式

**粗體**、*斜體*、~~刪除線~~、\`行內程式碼\`、[連結](https://example.com)。

## 清單

- 項目一
- 項目二
  - 巢狀項目
    - 更深一層
- 項目三

1. 第一步
2. 第二步
3. 第三步

## 任務清單（GFM）

- [x] 已完成
- [ ] 待辦事項

## 引用

> 這是一段引用文字。
>
> > 巢狀引用也支援。

## 程式碼區塊

\`\`\`js
function hello(name) {
  return 'Hello, ' + name;
}
\`\`\`

## 表格

| 名稱 | 型別 | 對齊 |
|:-----|:----:|-----:|
| id   | int  | 右   |
| name | text | 右   |

## 圖表（Mermaid）

\`\`\`mermaid
flowchart LR
  A[開始] --> B{條件?}
  B -- 是 --> C[執行]
  B -- 否 --> D[結束]
  C --> D
\`\`\`

## 圖片與分隔線

![placeholder](https://placehold.co/120x40)

---

> 提示：可直接拖曳 \`.md\` 檔案到輸入區。
`;

let _configured = false;
const docParser = new DOMParser();                              // 重用，避免每次解析都新建
const controlCharsRegex = new RegExp('[\\u0000-\\u0020]+', 'g'); // 控制字元 + 空白

// HTML 文字跳脫（供 code 區塊、原始 HTML 轉純文字共用）
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loadLib() {
  if (typeof marked !== 'undefined') return Promise.resolve().then(configure);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/marked.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  }).then(configure);
}

// Mermaid 延遲載入（僅在文件含 ```mermaid 區塊時才注入，~3MB）
let _mermaidLoading = null;
let _mermaidInited = false;
let mermaidIdSeq = 0;
function loadMermaid() {
  if (typeof mermaid !== 'undefined') return Promise.resolve();
  if (_mermaidLoading) return _mermaidLoading;
  _mermaidLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/mermaid.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return _mermaidLoading;
}

// 將預覽區內的 .md-mermaid 區塊逐一渲染成 SVG；語法錯誤時退回顯示原始碼
async function renderMermaid(blocks) {
  try {
    await loadMermaid();
  } catch {
    blocks.forEach(b => mermaidError(b, b.textContent, '圖表函式庫載入失敗'));
    return;
  }
  if (typeof mermaid === 'undefined') return;
  if (!_mermaidInited) {
    _mermaidInited = true;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
  }
  for (const block of blocks) {
    if (!block.isConnected) continue;           // 已被新一輪渲染抽換，略過
    const src = block.textContent;
    try {
      const { svg } = await mermaid.render('mmd-' + (mermaidIdSeq++), src);
      if (block.isConnected) { block.innerHTML = svg; block.classList.add('md-mermaid-done'); }
    } catch {
      if (block.isConnected) mermaidError(block, src, 'Mermaid 圖表語法錯誤');
    }
  }
}

function mermaidError(block, src, msg) {
  block.classList.add('md-mermaid-error');
  block.textContent = '⚠ ' + msg;
  const pre = document.createElement('pre');
  pre.textContent = src;                         // textContent 安全，不會注入 HTML
  block.appendChild(pre);
}

// 解碼 HTML 實體 + 去控制字元後，以白名單檢查協定；不安全則改為 #
// allowDataImage：圖片可額外放行 data:image/*（base64 內嵌圖，<img> 不會執行）
function safeHref(href, allowDataImage) {
  if (!href) return href;
  const doc = docParser.parseFromString(href, 'text/html');   // 安全解碼 HTML 實體（不執行 script）
  const decoded = (doc.body.textContent || '').replace(controlCharsRegex, '').toLowerCase();
  const m = decoded.match(/^([a-z][a-z0-9+.-]*):/);     // 取出協定（無協定 = 相對/錨點，放行）
  if (!m) return href;
  if (['http', 'https', 'mailto', 'tel'].includes(m[1])) return href;
  if (allowDataImage && /^data:image\//.test(decoded)) return href;
  return '#';
}

// 輕量防護：原始 HTML 一律轉義為純文字、非白名單協定連結改為 #（只設定一次）
function configure() {
  if (_configured) return;
  _configured = true;
  marked.use({
    walkTokens(t) {
      if (t.type === 'link') t.href = safeHref(t.href, false);
      else if (t.type === 'image') t.href = safeHref(t.href, true);
    },
    renderer: {
      html(t) {
        const raw = typeof t === 'string' ? t : t.text;
        return escapeHtml(raw);
      },
      // 攔截 ```mermaid 區塊：保留原始碼（跳脫後放入 div），稍後由 renderMermaid() 畫成 SVG
      code(code, infostring) {
        const lang = (infostring || '').match(/^\S*/)?.[0] || '';
        if (lang === 'mermaid') return `<div class="md-mermaid">${escapeHtml(code)}</div>`;
        const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
        return `<pre><code${cls}>${escapeHtml(code)}</code></pre>\n`;
      }
    }
  });
}

function parse(src) {
  if (!src || !src.trim()) return '';
  if (typeof marked === 'undefined') return '<p style="color:var(--primary)">Markdown 函式庫未載入</p>';
  try {
    return marked.parse(src, { gfm: true, breaks: false });
  } catch (e) {
    console.error('Markdown parse error:', e);
    return '<p style="color:var(--primary)">Markdown 解析出錯</p>';
  }
}

// 複製文字：優先 Clipboard API，非安全上下文退回 execCommand
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((res, rej) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); res(); }
    catch (e) { rej(e); }
    finally { document.body.removeChild(ta); }
  });
}

export function template() {
  return `
    <div class="md-topbar">
      <p class="muted" style="margin:0;">即時預覽 Markdown，完整支援 CommonMark + GFM（表格、任務清單、刪除線等）。可拖曳 <code>.md</code> 檔案載入。</p>
      <div class="json-view-toggle" id="mdViewToggle">
        <button class="json-view-btn" data-view="left">原始</button>
        <button class="json-view-btn active" data-view="both">並排</button>
        <button class="json-view-btn" data-view="right">預覽</button>
      </div>
    </div>
    <div class="json-shell" id="mdShell">
      <div class="json-panel">
        <div class="json-panel-header">
          <span>MARKDOWN</span>
          <div class="button-row" style="gap:6px;margin:0;">
            <button class="btn-ghost" id="mdSample">範例</button>
            <button class="btn-ghost" id="mdClear">Clear</button>
          </div>
        </div>
        <textarea id="mdInput" spellcheck="false" placeholder="在此輸入 Markdown…"></textarea>
      </div>
      <div class="json-panel">
        <div class="json-panel-header">
          <span>預覽</span>
          <div class="button-row" style="gap:6px;margin:0;">
            <button class="btn-ghost" id="mdCopyHtml">複製 HTML</button>
          </div>
        </div>
        <div class="json-output-wrap">
          <div class="md-preview" id="mdPreview"></div>
        </div>
      </div>
    </div>
    <div class="json-toolbar">
      <span id="mdStatus" class="json-status"></span>
    </div>
  `;
}

export async function init() {
  const input = document.getElementById('mdInput');
  const preview = document.getElementById('mdPreview');

  try {
    await loadLib();
  } catch {
    if (input && input.isConnected) setStatus('Markdown 函式庫載入失敗', true);
    return;
  }

  // 載入期間若使用者已切換工具，DOM 已抽換，直接中斷避免在卸載節點上綁事件
  if (!input || !input.isConnected) return;

  const render = () => {
    preview.innerHTML = parse(input.value);
    const blocks = preview.querySelectorAll('.md-mermaid');
    if (blocks.length) renderMermaid(blocks);
  };

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 120);
  });

  document.getElementById('mdSample').addEventListener('click', () => {
    input.value = SAMPLE; render();
  });

  document.getElementById('mdClear').addEventListener('click', () => {
    input.value = ''; render(); setStatus('');
  });

  document.getElementById('mdCopyHtml').addEventListener('click', () => {
    const html = parse(input.value);
    if (!html) return;
    copyText(html).then(() => setStatus('已複製 HTML')).catch(() => setStatus('複製失敗', true));
  });

  // 檢視切換：原始（只顯示左）/ 並排 / 預覽（只顯示右）
  const shell = document.getElementById('mdShell');
  const viewToggle = document.getElementById('mdViewToggle');
  viewToggle.addEventListener('click', e => {
    const btn = e.target.closest('.json-view-btn');
    if (!btn) return;
    shell.classList.remove('md-view-left', 'md-view-right');
    if (btn.dataset.view === 'left') shell.classList.add('md-view-left');
    else if (btn.dataset.view === 'right') shell.classList.add('md-view-right');
    viewToggle.querySelectorAll('.json-view-btn').forEach(b => b.classList.toggle('active', b === btn));
  });

  // 拖曳 .md 檔載入
  const panel = input.closest('.json-panel');
  ['dragover', 'dragenter'].forEach(ev =>
    panel.addEventListener(ev, e => { e.preventDefault(); panel.classList.add('md-drag'); }));
  ['dragleave', 'drop'].forEach(ev =>
    panel.addEventListener(ev, e => { e.preventDefault(); panel.classList.remove('md-drag'); }));
  panel.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['md', 'markdown', 'txt'].includes(ext) && !file.type.startsWith('text/')) {
      setStatus('不支援的檔案格式，請拖曳 .md / .markdown / .txt', true);
      return;
    }
    if (file.size > 5 * 1024 * 1024) { setStatus('檔案過大（上限 5MB）', true); return; }
    const reader = new FileReader();
    reader.onload = () => { input.value = reader.result; render(); setStatus('已載入 ' + file.name); };
    reader.readAsText(file);
  });

  render();
}

export function reset() {
  const input = document.getElementById('mdInput');
  if (input) { input.value = ''; document.getElementById('mdPreview').innerHTML = ''; setStatus(''); }
}

function setStatus(msg, isError) {
  const el = document.getElementById('mdStatus');
  if (el) { el.textContent = msg; el.className = 'json-status ' + (isError ? 'json-status-error' : 'json-status-ok'); }
}
