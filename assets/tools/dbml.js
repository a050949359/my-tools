// DBML 圖形化 — 純前端解析 dbdiagram.io 風格的 DBML 語法，畫成可互動的 ER 關聯圖。
// 零依賴：自製遞迴下降 parser（Table/Column/Enum/Ref/TableGroup）+ 自製 SVG 力導向自動排版。

const SVGNS = 'http://www.w3.org/2000/svg';
const HEADER_H = 30, ROW_H = 22, ENUM_HEAD_H = 26, ENUM_ROW_H = 20;
// 識別字字元：含 Unicode 字母/數字（中日韓等），不只限 ASCII，因為表格/欄位/群組名稱常見中文
const IDENT_CHAR = /[\p{L}\p{N}_]/u;

const SAMPLE = `// 範例：電商後台資料庫
Enum orders_status {
  created
  running
  shipped
  done [note: '已完成']
  failure
}

Table users {
  id integer [pk, increment]
  username varchar(255) [not null, unique]
  email varchar(255) [not null, unique]
  role varchar(50) [default: 'member']
  created_at timestamp [default: \`now()\`]

  Note: '會員資料表'
}

Table merchants {
  id integer [pk, increment]
  name varchar(255) [not null]
  owner_id integer [ref: > users.id]
}

Table products {
  id integer [pk, increment]
  merchant_id integer [not null, ref: > merchants.id]
  name varchar(255) [not null]
  price decimal(10,2) [not null, default: 0]
  stock integer [default: 0]

  indexes {
    (merchant_id, name) [unique]
  }
}

Table orders {
  id integer [pk, increment]
  user_id integer [not null]
  status orders_status [not null, default: 'created']
  total decimal(10,2) [not null]
  created_at timestamp [default: \`now()\`]
}

Table order_items {
  id integer [pk, increment]
  order_id integer [not null]
  product_id integer [not null]
  quantity integer [not null, default: 1]
  unit_price decimal(10,2) [not null]

  indexes {
    (order_id, product_id) [unique]
  }
}

Ref: orders.user_id > users.id
Ref: order_items.order_id > orders.id
Ref: order_items.product_id > products.id

TableGroup 交易相關 {
  orders
  order_items
}
`;

// ── Parser ──────────────────────────────────────────────────────────────────

class DbmlParseError extends Error {
  constructor(msg, pos, src) {
    const line = src.slice(0, pos).split('\n').length;
    super(`第 ${line} 行：${msg}`);
    this.line = line;
  }
}

class Parser {
  constructor(src) { this.src = src; this.i = 0; this.n = src.length; }
  eof() { return this.i >= this.n; }
  peek() { return this.src[this.i]; }
  err(msg) { throw new DbmlParseError(msg, this.i, this.src); }

  skipWs() {
    for (;;) {
      while (!this.eof() && /\s/.test(this.peek())) this.i++;
      if (this.src.startsWith('//', this.i)) { while (!this.eof() && this.peek() !== '\n') this.i++; continue; }
      if (this.src.startsWith('/*', this.i)) {
        const end = this.src.indexOf('*/', this.i + 2);
        this.i = end === -1 ? this.n : end + 2;
        continue;
      }
      break;
    }
  }

  readIdentOrString() {
    this.skipWs();
    if (this.eof()) this.err('預期識別字，卻已到結尾');
    const c = this.peek();
    if (c === '"' || c === "'") return this.readQuoted(c);
    const start = this.i;
    while (!this.eof() && IDENT_CHAR.test(this.peek())) this.i++;
    if (this.i === start) this.err(`未預期的字元 "${c}"`);
    return this.src.slice(start, this.i);
  }

  readQuoted(q) {
    if (q === "'" && this.src.startsWith("'''", this.i)) {
      const end = this.src.indexOf("'''", this.i + 3);
      const val = this.src.slice(this.i + 3, end === -1 ? this.n : end);
      this.i = end === -1 ? this.n : end + 3;
      return val.trim();
    }
    this.i++;
    let out = '';
    while (!this.eof() && this.peek() !== q) {
      if (this.peek() === '\\' && this.i + 1 < this.n) { out += this.src[this.i + 1]; this.i += 2; continue; }
      out += this.peek(); this.i++;
    }
    this.i++;
    return out;
  }

  // 只在區塊/結構字元判斷用，讀取完整內容並跳過巢狀括號、字串、註解
  consumeBlock(open, close) {
    if (this.peek() !== open) this.err(`預期 "${open}"`);
    this.i++;
    const start = this.i;
    let depth = 1;
    while (depth > 0) {
      if (this.eof()) this.err(`未封閉的區塊，缺少對應的 "${close}"`);
      const c = this.peek();
      if (c === "'" || c === '"') { this.readQuoted(c); continue; }
      if (this.src.startsWith('//', this.i)) { while (!this.eof() && this.peek() !== '\n') this.i++; continue; }
      if (this.src.startsWith('/*', this.i)) { const e = this.src.indexOf('*/', this.i + 2); this.i = e === -1 ? this.n : e + 2; continue; }
      if (c === open) depth++;
      else if (c === close) depth--;
      if (depth > 0) this.i++;
    }
    const content = this.src.slice(start, this.i);
    this.i++;
    return content;
  }

  expect(ch) {
    this.skipWs();
    if (this.peek() !== ch) this.err(`預期 "${ch}"，卻遇到 "${this.peek() ?? 'EOF'}"`);
    this.i++;
  }

  // 消耗一個關鍵字（大小寫不拘、需完整詞界），失敗則不移動位置
  matchWordCI(word) {
    this.skipWs();
    const s = this.src.slice(this.i, this.i + word.length);
    if (s.toLowerCase() !== word) return false;
    const next = this.src[this.i + word.length];
    if (next !== undefined && IDENT_CHAR.test(next)) return false;
    this.i += word.length;
    return true;
  }

  // 供 table 內部 note/indexes 判斷：關鍵字後面必須緊接 "{" 或 ":" 才算數，
  // 避免誤判剛好叫做 note/indexes 的欄位名稱
  matchBlockKeywordCI(word) {
    const save = this.i;
    this.skipWs();
    const s = this.src.slice(this.i, this.i + word.length);
    if (s.toLowerCase() !== word) { this.i = save; return false; }
    const next = this.src[this.i + word.length];
    if (next !== undefined && IDENT_CHAR.test(next)) { this.i = save; return false; }
    this.i += word.length;
    this.skipWs();
    if (this.peek() === '{' || this.peek() === ':') return true;
    this.i = save;
    return false;
  }

