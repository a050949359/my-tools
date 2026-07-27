// 讓外部(目前是 Photopea MCP prototype 的 Chrome extension offscreen document)可以透過
// postMessage 呼叫這個工具箱裡支援 headless 呼叫的工具,不影響任何既有的 UI 邏輯/路由。
//
// 請求格式: { mcp: true, id, tool, action, params }
// 回應格式: { mcp: true, id, result } 或 { mcp: true, id, error: { message } }

const cache = {};

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.mcp !== true || typeof msg.id !== 'number') return;

  // 這不是真正的存取控制(my-tools 是公開靜態站,沒有祕密可保護),只是濾掉
  // 隨便一個網頁把本站嵌進 iframe 亂送訊息的情況,不做 token(公開 repo 裡藏不住)。
  if (!event.origin.startsWith('chrome-extension://')) return;

  const reply = (payload) => event.source.postMessage({ mcp: true, id: msg.id, ...payload }, event.origin);

  (async () => {
    try {
      if (!cache[msg.tool]) cache[msg.tool] = await import(`./tools/${msg.tool}.js`);
      const mod = cache[msg.tool];
      if (typeof mod.runHeadless !== 'function') {
        reply({ error: { message: `tool "${msg.tool}" 尚未支援 headless/MCP 呼叫` } });
        return;
      }
      const result = await mod.runHeadless(msg.action, msg.params);
      reply({ result });
    } catch (err) {
      reply({ error: { message: String(err?.message ?? err) } });
    }
  })();
});
