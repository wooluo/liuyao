# -*- coding: utf-8 -*-
"""六爻排盘引擎单元测试（unittest，零依赖）。

校验向量来源：
- 纳甲/六亲/世应：经典六爻排盘（乾为天、天风姤、水雷屯、山地剥等）。
- 日干支锚点：2026-11-05 为癸未日（便民查询网万年历）。
- 节气时刻：2026 立春 = 02-04 04:02、2026 立冬 = 11-07 17:51（北京时间）。
"""
import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import liuyao as L


class TestThrow(unittest.TestCase):
    def test_counts(self):
        self.assertEqual(L.parse_throw(["背", "背", "背"]), 9)   # 三背 重 老阳
        self.assertEqual(L.parse_throw(["字", "字", "字"]), 6)   # 三字 交 老阴
        self.assertEqual(L.parse_throw(["背", "字", "字"]), 7)   # 一背 单 少阳
        self.assertEqual(L.parse_throw(["背", "背", "字"]), 8)   # 两背 拆 少阴
        self.assertEqual(L.parse_throw([True, False, False]), 7)

    def test_invalid(self):
        with self.assertRaises(ValueError):
            L.parse_throw(["背", "字"])


class TestNamesAndPalace(unittest.TestCase):
    def test_names(self):
        cases = {
            "111111": "乾为天", "011111": "天风姤", "100010": "水雷屯",
            "000001": "山地剥", "000101": "火地晋", "111101": "火天大有",
            "101010": "水火既济", "111000": "地天泰", "000111": "天地否",
            "010010": "坎为水", "000000": "坤为地", "110110": "兑为泽",
        }
        for bits, name in cases.items():
            self.assertEqual(L.hex_name(bits), name, bits)

    def test_palace_positions(self):
        cases = {
            "111111": ("乾", 0, 6, 3),   # 乾为天 本宫 世上 应三
            "011111": ("乾", 1, 1, 4),   # 天风姤 一世 世初 应四
            "100010": ("坎", 2, 2, 5),   # 水雷屯 二世 世二 应五
            "101010": ("坎", 3, 3, 6),   # 水火既济 三世
            "101110": ("坎", 4, 4, 1),   # 泽火革 四世
            "101100": ("坎", 5, 5, 2),   # 雷火丰 五世
            "000101": ("乾", 6, 4, 1),   # 火地晋 游魂 世四
            "111101": ("乾", 7, 3, 6),   # 火天大有 归魂 世三
            "000001": ("乾", 5, 5, 2),   # 山地剥 五世
        }
        for bits, (palace, g, shi, ying) in cases.items():
            p, gg, s, y = L.find_palace(bits)
            self.assertEqual((L.TRIGRAMS[p]["name"], gg, s, y), (palace, g, shi, ying), bits)

    def test_all_64_unique_palace(self):
        counts = {}
        for n in range(64):
            bits = format(n, "06b")
            p, _, _, _ = L.find_palace(bits)
            counts[p] = counts.get(p, 0) + 1
        self.assertEqual(sum(counts.values()), 64)
        self.assertTrue(all(c == 8 for c in counts.values()), counts)


class TestNajia(unittest.TestCase):
    WHEN = datetime(2026, 11, 5, 12, 0)  # 癸未日（玄武起初爻）

    def pan_qian(self):
        # 六次三背 → 乾为天，六爻皆动，变坤为地
        throws = [["背", "背", "背"]] * 6
        return L.build_pan(throws, when=self.WHEN)

    def test_qian(self):
        pan = self.pan_qian()
        ben = pan["ben"]
        self.assertEqual(ben["name"], "乾为天")
        self.assertEqual((ben["palace"], ben["palace_element"]), ("乾", "金"))
        self.assertEqual((ben["shi"], ben["ying"]), (6, 3))
        expect = [
            ("甲子", "水", "子孙"), ("甲寅", "木", "妻财"), ("甲辰", "土", "父母"),
            ("壬午", "火", "官鬼"), ("壬申", "金", "兄弟"), ("壬戌", "土", "父母"),
        ]
        for i, (gz, elem, lq) in enumerate(expect):
            ln = ben["lines"][i]
            self.assertEqual((ln["ganzhi"], ln["element"], ln["liuqin"]),
                             (gz, elem, lq), "pos %d" % (i + 1))
        self.assertEqual(pan["bian"]["name"], "坤为地")
        self.assertEqual(pan["moving"], [1, 2, 3, 4, 5, 6])

    def test_gou(self):
        # 初爻老阴、余少阳 → 天风姤，变乾为天
        throws = [["字", "字", "字"]] + [["背", "字", "字"]] * 5
        pan = L.build_pan(throws, when=self.WHEN)
        ben = pan["ben"]
        self.assertEqual(ben["name"], "天风姤")
        self.assertEqual(ben["gen_label"], "一世卦")
        first = ben["lines"][0]
        self.assertEqual((first["ganzhi"], first["liuqin"]), ("辛丑", "父母"))
        self.assertTrue(first["is_shi"])
        self.assertTrue(ben["lines"][3]["is_ying"])
        # 姤缺妻财，伏神取乾卦二甲寅木
        fu = ben["lines"][1]["fu"]
        self.assertEqual((fu["ganzhi"], fu["liuqin"]), ("甲寅", "妻财"))
        self.assertEqual(pan["bian"]["name"], "乾为天")

    def test_zhun(self):
        # 水雷屯：初爻、五爻少阳，余少阴（静卦）
        one, two = ["背", "字", "字"], ["背", "背", "字"]
        throws = [one, two, two, two, one, two]
        pan = L.build_pan(throws, when=self.WHEN)
        ben = pan["ben"]
        self.assertEqual(ben["name"], "水雷屯")
        self.assertEqual((ben["palace"], ben["gen_label"]), ("坎", "二世卦"))
        self.assertEqual((ben["shi"], ben["ying"]), (2, 5))
        expect = [
            ("庚子", "水", "兄弟"), ("庚寅", "木", "子孙"), ("庚辰", "土", "官鬼"),
            ("戊申", "金", "父母"), ("戊戌", "土", "官鬼"), ("戊子", "水", "兄弟"),
        ]
        for i, (gz, elem, lq) in enumerate(expect):
            ln = ben["lines"][i]
            self.assertEqual((ln["ganzhi"], ln["element"], ln["liuqin"]), (gz, elem, lq))
        self.assertIsNone(pan["bian"])
        self.assertEqual(pan["moving"], [])

    def test_bo_fushen(self):
        # 山地剥：缺兄弟，伏神乾卦五爻壬申金
        two = ["背", "背", "字"]
        throws = [two] * 5 + [["背", "字", "字"]]
        pan = L.build_pan(throws, when=self.WHEN)
        self.assertEqual(pan["ben"]["name"], "山地剥")
        fu = pan["ben"]["lines"][4]["fu"]
        self.assertEqual((fu["ganzhi"], fu["liuqin"]), ("壬申", "兄弟"))

    def test_liushen(self):
        # 癸未日起玄武
        pan = self.pan_qian()
        gods = [ln["liushen"] for ln in pan["ben"]["lines"]]
        self.assertEqual(gods, ["玄武", "青龙", "朱雀", "勾陈", "螣蛇", "白虎"])

    def test_line_labels(self):
        pan = self.pan_qian()
        labels = [ln["label"] for ln in pan["ben"]["lines"]]
        self.assertEqual(labels, ["初九", "九二", "九三", "九四", "九五", "上九"])