  readType() {
    this.skipWs();
    let out = this.readIdentOrString();
    while (this.peek() === '.') { this.i++; out += '.' + this.readIdentOrString(); }
    if (this.peek() === '(') { out += `(${this.consumeBlock('(', ')')})`; }
    while (this.src.slice(this.i, this.i + 2) === '[]') { out += '[]'; this.i += 2; }
    return out;
  }

  readSettingKey() {
    this.skipWs();
    let out = '';
    for (;;) {
      const start = this.i;
      while (!this.eof() && /[A-Za-z0-9_-]/.test(this.peek())) this.i++;
      if (this.i === start) break;
      out += this.src.slice(start, this.i);
      const save = this.i;
      let j = this.i;
      while (j < this.n && (this.src[j] === ' ' || this.src[j] === '\t')) j++;
      if (j < this.n && /[A-Za-z_]/.test(this.src[j])) { out += ' '; this.i = j; continue; }
      this.i = save;
      break;
    }
    if (!out) this.err(`預期設定名稱，卻遇到 "${this.peek() ?? 'EOF'}"`);
    return out.trim().toLowerCase();
  }

  readSettingValue() {
    this.skipWs();
    const c = this.peek();
    if (c === "'" || c === '"') return this.readQuoted(c);
    if (c === '`') {
      this.i++;
      const end = this.src.indexOf('`', this.i);
      const val = this.src.slice(this.i, end === -1 ? this.n : end);
      this.i = end === -1 ? this.n : end + 1;
      return val;
    }
    let depth = 0;
    const start = this.i;
    while (!this.eof()) {
      const ch = this.peek();
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth <= 0 && (ch === ',' || ch === ']')) break;
      this.i++;
    }
    return this.src.slice(start, this.i).trim();
  }

  readRefOperator() {
    this.skipWs();
    if (this.src.slice(this.i, this.i + 2) === '<>') { this.i += 2; return '<>'; }
    const c = this.peek();
    if (c === '>' || c === '<' || c === '-') { this.i++; return c; }
    this.err(`預期關聯符號 > < - 或 <>，卻遇到 "${c ?? 'EOF'}"`);
  }

  // table.column / schema.table.column / table.(col1, col2)
  readRefEndpoint() {
    let parts = [this.readIdentOrString()];
    for (;;) {
      this.skipWs();
      if (this.peek() !== '.') break;
      this.i++;
      this.skipWs();
      if (this.peek() === '(') {
        const inner = this.consumeBlock('(', ')');
        const cols = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        return { path: parts, columns: cols };
      }
      parts.push(this.readIdentOrString());
    }
    const columns = [parts.pop()];
    return { path: parts, columns };
  }

  readBracketSettings() {
    this.i++; // 消耗 '['
    const settings = { flags: [], kv: {}, refs: [] };
    for (;;) {
      this.skipWs();
      if (this.peek() === ']') { this.i++; break; }
      if (this.eof()) this.err('設定 "[ ]" 未封閉');
      const key = this.readSettingKey();
      this.skipWs();
      if (this.peek() === ':') {
        this.i++; this.skipWs();
        if (key === 'ref') settings.refs.push(this.parseInlineRef());
        else settings.kv[key] = this.readSettingValue();
      } else {
        settings.flags.push(key);
      }
      this.skipWs();
      if (this.peek() === ',') { this.i++; continue; }
      if (this.peek() === ']') { this.i++; break; }
    }
    return settings;
  }

  parseInlineRef() {
    this.skipWs();
    const op = this.readRefOperator();
    this.skipWs();
    const target = this.readRefEndpoint();
    return { op, target };
  }

  parseColumn() {
    const name = this.readIdentOrString();
    this.skipWs();
    const type = this.readType();
    this.skipWs();
    const col = { name, type, pk: false, unique: false, notNull: false, increment: false, default: null, note: null, ref: null };
    if (this.peek() === '[') {
      const s = this.readBracketSettings();
      s.flags.forEach(f => {
        if (f === 'pk' || f === 'primary key') col.pk = true;
        else if (f === 'unique') col.unique = true;
        else if (f === 'not null') col.notNull = true;
        else if (f === 'null') col.notNull = false;
        else if (f === 'increment') col.increment = true;
      });
      if ('note' in s.kv) col.note = s.kv.note;
      if ('default' in s.kv) col.default = s.kv.default;
      if (s.refs.length) col.ref = s.refs;
    }
    return col;
  }

  parseTable() {
    this.skipWs();
    const first = this.readIdentOrString();
    this.skipWs();
    let schema = null, name = first;
    if (this.peek() === '.') { this.i++; schema = first; name = this.readIdentOrString(); this.skipWs(); }
    let alias = null;
    if (this.matchWordCI('as')) { this.skipWs(); alias = this.readIdentOrString(); this.skipWs(); }
    let color = null, note = null;
    if (this.peek() === '[') {
      const s = this.readBracketSettings();
      color = s.kv.headercolor || s.kv.color || null;
      if (s.kv.note) note = s.kv.note;
      this.skipWs();
    }
    this.expect('{');
    const table = { schema, name, alias, color, note, columns: [], indexCount: 0 };
    for (;;) {
      this.skipWs();
      if (this.eof()) this.err(`Table "${name}" 缺少對應的 "}"`);
      if (this.peek() === '}') { this.i++; break; }
      if (this.matchBlockKeywordCI('indexes')) { this.skipWs(); this.consumeBlock('{', '}'); table.indexCount++; continue; }
      if (this.matchBlockKeywordCI('note')) {
        this.skipWs();
        if (this.peek() === ':') { this.i++; this.skipWs(); table.note = this.readIdentOrString(); }
        else { table.note = this.consumeBlock('{', '}').trim(); }
        continue;
      }
      table.columns.push(this.parseColumn());
    }
    return table;
  }

  parseEnum() {
    this.skipWs();
    const name = this.readIdentOrString();
    this.skipWs();
    this.expect('{');
    const values = [];
    for (;;) {
      this.skipWs();
      if (this.eof()) this.err(`Enum "${name}" 缺少對應的 "}"`);
      if (this.peek() === '}') { this.i++; break; }
      const val = this.readIdentOrString();
      this.skipWs();
      let note = null;
      if (this.peek() === '[') { const s = this.readBracketSettings(); note = s.kv.note || null; }
      values.push({ name: val, note });
    }
    return { name, values };
  }

  parseTableGroup() {
    this.skipWs();
    const name = this.readIdentOrString();
    this.skipWs();
    if (this.peek() === '[') this.readBracketSettings();
    this.skipWs();
    this.expect('{');
    const members = [];
    for (;;) {
      this.skipWs();
      if (this.eof()) this.err(`TableGroup "${name}" 缺少對應的 "}"`);
      if (this.peek() === '}') { this.i++; break; }
      let n = this.readIdentOrString();
      this.skipWs();
      if (this.peek() === '.') { this.i++; n = this.readIdentOrString(); this.skipWs(); }
      members.push(n);
      if (this.peek() === '[') this.readBracketSettings();
    }
    return { name, members };
  }

  parseRef() {
    this.skipWs();
    let name = null;
    if (this.peek() !== ':') { name = this.readIdentOrString(); this.skipWs(); }
    this.expect(':');
    this.skipWs();
    const from = this.readRefEndpoint();
    this.skipWs();
    const op = this.readRefOperator();
    this.skipWs();
    const to = this.readRefEndpoint();
    this.skipWs();
    if (this.peek() === '[') { this.readBracketSettings(); this.skipWs(); }
    if (this.peek() === '{') this.consumeBlock('{', '}');
    return { name, from, op, to };
  }

  skipProject() {
    this.skipWs();
    this.readIdentOrString();
    this.skipWs();
    if (this.peek() === '{') this.consumeBlock('{', '}');
  }

  skipTopLevelNote() {
    this.skipWs();
    if (this.peek() === ':') { this.i++; this.skipWs(); this.readIdentOrString(); return; }
    this.readIdentOrString();
    this.skipWs();
    if (this.peek() === '{') this.consumeBlock('{', '}');
  }

  // 遇到不認識的頂層語法（如新版才有的 TablePartial 等）：盡量跳過整個陳述，避免整份解析中斷
  skipUnknownTopLevel() {
    const start = this.i;
    let j = this.i;
    while (j < this.n && this.src[j] !== '\n' && this.src[j] !== '{') j++;
    if (this.src[j] === '{') { this.i = j; this.consumeBlock('{', '}'); }
    else this.i = j;
    if (this.i === start) this.i++;
  }
}

