let currentHeicFile = null;
let currentHeicPngDataURL = '';
let currentHeicDetectedType = 'unknown';

const heicDropZone = document.getElementById('heicDropZone');
const heicFileInput = document.getElementById('heicFileInput');
const heicStatus = document.getElementById('heicStatus');

heicDropZone.addEventListener('click', () => heicFileInput.click());
heicDropZone.addEventListener('dragover', e => { e.preventDefault(); heicDropZone.classList.add('dragover'); });
heicDropZone.addEventListener('dragleave', () => heicDropZone.classList.remove('dragover'));
heicDropZone.addEventListener('drop', e => {
  e.preventDefault();
  heicDropZone.classList.remove('dragover');
  handleHeicFile(e.dataTransfer.files[0]);
});
heicFileInput.addEventListener('change', e => handleHeicFile(e.target.files[0]));

async function handleHeicFile(file) {
  if (!file) return;
  const name = (file.name || '').toLowerCase();
  const isHeicLike = name.endsWith('.heic') || name.endsWith('.heif') ||
    file.type === 'image/heic' || file.type === 'image/heif';
  if (!isHeicLike) { alert('請選擇 HEIC/HEIF 檔案'); return; }

  currentHeicFile = file;
  currentHeicDetectedType = await detectImageContainer(file);
  currentHeicPngDataURL = '';
  document.getElementById('heicActions').style.display = 'none';
  document.getElementById('heicPreviewContainer').style.display = 'none';

  const sizeKb = Math.round(file.size / 1024);
  heicStatus.textContent = `已選擇：${file.name} (${sizeKb} KB)，偵測格式：${currentHeicDetectedType}，正在轉換...`;
  convertHeicToPng();
}

async function convertHeicToPng() {
  if (!currentHeicFile) { alert('請先選擇 HEIC/HEIF 檔案'); return; }
  if (typeof heic2any === 'undefined') { alert('HEIC 轉檔庫未載入，請重新整理頁面'); return; }

  const qualityInput = parseFloat(document.getElementById('heicQuality').value);
  const quality = Number.isFinite(qualityInput) ? Math.min(1, Math.max(0.1, qualityInput)) : 0.92;

  if (currentHeicDetectedType === 'jpeg' || currentHeicDetectedType === 'png') {
    try {
      heicStatus.textContent = `偵測到 ${currentHeicDetectedType.toUpperCase()}，直接轉為 PNG...`;
      await convertBrowserReadableImageToPng(currentHeicFile, quality);
      heicStatus.textContent = '轉換完成，可下載 PNG 或複製 Base64。';
    } catch (error) {
      heicStatus.textContent = '原生轉換失敗，請確認檔案是否有效。';
      alert('HEIC 轉換失敗：' + (error && error.message ? error.message : error));
    }
    return;
  }

  try {
    const result = await heic2any({ blob: currentHeicFile, toType: 'image/png', quality });
    const pngBlob = Array.isArray(result) ? result[0] : result;
    const reader = new FileReader();
    reader.onload = () => {
      currentHeicPngDataURL = reader.result;
      document.getElementById('heicPreview').src = currentHeicPngDataURL;
      document.getElementById('heicPreviewContainer').style.display = 'block';
      document.getElementById('heicActions').style.display = 'block';
      heicStatus.textContent = '轉換完成，可下載 PNG 或複製 Base64。';
    };
    reader.onerror = () => { heicStatus.textContent = '讀取轉換結果失敗'; };
    reader.readAsDataURL(pngBlob);
  } catch (error) {
    const msg = error && error.message ? error.message : String(error || '');
    if (msg.includes('ERR_USER Image is already browser readable')) {
      try {
        heicStatus.textContent = '檔案可直接讀取，改用原生模式轉 PNG...';
        await convertBrowserReadableImageToPng(currentHeicFile, quality);
        heicStatus.textContent = '轉換完成，可下載 PNG 或複製 Base64。';
      } catch (fallbackError) {
        heicStatus.textContent = '原生轉換失敗，請確認檔案是否有效。';
        alert('HEIC 轉換失敗：' + (fallbackError && fallbackError.message ? fallbackError.message : fallbackError));
      }
      return;
    }
    heicStatus.textContent = 'HEIC 轉換失敗，請確認檔案是否有效。';
    alert('HEIC 轉換失敗：' + msg);
  }
}

async function detectImageContainer(file) {
  try {
    const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
    const ascii = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    if (ascii.includes('ftyp')) {
      const heifBrands = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];
      if (heifBrands.some(brand => ascii.includes(brand))) return 'heic';
      return 'iso-bmff';
    }
    return 'unknown';
  } catch (_) { return 'unknown'; }
}

function convertBrowserReadableImageToPng(file, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error('無法取得 Canvas context')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        currentHeicPngDataURL = canvas.toDataURL('image/png', quality);
        document.getElementById('heicPreview').src = currentHeicPngDataURL;
        document.getElementById('heicPreviewContainer').style.display = 'block';
        document.getElementById('heicActions').style.display = 'block';
        URL.revokeObjectURL(url);
        resolve();
      } catch (err) { URL.revokeObjectURL(url); reject(err); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('瀏覽器無法讀取該圖片資料')); };
    img.src = url;
  });
}

function downloadHeicPng() {
  if (!currentHeicPngDataURL) { alert('請先完成轉換'); return; }
  const originalName = currentHeicFile && currentHeicFile.name
    ? currentHeicFile.name.replace(/\.[^.]+$/, '') : 'heic_image';
  const link = document.createElement('a');
  link.download = `${originalName}.png`;
  link.href = currentHeicPngDataURL;
  link.click();
}

function copyHeicPngBase64() {
  if (!currentHeicPngDataURL) { alert('請先完成轉換'); return; }
  navigator.clipboard.writeText(currentHeicPngDataURL).then(() => {
    alert('PNG Base64 已複製');
  }).catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = currentHeicPngDataURL;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('PNG Base64 已複製');
  });
}
