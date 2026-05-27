export function template() {
  return `
    <p class="muted">支援 \\uXXXX、\\u{XXXX} 以及 JSON 字串解析。</p>
    <textarea id="input" placeholder="貼入 JSON 或 \\uXXXX、\\u{XXXX}"></textarea>
    <button id="convertBtn" data-primary>轉換</button>
    <h3>結果：</h3>
    <pre id="output"></pre>
  `;
}

export function init() {
  document.getElementById('convertBtn').addEventListener('click', convert);
}

function convert() {
  let output = document.getElementById('input').value;
  try {
    output = output.replace(/\\u\{([0-9a-fA-F]+)\}/g,
      (_, c) => String.fromCodePoint(parseInt(c, 16)));
    output = output.replace(/\\u([0-9a-fA-F]{4})/g,
      (_, c) => String.fromCharCode(parseInt(c, 16)));
    try {
      const parsed = JSON.parse(output);
      output = typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : parsed;
    } catch (_) {}
    document.getElementById('output').textContent = output;
  } catch (e) {
    document.getElementById('output').textContent = '轉換錯誤：' + e;
  }
}
