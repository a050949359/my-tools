let _privateKey = '';
let _publicKey  = '';

export function template() {
  return `
    <p class="muted">金鑰於瀏覽器本地產生，不會傳送至任何伺服器。</p>
    <div class="grid-2">
      <div><label>用途</label>
        <select id="rsaUsage">
          <option value="encrypt">RSA-OAEP（加解密）</option>
          <option value="sign">RSA-PSS（簽章驗章）</option>
        </select>
      </div>
      <div><label>金鑰長度</label>
        <select id="rsaBits">
          <option value="2048" selected>2048 bits</option>
          <option value="4096">4096 bits</option>
        </select>
      </div>
    </div>
    <div><label>匯出格式</label>
      <select id="rsaFormat">
        <option value="pem" selected>PEM</option>
        <option value="jwk">JWK</option>
      </select>
    </div>
    <button id="rsaGenBtn" data-primary>產生金鑰對</button>
    <div id="rsaResult" style="display:none;">
      <div style="margin-top:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <label style="margin:0;">PRIVATE KEY</label>
          <div style="display:flex;gap:6px;">
            <button id="rsaCopyPriv" class="btn-ghost">複製</button>
            <button id="rsaDlPriv"   class="btn-ghost">下載</button>
          </div>
        </div>
        <textarea id="rsaPrivOutput" rows="8" readonly></textarea>
      </div>
      <div style="margin-top:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <label style="margin:0;">PUBLIC KEY</label>
          <div style="display:flex;gap:6px;">
            <button id="rsaCopyPub" class="btn-ghost">複製</button>
            <button id="rsaDlPub"   class="btn-ghost">下載</button>
          </div>
        </div>
        <textarea id="rsaPubOutput" rows="5" readonly></textarea>
      </div>
    </div>
    <p id="rsaStatus" class="muted" style="margin-top:12px;"></p>
  `;
}

export async function init() {
  document.getElementById('rsaGenBtn').addEventListener('click', generate);
  document.getElementById('rsaCopyPriv').addEventListener('click', () => copyText(_privateKey));
  document.getElementById('rsaCopyPub' ).addEventListener('click', () => copyText(_publicKey));
  document.getElementById('rsaDlPriv'  ).addEventListener('click', () => download(_privateKey, 'private_key', document.getElementById('rsaFormat').value));
  document.getElementById('rsaDlPub'   ).addEventListener('click', () => download(_publicKey,  'public_key',  document.getElementById('rsaFormat').value));
}

async function generate() {
  const usage  = document.getElementById('rsaUsage').value;
  const bits   = parseInt(document.getElementById('rsaBits').value);
  const format = document.getElementById('rsaFormat').value;
  const status = document.getElementById('rsaStatus');

  status.textContent = '產生中…';
  document.getElementById('rsaResult').style.display = 'none';

  try {
    const isEncrypt = usage === 'encrypt';
    const algo = isEncrypt
      ? { name: 'RSA-OAEP', modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }
      : { name: 'RSA-PSS',  modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
    const uses = isEncrypt ? ['encrypt', 'decrypt'] : ['sign', 'verify'];

    const { privateKey, publicKey } = await crypto.subtle.generateKey(algo, true, uses);

    if (format === 'jwk') {
      const [privJwk, pubJwk] = await Promise.all([
        crypto.subtle.exportKey('jwk', privateKey),
        crypto.subtle.exportKey('jwk', publicKey),
      ]);
      _privateKey = JSON.stringify(privJwk, null, 2);
      _publicKey  = JSON.stringify(pubJwk,  null, 2);
    } else {
      const [privBuf, pubBuf] = await Promise.all([
        crypto.subtle.exportKey('pkcs8', privateKey),
        crypto.subtle.exportKey('spki',  publicKey),
      ]);
      _privateKey = toPem(privBuf, 'PRIVATE KEY');
      _publicKey  = toPem(pubBuf,  'PUBLIC KEY');
    }

    document.getElementById('rsaPrivOutput').value = _privateKey;
    document.getElementById('rsaPubOutput' ).value = _publicKey;
    document.getElementById('rsaResult').style.display = 'block';
    status.textContent = `RSA-${bits} 金鑰對產生完成。`;
  } catch (e) {
    status.textContent = '產生失敗：' + e.message;
  }
}

function toPem(buffer, label) {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const lines = b64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function copyText(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => alert('已複製'));
}

function download(text, name, format) {
  if (!text) return;
  const ext = format === 'jwk' ? 'json' : 'pem';
  const a = document.createElement('a');
  a.download = `${name}.${ext}`;
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.click();
  URL.revokeObjectURL(a.href);
}
