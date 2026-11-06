/* _offline.js —— 离线结算与在线等价性审计
   挂机游戏的钱是两条路赚出来的：前台 tick() 每秒全额、后台/重开走 offline(dt) 打折。
   两边各写一遍倍率，早晚会飘（道场倍率漏一次就是十倍的损失），所以这里比对的是：
   1) 同一局面同样时长，离线收益 / 在线收益 必须恒等于 offEff()（倍率栈共用，不是各写一遍）
   2) 每一个计时器字段，离线推进后的值必须等于在线推进后的值
   3) 后台标签页被浏览器限流成"每分钟一次 tick"时，日/周重置与支线时限照常兑现
   4) offCap 封顶、dt<10 起算线、NaN/负数 dt 不许污染存档 */
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
const D = g.window.__DBG, T = D.tables, S = D.state;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log("FAIL  " + msg); }
}
function near(a, b, rel, msg) {
  const d = Math.abs(a - b) / (Math.abs(b) || 1);
  if (d <= rel) { pass++; return true; }
  fail++; console.log("FAIL  " + msg + "（实得 " + a + "，应为 " + b + "，相对偏差 " + d.toExponential(2) + "）");
  return false;
}

let seed = parseInt(process.argv[2] || "24681", 10);
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 100000) / 100000; };
const ri = n => Math.floor(rnd() * n);

function randomize() {
  S.realm = ri(17); S.layer = 1 + ri(9);
  S.stone = Math.pow(10, rnd() * 13); S.exp = Math.pow(10, rnd() * 10);
  S.pts = ri(30); S.fame = Math.pow(10, rnd() * 8);
  S.karma = ri(2001) - 1000; S.luck = ri(50);
  S.sect = ri(6); S.contrib = ri(5000); S.contribAll = S.contrib + ri(15000);
  S.trib = ri(11); S.tribCd = ri(2) ? 0 : 4000; S.age = 0; S.lifeBonus = ri(400);
  S.bld = { field: 1 + ri(90), garden: 1 + ri(90), cave: 1 + ri(90), room: 1 + ri(90), vault: ri(90), hall: ri(90) };
  S.art = { lv: ri(13) }; S.bowl = { lv: ri(31) };
  S.caveCd = ri(1800); S.cd = ri(3);
  S.pill = { id: "dao", left: ri(180) };
  S.beast = { lv: ri(27), evo: ri(2) }; S.tiger = { lv: ri(22), evo: ri(2) };
  S.tower = { depth: ri(40), best: ri(40), tok: ri(500), n: ri(80), cd: ri(30), mod: "calm", shop: { pow: ri(51), cd: ri(11), luck: ri(21), heart: ri(11), frag: ri(37) } };
  S.tre = { lv: {}, aff: {}, refineN: ri(30), beat: {}, duelCd: ri(60), sp: {}, forgeN: ri(80), winN: ri(11) };
  T.T_SLOTS.forEach(t => { S.tre.lv[t.id] = ri(22); if (rnd() < .6) S.tre.aff[t.id] = T.AFFIX[ri(T.AFFIX.length)].id; if (rnd() < .3) S.tre.sp[t.id] = 1; });
  S.asc = { rank: ri(8), ord: ri(37), incense: ri(30000), times: ri(5) };
  S.disc = { own: {}, m: {}, n: ri(30) };
  T.DISCIPLES.forEach(d => { if (rnd() < .6) { S.disc.own[d.id] = { q: ri(4), lv: 1 + ri(5) }; if (rnd() < .5) S.disc.m[d.id] = { left: ri(900), job: d.job }; } });
  S.sk = { lv: {}, cd: {}, left: {}, n: ri(200) };
  T.SKILLS.forEach(x => { S.sk.lv[x.id] = 1 + ri(5); S.sk.cd[x.id] = ri(400); if (rnd() < .5) S.sk.left[x.id] = ri(120); });
  S.dao = {}; T.DAOS.forEach(d => { S.dao[d.id] = ri(4); });
  S.comp = {}; T.COMPANIONS.forEach(c => { if (rnd() < .5) S.comp[c.id] = 1; });
  S.mkt = { t: ri(500), hold: {}, earned: ri(1e6), spent: ri(1e6) }; T.GOODS.forEach(x => { S.mkt.hold[x.id] = ri(10); });
  S.rec = {}; T.RECIPES.forEach(r2 => { if (rnd() < .6) S.rec[r2.id] = 1; });
  S.prestige = { blaze: ri(7), beckon: ri(7), guard: ri(7) };
  S.exch = { attr: ri(15), luck: ri(6), fame: ri(8) };
  S.itm = { charm: ri(4), pearl: ri(2), heal: ri(4), life: ri(6) }; S.pearl = ri(90);
  S.areas = T.AREAS.map((a, i) => i === 0 || rnd() < .5); S.area = 0; while (!S.areas[S.area]) S.area++;
  S.daily = { day: D.dayStamp(), signed: true, gathered: true, secretUsed: 0, lessons: [], lessonDone: {}, snap: null };
  S.week = { wk: D.weekStamp(), goals: [], done: {}, snap: {} };
  S.chap = { cur: 0, done: {}, life: ri(60), run: ri(17) };
  S.sq = { idx: ri(11) }; S.fate = { ids: [], n: ri(6) }; S.chapEternal = ri(20);
  S.attr = { spirit: ri(300), body: ri(300), soul: ri(300), heart: ri(300) };
  S.omen = { id: null, left: 0, t: 600 };
  S.bless = { early: ri(4), bowl: ri(4), fate: ri(4) };
  S.quest = null; S.autoExp = false;
  D.ensureState();
}

