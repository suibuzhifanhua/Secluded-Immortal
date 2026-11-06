/* 渲染耗时实测（第十二件关卡）：前程一节每刷一帧要扫全表，先量一下它到底值不值得改。
   不猜：同一台机器、同一份桩件，跑 2000 帧 updUI 计时。
   阈值 1.00 ms/帧 是预算线——游戏 1 秒刷 ~10 帧，超过这条就等于渲染在吃 CPU 的一成，
   新增卡片若让单帧过线，当场红（第 45 轮实测：改前 0.240，一帧扫三遍表；改后 0.207）。 */
const fs = require("fs"), vm = require("vm");
const js = fs.readFileSync("仙界闭关小能手.html", "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
function mkEl() {
  const e = { style: {}, dataset: {}, children: [], _cls: new Set(), innerHTML: "", textContent: "", title: "", disabled: false, value: "", checked: false, scrollHeight: 0, scrollTop: 0, clientHeight: 100,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild(c) { e.children.push(c); return c; }, get firstChild() { return e.children[0] || null; },
    removeChild() { }, remove() { }, focus() { }, select() { }, addEventListener() { }, querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 }) };
  return e;
}
const els = {}, store = {};
const g = { console: { log() {}, warn() {}, error() {} }, Math, Date, JSON, String, Number, Object, Array, Boolean, parseInt, parseFloat, isFinite, isNaN, RegExp, Error, Intl,
  setTimeout: () => 0, clearTimeout() { }, setInterval: () => 0, clearInterval() { },
  document: { getElementById: id => els[id] || (els[id] = mkEl()), querySelectorAll: () => [], createElement: mkEl, addEventListener() { }, body: mkEl() },
  window: { addEventListener() { } }, location: { reload() { } }, localStorage: { getItem: () => null, setItem() { }, removeItem() { } }, performance: { now: () => Date.now() } };
g.global = g; g.globalThis = g; vm.createContext(g);
vm.runInContext(js, g, { timeout: 60000 });
const D = g.window.__DBG;
D.act.cultivate(); D.updUI();
const N = 2000;
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) D.updUI();
const t1 = process.hrtime.bigint();
console.log("updUI × " + N + " = " + (Number(t1 - t0) / 1e6).toFixed(1) + " ms（每帧 " + (Number(t1 - t0) / 1e6 / N).toFixed(3) + " ms）");
const t2 = process.hrtime.bigint();
for (let i = 0; i < N; i++) D.goalProg();
const t3 = process.hrtime.bigint();
const perFrame = Number(t1 - t0) / 1e6 / N;
console.log("goalProg × " + N + " = " + (Number(t3 - t2) / 1e6).toFixed(1) + " ms（单次 " + (Number(t3 - t2) / 1e3 / N).toFixed(1) + " µs）");
const BUDGET = 1.0;
if (perFrame > BUDGET) { console.log("FAIL  单帧渲染 " + perFrame.toFixed(3) + " ms 超预算 " + BUDGET + " ms——查是不是新增的卡片在同一帧里重复扫表"); process.exit(1); }
console.log("渲染预算：单帧 " + perFrame.toFixed(3) + " ms ≤ " + BUDGET + " ms ✓");
