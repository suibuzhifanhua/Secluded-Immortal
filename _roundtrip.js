/* _roundtrip.js —— 存档往返保真 + 老档/坏档兼容矩阵
   A. 真跑一段游戏拿到"有内容的存档"，save() 后在**第二个沙箱**里用真实启动路径读回来，逐字段比对
      （第二个沙箱很关键：只有走完整 init 才能暴露"存了没读回"的字段）。
   B. 对每个顶层字段做一次"老档里没有它"的注入，确认不抛错且被回填。
   C. 若干畸形档（null / 字符串 / 数组短一截 / 极端数值）。 */
const fs = require("fs"), vm = require("vm");
const js = fs.readFileSync("仙界闭关小能手.html", "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
const KEY = "jxp_save_v1";

function mkEl() {
  const e = { style: {}, dataset: {}, children: [], innerHTML: "", textContent: "", disabled: false, value: "", checked: false, scrollHeight: 0, scrollTop: 0, clientHeight: 100,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { e.children.push(c); return c; }, get firstChild() { return e.children[0] || null; },
    removeChild(c) { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); }, remove() {}, focus() {}, select() {}, addEventListener() {}, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 }) };
  return e;
}
/* seed = 预置 localStorage 内容（对象或字符串）；返回沙箱与 __DBG/__XLLM */
function boot(seed) {
  const els = {}, store = {}, iv = [];
  let NOW = 0;
  if (seed) store[KEY] = typeof seed === "string" ? seed : JSON.stringify(seed);
  const g = {
    console: { log() {}, warn() {}, error() {} }, Math, Date, JSON, String, Number, Object, Array, Boolean, parseInt, parseFloat, isFinite, isNaN, RegExp, Error, Infinity, NaN,
    setTimeout: () => 0, clearTimeout() {}, setInterval: f => { iv.push(f); return iv.length; }, clearInterval() {},
    document: { getElementById: id => els[id] || (els[id] = mkEl()), querySelectorAll: () => [], createElement: mkEl, addEventListener() {}, body: mkEl() },
    window: { addEventListener() {} }, location: { reload() {} },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    performance: { now: () => NOW }
  };
  g.global = g; g.globalThis = g;
  vm.createContext(g);
  const err = [];
  try { vm.runInContext(js, g, { timeout: 60000 }); } catch (e) { err.push(String((e && e.stack) || e)); }
  return { g, D: g.window.__DBG, X: g.window.__XLLM, store, iv, els, bump(ms) { NOW += ms; iv.forEach(f => { try { f(); } catch (e) { err.push(String(e.message)); } }); }, err };
}

/* ---------- A. 往返保真 ---------- */
const a = boot();
const S = a.D.state, X = a.X;
S.name = "贺平生";
for (let i = 0; i < 1500; i++) { const d = X.ruleAction(); X.execDecision(d, "规则"); a.bump(5000); }
a.D.save();
const savedRaw = a.store[KEY];
if (!savedRaw) { console.log("FAIL A0  save() 没写出任何存档"); process.exit(1); }
const b = boot(savedRaw);
if (b.err.length) { console.log("FAIL A1  读回自己写的存档时抛错：" + b.err[0]); BAD++; }
const live = JSON.parse(JSON.stringify(S));
const back = JSON.parse(JSON.stringify(b.D.state));
let BAD = 0; /* 任何一项回归都让工具非零退出，这样它能当常驻关卡用 */
const diffs = [];
const walk = (p, x, y) => {
  if (x === y) return;
  if (x === null || y === null || typeof x !== "object" || typeof y !== "object") { diffs.push(p + "  " + JSON.stringify(x) + " → " + JSON.stringify(y)); return; }
  const ks = new Set(Object.keys(x).concat(Object.keys(y)));
  ks.forEach(k => walk(p ? p + "." + k : k, x[k], y[k]));
};
walk("", live, back);
console.log("A. 往返保真：存档 " + (savedRaw.length / 1024).toFixed(1) + "KB，字段差异 " + diffs.length + " 处");
diffs.slice(0, 30).forEach(d => console.log("   · " + d));
/* 唯一允许的差异是 last（写入时刻的时间戳）；其余任何字段丢读回都算回归 */
const real = diffs.filter(d => !/^last\s/.test(d));
if (real.length) { console.log("   FAIL A2  有 " + real.length + " 个字段没能原样读回"); BAD += real.length; }

