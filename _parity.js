/* _parity.js —— avail/游戏守卫一致性模糊测试
   对随机局面：凡 availableActions() 判 true 的动作，快照状态后真调用一次；
   状态毫无变化 = 该动作被游戏侧拒了（助手以为能做 → 空转决策）。
   这类"avail 与守卫不齐"的坑本轮已手抓到两次（duel 境界门槛、towerBuy 上限），故做成工具。 */
const fs = require("fs"), vm = require("vm");
const js = fs.readFileSync("仙界闭关小能手.html", "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
function mkEl() {
  const e = { style: {}, dataset: {}, children: [], _cls: [], innerHTML: "", textContent: "", title: "", disabled: false, value: "", checked: false, scrollHeight: 0, scrollTop: 0, clientHeight: 100,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { e.children.push(c); return c; }, get firstChild() { return e.children[0] || null; },
    removeChild(c) { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); }, remove() {}, focus() {}, select() {}, addEventListener() {}, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 }) };
  return e;
}
const els = {}, store = {};
let NOW = 0;
const g = {
  console, Math, Date, JSON, String, Number, Object, Array, Boolean, parseInt, parseFloat, isFinite, RegExp, Error, isNaN,
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  document: { getElementById: id => els[id] || (els[id] = mkEl()), querySelectorAll: () => [], createElement: mkEl, addEventListener() {}, body: mkEl() },
  window: { addEventListener() {} }, location: { reload() {} },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  performance: { now: () => NOW }
};
g.global = g; g.globalThis = g;
vm.createContext(g);
vm.runInContext(js, g, { timeout: 60000 });
const D = g.window.__DBG, X = g.window.__XLLM, T = D.tables, S = D.state;

let seed = parseInt(process.argv[3] || "20261028", 10);
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 100000) / 100000; };
const ri = n => Math.floor(rnd() * n);

