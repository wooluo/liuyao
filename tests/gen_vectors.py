# -*- coding: utf-8 -*-
"""生成 Python↔JS 引擎一致性校验向量：tests/vectors.json

覆盖：全部 64 卦 + 随机动爻组合 + 多年份/多时区的历法边界 + 三爻模式 + pan_text。
运行：python3 tests/gen_vectors.py （由 node tests/test_engine.js 消费）
"""
import json
import os
import random
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import liuyao  # noqa: E402

random.seed(20261105)

VAL2THROW = {6: ["字", "字", "字"], 7: ["背", "字", "字"], 8: ["背", "背", "字"], 9: ["背", "背", "背"]}


def throws_for(values):
    return [VAL2THROW[v][:] for v in values]


def rand_dt(lo=2024, hi=2029):
    return datetime(random.randint(lo, hi), random.randint(1, 12), random.randint(1, 28),
                    random.randint(0, 23), random.choice([0, 13, 30, 45]))


cases = []

# 1) 全部 64 卦（每卦一种固定爻值组合，含动爻）
for n in range(64):
    bits = format(n, "06b")
    values = []
    for b in bits:
        values.append(random.choice([7, 9]) if b == "1" else random.choice([6, 8]))
    dt = rand_dt()
    tz = random.choice([8.0, -5.0, 9.5, 0.0])
    pan = liuyao.build_pan(throws_for(values), when=dt, tz_hours=tz)
    cases.append({"mode": "six", "values": values, "dt": [dt.year, dt.month, dt.day, dt.hour, dt.minute],
                  "tz": tz, "pan": pan, "text": liuyao.pan_text(pan)})

# 2) 80 组随机六爻
for _ in range(80):
    values = [random.choice([6, 7, 8, 9]) for _ in range(6)]
    dt = rand_dt(2015, 2035)
    tz = random.choice([8.0, 8.0, -5.0, 5.5, -3.0])
    pan = liuyao.build_pan(throws_for(values), when=dt, tz_hours=tz)
    cases.append({"mode": "six", "values": values, "dt": [dt.year, dt.month, dt.day, dt.hour, dt.minute],
                  "tz": tz, "pan": pan, "text": liuyao.pan_text(pan)})

# 3) 40 组随机三爻
for _ in range(40):
    values = [random.choice([6, 7, 8, 9]) for _ in range(3)]
    dt = rand_dt(2015, 2035)
    tz = random.choice([8.0, -5.0])
    pan = liuyao.build_tri_pan(throws_for(values), when=dt, tz_hours=tz)
    cases.append({"mode": "three", "values": values, "dt": [dt.year, dt.month, dt.day, dt.hour, dt.minute],
                  "tz": tz, "pan": pan, "text": liuyao.pan_text(pan)})

# 4) 历法边界：节气前后一天（2026 立冬 11-07、立春 02-04）
for (y, m, d) in [(2026, 11, 6), (2026, 11, 7), (2026, 11, 8),
                  (2026, 2, 3), (2026, 2, 4), (2026, 2, 5),
                  (2027, 1, 4), (2027, 1, 6), (2024, 12, 6), (2030, 6, 20)]:
    values = [random.choice([6, 7, 8, 9]) for _ in range(6)]
    dt = datetime(y, m, d, 12, 0)
    pan = liuyao.build_pan(throws_for(values), when=dt, tz_hours=8.0)
    cases.append({"mode": "six", "values": values, "dt": [y, m, d, 12, 0],
                  "tz": 8.0, "pan": pan, "text": liuyao.pan_text(pan)})

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vectors.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(cases, f, ensure_ascii=False, sort_keys=False)
print("生成 %d 组向量 → %s" % (len(cases), out_path))
