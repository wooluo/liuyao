# -*- coding: utf-8 -*-
"""六爻金钱卦 · 排盘核心引擎（纯计算，零第三方依赖）。

约定
----
- 爻值沿用京房记法：6=老阴(动)、7=少阳、8=少阴、9=老阳(动)。
- 掷币计数以「背」为准（现代硬币：花/国徽面为背，面值数字面为字）：
  一背为单（少阳7）、两背为拆（少阴8）、三背为重（老阳9，动）、三字为交（老阴6，动）。
- 一卦六爻自下而上：初爻→上爻。所有 lines 列表 index 0 恒为初爻。
- 三爻简化模式：三掷成一经卦（八纯卦之一），取八卦类象简断。
"""
import math
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------- 基础数据

STEMS = "甲乙丙丁戊己庚辛壬癸"
BRANCHES = "子丑寅卯辰巳午未申酉戌亥"

BRANCH_ELEM = {
    "子": "水", "亥": "水", "寅": "木", "卯": "木",
    "巳": "火", "午": "火", "申": "金", "酉": "金",
    "辰": "土", "戌": "土", "丑": "土", "未": "土",
}
# 五行相生：A 生 SHENG[A]
SHENG = {"金": "水", "水": "木", "木": "火", "火": "土", "土": "金"}
# 五行相克：A 克 KE[A]
KE = {"金": "木", "木": "土", "土": "水", "水": "火", "火": "金"}

CLASH = {"子": "午", "午": "子", "丑": "未", "未": "丑", "寅": "申", "申": "寅",
         "卯": "酉", "酉": "卯", "辰": "戌", "戌": "辰", "巳": "亥", "亥": "巳"}

SIX_GODS = ["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"]
_GOD_START = {"甲": 0, "乙": 0, "丙": 1, "丁": 1, "戊": 2,
              "己": 3, "庚": 4, "辛": 4, "壬": 5, "癸": 5}

# 八经卦：key 为自下而上三位二进制（1=阳）。inner/outer 为该卦用作内卦/外卦时的纳甲干支（自下而上）。
TRIGRAMS = {
    "111": {"name": "乾", "symbol": "☰", "element": "金",
            "inner": [("甲", "子"), ("甲", "寅"), ("甲", "辰")],
            "outer": [("壬", "午"), ("壬", "申"), ("壬", "戌")]},
    "110": {"name": "兑", "symbol": "☱", "element": "金",
            "inner": [("丁", "巳"), ("丁", "卯"), ("丁", "丑")],
            "outer": [("丁", "亥"), ("丁", "酉"), ("丁", "未")]},
    "101": {"name": "离", "symbol": "☲", "element": "火",
            "inner": [("己", "卯"), ("己", "丑"), ("己", "亥")],
            "outer": [("己", "酉"), ("己", "未"), ("己", "巳")]},
    "100": {"name": "震", "symbol": "☳", "element": "木",
            "inner": [("庚", "子"), ("庚", "寅"), ("庚", "辰")],
            "outer": [("庚", "午"), ("庚", "申"), ("庚", "戌")]},
    "011": {"name": "巽", "symbol": "☴", "element": "木",
            "inner": [("辛", "丑"), ("辛", "亥"), ("辛", "酉")],
            "outer": [("辛", "未"), ("辛", "巳"), ("辛", "卯")]},
    "010": {"name": "坎", "symbol": "☵", "element": "水",
            "inner": [("戊", "寅"), ("戊", "辰"), ("戊", "午")],
            "outer": [("戊", "申"), ("戊", "戌"), ("戊", "子")]},
    "001": {"name": "艮", "symbol": "☶", "element": "土",
            "inner": [("丙", "辰"), ("丙", "午"), ("丙", "申")],
            "outer": [("丙", "戌"), ("丙", "子"), ("丙", "寅")]},
    "000": {"name": "坤", "symbol": "☷", "element": "土",
            "inner": [("乙", "未"), ("乙", "巳"), ("乙", "卯")],
            "outer": [("癸", "丑"), ("癸", "亥"), ("癸", "酉")]},
}
PURE_KEYS = ["111", "110", "101", "100", "011", "010", "001", "000"]