const CALL = {
  cultivate: () => D.act.cultivate(), explore: () => D.act.explore(), break: () => D.act.break(),
  buy: t => D.act.buy(t), attr: t => D.act.attr(t), signin: () => D.act.signIn(),
  secret: t => D.act.secretRun(t), gather: () => D.act.gather(), pill: t => D.act.pill(t),
  feed: t => D.act.feed(t), art: () => D.act.art(), cave: t => D.act.cave(t), bowl: () => D.act.bowl(),
  item: t => D.act.item(t), trade: t => D.act.trade(t), prestige: t => D.act.prestige(t),
  evolve: t => D.act.evolve(t), sectquest: () => D.act.sectQuest(), dao: t => D.act.dao(t),
  school: t => D.act.school(t), schoolup: t => D.act.schoolup(t),
  stall: () => D.act.stall(), stallapp: () => D.act.stallapp(), stallbuy: () => D.act.stallbuy(),
  dig: () => D.act.dig(), digkeep: () => D.act.digkeep(),
  companion: t => D.act.companion(t), skill: t => D.act.skill(t), skillup: t => D.act.skillUp(t),
  forge: t => D.act.forge(t), refine: t => D.act.refine(t), duel: t => D.act.duel(+t),
  tower: () => D.act.tower(), towerbuy: t => D.act.towerBuy(t), ascend: () => D.act.ascend(),
  lesson: t => D.act.lesson(+t), awaken: t => D.act.awaken(t), disc: t => D.act.disc(t),
  errand: t => D.act.errand(t, ["rich", "fame", "dao"][Math.floor(Math.random() * 3)]), errclaim: t => D.act.errclaim(t), etrain: t => D.act.etrain(t),
  week: t => D.act.week(+t), chapter: t => D.act.chapter(t), trib: () => D.act.trib(),
  travel: t => D.act.go(+t), unlock: t => D.act.unlock(+t), donate: () => D.act.donate(), exchange: t => D.act.exchange(t)
};
/* 主项名 → 取子项 target 的方式 */
const SUB = {
  buy: av => Object.keys(av).filter(k => k.startsWith("buy:")).map(k => k.slice(4)),
  secret: av => Object.keys(av).filter(k => k.startsWith("secret:")).map(k => k.slice(7)),
  pill: av => Object.keys(av).filter(k => k.startsWith("pill:") && av[k]).map(k => k.slice(5)),
  feed: av => Object.keys(av).filter(k => k.startsWith("feed:")).map(k => k.slice(5)),
  dao: av => Object.keys(av).filter(k => k.startsWith("dao:")).map(k => k.slice(4)),
  companion: av => Object.keys(av).filter(k => k.startsWith("companion:")).map(k => k.slice(10)),
  skill: av => Object.keys(av).filter(k => k.startsWith("skill:")).map(k => k.slice(6)),
  skillup: av => Object.keys(av).filter(k => k.startsWith("skillup:")).map(k => k.slice(8)),
  /* 道统：前缀 "school:" 与 "schoolup:" 互不包含，但都必须按真值过滤（否则会把不可用的家也试一遍） */
  school: av => Object.keys(av).filter(k => k.startsWith("school:") && av[k]).map(k => k.slice(7)),
  schoolup: av => Object.keys(av).filter(k => k.startsWith("schoolup:") && av[k]).map(k => k.slice(9)),
  forge: av => Object.keys(av).filter(k => k.startsWith("forge:")).map(k => k.slice(6)),
  refine: av => Object.keys(av).filter(k => k.startsWith("refine:")).map(k => k.slice(7)),
  duel: av => Object.keys(av).filter(k => k.startsWith("duel:")).map(k => k.slice(5)),
  towerbuy: av => Object.keys(av).filter(k => k.startsWith("towerbuy:") && av[k]).map(k => k.slice(9)),
  awaken: av => Object.keys(av).filter(k => k.startsWith("awaken:")).map(k => k.slice(7)),
  disc: av => Object.keys(av).filter(k => k.startsWith("disc:")).map(k => k.slice(5)),
  errand: av => Object.keys(av).filter(k => k.startsWith("errand:")).map(k => k.slice(7)),
  errclaim: av => Object.keys(av).filter(k => k.startsWith("errclaim:")).map(k => k.slice(9)),
  etrain: av => Object.keys(av).filter(k => k.startsWith("etrain:")).map(k => k.slice(7)),
  attr: () => ["spirit", "body", "soul", "heart"],
  evolve: av => ["fox", "tiger"].filter(x => av["evolve:" + x]),
  feed: av => ["fox", "tiger"].filter(x => av["feed:" + x]),
  lesson: av => Object.keys(av).filter(k => k.startsWith("lesson:")).map(k => k.slice(7)),
  week: av => Object.keys(av).filter(k => k.startsWith("week:")).map(k => k.slice(5)),
  prestige: av => Object.keys(av).filter(k => k.startsWith("prestige:")).map(k => k.slice(9)),
  item: av => (av["item:compass"] ? ["compass"] : []).concat(S.itm.heal > 0 ? ["heal"] : S.itm.life > 0 ? ["life"] : ["pearl"]),
  trade: av => Object.keys(av).filter(k => k.startsWith("trade:")).map(k => k.slice(6)),
  travel: av => Object.keys(av).filter(k => k.startsWith("travel:")).map(k => k.slice(7)),
  unlock: av => Object.keys(av).filter(k => k.startsWith("unlock:")).map(k => k.slice(7)),
  exchange: av => Object.keys(av).filter(k => k.startsWith("exchange:")).map(k => k.slice(9)),
  chapter: () => ["a", "b"],
  cave: () => ["jade", "gold", "black"]
};

