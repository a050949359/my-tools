const TOOL_GROUPS = [
  {
    label: '文字工具',
    icon: '✎',
    tools: [
      { id: 'text', label: '文字轉換', src: './tools/text.js' },
    ]
  },
  {
    label: '圖片工具',
    icon: '⊞',
    tools: [
      { id: 'image',       label: '圖片編輯',          src: './tools/image.js'       },
      { id: 'placeholder', label: 'Placeholder 生成', src: './tools/placeholder.js' },
      { id: 'svg',         label: 'SVG → PNG',        src: './tools/svg.js'         },
      { id: 'heic',        label: 'HEIC → PNG',       src: './tools/heic.js'        },
      { id: 'imageBrowser', label: '本地圖片瀏覽器',  src: './tools/imageBrowser.js' },
      { id: 'imageTracer',  label: '圖片 → SVG 描邊', src: './tools/imageTracer.js'  },
      { id: 'imageHotspot', label: 'SVG 互動熱區',    src: './tools/imageHotspot.js' },
    ]
  },
  {
    label: '行動裝置',
    icon: '📱',
    tools: [
      { id: 'sensor', label: '感測器監控', src: './tools/sensor.js' },
    ]
  },
  {
    label: '開發者工具',
    icon: '</>',
    tools: [
      { id: 'qr',    label: 'QR Code 生成',   src: './tools/qr.js'    },
      { id: 'rsa',   label: 'RSA 金鑰產生器', src: './tools/rsa.js'   },
      { id: 'url',   label: 'URL 解析',        src: './tools/url.js'   },
      { id: 'json',     label: 'JSON 格式化',     src: './tools/json.js'     },
      { id: 'regex',    label: 'Regex 測試器',    src: './tools/regex.js'    },
      { id: 'markdown', label: 'Markdown 預覽',   src: './tools/markdown.js' },
    ]
  },
];

const TOOLS = TOOL_GROUPS.flatMap(g => g.tools);

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Sidebar (desktop) ─────────────────────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
sidebar.innerHTML = `
  <div class="logo">
    <div class="logo-icon">🛠</div>
    <span class="logo-text">多功能工具</span>
  </div>
  <div class="nav-groups">
    ${TOOL_GROUPS.map(g => `
      <div class="nav-group">
        <div class="nav-group-label">
          <span class="nav-group-icon">${escHtml(g.icon)}</span>
          ${g.label}
        </div>
        ${g.tools.map(t =>
          `<a class="nav-item" href="#${t.id}" data-tool="${t.id}">${t.label}</a>`
        ).join('')}
      </div>
    `).join('')}
  </div>
`;

// ── Mobile select (插入 content-header 前) ────────────────────────────────────
const mobileBar = document.getElementById('mobile-bar');
mobileBar.innerHTML = `
  <div class="logo-icon" style="width:22px;height:22px;font-size:11px;flex-shrink:0;">🛠</div>
  <select id="mobileSelect" class="mobile-select">
    ${TOOL_GROUPS.map(g => `
      <optgroup label="${escHtml(g.icon)} ${g.label}">
        ${g.tools.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
      </optgroup>
    `).join('')}
  </select>
`;

document.getElementById('mobileSelect').addEventListener('change', e => {
  location.hash = e.target.value;
});

// ── Navigation ────────────────────────────────────────────────────────────────
const contentHeader = document.getElementById('content-header');
const content = document.getElementById('content');
const cache = {};
let cleanup = null;

async function navigate(id) {
  const tool = TOOLS.find(t => t.id === id) || TOOLS[0];

  if (cleanup) { cleanup(); cleanup = null; }

  if (!cache[tool.id]) cache[tool.id] = await import(tool.src);
  const mod = cache[tool.id];

  // Render tool first
  content.innerHTML = `<div class="tool">${mod.template()}</div>`;

  const result = await mod.init();
  if (typeof result === 'function') cleanup = result;

  const hasPrimary = !!content.querySelector('[data-primary]');

  // Render header
  contentHeader.innerHTML = `
    <div class="content-header-left">
      <h1 class="tool-title">${tool.label}</h1>
    </div>
    <div class="header-actions">
      ${mod.reset ? '<button class="reset-btn" id="resetBtn">↺ 重置</button>' : ''}
      ${hasPrimary ? '<button class="run-btn" id="runBtn">▶ 執行</button>' : ''}
    </div>
  `;

  document.getElementById('resetBtn')?.addEventListener('click', () => mod.reset());
  document.getElementById('runBtn')?.addEventListener('click', () => {
    content.querySelector('[data-primary]')?.click();
  });

  // Sync sidebar active
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.tool === tool.id)
  );

  // Sync mobile select
  const sel = document.getElementById('mobileSelect');
  if (sel) sel.value = tool.id;
}

function toolId() { return location.hash.slice(1) || TOOLS[0].id; }

window.addEventListener('hashchange', () => navigate(toolId()));
navigate(toolId());
