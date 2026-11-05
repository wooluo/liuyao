/* 八字命盘排盘引擎（子平八字）· 前端单计算源
 * 依赖 engine.js 的 LiuYao（日柱索引、节气时刻）。挂载为全局 LiuYaoBazi。
 * 约定：23:00 起按次日子时换日；年柱以立春为界；月柱以十二节为界（五虎遁）；
 *       时柱按五鼠遁；时辰未知时排三柱并在文本中说明。 */
(function (global) {
  "use strict";

  var STEMS = "甲乙丙丁戊己庚辛壬癸";
  var BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
  var STEM_ELEM = ["木", "木", "火", "火", "土", "土", "金", "金", "水", "水"];
  var BRANCH_ELEM = ["水", "土", "木", "木", "土", "火", "火", "土", "金", "金", "土", "水"];
  var ZODIAC = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];

  // 地支藏干（本气在前）
  var CZ = {
    "子": ["癸"], "丑": ["己", "癸", "辛"], "寅": ["甲", "丙", "戊"],
    "卯": ["乙"], "辰": ["戊", "乙", "癸"], "巳": ["丙", "庚", "戊"],
    "午": ["丁", "己"], "未": ["己", "丁", "乙"], "申": ["庚", "壬", "戊"],
    "酉": ["辛"], "戌": ["戊", "辛", "丁"], "亥": ["壬", "甲"]
  };

  // 六十甲子纳音（每两柱一音）
  var NAYIN = ["海中金", "炉中火", "大林木", "路旁土", "剑锋金", "山头火", "涧下水", "城头土",
    "白蜡金", "杨柳木", "泉中水", "屋上土", "霹雳火", "松柏木", "长流水", "沙中金",
    "山下火", "平地木", "壁上土", "金箔金", "覆灯火", "天河水", "大驿土", "钗钏金",
    "桑柘木", "大溪水", "沙中土", "天上火", "石榴木", "大海水"];

  var HOUR_NAMES = ["子时 23:00-00:59", "丑时 01:00-02:59", "寅时 03:00-04:59", "卯时 05:00-06:59",
    "辰时 07:00-08:59", "巳时 09:00-10:59", "午时 11:00-12:59", "未时 13:00-14:59",
    "申时 15:00-16:59", "酉时 17:00-18:59", "戌时 19:00-20:59", "亥时 21:00-22:59"];

  function gz(idx) {
    return STEMS[((idx % 10) + 10) % 10] + BRANCHES[((idx % 12) + 12) % 12];
  }

  // 已知天干索引与地支索引（同奇偶），求六十甲子索引（中国剩余：k≡s mod10, k≡b mod12）
  function gzIndex(sIdx, bIdx) {
    var t = ((((sIdx - bIdx) / 2) % 6) + 6) % 6;
    return ((sIdx + 10 * t) % 60 + 60) % 60;
  }

  // 十神：以日干为「我」
  function tenGod(dayStemIdx, otherStemIdx) {
    var same = (dayStemIdx % 2) === (otherStemIdx % 2);
    var my = STEM_ELEM[((dayStemIdx % 10) + 10) % 10];
    var ot = STEM_ELEM[((otherStemIdx % 10) + 10) % 10];
    var sheng = { "木": "火", "火": "土", "土": "金", "金": "水", "水": "木" };
    var ke = { "木": "土", "土": "水", "水": "火", "火": "金", "金": "木" };
    if (my === ot) return same ? "比肩" : "劫财";
    if (sheng[my] === ot) return same ? "食神" : "伤官";
    if (sheng[ot] === my) return same ? "偏印" : "正印";
    if (ke[my] === ot) return same ? "偏财" : "正财";
    return same ? "七杀" : "正官";
  }

  function cnNum(n) {
    return n === 0 ? "零" : n === 1 ? "一" : n === 2 ? "二" : n === 3 ? "三" :
      n === 4 ? "四" : n === 5 ? "五" : n === 6 ? "六" : n === 7 ? "七" :
      n === 8 ? "八" : n === 9 ? "九" : n === 10 ? "十" : String(n);
  }

  // ---------- 四柱计算 ----------
  // input: {name, gender, y, m, d, hour(0-23 或 null)}
  function buildChart(input) {
    var y = input.y, m = input.m, d = input.d;
    var hour = (input.hour === null || input.hour === undefined) ? null : input.hour;
    var gender = input.gender === "女" ? "女" : "男";

    // 晚子时换日：23 点起算次日
    var shiftDay = hour === 23;
    var sy = y, sm = m, sd = d;
    if (shiftDay) {
      var nd = new Date(Date.UTC(y, m - 1, d + 1));
      sy = nd.getUTCFullYear(); sm = nd.getUTCMonth() + 1; sd = nd.getUTCDate();
    }

    var birthTs = Date.UTC(sy, sm - 1, sd, hour === null ? 12 : hour, 0) / 1000;
    var terms = LiuYao.allTerms({ y: sy, m: sm, d: sd });

    // 年柱：立春为界
    var lichun = null;
    terms.forEach(function (t) {
      if (t.name === "立春" && new Date(t.ts * 1000).getUTCFullYear() === sy) lichun = t;
    });
    var effYear = (lichun && birthTs >= lichun.ts) ? sy : sy - 1;
    var yearIdx = ((effYear - 4) % 60 + 60) % 60;

    // 月柱：最后一个「节」定月支，五虎遁定月干（上一节可能落在去年）
    var cur = null, next = null;
    terms.forEach(function (t) {
      if (t.ts <= birthTs && (!cur || t.ts > cur.ts)) cur = t;
      if (t.ts > birthTs && (!next || t.ts < next.ts)) next = t;
    });
    var mBranchIdx = BRANCHES.indexOf(cur.branch);
    var mNum = ((mBranchIdx - 2 + 12) % 12) + 1;          // 寅月=1 … 丑月=12
    var yStem = yearIdx % 10;
    var mStemIdx = ((yStem % 5) * 2 + 2 + (mNum - 1)) % 10;    // 月干
    var monthIdx = gzIndex(mStemIdx, mBranchIdx);              // 干支组合 → 六十甲子索引

    // 日柱
    var dayIdx = LiuYao.dayGanzhiIdx(sy, sm, sd);

    // 时柱（五鼠遁）
    var hourBranchIdx = hour === null ? null : ((hour + 1) % 24) >> 1;
    var hourIdx = hour === null ? null
      : gzIndex(((dayIdx % 10) % 5) * 2 + hourBranchIdx, hourBranchIdx);

    function pillar(idx0) {
      if (idx0 === null) return null;
      var si = ((idx0 % 10) + 10) % 10, bi = ((idx0 % 12) + 12) % 12;
      return {
        gz: gz(idx0), stem: STEMS[si], branch: BRANCHES[bi],
        stem_elem: STEM_ELEM[si], branch_elem: BRANCH_ELEM[bi],
        nayin: NAYIN[Math.floor((((idx0 % 60) + 60) % 60) / 2)],
        cz: CZ[BRANCHES[bi]]
      };
    }

    var py = pillar(yearIdx), pm = pillar(monthIdx), pd = pillar(dayIdx),
        ph = hour === null ? null : pillar(hourIdx);

    // 十神（对日干）：日支藏干本气对日主同样有意义，一并标出
    [py, pm, pd, ph].forEach(function (p) {
      if (!p) return;
      p.sg_stem = (p === pd) ? "日主" : tenGod(dayIdx % 10, STEMS.indexOf(p.stem));
      p.sg_main = tenGod(dayIdx % 10, STEMS.indexOf(p.cz[0]));
    });

    // 五行统计（八字本气；缺时辰按六字）
    var counts = { "金": 0, "木": 0, "水": 0, "火": 0, "土": 0 };
    [py, pm, pd, ph].forEach(function (p) {
      if (!p) return;
      counts[p.stem_elem]++;
      counts[p.branch_elem]++;
    });
    var missing = Object.keys(counts).filter(function (e) { return counts[e] === 0; });

    // 大运：阳年男顺 / 阴年女顺，其余逆排；三日为一岁
    var yangYear = (yearIdx % 2) === 0;
    var forward = (yangYear && gender === "男") || (!yangYear && gender === "女");
    var deltaDays = forward ? (next.ts - birthTs) / 86400 : (birthTs - cur.ts) / 86400;
    var startSui = Math.round(deltaDays / 3 * 10) / 10;
    var dayun = [];
    for (var i = 0; i < 8; i++) {
      // 大运自月柱顺/逆的下一位起排
      var idx0 = (((monthIdx + (forward ? i + 1 : -(i + 1))) % 60) + 60) % 60;
      var a0 = startSui + i * 10;
      dayun.push({
        gz: gz(idx0),
        from: Math.floor(a0), to: Math.floor(a0) + 10,
        start: Math.round(a0 * 10) / 10
      });
    }

    var chart = {
      mode: "bazi",
      name: input.name || "命主",
      gender: gender,
      birth: input.y + "-" + ("0" + input.m).slice(-2) + "-" + ("0" + input.d).slice(-2)
        + " " + (hour === null ? "时辰不详" : HOUR_NAMES[hourBranchIdx]),
      hour_known: hour !== null,
      yang_year: yangYear,
      forward: forward,
      start_sui: startSui,
      zodiac: ZODIAC[BRANCHES.indexOf(py.branch)],
      pillars: { year: py, month: pm, day: pd, hour: ph },
      dayun: dayun,
      counts: counts,
      missing: missing,
      current_year_gz: gz(new Date().getUTCFullYear() - 4)
    };

    chart.bazi_text = chartText(chart);
    return chart;
  }

  // ---------- 排盘文本（供 LLM 与复制） ----------
  function pillarText(p, tag, dayIdx) {
    if (!p) return "时柱：?（时辰不详）";
    var parts = [tag + "：" + p.gz + "（" + p.nayin + "）"];
    parts.push("干支五行：" + p.stem_elem + p.branch_elem);
    parts.push("藏干：" + p.cz.join("/") + "（主气十神：" + p.sg_main + "）");
    if (p.sg_stem !== "日主") parts.push("天干十神：" + p.sg_stem);
    return parts.join("，");
  }

  function chartText(c) {
    var out = [];
    out.push("【命主】" + c.name + "（" + c.gender + "，属" + c.zodiac + "）");
    out.push("【出生】公历 " + c.birth);
    out.push("【排盘说明】由程序按天文节气精确排盘：年柱以立春为界、月柱以十二节为界、23点起按次日子时换日。请直接采信，禁止重新排盘。");
    var ps = c.pillars;
    out.push("【四柱】年柱 " + ps.year.gz + "　月柱 " + ps.month.gz + "　日柱 " + ps.day.gz
      + (ps.hour ? "　时柱 " + ps.hour.gz : "　时柱缺失（时辰不详）"));
    out.push("【四柱详表】");
    out.push("  " + pillarText(ps.year, "年柱"));
    out.push("  " + pillarText(ps.month, "月柱"));
    out.push("  " + pillarText(ps.day, "日柱"));
    if (ps.hour) out.push("  " + pillarText(ps.hour, "时柱"));
    var cnt = Object.keys(c.counts).map(function (e) { return e + c.counts[e]; }).join("、");
    out.push("【五行】" + cnt + (c.missing.length ? "（缺" + c.missing.join("、") + "）" : "（五行不缺）"));
    out.push("【日主】" + ps.day.stem + ps.day.stem_elem + "，生于" + ps.month.branch + "月"
      + (ps.hour ? "" : "（时辰未知，按三柱论）"));
    var dy = c.dayun.map(function (d, i) {
      return d.gz + "（约" + d.from + "-" + d.to + "岁）";
    }).join("　");
    out.push("【大运】" + (c.forward ? "顺行" : "逆行") + "，约" + c.start_sui + "岁起运，每十年一换：" + dy);
    out.push("【流年参考】当前为" + c.current_year_gz + "年（2026 丙午年）");
    return out.join("\n");
  }

  // ---------- 提示词（与服务端 SYSTEM_BAZI 保持一致） ----------
  var SYSTEM_BAZI = "你是一位精通传统命理（子平八字）的老师，用通俗易懂的现代汉语为人论命。\n用户提供一份由程序按天文节气精确排出的八字命盘（四柱、藏干、纳音、十神、五行分布、大运、生肖等）。数据已由程序计算，你必须直接采信，禁止重新排盘、更改或质疑任何排盘数据。\n论命要求：\n1. 开头用两三句话概括命局大势（日主与月令的关系、五行分布、强弱倾向）。\n2. 判断日主强弱（得令、得地、得势三个维度），据此确定用神、喜神、忌神，并用一句话解释它们分别代表什么。\n3. 结合十神与宫位分主题展开：性格特质、事业与职业倾向、财运、婚姻感情、六亲缘份、健康注意；有则论之，无则不必生造。\n4. 结合大运：说明起运年龄、顺逆，指出当前（2026 年，丙午流年）所行大运与未来十年的整体走势、关键年龄段与注意事项。\n5. 若时辰缺失，明确说明是三柱推算、相关结论精度有限，并提示补全时辰可更准确。\n6. 用「## 小标题」与要点列表，专业术语用一句话白话解释；语气温和专业，避免绝对化断语；不要输出 Markdown 表格。\n7. 结尾固定附一句：以上命理分析仅供参考，命运掌握在自己手中。\n若「想了解的方面」有注明，围绕它重点展开；未注明则综合全面分析。";

  function buildMessages(reading) {
    var c = reading.pan;
    var q = (reading.question || "").trim();
    var user = c.bazi_text + "\n\n【想了解的方面】" + (q || "（未注明，请综合全面分析）");
    return { system: SYSTEM_BAZI, user: user };
  }

  global.LiuYaoBazi = {
    buildChart: buildChart, chartText: chartText,
    buildMessages: buildMessages, tenGod: tenGod, gz: gz, HOUR_NAMES: HOUR_NAMES
  };
})(typeof window !== "undefined" ? window : globalThis);
