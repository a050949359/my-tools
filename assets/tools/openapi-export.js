// OpenAPI → 內部 API 管理系統「新增 API」匯入 JSON 的轉換（純函式，不碰 DOM）
// 輸入皆為已解析的 spec 物件；YAML 解析由呼叫端負責

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
const MAX_DEPTH = 8;

// 列出 spec 內所有 operation，供 UI 勾選
export function listOperations(spec) {
  const ops = [];
  for (const [path, item] of Object.entries(spec.paths || {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (!op) continue;
      ops.push({ method, path, summary: op.summary || '', category: categoryOf(spec, op) });
    }
  }
  return ops;
}

export function operationToApiJson(spec, method, path) {
  const item = spec.paths?.[path];
  const op = item?.[method];
  if (!op) throw new Error(`找不到 operation: ${method.toUpperCase()} ${path}`);
  const ctx = { spec };

  const body = resolve(ctx, op.requestBody);
  const bodyMedia = pickJsonMedia(body?.content);

  return {
    methods: [method.toUpperCase()],
    path,
    category: categoryOf(spec, op),
    security: securityOf(spec, op),
    summary: op.summary || '',
    description: op.description || '',
    request_description: body?.description || '',
    request_fields: [
      ...paramFields(ctx, item.parameters, op.parameters),
      ...(bodyMedia ? schemaFields(ctx, bodyMedia.schema) : []),
    ],
    response_variants: responseVariants(ctx, op.responses),
  };
}

// 檔名：post_orders_domestic_search.json
export function apiJsonFileName(method, path) {
  const slug = path.replace(/[{}]/g, '').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
  return `${method.toLowerCase()}_${slug || 'root'}.json`;
}

// ---------- category / security ----------

// 第一個 tag；有 OpenAPI 3.2 `parent` 就沿鏈串成「A / B / C」，否則若在 x-tagGroups 裡就前綴群組名
function categoryOf(spec, op) {
  const name = op.tags?.[0];
  if (!name) return '未分類';
  const tagMap = new Map((spec.tags || []).map(t => [t.name, t]));
  const chain = [name];
  const seen = new Set(chain);
  let cur = tagMap.get(name);
  while (cur?.parent && !seen.has(cur.parent)) {
    chain.unshift(cur.parent);
    seen.add(cur.parent);
    cur = tagMap.get(cur.parent);
  }
  if (chain.length === 1) {
    const group = (spec['x-tagGroups'] || []).find(g => g.tags?.includes(name));
    if (group) chain.unshift(group.name);
  }
  return chain.join(' / ');
}

// operation 層的 security 優先於全域；空陣列或只有 {}（可匿名）視為 none
function securityOf(spec, op) {
  const reqs = op.security ?? spec.security ?? [];
  const names = [...new Set(reqs.flatMap(r => Object.keys(r || {})))];
  return names.length ? names.join(', ') : 'none';
}

// ---------- request ----------

// path 層與 operation 層參數合併（同 name+in 以 operation 層為準），放在 body 欄位前面
function paramFields(ctx, pathParams = [], opParams = []) {
  const merged = new Map();
  for (const p of [...pathParams, ...opParams].map(p => resolve(ctx, p))) {
    if (p?.name) merged.set(`${p.in}:${p.name}`, p);
  }
  return [...merged.values()].map(p => {
    const s = normalize(ctx, p.schema || {});
    const extra = remarkOf({ ...s, example: p.example ?? s.example });
    return {
      name: p.name,
      type: typeOf(s),
      description: p.description || s.description || '',
      remark: extra ? `(${p.in}) ${extra}` : `(${p.in})`,
      required: !!p.required || p.in === 'path',
      children: [],
    };
  });
}

// ---------- response ----------

// HTTP 一律取 200（或第一個 2xx），variants 依 response body 的 named examples 拆，code 取 body 裡的 code
function responseVariants(ctx, responses = {}) {
  const key = responses['200'] ? '200'
    : Object.keys(responses).find(k => /^2\d\d$/.test(k)) ?? (responses.default ? 'default' : Object.keys(responses)[0]);
  if (!key) return [];
  const res = resolve(ctx, responses[key]);
  const media = pickJsonMedia(res?.content);
  const fields = media ? schemaFields(ctx, media.schema) : [];

  const named = Object.entries(media?.examples || {});
  if (named.length) {
    return named.map(([exKey, ex]) => {
      const e = resolve(ctx, ex) || {};
      const value = exampleValueOf(e);
      return {
        code: codeOf(value),
        title: e.summary || exKey,
        description: e.description || '',
        fields,
        example: value,
      };
    });
  }

  // 3.2 的 response 有 summary（短標題），有的話 description 就放到 variant 的 description
  const example = media?.example ?? (media?.schema ? sampleOf(ctx, media.schema) : null);
  return [{
    code: codeOf(example),
    title: res?.summary || res?.description || '',
    description: res?.summary ? res?.description || '' : '',
    fields,
    example,
  }];
}

// 3.2 的 dataValue 優先，其次 value；只有 serializedValue（字串）時嘗試當 JSON 解析
function exampleValueOf(e) {
  if (e.dataValue !== undefined) return e.dataValue;
  if (e.value !== undefined) return e.value;
  if (typeof e.serializedValue === 'string') {
    try { return JSON.parse(e.serializedValue); } catch { return e.serializedValue; }
  }
  return null;
}

function codeOf(value) {
  return value && typeof value === 'object' && value.code != null ? String(value.code) : '';
}

// ---------- schema ----------

function schemaFields(ctx, schema, depth = 0, seen = new Set()) {
  if (!schema || depth > MAX_DEPTH) return [];
  const s = normalize(ctx, schema, seen);
  // 頂層是陣列時，展開 items 的欄位
  if (typeOf(s) === 'array') return schemaFields(ctx, s.items, depth + 1, seen);
  const required = new Set(s.required || []);
  return Object.entries(s.properties || {}).map(([name, raw]) => {
    const refSeen = new Set(seen);
    const p = normalize(ctx, raw, refSeen);
    const type = typeOf(p);
    const childSchema = type === 'object' ? p : type === 'array' ? p.items : null;
    // 循環參照時 normalize 會回傳 _cyclic，children 就停在這層
    const children = childSchema && !p._cyclic ? schemaFields(ctx, childSchema, depth + 1, refSeen) : [];
    return {
      name,
      type,
      description: p.description || p.title || '',
      remark: remarkOf(p),
      required: required.has(name),
      children,
    };
  });
}

// 解 $ref、合併 allOf、oneOf/anyOf 取第一個；seen 記錄已展開的 $ref 防循環
function normalize(ctx, schema, seen = new Set()) {
  if (!schema || typeof schema !== 'object') return {};
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return { type: 'object', _cyclic: true, description: refName(schema.$ref) };
    seen.add(schema.$ref);
    const { $ref, ...siblings } = schema;
    return normalize(ctx, { ...resolve(ctx, { $ref }), ...siblings }, seen);
  }
  if (schema.allOf) {
    // 依 allOf 順序合併，欄位順序跟著走；schema 自身的屬性最後蓋上去
    const { allOf, ...rest } = schema;
    return [...allOf.map(part => normalize(ctx, part, seen)), rest].reduce((acc, part) => ({
      ...acc,
      ...part,
      properties: { ...acc.properties, ...part.properties },
      required: [...new Set([...(acc.required || []), ...(part.required || [])])],
    }), {});
  }
  const variant = schema.oneOf?.[0] ?? schema.anyOf?.[0];
  if (variant) {
    const { oneOf, anyOf, ...rest } = schema;
    return { ...normalize(ctx, variant, seen), ...rest };
  }
  return schema;
}

