function buildCanvas() {
  const w = parseInt(document.getElementById('phWidth').value) || 600;
  const h = parseInt(document.getElementById('phHeight').value) || 200;
  const txt = document.getElementById('phText').value || `${w}x${h}`;
  const bg = document.getElementById('phBg').value || '#cccccc';
  const color = document.getElementById('phColor').value || '#000000';
  const format = document.getElementById('phFormat').value || 'png';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = w;
  canvas.height = h;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const fontSize = Math.min(w, h) / 10;
  ctx.font = `${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, w / 2, h / 2);

  const mimeType = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
  const quality = format === 'jpeg' ? 0.9 : undefined;
  return { canvas, dataURL: canvas.toDataURL(mimeType, quality), format, w, h };
}

function generatePlaceholder() {
  const { dataURL } = buildCanvas();
  document.getElementById('phPreview').src = dataURL;
  document.getElementById('phURL').value = dataURL;
}

function copyPlaceholderURL() {
  const urlField = document.getElementById('phURL');
  if (!urlField.value) return;
  navigator.clipboard.writeText(urlField.value);
  alert('Base64 圖片數據已複製');
}

function downloadPlaceholder() {
  const { dataURL, format, w, h } = buildCanvas();
  const extension = format === 'jpeg' ? 'jpg' : format;
  const link = document.createElement('a');
  link.download = `placeholder_${w}x${h}.${extension}`;
  link.href = dataURL;
  link.click();
}
