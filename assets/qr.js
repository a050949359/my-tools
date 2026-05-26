let currentQRDataURL = '';

function generateQRCode() {
  const text = document.getElementById('qrInput').value.trim();
  const size = parseInt(document.getElementById('qrSize').value);
  const level = document.getElementById('qrLevel').value;
  const resultDiv = document.getElementById('qrResult');
  const actionsDiv = document.getElementById('qrActions');

  if (!text) { alert('請輸入要產生 QR Code 的文字'); return; }
  if (typeof QRCode === 'undefined') { resultDiv.innerHTML = '錯誤：QR Code 庫未正確載入'; return; }

  resultDiv.innerHTML = '';
  actionsDiv.style.display = 'none';

  const tempDiv = document.createElement('div');
  tempDiv.style.display = 'none';
  document.body.appendChild(tempDiv);

  const levelMap = { L: QRCode.CorrectLevel.L, M: QRCode.CorrectLevel.M, Q: QRCode.CorrectLevel.Q, H: QRCode.CorrectLevel.H };

  new QRCode(tempDiv, {
    text, width: size, height: size,
    colorDark: '#000000', colorLight: '#ffffff',
    correctLevel: levelMap[level] || QRCode.CorrectLevel.M
  });

  setTimeout(() => {
    try {
      const canvas = tempDiv.querySelector('canvas');
      const img = tempDiv.querySelector('img');
      if (canvas) {
        currentQRDataURL = canvas.toDataURL('image/png');
      } else if (img) {
        currentQRDataURL = img.src;
      } else {
        throw new Error('無法找到生成的 QR Code');
      }
      const resultImg = document.createElement('img');
      resultImg.src = currentQRDataURL;
      resultImg.style.maxWidth = '100%';
      resultImg.style.border = '1px solid #ccc';
      resultDiv.appendChild(resultImg);
      actionsDiv.style.display = 'block';
    } catch (error) {
      resultDiv.innerHTML = '生成失敗：' + error.message;
    }
    document.body.removeChild(tempDiv);
  }, 100);
}

function downloadQRCode() {
  if (!currentQRDataURL) return;
  const size = document.getElementById('qrSize').value;
  const link = document.createElement('a');
  link.download = `qrcode_${size}x${size}.png`;
  link.href = currentQRDataURL;
  link.click();
}

function copyQRCode() {
  if (!currentQRDataURL) return;
  navigator.clipboard.writeText(currentQRDataURL).then(() => {
    alert('QR Code Base64 已複製');
  }).catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = currentQRDataURL;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('QR Code Base64 已複製');
  });
}
