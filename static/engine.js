/* 六爻排盘引擎 · liuyao.py 的 JS 移植（输出与 Python 版逐字段一致，向量测试校验）。
 * 挂载为全局 LiuYao，供网页与安卓（Capacitor）复用。 */
(function (global) {
  "use strict";

  var STEMS = "甲乙丙丁戊己庚辛壬癸";
  var BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
  var BRANCH_ELEM = {
    "子": "水", "亥": "水", "寅": "木", "卯": "木",
    "巳": "火", "午": "火", "申": "金", "酉": "金",
    "辰": "土", "戌": "土", "丑": "土", "未": "土"
  };
  var SHENG = { "金": "水", "水": "木", "木": "火", "火": "土", "土": "金" };
  var KE = { "金": "木", "木": "土", "土": "水", "水": "火", "火": "金" };
  var CLASH = {
    "子": "午", "午": "子", "丑": "未", "未": "丑", "寅": "申", "申": "寅",
    "卯": "酉", "酉": "卯", "辰": "戌", "戌": "辰", "巳": "亥", "亥": "巳"
  };
  var SIX_GODS = ["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"];
  var GOD_START = { "甲": 0, "乙": 0, "丙": 1, "丁": 1, "戊": 2, "己": 3, "庚": 4, "辛": 4, "壬": 5, "癸": 5 };

  var TRIGRAMS = {
    "111": { name: "乾", symbol: "☰", element: "金",
      inner: [["甲", "子"], ["甲", "寅"], ["甲", "辰"]],
      outer: [["壬", "午"], ["壬", "申"], ["壬", "戌"]] },
    "110": { name: "兑", symbol: "☱", element: "金",
      inner: [["丁", "巳"], ["丁", "卯"], ["丁", "丑"]],
      outer: [["丁", "亥"], ["丁", "酉"], ["丁", "未"]] },
    "101": { name: "离", symbol: "☲", element: "火",
      inner: [["己", "卯"], ["己", "丑"], ["己", "亥"]],
      outer: [["己", "酉"], ["己", "未"], ["己", "巳"]] },
    "100": { name: "震", symbol: "☳", element: "木",
      inner: [["庚", "子"], ["庚", "寅"], ["庚", "辰"]],
      outer: [["庚", "午"], ["庚", "申"], ["庚", "戌"]] },
    "011": { name: "巽", symbol: "☴", element: "木",
      inner: [["辛", "丑"], ["辛", "亥"], ["辛", "酉"]],
      outer: [["辛", "未"], ["辛", "巳"], ["辛", "卯"]] },
    "010": { name: "坎", symbol: "☵", element: "水",
      inner: [["戊", "寅"], ["戊", "辰"], ["戊", "午"]],
      outer: [["戊", "申"], ["戊", "戌"], ["戊", "子"]] },
    "001": { name: "艮", symbol: "☶", element: "土",
      inner: [["丙", "辰"], ["丙", "午"], ["丙", "申"]],
      outer: [["丙", "戌"], ["丙", "子"], ["丙", "寅"]] },
    "000": { name: "坤", symbol: "☷", element: "土",
      inner: [["乙", "未"], ["乙", "巳"], ["乙", "卯"]],
      outer: [["癸", "丑"], ["癸", "亥"], ["癸", "酉"]] }
  };
  var PURE_KEYS = ["111", "110", "101", "100", "011", "010", "001", "000"];

  var HEX_ROWS = {
    "111": { "111": "乾为天", "110": "天泽履", "101": "天火同人", "100": "天雷无妄", "011": "天风姤", "010": "天水讼", "001": "天山遁", "000": "天地否" },
    "110": { "111": "泽天夬", "110": "兑为泽", "101": "泽火革", "100": "泽雷随", "011": "泽风大过", "010": "泽水困", "001": "泽山咸", "000": "泽地萃" },
    "101": { "111": "火天大有", "110": "火泽睽", "101": "离为火", "100": "火雷噬嗑", "011": "火风鼎", "010": "火水未济", "001": "火山旅", "000": "火地晋" },
    "100": { "111": "雷天大壮", "110": "雷泽归妹", "101": "雷火丰", "100": "震为雷", "011": "雷风恒", "010": "雷水解", "001": "雷山小过", "000": "雷地豫" },
    "011": { "111": "风天小畜", "110": "风泽中孚", "101": "风火家人", "100": "风雷益", "011": "巽为风", "010": "风水涣", "001": "风山渐", "000": "风地观" },
    "010": { "111": "水天需", "110": "水泽节", "101": "水火既济", "100": "水雷屯", "011": "水风井", "010": "坎为水", "001": "水山蹇", "000": "水地比" },
    "001": { "111": "山天大畜", "110": "山泽损", "101": "山火贲", "100": "山雷颐", "011": "山风蛊", "010": "山水蒙", "001": "艮为山", "000": "山地剥" },
    "000": { "111": "地天泰", "110": "地泽临", "101": "地火明夷", "100": "地雷复", "011": "地风升", "010": "地水师", "001": "地山谦", "000": "坤为地" }
  };
  var HEX_NAMES = {};
  Object.keys(HEX_ROWS).forEach(function (outer) {
    Object.keys(HEX_ROWS[outer]).forEach(function (inner) {
      HEX_NAMES[inner + "|" + outer] = HEX_ROWS[outer][inner];
    });
  });

  var GEN_LABEL = ["本宫卦", "一世卦", "二世卦", "三世卦", "四世卦", "五世卦", "游魂卦", "归魂卦"];
  var SHI_POS = [6, 1, 2, 3, 4, 5, 4, 3];
  var NEXT_MUTATION = [1, 2, 3, 4, 5, 4, null];
  var YANG_SYM = "▅▅▅▅▅";
  var YIN_SYM = "▅▅ ▅▅";
  var WEEKDAYS = "一二三四五六日";
  var CN_POS = { 1: "初", 2: "二", 3: "三", 4: "四", 5: "五", 6: "上" };

  // ---------------- 掷币 ----------------
  function parseThrow(throw3) {
    if (!Array.isArray(throw3) || throw3.length !== 3) throw new Error("每次需三枚硬币结果");
    var backs = 0;
    for (var i = 0; i < 3; i++) {
      var c = throw3[i];
      if (c === true || c === 1 || c === "背" || c === "b" || c === "B") backs++;
    }
    return { 0: 6, 1: 7, 2: 8, 3: 9 }[backs];
  }

  function lineLabel(pos, value) {
    var place = CN_POS[pos];
    var yn = (value === 7 || value === 9) ? "九" : "六";
    return (pos === 1 || pos === 6) ? place + yn : yn + place;
  }

  function lineSymbol(v) {
    var s = (v === 7 || v === 9) ? YANG_SYM : YIN_SYM;
    return s + (v === 9 ? " ○" : v === 6 ? " ✕" : "");
  }

  function bitsFromLines(lines) {
    return lines.map(function (v) { return (v === 7 || v === 9) ? "1" : "0"; }).join("");
  }

  function hexName(bits) {
    return HEX_NAMES[bits.slice(0, 3) + "|" + bits.slice(3)];
  }

  // ---------------- 卦宫 ----------------
  function findPalace(bits) {
    for (var pi = 0; pi < 8; pi++) {
      var pure = PURE_KEYS[pi];
      var cur = (pure + pure).split("");
      for (var g = 0; g < 8; g++) {
        if (cur.join("") === bits) {
          var shi = SHI_POS[g];
          var ying = shi <= 3 ? shi + 3 : shi - 3;
          return { pure: pure, g: g, shi: shi, ying: ying };
        }
        if (g >= 7) break;
        var mut = NEXT_MUTATION[g];
        if (mut === null) {
          for (var k = 0; k < 3; k++) cur[k] = pure[k];
        } else {
          cur[mut - 1] = cur[mut - 1] === "0" ? "1" : "0";
        }
      }
    }
    throw new Error("无法定位卦宫: " + bits);
  }

  function liuqin(gongElem, branch) {
    var b = BRANCH_ELEM[branch];
    if (b === gongElem) return "兄弟";
    if (SHENG[gongElem] === b) return "子孙";
    if (SHENG[b] === gongElem) return "父母";
    if (KE[b] === gongElem) return "官鬼";
    return "妻财";
  }

  function najiaLines(bits, gongElem) {
    var triIn = TRIGRAMS[bits.slice(0, 3)], triOut = TRIGRAMS[bits.slice(3)];
    var out = [];
    for (var i = 0; i < 6; i++) {
      var table = i < 3 ? triIn.inner : triOut.outer;
      var pair = table[i < 3 ? i : i - 3];
      out.push({
        pos: i + 1, stem: pair[0], branch: pair[1], ganzhi: pair[0] + pair[1],
        element: BRANCH_ELEM[pair[1]], liuqin: liuqin(gongElem, pair[1])
      });
    }
    return out;
  }

  function fushen(benLines, pureKey, gongElem) {
    var present = {};
    benLines.forEach(function (ln) { present[ln.liuqin] = true; });
    najiaLines(pureKey + pureKey, gongElem).forEach(function (ln) {
      if (!present[ln.liuqin]) {
        benLines[ln.pos - 1].fu = { ganzhi: ln.ganzhi, element: ln.element, liuqin: ln.liuqin };
      }
    });
  }

  // ---------------- 历法 ----------------
  function jdn(y, m, d) {
    var a = Math.floor((14 - m) / 12);
    var yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
      + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }

  var ANCHOR = { y: 2026, m: 11, d: 5, idx: 19 };  // 2026-11-05 癸未日

  function dayGanzhiIdx(y, m, d) {
    var diff = (jdn(y, m, d) - jdn(ANCHOR.y, ANCHOR.m, ANCHOR.d) + ANCHOR.idx) % 60;
    return ((diff % 60) + 60) % 60;
  }

  function dayGanzhi(dt) {
    var i = dayGanzhiIdx(dt.y, dt.m, dt.d);
    return { gz: STEMS[i % 10] + BRANCHES[i % 12], idx: i };
  }

  function xunkongFromIdx(idx) {
    var s = (((idx % 12) - (idx % 10)) % 12 + 12) % 12;
    return [BRANCHES[(s + 10) % 12], BRANCHES[(s + 11) % 12]];
  }

  function sunLon(jd) {
    var t = (jd - 2451545.0) / 36525.0;
    var l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
    var m = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) * Math.PI / 180;
    var c = (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(m)
      + (0.019993 - 0.000101 * t) * Math.sin(2 * m) + 0.000289 * Math.sin(3 * m);
    var lam = l0 + c;
    var om = (125.04 - 1934.136 * t) * Math.PI / 180;
    lam -= 0.00569 + 0.00478 * Math.sin(om);
    return ((lam % 360) + 360) % 360;
  }

  function termJD(year, mh, dh, deg) {
    var jd = jdn(year, mh, dh) + 0.0;
    for (var i = 0; i < 8; i++) {
      var diff = ((sunLon(jd) - deg + 180) % 360 + 360) % 360 - 180;
      jd -= diff / 0.98565;
    }
    return jd;
  }

  var TERMS = [
    { deg: 315, name: "立春", branch: "寅", mh: 2, dh: 4 },
    { deg: 345, name: "惊蛰", branch: "卯", mh: 3, dh: 5 },
    { deg: 15, name: "清明", branch: "辰", mh: 4, dh: 4 },
    { deg: 45, name: "立夏", branch: "巳", mh: 5, dh: 5 },
    { deg: 75, name: "芒种", branch: "午", mh: 6, dh: 5 },
    { deg: 105, name: "小暑", branch: "未", mh: 7, dh: 7 },
    { deg: 135, name: "立秋", branch: "申", mh: 8, dh: 7 },
    { deg: 165, name: "白露", branch: "酉", mh: 9, dh: 7 },
    { deg: 195, name: "寒露", branch: "戌", mh: 10, dh: 8 },
    { deg: 225, name: "立冬", branch: "亥", mh: 11, dh: 7 },
    { deg: 255, name: "大雪", branch: "子", mh: 12, dh: 7 },
    { deg: 285, name: "小寒", branch: "丑", mh: 1, dh: 5 }
  ];

  function dtTs(dt, tz) {  // 本地时刻 → 秒
    return Date.UTC(dt.y, dt.m - 1, dt.d, dt.h || 0, dt.min || 0) / 1000 - tz * 3600;
  }

  function monthTerm(dt, tz) {
    var dtT = dtTs(dt, tz), best = null;
    [dt.y - 1, dt.y].forEach(function (year) {
      TERMS.forEach(function (t) {
        var ts = (termJD(year, t.mh, t.dh, t.deg) - 2440587.5) * 86400;
        if (ts <= dtT && (best === null || ts > best.ts)) {
          best = { name: t.name, branch: t.branch, ts: ts };
        }
      });
    });
    return best;
  }

  function weekday(dt) {
    var wd = new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).getUTCDay();
    return "星期" + WEEKDAYS[(wd + 6) % 7];
  }

  function sizhiInfo(dt, tz) {
    var dg = dayGanzhi(dt);
    var info = {
      day_ganzhi: dg.gz, day_stem: dg.gz[0], day_branch: dg.gz[1],
      day_branch_element: BRANCH_ELEM[dg.gz[1]],
      xunkong: xunkongFromIdx(dg.idx),
      weekday: weekday(dt)
    };
    var mt = monthTerm(dt, tz);
    if (mt) {
      info.month_term = mt.name;
      info.month_branch = mt.branch;
      info.month_branch_element = BRANCH_ELEM[mt.branch];
      info.yuepo = CLASH[mt.branch];
    }
    return info;
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  // ---------------- 排盘 ----------------
  function buildPan(throws, dt, tz) {
    if (throws.length !== 6) throw new Error("标准六爻需摇六次（得到六爻）");
    dt = dt || nowDT(); tz = (tz === undefined) ? localTZ() : tz;
    var lines = throws.map(parseThrow);
    var bits = bitsFromLines(lines);

    var pal = findPalace(bits);
    var gong = TRIGRAMS[pal.pure];
    var benLines = najiaLines(bits, gong.element);
    var dg = dayGanzhi(dt);
    var gods = [];
    for (var i = 0; i < 6; i++) gods.push(SIX_GODS[(GOD_START[dg.gz[0]] + i) % 6]);

    var moving = [];
    for (var j = 0; j < 6; j++) {
      var ln = benLines[j], v = lines[j];
      ln.value = v;
      ln.moving = (v === 6 || v === 9);
      ln.yang = (v === 7 || v === 9);
      ln.label = lineLabel(j + 1, v);
      ln.liushen = gods[j];
      ln.is_shi = (j + 1) === pal.shi;
      ln.is_ying = (j + 1) === pal.ying;
      ln.fu = null;
      if (ln.moving) moving.push(j + 1);
    }
    fushen(benLines, pal.pure, gong.element);

    var triIn = TRIGRAMS[bits.slice(0, 3)], triOut = TRIGRAMS[bits.slice(3)];
    var ben = {
      bits: bits, name: hexName(bits),
      inner: triIn.name, outer: triOut.name,
      inner_symbol: triIn.symbol, outer_symbol: triOut.symbol,
      palace: gong.name, palace_element: gong.element,
      gen_label: GEN_LABEL[pal.g], shi: pal.shi, ying: pal.ying,
      lines: benLines
    };

    var bian = null;
    if (moving.length) {
      var bb = "";
      for (var k = 0; k < 6; k++) {
        bb += ((bits[k] === "1") !== (moving.indexOf(k + 1) >= 0)) ? "1" : "0";
      }
      var bianLines = najiaLines(bb, gong.element);
      for (var k2 = 0; k2 < 6; k2++) {
        var bl = bianLines[k2];
        bl.moving = moving.indexOf(k2 + 1) >= 0;
        bl.yang = bb[k2] === "1";
        bl.label = lineLabel(k2 + 1, bl.yang ? 7 : 8);
      }
      var bpal = findPalace(bb);
      var bgong = TRIGRAMS[bpal.pure];
      bian = {
        bits: bb, name: hexName(bb), palace: bgong.name,
        palace_element: bgong.element, gen_label: GEN_LABEL[bpal.g], lines: bianLines
      };
    }

    return {
      mode: "six",
      datetime: dt.y + "-" + pad2(dt.m) + "-" + pad2(dt.d) + " " + pad2(dt.h || 0) + ":" + pad2(dt.min || 0),
      throws: throws.map(function (t) { return t.slice(); }),
      lines: lines, moving: moving, ben: ben, bian: bian,
      sizhi: sizhiInfo(dt, tz)
    };
  }

  function buildTriPan(throws, dt, tz) {
    if (throws.length !== 3) throw new Error("简化模式需摇三次（得到三爻）");
    dt = dt || nowDT(); tz = (tz === undefined) ? localTZ() : tz;
    var lines = throws.map(parseThrow);
    var bits = bitsFromLines(lines);
    var tri = TRIGRAMS[bits];
    var moving = [];
    var triLines = [];
    for (var i = 0; i < 3; i++) {
      if (lines[i] === 6 || lines[i] === 9) moving.push(i + 1);
      triLines.push({
        pos: i + 1, value: lines[i],
        moving: lines[i] === 6 || lines[i] === 9,
        yang: lines[i] === 7 || lines[i] === 9,
        label: lineLabel(i + 1, lines[i])
      });
    }
    var bian = null;
    if (moving.length) {
      var bb = "";
      for (var k = 0; k < 3; k++) {
        bb += ((bits[k] === "1") !== (moving.indexOf(k + 1) >= 0)) ? "1" : "0";
      }
      var btri = TRIGRAMS[bb];
      bian = {
        bits: bb, name: btri.name, symbol: btri.symbol, element: btri.element,
        lines: [0, 1, 2].map(function (i) {
          return { pos: i + 1, yang: bb[i] === "1", moving: moving.indexOf(i + 1) >= 0 };
        })
      };
    }
    return {
      mode: "three",
      datetime: dt.y + "-" + pad2(dt.m) + "-" + pad2(dt.d) + " " + pad2(dt.h || 0) + ":" + pad2(dt.min || 0),
      throws: throws.map(function (t) { return t.slice(); }),
      lines: lines, moving: moving,
      tri: { bits: bits, name: tri.name, symbol: tri.symbol, element: tri.element, lines: triLines },
      bian: bian, sizhi: sizhiInfo(dt, tz)
    };
  }

  function nowDT() {
    var d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), min: d.getMinutes() };
  }

  function localTZ() { return -new Date().getTimezoneOffset() / 60; }

  // ---------------- 排盘文本（与 Python pan_text 一致） ----------------
  function panText(pan) {
    var z = pan.sizhi, out = [];
    out.push("【起卦时间】" + pan.datetime + "（" + z.weekday + "）");
    var sz = "日柱：" + z.day_ganzhi;
    if (z.month_branch) sz += "｜月建：" + z.month_branch + "（" + z.month_term + "后）";
    sz += "｜旬空：" + z.xunkong.join("");
    if (z.yuepo) sz += "｜月破：" + z.yuepo;
    out.push("【四值】" + sz);

    if (pan.mode === "three") {
      var t = pan.tri;
      out.push("【卦式】三爻简化金钱课（经卦）");
      out.push("【本卦】" + t.name + "（" + t.symbol + "，属" + t.element + "）");
      [2, 1, 0].forEach(function (i) {
        out.push("  " + t.lines[i].label + "  " + lineSymbol(t.lines[i].value));
      });
      if (pan.bian) out.push("【变卦】" + pan.bian.name + "（属" + pan.bian.element + "）");
      if (pan.moving.length) out.push("【动爻】第" + pan.moving.join("、") + "爻");
      return out.join("\n");
    }

    var ben = pan.ben;
    out.push("【卦式】标准六爻（京房纳甲装卦）");
    if (pan.bian) {
      out.push("【本卦】" + ben.name + "（" + ben.palace + "宫" + ben.gen_label + "，属" + ben.palace_element
        + "）　【变卦】" + pan.bian.name + "（" + pan.bian.palace + "宫" + pan.bian.gen_label + "）");
    } else {
      out.push("【本卦】" + ben.name + "（" + ben.palace + "宫" + ben.gen_label + "，属" + ben.palace_element + "）　静卦无变");
    }
    out.push("【世应】世爻：" + CN_POS[ben.shi] + "爻　应爻：" + CN_POS[ben.ying] + "爻");
    if (pan.moving.length) {
      out.push("【动爻】" + pan.moving.map(function (p) { return ben.lines[p - 1].label; }).join("、"));
    }
    out.push("【排盘】（自上而下：上爻→初爻）");
    [5, 4, 3, 2, 1, 0].forEach(function (i) {
      var ln = ben.lines[i];
      var row = "  " + ln.liushen + "  " + ln.label + "  " + lineSymbol(ln.value)
        + "  " + ln.ganzhi + ln.element + ln.liuqin;
      var marks = [];
      if (ln.is_shi) marks.push("世");
      if (ln.is_ying) marks.push("应");
      if (ln.moving) marks.push("→动");
      if (marks.length) row += "  " + marks.join("·");
      if (ln.fu) row += "  伏:" + ln.fu.ganzhi + ln.fu.element + ln.fu.liuqin;
      if (pan.bian && ln.moving) {
        var bl = pan.bian.lines[i];
        row += "  ⇒ 变出 " + bl.ganzhi + bl.element + bl.liuqin;
      }
      out.push(row);
    });
    return out.join("\n");
  }

  // ---------------- LLM 提示词（离线直连时使用，与 app.py 保持一致） ----------------
  var SYSTEM_SIX = "你是一位精通《周易》与京房纳甲六爻的资深卦师，用通俗易懂的现代汉语为人解卦。\n用户会提供一次摇卦的完整排盘数据（卦名、卦宫、纳甲干支、六亲、世应、六神、动爻、变卦、日柱、月建、旬空、月破等）。这些数据已由程序精确计算，你必须直接采信，禁止重新排盘、更改或质疑任何卦象数据。\n解卦要求：\n1. 先用两三句话概括卦象总体格局（本卦变卦、卦宫五行、动静多寡）。\n2. 依据所问之事选取用神并说明理由（如求财取妻财、婚恋取妻财/官鬼、事业功名取官鬼、考试文书取父母、健康忧患取世爻/官鬼、失物取妻财、出行取世爻/父母等）。\n3. 分析用神旺衰：日柱月建的生扶冲克、是否旬空月破、动爻与原神忌神仇神对用神的作用。\n4. 分析动爻变化与变卦趋势、世应关系、六神渲染的吉凶色彩。\n5. 给出明确的结论（吉凶成败、把握程度）、趋势判断与可行建议；如可推断，给出应期思路（逢值、逢冲、逢合、出旬、出空之日月）。\n6. 条理清晰，使用「## 小标题」和要点列表；关键术语用一句话白话解释；不要输出 Markdown 表格。\n7. 结尾固定附一句：以上卦象分析仅供参考。\n若个别信息（如月建）未提供，说明缺失后基于日柱继续分析，不要编造数据。";

  var SYSTEM_THREE = "你是一位熟悉《周易》八卦象意的卦师，用通俗易懂的现代汉语为人解卦。\n用户提供的是「三爻简化金钱课」：三枚硬币摇三次得到一个经卦（八纯卦之一），可能带动爻与变卦。数据已由程序计算，直接采信，不要重新推演。\n解卦要求：\n1. 概述本卦卦象（卦名、五行、基本象意：如乾健、坤顺、震动、巽入、坎陷、离丽、艮止、兑悦）。\n2. 结合所问之事，用八卦万物类象（人物、性情、事态走向）展开分析。\n3. 若有动爻，说明阴阳变化带来的趋势转折与变卦含义。\n4. 参考日柱干支与卦宫五行的生克关系简断旺衰。\n5. 给出明确结论与建议，条理清晰，使用「## 小标题」和要点列表；不要输出 Markdown 表格。\n6. 结尾固定附一句：以上卦象分析仅供参考。";

  function buildMessages(reading) {
    // 八字命盘由 bazi.js 提供提示词（保持单一计算源）
    if (reading.type === "bazi" && global.LiuYaoBazi) {
      return global.LiuYaoBazi.buildMessages(reading);
    }
    var pan = reading.pan;
    var q = (reading.question || "").trim();
    var system = pan.mode === "three" ? SYSTEM_THREE : SYSTEM_SIX;
    var user = panText(pan) + "\n\n【所问之事】" + (q || "（未注明，请综合断近期运势并提示补问）");
    return { system: system, user: user };
  }

  // 供八字模块（bazi.js）使用的历法底层：节气时刻表（UTC 秒）、日柱索引、干支字符
  function allTerms(dt) {
    var out = [];
    [dt.y - 1, dt.y, dt.y + 1].forEach(function (year) {
      TERMS.forEach(function (t) {
        out.push({ name: t.name, branch: t.branch,
                   ts: (termJD(year, t.mh, t.dh, t.deg) - 2440587.5) * 86400 });
      });
    });
    return out;
  }

  global.LiuYao = {
    parseThrow: parseThrow, lineSymbol: lineSymbol, lineLabel: lineLabel,
    buildPan: buildPan, buildTriPan: buildTriPan, panText: panText,
    buildMessages: buildMessages, nowDT: nowDT, localTZ: localTZ,
    STEMS: STEMS, BRANCHES: BRANCHES,
    dayGanzhiIdx: dayGanzhiIdx, allTerms: allTerms
  };
})(typeof window !== "undefined" ? window : globalThis);
