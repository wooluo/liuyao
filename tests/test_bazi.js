/* 八字排盘向量测试：node tests/test_bazi.js
 * 向量由经典排盘规则手工推演（年柱立春界、五虎遁/五鼠遁、晚子时换日、大运顺逆）。 */
const assert = require("assert");
const path = require("path");

require(path.join(__dirname, "..", "static", "engine.js"));
require(path.join(__dirname, "..", "static", "bazi.js"));
const BZ = globalThis.LiuYaoBazi;
const LY = globalThis.LiuYao;

// 向量1：2000-01-01 12:00 男（立春前 → 年柱用 1999 己卯；月柱丙子；日柱戊午；时柱戊午）
let c = BZ.buildChart({ name: "测试", gender: "男", y: 2000, m: 1, d: 1, hour: 12 });
assert.strictEqual(c.pillars.year.gz, "己卯", "向量1年柱 " + c.pillars.year.gz);
assert.strictEqual(c.pillars.month.gz, "丙子", "向量1月柱 " + c.pillars.month.gz);
assert.strictEqual(c.pillars.day.gz, "戊午", "向量1日柱 " + c.pillars.day.gz);
assert.strictEqual(c.pillars.hour.gz, "戊午", "向量1时柱 " + c.pillars.hour.gz);
assert.strictEqual(c.pillars.year.nayin, "城头土", "己卯纳音");       // 己卯 → 城头土
assert.strictEqual(c.pillars.day.nayin, "天上火", "戊午纳音");       // 戊午 → 天上火
assert.strictEqual(c.zodiac, "兔");
assert.strictEqual(c.forward, false, "阴年男 → 逆排");
assert.strictEqual(c.dayun[0].gz, "乙亥", "月柱丙子逆排第一运乙亥");
console.log("✓ 向量1（2000-01-01 午时 男）:", c.pillars.year.gz, c.pillars.month.gz,
  c.pillars.day.gz, c.pillars.hour.gz, "大运", c.forward ? "顺" : "逆", c.dayun[0].gz);

// 向量2：1990-05-23 14:00 女（庚午年 辛巳月 戊子日 己未时）
c = BZ.buildChart({ name: "测试", gender: "女", y: 1990, m: 5, d: 23, hour: 14 });
assert.strictEqual(c.pillars.year.gz, "庚午", "向量2年柱 " + c.pillars.year.gz);
assert.strictEqual(c.pillars.month.gz, "辛巳", "向量2月柱 " + c.pillars.month.gz);
assert.strictEqual(c.pillars.day.gz, "戊子", "向量2日柱 " + c.pillars.day.gz);
assert.strictEqual(c.pillars.hour.gz, "己未", "向量2时柱 " + c.pillars.hour.gz);
assert.strictEqual(c.zodiac, "马");
assert.strictEqual(c.forward, false, "阳年女 → 逆排");
assert.strictEqual(c.dayun[0].gz, "庚辰", "月柱辛巳逆排第一运庚辰");
// 十神：日主戊土 → 年干庚金：土生金、戊阳庚阳同阴阳 → 食神
assert.strictEqual(c.pillars.year.sg_stem, "食神", "戊日见庚 " + c.pillars.year.sg_stem);
// 日支子本气癸水：戊克水、癸阴戊阳 → 正财
assert.strictEqual(c.pillars.day.sg_main, "正财", "子藏癸 " + c.pillars.day.sg_main);
// 月支巳本气丙火：火生土、丙阳戊阳 → 偏印
assert.strictEqual(c.pillars.month.sg_main, "偏印", "巳藏丙 " + c.pillars.month.sg_main);
console.log("✓ 向量2（1990-05-23 未时 女）:", c.pillars.year.gz, c.pillars.month.gz,
  c.pillars.day.gz, c.pillars.hour.gz, "十神 年干=" + c.pillars.year.sg_stem);

// 向量3：晚子时换日 1990-05-23 23:30 → 按次日（05-24）排：己丑日 甲子时
c = BZ.buildChart({ name: "测试", gender: "男", y: 1990, m: 5, d: 23, hour: 23 });
assert.strictEqual(c.pillars.day.gz, "己丑", "晚子时换日 " + c.pillars.day.gz);
assert.strictEqual(c.pillars.hour.gz, "甲子", "己日子时 " + c.pillars.hour.gz);
console.log("✓ 向量3（晚子时换日）: 日柱", c.pillars.day.gz, "时柱", c.pillars.hour.gz);

// 时辰未知：三柱，时柱为 null
c = BZ.buildChart({ name: "测试", gender: "男", y: 1990, m: 5, d: 23, hour: null });
assert.strictEqual(c.pillars.hour, null);
assert.ok(c.bazi_text.includes("时辰不详"));
console.log("✓ 时辰未知：三柱排盘 OK");

// 十神全表（日干甲木）
const expect = ["比肩", "劫财", "食神", "伤官", "偏财", "正财", "七杀", "正官", "偏印", "正印"];
for (let i = 0; i < 10; i++) {
  assert.strictEqual(BZ.tenGod(0, i), expect[i], `甲日见${LY.STEMS[i]}`);
}
console.log("✓ 十神全表 OK（甲日十干）");

// 排盘文本冒烟
c = BZ.buildChart({ name: "李四", gender: "男", y: 1990, m: 5, d: 23, hour: 14, question: "" });
const text = c.bazi_text;
["【命主】李四（男，属马）", "【四柱】年柱 庚午", "【五行】", "【大运】顺行", "【流年参考】当前为丙午年"]
  .forEach((s) => assert.ok(text.includes(s), "文本缺少：" + s));
console.log("✓ 排盘文本 OK");
console.log("\n八字向量测试全部通过");