# 64 卦名：_HEX_ROWS[上卦][下卦]
_HEX_ROWS = {
    "111": {"111": "乾为天", "110": "天泽履", "101": "天火同人", "100": "天雷无妄",
            "011": "天风姤", "010": "天水讼", "001": "天山遁", "000": "天地否"},
    "110": {"111": "泽天夬", "110": "兑为泽", "101": "泽火革", "100": "泽雷随",
            "011": "泽风大过", "010": "泽水困", "001": "泽山咸", "000": "泽地萃"},
    "101": {"111": "火天大有", "110": "火泽睽", "101": "离为火", "100": "火雷噬嗑",
            "011": "火风鼎", "010": "火水未济", "001": "火山旅", "000": "火地晋"},
    "100": {"111": "雷天大壮", "110": "雷泽归妹", "101": "雷火丰", "100": "震为雷",
            "011": "雷风恒", "010": "雷水解", "001": "雷山小过", "000": "雷地豫"},
    "011": {"111": "风天小畜", "110": "风泽中孚", "101": "风火家人", "100": "风雷益",
            "011": "巽为风", "010": "风水涣", "001": "风山渐", "000": "风地观"},
    "010": {"111": "水天需", "110": "水泽节", "101": "水火既济", "100": "水雷屯",
            "011": "水风井", "010": "坎为水", "001": "水山蹇", "000": "水地比"},
    "001": {"111": "山天大畜", "110": "山泽损", "101": "山火贲", "100": "山雷颐",
            "011": "山风蛊", "010": "山水蒙", "001": "艮为山", "000": "山地剥"},
    "000": {"111": "地天泰", "110": "地泽临", "101": "地火明夷", "100": "地雷复",
            "011": "地风升", "010": "地水师", "001": "地山谦", "000": "坤为地"},
}
HEX_NAMES = {(inner, outer): name
             for outer, row in _HEX_ROWS.items() for inner, name in row.items()}

# 八宫卦序：本宫→一世→二世→三世→四世→五世→游魂→归魂
GEN_LABEL = ["本宫卦", "一世卦", "二世卦", "三世卦", "四世卦", "五世卦", "游魂卦", "归魂卦"]
SHI_POS = [6, 1, 2, 3, 4, 5, 4, 3]  # 各序位世爻所在爻位（1=初爻）
# 由第 g 代演进到 g+1 代的变爻位（1-indexed）；g=6 时内卦还原为本宫
_NEXT_MUTATION = [1, 2, 3, 4, 5, 4, None]

YANG_SYM = "▅▅▅▅▅"
YIN_SYM = "▅▅ ▅▅"


# ---------------------------------------------------------------- 掷币与爻

def _is_back(c):
    if c is True or c == 1:
        return True
    return str(c).strip() in ("背", "b", "B")


def parse_throw(throw):
    """一次掷币 → 爻值。throw: 长度为 3 的列表（'字'/'背' 或 True/False）。"""
    if not isinstance(throw, (list, tuple)) or len(throw) != 3:
        raise ValueError("每次需三枚硬币结果")
    backs = sum(1 for c in throw if _is_back(c))
    return {0: 6, 1: 7, 2: 8, 3: 9}[backs]


def throw_desc(throw):
    backs = sum(1 for c in throw if _is_back(c))
    names = {0: "三字·交（老阴，动）", 1: "一背·单（少阳）",
             2: "两背·拆（少阴）", 3: "三背·重（老阳，动）"}
    return "%d背%d字 · %s" % (backs, 3 - backs, names[backs])


def line_label(pos, value):
    """爻题：初九 / 六二 / ... / 上六。pos: 1-6（自下而上）。"""
    place = {1: "初", 2: "二", 3: "三", 4: "四", 5: "五", 6: "上"}[pos]
    yn = "九" if value in (7, 9) else "六"
    if pos == 1:
        return place + yn
    if pos == 6:
        return place + yn
    return yn + place


