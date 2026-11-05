#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""六爻金钱卦 · 本地服务（Python 标准库，零依赖）

- 提供网页与 JSON API：摇卦记录、自动装卦排盘、历史保存
- 代理 LLM 解卦（流式）：LM Studio / 智谱 GLM 等 OpenAI/Anthropic 兼容服务
- 数据保存在 data/ 目录（config.json、readings.json）

用法：
    python3 app.py                # http://127.0.0.1:8770
    python3 app.py --host 0.0.0.0 # 局域网内手机也可访问
"""
import argparse
import json
import os
import random
import re
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
import liuyao  # noqa: E402

DATA_DIR = os.environ.get("LIUYAO_DATA_DIR", os.path.join(BASE, "data"))
STATIC_DIR = os.path.join(BASE, "static")
CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
READINGS_PATH = os.path.join(DATA_DIR, "readings.json")
_LOCK = threading.RLock()

MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
        ".png": "image/png", ".ico": "image/x-icon"}

DEFAULT_CONFIG = {
    "mode": "six",  # six=标准六爻(摇六次) | three=简化三爻(摇三次)
    "provider": "lmstudio",
    "providers": {
        "lmstudio": {
            "label": "LM Studio（本地）", "protocol": "openai",
            "base": "http://localhost:1234/v1", "model": "", "api_key": "",
        },
        "glm": {
            "label": "GLM 智谱（Coding Plan）", "protocol": "openai",
            "base": "https://open.bigmodel.cn/api/coding/paas/v4", "model": "glm-5.3", "api_key": "",
        },
    },
}

# ---------------------------------------------------------------- LLM 提示词

SYSTEM_SIX = """你是一位精通《周易》与京房纳甲六爻的资深卦师，用通俗易懂的现代汉语为人解卦。
用户会提供一次摇卦的完整排盘数据（卦名、卦宫、纳甲干支、六亲、世应、六神、动爻、变卦、日柱、月建、旬空、月破等）。这些数据已由程序精确计算，你必须直接采信，禁止重新排盘、更改或质疑任何卦象数据。
解卦要求：
1. 先用两三句话概括卦象总体格局（本卦变卦、卦宫五行、动静多寡）。
2. 依据所问之事选取用神并说明理由（如求财取妻财、婚恋取妻财/官鬼、事业功名取官鬼、考试文书取父母、健康忧患取世爻/官鬼、失物取妻财、出行取世爻/父母等）。
3. 分析用神旺衰：日柱月建的生扶冲克、是否旬空月破、动爻与原神忌神仇神对用神的作用。
4. 分析动爻变化与变卦趋势、世应关系、六神渲染的吉凶色彩。
5. 给出明确的结论（吉凶成败、把握程度）、趋势判断与可行建议；如可推断，给出应期思路（逢值、逢冲、逢合、出旬、出空之日月）。
6. 条理清晰，使用「## 小标题」和要点列表；关键术语用一句话白话解释；不要输出 Markdown 表格。
7. 结尾固定附一句：以上卦象分析仅供参考。
若个别信息（如月建）未提供，说明缺失后基于日柱继续分析，不要编造数据。"""

SYSTEM_THREE = """你是一位熟悉《周易》八卦象意的卦师，用通俗易懂的现代汉语为人解卦。
用户提供的是「三爻简化金钱课」：三枚硬币摇三次得到一个经卦（八纯卦之一），可能带动爻与变卦。数据已由程序计算，直接采信，不要重新推演。
解卦要求：
1. 概述本卦卦象（卦名、五行、基本象意：如乾健、坤顺、震动、巽入、坎陷、离丽、艮止、兑悦）。
2. 结合所问之事，用八卦万物类象（人物、性情、事态走向）展开分析。
3. 若有动爻，说明阴阳变化带来的趋势转折与变卦含义。
4. 参考日柱干支与卦宫五行的生克关系简断旺衰。
5. 给出明确结论与建议，条理清晰，使用「## 小标题」和要点列表；不要输出 Markdown 表格。
6. 结尾固定附一句：以上卦象分析仅供参考。"""


# ---------------------------------------------------------------- 存取工具

def _load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _save_json_atomic(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def load_config():
    cfg = _load_json(CONFIG_PATH, {})
    if not isinstance(cfg, dict):
        cfg = {}
    out = json.loads(json.dumps(DEFAULT_CONFIG))  # deep copy
    out["mode"] = cfg.get("mode", out["mode"])
    out["provider"] = cfg.get("provider", out["provider"])
    for pid, p in (cfg.get("providers") or {}).items():
        if pid in out["providers"] and isinstance(p, dict):
            for k in ("label", "protocol", "base", "model"):
                if isinstance(p.get(k), str):
                    out["providers"][pid][k] = p[k]
            if isinstance(p.get("fast"), bool):
                out["providers"][pid]["fast"] = p["fast"]
            if isinstance(p.get("api_key"), str) and p["api_key"]:
                out["providers"][pid]["api_key"] = p["api_key"]
        elif isinstance(p, dict):  # 用户自定义的 provider
            out["providers"][pid] = {
                "label": p.get("label") or pid, "protocol": p.get("protocol") or "openai",
                "base": p.get("base") or "", "model": p.get("model") or "",
                "api_key": p.get("api_key") or ""}
    if out["provider"] not in out["providers"]:
        out["provider"] = "lmstudio"
    return out


def save_config(cfg):
    with _LOCK:
        _save_json_atomic(CONFIG_PATH, cfg)


def load_readings():
    data = _load_json(READINGS_PATH, [])
    return data if isinstance(data, list) else []


def save_readings(readings):
    _save_json_atomic(READINGS_PATH, readings)


def reading_summary(r):
    pan = r.get("pan") or {}
    if pan.get("mode") == "three":
        ben = (pan.get("tri") or {}).get("name", "?")
    else:
        ben = (pan.get("ben") or {}).get("name", "?")
    bian = (pan.get("bian") or {}).get("name", "")
    return {
        "id": r["id"], "created": r.get("created", ""),
        "question": r.get("question", ""), "mode": pan.get("mode", "six"),
        "ben": ben, "bian": bian,
        "day_ganzhi": (pan.get("sizhi") or {}).get("day_ganzhi", ""),
        "moving_count": len(pan.get("moving") or []),
        "interpretations": len(r.get("interpretations") or []),
    }


# ---------------------------------------------------------------- LLM 上游

def _local_tz_hours():
    try:
        off = datetime.now().astimezone().utcoffset()
        return off.total_seconds() / 3600.0
    except Exception:
        return 8.0


def build_messages(reading):
    pan = reading["pan"]
    q = (reading.get("question") or "").strip()
    system = SYSTEM_THREE if pan.get("mode") == "three" else SYSTEM_SIX
    user = liuyao.pan_text(pan) + "\n\n【所问之事】" + (q or "（未注明，请综合断近期运势并提示补问）")
    return system, user


def _is_local_url(url):
    """本地/回环地址判断（这些地址必须绕过系统代理直连）。"""
    try:
        host = urllib.parse.urlparse(url).hostname or ""
    except ValueError:
        return False
    return host in ("localhost", "127.0.0.1", "::1", "0.0.0.0") or host.endswith(".local")


# 本地直连 opener（无视系统代理，否则 Clash 类代理会对 localhost 返回 502）
_DIRECT_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def smart_urlopen(req, timeout):
    """本地地址直连，远程地址尊重环境/系统代理。"""
    if _is_local_url(req.full_url):
        return _DIRECT_OPENER.open(req, timeout=timeout)
    return urllib.request.urlopen(req, timeout=timeout)


def fetch_models(pcfg, timeout=8):
    base = (pcfg.get("base") or "").rstrip("/")
    if not base:
        return []
    url = base + ("/v1/models" if pcfg.get("protocol") == "anthropic" else "/models")
    headers = {}
    key = pcfg.get("api_key") or ""
    if key:
        headers["Authorization"] = "Bearer " + key
        headers["x-api-key"] = key
    req = urllib.request.Request(url, headers=headers, method="GET")
    with smart_urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    ids = []
    for item in data.get("data", []):
        mid = item.get("id") if isinstance(item, dict) else None
        if mid:
            ids.append(mid)
    return ids


# 自动选模型时排除非对话模型（embedding/OCR/语音等）
_NON_CHAT_MODEL = re.compile(r"embed|rerank|ocr|whisper|speech|tts|stt|audio|clip", re.I)


def resolve_model(pcfg):
    model = (pcfg.get("model") or "").strip()
    if model:
        return model
    try:
        models = fetch_models(pcfg)
    except Exception:
        models = []
    chat = [m for m in models if not _NON_CHAT_MODEL.search(m)]
    pool = chat or models
    return pool[0] if pool else ""


def open_upstream(pcfg, model, system, user):
    base = (pcfg.get("base") or "").rstrip("/")
    key = pcfg.get("api_key") or ""
    if pcfg.get("protocol") == "anthropic":
        url = base + "/v1/messages"
        headers = {"Content-Type": "application/json", "anthropic-version": "2023-06-01"}
        if key:
            headers["x-api-key"] = key
            headers["Authorization"] = "Bearer " + key
        payload = {"model": model, "max_tokens": 4096, "temperature": 0.7,
                   "system": system, "stream": True,
                   "messages": [{"role": "user", "content": user}]}
    else:
        url = base + "/chat/completions"
        headers = {"Content-Type": "application/json"}
        if key:
            headers["Authorization"] = "Bearer " + key
        payload = {"model": model, "temperature": 0.7, "stream": True,
                   "messages": [{"role": "system", "content": system},
                                {"role": "user", "content": user}]}
    # 快速模式：智谱系端点关闭深度思考，显著缩短等待
    if pcfg.get("fast") and re.search(r"(bigmodel|z\.ai)", base):
        payload["thinking"] = {"type": "disabled"}
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                 headers=headers, method="POST")
    return smart_urlopen(req, timeout=600)


def _extract_full_text(obj):
    try:
        if "choices" in obj:
            return obj["choices"][0].get("message", {}).get("content") or ""
        if isinstance(obj.get("content"), list):
            return "".join(b.get("text", "") for b in obj["content"] if isinstance(b, dict))
    except Exception:
        pass
    return ""


def iter_deltas(resp):
    """把上游 SSE/JSON 响应解析成文本增量（兼容 OpenAI 与 Anthropic 两种事件格式）。"""
    ct = (resp.headers.get("content-type") or "").lower()
    if "event-stream" not in ct:
        yield _extract_full_text(json.loads(resp.read().decode("utf-8")))
        return
    for raw in resp:
        line = raw.decode("utf-8", "replace").strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload == "[DONE]":
            break
        try:
            obj = json.loads(payload)
        except ValueError:
            continue
        if not isinstance(obj, dict):
            continue
        choices = obj.get("choices")
        if isinstance(choices, list) and choices:
            delta = choices[0].get("delta") or {}
            text = delta.get("content")
            if text:
                yield text
            continue
        if obj.get("type") == "content_block_delta":
            text = (obj.get("delta") or {}).get("text")
            if text:
                yield text


# ---------------------------------------------------------------- HTTP Handler

class Handler(BaseHTTPRequestHandler):
    server_version = "LiuYao/1.0"

    def log_message(self, fmt, *args):  # 静默常规访问日志
        pass

    # ---------- 基础工具 ----------
    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 1 << 20:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError:
            return {}

    def _send_file(self, path):
        ext = os.path.splitext(path)[1].lower()
        try:
            with open(path, "rb") as f:
                body = f.read()
        except OSError:
            self._send_json({"error": "not found"}, 404)
            return
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _serve_static(self, rel):
        rel = rel.lstrip("/")
        full = os.path.normpath(os.path.join(STATIC_DIR, rel))
        if not full.startswith(STATIC_DIR) or not os.path.isfile(full):
            self._send_json({"error": "not found"}, 404)
            return
        self._send_file(full)

    # ---------- 路由 ----------
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/config":
            cfg = load_config()
            for p in cfg["providers"].values():
                p["has_key"] = bool(p.get("api_key"))
                p["api_key"] = ""
            self._send_json(cfg)
        elif path == "/api/readings":
            with _LOCK:
                items = [reading_summary(r) for r in load_readings()]
            self._send_json({"readings": items})
        elif path.startswith("/api/readings/"):
            rid = path.rsplit("/", 1)[-1]
            with _LOCK:
                r = next((x for x in load_readings() if x.get("id") == rid), None)
            self._send_json({"reading": r} if r else {"error": "记录不存在"}, 200 if r else 404)
        elif path == "/api/models":
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            pid = (qs.get("provider") or [""])[0]
            cfg = load_config()
            pcfg = cfg["providers"].get(pid)
            if not pcfg:
                self._send_json({"error": "未知 provider"}, 400)
                return
            try:
                self._send_json({"models": fetch_models(pcfg)})
            except Exception as e:
                self._send_json({"error": "获取模型列表失败：%s" % e}, 502)
        elif path.startswith("/api/"):
            self._send_json({"error": "not found"}, 404)
        else:  # 静态资源（相对路径或 /static/ 均可，供网页与 APK 复用同一套前端）
            rel = path.lstrip("/")
            if not rel or rel == "index.html":
                self._send_file(os.path.join(STATIC_DIR, "index.html"))
            elif rel == "favicon.ico":
                self.send_response(204)
                self.end_headers()
            else:
                if rel.startswith("static/"):
                    rel = rel[len("static/"):]
                self._serve_static(rel)

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/cast":
            self._handle_cast()
        elif path == "/api/interpret":
            self._handle_interpret()
        elif path == "/api/config":
            self._handle_config()
        else:
            self._send_json({"error": "not found"}, 404)

    def do_DELETE(self):
        path = urllib.parse.urlparse(self.path).path
        m = re.match(r"^/api/readings/([^/]+)$", path)
        if not m:
            self._send_json({"error": "not found"}, 404)
            return
        rid = m.group(1)
        with _LOCK:
            readings = load_readings()
            remain = [r for r in readings if r.get("id") != rid]
            if len(remain) == len(readings):
                self._send_json({"error": "记录不存在"}, 404)
                return
            save_readings(remain)
        self._send_json({"ok": True})

    # ---------- 业务 ----------
    def _handle_config(self):
        body = self._read_json()
        with _LOCK:
            cfg = load_config()
            if body.get("mode") in ("six", "three"):
                cfg["mode"] = body["mode"]
            if body.get("provider") in cfg["providers"]:
                cfg["provider"] = body["provider"]
            for pid, p in (body.get("providers") or {}).items():
                if not isinstance(p, dict) or pid not in cfg["providers"]:
                    continue
                tgt = cfg["providers"][pid]
                for k in ("label", "protocol", "base", "model"):
                    if isinstance(p.get(k), str):
                        tgt[k] = p[k].strip()
                if p.get("protocol") not in ("openai", "anthropic"):
                    tgt["protocol"] = "openai"
                if isinstance(p.get("fast"), bool):
                    tgt["fast"] = p["fast"]
                key = p.get("api_key")
                if isinstance(key, str) and key.strip():
                    tgt["api_key"] = key.strip()
            save_config(cfg)
        self._send_json({"ok": True})

    def _handle_cast(self):
        body = self._read_json()
        throws = body.get("throws")
        mode = body.get("mode") or load_config()["mode"]
        question = (body.get("question") or "").strip()[:200]
        when_str = (body.get("when") or "").strip()
        try:
            when = datetime.strptime(when_str, "%Y-%m-%d %H:%M") if when_str else datetime.now()
        except ValueError:
            self._send_json({"error": "时间格式应为 YYYY-MM-DD HH:MM"}, 400)
            return
        if not isinstance(throws, list) or len(throws) not in (3, 6):
            self._send_json({"error": "throws 应为 3 或 6 次掷币结果"}, 400)
            return
        if (mode == "three") != (len(throws) == 3):
            mode = "three" if len(throws) == 3 else "six"
        try:
            if mode == "three":
                pan = liuyao.build_tri_pan(throws, when=when, tz_hours=_local_tz_hours())
            else:
                pan = liuyao.build_pan(throws, when=when, tz_hours=_local_tz_hours())
        except ValueError as e:
            self._send_json({"error": str(e)}, 400)
            return
        rid = datetime.now().strftime("%Y%m%d%H%M%S") + "-%04d" % random.randint(0, 9999)
        reading = {"id": rid, "created": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                   "question": question, "pan": pan, "interpretations": []}
        with _LOCK:
            readings = load_readings()
            readings.insert(0, reading)
            save_readings(readings)
        self._send_json({"reading": reading})

    def _handle_interpret(self):
        body = self._read_json()
        rid = body.get("id") or ""
        cfg = load_config()
        pid = body.get("provider") or cfg.get("provider")
        pcfg = cfg["providers"].get(pid)
        if not pcfg:
            self._send_json({"error": "未知 provider：%s" % pid}, 400)
            return
        with _LOCK:
            readings = load_readings()
            reading = next((r for r in readings if r.get("id") == rid), None)
        if not reading:
            self._send_json({"error": "记录不存在"}, 404)
            return

        model = resolve_model(pcfg)
        if not model:
            self._send_json({"error": "未配置模型名，且无法从 %s 获取模型列表。请在设置里填写模型。"
                                      % pcfg.get("label", pid)}, 502)
            return
        system, user = build_messages(reading)
        try:
            resp = open_upstream(pcfg, model, system, user)
        except urllib.error.HTTPError as e:
            try:
                detail = e.read().decode("utf-8", "replace")[:400]
            except Exception:
                detail = ""
            self._send_json({"error": "上游返回 HTTP %d：%s" % (e.code, detail)}, 502)
            return
        except Exception as e:
            hint = "（若为本地服务，请确认已启动，如 LM Studio 的 Developer/Server）"
            self._send_json({"error": "无法连接 %s：%s %s" % (pcfg.get("label", pid), e, hint)}, 502)
            return

        # 上游 OK：开始向浏览器流式转发（HTTP/1.0 风格：无 Content-Length，关连接即结束）
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        chunks = []
        try:
            for delta in iter_deltas(resp):
                if not delta:
                    continue
                chunks.append(delta)
                self.wfile.write(delta.encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass  # 浏览器中断，保存已生成部分
        except Exception as e:
            tail = "\n\n[上游流中断：%s]" % e
            chunks.append(tail)
            try:
                self.wfile.write(tail.encode("utf-8"))
            except Exception:
                pass
        finally:
            try:
                resp.close()
            except Exception:
                pass
        with _LOCK:
            readings = load_readings()
            target = next((r for r in readings if r.get("id") == rid), None)
            if target is not None:
                target.setdefault("interpretations", []).append({
                    "provider": pid, "label": pcfg.get("label", pid), "model": model,
                    "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "text": "".join(chunks),
                })
                save_readings(readings)


# ---------------------------------------------------------------- 入口

def main():
    ap = argparse.ArgumentParser(description="六爻金钱卦 本地服务")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8770)
    args = ap.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(CONFIG_PATH):
        save_config(json.loads(json.dumps(DEFAULT_CONFIG)))
    if not os.path.exists(READINGS_PATH):
        save_readings([])

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print("六爻金钱卦 服务已启动")
    print("  本机访问:  http://127.0.0.1:%d" % args.port)
    if args.host not in ("127.0.0.1", "localhost"):
        print("  局域网访问: http://<本机IP>:%d （手机同 Wi-Fi 可用）" % args.port)
    print("  数据目录:  %s" % DATA_DIR)
    print("按 Ctrl+C 停止")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