/* ---------- B. 老档：逐个删掉一个顶层字段 ---------- */
const full = JSON.parse(savedRaw);
const missing = [], notFixed = [];
Object.keys(full).forEach(k => {
  const o = JSON.parse(savedRaw); delete o[k];
  const t = boot(o);
  if (t.err.length) { missing.push(k + "（抛错 " + t.err[0].slice(0, 40) + "）"); return; }
  const v = t.D.state[k];
  if (v === undefined) notFixed.push(k + "（无回填，仍 undefined）");
  /* 数组字段的回填判据：要么原样长回来（areas 这类由数据表重建的），要么退回"空骨架"
     （chron 这类玩出来的历史，删掉后本来就只能给 []）。
     第 30 轮起 chooseSchool 会写 chron，于是"删 chron → 长度必等"成了假阳性。 */
  else if (Array.isArray(full[k]) && v.length !== full[k].length && v.length !== 0) notFixed.push(k + "（数组长度 " + v.length + " ≠ " + full[k].length + "）");
});
console.log("B. 老档缺字段：" + Object.keys(full).length + " 项注入 → 抛错 " + missing.length + " 项，未正确回填 " + notFixed.length + " 项");
if (missing.length + notFixed.length) { console.log("   FAIL B  有老档注入未通过"); BAD += missing.length + notFixed.length; }
missing.slice(0, 12).forEach(x => console.log("   ! " + x));
notFixed.slice(0, 12).forEach(x => console.log("   ? " + x));

/* ---------- C. 畸形档 ---------- */
const weird = [
  ["极简祖档", { name: "古", realm: 0 }],
  ["全 null 子系统", Object.assign(JSON.parse(savedRaw), { sk: null, tre: null, disc: null, tower: null, asc: null, mkt: null, dao: null, comp: null, daily: null, week: null, chap: null, areas: null, fate: null, omen: null, exch: null, prestige: null })],
  ["字段类型错乱", Object.assign(JSON.parse(savedRaw), { sk: "字符串", areas: "字符串", disc: 42, tower: [], chron: "不是数组", sch: "字符串" })],
  ["areas 短一截", Object.assign(JSON.parse(savedRaw), { areas: [true, true] })],
  ["areas 全 false", Object.assign(JSON.parse(savedRaw), { areas: new Array(10).fill(false), area: 7 })],
  ["极端数值", Object.assign(JSON.parse(savedRaw), { stone: 1e308, exp: -1, realm: 99, layer: 99, age: 1e12 })],
  ["空存档 {}", {}],
];
console.log("\n=========");
weird.forEach(([label, seed]) => {
  const t = boot(seed);
  let loopErr = "";
  try { for (let i = 0; i < 60; i++) { t.D.act.cultivate(); t.D.act.explore(); t.bump(1000); } } catch (e) { loopErr = " 主循环抛错 " + e.message; }
  const s = t.D && t.D.state;
  const lbl = !t.D ? "?" : (function () { try { return t.D.realmLabel(); } catch (e) { return "realmLabel 抛错 " + e.message; } })();
  if (t.err.length) BAD++;
  else if (loopErr) { console.log("   FAIL C  " + label + " 启动没崩但主循环崩了"); BAD++; }
  console.log("C. " + label + "：" + (t.err.length ? "启动抛错 → " + t.err[0].split("\n").slice(0, 8).join(" ⏎ ") : "启动 OK，area=" + (s && s.area) + " 境界=" + lbl + (s && s.areas ? " 道场数=" + s.areas.filter(Boolean).length : "")) + loopErr);
});

console.log(BAD ? "\n存档审计：" + BAD + " 项回归" : "\n存档审计：全部通过");
process.exit(BAD ? 1 : 0);