def line_symbol(value):
    sym = YANG_SYM if value in (7, 9) else YIN_SYM
    if value == 9:
        return sym + " ○"
    if value == 6:
        return sym + " ✕"
    return sym


# ---------------------------------------------------------------- 卦宫与装卦

def find_palace(bits6):
    """定位卦宫。bits6: 六位二进制串（自下而上）。返回 (宫卦key, 序位g, 世爻位, 应爻位)。"""
    for pure in PURE_KEYS:
        cur = list(pure + pure)
        for g in range(8):
            if "".join(cur) == bits6:
                shi = SHI_POS[g]
                ying = shi + 3 if shi <= 3 else shi - 3
                return pure, g, shi, ying
            if g >= 7:
                break
            mut = _NEXT_MUTATION[g]
            if mut is None:  # 归魂：内卦还原本宫
                cur[0:3] = list(pure)
            else:
                cur[mut - 1] = "1" if cur[mut - 1] == "0" else "0"
    raise ValueError("无法定位卦宫: %s" % bits6)


def hex_name(bits6):
    return HEX_NAMES[(bits6[:3], bits6[3:])]


def liuqin(gong_elem, branch):
    """六亲：以卦宫五行为「我」，爻支五行为彼。"""
    b = BRANCH_ELEM[branch]
    if b == gong_elem:
        return "兄弟"
    if SHENG[gong_elem] == b:
        return "子孙"
    if SHENG[b] == gong_elem:
        return "父母"
    if KE[b] == gong_elem:
        return "官鬼"
    return "妻财"


def najia_lines(bits6, gong_elem):
    """按内外经卦纳甲，返回 6 个 dict（自下而上）。六亲按给定卦宫五行。"""
    tri_in, tri_out = TRIGRAMS[bits6[:3]], TRIGRAMS[bits6[3:]]
    out = []
    for i in range(6):
        table = tri_in["inner"] if i < 3 else tri_out["outer"]
        stem, branch = table[i if i < 3 else i - 3]
        out.append({
            "pos": i + 1,
            "stem": stem, "branch": branch,
            "ganzhi": stem + branch,
            "element": BRANCH_ELEM[branch],
            "liuqin": liuqin(gong_elem, branch),
        })
    return out


def bits_from_lines(lines):
    return "".join("1" if v in (7, 9) else "0" for v in lines)


def fushen(ben_lines, pure_key, gong_elem):
    """查伏神：本卦所缺六亲，取本宫首卦同位之爻伏于其下。"""
    present = {ln["liuqin"] for ln in ben_lines}
    for ln in najia_lines(pure_key + pure_key, gong_elem):
        if ln["liuqin"] not in present:
            ben_lines[ln["pos"] - 1]["fu"] = {
                "ganzhi": ln["ganzhi"], "element": ln["element"], "liuqin": ln["liuqin"]}


# ---------------------------------------------------------------- 干支历法

def jdn(y, m, d):
    a = (14 - m) // 12
    yy, mm = y + 4800 - a, m + 12 * a - 3
    return d + (153 * mm + 2) // 5 + 365 * yy + yy // 4 - yy // 100 + yy // 400 - 32045


# 锚点：2026-11-05 为癸未日（六十甲子序号 19，甲子=0）
_ANCHOR_DATE = (2026, 11, 5)
_ANCHOR_IDX = 19


def day_ganzhi_idx(y, m, d):
    return (_ANCHOR_IDX + jdn(y, m, d) - jdn(*_ANCHOR_DATE)) % 60


def day_ganzhi(dt):
    """返回 (干支串, 六十序号)。dt 为本地时间。"""
    i = day_ganzhi_idx(dt.year, dt.month, dt.day)
    return STEMS[i % 10] + BRANCHES[i % 12], i


def xunkong_from_idx(idx):
    """旬空：即旬内甲日前两支。"""
    s = (idx % 12 - idx % 10) % 12  # 旬首（甲）之地支
    return [BRANCHES[(s + 10) % 12], BRANCHES[(s + 11) % 12]]