function parseDBML(src) {
  const p = new Parser(src);
  const model = { tables: [], enums: [], refs: [], groups: [] };
  for (;;) {
    p.skipWs();
    if (p.eof()) break;
    if (p.matchWordCI('table')) { model.tables.push(p.parseTable()); continue; }
    if (p.matchWordCI('enum')) { model.enums.push(p.parseEnum()); continue; }
    if (p.matchWordCI('ref')) { model.refs.push(p.parseRef()); continue; }
    if (p.matchWordCI('tablegroup')) { model.groups.push(p.parseTableGroup()); continue; }
    if (p.matchWordCI('project')) { p.skipProject(); continue; }
    if (p.matchWordCI('note')) { p.skipTopLevelNote(); continue; }
    p.skipUnknownTopLevel();
  }
  return model;
}

// ── Model ───────────────────────────────────────────────────────────────────

function pathToTable(path) {
  const arr = path.slice();
  const table = arr.pop();
  const schema = arr.length ? arr.join('.') : null;
  return { schema, table };
}
function tableKey(schema, name) { return schema ? `${schema}.${name}` : name; }

function buildModel(parsed) {
  const tables = parsed.tables.map(t => ({
    key: tableKey(t.schema, t.name),
    schema: t.schema, name: t.name, alias: t.alias, note: t.note, color: t.color,
    columns: t.columns, indexCount: t.indexCount,
  }));
  const byKey = new Map(tables.map(t => [t.key, t]));
  const byName = new Map();
  tables.forEach(t => { byName.set(t.name, byName.has(t.name) ? null : t); });

  const groupColors = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#64748b'];
  (parsed.groups || []).forEach((g, idx) => {
    const color = groupColors[idx % groupColors.length];
    g.members.forEach(m => {
      const t = byKey.get(m) || byName.get(m);
      if (t && !t.color) t.color = color;
    });
  });

  function resolve(name, schema) {
    if (schema) { const k = tableKey(schema, name); if (byKey.has(k)) return byKey.get(k); }
    if (byKey.has(name)) return byKey.get(name);
    return byName.get(name) || null;
  }

  const refs = [];
  parsed.tables.forEach(t => {
    const fromTable = byKey.get(tableKey(t.schema, t.name));
    (t.columns || []).forEach(c => {
      (c.ref || []).forEach(r => {
        const info = pathToTable(r.target.path);
        const toTable = resolve(info.table, info.schema);
        if (fromTable && toTable) refs.push({ from: fromTable, fromColumns: [c.name], to: toTable, toColumns: r.target.columns, op: r.op });
      });
    });
  });
  (parsed.refs || []).forEach(r => {
    const fromInfo = pathToTable(r.from.path);
    const toInfo = pathToTable(r.to.path);
    const fromTable = resolve(fromInfo.table, fromInfo.schema);
    const toTable = resolve(toInfo.table, toInfo.schema);
    if (fromTable && toTable) refs.push({ from: fromTable, fromColumns: r.from.columns, to: toTable, toColumns: r.to.columns, op: r.op });
  });

  return { tables, enums: parsed.enums || [], refs };
}

function baseTypeName(type) {
  return (type || '').replace(/\[\]$/, '').replace(/\(.*\)$/, '').split('.').pop();
}

function titleText(node) {
  if (node.isEnum) return `ENUM ⋅ ${node.name}`;
  return `${node.schema ? node.schema + '.' : ''}${node.name}${node.alias ? ' (' + node.alias + ')' : ''}`;
}

function badgeSuffix(c) {
  const b = [];
  if (c.unique) b.push('unique');
  if (c.notNull) b.push('not null');
  if (c.increment) b.push('increment');
  return b.length ? ` ⋅ ${b.join(', ')}` : '';
}

