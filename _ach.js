/* _ach.js —— 成就可达性审计（第十件关卡）
   成就加到 132 条，此前已两次出现"数学上永远拿不到"的死成就（石台百层、四纹归一），
   都是靠人肉发现。这里改成机器证明：造一个"游戏自己能达到的最大状态"，
   把每条 check() 跑一遍；仍不成立的就打印谓词源码与它读的字段，逐条人工判定。
   跑法：node _ach.js          → 只报不可达
         node _ach.js -v      → 连每条成就读的字段一起打印
   边界：本关卡证明的是"谓词可满足"，不证明"那个状态玩得到"——
   上限本身可达（石台 36/38 那条天花板）由 _smoke.js 里用游戏自己的 power()/towerNeed() 反推的断言守着。 */
const fs = require("fs"), vm = require("vm");
const js = fs.readFileSync("仙界闭关小能手.html", "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
function mkEl(id) {
  const e = { id, style: {}, dataset: {}, children: [], _cls: new Set(), innerHTML: "", textContent: "", title: "", disabled: false, value: "", checked: false, scrollHeight: 0, scrollTop: 0, clientHeight: 100,
    classList: { add(c) { e._cls.add(c); }, remove(c) { e._cls.delete(c); }, toggle(c, f) { (f ? e._cls.add(c) : e._cls.delete(c)); }, contains: c => e._cls.has(c) },
    appendChild(c) { e.children.push(c); return c; }, get firstChild() { return e.children[0] || null; },
    removeChild(c) { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); }, remove() { }, focus() { }, select() { }, addEventListener() { }, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 }) };
  return e;
}
const els = {}, store = {}, iv = [];
const g = {
  console: { log() { }, warn() { }, error() { } }, Math, Date, JSON, String, Number, Object, Array, Boolean, parseInt, parseFloat, isFinite, isNaN, RegExp, Error,
  setTimeout: () => 0, clearTimeout() { }, setInterval: f => { iv.push(f); return iv.length; }, clearInterval() { },
  document: { getElementById: id => els[id] || (els[id] = mkEl(id)), querySelectorAll: () => [], createElement: () => mkEl("tmp"), addEventListener() { }, body: mkEl("body") },
  window: { addEventListener() { } }, location: { reload() { } },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  performance: { now: () => 0 }
};
g.global = g; g.globalThis = g; vm.createContext(g);
vm.runInContext(js, g, { timeout: 60000 });
const D = g.window.__DBG, T = D.tables, S = D.state;
/* 开局那份干净状态：前程表逐条验门槛时要从"什么都还没做"起步，
   否则 maxOut 后的 asc.rank>0 之类会让 goal-1 照样成立，把表误判成写错。 */
const PRISTINE = JSON.parse(JSON.stringify(S));
const VERB = process.argv.includes("-v");

