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

---

### 開發者工具

#### 6. QR Code 生成
- **功能**：將文字或網址轉換為 QR Code
- **自訂選項**：
  - 尺寸：256 × 256、512 × 512、1024 × 1024
  - 容錯等級：L / M / Q / H
  - 中央 Icon：可上傳圖片嵌入 QR Code 中央（自動升為容錯 H，尺寸上限 512 × 512）
- **輸出**：QR Code 預覽、下載、複製 Base64

#### 7. RSA 金鑰產生器
- **功能**：於瀏覽器本地產生 RSA 金鑰對，金鑰不離開裝置
- **自訂選項**：
  - 用途：RSA-OAEP（加解密）/ RSA-PSS（簽章驗章）
  - 金鑰長度：2048 bits / 4096 bits
  - 匯出格式：PEM / JWK
- **輸出**：私鑰 + 公鑰，可複製或下載

#### 8. URL 解析
- **功能**：解析 URL 各組成部分，展開 Query 參數，並提供編解碼轉換
- **輸出內容**：Protocol、Host、Hostname、Port、Pathname、Search、Hash、Origin
- **Query 參數**：逐條列出 key / value
- **編解碼**：`encodeURIComponent` / `decodeURIComponent` 結果，可一鍵複製

#### 9. JSON 格式化
- **功能**：JSON 格式化、壓縮、Escape / Unescape，即時驗證語法
- **Text 視圖**：高亮顯示，支援關鍵字搜尋（上/下導覽）
- **Tree 視圖**：可展開/收合的互動樹狀結構，點擊 key 複製該節點內容
- **工具列**：格式化、壓縮、Escape、Unescape，右上角 Copy 一鍵複製輸出結果

#### 10. Regex 測試器
- **引擎**：瀏覽器內建 JS (ECMAScript)，介面標注「JS Engine」（不支援 PCRE 語法）
- **Pattern 輸入**：`/pattern/` 視覺化，語法錯誤即時顯示
- **Flags**：`g` `i` `m` `s`，滑鼠停留顯示說明
- **即時高亮**：測試文字中命中處橘色標記，輸入即更新
- **匹配清單**：每個 match 顯示編號、值、index；有 capture group 時展開 `$1`, `$2`…
- **待做**：PCRE WASM 引擎支援（`\K`、possessive quantifier、可變長度 lookbehind 等）

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
│   ├── tools/              # 每個工具獨立模組
│   │   ├── text.js         # 文字轉換
│   │   ├── image.js        # 圖片編輯
│   │   ├── placeholder.js  # Placeholder 生成
│   │   ├── svg.js          # SVG → PNG
│   │   ├── heic.js         # HEIC → PNG
│   │   ├── qr.js           # QR Code 生成
│   │   ├── rsa.js          # RSA 金鑰產生器
│   │   ├── url.js          # URL 解析
│   │   ├── json.js         # JSON 格式化
│   │   └── regex.js        # Regex 測試器
│   ├── qrcode.min.js       # QR Code 函式庫（本地）
│   └── heic2any.min.js     # HEIC 轉換函式庫（本地）
└── .nojekyll               # 停用 Jekyll，供 GitHub Pages 使用
```

## 特色

- **純前端**：無後端服務，所有運算在瀏覽器本地完成（Regex 使用 JS 引擎）
- **隱私安全**：檔案與金鑰不會離開裝置
- **模組化**：每個工具獨立載入，切換工具不重新載入已快取模組
- **RWD**：桌面 Sidebar + 手機下拉選單，自適應不同裝置