function cardinalityOf(op) {
  switch (op) {
    case '>': return { from: 'many', to: 'one' };
    case '<': return { from: 'one', to: 'many' };
    case '<>': return { from: 'many', to: 'many' };
    default: return { from: 'one', to: 'one' };
  }
}
function markerFor(card) { return `url(#dbml-m-${card})`; }

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

const _measureCanvas = document.createElement('canvas');
const _measureCtx = _measureCanvas.getContext('2d');
function textWidth(text, font) { _measureCtx.font = font; return _measureCtx.measureText(String(text)).width; }

function measureNode(node) {
  if (node.isEnum) {
    let maxW = textWidth(titleText(node), 'bold 12.5px sans-serif') + 40;
    node.values.forEach(v => { maxW = Math.max(maxW, textWidth(v.name, '12px monospace') + 32); });
    return [clamp(maxW, 150, 300), ENUM_HEAD_H + node.values.length * ENUM_ROW_H + 6];
  }
  let maxW = textWidth(titleText(node), 'bold 12.5px sans-serif') + 40;
  node.columns.forEach(c => {
    const label = c.type + badgeSuffix(c);
    const w = 30 + textWidth(c.name, '12px monospace') + 20 + textWidth(label, '10.5px monospace');
    maxW = Math.max(maxW, w);
  });
  return [clamp(maxW, 190, 340), HEADER_H + node.columns.length * ROW_H + 6];
}

// ── Auto layout（力導向：斥力避免重疊 + 引力沿關聯拉近）────────────────────────

function autoLayout(model, nodes) {
  nodes.forEach(n => { const [w, h] = measureNode(n); n._w = w; n._h = h; });
  const cols = Math.max(1, Math.round(Math.sqrt(nodes.length * 1.4)) || 1);
  const gap = 70;
  let cursorX = 0, cursorY = 0, rowMax = 0;
  nodes.forEach((n, i) => {
    if (i > 0 && i % cols === 0) { cursorX = 0; cursorY += rowMax + gap; rowMax = 0; }
    n._x = cursorX; n._y = cursorY;
    cursorX += n._w + gap;
    rowMax = Math.max(rowMax, n._h);
  });

  const indexOf = new Map(nodes.map((n, i) => [n.key, i]));
  const edges = [];
  model.refs.forEach(r => {
    if (indexOf.has(r.from.key) && indexOf.has(r.to.key) && r.from.key !== r.to.key) {
      edges.push([indexOf.get(r.from.key), indexOf.get(r.to.key)]);
    }
  });
  const enumIndexByName = new Map(nodes.filter(n => n.isEnum).map(n => [n.name, indexOf.get(n.key)]));
  model.tables.forEach(t => {
    const ti = indexOf.get(t.key);
    t.columns.forEach(c => {
      const bn = baseTypeName(c.type);
      if (enumIndexByName.has(bn)) edges.push([ti, enumIndexByName.get(bn)]);
    });
  });

  const N = nodes.length;
  const vx = new Array(N).fill(0), vy = new Array(N).fill(0);
  const ITER = N > 60 ? 120 : 240;
  for (let iter = 0; iter < ITER; iter++) {
    const fx = new Array(N).fill(0), fy = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const ax = nodes[i]._x + nodes[i]._w / 2, ay = nodes[i]._y + nodes[i]._h / 2;
        const bx = nodes[j]._x + nodes[j]._w / 2, by = nodes[j]._y + nodes[j]._h / 2;
        const dx = ax - bx, dy = ay - by;
        const dist = Math.hypot(dx, dy) || 0.01;
        const nx = dx / dist, ny = dy / dist;
        const minDx = (nodes[i]._w + nodes[j]._w) / 2 + 50;
        const minDy = (nodes[i]._h + nodes[j]._h) / 2 + 36;
        const overlapX = minDx - Math.abs(dx), overlapY = minDy - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          const push = Math.min(overlapX, overlapY) * 0.08;
          fx[i] += nx * push; fy[i] += ny * push; fx[j] -= nx * push; fy[j] -= ny * push;
        } else {
          const rep = 3000 / (dist * dist);
          fx[i] += nx * rep; fy[i] += ny * rep; fx[j] -= nx * rep; fy[j] -= ny * rep;
        }
      }
    }
    edges.forEach(([i, j]) => {
      const ax = nodes[i]._x + nodes[i]._w / 2, ay = nodes[i]._y + nodes[i]._h / 2;
      const bx = nodes[j]._x + nodes[j]._w / 2, by = nodes[j]._y + nodes[j]._h / 2;
      const dx = bx - ax, dy = by - ay;
      const dist = Math.hypot(dx, dy) || 0.01;
      const target = (nodes[i]._w + nodes[j]._w) / 2 + 150;
      const diff = (dist - target) * 0.02;
      const nx = dx / dist, ny = dy / dist;
      fx[i] += nx * diff; fy[i] += ny * diff; fx[j] -= nx * diff; fy[j] -= ny * diff;
    });
    for (let i = 0; i < N; i++) {
      vx[i] = (vx[i] + fx[i]) * 0.72;
      vy[i] = (vy[i] + fy[i]) * 0.72;
      nodes[i]._x += vx[i]; nodes[i]._y += vy[i];
    }
  }

  let minX = Infinity, minY = Infinity;
  nodes.forEach(n => { minX = Math.min(minX, n._x); minY = Math.min(minY, n._y); });
  const map = new Map();
  nodes.forEach(n => map.set(n.key, { x: n._x - minX + 30, y: n._y - minY + 30, w: n._w, h: n._h }));
  return map;
}

function allNodesOf(model) {
  return [...model.tables, ...model.enums.map(e => ({ ...e, isEnum: true, key: 'enum:' + e.name }))];
}

function relayoutKeepingPositions(model, fullRelayout) {
  const nodes = allNodesOf(model);
  const keys = nodes.map(n => n.key);
  if (fullRelayout || posCache.size === 0) { posCache = autoLayout(model, nodes); return; }
  [...posCache.keys()].forEach(k => { if (!keys.includes(k)) posCache.delete(k); });
  let maxY = 0, anyExisting = false;
  posCache.forEach(p => { anyExisting = true; maxY = Math.max(maxY, p.y + p.h); });
  let cursorX = 20, cursorY = anyExisting ? maxY + 60 : 20, rowMaxH = 0;
  nodes.forEach(n => {
    if (posCache.has(n.key)) {
      const [w, h] = measureNode(n);
      const p = posCache.get(n.key); p.w = w; p.h = h;
      return;
    }
    const [w, h] = measureNode(n);
    if (cursorX > 1400) { cursorX = 20; cursorY += rowMaxH + 40; rowMaxH = 0; }
    posCache.set(n.key, { x: cursorX, y: cursorY, w, h });
    cursorX += w + 40; rowMaxH = Math.max(rowMaxH, h);
  });
}