/* ---------- 造一个"游戏自己能达到的最大状态" ---------- */
function maxOut() {
  S.realm = T.REALMS.length - 1; S.layer = 9;
  S.stone = 1e18; S.exp = 1e18; S.allStone = 1e18; S.allExp = 1e18; S.lifeExp = 1e18;
  S.fame = 1e6; S.luck = 999; S.karma = 9999; S.pts = 9999;
  S.attr = { spirit: 400, body: 400, soul: 400, heart: 400 };
  S.bld = {}; T.BLD.forEach(b => { S.bld[b.id] = 400; });
  S.areas = T.AREAS.map(() => true); S.area = T.AREAS.length - 1;
  S.sect = T.SECT.length - 1; S.contrib = 1e9; S.contribAll = 1e9;
  S.asc = { rank: T.GOD_RANKS.length, ord: T.ORDER_MAX, incense: 1e9, times: 9 };
  S.trib = T.TRIB.max; S.tribCd = 0;
  S.sk = { lv: {}, cd: {}, left: {}, n: 9999 }; T.SKILLS.forEach(x => { S.sk.lv[x.id] = T.SK_MAX; });
  S.dao = {}; T.DAOS.forEach(d => { S.dao[d.id] = 3; });
  S.comp = {}; T.COMPANIONS.forEach(c => { S.comp[c.id] = 1; });
  S.tre = { lv: {}, aff: {}, refineN: 999, beat: {}, duelCd: 0, winN: 999, sp: {}, forgeN: 999, stWin: {}, keN: 99 };
  T.T_SLOTS.forEach(t => { S.tre.lv[t.id] = T.TRE_MAX; S.tre.aff[t.id] = T.AFFIX[0].id; S.tre.sp[t.id] = 1; });
  T.DUELS.forEach(d => { S.tre.beat[d.n] = 1; });
  T.STANCES.forEach(x => { S.tre.stWin[x.id] = 9; });
  S.tower = { depth: 38, best: 38, tok: 9999, n: 999, cd: 0, mod: "calm", shop: { pow: 50, cd: 10, luck: 20, heart: 10, frag: 36 } };
  S.disc = { own: {}, m: {}, n: 99 };
  T.DISCIPLES.forEach(d => { S.disc.own[d.id] = { q: 3, lv: T.DLV_MAX }; });
  S.disc.ct = "dao"; S.disc.daoN = 99; S.disc.ctUsed = { rich: 1, fame: 1, dao: 1 };
  S.rec = {}; T.RECIPES.forEach(r => { S.rec[r.id] = 1; });
  S.prestige = { blaze: 6, beckon: 6, guard: 6 };
  S.exch = { attr: 99, luck: 99, fame: 99 };
  S.bless = { early: 4, bowl: 4, fate: 4 };
  S.fate = { ids: T.FATES.slice(0, T.FATE_MAX).map(x => x.id), n: 99 }; /* n 是跨世累计，不受 FATE_MAX 限 */
  S.itm = { charm: 9, pearl: 9, heal: 9, life: 9 }; S.pearl = 60;
  S.beast = { lv: 25, evo: 1 }; S.tiger = { lv: 20, evo: 1 };
  S.best = {}; T.BEASTS.forEach(b => { S.best[b.id] = 1; });
  S.art = { lv: 12 }; S.bowl = { lv: 30 };
  S.clicks = 9999; S.explores = 9999; S.breakN = 999; S.pills = 999; S.omenN = 99; S.demonN = 99; S.deadN = 99;
  S.caveN = 99; S.caveLeg = 4; S.caveCd = 0; S.evN = 999; S.lessonDays = 99; S.weekAll = 99;
  /* 深入三成就：抵达过顶格 / 收手满 5 次 / 累计 30 层（运行态留空，成就只认历史计数与 cave.max） */
  S.cave = { door: null, depth: 0, hs: 0, he: 0, risk: .5, hint: 0, max: T.DIG_MAX, lock: 0, plan: T.DIG_MAX };
  S.caveDig = 99; S.caveKeep = 99; S.caveFail = 99; S.caveLock = 99; S.cavePlan = 99; /* 罗盘与行程成就读这两个计数 */
  S.presetSeen = {}; (T.PRESETS || D.PRESETS || []).forEach(p => { S.presetSeen[p.id] = 1; }); S.presetLast = "gou";
  /* 自定套两条（存第一套 / 摆回 5 次）：成就只看计数，摆过「我的」也记进 presetSeen */
  S.presetSeen.mine = 1;
  S.presetMine = { on: 1, st: "flow", psy: "mid", plan: 3, ct: "rich" }; S.presetMineS = 9; S.presetMineA = 9;
  S.bodyPill = 5; S.surePill = true; S.lifeBonus = 9999;
  S.age = 36500 * 10000; /* 寿元按"日"计（1 秒 = 1 日）；混元境寿限 1e9 年，一万岁仍在限内 */
  S.rebirths = 99;
  S.chap = { cur: T.CHAPTERS.length - 1, done: {}, life: 999, run: T.CHAPTERS.length };
  T.CHAPTERS.forEach((c, i) => { S.chap.done[i] = { a: 1, b: 1 }; });
  S.chapEternal = 9; S.sq = { idx: T.SECT_QUESTS.length }; /* claimSectQuest 一路加到 length（"十项皆已功成"） */
  S.mkt = { t: 0, hold: {}, earned: 1e9, spent: 1, ask: {}, askN: 99 }; /* 净赚 = earned-spent，两笔都拉满会把差值抹平；askN = 挂单累计成交笔数 */ T.GOODS.forEach(x => { S.mkt.hold[x.id] = 9; S.mkt.ask[x.id] = Math.floor(x.base * 1.15); });
  S.rel = { fr: {} }; T.RELICS.forEach(r => { S.rel.fr[r.id] = 10; }); /* 成套 = 集齐 10 片 */
  S.daily = { day: D.dayStamp(), signed: true, gathered: true, secretUsed: 4, lessons: [], lessonDone: {}, snap: null };
  S.week = { wk: D.weekStamp(), goals: [], done: {}, snap: {} };
  S.sch = { id: "sword", x: {}, t: {}, cd: 0, swap: 9, keN: 9 }; T.SCHOOLS.forEach(s => { S.sch.t[s.id] = T.SCH_MAX; S.sch.x[s.id] = 999; });
  S.duelSt = "atk";
  S.stall = { id: T.TREASURES[0].id, ask: 5000, worth: 9000, seen: true, cd: 0, n: 99, bought: 99, good: 60, appN: 99, best: 1.9, net: 99999 };
  S.omen = { id: "tide", left: 60, t: 0 };
  S.pill = { id: "dao", left: 60 };
  S.quest = null; S.autoExp = true; S.chron = ["a", "b", "c"];
  D.ensureState();
}
/* 与"全正道"对偶的一档：邪道线（因果为负）与空手线 */
function altStates() {
  const list = [];
  maxOut();
  const dark = JSON.parse(JSON.stringify(S)); dark.karma = -9999; list.push(["邪道（因果极负）", dark]);
  const clean = JSON.parse(JSON.stringify(S));
  clean.realm = 0; clean.layer = 1; clean.asc = { rank: 0, ord: 0, incense: 0, times: 0 };
  clean.tower = { depth: 0, best: 0, tok: 0, n: 0, cd: 0, mod: "calm", shop: {} };
  list.push(["凡尘（境界/神界/石台归零）", clean]);
  const tide = JSON.parse(JSON.stringify(S)); tide.omen = { id: "demon", left: 60, t: 0 }; list.push(["魔劫天象", tide]);
  return list;
}
function fieldsOf(src) {
  const set = new Set();
  const re = /\bs\.([a-zA-Z_][\w]*)/g; let m;
  while ((m = re.exec(src))) set.add(m[1]);
  return Array.from(set);
}
maxOut();
const ACHS = T.ACHS;
const dead = [];
ACHS.forEach(a => {
  let ok = false;
  try { ok = !!a.check(S); } catch (e) { ok = "THROW " + e.message; }
  if (ok !== true) {
    /* 主状态不过，再试对偶档 */
    let rescued = null;
    altStates().forEach(([nm, st]) => {
      Object.keys(S).forEach(k => { delete S[k]; });
      Object.keys(st).forEach(k => { S[k] = st[k]; });
      D.ensureState();
      try { if (!!a.check(S) && !rescued) rescued = nm; } catch (e) { }
    });
    maxOut();
    if (!rescued) dead.push(a);
    else if (VERB) console.log("   △ " + a.name + " 需对偶档：" + rescued);
  }
});
console.log("成就总数 " + ACHS.length + "，最大态与对偶档都过不了的：" + dead.length + " 条");
dead.forEach(a => {
  const src = String(a.check);
  console.log("  ✗ " + a.name + "（" + a.desc + "）reward=" + a.reward);
  console.log("     谓词: " + src.replace(/\s+/g, " ").slice(0, 150));
  console.log("     读字段: " + fieldsOf(src).join(","));
});
/* 奖励总额也顺手看一眼：成就奖励是纯发放，异常大的单条会悄悄改曲线 */
const big = ACHS.filter(a => a.reward > 5000).sort((x, y) => y.reward - x.reward);
console.log("单条奖励 >5000 灵石的成就：" + big.map(a => a.name + "=" + a.reward).join(" ｜ "));

