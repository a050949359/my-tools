export function template() {
  return `
    <p class="muted">解析 URL 各組成、Query 參數展開，以及編解碼轉換。</p>
    <textarea id="urlInput" rows="2" placeholder="貼入完整 URL，例如 https://example.com/path?foo=bar&baz=1#section"></textarea>
    <button id="urlParseBtn" data-primary>解析</button>

    <div id="urlResult" style="display:none;">

      <h3>組成</h3>
      <table class="url-table" id="urlParts"></table>

      <h3>Query 參數</h3>
      <table class="url-table" id="urlParams">
        <tr><td class="url-empty" colspan="2">無</td></tr>
      </table>

      <h3>編解碼</h3>
      <div class="grid-2">
        <div>
          <label>encodeURIComponent</label>
          <div class="url-copy-row">
            <input type="text" id="urlEncoded" readonly>
            <button class="btn-ghost" id="urlCopyEnc">複製</button>
          </div>
        </div>
        <div>
          <label>decodeURIComponent</label>
          <div class="url-copy-row">
            <input type="text" id="urlDecoded" readonly>
            <button class="btn-ghost" id="urlCopyDec">複製</button>
          </div>
        </div>
      </div>

    </div>
  `;
}

export function init() {
  document.getElementById('urlParseBtn').addEventListener('click', parse);
  document.getElementById('urlInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); parse(); }
  });
  document.getElementById('urlCopyEnc').addEventListener('click', () =>
    copy(document.getElementById('urlEncoded').value));
  document.getElementById('urlCopyDec').addEventListener('click', () =>
    copy(document.getElementById('urlDecoded').value));
}

function parse() {
  const raw = document.getElementById('urlInput').value.trim();
  if (!raw) return;

  // 如果輸入本身是 encoded URL，先 decode 再解析
  let input = raw;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) input = decoded;
  } catch { /* 不是合法的 encoded 字串，維持原樣 */ }

  let u;
  try { u = new URL(input); }
  catch {
    // 嘗試補 https:// 再解析
    try { u = new URL('https://' + input); }
    catch { alert('無法解析此 URL'); return; }
  }

  // ── 組成表 ───────────────────────────────────────────────
  const parts = [
    ['Protocol',  u.protocol],
    ['Host',      u.host],
    ['Hostname',  u.hostname],
    ['Port',      u.port || '（預設）'],
    ['Pathname',  u.pathname],
    ['Search',    u.search  || '（無）'],
    ['Hash',      u.hash    || '（無）'],
    ['Origin',    u.origin],
  ];
  document.getElementById('urlParts').innerHTML =
    parts.map(([k, v]) => `
      <tr>
        <td class="url-key">${k}</td>
        <td class="url-val">${esc(v)}</td>
      </tr>`).join('');

  // ── Query 參數表 ─────────────────────────────────────────
  const params = [...u.searchParams.entries()];
  document.getElementById('urlParams').innerHTML = params.length
    ? params.map(([k, v]) => `
        <tr>
          <td class="url-key">${esc(k)}</td>
          <td class="url-val">${esc(v)}</td>
        </tr>`).join('')
    : '<tr><td class="url-empty" colspan="2">無</td></tr>';

  // ── 編解碼 ───────────────────────────────────────────────
  document.getElementById('urlEncoded').value = encodeURIComponent(raw);
  document.getElementById('urlDecoded').value = (() => {
    try { return decodeURIComponent(raw); } catch { return raw; }
  })();

  document.getElementById('urlResult').style.display = 'block';
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function copy(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => alert('已複製'));
}