# ---------------- 太阳黄经（Meeus 低精度，误差约 ±0.01°，足够定节气日）

def _sun_lon(jd):
    t = (jd - 2451545.0) / 36525.0
    l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t
    m = math.radians(357.52911 + 35999.05029 * t - 0.0001537 * t * t)
    c = ((1.914602 - 0.004817 * t - 0.000014 * t * t) * math.sin(m)
         + (0.019993 - 0.000101 * t) * math.sin(2 * m)
         + 0.000289 * math.sin(3 * m))
    lam = l0 + c
    om = math.radians(125.04 - 1934.136 * t)
    lam -= 0.00569 + 0.00478 * math.sin(om)  # 光行差+章动修正
    return lam % 360.0


def _term_jd(year, month_hint, day_hint, target_deg):
    """求太阳视黄经到达 target_deg 的时刻（JD，UTC）。初值取当年常见节气日正午。"""
    jd = float(jdn(year, month_hint, day_hint))  # 当日 12:00 UTC
    for _ in range(8):
        diff = ((_sun_lon(jd) - target_deg + 180.0) % 360.0) - 180.0
        jd -= diff / 0.98565  # 太阳平均每日东移约 0.9856°
    return jd


# 24 节中的 12「节」（定月建）：(黄经, 节名, 月建支, 常见日期月/日)
_TERMS = [
    (315, "立春", "寅", 2, 4), (345, "惊蛰", "卯", 3, 5), (15, "清明", "辰", 4, 4),
    (45, "立夏", "巳", 5, 5), (75, "芒种", "午", 6, 5), (105, "小暑", "未", 7, 7),
    (135, "立秋", "申", 8, 7), (165, "白露", "酉", 9, 7), (195, "寒露", "戌", 10, 8),
    (225, "立冬", "亥", 11, 7), (255, "大雪", "子", 12, 7), (285, "小寒", "丑", 1, 5),
]


def _term_local_dt(year, term, tz_hours):
    deg, name, branch, mh, dh = term
    jd = _term_jd(year, mh, dh, deg)
    ts = (jd - 2440587.5) * 86400.0
    return datetime.fromtimestamp(ts, tz=timezone(timedelta(hours=tz_hours))).replace(tzinfo=None)


def month_term(dt, tz_hours=8.0):
    """返回 dt 之前（含当日）最近一个「节」：dict(name, branch, datetime)。
    找不到（异常情况）返回 None。"""
    best = None
    for year in (dt.year - 1, dt.year):
        for term in _TERMS:
            tdt = _term_local_dt(year, term, tz_hours)
            if tdt <= dt and (best is None or tdt > best["datetime"]):
                best = {"name": term[1], "branch": term[2], "datetime": tdt}
    return best


# ---------------------------------------------------------------- 排盘

WEEKDAYS = "一二三四五六日"


def _shichen_info(when, tz_hours):
    gz, idx = day_ganzhi(when)
    info = {
        "day_ganzhi": gz,
        "day_stem": gz[0], "day_branch": gz[1],
        "day_branch_element": BRANCH_ELEM[gz[1]],
        "xunkong": xunkong_from_idx(idx),
        "weekday": "星期" + WEEKDAYS[when.weekday()],
    }
    mt = month_term(when, tz_hours)
    if mt:
        info["month_term"] = mt["name"]
        info["month_branch"] = mt["branch"]
        info["month_branch_element"] = BRANCH_ELEM[mt["branch"]]
        info["yuepo"] = CLASH[mt["branch"]]
    return info


def _attach_basics(lines, pan):
    for i, v in enumerate(lines):
        ln = pan[i]
        ln["value"] = v
        ln["moving"] = v in (6, 9)
        ln["yang"] = v in (7, 9)


