'use strict';

// 語言清單：code 給 Web Speech API (STT/TTS, BCP-47)，tl 給翻譯 API (MyMemory 短碼)
const LANGS = [
  { code: 'zh-TW', tl: 'zh-TW', label: '中文（繁體）' },
  { code: 'zh-CN', tl: 'zh-CN', label: '中文（簡體）' },
  { code: 'en-US', tl: 'en',    label: '英文 English' },
  { code: 'ja-JP', tl: 'ja',    label: '日文 日本語' },
  { code: 'ko-KR', tl: 'ko',    label: '韓文 한국어' },
  { code: 'id-ID', tl: 'id',    label: '印尼文 Indonesia' },
  { code: 'vi-VN', tl: 'vi',    label: '越南文 Tiếng Việt' },
  { code: 'th-TH', tl: 'th',    label: '泰文 ภาษาไทย' },
  { code: 'tl-PH', tl: 'tl',    label: '菲律賓文 Filipino' },
];

const el = {
  myId: document.getElementById('myId'),
  copyIdBtn: document.getElementById('copyIdBtn'),
  peerIdInput: document.getElementById('peerIdInput'),
  connectBtn: document.getElementById('connectBtn'),
  connStatus: document.getElementById('connStatus'),
  chatBox: document.getElementById('chatBox'),
  recordBtn: document.getElementById('recordBtn'),
  recHint: document.getElementById('recHint'),
  mySpeakLang: document.getElementById('mySpeakLang'),
  myHearLang: document.getElementById('myHearLang'),
  testTranslateInput: document.getElementById('testTranslateInput'),
  testTranslateBtn: document.getElementById('testTranslateBtn'),
  testTranslateResult: document.getElementById('testTranslateResult'),
  testSpeakInput: document.getElementById('testSpeakInput'),
  testSpeakBtn: document.getElementById('testSpeakBtn'),
};

let peer = null;
let conn = null;
let recognition = null;
let isRecording = false;

// ── 語言下拉選單 ─────────────────────────────────────────────
LANGS.forEach(l => {
  el.mySpeakLang.appendChild(new Option(l.label, l.code));
  el.myHearLang.appendChild(new Option(l.label, l.code));
});
el.mySpeakLang.value = 'zh-TW';
el.myHearLang.value = 'id-ID';

function tlOf(bcp47) {
  return LANGS.find(l => l.code === bcp47)?.tl || bcp47;
}

// ── 訊息列表（一律用 textContent，避免對方傳來的內容被當 HTML 執行） ──
function appendMessage(kind, text, { pending = false } = {}) {
  const div = document.createElement('div');
  div.className = 'msg msg-' + kind;

  const origEl = document.createElement('div');
  origEl.className = 'orig';
  origEl.textContent = text;
  div.appendChild(origEl);

  let trEl = null;
  if (pending) {
    trEl = document.createElement('div');
    trEl.className = 'translated';
    trEl.textContent = '翻譯中…';
    div.appendChild(trEl);
  }

  el.chatBox.appendChild(div);
  el.chatBox.scrollTop = el.chatBox.scrollHeight;
  return trEl;
}

function setStatus(text, cls) {
  el.connStatus.textContent = text;
  el.connStatus.className = 'status status-' + cls;
}

function updateRecHint() {
  el.recHint.textContent = (conn && conn.open)
    ? '已連線，說話後會自動送給對方並朗讀。'
    : '尚未連線：說話後辨識結果只會顯示在下面，不會送出，可用來單邊測試麥克風。';
}

// ── 翻譯：免費、免金鑰的 MyMemory API（有流量限制、不保證品質/穩定） ──
async function translateText(text, sourceTl, targetTl) {
  if (!text.trim() || sourceTl === targetTl) return text;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(sourceTl)}|${encodeURIComponent(targetTl)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (!translated) throw new Error('empty translation');
    return translated;
  } catch (err) {
    console.error('[walkie] translate failed:', err);
    return null;
  }
}

function speak(text, lang) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.speak(u);
}

// ── PeerJS：建立 P2P 連線 ─────────────────────────────────────
peer = new Peer();

peer.on('open', (id) => {
  el.myId.textContent = id;
  el.copyIdBtn.disabled = false;
  el.connectBtn.disabled = false;
});

peer.on('error', (err) => {
  console.error('[walkie] peer error:', err);
  setStatus('連線服務錯誤：' + err.type, 'error');
  appendMessage('system', '⚠️ 連線服務錯誤：' + err.type);
});

peer.on('disconnected', () => {
  setStatus('已離線', 'error');
});

peer.on('connection', (c) => {
  conn = c;
  appendMessage('system', '📞 對方（' + c.peer + '）連進來了');
  setupDataChannel();
});

