# 多功能工具箱 — 開發規範

純前端靜態應用，部署在 GitHub Pages，不依賴任何後端或打包工具。

---

## 專案結構

```
my-tools/
├── index.html              # 入口，僅結構，無邏輯
├── assets/
│   ├── app.js              # 路由、sidebar、header 渲染
│   ├── styles.css          # 全域樣式（Design Token + 元件）
│   ├── tools/              # 每個工具一個獨立模組
│   │   ├── text.js
│   │   ├── image.js
│   │   ├── placeholder.js
│   │   ├── qr.js
│   │   ├── svg.js
│   │   └── heic.js
│   ├── qrcode.min.js       # QR Code 函式庫（本地）
│   ├── heic2any.min.js     # HEIC 轉換函式庫（本地）
│   ├── imagetracer.js      # 點陣圖向量化函式庫（本地，~47KB，延遲載入）
│   ├── marked.min.js       # Markdown 解析函式庫（本地）
│   ├── mermaid.min.js      # Mermaid 圖表函式庫（本地，~3MB，延遲載入）
│   ├── katex/              # KaTeX 數學公式（min.js + min.css + fonts/，延遲載入）
│   ├── highlight.min.js    # highlight.js 程式碼語法高亮（本地，延遲載入）
│   └── highlight-github.min.css # highlight.js GitHub 主題
├── DESIGN.md               # Design Token（色彩、字型、間距）
└── CLAUDE.md               # 本文件
```

---

## 新增工具步驟

### 1. 建立工具模組 `assets/tools/<id>.js`

每個工具模組必須 export：

```js
// 必要
export function template() { return `...HTML 字串...`; }
export async function init() { /* 綁事件，可回傳 cleanup fn */ }

// 選用
export function reset() { /* 清空狀態，header 會自動出現「↺ 重置」鍵 */ }
```

### 2. 在 `app.js` 的 `TOOL_GROUPS` 加入工具

```js
{
  label: '分類名稱',
  icon: '符號',
  tools: [
    { id: 'myTool', label: '工具顯示名稱', src: './tools/myTool.js' },
  ]
}
```

### 3. 標記主要動作按鈕

在 `template()` 的主按鈕加上 `data-primary`，header 的「▶ 執行」才會出現並連動。
`[data-primary]` 按鈕會被 CSS 自動隱藏（功能已串到 header），不需手動加 `hidden`：

```html
<button id="myRunBtn" data-primary>執行</button>
```

沒有明確主要動作的工具（如自動觸發型）不加，▶ 執行 就不顯示。

---

## app.js 運作方式

- Hash 路由：`#<toolId>` → `navigate(id)`
- 工具模組以 `import()` 動態載入並 **cache**，切換工具不重新載入
- 每次切換呼叫前一個工具的 `cleanup()`（若有 return）
- Header 渲染順序：**先 render 工具內容 → 再 render header**，這樣才能偵測 `[data-primary]` 決定是否顯示執行鍵

---

## 樣式規範

Design Token 定義在 `styles.css` `:root`，對應 `DESIGN.md`。

| Token | 用途 |
|---|---|
| `--primary` | 主色（橘色），主要按鈕、active 狀態 |
| `--surface` | 白色卡片背景 |
| `--surface-low` | 輸入框、pre 背景 |
| `--surface-container` | hover 狀態背景 |
| `--on-surface-variant` | 次要文字、label |
| `--outline-variant` | 邊框、分隔線 |
| `--mono` | JetBrains Mono，用於 code、input |

### 常用 class

| Class | 用途 |
|---|---|
| `.muted` | 說明文字（灰色小字）|
| `.grid-2` / `.grid-4` | 兩欄 / 四欄格線 |
| `.button-row` | 橫排按鈕群組 |
| `.drop-zone` | 拖曳上傳區域 |
| `img.preview` | 圖片預覽 |

---

## 外部函式庫載入規則

