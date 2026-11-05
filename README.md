# 六爻金钱卦

本地网页版六爻摇卦 + AI 解卦工具。三枚硬币摇卦，App 里点选正反面，自动完成京房纳甲装卦，再交给 LM Studio（本地）或智谱 GLM-5.3（云端）流式解卦，卦例自动存档。

**零第三方依赖**，只需 Python 3.9+（标准库实现）。

## 快速开始

```bash
cd ~/DEV/liuyao
python3 app.py
# 打开 http://127.0.0.1:8770
```

手机（同 Wi-Fi）使用：

```bash
python3 app.py --host 0.0.0.0
# 手机浏览器访问 http://<Mac的IP>:8770
```

## 用法

1. **起卦**：心里想着要问的事 → 掷三枚硬币 → 在页面点出每枚的「字 / 背」→ 记下这一爻 → 自下而上共摇六次（简化模式为三次，可在设置切换）→ 成卦排盘。
2. **排盘**：自动计算本卦/变卦、卦宫、纳甲干支、六亲、世应、六神、伏神、动爻，以及日柱、月建（节气精确计算）、旬空、月破。
3. **AI 解卦**：点上方标签选择解读服务（LM Studio / GLM），点「开始解卦」流式输出，自动保存；可反复用不同模型解同一卦。
4. **历史**：所有卦例存在本地 `data/readings.json`，可回看、复制、删除。

### 硬币正反的约定

| 结果 | 爻 |
|---|---|
| 一背两字（单） | 少阳 ▅▅▅▅▅ |
| 两背一字（拆） | 少阴 ▅▅ ▅▅ |
| 三背（重） | 老阳 · 动爻 ○ |
| 三字（交） | 老阴 · 动爻 ✕ |

现代硬币：**花/国徽面 = 背，面值数字面 = 字**（对应古钱有字面为字、满文面为背）。

## 配置 AI 服务（设置页）

**GLM 智谱（Coding Plan）**（正式版唯一内置服务；其他 OpenAI/Anthropic 兼容端点可经配置文件扩展）：

- Base URL `https://open.bigmodel.cn/api/coding/paas/v4`，模型 `glm-5.3`，建议开启「快速模式」（关闭深度思考）
- API Key 须用**开通了 Coding Plan 的账号**创建「Coding Plan 类型」密钥；个人类型 Key 会报 `429 1113 余额不足`
- 提示 429 时先确认：账号 → Coding Plan 订阅 → API 密钥三者是同一账号下的
- API Key 只保存在本机（服务模式在 `data/config.json`，App 模式在本机 localStorage），请求直连对应服务，不经第三方

## 安卓 App（正式版 v1.0.0）

同一套前端（`static/`）通过 [Capacitor](https://capacitorjs.com) 打包为安卓 App：**App 内置 JS 排盘引擎（离线装卦）、直连 AI、卦例存本机**，无需运行 Python 服务。含自研原生 SSE 插件（解卦流式逐字输出）。

```bash
cd mobile && ./build.sh
# 产物：六爻金钱卦.apk（正式签名版）、六爻金钱卦-debug.apk（调试版）
```

- 正式版签名密钥在 `mobile/liuyao-release.jks` + `mobile/keystore.properties`（均不入库，**务必备份**，丢失后无法对已装用户发布升级）。
- 权限仅 INTERNET 一项；`allowBackup=false`；适配摄像头挖孔（edge-to-edge 边距 + 状态栏深色图标）。

## 项目结构

```
liuyao/
├── app.py            # 本地服务：静态页 + API + LLM 流式代理 + 存档（Python 标准库）
├── liuyao.py         # 排盘引擎：装卦/纳甲/六亲/世应/六神/伏神/干支/节气（纯计算）
├── static/           # 前端（原生 HTML/JS/CSS，无框架；engine.js 为 liuyao.py 的 JS 移植）
│   └── engine.js     #   同一套前端：连服务→流式；无服务/安卓→离线排盘+直连 AI
├── mobile/           # Capacitor 安卓工程（www 为 static 的同步副本）
├── tests/            # unittest（Python 引擎+API）+ node（JS 引擎一致性 + 离线模式）
│   ├── test_liuyao.py      # 64卦/卦宫/纳甲经典向量/日干支/节气校验
│   ├── test_api.py         # stub LLM 全链路 + 代理直连回归
│   ├── gen_vectors.py      # 生成 Python↔JS 一致性向量（vectors.json）
│   ├── test_engine.js      # JS 引擎 194 组向量逐字段一致
│   └── test_app_client.js  # 离线模式：排盘/历史/配置/直连真模型解卦
├── tools/            # JDK17 + Android SDK（不入库）
└── data/             # config.json（含API Key）、readings.json（卦例）
```

## 测试

```bash
cd ~/DEV/liuyao
python3 -m unittest discover -s tests -v   # 28 项（引擎 + API + 代理回归）
python3 tests/gen_vectors.py && node tests/test_engine.js   # JS 引擎 194 组向量一致性
node tests/test_app_client.js              # 离线模式（可直连本机 LM Studio 实测）
```

排盘引擎用经典向量校验（乾为天、天风姤、水雷屯、山地剥等纳甲六亲世应；2026-11-05 癸未日；2026 立春/立冬精确时刻），节气采用天文算法（太阳视黄经，Meeus），比查表法更稳。

## 声明

卦象与 AI 解读均为传统文化娱乐参考，不构成任何现实决策依据。