const snap = () => JSON.stringify(S);
function restore(str) {
  const o = JSON.parse(str);
  Object.keys(S).forEach(k => { delete S[k]; });
  Object.keys(o).forEach(k => { S[k] = o[k]; });
}

/* 定位 tick：init 里第一个 setInterval 就是它（助手轮询未启动，iv 只有 tick/save） */
let tick = null;
{
  S.bld.field = 5; S.bld.garden = 5; S.pearl = 0; S.autoExp = false;
  for (const f of iv) {
    const before = S.allStone;
    NOW += 2000;
    try { f(); } catch (e) {}
    if (S.allStone > before) { tick = f; break; }
  }
}
if (!tick) { console.log("FAIL  没能从 setInterval 里认出 tick（测试脚手架失效，结论不可信）"); process.exit(1); }

/* ---------- 1. 收益等价：离线/在线比值必须恒为 offEff ---------- */
{
  let worst = 0, cases = 0;
  for (let i = 0; i < 24; i++) {
    randomize();
    /* 把倍率栈全部点满：道场、天象、神通、聚灵珠、丹药、遗宝、纹、共鸣、命途、轮回祝福、红颜 */
    S.areas = T.AREAS.map(() => true); S.area = T.AREAS.length - 1;
    S.pearl = 1e6; S.pill = { id: "dao", left: 1e6 };
    T.SKILLS.forEach(x => { S.sk.lv[x.id] = T.SK_MAX; S.sk.left[x.id] = 1e6; S.sk.cd[x.id] = 0; });
    const om = T.OMENS[ri(T.OMENS.length)];
    S.omen = { id: om.id, left: 1e6, t: 0 };
    S.trib = 10; S.asc.ord = T.ORDER_MAX; S.asc.rank = 8;
    S.comp.su = 1; /* 离线效率 +10%：这条正是"50%"硬编码会撒谎的地方 */
    S.bless.early = 3;
    const dt = 300, eff = D.offEff(), sr = D.stoneRate(), er = D.expRate();
    if (!(sr > 0 && er > 0)) continue;
    const s0 = snap();
    /* 在线：3 秒一步走满 dt */
    const as0 = S.allStone, ae0 = S.allExp;
    for (let k = 0; k < dt / 3; k++) { NOW += 3000; tick(); }
    const onS = S.allStone - as0, onE = S.allExp - ae0;
    /* 离线：一次性结算同一局面 */
    restore(s0);
    const bs0 = S.allStone, be0 = S.allExp;
    const r = D.offline(dt);
    const offS = S.allStone - bs0, offE = S.allExp - be0;
    ok(!!r, "#" + i + " offline(300) 应有结算");
    near(offS, sr * dt * eff, 1e-9, "#" + i + " 离线灵石 = stoneRate×dt×offEff（倍率栈必须与在线同一份）");
    near(offE, er * dt * eff, 1e-9, "#" + i + " 离线修为 = expRate×dt×offEff");
    near(onS, sr * dt, 1e-6, "#" + i + " 在线灵石 = stoneRate×dt（全额）");
    near(onE, er * dt, 1e-6, "#" + i + " 在线修为 = expRate×dt（全额）");
    const ratio = offS / onS;
    worst = Math.max(worst, Math.abs(ratio - eff)); cases++;
  }
  ok(cases > 15 && worst < 1e-6, "24 组满倍率局面下 离线/在线 比值与 offEff 最大偏离 " + worst.toExponential(2) + "（<1e-6）");
  console.log("收益等价：比对 " + cases + " 组满倍率局面，离线/在线比值恒为 offEff=" + D.offEff());
}

