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

| 服务 | Base URL | 模型 | 认证 |
|---|---|---|---|
| LM Studio 本地 | `http://localhost:1234/v1` | 留空自动获取 | 无需 |
| GLM 智谱云端 | `https://open.bigmodel.cn/api/paas/v4` | `glm-5.3` | API Key（[open.bigmodel.cn](https://open.bigmodel.cn) 控制台） |

- 两者均为 OpenAI 兼容协议；协议也可切到 Anthropic 兼容（GLM Coding Plan：`https://open.bigmodel.cn/api/anthropic`）。
- LM Studio：启动应用 → Developer → Server → 开启（默认端口 1234），并加载一个模型。
- API Key 只保存在本机 `data/config.json`，解卦请求由本服务转发，浏览器不直接外连。

## 项目结构

```
liuyao/
├── app.py            # 本地服务：静态页 + API + LLM 流式代理 + 存档
├── liuyao.py         # 排盘引擎：装卦/纳甲/六亲/世应/六神/伏神/干支/节气（纯计算）
├── static/           # 前端（原生 HTML/JS/CSS，无框架）
├── tests/            # 单元 + 集成测试（unittest）
│   ├── test_liuyao.py   # 64卦名/卦宫/纳甲/经典排盘向量/日干支/节气校验
│   └── test_api.py      # stub LLM 全链路（起卦→流式解卦→存档→历史）
└── data/             # config.json（含API Key）、readings.json（卦例）
```

## 测试

```bash
cd ~/DEV/liuyao
python3 -m unittest discover -s tests -v   # 26 项
```

排盘引擎用经典向量校验（乾为天、天风姤、水雷屯、山地剥等纳甲六亲世应；2026-11-05 癸未日；2026 立春/立冬精确时刻），节气采用天文算法（太阳视黄经，Meeus），比查表法更稳。

## 声明

卦象与 AI 解读均为传统文化娱乐参考，不构成任何现实决策依据。