el.copyIdBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el.myId.textContent);
    const original = el.copyIdBtn.textContent;
    el.copyIdBtn.textContent = '已複製';
    setTimeout(() => { el.copyIdBtn.textContent = original; }, 1500);
  } catch {
    // clipboard API 被瀏覽器擋掉時靜默失敗，不影響主流程
  }
});

el.connectBtn.addEventListener('click', () => {
  const targetId = el.peerIdInput.value.trim();
  if (!targetId) return;
  setStatus('連線中…', 'connecting');
  conn = peer.connect(targetId);
  setupDataChannel();
});

function setupDataChannel() {
  if (!conn) return;

  conn.on('open', () => {
    setStatus('✅ 已連線：' + conn.peer, 'connected');
    appendMessage('system', '✅ 已與 ' + conn.peer + ' 連線');
    updateRecHint();
  });

  conn.on('close', () => {
    setStatus('連線已中斷', 'error');
    appendMessage('system', '📴 連線已中斷');
    updateRecHint();
  });

  conn.on('error', (err) => {
    console.error('[walkie] connection error:', err);
    setStatus('連線錯誤', 'error');
    appendMessage('system', '⚠️ 連線錯誤：' + (err.message || err));
  });

  conn.on('data', async (data) => {
    if (!data || typeof data.text !== 'string') return;
    const peerTl = tlOf(typeof data.lang === 'string' ? data.lang : '');
    const myTl = tlOf(el.myHearLang.value);

    const trEl = appendMessage('peer', data.text, { pending: true });
    const translated = await translateText(data.text, peerTl, myTl);

    if (trEl) trEl.textContent = translated ?? '（翻譯失敗，僅顯示原文）';
    speak(translated ?? data.text, translated ? el.myHearLang.value : (data.lang || el.myHearLang.value));
  });
}

// ── Web Speech API：語音辨識（STT） ───────────────────────────
function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    el.recordBtn.disabled = true;
    el.recordBtn.textContent = '此瀏覽器不支援語音辨識';
    appendMessage('system', '⚠️ 此瀏覽器不支援 Web Speech API，請改用 Chrome 或 Edge。');
    return null;
  }

  const r = new SR();
  r.continuous = false;
  r.interimResults = false;

  r.onresult = (event) => {
    const text = event.results[0][0].transcript;
    appendMessage('my', text);
    if (conn && conn.open) {
      conn.send({ text, lang: el.mySpeakLang.value });
    } else {
      appendMessage('system', '⚠️ 尚未連線，訊息未送出');
    }
  };

  r.onerror = (event) => {
    appendMessage('system', '⚠️ 語音辨識錯誤：' + event.error);
  };

  r.onend = () => {
    isRecording = false;
    el.recordBtn.classList.remove('recording');
    el.recordBtn.disabled = false;
    el.recordBtn.textContent = '🎤 按下開始說話';
  };

  return r;
}

el.recordBtn.addEventListener('click', () => {
  if (!recognition || isRecording) return;
  recognition.lang = el.mySpeakLang.value;
  try {
    recognition.start();
    isRecording = true;
    el.recordBtn.classList.add('recording');
    el.recordBtn.textContent = '🔴 聆聽中…請說話';
  } catch (err) {
    appendMessage('system', '⚠️ 無法啟動麥克風：' + err.message);
  }
});

recognition = initRecognition();
if (recognition) {
  el.recordBtn.disabled = false;
  el.recordBtn.textContent = '🎤 按下開始說話';
}
updateRecHint();

// ── 自我測試：翻譯 API ────────────────────────────────────────
el.testTranslateBtn.addEventListener('click', async () => {
  const text = el.testTranslateInput.value.trim();
  if (!text) return;
  el.testTranslateBtn.disabled = true;
  el.testTranslateResult.textContent = '翻譯中…';
  const result = await translateText(text, tlOf(el.mySpeakLang.value), tlOf(el.myHearLang.value));
  el.testTranslateResult.textContent = result
    ? ('→ ' + result)
    : '⚠️ 翻譯失敗（可能是免費 API 額度用完或暫時連不上）';
  el.testTranslateBtn.disabled = false;
});

// ── 自我測試：朗讀 ────────────────────────────────────────────
el.testSpeakBtn.addEventListener('click', () => {
  const text = el.testSpeakInput.value.trim();
  if (!text) return;
  speak(text, el.myHearLang.value);
});

// ── 離開頁面時收乾淨：關麥克風、關連線、關 Peer ──────────────────
window.addEventListener('beforeunload', () => {
  try { recognition && recognition.abort(); } catch {}
  try { conn && conn.close(); } catch {}
  try { peer && peer.destroy(); } catch {}
});