function randomize() {
  /* 性格也随机：avail↔守卫 的一致性必须在三种胆量下都成立
     （助手愿意登台 ≠ 游戏允许登台；若哪天游戏侧加了胜率守卫，这里就会抓到） */
  X.setPsy(["steady", "mid", "bold"][ri(3)]);
  S.realm = ri(17); S.layer = 1 + ri(9);
  S.stone = Math.floor(Math.pow(10, 2 + rnd() * 12));
  S.exp = Math.floor(Math.pow(10, 1 + rnd() * 10));
  S.pts = ri(20); S.fame = Math.floor(Math.pow(10, rnd() * 7));
  S.karma = ri(400) - 200; S.luck = ri(30); S.heart = ri(30);
  S.sect = ri(6); S.contrib = ri(3000); S.contribAll = S.contrib + ri(12000);
  S.trib = ri(11); S.tribCd = ri(2) ? 0 : 600; S.age = ri(400000); S.lifeBonus = ri(300);
  S.bodyPill = ri(6); S.surePill = ri(2) === 1;
  S.bld = { field: ri(80), garden: ri(80), cave: ri(80), room: ri(80), vault: ri(80), hall: ri(80) };
  S.art = { lv: ri(13) }; S.bowl = { lv: ri(31) };
  S.pill = { id: ri(3) ? null : "qi", left: ri(60) };
  S.beast = { lv: ri(26), evo: ri(2) }; S.tiger = { lv: ri(21), evo: ri(2) };
  S.caveCd = ri(2) ? 0 : 600; S.cd = ri(2) ? 0 : 5;
  S.tower = { depth: ri(40), best: ri(40), tok: ri(400), n: ri(50), cd: ri(2) ? 0 : 30, mod: "calm", shop: { pow: ri(51), cd: ri(11), luck: ri(21), heart: ri(11), frag: ri(37) } };
  S.tre = { lv: {}, refineN: ri(25), beat: {}, duelCd: ri(2) ? 0 : 60, sp: {}, aff: {}, forgeN: ri(50), winN: ri(9) };
  T.T_SLOTS.forEach(t => { S.tre.lv[t.id] = ri(22); });
  S.asc = { rank: ri(6), ord: ri(37), incense: ri(5000) };
  S.disc = { own: {}, m: {}, n: ri(20) };
  T.DISCIPLES.forEach(d => { if (rnd() < 0.5) { S.disc.own[d.id] = { q: ri(4), lv: 1 + ri(5) }; if (rnd() < 0.5) S.disc.m[d.id] = { left: ri(2) ? 0 : 300, job: d.job }; } });
  S.sk = { lv: {}, cd: {}, left: {} };
  T.SKILLS.forEach(x => { S.sk.lv[x.id] = ri(6); S.sk.cd[x.id] = ri(2) ? 0 : 100; });
  S.dao = {}; T.DAOS.forEach(d => { S.dao[d.id] = ri(4); });
  /* 道统：让"未择 / 已择可换 / 冷却中 / 因果不足"四种态都出现，avail 与守卫才真被对撞过 */
  S.sch = { id: rnd() < .6 ? T.SCHOOLS[ri(T.SCHOOLS.length)].id : null, x: {}, t: {}, cd: ri(2) ? 0 : 900, swap: ri(3), keN: 0 };
  T.SCHOOLS.forEach(s => { S.sch.x[s.id] = ri(400); S.sch.t[s.id] = ri(6); });
  /* 万宝楼：有货/已鉴/未鉴/冷却 四种态都要撞上 */
  S.stall = { id: ri(3) ? T.TREASURES[ri(T.TREASURES.length)].id : null, ask: 100 + ri(5000), worth: ri(9000), seen: ri(2) === 1, cd: ri(2) ? 0 : 900, n: ri(30), bought: ri(20), good: ri(9), appN: ri(30), best: Math.random() * 2, net: ri(20000) - 5000 };
  S.comp = {}; T.COMPANIONS.forEach(c => { if (rnd() < 0.5) S.comp[c.id] = 1; });
  /* 洞窟深入：不在窟中 / 窟中带货 / 顶格，三态都撞上。
     这里的 Math.random 已被钉成 0.5，所以 risk>0.5 必成、risk<=0.5 必塌——两条分支都会被扫到 */
  { const doors = ["jade", "gold", "black"], inRun = rnd() < .75;
    S.cave = { door: inRun ? doors[ri(3)] : null, depth: inRun ? 1 + ri(T.DIG_MAX) : 0, hs: ri(50000), he: ri(20000), risk: .15 + rnd() * .8, hint: ri(3) - 1, max: ri(T.DIG_MAX + 1), lock: ri(2), plan: ri(3) ? 2 + ri(4) : 0 }; }
    S.cavePlan = ri(20);
  S.mkt = { t: ri(300), hold: { rice: ri(10), ore: ri(10), powder: ri(10), jade: ri(10) }, earned: ri(1e5), spent: ri(1e5), ask: {}, askN: ri(30) };
  /* 挂单价位随机：0 / 正规档 / 越界值都塞一遍，ensureState 的夹紧与 askCycle 的循环都要撞上 */
  T.GOODS.forEach(x => { S.mkt.ask[x.id] = rnd() < .3 ? 0 : (rnd() < .8 ? Math.floor(x.base * T.ASK_STEPS[1 + ri(3)]) : Math.floor(x.base * (0.4 + rnd() * 1.6))); });
  S.rec = {}; T.RECIPES.forEach(r => { if (rnd() < 0.6) S.rec[r.id] = 1; });
  S.prestige = { blaze: ri(6), beckon: ri(6), guard: ri(6) };
  S.itm = { charm: ri(4), pearl: ri(2), heal: ri(4), life: ri(6), compass: ri(3) }; S.pearl = ri(60);
  S.areas = T.AREAS.map((a, i) => i === 0 || rnd() < 0.4); S.area = ri(10); if (!S.areas[S.area]) S.area = 0;
  S.daily = { day: D.dayStamp(), signed: rnd() < 0.5, gathered: rnd() < 0.5, secretUsed: ri(5), lessons: [], lessonDone: {} };
  S.week = { wk: D.weekStamp ? D.weekStamp() : "w", goals: [], done: {}, snap: {} };
  S.chap = { cur: ri(13), done: {}, life: ri(40), run: ri(13) };
  S.sq = { idx: ri(11) };
  S.fate = { ids: [], n: ri(5) };
  S.exch = { attr: ri(10), luck: ri(3), fame: ri(5) };
}