def build_pan(throws, when=None, tz_hours=8.0):
    """六爻标准排盘。throws: 六次掷币结果（自初爻到上爻）。"""
    if len(throws) != 6:
        raise ValueError("标准六爻需摇六次（得到六爻）")
    when = when or datetime.now()
    lines = [parse_throw(t) for t in throws]
    bits = bits_from_lines(lines)

    pure, g, shi, ying = find_palace(bits)
    gong = TRIGRAMS[pure]
    ben_lines = najia_lines(bits, gong["element"])

    day_gz, _ = day_ganzhi(when)
    gods = [SIX_GODS[(_GOD_START[day_gz[0]] + i) % 6] for i in range(6)]

    moving = []
    for i, v in enumerate(lines):
        ln = ben_lines[i]
        ln["value"] = v
        ln["moving"] = v in (6, 9)
        ln["yang"] = v in (7, 9)
        ln["label"] = line_label(i + 1, v)
        ln["liushen"] = gods[i]
        ln["is_shi"] = (i + 1) == shi
        ln["is_ying"] = (i + 1) == ying
        ln["fu"] = None
        if ln["moving"]:
            moving.append(i + 1)
    fushen(ben_lines, pure, gong["element"])

    ben = {
        "bits": bits,
        "name": hex_name(bits),
        "inner": TRIGRAMS[bits[:3]]["name"],
        "outer": TRIGRAMS[bits[3:]]["name"],
        "inner_symbol": TRIGRAMS[bits[:3]]["symbol"],
        "outer_symbol": TRIGRAMS[bits[3:]]["symbol"],
        "palace": gong["name"],
        "palace_element": gong["element"],
        "gen_label": GEN_LABEL[g],
        "shi": shi, "ying": ying,
        "lines": ben_lines,
    }

    bian = None
    if moving:
        bbits = "".join("1" if (bits[i] == "1") != (i + 1 in moving) else "0"
                        for i in range(6))
        bian_lines = najia_lines(bbits, gong["element"])  # 变卦六亲按本卦宫
        for i, ln in enumerate(bian_lines):
            ln["moving"] = (i + 1) in moving
            ln["yang"] = bbits[i] == "1"
            ln["label"] = line_label(i + 1, 7 if ln["yang"] else 8)
        bpure, bg, bshi, bying = find_palace(bbits)
        bian = {
            "bits": bbits,
            "name": hex_name(bbits),
            "palace": TRIGRAMS[bpure]["name"],
            "palace_element": TRIGRAMS[bpure]["element"],
            "gen_label": GEN_LABEL[bg],
            "lines": bian_lines,
        }

    return {
        "mode": "six",
        "datetime": when.strftime("%Y-%m-%d %H:%M"),
        "throws": [list(t) for t in throws],
        "lines": lines,
        "moving": moving,
        "ben": ben,
        "bian": bian,
        "sizhi": _shichen_info(when, tz_hours),
    }


def build_tri_pan(throws, when=None, tz_hours=8.0):
    """三爻简化模式：三掷成一经卦。"""
    if len(throws) != 3:
        raise ValueError("简化模式需摇三次（得到三爻）")
    when = when or datetime.now()
    lines = [parse_throw(t) for t in throws]
    bits = bits_from_lines(lines)
    tri = TRIGRAMS[bits]
    moving = [i + 1 for i, v in enumerate(lines) if v in (6, 9)]

    tri_lines = []
    for i, v in enumerate(lines):
        tri_lines.append({
            "pos": i + 1, "value": v,
            "moving": v in (6, 9), "yang": v in (7, 9),
            "label": line_label(i + 1, v),
        })

    bian = None
    if moving:
        bbits = "".join("1" if (bits[i] == "1") != (i + 1 in moving) else "0"
                        for i in range(3))
        btri = TRIGRAMS[bbits]
        bian = {"bits": bbits, "name": btri["name"], "symbol": btri["symbol"],
                "element": btri["element"],
                "lines": [{"pos": i + 1, "yang": bbits[i] == "1",
                           "moving": (i + 1) in moving} for i in range(3)]}

    return {
        "mode": "three",
        "datetime": when.strftime("%Y-%m-%d %H:%M"),
        "throws": [list(t) for t in throws],
        "lines": lines,
        "moving": moving,
        "tri": {"bits": bits, "name": tri["name"], "symbol": tri["symbol"],
                "element": tri["element"], "lines": tri_lines},
        "bian": bian,
        "sizhi": _shichen_info(when, tz_hours),
    }