/* ---------- 前程表（ACH_PROG）与真门槛必须同生共死 ----------
   那张表是给玩家看"还差多少"的。它一旦和 check() 的门槛错开，界面就骗人——
   不崩、不报错、冒烟也全绿，只有数字对不上。所以逐条三段验证（都从开局干净状态起）：
     ① 没写过时 check 必须不成立（否则这条一开局就该点亮，表与游戏都在骗人）；
     ② 写到 goal   时 check 必须成立，且读数 >= goal；
     ③ 写到 goal-1 时 check 必须不成立，且读数 <  goal。
   ②③ 一起就证明了"表里那个数"和"谓词真正卡的那道"是同一道线：门槛改了而表没跟上，当场红。 */
const PRE = T.ACH_PROG;
const progBad = [];
if (!Array.isArray(PRE) || !PRE.length) progBad.push("ACH_PROG 没经 tables 桥导出");
else {
  const byId = {}; ACHS.forEach(a => { byId[a.id] = a; });
  const seenId = {};
  const fresh = () => { Object.keys(S).forEach(k => { delete S[k]; }); const p = JSON.parse(JSON.stringify(PRISTINE)); Object.keys(p).forEach(k => { S[k] = p[k]; }); D.ensureState(); };
  let meas = 0;
  PRE.forEach(e => {
    const a = byId[e.id];
    if (!a) { progBad.push((e.id || "?") + "：ACHS 里没有这条成就"); return; }
    if (seenId[e.id]) { progBad.push(e.id + "：表里出现两次"); return; }
    seenId[e.id] = 1;
    if (!e.lab || !(e.goal > 0)) { progBad.push(e.id + "：缺 lab 或 goal 不是正数"); return; }
    /* 两种写法二选一：p 是"点路径"（读写都由 pGet/pSet 负责，不必再给 set），
       复合成就才自己给 n+set。两种混着写（给了 p 又给 set）一律算声明错。 */
    const shape = e.p ? (typeof e.p === "string" && !e.n && !e.set) : (typeof e.n === "function" && typeof e.set === "function");
    if (!shape) { progBad.push(e.id + "：读写声明不完整（要么只给 p，要么给 n+set）"); return; }
    let r0, rg, rb, nowG, nowB, err = "";
    try {
      fresh(); r0 = !!a.check(S);
      fresh(); D.progWrite(e, S, e.goal); rg = !!a.check(S); nowG = D.progOf(e, S);
      fresh(); D.progWrite(e, S, e.goal - 1); rb = !!a.check(S); nowB = D.progOf(e, S);
    } catch (x) { err = x.message; }
    if (err) { progBad.push(e.id + "：验证抛错 " + err); return; }
    if (r0) progBad.push(e.id + "：开局未写就已成立（表不该收这条）");
    if (!rg) progBad.push(e.id + "：写到 goal=" + e.goal + " 仍不成立（表与门槛不一致）");
    if (rb) progBad.push(e.id + "：写到 goal-1=" + (e.goal - 1) + " 竟已成立（门槛比表说的低）");
    if (!(nowG >= e.goal)) progBad.push(e.id + "：读数在 goal 处只有 " + nowG + "（读写不同源）");
    if (!(nowB < e.goal)) progBad.push(e.id + "：读数在 goal-1 处已有 " + nowB + "（读数虚高）");
    if (!r0 && rg && !rb && nowG >= e.goal && nowB < e.goal) meas++;
  });
  maxOut();
  const lit = ACHS.length;
  console.log("前程表：条目 " + PRE.length + " / 验过 " + meas + " / 成就总数 " + lit + "（可量化覆盖率 " + Math.round(PRE.length / lit * 100) + "%，其余界面只字不提，汇总行写成「可追 N 项」）");
}
console.log(progBad.length ? "前程表与门槛不一致 " + progBad.length + " 处：\n  - " + progBad.join("\n  - ") : "前程表逐条与真门槛对齐（goal 成立 / goal-1 不成立）");
process.exit((dead.length || progBad.length) ? 1 : 0);