const bad = {}, tries = {}, firstBad = {};
function restore(snap) { const o = JSON.parse(snap); Object.keys(o).forEach(k => { S[k] = o[k]; }); }
const N = parseInt(process.argv[2] || "400", 10);
g.Math.random = () => 0.5; /* 事件结果固定，避免随机分支带来的假阳性 */
for (let i = 0; i < N; i++) {
  randomize();
  const av = X.availableActions();
  for (const name in CALL) {
    if (name === "ascend" || name === "story" || name === "idle") continue; /* 飞升会整局重置，模糊测试里跳过 */
    if (!av[name]) continue;
    const subs = SUB[name] ? SUB[name](av) : [null];
    for (const t of subs) {
      if (name !== "cultivate" && !av[name] && !(t && av[name + ":" + t])) continue;
      const snap = JSON.stringify(S);
      /* 再确认一次：动作用前的这一刻它仍在可执行集合里。若此处为假，说明前面某个动作改了局面
         （工具自身的串扰），不该算成游戏侧的守卫不一致。 */
      if (t !== null && !X.availableActions()[name + ":" + t]) { restore(snap); continue; }
      if (t === null && !X.availableActions()[name]) { restore(snap); continue; }
      tries[name + (t ? ":" + t : "")] = (tries[name + (t ? ":" + t : "")] || 0) + 1;
      try { CALL[name](t); } catch (e) {
        (bad[name + (t ? ":" + t : "")] = bad[name + (t ? ":" + t : "")] || []).push("THROW " + e.message);
        restore(snap); continue;
      }
      /* 每个动作都从同一份局面独立起步：否则前一动作（如遣徒）改掉的狀態会把后一动作（复命）判成假阳性 */
      if (JSON.stringify(S) === snap) {
        const key = name + (t ? ":" + t : "");
        (bad[key] = bad[key] || []).push("NO-OP");
        if (!firstBad[key]) {
          const P = JSON.parse(snap);
          const lg = els["log"] && els["log"].children.length ? els["log"].children[els["log"].children.length - 1] : null;
          firstBad[key] = "拒绝日志=[" + (lg ? String(lg.innerHTML).replace(/<[^>]*>/g, "") : "无") + "] realm=" + P.realm + " stone=" + P.stone + " fame=" + P.fame + " sect=" + P.sect
            + (P.disc && P.disc.own && P.disc.own[t] ? " own." + t + "=" + JSON.stringify(P.disc.own[t]) + " m=" + JSON.stringify(P.disc.m[t]) : "")
            + (P.tower ? " tok=" + P.tower.tok + " shop=" + JSON.stringify(P.tower.shop) : "")
            + (P.areas ? " areas=" + P.areas.map((u, i) => u ? i : "").join("") + " 居" + P.area : "")
            + (P.comp ? " comp=" + JSON.stringify(P.comp) : "");
        }
      }
      restore(snap);
    }
  }
}
let reported = 0;
const rows = [];
for (const k in bad) {
  const c = {};
  bad[k].forEach(r => { c[r.split(" ")[0]] = (c[r.split(" ")[0]] || 0) + 1; });
  rows.push({ k, n: bad[k].length, tries: tries[k] || 0, rate: bad[k].length / (tries[k] || 1), kinds: JSON.stringify(c), ex: firstBad[k] || "" });
}
rows.sort((a, b) => b.rate - a.rate || b.n - a.n);
rows.forEach(r => console.log("不一致  " + r.k.padEnd(16) + " " + (r.rate * 100).toFixed(0) + "% (" + r.n + "/" + r.tries + ")  " + r.kinds + (r.ex ? "  例:" + r.ex : "")));
reported = rows.length;
console.log((reported ? "\n共 " + reported + " 项 avail/守卫不一致" : "\n未发现 avail/守卫不一致") + "（随机局面 " + N + " 组，累计尝试 " + Object.values(tries).reduce((a, b) => a + b, 0) + " 次）");
