# -*- coding: utf-8 -*-
"""API 集成测试：静态页 / 起卦 / 模型列表 / LLM 流式代理 / 历史删除。

内置一个 stub LLM（OpenAI 兼容 SSE），验证：
- /api/cast 自动装卦（水泽节 → 变泽水困）
- /api/interpret 流式转发并把解读存档
- /api/models、/api/readings、静态资源
"""
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ["LIUYAO_DATA_DIR"] = tempfile.mkdtemp(prefix="liuyao-test-")
sys.path.insert(0, BASE_DIR)

import app as appmod  # noqa: E402


class StubLLM(BaseHTTPRequestHandler):
    last_request = None

    def log_message(self, *a):
        pass

    def do_POST(self):  # chat/completions (SSE)
        length = int(self.headers.get("Content-Length") or 0)
        StubLLM.last_request = json.loads(self.rfile.read(length))
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        for piece in ["## 卦象总览\n", "测试", "解卦", "文本。"]:
            chunk = {"choices": [{"delta": {"content": piece}}]}
            self.wfile.write(("data: " + json.dumps(chunk, ensure_ascii=False) + "\n\n").encode())
        self.wfile.write(b"data: [DONE]\n\n")

    def do_GET(self):  # /models
        body = json.dumps({"data": [{"id": "stub-model"}, {"id": "stub-mini"}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class TestAPI(unittest.TestCase):
    rid = None

    @classmethod
    def setUpClass(cls):
        cls.stub = ThreadingHTTPServer(("127.0.0.1", 0), StubLLM)
        threading.Thread(target=cls.stub.serve_forever, daemon=True).start()
        stub_port = cls.stub.server_address[1]

        cfg = json.loads(json.dumps(appmod.DEFAULT_CONFIG))
        cfg["provider"] = "lmstudio"
        cfg["providers"]["lmstudio"]["base"] = "http://127.0.0.1:%d/v1" % stub_port
        cfg["providers"]["lmstudio"]["model"] = ""  # 留空 → 从 /models 自动取第一个
        appmod.save_config(cfg)

        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), appmod.Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.srv.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.stub.shutdown()

    def request(self, method, path, body=None):
        req = urllib.request.Request(self.base + path, method=method)
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, data=data, timeout=15) as resp:
            return resp.read().decode()

    def test_01_static(self):
        html = self.request("GET", "/")
        self.assertIn("六爻金钱卦", html)
        js = self.request("GET", "/static/app.js")
        self.assertIn("startInterp", js)

    def test_02_cast(self):
        # [9,7,8,6,7,8] → 水泽节（坎宫一世），初爻、四爻动 → 变泽水困
        throws = [["背", "背", "背"], ["背", "字", "字"], ["背", "背", "字"],
                  ["字", "字", "字"], ["背", "字", "字"], ["背", "背", "字"]]
        out = json.loads(self.request("POST", "/api/cast",
                                      {"question": "测试求财", "throws": throws}))
        r = out["reading"]
        TestAPI.rid = r["id"]
        pan = r["pan"]
        self.assertEqual(pan["ben"]["name"], "水泽节")
        self.assertEqual(pan["ben"]["palace"], "坎")
        self.assertEqual(pan["ben"]["gen_label"], "一世卦")
        self.assertEqual((pan["ben"]["shi"], pan["ben"]["ying"]), (1, 4))
        self.assertEqual(pan["moving"], [1, 4])
        self.assertEqual(pan["bian"]["name"], "泽水困")

    def test_03_models(self):
        out = json.loads(self.request("GET", "/api/models?provider=lmstudio"))
        self.assertEqual(out["models"][0], "stub-model")

    def test_04_interpret_stream_and_save(self):
        raw = self.request("POST", "/api/interpret",
                           {"id": TestAPI.rid, "provider": "lmstudio"})
        self.assertEqual(raw, "## 卦象总览\n测试解卦文本。")
        body = StubLLM.last_request
        self.assertEqual(body["model"], "stub-model")
        joined = "".join(m["content"] for m in body["messages"])
        self.assertIn("纳甲", joined)
        self.assertIn("水泽节", joined)
        self.assertIn("测试求财", joined)
        out = json.loads(self.request("GET", "/api/readings/" + TestAPI.rid))
        its = out["reading"]["interpretations"]
        self.assertEqual(len(its), 1)
        self.assertEqual(its[0]["text"], raw)
        self.assertEqual(its[0]["model"], "stub-model")

    def test_05_history_delete(self):
        out = json.loads(self.request("GET", "/api/readings"))
        self.assertEqual(len(out["readings"]), 1)
        rid = out["readings"][0]["id"]
        self.request("DELETE", "/api/readings/" + rid)
        out2 = json.loads(self.request("GET", "/api/readings"))
        self.assertEqual(len(out2["readings"]), 0)

    def test_06_bad_cast_400(self):
        try:
            self.request("POST", "/api/cast", {"throws": [["背"]] * 6})
            self.fail("应当返回 400")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)


if __name__ == "__main__":
    unittest.main(verbosity=2)