/* ---------- 2. 计时器簿记：离线推进后每个计时器必须与在线一致 ---------- */
function timers(str) {
  const s = JSON.parse(str), out = {};
  out.cd = s.cd; out.caveCd = s.caveCd; out.tribCd = s.tribCd; out.pearl = s.pearl;
  out["mkt.t"] = s.mkt.t; out.age = s.age; out["pill.left"] = s.pill.left;
  out["tre.duelCd"] = s.tre.duelCd; out["tower.cd"] = s.tower.cd;
  out["sch.cd"] = (s.sch && s.sch.cd) || 0;      /* 改换门庭的静养 */
  out["stall.cd"] = (s.stall && s.stall.cd) || 0; /* 万宝楼卸货 */
  Object.keys(s.sk.cd || {}).forEach(k => out["sk.cd." + k] = s.sk.cd[k]);
  Object.keys(s.sk.left || {}).forEach(k => out["sk.left." + k] = s.sk.left[k]);
  Object.keys(s.disc.m || {}).forEach(k => out["disc." + k] = s.disc.m[k] ? s.disc.m[k].left : 0);
  return out;
}
{
  const diff = {}, seenKeys = {};
  for (let i = 0; i < 12; i++) {
    randomize();
    const dt = 600, s0 = snap();
    for (let k = 0; k < dt / 3; k++) { NOW += 3000; tick(); }
    const on = timers(snap());
    restore(s0);
    const off = (D.offline(dt), timers(snap()));
    const base = timers(s0);
    Object.keys(base).forEach(key => {
      seenKeys[key.replace(/\.\d+$/, ".").replace(/#.*$/, "#")] = 1;
      /* 在线路径推进了但离线路径一动不变，才是真不一致；两边都归零的钳位要一致 */
      const advOn = Math.abs((base[key] || 0) - (on[key] || 0)) > 1e-9;
      const advOff = Math.abs((base[key] || 0) - (off[key] || 0)) > 1e-9;
      if (advOn && !advOff) {
        const k2 = key.replace(/(sk\.cd\.|sk\.left\.|disc\.)[a-z0-9_]+/i, "$1*");
        if (!diff[k2]) diff[k2] = "#" + i + " " + key + "：在线 " + base[key] + "→" + on[key] + "，离线 " + base[key] + "→" + off[key];
      }
      if (advOn && advOff && Math.abs((on[key] || 0) - (off[key] || 0)) > 1e-6) {
        const k3 = key.replace(/(sk\.cd\.|sk\.left\.|disc\.)[a-z0-9_]+/i, "$1*") + " 终值不符";
        if (!diff[k3]) diff[k3] = "#" + i + " " + key + "：在线走到 " + on[key] + "，离线走到 " + off[key];
      }
    });
  }
  const bad = Object.keys(diff);
  ok(bad.length === 0, "离线/在线计时器簿记一致（比对 " + Object.keys(seenKeys).length + " 类字段）" + (bad.length ? "：" + bad.map(k => k + " → " + diff[k]).join(" ; ") : ""));
}

/* ---------- 3. 后台标签页限流：每分钟一次的 tick 也必须兑现日/周重置与支线时限 ---------- */
{
  randomize();
  S.week = { wk: "__stale__", goals: [], done: {}, snap: {} };
  S.daily.day = "1970-01-01";
  S.quest = { name: "测试支线", res: "exp", baseAll: 0, target: 1e12, reward: {}, deadline: Date.now() - 1 };
  for (let k = 0; k < 6; k++) { NOW += 60000; tick(); } /* 浏览器后台节流后的真实节奏 */
  ok(S.week && S.week.wk !== "__stale__", "后台限流（60s/次）时「道业三愿」仍会换周（否则一周奖励整周白丢）");
  ok(S.quest === null, "后台限流（60s/次）时过期支线仍会被清除（否则支线槽被永久占住）");
  ok(S.daily.day !== "1970-01-01", "后台限流（60s/次）时每日签到位仍会翻页");
  console.log("后台限流：week=" + JSON.stringify(S.week && S.week.wk) + " quest=" + (S.quest ? "仍占位" : "已清") + " daily.day=" + JSON.stringify(S.daily.day));
}

/* ---------- 4. 边界：封顶、起算线、坏 dt ---------- */
{
  randomize();
  const s0 = snap();
  const r = D.offline(D.offCap() + 40000);
  ok(r && Math.abs(r.dt - D.offCap()) < 1e-9, "离线收益按 offCap 封顶（请求 " + (D.offCap() + 40000) + "s，实结 " + (r && r.dt) + "s）");
  ok(S.age === JSON.parse(s0).age + D.offCap(), "寿元同样只按封顶后的时长流逝，不许多扣");
  restore(s0);
  ok(D.offline(9) === null, "不足 10 秒不结算");
  ok(S.stone === JSON.parse(s0).stone, "不结算时一分不进");
  restore(s0);
  const stone0 = S.stone;
  const bad = D.offline(NaN);
  ok(bad === null || bad === undefined, "dt=NaN 必须被拒（否则整条存档被 NaN 污染）｜实返回 " + JSON.stringify(bad));
  ok(isFinite(S.stone) && isFinite(S.exp) && isFinite(S.age), "dt=NaN 之后 灵石/修为/寿元 仍是有限数（实际 stone=" + S.stone + "）");
  restore(s0);
  const neg = D.offline(-100);
  ok(neg === null || neg === undefined, "dt<0（系统时钟回拨 / 存档时间比现在晚）必须被拒｜实返回 " + JSON.stringify(neg));
  ok(isFinite(S.stone) && S.stone === JSON.parse(s0).stone, "时钟回拨不得倒扣灵石");
  restore(s0);
}

console.log("\n=== 离线结算审计: " + pass + " 通过, " + fail + " 失败 ===");
process.exit(fail ? 1 : 0);
