/* 离线（client）模式自动化测试：在 Node 中加载 app.js（带极简 DOM 桩），
 * 验证 本地排盘 / 历史 / 配置存储 / 直连 LM Studio 真模型解卦。
 * 运行：node tests/test_app_client.js [--no-llm] */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

// ---- 极简 DOM/浏览器桩（足够让 app.js 完成初始化） ----
const magic = new Proxy(function () {}, {
  get(t, p) {
    if (p === Symbol.iterator) return () => ({ next: () => ({ done: true }) });
    if (p === "then") return undefined;
    return magic;
  },
  set() { return true; },
  apply() { return magic; }
});

const mem = new Map();
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  performance: { now: () => Date.now() },
  fetch: global.fetch, URLSearchParams, URL, TextDecoder, AbortController,
  navigator: {}, location: { hash: "#/cast" },
  localStorage: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
  },
  document: magic, confirm: () => true, alert: () => {},
  addEventListener: () => {}, scrollTo: () => {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const root = path.join(__dirname, "..");
vm.runInContext(fs.readFileSync(path.join(root, "static", "engine.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "static", "app.js"), "utf8"), sandbox);

const LY = sandbox.__liuyao || sandbox.window.__liuyao;

(async () => {
  await new Promise((r) => setTimeout(r, 100)); // 等 detectMode 落定为 client（node 无服务器）
  assert.strictEqual(LY.mode, "client", "应自动进入离线模式");

  // 1) 离线排盘：水泽节 → 泽水困（与服务器版一致的向量）
  const throws = [["背", "背", "背"], ["背", "字", "字"], ["背", "背", "字"],
                  ["字", "字", "字"], ["背", "字", "字"], ["背", "背", "字"]];
  const { reading } = await LY.clientApi("/api/cast", { method: "POST", body: { question: "离线测试", throws } });
  assert.strictEqual(reading.pan.ben.name, "水泽节");
  assert.strictEqual(JSON.stringify(reading.pan.moving), JSON.stringify([1, 4]));
  assert.strictEqual(reading.pan.bian.name, "泽水困");
  console.log("✓ 离线排盘 OK：", reading.pan.ben.name, "→", reading.pan.bian.name);

  // 2) 历史 / 详情 / 删除
  const list = await LY.clientApi("/api/readings");
  assert.ok(list.readings.some((r) => r.id === reading.id));
  const one = await LY.clientApi("/api/readings/" + reading.id);
  assert.strictEqual(one.reading.id, reading.id);
  console.log("✓ 离线历史 OK（", list.readings.length, "条 ）");

  // 3) 配置存取（Key 脱敏读取、留空不覆盖）
  await LY.clientApi("/api/config", { method: "POST", body: { providers: { glm: { api_key: "TESTKEY123" } } } });
  const cfg1 = await LY.clientApi("/api/config");
  assert.strictEqual(cfg1.providers.glm.has_key, true);
  assert.strictEqual(cfg1.providers.glm.api_key, "");
  await LY.clientApi("/api/config", { method: "POST", body: { providers: { glm: { model: "glm-5.3" } } } });
  const raw = JSON.parse(mem.get("liuyao.config"));
  assert.strictEqual(raw.providers.glm.api_key, "TESTKEY123", "空 Key 不应覆盖已存 Key");
  console.log("✓ 离线配置 OK（Key 持久化且读取时脱敏）");

  // 4) 直连 LM Studio 真模型解卦（--no-llm 跳过）
  if (!process.argv.includes("--no-llm")) {
    try {
      const text = await LY.clientInterpret(one.reading, "lmstudio");
      assert.ok(text.length > 50, "解卦文本过短");
      const after = await LY.clientApi("/api/readings/" + reading.id);
      assert.strictEqual(after.reading.interpretations.length, 1);
      assert.ok(after.reading.interpretations[0].text.length > 50);
      console.log("✓ 直连 LM Studio 解卦 OK（%d 字，模型 %s）",
        after.reading.interpretations[0].text.length, after.reading.interpretations[0].model);
    } catch (e) {
      if (/fetch failed|ECONNREFUSED|获取模型列表/i.test(String(e))) {
        console.log("ⓘ LM Studio 未运行，跳过 LLM 实测：", String(e).slice(0, 80));
      } else throw e;
    }
  }

  await LY.clientApi("/api/readings/" + reading.id, { method: "DELETE" });
  const list2 = await LY.clientApi("/api/readings");
  assert.ok(!list2.readings.some((r) => r.id === reading.id));
  console.log("✓ 删除 OK —— 离线模式全部通过");

  // 5) 模拟安卓（Capacitor 原生环境）：即使 /api/config 返回 200 HTML 也必须判为离线
  const mem2 = new Map();
  const appEl = { innerHTML: "", addEventListener: () => {} }; // 记录渲染结果
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on("unhandledRejection", onUnhandled);
  const sandbox2 = {
    console, setTimeout, clearTimeout,
    performance: { now: () => Date.now() },
    fetch: async () => ({ ok: true, status: 200,
      headers: { get: () => "text/html" },
      json: async () => { throw new Error("html"); } }),
    URLSearchParams, URL, TextDecoder, AbortController,
    navigator: {}, location: { hash: "#/settings" },
    localStorage: { getItem: (k) => (mem2.has(k) ? mem2.get(k) : null),
      setItem: (k, v) => mem2.set(k, String(v)), removeItem: (k) => mem2.delete(k) },
    document: new Proxy({}, {
      get(t, p) {
        if (p === "getElementById") return (id) => (id === "app" ? appEl : magic);
        return magic;
      }
    }),
    confirm: () => true, alert: () => {},
    addEventListener: () => {}, scrollTo: () => {},
    Capacitor: { isNativePlatform: () => true, Plugins: {} }
  };
  sandbox2.window = sandbox2; sandbox2.globalThis = sandbox2;
  vm.createContext(sandbox2);
  vm.runInContext(fs.readFileSync(path.join(root, "static", "engine.js"), "utf8"), sandbox2);
  vm.runInContext(fs.readFileSync(path.join(root, "static", "app.js"), "utf8"), sandbox2);
  await new Promise((r) => setTimeout(r, 150));
  const LY2 = sandbox2.__liuyao;
  assert.strictEqual(LY2.mode, "client", "原生环境必须强制离线模式");
  // 设置页（#/settings）在手机环境下必须完整渲染且无异常
  assert.ok(/解读服务/.test(appEl.innerHTML), "设置页应渲染「解读服务」区块");
  assert.ok(/LM Studio/.test(appEl.innerHTML), "设置页应渲染 LM Studio 卡片");
  assert.ok(/GLM/.test(appEl.innerHTML), "设置页应渲染 GLM 卡片");
  assert.ok(/离线模式/.test(appEl.innerHTML), "设置页应显示离线模式标识");
  assert.strictEqual(unhandled.length, 0, "渲染过程不应有未捕获异常：" + (unhandled[0] && unhandled[0].message));
  process.off("unhandledRejection", onUnhandled);
  const cast2 = await LY2.clientApi("/api/cast", { method: "POST",
    body: { question: "手机测试", throws: [["背", "字", "字"], ["背", "背", "字"], ["字", "字", "字"],
      ["背", "字", "字"], ["背", "背", "背"], ["字", "字", "字"]] } });
  assert.ok(cast2.reading && cast2.reading.id, "排盘必须返回带 id 的 reading");
  console.log("✓ 原生环境强制离线模式 OK（回归：200 HTML 不再误判为服务器）");
  console.log("✓ 手机环境设置页渲染 OK（含 LM Studio/GLM 卡片、无未捕获异常）");
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
