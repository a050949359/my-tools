let currentSvgPngDataURL = '';

const svgDropZone = document.getElementById('svgDropZone');
const svgFileInput = document.getElementById('svgFileInput');
const svgInput = document.getElementById('svgInput');

svgDropZone.addEventListener('click', () => svgFileInput.click());
svgDropZone.addEventListener('dragover', e => { e.preventDefault(); svgDropZone.classList.add('dragover'); });
svgDropZone.addEventListener('dragleave', () => svgDropZone.classList.remove('dragover'));
svgDropZone.addEventListener('drop', e => {
  e.preventDefault();
  svgDropZone.classList.remove('dragover');
  handleSvgFile(e.dataTransfer.files[0]);
});
svgFileInput.addEventListener('change', e => handleSvgFile(e.target.files[0]));

function handleSvgFile(file) {
  if (!file || file.type !== 'image/svg+xml') { alert('請選擇 SVG 檔案'); return; }
  const reader = new FileReader();
  reader.onload = () => { svgInput.value = reader.result; };
  reader.readAsText(file);
}

function convertSvgToPng() {
  const svgCode = svgInput.value.trim();
  const outputWidth = parseInt(document.getElementById('svgWidth').value) || 800;
  const outputHeight = parseInt(document.getElementById('svgHeight').value) || 600;
  const backgroundColor = document.getElementById('svgBg').value || '#ffffff';
  const isTransparent = document.getElementById('svgTransparent').checked;

  if (!svgCode) { alert('請輸入 SVG 代碼或上傳 SVG 檔案'); return; }
  if (!svgCode.includes('<svg')) { alert('輸入的內容似乎不是有效的 SVG 代碼'); return; }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  if (!isTransparent) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, outputWidth, outputHeight);
  }

  const svgBlob = new Blob([svgCode], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();

  img.onload = function () {
    try {
      const scale = Math.min(outputWidth / img.width, outputHeight / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const x = (outputWidth - scaledWidth) / 2;
      const y = (outputHeight - scaledHeight) / 2;
      ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
      currentSvgPngDataURL = canvas.toDataURL('image/png');
      document.getElementById('svgPreview').src = currentSvgPngDataURL;
      document.getElementById('svgPreviewContainer').style.display = 'block';
      document.getElementById('svgActions').style.display = 'block';
    } catch (error) {
      alert('轉換過程中發生錯誤：' + error.message);
    }
    URL.revokeObjectURL(url);
  };

  img.onerror = function () {
    alert('SVG 載入失敗，請檢查 SVG 代碼是否正確');
    URL.revokeObjectURL(url);
  };

  img.crossOrigin = 'anonymous';
  img.src = url;
}

function downloadSvgPng() {
  if (!currentSvgPngDataURL) { alert('請先轉換 SVG'); return; }
  const w = parseInt(document.getElementById('svgWidth').value) || 800;
  const h = parseInt(document.getElementById('svgHeight').value) || 600;
  const link = document.createElement('a');
  link.download = `svg_to_png_${w}x${h}.png`;
  link.href = currentSvgPngDataURL;
  link.click();
}

function copySvgPngBase64() {
  if (!currentSvgPngDataURL) { alert('請先轉換 SVG'); return; }
  navigator.clipboard.writeText(currentSvgPngDataURL).then(() => {
    alert('PNG Base64 已複製');
  }).catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = currentSvgPngDataURL;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('PNG Base64 已複製');
  });
}
