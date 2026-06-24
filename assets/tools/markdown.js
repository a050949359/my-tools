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

## 圖片與分隔線

![placeholder](https://placehold.co/120x40)

---

> 提示：可直接拖曳 \`.md\` 檔案到輸入區。
`;

let _configured = false;

function loadLib() {
  if (typeof marked !== 'undefined') return Promise.resolve().then(configure);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/marked.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  }).then(configure);
}

// 輕量防護：原始 HTML 一律轉義為純文字、危險協定連結改為 #（只設定一次）
function configure() {
  if (_configured) return;
  _configured = true;
  marked.use({
    walkTokens(t) {
      if (t.type === 'link' && /^\s*(javascript|vbscript|data|file):/i.test(t.href || '')) t.href = '#';
    },
    renderer: {
      html(t) {
        const raw = typeof t === 'string' ? t : t.text;
        return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
    }
  });
}

function parse(src) {
  if (!src || !src.trim()) return '';
  return marked.parse(src, { gfm: true, breaks: false });
}

export function template() {
  return `
    <p class="muted">即時預覽 Markdown，完整支援 CommonMark + GFM（表格、任務清單、刪除線等）。可拖曳 <code>.md</code> 檔案載入。</p>
    <div class="json-shell">
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
    setStatus('Markdown 函式庫載入失敗', true);
    return;
  }

  const render = () => { preview.innerHTML = parse(input.value); };

  input.addEventListener('input', render);

  document.getElementById('mdSample').addEventListener('click', () => {
    input.value = SAMPLE; render();
  });

  document.getElementById('mdClear').addEventListener('click', () => {
    input.value = ''; render(); setStatus('');
  });

  document.getElementById('mdCopyHtml').addEventListener('click', () => {
    const html = parse(input.value);
    if (!html) return;
    navigator.clipboard.writeText(html).then(() => setStatus('已複製 HTML'));
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