// 3.1 的 type 可能是陣列（含 null），取第一個非 null
function typeOf(s) {
  const t = Array.isArray(s.type) ? s.type.find(x => x !== 'null') : s.type;
  if (t) return t;
  if (s.properties) return 'object';
  if (s.items) return 'array';
  return '';
}

// remark 依序取 example → examples[0] → enum → default
function remarkOf(s) {
  const v = s.example ?? (Array.isArray(s.examples) ? s.examples[0] : undefined);
  if (v !== undefined) return stringify(v);
  if (Array.isArray(s.enum)) return s.enum.map(stringify).join(' / ');
  if (s.default !== undefined) return stringify(s.default);
  return '';
}

function stringify(v) {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

// 沒有提供 example 時，依 schema 產生一份範例值
function sampleOf(ctx, schema, depth = 0, seen = new Set()) {
  const s = normalize(ctx, schema, seen);
  if (s.example !== undefined) return s.example;
  if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (s._cyclic || depth > MAX_DEPTH) return null;
  switch (typeOf(s)) {
    case 'object':
      return Object.fromEntries(Object.entries(s.properties || {})
        .map(([k, v]) => [k, sampleOf(ctx, v, depth + 1, new Set(seen))]));
    case 'array': return s.items ? [sampleOf(ctx, s.items, depth + 1, seen)] : [];
    case 'integer': case 'number': return 0;
    case 'boolean': return false;
    case 'string': return '';
    default: return null;
  }
}

// ---------- helpers ----------

function pickJsonMedia(content) {
  if (!content) return null;
  const keys = Object.keys(content);
  const key = keys.find(k => k === 'application/json') ?? keys.find(k => /json/i.test(k)) ?? keys[0];
  return key ? content[key] : null;
}

// 只處理文件內參照（#/components/...），外部檔案參照原樣回傳
function resolve(ctx, obj, depth = 0) {
  if (!obj?.$ref || depth > 20) return obj;
  if (!obj.$ref.startsWith('#/')) return obj;
  const target = obj.$ref.slice(2).split('/')
    .map(seg => decodeURIComponent(seg).replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((o, seg) => o?.[seg], ctx.spec);
  return resolve(ctx, target, depth + 1);
}

function refName(ref) {
  return ref.split('/').pop();
}

// ---------- zip（store，不壓縮）----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// files: [{ name, text }] → Uint8Array（zip 檔內容）；檔名以 UTF-8 標記（general purpose bit 11）
export function buildZip(files) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + 22);
  let pos = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, pos); pos += part.length; }
  return out;
}
