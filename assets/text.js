function convert() {
  let input = document.getElementById('input').value;
  let output = input;
  try {
    output = output.replace(/\\u\{([0-9a-fA-F]+)\}/g,
      (_, code) => String.fromCodePoint(parseInt(code, 16))
    );
    output = output.replace(/\\u([0-9a-fA-F]{4})/g,
      (_, code) => String.fromCharCode(parseInt(code, 16))
    );
    try {
      const parsed = JSON.parse(output);
      output = typeof parsed === 'object'
        ? JSON.stringify(parsed, null, 2)
        : parsed;
    } catch (e) {}
    document.getElementById('output').textContent = output;
  } catch (e) {
    document.getElementById('output').textContent = '轉換錯誤：' + e;
  }
}
