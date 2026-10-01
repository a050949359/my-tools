# 多功能工具箱

純前端靜態網頁工具，無需安裝軟體，直接在瀏覽器中使用，所有操作皆在本地端完成，資料不會上傳至任何伺服器。

## 工具一覽

### 文字工具

#### 1. 文字轉換
- **功能**：將 Unicode 或 JSON 格式的文字轉換為可讀文字
- **支援格式**：`\uXXXX`、`\u{XXXX}`、JSON 字串
- **使用場景**：處理 API 回傳的編碼文字、JSON 資料中的中文字元

---

### 圖片工具

#### 2. 圖片編輯
- **功能**：圖片裁切、縮放、加浮水印，並匯出為指定格式
- **操作方式**：拖曳或點擊上傳圖片
- **裁切**：在圖片上拖曳選取範圍，支援移動/縮放選框，或直接輸入座標
- **縮放**：以百分比滑桿調整尺寸
- **浮水印**：
  - 單點模式：自訂文字、字體大小、顏色、透明度、位置（9 個定位點）
  - 平鋪模式：全圖鋪滿，可調旋轉角度
- **輸出**：PNG / JPG / WebP，JPG/WebP 可調品質，顯示預估檔案大小
- **其他**：支援 10 步復原（Undo）、重置回原圖、下載、複製 Base64

#### 3. Placeholder 生成
- **功能**：即時產生佔位圖片
- **自訂選項**：寬度、高度、背景色、文字色、文字內容、檔案格式（PNG / JPG / WebP）
- **使用場景**：網頁開發暫時圖片、設計稿佔位

#### 4. SVG → PNG
- **功能**：將 SVG 向量圖轉換為 PNG 點陣圖
- **操作方式**：貼入 SVG 代碼，或拖曳 / 點擊上傳 SVG 檔案
- **自訂選項**：輸出寬高（最大 4000px）、背景色、透明背景
- **輸出**：PNG 預覽、下載、複製 Base64

#### 5. HEIC → PNG
- **功能**：將 iPhone 拍攝的 HEIC / HEIF 圖片轉換為 PNG
- **操作方式**：拖曳或點擊上傳 `.heic` / `.heif` 檔案
- **自訂選項**：輸出品質（0.1 ~ 1.0）
- **輸出**：PNG 下載、複製 Base64

#### 6. 本地圖片瀏覽器
- **功能**：用 File System Access API 開啟本地資料夾，瀏覽大量圖片
- **效能**：虛擬捲動圖片牆 + Web Worker 產生縮圖
- **其他**：可反解 RPG Maker MV / MZ 加密圖片（XOR）；純瀏覽不匯出，附防誤觸鎖與責任聲明

#### 7. 圖片 → SVG 描邊
- **功能**：用 ImageTracer.js 把點陣圖向量化成 SVG
- **自訂選項**：預設風格、色數、去雜點、模糊
- **輸出**：原圖對照、路徑數統計、下載 / 複製 SVG；可一鍵交給「SVG 互動熱區」加連結

#### 8. SVG 互動熱區
- **功能**：在 SVG 上點選或框選一群 path，或拉出矩形熱區，綁定超連結
- **輸入**：貼上 / 上傳 SVG，或從「圖片 → SVG 描邊」交接
- **輸出**：
  - 描邊版：path 外包 `<a>`
  - 原圖內嵌版：原圖 `<image>` 當底圖，熱區轉成透明可點的外框 rect，原圖保持清晰

#### 9. 精靈圖工作台
- **功能**：影片或幀序列 → 抽幀 → 白底去背 → 質心對位 → 輸出 sprite sheet
- **去背**：un-blend 反解 alpha，保留半透明光暈
- **預覽**：幀可點擊剔除；即時動畫預覽（棋盤 / 深 / 淺底、來回播放）
- **輸出**：sprite sheet PNG、CSS `steps()` 片段、JSON

---

### 行動裝置

#### 10. 感測器監控
- **功能**：即時讀取手機感測器數值並畫出波形
- **支援**：加速度計、陀螺儀、裝置方向、磁力計、環境光、GPS、電池、麥克風音量
- **注意**：iOS 需授權動作感測；磁力計與環境光僅 Chrome Android 支援