// ── Render (DOM 建構，避免字串拼接造成注入疑慮) ─────────────────────────────

function el(tag, attrs = {}, ...children) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'text') { e.textContent = v; continue; }
    e.setAttribute(k, v);
  }
  children.flat().forEach(c => { if (c) e.appendChild(c); });
  return e;
}
function textNode(s) { return document.createTextNode(s); }

function makeMarker(id, kind) {
  const m = el('marker', { id, viewBox: '0 0 14 10', refX: kind === 'one' ? 8 : 0, refY: 5, markerWidth: 14, markerHeight: 10, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' });
  if (kind === 'one') {
    m.appendChild(el('line', { x1: 6, y1: 0, x2: 6, y2: 10, stroke: '#8b86a0', 'stroke-width': 1.3 }));
    m.appendChild(el('line', { x1: 9, y1: 0, x2: 9, y2: 10, stroke: '#8b86a0', 'stroke-width': 1.3 }));
  } else {
    m.appendChild(el('path', { d: 'M0,5 L13,0 M0,5 L13,5 M0,5 L13,10', fill: 'none', stroke: '#8b86a0', 'stroke-width': 1.3 }));
  }
  return m;
}
function buildDefs() {
  const defs = el('defs');
  defs.appendChild(makeMarker('dbml-m-one', 'one'));
  defs.appendChild(makeMarker('dbml-m-many', 'many'));
  return defs;
}

function buildTableGroup(node, i) {
  const pos = posCache.get(node.key);
  const w = pos.w, h = pos.h;
  const clipId = `dbml-clip-${i}`;
  const g = el('g', { class: 'dbml-table' + (node.isEnum ? ' dbml-enum' : ''), 'data-key': node.key, transform: `translate(${pos.x},${pos.y})` });
  g.appendChild(el('clipPath', { id: clipId }, el('rect', { width: w, height: h, rx: 8 })));
  const clipped = el('g', { 'clip-path': `url(#${clipId})` });
  const headH = node.isEnum ? ENUM_HEAD_H : HEADER_H;
  const headBg = el('rect', { class: node.isEnum ? 'dbml-enum-head-bg' : 'dbml-table-head-bg', width: w, height: headH, style: node.color ? `fill:${node.color}` : undefined });
  clipped.appendChild(el('g', { class: 'dbml-table-head' }, headBg, el('text', { class: 'dbml-table-title', x: w / 2, y: headH / 2 + 4, 'text-anchor': 'middle', text: titleText(node) })));

  const rows = node.isEnum ? node.values : node.columns;
  const rowH = node.isEnum ? ENUM_ROW_H : ROW_H;
  rows.forEach((c, ri) => {
    const y = headH + ri * rowH;
    const rowG = el('g', { class: 'dbml-row' + (ri % 2 ? ' dbml-row-alt' : ''), transform: `translate(0,${y})` });
    rowG.appendChild(el('rect', { class: 'dbml-row-bg', width: w, height: rowH }));
    if (node.isEnum) {
      rowG.appendChild(el('text', { class: 'dbml-row-name', x: 12, y: rowH / 2 + 4, text: c.name }));
    } else {
      rowG.appendChild(el('text', { class: 'dbml-row-key', x: 9, y: rowH / 2 + 4, text: c.pk ? '🔑' : '' }));
      rowG.appendChild(el('text', { class: 'dbml-row-name' + (c.pk ? ' pk' : ''), x: 24, y: rowH / 2 + 4, text: c.name }));
      rowG.appendChild(el('text', { class: 'dbml-row-type', x: w - 9, y: rowH / 2 + 4, 'text-anchor': 'end', text: c.type + badgeSuffix(c) }));
    }
    if (c.note) rowG.appendChild(el('title', {}, textNode(c.note)));
    clipped.appendChild(rowG);
  });

  g.appendChild(clipped);
  g.appendChild(el('rect', { class: 'dbml-table-border', width: w, height: h, rx: 8, fill: 'none' }));
  return g;
}

function columnAnchor(tableNode, pos, colName) {
  const headH = tableNode.isEnum ? ENUM_HEAD_H : HEADER_H;
  const rowH = tableNode.isEnum ? ENUM_ROW_H : ROW_H;
  const list = tableNode.isEnum ? tableNode.values : tableNode.columns;
  let idx = list.findIndex(c => c.name === colName);
  if (idx < 0) idx = 0;
  return { y: pos.y + headH + idx * rowH + rowH / 2 };
}

function edgePathD(x1, y1, x2, y2, fromSide) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.5, 50);
  const sign1 = fromSide === 'right' ? 1 : -1;
  const sign2 = fromSide === 'right' ? -1 : 1;
  return `M ${x1} ${y1} C ${x1 + dx * sign1} ${y1}, ${x2 + dx * sign2} ${y2}, ${x2} ${y2}`;
}

function buildEdge(ref, idx) {
  const fromPos = posCache.get(ref.from.key), toPos = posCache.get(ref.to.key);
  if (!fromPos || !toPos) return null;
  const fromAnchor = columnAnchor(ref.from, fromPos, ref.fromColumns[0]);
  const toAnchor = columnAnchor(ref.to, toPos, ref.toColumns[0]);
  const card = cardinalityOf(ref.op);
  let x1, x2, d;
  if (ref.from.key === ref.to.key) {
    x1 = x2 = fromPos.x + fromPos.w;
    const loopOut = 60;
    d = `M ${x1} ${fromAnchor.y} C ${x1 + loopOut} ${fromAnchor.y}, ${x2 + loopOut} ${toAnchor.y}, ${x2} ${toAnchor.y}`;
  } else {
    const fromCenterX = fromPos.x + fromPos.w / 2, toCenterX = toPos.x + toPos.w / 2;
    const fromSide = fromCenterX <= toCenterX ? 'right' : 'left';
    const toSide = fromSide === 'right' ? 'left' : 'right';
    x1 = fromSide === 'right' ? fromPos.x + fromPos.w : fromPos.x;
    x2 = toSide === 'right' ? toPos.x + toPos.w : toPos.x;
    d = edgePathD(x1, fromAnchor.y, x2, toAnchor.y, fromSide);
  }
  const path = el('path', {
    class: 'dbml-edge', d,
    'marker-start': markerFor(card.from), 'marker-end': markerFor(card.to),
    'data-from': ref.from.key, 'data-to': ref.to.key, 'data-idx': idx,
  });
  path.appendChild(el('title', {}, textNode(`${titleText(ref.from)}.${ref.fromColumns.join(',')} ${ref.op} ${titleText(ref.to)}.${ref.toColumns.join(',')}`)));
  return path;
}