# ---------------------------------------------------------------- 排盘文本（供 LLM / 复制）

def _line_text(ln, width=False):
    parts = [ln["liushen"], ln["label"], line_symbol(ln["value"])]
    parts.append("%s%s%s" % (ln["ganzhi"], ln["element"], ln["liuqin"]))
    marks = []
    if ln.get("is_shi"):
        marks.append("世")
    if ln.get("is_ying"):
        marks.append("应")
    if ln.get("moving"):
        marks.append("→动")
    if marks:
        parts.append("·".join(marks))
    if ln.get("fu"):
        f = ln["fu"]
        parts.append("伏:%s%s%s" % (f["ganzhi"], f["element"], f["liuqin"]))
    return "  ".join(str(p) for p in parts)


def pan_text(pan):
    """把排盘 dict 渲染为文本（喂给 LLM、复制导出）。"""
    z = pan["sizhi"]
    out = []
    out.append("【起卦时间】%s（%s）" % (pan["datetime"], z["weekday"]))
    sz = "日柱：%s" % z["day_ganzhi"]
    if "month_branch" in z:
        sz += "｜月建：%s（%s后）" % (z["month_branch"], z["month_term"])
    sz += "｜旬空：%s" % "".join(z["xunkong"])
    if "yuepo" in z:
        sz += "｜月破：%s" % z["yuepo"]
    out.append("【四值】" + sz)

    if pan["mode"] == "three":
        t = pan["tri"]
        out.append("【卦式】三爻简化金钱课（经卦）")
        out.append("【本卦】%s（%s，属%s）" % (t["name"], t["symbol"], t["element"]))
        for i in (2, 1, 0):
            ln = t["lines"][i]
            out.append("  %s  %s" % (ln["label"], line_symbol(ln["value"])))
        if pan["bian"]:
            out.append("【变卦】%s（属%s）" % (pan["bian"]["name"], pan["bian"]["element"]))
        if pan["moving"]:
            out.append("【动爻】第%s爻" % "、".join(str(m) for m in pan["moving"]))
        return "\n".join(out)

    ben = pan["ben"]
    out.append("【卦式】标准六爻（京房纳甲装卦）")
    if pan["bian"]:
        out.append("【本卦】%s（%s宫%s，属%s）　【变卦】%s（%s宫%s）"
                   % (ben["name"], ben["palace"], ben["gen_label"], ben["palace_element"],
                      pan["bian"]["name"], pan["bian"]["palace"], pan["bian"]["gen_label"]))
    else:
        out.append("【本卦】%s（%s宫%s，属%s）　静卦无变"
                   % (ben["name"], ben["palace"], ben["gen_label"], ben["palace_element"]))
    out.append("【世应】世爻：%s爻　应爻：%s爻" % (_cn_num(ben["shi"]), _cn_num(ben["ying"])))
    if pan["moving"]:
        out.append("【动爻】%s" % "、".join(ben["lines"][m - 1]["label"] for m in pan["moving"]))
    out.append("【排盘】（自上而下：上爻→初爻）")
    for i in (5, 4, 3, 2, 1, 0):
        ln = ben["lines"][i]
        row = _line_text(ln)
        bl = pan["bian"]["lines"][i] if pan["bian"] else None
        if bl is not None and ln["moving"]:
            row += "  ⇒ 变出 %s%s%s" % (bl["ganzhi"], bl["element"], bl["liuqin"])
        out.append("  " + row)
    return "\n".join(out)


_CN_NUMS = {1: "初", 2: "二", 3: "三", 4: "四", 5: "五", 6: "上"}


def _cn_num(pos):
    return _CN_NUMS[pos]