---

### 開發者工具

#### 11. QR Code 生成
- **功能**：將文字或網址轉換為 QR Code
- **自訂選項**：
  - 尺寸：256 × 256、512 × 512、1024 × 1024
  - 容錯等級：L / M / Q / H
  - 中央 Icon：可上傳圖片嵌入 QR Code 中央（自動升為容錯 H，尺寸上限 512 × 512）
- **輸出**：QR Code 預覽、下載、複製 Base64

#### 12. RSA 金鑰產生器
- **功能**：於瀏覽器本地產生 RSA 金鑰對，金鑰不離開裝置
- **自訂選項**：
  - 用途：RSA-OAEP（加解密）/ RSA-PSS（簽章驗章）
  - 金鑰長度：2048 bits / 4096 bits
  - 匯出格式：PEM / JWK
- **輸出**：私鑰 + 公鑰，可複製或下載

#### 13. URL 解析
- **功能**：解析 URL 各組成部分，展開 Query 參數，並提供編解碼轉換
- **輸出內容**：Protocol、Host、Hostname、Port、Pathname、Search、Hash、Origin
- **Query 參數**：逐條列出 key / value
- **編解碼**：`encodeURIComponent` / `decodeURIComponent` 結果，可一鍵複製

#### 14. JSON 格式化
- **功能**：JSON 格式化、壓縮、Escape / Unescape，即時驗證語法
- **錯誤定位**：顯示第幾行第幾欄，並附中文提示（結尾多逗號、少逗號、單引號、key 沒加引號、註解、不合法跳脫字元…）與出錯片段；點擊錯誤訊息即跳到輸入框的錯誤位置
- **Text 視圖**：高亮顯示，支援關鍵字搜尋（上/下導覽）
- **Tree 視圖**：可展開/收合的互動樹狀結構，點擊 key 複製該節點內容並顯示 JSONPath
- **工具列**：格式化、壓縮、Escape、Unescape，右上角 Copy 一鍵複製輸出結果

#### 15. Regex 測試器
- **引擎**：瀏覽器內建 JS (ECMAScript)，介面標注「JS Engine」（不支援 PCRE 語法）
- **Pattern 輸入**：`/pattern/` 視覺化，語法錯誤即時顯示
- **Flags**：`g` `i` `m` `s`，滑鼠停留顯示說明
- **即時高亮**：測試文字中命中處橘色標記，輸入即更新
- **匹配清單**：每個 match 顯示編號、值、index；有 capture group 時展開 `$1`, `$2`…
- **待做**：PCRE WASM 引擎支援（`\K`、possessive quantifier、可變長度 lookbehind 等）

#### 16. Markdown 預覽
- **功能**：即時預覽 Markdown（marked，CommonMark + GFM）
- **擴充**：Mermaid 圖表、KaTeX 數學公式、程式碼語法高亮（皆延遲載入）
- **其他**：自動目錄、檢視模式切換、拖曳 `.md` 檔案載入

#### 17. OpenAPI 文件檢視
- **功能**：用 Scalar API Reference 渲染 OpenAPI / Swagger 文件，於新分頁開啟
- **輸入**：網址（直接抓取，需對方允許 CORS）、貼上 JSON / YAML、拖曳上傳檔案
- **API 列表**：輸入規格後右欄自動依分類列出所有 API
- **下載 HTML**：可選 Scalar 現代 / 經典版面或 Swagger UI（走 CDN，開啟需連網）
- **匯出 API 匯入 JSON**：勾選 API 轉成內部 API 管理系統的匯入格式，單支輸出 `.json`、多支輸出 zip
- **隱私**：已關閉 Scalar 遙測、Ask AI 等對外功能

#### 18. DBML → ER 圖
- **功能**：即時把 DBML 渲染成 ER 關聯圖（自製 parser + 力導向自動排版，零依賴）
- **支援語法**：Table、Column、Enum、Ref、TableGroup，含欄位內 `ref:` 簡寫
- **操作**：拖曳表格、滾輪縮放、拖曳平移、hover 高亮關聯
- **輸出**：下載 SVG / PNG、複製 SVG 原始碼；可拖曳 `.dbml` 檔案載入

