/* Node 端一致性测试：static/engine.js 输出必须与 Python 引擎生成的向量逐字段一致。
 * 运行：先生成向量 python3 tests/gen_vectors.py，再 node tests/test_engine.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

require(path.join(__dirname, "..", "static", "engine.js"));
const LY = globalThis.LiuYao;

const VAL2THROW = { 6: ["字", "字", "字"], 7: ["背", "字", "字"], 8: ["背", "背", "字"], 9: ["背", "背", "背"] };
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, "vectors.json"), "utf-8"));

let n = 0;
for (const v of vectors) {
  const throws = v.values.map((x) => VAL2THROW[x].slice());
  const dt = { y: v.dt[0], m: v.dt[1], d: v.dt[2], h: v.dt[3], min: v.dt[4] };
  const pan = v.mode === "three" ? LY.buildTriPan(throws, dt, v.tz) : LY.buildPan(throws, dt, v.tz);
  assert.deepStrictEqual(pan, v.pan, `pan mismatch @ ${v.mode} ${v.values} ${v.dt} tz=${v.tz}`);
  assert.strictEqual(LY.panText(pan), v.text, `panText mismatch @ ${v.values} ${v.dt}`);
  n++;
}
console.log(`OK: ${n} 组向量全部一致（含排盘 JSON 与排盘文本）`);
