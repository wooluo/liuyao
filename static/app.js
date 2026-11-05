"use strict";
/* 六爻金钱卦 · 前端（原生 JS，零依赖） */

// ---------------- 基础工具 ----------------
const app = document.getElementById("app");
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

async function api(path, opts = {}) {
  if (MODE === "client") return clientApi(path, opts);
  const init = { method: opts.method || "GET", headers: { "Content-Type": "application/json" } };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const res = await fetch(path, init);
  const data = await res.json().catch(() => null);
  if (!res.ok || data === null || typeof data !== "object") {
    throw new Error((data && data.error) || "HTTP " + res.status);
  }
  return data;
}

// ---------------- 服务器探测 / 离线（App）模式 ----------------
let MODE = "server"; // server = 走本地 Python 服务；client = 离线（APK / 直接打开页面）

function lsGet(k, d) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
}
function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

function defaultConfig() {
  return {
    mode: "six", provider: "lmstudio",
    providers: {
      lmstudio: { label: "LM Studio（本地）", protocol: "openai", base: "http://localhost:1234/v1", model: "", api_key: "" },
      glm: { label: "GLM 智谱（Coding Plan）", protocol: "openai", base: "https://open.bigmodel.cn/api/coding/paas/v4", model: "glm-5.3", api_key: "" }
    }
  };
}

function clientRawConfig() { return lsGet("liuyao.config", null) || defaultConfig(); }

function applyConfigPatch(cfg, body) {
  if (body.mode === "six" || body.mode === "three") cfg.mode = body.mode;
  if (body.provider && cfg.providers[body.provider]) cfg.provider = body.provider;
  Object.entries(body.providers || {}).forEach(([pid, p]) => {
    if (!p || typeof p !== "object" || !cfg.providers[pid]) return;
    const tgt = cfg.providers[pid];
    ["label", "protocol", "base", "model"].forEach((k) => {
      if (typeof p[k] === "string") tgt[k] = p[k].trim();
    });
    if (p.protocol !== "openai" && p.protocol !== "anthropic") tgt.protocol = "openai";
    if (typeof p.api_key === "string" && p.api_key.trim()) tgt.api_key = p.api_key.trim();
  });
}

async function detectMode() {
  // 安卓/原生环境：必定离线模式（App 内置排盘引擎与直连能力，不依赖本机服务）
  const cap = typeof window !== "undefined" && window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) { MODE = "client"; return; }
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const res = await fetch("/api/config", { signal: ctl.signal });
    clearTimeout(t);
    const ct = res.headers.get("content-type") || "";
    if (res.ok && ct.indexOf("json") >= 0) {
      const data = await res.json().catch(() => null);
      if (data && data.providers) { MODE = "server"; return; }
    }
  } catch (e) { /* 无服务器 */ }
  MODE = "client";
}