function clearSvg() { if (dbSvgEl) while (dbSvgEl.firstChild) dbSvgEl.removeChild(dbSvgEl.firstChild); }

function render() {
  if (!dbSvgEl) return;
  clearSvg();
  if (!dbmlModel || (!dbmlModel.tables.length && !dbmlModel.enums.length)) return;
  dbSvgEl.appendChild(buildDefs());
  const edgesG = el('g', { id: 'dbEdgesG' });
  const tablesG = el('g', { id: 'dbTablesG' });
  dbSvgEl.appendChild(edgesG);
  dbSvgEl.appendChild(tablesG);

  const nodes = allNodesOf(dbmlModel);
  nodes.forEach(n => { if (!posCache.has(n.key)) { const [w, h] = measureNode(n); posCache.set(n.key, { x: 20, y: 20, w, h }); } });

  dbmlModel.refs.forEach((r, idx) => { const e = buildEdge(r, idx); if (e) edgesG.appendChild(e); });
  nodes.forEach((n, i) => tablesG.appendChild(buildTableGroup(n, i)));

  applyViewBox();
}

function redrawEdges() {
  const g = dbSvgEl && dbSvgEl.querySelector('#dbEdgesG');
  if (!g) return;
  while (g.firstChild) g.removeChild(g.firstChild);
  dbmlModel.refs.forEach((r, i) => { const e = buildEdge(r, i); if (e) g.appendChild(e); });
}

function updateTableTransform(key) {
  const g = dbSvgEl.querySelector(`.dbml-table[data-key="${CSS.escape(key)}"]`);
  const p = posCache.get(key);
  if (g && p) g.setAttribute('transform', `translate(${p.x},${p.y})`);
}

// ── Pan / Zoom / Drag ────────────────────────────────────────────────────────