- 優先放在 `assets/` 本地（避免 CDN 失效影響靜態部署）
- 採**延遲載入**：工具 `init()` 或 `loadLib()` 時才注入 `<script>`，不在頁面初始載入

```js
function loadLib() {
  if (typeof MyLib !== 'undefined') return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/mylib.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
```

---

## 現有工具一覽

| ID | 名稱 | 分類 | 主要功能 | reset | data-primary |
|---|---|---|---|---|---|
| `text` | 文字轉換 | 文字工具 | `\uXXXX` / JSON 解析 | ✗ | ✓ `#convertBtn` |
| `image` | 圖片 → Base64 | 圖片工具 | 圖片轉 Base64 data URL | ✗ | ✗ 自動觸發 |
| `placeholder` | Placeholder 生成 | 圖片工具 | 即時產生占位圖 | ✗ | ✗ 自動觸發 |
| `svg` | SVG → PNG | 圖片工具 | SVG 轉 PNG，可設尺寸背景 | ✗ | ✓ `#svgConvertBtn` |
| `heic` | HEIC → PNG | 圖片工具 | HEIC/HEIF 轉 PNG | ✗ | ✓ `#heicConvertBtn` |
| `imageBrowser` | 本地圖片瀏覽器 | 圖片工具 | File System Access API 瀏覽本地大量圖片（虛擬牆 + Worker 縮圖）；反解 RPG Maker MV/MZ 加密圖（XOR）；純瀏覽不匯出、防手滑鎖、責任聲明 | ✗ | ✓ `#ibPick` |
| `imageTracer` | 圖片 → SVG 描邊 | 圖片工具 | ImageTracer.js（本地、延遲載入）點陣圖向量化成 SVG；預設風格 + 色數/去躁/模糊滑桿、原圖對照、路徑數統計、下載/複製；可「→ 加互動連結」交接給熱區工具 | ✓ | ✓ `#itRunBtn` |
| `imageHotspot` | SVG 互動熱區 | 圖片工具 | 貼上/上傳/交接 SVG，在圖上點選或框選一群 path、或拉矩形熱區，綁超連結 href；兩種匯出:①描邊版(path 包 `<a>`)②原圖內嵌版(原圖 `<image>` 當底+path 群轉外框 rect，原圖清晰);透明可點不填滿、`rel=noopener` | ✓ | ✓ `#hsLoad` |
| `sprite` | 精靈圖工作台 | 圖片工具 | 影片/幀序列 → 抽幀 → 白底去背（un-blend 反解 alpha，保留半透明光暈）→ 質心對位 → sprite sheet PNG + CSS `steps()` 片段 + JSON；幀可點擊剔除、即時動畫預覽（棋盤/深/淺底、來回播放）；零依賴純 canvas | ✓ | ✓ `#spSheetBtn` |
| `qr` | QR Code 生成 | 開發者工具 | QR 生成，支援中央 Icon | ✓ | ✓ `#qrGenBtn` |
| `markdown` | Markdown 預覽 | 開發者工具 | 即時預覽 marked（CommonMark+GFM）；Mermaid 圖表、KaTeX 數學、程式碼高亮（皆延遲載入）；目錄、檢視切換、拖曳 `.md` | ✓ | ✗ 自動觸發 |

---

## 待開發功能（參考）

### 零依賴（純 Canvas / WebCrypto）
- **Hash 產生器** — SHA-256 / SHA-1，`crypto.subtle`
- **Base64 文字** — 文字 encode / decode
- **色碼轉換** — HEX ↔ RGB ↔ HSL
- **圖片編輯** — 裁切、旋轉、亮度/對比/灰階

### 需外部函式庫
- **JSON 工具** — 格式化、壓縮、驗證（輕量，可內嵌）
- **OCR** — Tesseract.js（~10 MB WASM）
- **影片 → GIF / 轉檔** — @ffmpeg/ffmpeg + @ffmpeg/core-st（~30 MB WASM，需 single-thread 版相容 GitHub Pages）
