const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const base64Output = document.getElementById('base64Output');
const preview = document.getElementById('preview');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) { alert('請選擇圖片檔'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    base64Output.value = reader.result;
    preview.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function copyBase64() {
  if (!base64Output.value) return;
  navigator.clipboard.writeText(base64Output.value);
  alert('Base64 已複製');
}
