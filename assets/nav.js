const TOOLS = [
  { id: 'text',        label: '文字轉換',        file: 'index.html',       root: true  },
  { id: 'image',       label: '圖片 → Base64',   file: 'image.html',       root: false },
  { id: 'placeholder', label: 'Placeholder 生成', file: 'placeholder.html', root: false },
  { id: 'qr',          label: 'QR Code 生成',     file: 'qr.html',          root: false },
  { id: 'svg',         label: 'SVG → PNG',        file: 'svg.html',         root: false },
  { id: 'heic',        label: 'HEIC → PNG',       file: 'heic.html',        root: false },
];

(function () {
  const inTools = location.pathname.includes('/tools/');
  const current = document.body.dataset.tool;
  const el = document.getElementById('sidebar');
  if (!el) return;
  el.innerHTML =
    '<div class="side-title">功能導覽</div>' +
    '<div class="tabs">' +
    TOOLS.map(t => {
      const href = t.root
        ? (inTools ? '../index.html' : 'index.html')
        : (inTools ? t.file : 'tools/' + t.file);
      return '<a class="tab' + (t.id === current ? ' active' : '') +
             '" href="' + href + '">' + t.label + '</a>';
    }).join('') +
    '</div>';
})();