function makeId() {
  const d = new Date(), p = (n) => (n < 10 ? "0" : "") + n;
  return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
    + "-" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

function fmtNow() {
  const d = new Date(), p = (n) => (n < 10 ? "0" : "") + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function readingSummaryClient(r) {
  const pan = r.pan || {};
  const ben = pan.mode === "three" ? (pan.tri || {}).name : (pan.ben || {}).name;
  return {
    id: r.id, created: r.created || "", question: r.question || "", mode: pan.mode || "six",
    ben: ben || "?", bian: (pan.bian || {}).name || "",
    day_ganzhi: (pan.sizhi || {}).day_ganzhi || "",
    moving_count: (pan.moving || []).length,
    interpretations: (r.interpretations || []).length
  };
}

// ---- 原生 HTTP（Capacitor 内绕过 CORS；浏览器则退回 fetch） ----
function nativeHttp() {
  const cap = typeof window !== "undefined" && window.Capacitor;
  if (cap && cap.Plugins && cap.Plugins.CapacitorHttp && (!cap.isNativePlatform || cap.isNativePlatform())) {
    return cap.Plugins.CapacitorHttp;
  }
  return null;
}

async function httpJSON(method, url, headers, bodyObj, timeoutMs) {
  const nh = nativeHttp();
  if (nh) {
    const r = await nh.request({ method, url, headers: headers || {}, data: bodyObj });
    if (r.status >= 400) {
      throw new Error("HTTP " + r.status + "：" + JSON.stringify(r.data).slice(0, 200));
    }
    return { status: r.status, json: r.data };
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs || 30000);
  try {
    const res = await fetch(url, {
      method, headers,
      body: bodyObj !== undefined ? JSON.stringify(bodyObj) : undefined,
      signal: ctl.signal
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const msg = j && j.error ? (j.error.message || j.error) : JSON.stringify(j).slice(0, 200);
      throw new Error("HTTP " + res.status + "：" + (msg || ""));
    }
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } finally { clearTimeout(t); }
}

async function fetchModelsDirect(pcfg) {
  const base = (pcfg.base || "").replace(/\/+$/, "");
  if (!base) return [];
  const url = base + (pcfg.protocol === "anthropic" ? "/v1/models" : "/models");
  const headers = {};
  if (pcfg.api_key) { headers.Authorization = "Bearer " + pcfg.api_key; headers["x-api-key"] = pcfg.api_key; }
  const { json } = await httpJSON("GET", url, headers, undefined, 10000);
  return (json.data || []).map((m) => m && m.id).filter(Boolean);
}

const NON_CHAT_MODEL = /embed|rerank|ocr|whisper|speech|tts|stt|audio|clip/i;

async function clientApi(path, opts = {}) {
  const method = opts.method || "GET";
  const body = opts.body || {};
  if (path === "/api/config" && method === "GET") {
    const cfg = JSON.parse(JSON.stringify(clientRawConfig()));
    Object.values(cfg.providers).forEach((p) => { p.has_key = !!p.api_key; p.api_key = ""; });
    return cfg;
  }
  if (path === "/api/config" && method === "POST") {
    const cfg = clientRawConfig();
    applyConfigPatch(cfg, body);
    lsSet("liuyao.config", cfg);
    return { ok: true };
  }
  if (path === "/api/cast") {
    const throws = body.throws;
    if (!Array.isArray(throws) || ![3, 6].includes(throws.length)) throw new Error("throws 应为 3 或 6 次掷币结果");
    const mode = throws.length === 3 ? "three" : "six";
    const pan = mode === "three"
      ? LiuYao.buildTriPan(throws, LiuYao.nowDT(), LiuYao.localTZ())
      : LiuYao.buildPan(throws, LiuYao.nowDT(), LiuYao.localTZ());
    const readings = lsGet("liuyao.readings", []);
    const reading = {
      id: makeId(), created: fmtNow(),
      question: (body.question || "").slice(0, 200),
      pan, interpretations: []
    };
    readings.unshift(reading);
    lsSet("liuyao.readings", readings);
    return { reading };
  }
  if (path === "/api/readings") {
    return { readings: lsGet("liuyao.readings", []).map(readingSummaryClient) };
  }
  const m = path.match(/^\/api\/readings\/([\w-]+)$/);
  if (m && method === "GET") {
    const r = lsGet("liuyao.readings", []).find((x) => x.id === m[1]);
    if (!r) throw new Error("记录不存在");
    return { reading: r };
  }
  if (m && method === "DELETE") {
    lsSet("liuyao.readings", lsGet("liuyao.readings", []).filter((x) => x.id !== m[1]));
    return { ok: true };
  }
  if (path.startsWith("/api/models")) {
    const pid = new URLSearchParams(path.split("?")[1] || "").get("provider") || "";
    const pcfg = clientRawConfig().providers[pid];
    if (!pcfg) throw new Error("未知 provider");
    return { models: await fetchModelsDirect(pcfg) };
  }
  throw new Error("离线模式不支持：" + path);
}

// ---- 离线直连解卦 ----
// 安卓 App 内置原生 StreamHttp 插件时可流式；浏览器（受 CORS）退回非流式整段返回。
function nativeStreamHttp() {
  const cap = typeof window !== "undefined" && window.Capacitor;
  if (cap && cap.Plugins && cap.Plugins.StreamHttp &&
      (!cap.isNativePlatform || cap.isNativePlatform())) {
    return cap.Plugins.StreamHttp;
  }
  return null;
}

async function resolveClientModel(pcfg) {
  let model = (pcfg.model || "").trim();
  if (!model) {
    try {
      const ms = await fetchModelsDirect(pcfg);
      model = ms.find((x) => !NON_CHAT_MODEL.test(x)) || ms[0] || "";
    } catch (e) { /* 留空报错 */ }
  }
  return model;
}

function clientRequestBody(pcfg, model, reading, stream) {
  const msgs = LiuYao.buildMessages(reading);
  const base = (pcfg.base || "").replace(/\/+$/, "");
  if (pcfg.protocol === "anthropic") {
    const headers = { "Content-Type": "application/json", "anthropic-version": "2023-06-01" };
    if (pcfg.api_key) { headers["x-api-key"] = pcfg.api_key; headers.Authorization = "Bearer " + pcfg.api_key; }
    return {
      url: base + "/v1/messages", headers,
      payload: { model, max_tokens: 4096, temperature: 0.7, stream: !!stream, system: msgs.system,
                 messages: [{ role: "user", content: msgs.user }] }
    };
  }
  const headers = { "Content-Type": "application/json" };
  if (pcfg.api_key) headers.Authorization = "Bearer " + pcfg.api_key;
  return {
    url: base + "/chat/completions", headers,
    payload: { model, temperature: 0.7, stream: !!stream,
               messages: [{ role: "system", content: msgs.system }, { role: "user", content: msgs.user }] }
  };
}

function saveClientInterpretation(reading, pid, label, model, text) {
  if (!text) return;
  const readings = lsGet("liuyao.readings", []);
  const target = readings.find((x) => x.id === reading.id);
  if (!target) return;
  target.interpretations = target.interpretations || [];
  target.interpretations.push({ provider: pid, label: label || pid, model, at: fmtNow(), text });
  lsSet("liuyao.readings", readings);
}

// 非流式（浏览器离线模式）
async function clientInterpret(reading, pid) {
  const pcfg = clientRawConfig().providers[pid];
  if (!pcfg) throw new Error("未知 provider：" + pid);
  const model = await resolveClientModel(pcfg);
  if (!model) throw new Error("未配置模型名，且无法从服务获取模型列表。请在设置里填写模型。");
  const req = clientRequestBody(pcfg, model, reading, false);
  const { json } = await httpJSON("POST", req.url, req.headers, req.payload, 300000);
  let text = "";
  if (json && Array.isArray(json.choices) && json.choices[0]) {
    text = (json.choices[0].message || {}).content || "";
  } else if (json && Array.isArray(json.content)) {
    text = json.content.map((b) => (b && b.text) || "").join("");
  }
  if (!text) throw new Error("模型未返回内容：" + JSON.stringify(json).slice(0, 160));
  saveClientInterpretation(reading, pid, pcfg.label, model, text);
  return text;
}

// 流式（原生 StreamHttp 插件）：SSE 增量逐段回调 onDelta，结束/停止保存已生成部分
let nativeStreamCancel = null;

function clientInterpretStream(reading, pid, onDelta) {
  return new Promise((resolve, reject) => {
    (async () => {
      const plugin = nativeStreamHttp();
      const pcfg = clientRawConfig().providers[pid];
      if (!pcfg) { reject(new Error("未知 provider：" + pid)); return; }
      const model = await resolveClientModel(pcfg);
      if (!model) { reject(new Error("未配置模型名，且无法从服务获取模型列表。请在设置里填写模型。")); return; }
      const req = clientRequestBody(pcfg, model, reading, true);
      const id = "s" + Date.now() + "-" + Math.floor(Math.random() * 1000);
      let acc = "", finished = false;
      const handles = [];
      const cleanup = () => { handles.forEach((h) => { try { h.remove && h.remove(); } catch (e) {} }); };
      const finish = (err) => {
        if (finished) return;
        finished = true;
        cleanup();
        nativeStreamCancel = null;
        if (acc) saveClientInterpretation(reading, pid, pcfg.label, model, acc); // 停止也保留已生成部分
        if (err) reject(err);
        else if (!acc) reject(new Error("模型未返回内容"));
        else resolve(acc);
      };
      nativeStreamCancel = () => { try { plugin.cancel({ id }); } catch (e) {} };
      try {
        handles.push(await plugin.addListener("stream-http-data", (e) => {
          if (e.id !== id || !e.payload || e.payload === "[DONE]") return;
          let obj;
          try { obj = JSON.parse(e.payload); } catch (err) { return; }
          let t = "";
          if (obj.choices && obj.choices[0]) t = ((obj.choices[0].delta) || {}).content || "";
          else if (obj.type === "content_block_delta") t = (obj.delta || {}).text || "";
          if (t) { acc += t; onDelta(acc); }
        }));
        handles.push(await plugin.addListener("stream-http-end", (e) => { if (e.id === id) finish(); }));
        handles.push(await plugin.addListener("stream-http-error", (e) => {
          if (e.id === id) finish(new Error(e.message || "上游错误"));
        }));
        await plugin.request({ id, url: req.url, headers: req.headers, body: JSON.stringify(req.payload) });
      } catch (e) { finish(e); }
    })();
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制到剪贴板");
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("已复制到剪贴板");
  }
}

// ---------------- 常量 ----------------
const POS_SIX = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"];
const POS_THREE = ["初爻", "二爻", "三爻"];
const YANG = "▅▅▅▅▅";
const YIN = "▅▅ ▅▅";

function throwInfo(throw3) {
  const backs = throw3.filter((c) => c === "背").length;
  const map = {
    0: { label: "三字 · 交（老阴，动）", value: 6 },
    1: { label: "一背 · 单（少阳）", value: 7 },
    2: { label: "两背 · 拆（少阴）", value: 8 },
    3: { label: "三背 · 重（老阳，动）", value: 9 },
  }[backs];
  return {
    backs,
    label: map.label,
    value: map.value,
    sym: map.value === 7 || map.value === 9 ? YANG : YIN,
    moving: map.value === 6 || map.value === 9,
  };
}

function lineSym(v) {
  const s = v === 7 || v === 9 ? YANG : YIN;
  return s + (v === 9 ? " ○" : v === 6 ? " ✕" : "");
}

// ---------------- 极简 Markdown ----------------
function md(src) {
  const inline = (t) =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  const out = [];
  let para = [], list = null;
  const flushP = () => { if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; } };
  const flushL = () => { if (list) { out.push("</" + list + ">"); list = null; } };
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { flushP(); flushL(); continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
      flushP(); flushL();
      const lv = Math.min(m[1].length + 1, 4);
      out.push(`<h${lv}>${inline(m[2])}</h${lv}>`);
    } else if (/^(---+|\*\*\*+|___+)$/.test(l)) {
      flushP(); flushL(); out.push("<hr>");
    } else if ((m = l.match(/^[-•]\s+(.*)$/))) {
      flushP();
      if (list !== "ul") { flushL(); out.push("<ul>"); list = "ul"; }
      out.push("<li>" + inline(m[1]) + "</li>");
    } else if ((m = l.match(/^(\d+)[.、)]\s+(.*)$/))) {
      flushP();
      if (list !== "ol") { flushL(); out.push("<ol>"); list = "ol"; }
      out.push("<li>" + inline(m[2]) + "</li>");
    } else if ((m = l.match(/^>\s?(.*)$/))) {
      flushP(); flushL();
      out.push("<blockquote>" + inline(m[1]) + "</blockquote>");
    } else {
      flushL(); para.push(l);
    }
  }
  flushP(); flushL();
  return out.join("\n");
}

// ---------------- 配置缓存 ----------------
let config = null;
async function loadConfig(force) {
  if (config && !force) return config;
  try { config = await api("/api/config"); } catch (e) { config = null; }
  return config;
}

// ---------------- 路由 ----------------
window.addEventListener("hashchange", route);

function route() {
  const h = location.hash || "#/cast";
  const m = h.match(/^#\/([a-z]+)(?:\/([\w-]+))?/);
  const page = m ? m[1] : "cast";
  $$(".topbar nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === page));
  window.scrollTo(0, 0);
  if (page === "history") return renderHistory();
  if (page === "settings") return renderSettings();
  if (page === "reading" && m[2]) return renderReading(m[2]);
  return renderCast();
}

// ---------------- 起卦页 ----------------
let cast = null;
function resetCast(keepQuestion) {
  const q = keepQuestion && cast ? cast.question : "";
  cast = { mode: "six", throws: [], coins: [null, null, null], question: q };
}

async function renderCast() {
  const cfg = await loadConfig(true);
  if (!cast || cast.done) resetCast();
  cast.mode = (cfg && cfg.mode) || "six";

  app.innerHTML = `
  <section>
    <div class="card">
      <h2>起卦 <span class="sub">凝神静气，默念所问之事</span></h2>
      <label class="field">所问之事（一事一占，尽量具体）</label>
      <input type="text" id="q" maxlength="60" placeholder="例：这个月跳槽去新公司，是否合适？">
      <label class="field">卦式</label>
      <div class="mode-row">
        <span class="chip" id="mode-six">六爻 · 摇六次（标准排盘）</span>
        <span class="chip" id="mode-three">三爻 · 摇三次（简化）</span>
      </div>
      <div class="hint">硬币约定：<b>花 / 国徽面 = 背</b>，面值数字面 = 字。<br>
        一背为单（少阳）、两背为拆（少阴）、三背为重（老阳·动爻 ○）、三字为交（老阴·动爻 ✕）。</div>
    </div>
    <div class="card" id="step-card"></div>
    <div class="card">
      <h2>卦象 <span class="sub">自下而上累积</span></h2>
      <div class="gua-preview" id="pv"></div>
    </div>
  </section>`;

  const qEl = $("#q");
  qEl.value = cast.question;
  qEl.addEventListener("input", () => { cast.question = qEl.value; });
  $("#mode-six").addEventListener("click", () => setMode("six"));
  $("#mode-three").addEventListener("click", () => setMode("three"));
  updateCastUI();
}

async function setMode(mode) {
  if (cast.throws.length && cast.mode !== mode) {
    if (!confirm("切换卦式会清空已摇的爻，确定？")) return;
    resetCast(true);
  }
  cast.mode = mode;
  try { await api("/api/config", { method: "POST", body: { mode } }); config.mode = mode; } catch (e) { /* 忽略 */ }
  $("#mode-six").classList.toggle("active", mode === "six");
  $("#mode-three").classList.toggle("active", mode === "three");
  updateCastUI();
}

function updateCastUI() {
  $("#mode-six").classList.toggle("active", cast.mode === "six");
  $("#mode-three").classList.toggle("active", cast.mode === "three");
  const N = cast.mode === "six" ? 6 : 3;
  const names = cast.mode === "six" ? POS_SIX : POS_THREE;
  const sc = $("#step-card");
  const done = cast.throws.length >= N;
  const i = cast.throws.length;

  if (done) {
    sc.innerHTML = `
      <h2>卦成</h2>
      <div class="throw-preview"><span class="mov">六爻已定</span>${cast.mode === "six" ? "，可以成卦排盘" : ""}</div>
      <div class="btn-row">
        <button class="btn primary big" id="do-cast">成卦排盘 →</button>
        <button class="btn ghost" id="redo-all">重新摇</button>
      </div>`;
    $("#do-cast").addEventListener("click", doCast);
    $("#redo-all").addEventListener("click", () => { resetCast(true); updateCastUI(); });
  } else {
    const full = cast.coins.every((c) => c);
    const info = full ? throwInfo(cast.coins) : null;
    sc.innerHTML = `
      <h2>掷币 <span class="sub">第 ${i + 1} / ${N} 次</span></h2>
      <div class="step-head">
        <span class="step-title">记录 <b>${names[i]}</b></span>
        <span class="step-progress">已记 ${i} / ${N} 爻</span>
      </div>
      <div class="coins">
        ${[0, 1, 2].map((k) => `
          <div class="coin-pair">
            <button class="coin-btn ${cast.coins[k] === "字" ? "sel-zi" : ""}" data-k="${k}" data-side="字">字</button>
            <button class="coin-btn ${cast.coins[k] === "背" ? "sel-bei" : ""}" data-k="${k}" data-side="背">背</button>
            <span class="coin-idx">第${k + 1}枚</span>
          </div>`).join("")}
      </div>
      <div class="throw-preview" id="throw-preview">${
        full
          ? `<span>${info.backs} 背 ${3 - info.backs} 字</span><span class="sym">${info.sym}</span>` +
            `<span class="${info.moving ? "mov" : ""}">${info.label}</span>`
          : "请点选三枚硬币各自的结果"
      }</div>
      <div class="btn-row">
        <button class="btn primary" id="confirm-throw" ${full ? "" : "disabled"}>记下这一爻</button>
        ${i > 0 ? '<button class="btn ghost" id="undo-throw">撤销上一爻</button>' : ""}
        ${i > 0 ? '<button class="btn ghost" id="redo-all">重来</button>' : ""}
      </div>`;
    $$(".coin-btn", sc).forEach((b) =>
      b.addEventListener("click", () => {
        const k = +b.dataset.k;
        cast.coins[k] = cast.coins[k] === b.dataset.side ? null : b.dataset.side;
        updateCastUI();
      }));
    const ct = $("#confirm-throw");
    if (ct) ct.addEventListener("click", () => { cast.throws.push(cast.coins.slice()); cast.coins = [null, null, null]; updateCastUI(); });
    const ut = $("#undo-throw");
    if (ut) ut.addEventListener("click", () => { cast.throws.pop(); cast.coins = [null, null, null]; updateCastUI(); });
    const rd = $("#redo-all");
    if (rd) rd.addEventListener("click", () => { if (confirm("清空已摇的爻，重新开始？")) { resetCast(true); updateCastUI(); } });
  }

  // 卦象预览（自下而上）
  const pv = $("#pv");
  let rows = "";
  for (let j = 0; j < N; j++) {
    if (j < cast.throws.length) {
      const info = throwInfo(cast.throws[j]);
      rows += `<div class="pv-row"><span class="pv-sym">${lineSym(info.value)}</span>` +
        `<span>${names[j]} · <b>${info.label.replace(/（.*）/, "")}</b>${info.moving ? "（动）" : ""}</span></div>`;
    } else if (j === cast.throws.length && !done) {
      rows += `<div class="pv-row cur"><span class="pv-sym">▅ ▅ ▅</span><span>${names[j]} · 待摇</span></div>`;
    }
  }
  pv.innerHTML = rows || '<div class="pv-row cur"><span class="pv-sym">▅ ▅ ▅</span><span>待摇</span></div>';
}

async function doCast() {
  const btn = $("#do-cast");
  btn.disabled = true;
  btn.textContent = "排盘中…";
  try {
    const data = await api("/api/cast", {
      method: "POST",
      body: { question: cast.question.trim(), throws: cast.throws, mode: cast.mode },
    });
    resetCast();
    location.hash = "#/reading/" + data.reading.id;
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
    btn.textContent = "成卦排盘 →";
  }
}

// ---------------- 排盘页 ----------------
function lineSymHtml(v) {
  const s = v === 7 || v === 9 ? YANG : YIN;
  const mk = v === 9 ? ' <span class="mk">○</span>' : v === 6 ? ' <span class="mk">✕</span>' : "";
  return s + mk;
}

function yaoRowHtml(ln, bianLn) {
  const marks = [ln.is_shi ? "世" : "", ln.is_ying ? "应" : ""].filter(Boolean).join("");
  return `<div class="yao-row">
    <span class="god">${esc(ln.liushen)}</span>
    <span class="post">${esc(ln.label)}</span>
    <span class="yao-line">${lineSymHtml(ln.value)}</span>
    <span class="yao-gz">${esc(ln.ganzhi)}${esc(ln.element)}<span class="lq">${esc(ln.liuqin)}</span>
      ${marks ? `<span class="sy">${marks}</span>` : ""}
      ${ln.fu ? `<span class="fu">伏 ${esc(ln.fu.ganzhi)}${esc(ln.fu.element)}${esc(ln.fu.liuqin)}</span>` : ""}
    </span>
  </div>`;
}

async function renderReading(id) {
  let reading;
  try {
    reading = (await api("/api/readings/" + id)).reading;
  } catch (e) {
    app.innerHTML = `<div class="card"><div class="err-box">记录不存在或已删除。<br><a href="#/history">← 返回历史</a></div></div>`;
    return;
  }
  const cfg = (await loadConfig()) || { providers: {}, provider: "" };
  const pan = reading.pan;
  const z = pan.sizhi;
  const names = pan.mode === "six" ? POS_SIX : POS_THREE;

  const chips = [`<span class="tag">${esc(z.day_ganzhi)}日</span>`];
  if (z.month_branch) chips.push(`<span class="tag">${esc(z.month_branch)}月 · ${esc(z.month_term)}后</span>`);
  chips.push(`<span class="tag">旬空 ${esc((z.xunkong || []).join(""))}</span>`);
  if (z.yuepo) chips.push(`<span class="tag red">月破 ${esc(z.yuepo)}</span>`);
  chips.push(`<span class="tag">${esc(pan.datetime)} ${esc(z.weekday)}</span>`);
  chips.push(`<span class="tag">${pan.mode === "six" ? "六爻卦" : "三爻卦"}</span>`);

  let panHtml = "";
  if (pan.mode === "six") {
    const b = pan.ben, bian = pan.bian;
    const movingLabels = pan.moving.map((p) => b.lines[p - 1].label + (b.lines[p - 1].moving ? (b.lines[p - 1].value === 9 ? "○" : "✕") : ""));
    let right = "";
    if (bian) {
      right = `<div>
        <h4>变卦 · ${esc(bian.name)}</h4>
        <div class="mini-row">${esc(bian.palace)}宫${esc(bian.gen_label)} · 属${esc(bian.palace_element)}</div>
        ${pan.moving.map((p) => {
          const bl = bian.lines[p - 1];
          return `<div class="mini-row">${esc(b.lines[p - 1].label)} ⇒ <span class="to">${esc(bl.ganzhi)}${esc(bl.element)}${esc(bl.liuqin)}</span></div>`;
        }).join("")}
      </div>`;
    } else {
      right = `<div><h4>静卦</h4><div class="mini-row">六爻安静，无动爻，以本卦断之。</div></div>`;
    }
    panHtml = `
      <div class="pan-two">
        <div>
          <div class="gua-head">
            <div>
              <div class="gua-name"><span class="syms">${esc(b.inner_symbol)}${esc(b.outer_symbol)}</span>${esc(b.name)}</div>
              <div class="gua-sub">${esc(b.palace)}宫${esc(b.gen_label)} · 属${esc(b.palace_element)} · 世${esc(POS_SIX[b.shi - 1].replace("爻", ""))} 应${esc(POS_SIX[b.ying - 1].replace("爻", ""))}</div>
            </div>
          </div>
          <div class="pan-grid">${[5, 4, 3, 2, 1, 0].map((i) => yaoRowHtml(b.lines[i], bian && bian.lines[i])).join("")}</div>
        </div>
        <div class="right">${right}</div>
      </div>
      <div class="sizhi-chips">${pan.moving.length ? `<span class="tag red">动爻：${movingLabels.join("、")}</span>` : '<span class="tag">六爻安静</span>'}</div>`;
  } else {
    const t = pan.tri, bian = pan.bian;
    panHtml = `
      <div class="pan-two">
        <div>
          <div class="gua-head">
            <div>
              <div class="gua-name"><span class="syms">${esc(t.symbol)}</span>${esc(t.name)}为${esc(t.name)}</div>
              <div class="gua-sub">属${esc(t.element)} · 三爻简化卦</div>
            </div>
          </div>
          <div class="pan-grid">${[2, 1, 0].map((i) => {
            const ln = t.lines[i];
            return `<div class="yao-row"><span class="god"></span><span class="post">${esc(ln.label)}</span>
              <span class="yao-line">${lineSymHtml(ln.value)}</span><span class="yao-gz"></span></div>`;
          }).join("")}</div>
        </div>
        <div class="right">
          <div><h4>${bian ? "变卦 · " + esc(bian.name) : "静卦"}</h4>
          <div class="mini-row">${pan.moving.length ? "动爻：" + pan.moving.map((p) => names[p - 1]).join("、") : "无动爻"}</div>
          ${bian ? `<div class="mini-row">属${esc(bian.element)}</div>` : ""}</div>
        </div>
      </div>`;
  }

  const provChips = Object.entries(cfg.providers || {}).map(([pid, p]) =>
    `<span class="chip ${pid === cfg.provider ? "active" : ""}" data-prov="${pid}">${esc(p.label)}</span>`).join("");

  const interps = reading.interpretations || [];
  const latest = interps[interps.length - 1];
  const oldHtml = interps.length > 1
    ? `<details class="old-interp"><summary>历史解读（${interps.length - 1} 次）</summary>${
        interps.slice(0, -1).reverse().map((it) =>
          `<div style="margin-top:10px"><div class="interp-meta">${esc(it.at)} · ${esc(it.label)} · ${esc(it.model)}</div><div class="stream">${md(it.text)}</div></div>`).join("")
      }</details>`
    : "";

  app.innerHTML = `
  <section>
    <div class="card">
      <h2>所问之事</h2>
      <div style="font-size:16px;line-height:1.7">${esc(reading.question || "（未注明）")}</div>
      <div class="sizhi-chips">${chips.join("")}</div>
    </div>
    <div class="card">
      <h2>排盘 <span class="sub">京房纳甲 · 自上而下</span></h2>
      ${panHtml}
      <div class="btn-row">
        <button class="btn ghost small" id="copy-pan">复制排盘文本</button>
        <a class="btn ghost small" href="#/cast" style="text-decoration:none">再摇一卦</a>
      </div>
    </div>
    <div class="card">
      <h2>AI 解卦 <span class="sub">流式输出 · 自动保存</span></h2>
      <div class="chips" id="prov-chips">${provChips}</div>
      <div class="btn-row">
        <button class="btn primary" id="start-interp">${latest ? "再解一次" : "开始解卦"}</button>
        <button class="btn ghost" id="stop-interp" style="display:none">停止</button>
        ${latest ? '<button class="btn ghost small" id="copy-interp">复制解读</button>' : ""}
      </div>
      ${latest ? `<div class="interp-meta">最近：${esc(latest.at)} · ${esc(latest.label)} · ${esc(latest.model)}</div>` : ""}
      <div class="stream ${latest ? "" : "waiting"}" id="interp-area">${latest ? md(latest.text) : "选择解读服务（点上方标签切换），然后点「开始解卦」"}</div>
      <div class="err-box" id="interp-err" hidden></div>
      ${oldHtml}
    </div>
  </section>`;

  $("#copy-pan").addEventListener("click", () => copyText(panTextClient(reading)));
  const ci = $("#copy-interp");
  if (ci) ci.addEventListener("click", () => copyText(latest.text));
  $$("#prov-chips .chip").forEach((c) =>
    c.addEventListener("click", async () => {
      const pid = c.dataset.prov;
      try {
        await api("/api/config", { method: "POST", body: { provider: pid } });
        cfg.provider = pid;
        $$("#prov-chips .chip").forEach((x) => x.classList.toggle("active", x.dataset.prov === pid));
        toast("默认解读服务：" + cfg.providers[pid].label);
      } catch (e) { toast(e.message); }
    }));
  $("#start-interp").addEventListener("click", () => startInterp(reading.id, cfg.provider));
  $("#stop-interp").addEventListener("click", () => {
    if (interpCtl) interpCtl.abort();
    if (nativeStreamCancel) nativeStreamCancel();
  });
}

let interpCtl = null;

async function startInterp(rid, pid) {
  if (interpCtl) return;
  const area = $("#interp-area");
  const errBox = $("#interp-err");
  const startBtn = $("#start-interp");
  const stopBtn = $("#stop-interp");

  if (MODE === "client") {  // 离线直连：原生插件流式；浏览器退回整段返回
    startBtn.disabled = true;
    errBox.hidden = true;
    area.classList.remove("waiting");
    const stream = nativeStreamHttp();
    stopBtn.style.display = stream ? "" : "none";
    let buf = "", lastPaint = 0;
    const paint = (final) => {
      area.innerHTML = md(buf) + (final ? "" : '<span class="cursor">▍</span>');
    };
    area.innerHTML = stream
      ? '<span class="cursor">▍</span>'
      : '<span class="cursor">▍</span> 正在解读（直连 AI，生成完整体显示）…';
    try {
      const { reading } = await api("/api/readings/" + rid);
      let text;
      if (stream) {
        text = await clientInterpretStream(reading, pid, (acc) => {
          buf = acc;
          const now = performance.now();
          if (now - lastPaint > 120) { lastPaint = now; paint(false); }
        });
      } else {
        text = await clientInterpret(reading, pid);
      }
      buf = text;
      paint(true);
      toast("解卦完成，已保存");
      setTimeout(() => renderReading(rid), 500);
    } catch (e) {
      if (buf) paint(true);
      errBox.hidden = false;
      errBox.innerHTML = esc(hintFor(e.message, pid));
      if (!buf) { area.classList.add("waiting"); area.textContent = "解卦未完成"; }
    } finally {
      startBtn.disabled = false;
      stopBtn.style.display = "none";
    }
    return;
  }

  errBox.hidden = true;
  startBtn.disabled = true;
  stopBtn.style.display = "";
  area.classList.remove("waiting");
  area.innerHTML = '<span class="cursor">▍</span>';

  let buf = "", lastPaint = 0;
  const paint = (final) => {
    area.innerHTML = md(buf) + (final ? "" : '<span class="cursor">▍</span>');
  };
  interpCtl = new AbortController();
  try {
    const res = await fetch("/api/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rid, provider: pid }),
      signal: interpCtl.signal,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "HTTP " + res.status);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const now = performance.now();
      if (now - lastPaint > 120) { lastPaint = now; paint(false); }
    }
    paint(true);
    toast("解卦完成，已保存");
    setTimeout(() => renderReading(rid), 500);
  } catch (e) {
    if (e.name === "AbortError") {
      paint(true);
      toast("已停止（已生成部分自动保存）");
      setTimeout(() => renderReading(rid), 400);
    } else {
      if (buf) paint(true);
      errBox.hidden = false;
      errBox.innerHTML = esc(hintFor(e.message, pid));
    }
  } finally {
    interpCtl = null;
    startBtn.disabled = false;
    stopBtn.style.display = "none";
  }
}

function hintFor(msg, pid) {
  let out = "解卦失败：" + msg;
  if (/401|403|api.?key|unauthorized/i.test(msg)) {
    out += "\n提示：请到「设置」检查 API Key 是否正确保存。";
  } else if (/429|1113|余额|资源包|quota|rate.?limit/i.test(msg)) {
    out += "\n提示：账户额度不足或并发超限——请到 open.bigmodel.cn 控制台查看 Coding Plan 状态/余额，或先切换到 LM Studio 本地模型（免费）。";
  } else if (/404|model/i.test(msg)) {
    out += "\n提示：请到「设置」核对模型名称，或点「获取模型列表」选择。";
  } else if (pid === "lmstudio") {
    out += "\n提示：请确认 LM Studio 已启动，并在 Developer → Server 里开启本地服务（默认端口 1234）。";
  }
  return out;
}

function panTextClient(r) {
  const pan = r.pan, z = pan.sizhi;
  const rows = [];
  rows.push("【起卦时间】" + pan.datetime + "（" + z.weekday + "）");
  let sz = "日柱：" + z.day_ganzhi;
  if (z.month_branch) sz += "｜月建：" + z.month_branch + "（" + z.month_term + "后）";
  sz += "｜旬空：" + (z.xunkong || []).join("");
  if (z.yuepo) sz += "｜月破：" + z.yuepo;
  rows.push("【四值】" + sz);
  if (pan.mode === "three") {
    rows.push("【卦式】三爻简化金钱课");
    rows.push("【本卦】" + pan.tri.name + "（" + pan.tri.symbol + "，属" + pan.tri.element + "）");
    if (pan.bian) rows.push("【变卦】" + pan.bian.name + "（属" + pan.bian.element + "）");
  } else {
    const b = pan.ben;
    rows.push("【卦式】标准六爻（京房纳甲）");
    rows.push("【本卦】" + b.name + "（" + b.palace + "宫" + b.gen_label + "，属" + b.palace_element + "）" +
      (pan.bian ? "　【变卦】" + pan.bian.name : "　静卦无变"));
    rows.push("【世应】世：" + POS_SIX[b.shi - 1] + "　应：" + POS_SIX[b.ying - 1]);
    for (let i = 5; i >= 0; i--) {
      const ln = b.lines[i];
      let row = "  " + ln.liushen + " " + ln.label + " " + lineSym(ln.value) + " " +
        ln.ganzhi + ln.element + ln.liuqin;
      if (ln.is_shi) row += " 世";
      if (ln.is_ying) row += " 应";
      if (ln.fu) row += " 伏:" + ln.fu.ganzhi + ln.fu.element + ln.fu.liuqin;
      if (ln.moving && pan.bian) {
        const bl = pan.bian.lines[i];
        row += " ⇒ 变出 " + bl.ganzhi + bl.element + bl.liuqin;
      }
      rows.push(row);
    }
  }
  if (r.question) rows.push("【所问之事】" + r.question);
  const it = (r.interpretations || [])[(r.interpretations || []).length - 1];
  if (it) rows.push("\n【AI 解卦】(" + it.label + " · " + it.model + ")\n" + it.text);
  return rows.join("\n");
}

// ---------------- 历史页 ----------------
async function renderHistory() {
  let list = [];
  try { list = (await api("/api/readings")).readings; } catch (e) { /* ignore */ }
  if (!list.length) {
    app.innerHTML = `<div class="card empty"><div class="big">🪙</div>还没有卦记录<br><br>
      <a class="btn primary" href="#/cast" style="text-decoration:none">去起一卦</a></div>`;
    return;
  }
  app.innerHTML = `<section>
    <div class="card"><h2>卦例历史 <span class="sub">共 ${list.length} 例</span></h2></div>
    ${list.map((r) => `
      <div class="hist-card" data-id="${r.id}">
        <div class="hist-main">
          <div class="hist-q">${esc(r.question || "（未注明所问之事）")}</div>
          <div class="hist-meta">
            <span>${esc(r.created)}</span><span>${esc(r.day_ganzhi)}日</span>
            <span>${r.mode === "six" ? "六爻" : "三爻"}</span>
            <span>${r.moving_count ? r.moving_count + " 个动爻" : "静卦"}</span>
            <span>${r.interpretations ? "已解读 ×" + r.interpretations : "未解读"}</span>
          </div>
        </div>
        <div class="hist-gua">${esc(r.ben)}${r.bian ? " ⇢ " + esc(r.bian) : ""}</div>
        <button class="hist-del" data-del="${r.id}" title="删除">✕</button>
      </div>`).join("")}
  </section>`;
  $$(".hist-card").forEach((c) =>
    c.addEventListener("click", () => { location.hash = "#/reading/" + c.dataset.id; }));
  $$(".hist-del").forEach((b) =>
    b.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!confirm("删除这条卦例？")) return;
      try { await api("/api/readings/" + b.dataset.del, { method: "DELETE" }); } catch (e) { toast(e.message); }
      renderHistory();
    }));
}

