export function template() {
  return `
    <p class="muted">拖曳或選取圖片後，立即轉為 Base64。</p>
    <div id="dropZone" class="drop-zone">
      拖曳圖片到這裡，或點擊選擇圖片
      <input type="file" id="fileInput" accept="image/*" hidden>
    </div>
    <textarea id="base64Output" placeholder="Base64 會顯示在這裡"></textarea>
    <button id="copyBtn">複製 Base64</button>
    <img id="preview" class="preview">
  `;
}

export function init() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const base64Output = document.getElementById('base64Output');
  const preview = document.getElementById('preview');

  const handleFile = file => {
    if (!file || !file.type.startsWith('image/')) { alert('請選擇圖片檔'); return; }
    const reader = new FileReader();
    reader.onload = () => { base64Output.value = reader.result; preview.src = reader.result; };
    reader.readAsDataURL(file);
  };

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
  document.getElementById('copyBtn').addEventListener('click', () => {
    if (!base64Output.value) return;
    navigator.clipboard.writeText(base64Output.value);
    alert('Base64 已複製');
  });
}
