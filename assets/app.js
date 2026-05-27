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
      { id: 'image',       label: '圖片 → Base64',   src: './tools/image.js'       },
      { id: 'placeholder', label: 'Placeholder 生成', src: './tools/placeholder.js' },
      { id: 'svg',         label: 'SVG → PNG',        src: './tools/svg.js'         },
      { id: 'heic',        label: 'HEIC → PNG',       src: './tools/heic.js'        },
    ]
  },
  {
    label: '開發者工具',
    icon: '</>',
    tools: [
      { id: 'qr',  label: 'QR Code 生成',  src: './tools/qr.js'  },
      { id: 'rsa', label: 'RSA 金鑰產生器', src: './tools/rsa.js' },
    ]
  },
];

const TOOLS = TOOL_GROUPS.flatMap(g => g.tools);

// ── Sidebar ──────────────────────────────────────────────────────────────────
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
          <span class="nav-group-icon">${g.icon}</span>
          ${g.label}
        </div>
        ${g.tools.map(t =>
          `<a class="nav-item" href="#${t.id}" data-tool="${t.id}">${t.label}</a>`
        ).join('')}
      </div>
    `).join('')}
  </div>
`;

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

  // Render header (依工具決定是否顯示執行鍵)
  contentHeader.innerHTML = `
    <div class="content-header-left">
      <h1 class="tool-title">${tool.label}</h1>
    </div>
    <div class="header-actions">
      ${mod.reset ? '<button class="reset-btn" id="resetBtn">↺ 重置</button>' : ''}
      ${hasPrimary ? '<button class="run-btn" id="runBtn">▶ 執行</button>' : ''}
    </div>
  `;

  // Wire Reset button
  document.getElementById('resetBtn')?.addEventListener('click', () => mod.reset());

  // Wire Run button
  document.getElementById('runBtn')?.addEventListener('click', () => {
    content.querySelector('[data-primary]')?.click();
  });

  // Update active state in sidebar
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.tool === tool.id)
  );
}

function toolId() { return location.hash.slice(1) || TOOLS[0].id; }

window.addEventListener('hashchange', () => navigate(toolId()));
navigate(toolId());