---

### 雲端服務

#### 19. Google 雲端硬碟
- **功能**：用 Google Picker 從自己的雲端硬碟選取檔案，下載或預覽
- **選取**：可依類型過濾（全部 / 圖片 / 試算表 / 文件 / 簡報 / PDF）、多選、支援共用雲端硬碟
- **下載**：一般檔案直接下載；Google 文件、試算表、簡報、繪圖自動匯出成 docx / xlsx / pptx / png
- **權限**：只要求 `drive.file`，僅能存取你在 Picker 中選取的檔案
- **設定**：已內建本站的 OAuth Client ID 與 API Key，但 OAuth 處於測試模式，僅限名單內的帳號授權；fork 自用時可在頁面填入自己的值（頁面內有步驟說明，存在瀏覽器的 localStorage）
- **資料流**：檔案由 Google 直接傳到瀏覽器，不經過其他伺服器

---

## 使用說明

1. 開啟 `index.html`
2. 透過左側 Sidebar（桌面）或頂部下拉選單（手機）切換工具
3. 依工具說明上傳檔案或輸入內容
4. 點擊 **▶ 執行** 或對應按鈕進行操作
5. 下載結果或複製 Base64 / 文字

---

## 專案結構

```
my-tools/
├── index.html              # 入口頁面
├── assets/
│   ├── app.js              # 路由、Sidebar、Header 渲染
│   ├── styles.css          # 全域樣式
│   ├── mcp-bridge.js       # 給外部 AI agent 的 postMessage 呼叫橋接
│   ├── tools/              # 每個工具獨立模組
│   │   ├── text.js         # 文字轉換
│   │   ├── image.js        # 圖片編輯
│   │   ├── placeholder.js  # Placeholder 生成
│   │   ├── svg.js          # SVG → PNG
│   │   ├── heic.js         # HEIC → PNG
│   │   ├── imageBrowser.js # 本地圖片瀏覽器
│   │   ├── imageTracer.js  # 圖片 → SVG 描邊
│   │   ├── imageHotspot.js # SVG 互動熱區
│   │   ├── sprite.js       # 精靈圖工作台
│   │   ├── sensor.js       # 感測器監控
│   │   ├── qr.js           # QR Code 生成
│   │   ├── rsa.js          # RSA 金鑰產生器
│   │   ├── url.js          # URL 解析
│   │   ├── json.js         # JSON 格式化
│   │   ├── regex.js        # Regex 測試器
│   │   ├── markdown.js     # Markdown 預覽
│   │   ├── openapi.js      # OpenAPI 文件檢視
│   │   ├── openapi-export.js # OpenAPI → API 匯入 JSON 轉換
│   │   ├── dbml.js         # DBML → ER 圖
│   │   └── gdrive.js       # Google 雲端硬碟
│   ├── qrcode.min.js       # QR Code 函式庫
│   ├── heic2any.min.js     # HEIC 轉換函式庫
│   ├── imagetracer.js      # 點陣圖向量化函式庫
│   ├── marked.min.js       # Markdown 解析
│   ├── mermaid.min.js      # Mermaid 圖表
│   ├── katex/              # KaTeX 數學公式
│   ├── highlight.min.js    # 程式碼語法高亮
│   ├── scalar.standalone.min.js # Scalar API Reference
│   └── js-yaml.min.js      # YAML 解析
├── DESIGN.md               # Design Token
└── CLAUDE.md               # 開發規範
```

函式庫皆放在本地並延遲載入，不依賴 CDN（Google 雲端硬碟工具所需的 Google 官方腳本除外，只能從 Google 載入）。

## 特色

- **純前端**：無後端服務，所有運算在瀏覽器本地完成（Regex 使用 JS 引擎）
- **隱私安全**：檔案與金鑰不會離開裝置
- **模組化**：每個工具獨立載入，切換工具不重新載入已快取模組
- **RWD**：桌面 Sidebar + 手機下拉選單，自適應不同裝置