function applyViewBox() { if (dbSvgEl) dbSvgEl.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`); }

function screenToSvg(clientX, clientY) {
  const pt = dbSvgEl.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(dbSvgEl.getScreenCTM().inverse());
}

function fitToScreen() {
  if (!posCache.size) { viewBox = { x: 0, y: 0, w: 1000, h: 700 }; applyViewBox(); return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  posCache.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h); });
  const margin = 40;
  viewBox = { x: x0 - margin, y: y0 - margin, w: (x1 - x0) + margin * 2, h: (y1 - y0) + margin * 2 };
  applyViewBox();
}

function zoomBy(factor, clientX, clientY) {
  if (!dbSvgEl || !dbStageWrapEl) return;
  const rect = dbStageWrapEl.getBoundingClientRect();
  const cx = clientX ?? (rect.left + rect.width / 2);
  const cy = clientY ?? (rect.top + rect.height / 2);
  const pt = screenToSvg(cx, cy);
  const newW = clamp(viewBox.w * factor, 250, 20000);
  const scaleChange = newW / viewBox.w;
  viewBox.x = pt.x - (pt.x - viewBox.x) * scaleChange;
  viewBox.y = pt.y - (pt.y - viewBox.y) * scaleChange;
  viewBox.w = newW; viewBox.h = viewBox.h * scaleChange;
  applyViewBox();
}

function bindStageEvents() {
  let dragMode = null, dragKey = null, lastX = 0, lastY = 0;
  const onWheel = e => { e.preventDefault(); zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); };
  const onDown = e => {
    if (e.button !== 0) return;
    const headEl = e.target.closest('.dbml-table-head');
    const tableEl = e.target.closest('.dbml-table');
    dragMode = (headEl && tableEl) ? 'table' : 'pan';
    dragKey = tableEl ? tableEl.dataset.key : null;
    lastX = e.clientX; lastY = e.clientY;
    dbStageWrapEl.classList.toggle('dbml-panning', dragMode === 'pan');
    dbStageWrapEl.setPointerCapture(e.pointerId);
  };
  const onMove = e => {
    if (!dragMode) return;
    const dxScreen = e.clientX - lastX, dyScreen = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    const rect = dbStageWrapEl.getBoundingClientRect();
    const scaleX = viewBox.w / rect.width, scaleY = viewBox.h / rect.height;
    if (dragMode === 'pan') {
      viewBox.x -= dxScreen * scaleX; viewBox.y -= dyScreen * scaleY;
      applyViewBox();
    } else if (dragMode === 'table' && dragKey) {
      const pos = posCache.get(dragKey);
      if (pos) { pos.x += dxScreen * scaleX; pos.y += dyScreen * scaleY; updateTableTransform(dragKey); redrawEdges(); }
    }
  };
  const onUp = e => {
    if (dragMode) { dbStageWrapEl.classList.remove('dbml-panning'); try { dbStageWrapEl.releasePointerCapture(e.pointerId); } catch {} }
    dragMode = null; dragKey = null;
  };
  dbStageWrapEl.addEventListener('wheel', onWheel, { passive: false });
  dbStageWrapEl.addEventListener('pointerdown', onDown);
  dbStageWrapEl.addEventListener('pointermove', onMove);
  dbStageWrapEl.addEventListener('pointerup', onUp);
  dbStageWrapEl.addEventListener('pointercancel', onUp);
}

function bindHoverDelegation() {
  dbSvgEl.addEventListener('pointerover', e => {
    const t = e.target.closest('.dbml-table');
    if (t) highlightTable(t.dataset.key);
  });
  dbSvgEl.addEventListener('pointerout', e => {
    const t = e.target.closest('.dbml-table');
    if (!t) return;
    const rel = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.dbml-table');
    if (rel && rel.dataset.key === t.dataset.key) return;
    clearHighlight();
  });
}

function highlightTable(key) {
  const related = new Set([key]);
  dbmlModel.refs.forEach(r => { if (r.from.key === key) related.add(r.to.key); if (r.to.key === key) related.add(r.from.key); });
  dbSvgEl.querySelectorAll('.dbml-table').forEach(g => {
    const k = g.dataset.key;
    g.classList.toggle('dbml-active', k === key);
    g.classList.toggle('dbml-dim', !related.has(k));
  });
  dbSvgEl.querySelectorAll('.dbml-edge').forEach(p => {
    const rel = p.dataset.from === key || p.dataset.to === key;
    p.classList.toggle('dbml-active', rel);
    p.classList.toggle('dbml-dim', !rel);
  });
}
function clearHighlight() {
  dbSvgEl.querySelectorAll('.dbml-table, .dbml-edge').forEach(x => x.classList.remove('dbml-active', 'dbml-dim'));
}

// ── Export（獨立於目前平移/縮放狀態，含完整內容 bbox；顏色寫死供離線開啟）────

const EXPORT_CSS = `
.dbml-table-body{fill:#ffffff}
.dbml-table-border{stroke:#c4bfdb;stroke-width:1}
.dbml-table-head-bg{fill:#f97316}
.dbml-enum-head-bg{fill:#6b7280}
.dbml-table-title{font:700 12.5px "Geist",sans-serif;fill:#ffffff}
.dbml-row-bg{fill:#ffffff}
.dbml-row-alt .dbml-row-bg{fill:#f5f4fb}
.dbml-row-key{font-size:11px}
.dbml-row-name{font:500 12px "JetBrains Mono",monospace;fill:#1a1b22}
.dbml-row-name.pk{font-weight:700;fill:#9d4300}
.dbml-row-type{font:10.5px "JetBrains Mono",monospace;fill:#5a5470}
.dbml-edge{fill:none;stroke:#5a5470;stroke-width:1.4}
`;

function buildExportSvg() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  posCache.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h); });
  if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 200; y1 = 100; }
  const margin = 30;
  const vx = x0 - margin, vy = y0 - margin, w = (x1 - x0) + margin * 2, h = (y1 - y0) + margin * 2;
  const svg = el('svg', { xmlns: SVGNS, viewBox: `${vx} ${vy} ${w} ${h}`, width: Math.round(w), height: Math.round(h) });
  const style = document.createElementNS(SVGNS, 'style');
  style.textContent = EXPORT_CSS;
  svg.appendChild(style);
  svg.appendChild(el('rect', { x: vx, y: vy, width: w, height: h, fill: '#f5f4fb' }));
  svg.appendChild(buildDefs());
  const edgesG = el('g'), tablesG = el('g');
  svg.appendChild(edgesG); svg.appendChild(tablesG);
  dbmlModel.refs.forEach((r, i) => { const e = buildEdge(r, i); if (e) edgesG.appendChild(e); });
  allNodesOf(dbmlModel).forEach((n, i) => tablesG.appendChild(buildTableGroup(n, i)));
  return svg;
}

function exportSvgString() {
  if (!dbmlModel || !dbmlModel.tables.length) return null;
  return new XMLSerializer().serializeToString(buildExportSvg());
}

function downloadSvg() {
  const s = exportSvgString();
  if (!s) { setStatus('沒有可匯出的圖表', true); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
  a.download = 'dbml-diagram.svg'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function downloadPng() {
  const s = exportSvgString();
  if (!s) { setStatus('沒有可匯出的圖表', true); return; }
  const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
  const w = parseFloat(doc.documentElement.getAttribute('width')) || 1200;
  const h = parseFloat(doc.documentElement.getAttribute('height')) || 800;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale; canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  img.onload = () => {
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png'); a.download = 'dbml-diagram.png'; a.click();
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { setStatus('PNG 轉換失敗', true); URL.revokeObjectURL(url); };
  img.src = url;
}

function copySvgCode() {
  const s = exportSvgString();
  if (!s) { setStatus('沒有可匯出的圖表', true); return; }
  const done = () => setStatus('已複製 SVG 原始碼');
  (navigator.clipboard?.writeText(s) ?? Promise.reject()).then(done).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = s; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta); done();
  });
}

// ── Tool state / lifecycle ───────────────────────────────────────────────────

let dbInputEl = null, dbSvgEl = null, dbStageWrapEl = null;
let dbmlModel = null;
let posCache = new Map();
let viewBox = { x: 0, y: 0, w: 1000, h: 700 };
let lastSrc = '';
let hasInitOnce = false;
let debounceTimer = null;

function setStatus(msg, isError) {
  const e = document.getElementById('dbStatus');
  if (e) { e.textContent = msg; e.className = 'json-status ' + (isError ? 'json-status-error' : 'json-status-ok'); }
}

function parseAndRender(fullRelayout) {
  const src = dbInputEl.value;
  if (!src.trim()) {
    dbmlModel = { tables: [], enums: [], refs: [] };
    posCache.clear();
    render();
    setStatus('尚未輸入 DBML，可點擊「範例」快速體驗');
    return;
  }
  try {
    const parsed = parseDBML(src);
    const model = buildModel(parsed);
    dbmlModel = model;
    relayoutKeepingPositions(model, fullRelayout);
    render();
    setStatus(`已解析：${model.tables.length} 個資料表・${model.refs.length} 條關聯・${model.enums.length} 個 Enum`, false);
  } catch (e) {
    setStatus('⚠ ' + (e.message || '解析失敗，請檢查語法'), true);
  }
}

function handleInput() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { lastSrc = dbInputEl.value; parseAndRender(false); }, 250);
}

export function template() {
  return `
    <style>
      #dbRoot { display:flex; flex-direction:column; }
      #dbShell { height:520px; }
      #dbInput { font-family:var(--mono); }
      #dbStageWrap { position:relative; width:100%; height:100%; overflow:hidden; background:var(--surface-low); cursor:grab; touch-action:none; }
      #dbStageWrap.dbml-panning { cursor:grabbing; }
      #dbSvg { width:100%; height:100%; display:block; }
      .dbml-table-body { fill:var(--surface); }
      .dbml-table-border { stroke:var(--outline-strong); stroke-width:1; }
      .dbml-table-head-bg { fill:var(--primary-container); }
      .dbml-enum-head-bg { fill:#6b7280; }
      .dbml-table-title { font:700 12.5px "Geist", sans-serif; fill:#fff; }
      .dbml-row-bg { fill:var(--surface); }
      .dbml-row-alt .dbml-row-bg { fill:var(--surface-low); }
      .dbml-row-key { font-size:11px; }
      .dbml-row-name { font:500 12px var(--mono); fill:var(--on-surface); }
      .dbml-row-name.pk { font-weight:700; fill:var(--primary); }
      .dbml-row-type { font:10.5px var(--mono); fill:var(--on-surface-variant); }
      .dbml-table-head { cursor:grab; }
      .dbml-table-head:active { cursor:grabbing; }
      .dbml-table.dbml-dim { opacity:.22; }
      .dbml-table.dbml-active .dbml-table-border { stroke:var(--primary); stroke-width:2; }
      .dbml-edge { fill:none; stroke:#8b86a0; stroke-width:1.4; }
      .dbml-edge.dbml-dim { opacity:.1; }
      .dbml-edge.dbml-active { stroke:var(--primary); stroke-width:2; }
      @media (max-width:640px) { #dbStageWrap { min-height:320px; } }
    </style>
    <div id="dbRoot">
      <p class="muted">貼上或上傳 <code>.dbml</code>（dbdiagram.io 語法）純文字結構，自動解析並排版成 ER 關聯圖。支援 Table / Column / Enum / Ref（含欄位內 <code>ref:</code> 簡寫）/ TableGroup。可拖曳表格調整位置、滾輪縮放、拖曳空白處平移，滑過表格會高亮關聯。</p>
      <div class="json-shell" id="dbShell">
        <div class="json-panel">
          <div class="json-panel-header">
            <span>DBML</span>
            <div class="button-row" style="gap:6px;margin:0;">
              <button class="btn-ghost" id="dbSample">範例</button>
              <button class="btn-ghost" id="dbClear">Clear</button>
            </div>
          </div>
          <textarea id="dbInput" spellcheck="false" placeholder="在此輸入 DBML，或拖曳 .dbml 檔案進來…"></textarea>
        </div>
        <div class="json-panel">
          <div class="json-panel-header">
            <span>ER 圖</span>
            <div class="button-row" style="gap:6px;margin:0;">
              <button class="btn-ghost" id="dbRelayout" title="重新自動排版">⤾ 排版</button>
              <button class="btn-ghost" id="dbFit" title="縮放至符合畫面">⛶ 符合</button>
              <button class="btn-ghost" id="dbZoomOut" title="縮小">－</button>
              <button class="btn-ghost" id="dbZoomIn" title="放大">＋</button>
            </div>
          </div>
          <div class="json-output-wrap">
            <div id="dbStageWrap">
              <svg id="dbSvg" xmlns="http://www.w3.org/2000/svg"></svg>
            </div>
          </div>
        </div>
      </div>
      <div class="json-toolbar">
        <button class="btn-ghost" id="dbDownloadSvg">下載 SVG</button>
        <button class="btn-ghost" id="dbDownloadPng">下載 PNG</button>
        <button class="btn-ghost" id="dbCopySvg">複製 SVG 原始碼</button>
        <span id="dbStatus" class="json-status"></span>
      </div>
    </div>
  `;
}

export function init() {
  dbInputEl = document.getElementById('dbInput');
  dbSvgEl = document.getElementById('dbSvg');
  dbStageWrapEl = document.getElementById('dbStageWrap');

  dbInputEl.value = lastSrc;
  dbInputEl.addEventListener('input', handleInput);

  bindStageEvents();
  bindHoverDelegation();

  document.getElementById('dbSample').addEventListener('click', () => {
    dbInputEl.value = SAMPLE; lastSrc = SAMPLE; posCache.clear();
    parseAndRender(true); fitToScreen();
  });
  document.getElementById('dbClear').addEventListener('click', () => {
    dbInputEl.value = ''; lastSrc = ''; posCache.clear(); dbmlModel = null;
    clearSvg(); setStatus('');
  });
  document.getElementById('dbRelayout').addEventListener('click', () => { parseAndRender(true); fitToScreen(); });
  document.getElementById('dbFit').addEventListener('click', fitToScreen);
  document.getElementById('dbZoomIn').addEventListener('click', () => zoomBy(1 / 1.25));
  document.getElementById('dbZoomOut').addEventListener('click', () => zoomBy(1.25));
  document.getElementById('dbDownloadSvg').addEventListener('click', downloadSvg);
  document.getElementById('dbDownloadPng').addEventListener('click', downloadPng);
  document.getElementById('dbCopySvg').addEventListener('click', copySvgCode);

  const panel = dbInputEl.closest('.json-panel');
  ['dragover', 'dragenter'].forEach(ev => panel.addEventListener(ev, e => { e.preventDefault(); panel.classList.add('md-drag'); }));
  ['dragleave', 'drop'].forEach(ev => panel.addEventListener(ev, e => { e.preventDefault(); panel.classList.remove('md-drag'); }));
  panel.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['dbml', 'txt', 'sql'].includes(ext) && !file.type.startsWith('text/')) {
      setStatus('不支援的檔案格式，請拖曳 .dbml / .txt', true); return;
    }
    if (file.size > 2 * 1024 * 1024) { setStatus('檔案過大（上限 2MB）', true); return; }
    const reader = new FileReader();
    reader.onload = () => {
      dbInputEl.value = reader.result; lastSrc = reader.result; posCache.clear();
      parseAndRender(true); fitToScreen(); setStatus('已載入 ' + file.name);
    };
    reader.readAsText(file);
  });

  if (!hasInitOnce) {
    hasInitOnce = true;
    if (lastSrc.trim()) { parseAndRender(true); fitToScreen(); }
    else { clearSvg(); setStatus('尚未輸入 DBML，可點擊「範例」快速體驗'); }
  } else {
    render();
    applyViewBox();
  }
}

export function reset() {
  lastSrc = ''; dbmlModel = null; posCache = new Map(); hasInitOnce = false;
  viewBox = { x: 0, y: 0, w: 1000, h: 700 };
  if (dbInputEl) dbInputEl.value = '';
  clearSvg();
  setStatus('');
}