// ---------------- 设置页 ----------------
async function renderSettings() {
  const cfg = await loadConfig(true);
  if (!cfg) { app.innerHTML = '<div class="card"><div class="err-box">无法读取配置</div></div>'; return; }

  app.innerHTML = `
  <section>
    <div class="card">
      <h2>摇卦方式</h2>
      <div class="mode-row">
        <span class="chip ${cfg.mode === "six" ? "active" : ""}" id="set-six">六爻 · 摇六次（标准排盘，推荐）</span>
        <span class="chip ${cfg.mode === "three" ? "active" : ""}" id="set-three">三爻 · 摇三次（简化）</span>
      </div>
    </div>
    <div class="card">
      <h2>解读服务 <span class="sub">点标签可切换默认</span></h2>
      ${Object.entries(cfg.providers).map(([pid, p]) => `
        <div class="prov-card ${pid === cfg.provider ? "default" : ""}" data-pid="${pid}">
          <div class="prov-head">
            <span class="name">${esc(p.label)} ${pid === cfg.provider ? '<span class="tag red">默认</span>' : ""}</span>
            <button class="btn small ghost" data-setdefault="${pid}">设为默认</button>
          </div>
          <label class="field">接口地址（Base URL）</label>
          <input type="url" data-f="base" value="${esc(p.base)}" placeholder="http://localhost:1234/v1">
          <div class="grid2">
            <div>
              <label class="field">协议</label>
              <select data-f="protocol">
                <option value="openai" ${p.protocol !== "anthropic" ? "selected" : ""}>OpenAI 兼容（/chat/completions）</option>
                <option value="anthropic" ${p.protocol === "anthropic" ? "selected" : ""}>Anthropic 兼容（/v1/messages）</option>
              </select>
            </div>
            <div>
              <label class="field">API Key</label>
              <input type="password" data-f="api_key" placeholder="${p.has_key ? "已保存（留空则不修改）" : "未设置"}" autocomplete="new-password">
            </div>
          </div>
          <label class="field">模型名</label>
          <input type="text" data-f="model" value="${esc(p.model)}" list="models-${pid}" placeholder="${pid === "lmstudio" ? "留空自动取第一个可用模型" : "如 glm-5.3"}">
          <datalist id="models-${pid}"></datalist>
          <div class="btn-row">
            <button class="btn small ghost" data-fetchmodels="${pid}">获取模型列表</button>
            <button class="btn small ghost" data-test="${pid}">测试连接</button>
          </div>
          <div class="test-line" data-line="${pid}"></div>
        </div>`).join("")}
      <div class="btn-row">
        <button class="btn primary big" id="save-cfg">保存设置</button>
      </div>
    </div>
    <div class="card">
      <h2>说明</h2>
      <div class="hint">
        · 当前运行：<b>${MODE === "server" ? "服务器模式（连本机服务，流式输出）" : "离线模式（App 内排盘，直连 AI）"}</b><br>
        · <b>LM Studio</b>：启动应用后在 Developer → Server 打开本地服务（默认 <code>http://localhost:1234/v1</code>），模型名可留空自动获取。手机连电脑同一 Wi-Fi 时，把地址改成 <code>http://电脑IP:1234/v1</code>。<br>
        · <b>GLM 智谱</b>：到 open.bigmodel.cn 控制台获取 API Key；OpenAI 兼容地址 <code>https://open.bigmodel.cn/api/coding/paas/v4</code>，模型如 <code>glm-5.3</code>；Coding Plan 用户也可把协议切到 Anthropic 兼容（地址 <code>https://open.bigmodel.cn/api/anthropic</code>）。<br>
        · API Key 只保存在本机 <code>data/config.json</code>，请求由本服务转发，不经第三方。<br>
        · 手机使用：<code>python3 app.py --host 0.0.0.0</code> 后，同一 Wi-Fi 下访问本机 IP。
      </div>
    </div>
  </section>`;

  $("#set-six").addEventListener("click", () => saveMode("six"));
  $("#set-three").addEventListener("click", () => saveMode("three"));
  $$("[data-setdefault]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await api("/api/config", { method: "POST", body: { provider: b.dataset.setdefault } });
        toast("已设为默认解读服务");
        renderSettings();
      } catch (e) { toast(e.message); }
    }));

  function provField(pid, f) {
    const card = $(`.prov-card[data-pid="${pid}"]`);
    return card && $(`[data-f="${f}"]`, card);
  }

  $$("[data-fetchmodels]").forEach((b) =>
    b.addEventListener("click", async () => {
      const pid = b.dataset.fetchmodels;
      const line = $(`[data-line="${pid}"]`);
      line.textContent = "获取中…";
      await saveProviderCfg();  // 先保存当前编辑值再拉列表
      try {
        const { models } = await api("/api/models?provider=" + pid);
        const dl = $("#models-" + pid);
        dl.innerHTML = models.map((m) => `<option value="${esc(m)}">`).join("");
        const mi = provField(pid, "model");
        if (models.length && !mi.value.trim()) mi.value = models[0];
        line.textContent = `✓ 发现 ${models.length} 个模型${models.length ? "，已填入候选列表" : ""}`;
        line.className = "test-line ok-box";
      } catch (e) {
        line.textContent = "✗ " + e.message;
        line.className = "test-line";
      }
    }));

  $$("[data-test]").forEach((b) =>
    b.addEventListener("click", async () => {
      const pid = b.dataset.test;
      const line = $(`[data-line="${pid}"]`);
      line.textContent = "测试中…";
      await saveProviderCfg();
      try {
        const { models } = await api("/api/models?provider=" + pid);
        line.textContent = `✓ 连接正常，可用模型 ${models.length} 个`;
        line.className = "test-line ok-box";
      } catch (e) {
        line.textContent = "✗ " + e.message;
        line.className = "test-line";
      }
    }));

  async function saveMode(mode) {
    cfg.mode = mode;
    $("#set-six").classList.toggle("active", mode === "six");
    $("#set-three").classList.toggle("active", mode === "three");
    try { await api("/api/config", { method: "POST", body: { mode } }); } catch (e) { toast(e.message); }
  }

  async function saveProviderCfg() {
    const providers = {};
    $$(".prov-card").forEach((card) => {
      const pid = card.dataset.pid;
      const get = (f) => { const el = $(`[data-f="${f}"]`, card); return el ? el.value.trim() : ""; };
      const p = { base: get("base"), protocol: get("protocol"), model: get("model") };
      const key = get("api_key");
      if (key) p.api_key = key;
      providers[pid] = p;
    });
    const body = { mode: cfg.mode, provider: cfg.provider, providers };
    try { await api("/api/config", { method: "POST", body }); } catch (e) { toast(e.message); throw e; }
  }

  $("#save-cfg").addEventListener("click", async () => {
    const btn = $("#save-cfg");
    btn.disabled = true;
    try { await saveProviderCfg(); toast("设置已保存"); } finally { btn.disabled = false; }
  });
}

// ---------------- 启动 ----------------
// 测试钩子（自动化验证离线模式，不影响正常功能）
if (typeof window !== "undefined") {
  window.__liuyao = {
    get mode() { return MODE; }, set mode(v) { MODE = v; },
    clientApi, clientInterpret
  };
}
resetCast();
detectMode().then(route);
