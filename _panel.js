/* _panel.js —— 面板垃圾值扫描：随机局面下把每个被写入的元素都翻一遍，
   找 NaN / undefined / Infinity / null / [object Object] / "？" 这类用户能直接看到的脏字符串。
   （用户口径里的"界面异常" most commonly 就是这个：某个 label 在边界值上算出个 NaN。） */
const fs = require("fs"), vm = require("vm");
const js = fs.readFileSync("仙界闭关小能手.html", "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
function mkEl(id) {
  const e = { id, style: {}, dataset: {}, children: [], _cls: [], innerHTML: "", textContent: "", title: "", disabled: false, value: "", checked: false, scrollHeight: 0, scrollTop: 0, clientHeight: 100,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { e.children.push(c); return c; }, get firstChild() { return e.children[0] || null; },
    removeChild(c) { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); }, remove() {}, focus() {}, select() {}, addEventListener() {}, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 }) };
  return e;
}
const els = {}, store = {}, iv = [];
let NOW = 0;
const g = {
  console: { log() {}, warn() {}, error() {} }, Math, Date, JSON, String, Number, Object, Array, Boolean, parseInt, parseFloat, isFinite, isNaN, RegExp, Error,
  setTimeout: () => 0, clearTimeout() {}, setInterval: f => { iv.push(f); return iv.length; }, clearInterval() {},
  document: { getElementById: id => els[id] || (els[id] = mkEl(id)), querySelectorAll: () => [], createElement: () => mkEl("«临时»"), addEventListener() {}, body: mkEl("«body»") },
  window: { addEventListener() {} }, location: { reload() {} },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  performance: { now: () => NOW }
};
g.global = g; g.globalThis = g; vm.createContext(g);
vm.runInContext(js, g, { timeout: 60000 });
const D = g.window.__DBG, X = g.window.__XLLM, T = D.tables, S = D.state;

let seed = parseInt(process.argv[3] || "135790", 10);
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 100000) / 100000; };
const ri = n => Math.floor(rnd() * n);