class TestCalendar(unittest.TestCase):
    def test_jdn(self):
        self.assertEqual(L.jdn(2000, 1, 1), 2451545)

    def test_day_ganzhi_anchor(self):
        gz, idx = L.day_ganzhi(datetime(2026, 11, 5, 9, 0))
        self.assertEqual((gz, idx), ("癸未", 19))
        # 顺推两日
        gz2, _ = L.day_ganzhi(datetime(2026, 11, 7, 9, 0))
        self.assertEqual(gz2, "乙酉")
        # 甲子日轮回
        gz3, idx3 = L.day_ganzhi(datetime(2026, 12, 16, 9, 0))
        # 2026-11-05 癸未(19) + 41 天 = 甲子(0)
        self.assertEqual((gz3, idx3), ("甲子", 0))

    def test_xunkong(self):
        self.assertEqual(L.xunkong_from_idx(19), ["申", "酉"])  # 癸未（甲戌旬）
        self.assertEqual(L.xunkong_from_idx(0), ["戌", "亥"])   # 甲子旬
        self.assertEqual(L.xunkong_from_idx(10), ["申", "酉"])  # 甲戌旬

    def test_solar_term_times(self):
        lic = L._term_local_dt(2026, L._TERMS[0], 8.0)   # 立春
        lid = L._term_local_dt(2026, L._TERMS[9], 8.0)   # 立冬
        target1 = datetime(2026, 2, 4, 4, 2)
        target2 = datetime(2026, 11, 7, 17, 51)
        self.assertLess(abs((lic - target1).total_seconds()), 40 * 60)
        self.assertLess(abs((lid - target2).total_seconds()), 40 * 60)

    def test_month_term(self):
        mt = L.month_term(datetime(2026, 11, 5, 12, 0))
        self.assertEqual((mt["name"], mt["branch"]), ("寒露", "戌"))
        mt2 = L.month_term(datetime(2026, 11, 8, 0, 0))
        self.assertEqual((mt2["name"], mt2["branch"]), ("立冬", "亥"))
        mt3 = L.month_term(datetime(2026, 1, 1, 0, 0))
        self.assertEqual((mt3["name"], mt3["branch"]), ("大雪", "子"))

    def test_sizhi(self):
        z = L._shichen_info(datetime(2026, 11, 5, 21, 30), 8.0)
        self.assertEqual(z["day_ganzhi"], "癸未")
        self.assertEqual(z["xunkong"], ["申", "酉"])
        self.assertEqual(z["month_branch"], "戌")
        self.assertEqual(z["yuepo"], "辰")


class TestTriMode(unittest.TestCase):
    def test_qian_tri(self):
        pan = L.build_tri_pan([["背", "字", "字"]] * 3, when=datetime(2026, 11, 5, 12, 0))
        self.assertEqual(pan["tri"]["name"], "乾")
        self.assertEqual(pan["tri"]["element"], "金")
        self.assertEqual(pan["moving"], [])
        self.assertIsNone(pan["bian"])

    def test_moving_tri(self):
        pan = L.build_tri_pan([["字", "字", "字"], ["背", "字", "字"], ["背", "背", "字"]],
                              when=datetime(2026, 11, 5, 12, 0))
        # 初爻老阴动 → 011 巽
        self.assertEqual(pan["tri"]["name"], "坎")
        self.assertEqual(pan["moving"], [1])
        self.assertEqual(pan["bian"]["name"], "兑")


class TestPanText(unittest.TestCase):
    def test_smoke(self):
        throws = [["字", "字", "字"]] + [["背", "字", "字"]] * 5
        pan = L.build_pan(throws, when=datetime(2026, 11, 5, 12, 0))
        text = L.pan_text(pan)
        self.assertIn("天风姤", text)
        self.assertIn("乾为天", text)
        self.assertIn("癸未", text)
        self.assertIn("伏:甲寅木妻财", text)
        self.assertIn("世", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
