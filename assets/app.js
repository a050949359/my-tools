const TOOLS = [
  { id: 'text',        label: '文字轉換',        src: './tools/text.js'        },
  { id: 'image',       label: '圖片 → Base64',   src: './tools/image.js'       },
  { id: 'placeholder', label: 'Placeholder 生成', src: './tools/placeholder.js' },
  { id: 'qr',          label: 'QR Code 生成',     src: './tools/qr.js'          },
  { id: 'svg',         label: 'SVG → PNG',        src: './tools/svg.js'         },
  { id: 'heic',        label: 'HEIC → PNG',       src: './tools/heic.js'        },
];

const sidebar = document.getElementById('sidebar');
sidebar.innerHTML =
  '<div class="side-title">功能導覽</div>' +
  '<div class="tabs">' +
  TOOLS.map(t =>
    `<a class="tab" href="#${t.id}" data-tool="${t.id}">${t.label}</a>`
  ).join('') +
  '</div>';

const content = document.getElementById('content');
const cache = {};
let cleanup = null;

async function navigate(id) {
  const tool = TOOLS.find(t => t.id === id) || TOOLS[0];

  if (cleanup) { cleanup(); cleanup = null; }

  if (!cache[tool.id]) cache[tool.id] = await import(tool.src);
  const mod = cache[tool.id];

  content.innerHTML = `<div class="tool active">${mod.template()}</div>`;

  const result = await mod.init();
  if (typeof result === 'function') cleanup = result;

  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tool === tool.id)
  );
}

function toolId() { return location.hash.slice(1) || 'text'; }

window.addEventListener('hashchange', () => navigate(toolId()));
navigate(toolId());