function randomize(kind) {
  const edge = kind === "edge";
  S.realm = edge ? [0, 16, 11][ri(3)] : ri(17);
  S.layer = edge ? [1, 9][ri(2)] : 1 + ri(9);
  S.stone = edge ? [0, 1, 1e9][ri(3)] : Math.floor(Math.pow(10, rnd() * 14));
  S.exp = edge ? 0 : Math.floor(Math.pow(10, rnd() * 11));
  S.pts = ri(30); S.fame = edge ? 0 : Math.floor(Math.pow(10, rnd() * 8));
  S.karma = ri(2001) - 1000; S.luck = ri(50);
  S.sect = ri(6); S.contrib = ri(5000); S.contribAll = S.contrib + ri(15000);
  S.trib = ri(11); S.tribCd = ri(2) ? 0 : 4000; S.age = edge ? 0 : ri(500000); S.lifeBonus = ri(400);
  S.bodyPill = ri(6); S.surePill = ri(2) === 1;
  S.bld = edge ? { field: 0, garden: 0, cave: 0, room: ri(2), vault: 0, hall: 0 } : { field: ri(90), garden: ri(90), cave: ri(90), room: ri(90), vault: ri(90), hall: ri(90) };
  S.art = { lv: edge ? 0 : ri(13) }; S.bowl = { lv: edge ? 0 : ri(31) };
  S.caveCd = ri(2) ? 0 : 1800; S.cd = ri(2) ? 0 : 3;
  S.pill = { id: ri(2) ? null : "dao", left: ri(180) };
  S.beast = { lv: edge ? 0 : ri(27), evo: ri(2) }; S.tiger = { lv: edge ? 0 : ri(22), evo: ri(2) };
  S.tower = { depth: ri(40), best: ri(40), tok: ri(500), n: ri(80), cd: ri(2) ? 0 : 30, mod: "calm", shop: { pow: ri(51), cd: ri(11), luck: ri(21), heart: ri(11), frag: ri(37) } };
  S.tre = { lv: {}, aff: {}, refineN: ri(30), beat: {}, duelCd: ri(2) ? 0 : 60, sp: {}, forgeN: ri(80), winN: ri(11) };
  T.T_SLOTS.forEach(t => { S.tre.lv[t.id] = ri(22); if (rnd() < .6) S.tre.aff[t.id] = T.AFFIX[ri(T.AFFIX.length)].id; if (rnd() < .3) S.tre.sp[t.id] = 1; });
  S.asc = { rank: ri(8), ord: ri(37), incense: ri(30000), times: ri(5) };
  S.disc = { own: {}, m: {}, n: ri(30) };
  T.DISCIPLES.forEach(d => { if (rnd() < .6) { S.disc.own[d.id] = { q: ri(4), lv: 1 + ri(5) }; if (rnd() < .5) S.disc.m[d.id] = { left: ri(2) ? 0 : 600, job: d.job }; } });
  S.sk = { lv: {}, cd: {}, left: {}, n: ri(200) };
  T.SKILLS.forEach(x => { S.sk.lv[x.id] = ri(6); S.sk.cd[x.id] = ri(2) ? 0 : 400; if (rnd() < .3) S.sk.left[x.id] = ri(60); });
  S.dao = {}; T.DAOS.forEach(d => { S.dao[d.id] = ri(4); });
  S.comp = {}; T.COMPANIONS.forEach(c => { if (rnd() < .5) S.comp[c.id] = 1; });
  S.mkt = { t: ri(500), hold: {}, earned: ri(1e6), spent: ri(1e6) }; T.GOODS.forEach(x => { S.mkt.hold[x.id] = ri(10); });
  S.rec = {}; T.RECIPES.forEach(r2 => { if (rnd() < .6) S.rec[r2.id] = 1; });
  S.prestige = { blaze: ri(7), beckon: ri(7), guard: ri(7) };
  S.exch = { attr: ri(15), luck: ri(6), fame: ri(8) };
  S.itm = { charm: ri(4), pearl: ri(2), heal: ri(4), life: ri(6) }; S.pearl = ri(90);
  S.areas = T.AREAS.map((a, i) => i === 0 || rnd() < .4); S.area = 0; while (!S.areas[S.area]) S.area++;
  S.daily = { day: D.dayStamp(), signed: rnd() < .5, gathered: rnd() < .5, secretUsed: ri(5), lessons: [], lessonDone: {}, snap: null };
  S.week = { wk: "w", goals: [], done: {}, snap: {} };
  S.chap = { cur: ri(17), done: {}, life: ri(60), run: ri(17) };
  S.sq = { idx: ri(11) }; S.fate = { ids: [], n: ri(6) }; S.chapEternal = ri(20);
  S.attr = { spirit: ri(300), body: ri(300), soul: ri(300), heart: ri(300) };
  S.omen = { id: null, left: ri(2) ? 0 : 120, t: 600 };
  S.bless = { early: ri(4), bowl: ri(4), fate: ri(4) };
  D.ensureState();
  S.daily.lessons = D.pickLessons(S.daily.day);
}

const BAD = [/NaN/, /undefined/, /Infinity/, /\[object Object\]/, / null/, />null\b/, /\bnull 年/, /需 [，。]/, /\+\s*元?$/, /·\s*$/];
const seen = {};
const N = parseInt(process.argv[2] || "120", 10);
for (let pass = 0; pass < 2; pass++) {
  for (let i = 0; i < N; i++) {
    randomize(pass === 1 ? "edge" : "rand");
    try { D.updUI(); } catch (e) { console.log("FAIL updUI 抛错：" + e.message); process.exit(1); }
    Object.keys(els).forEach(id => {
      const e = els[id];
      const txt = String(e.textContent || "") + " " + String(e.innerHTML || "");
      BAD.forEach(re => {
        if (re.test(txt)) {
          const key = id + " «" + re.source + "» → " + txt.replace(/\s+/g, " ").slice(0, 76);
          seen[key] = (seen[key] || 0) + 1;
        }
      });
      /* 数值型标签出现"？"或空但按钮又没置灰，也算脏 */
      if (/^\s*·\s*$|需 ＄|需 $/.test(txt)) { const key = id + " «空尾» → " + txt.slice(0, 60); seen[key] = (seen[key] || 0) + 1; }
    });
  }
}
const keys = Object.keys(seen);
console.log("面板扫描：" + (N * 2) + " 组局面（随机 + 边界各 " + N + "），命中 " + keys.length + " 种可疑字符串");
keys.slice(0, 25).forEach(k => console.log("  · " + k + "  ×" + seen[k]));
console.log(keys.length ? "\n面板扫描：" + keys.length + " 种脏字符串" : "\n未发现脏字符串");
process.exit(keys.length ? 1 : 0);
