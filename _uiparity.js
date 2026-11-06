/* _uiparity.js —— 第三方一致性：UI 按钮 disabled ↔ 游戏真会执行吗
   专抓用户最烦的一类：按钮亮着、点下去毫无反应（或被游戏静默拒绝）。
   做法：随机局面 → updUI() 写入 disabled → 快照后真点一次 → 状态没变即"点了没反应"。
   （avail 是策略层，允许比游戏更保守，所以这里不与 avail 比对，只与游戏本身比对。） */
const fs = require("fs"), vm = require("vm");
const js = fs.readFileSync("仙界闭关小能手.html", "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
function mkEl() {
  const e = { style: {}, dataset: {}, children: [], innerHTML: "", textContent: "", title: "", disabled: false, value: "", checked: false, scrollHeight: 0, scrollTop: 0, clientHeight: 100,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { e.children.push(c); return c; }, get firstChild() { return children0(e); },
    removeChild(c) { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); }, remove() {}, focus() {}, select() {}, addEventListener() {}, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 }) };
  /* 动态造的钮（预设条、弟子位…）在真浏览器里和 $("同一 id") 是同一个节点。
     桩件原先把两者当成两个对象，于是 createElement 上挂的 onclick 在主循环里看不见——
     "这颗钮从没被一致性测过"就这么被藏住了。现在一赋 id 就登记，和浏览器对齐。 */
  let _id = "";
  Object.defineProperty(e, "id", {
    get() { return _id; },
    set(v) { _id = String(v); if (_id) els[_id] = e; },   /* 后登记的覆盖先登记的，和浏览器"最后一个挂上"一致 */
    enumerable: true, configurable: true
  });
  return e;
}
function children0(e) { return e.children[0] || null; }
const els = {}, store = {}, iv = [];
let NOW = 0;
const g = {
  console: { log() {}, warn() {}, error() {} }, Math, Date, JSON, String, Number, Object, Array, Boolean, parseInt, parseFloat, isFinite, isNaN, RegExp, Error,
  setTimeout: () => 0, clearTimeout() {}, setInterval: f => { iv.push(f); return iv.length; }, clearInterval() {},
  document: { getElementById: id => els[id] || (els[id] = (function () { const e = mkEl(); e.id = id; return e; })()), querySelectorAll: () => [], createElement: mkEl, addEventListener() {}, body: mkEl() },
  window: { addEventListener() {} }, location: { reload() {} },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  performance: { now: () => NOW }
};
g.global = g; g.globalThis = g; vm.createContext(g);
vm.runInContext(js, g, { timeout: 60000 });
const D = g.window.__DBG, T = D.tables, S = D.state;
const A = D.act;

/* [元素 id, 点击函数]。刻意不含"改名/重置/转世"等破坏性或纯 UI 按钮 */
const BTN = [["btnCultivate", () => A.cultivate()], ["btnExplore", () => A.explore()], ["btnBreak", () => A["break"]()],
["dSign", () => A.signIn()], ["dGather", () => A.gather()],
["dSecret", () => A.secretRun("normal")], ["dSecretF", () => A.secretRun("fierce")], ["dSecretD", () => A.secretRun("dead")],
["btnFeed", () => A.feed("fox")], ["btnFeedT", () => A.feed("tiger")], ["btnEvoF", () => A.evolve("fox")], ["btnEvoT", () => A.evolve("tiger")],
["btnArt", () => A.art()], ["btnBowl", () => A.bowl()], ["btnTrib", () => A.trib()], ["btnSq", () => A.sectQuest()], ["btnDonate", () => A.donate()],
["btnCaveJade", () => A.cave("jade")], ["btnCaveGold", () => A.cave("gold")], ["btnCaveBlack", () => A.cave("black")],
["btnPearl", () => A.item("pearl")], ["btnHeal", () => A.item("heal")], ["btnLife", () => A.item("life")],
["btnPre-blaze", () => A.prestige("blaze")], ["btnPre-beckon", () => A.prestige("beckon")], ["btnPre-guard", () => A.prestige("guard")],
["btnExAttr", () => A.exchange("attr")], ["btnExLuck", () => A.exchange("luck")], ["btnExFame", () => A.exchange("fame")],
["aAdd-spirit", () => A.attr("spirit")], ["aAdd-body", () => A.attr("body")], ["aAdd-soul", () => A.attr("soul")], ["aAdd-heart", () => A.attr("heart")],
["btnTower", () => A.tower()], ["btnAscend", () => A.ascend()]];
T.BLD.forEach(b => BTN.push(["bbuy-" + b.id, () => A.buy(b.id)]));
T.PILLS.forEach(p => BTN.push(["btnPill" + p.id[0].toUpperCase() + p.id.slice(1), () => A.pill(p.id)]));
T.GOODS.forEach(g2 => { BTN.push(["mkBuy-" + g2.id, () => A.trade("buy_" + g2.id)], ["mkSell-" + g2.id, () => A.trade("sell_" + g2.id)],
  /* 挂单钮恒亮（循环调价永远合法），所以它必须恒被接受——若哪天加了前置条件而忘了置灰，这一条就会报出来 */
  ["mkAsk-" + g2.id, () => A.ask(g2.id)]); });
T.DAOS.forEach(d => BTN.push(["dao-" + d.id, () => A.dao(d.id)]));
T.COMPANIONS.forEach(c => BTN.push(["comp-" + c.id, () => A.companion(c.id)]));
/* 道统十个按钮：主修位与悟道价都由状态决定，UI 亮着而游戏拒绝就是本工具要抓的 */
T.SCHOOLS.forEach(s => { BTN.push(["schSel-" + s.id, () => A.school(s.id)]); BTN.push(["schUp-" + s.id, () => A.schoolup(s.id)]); });
/* 万宝楼三钮：逛/鉴/买的可用条件各不相同，正是 UI 与游戏最容易分叉的地方 */
BTN.push(["btnStall", () => A.stall()], ["btnStallApp", () => A.stallapp()], ["btnStallBuy", () => A.stallbuy()]);
/* 洞窟深入两钮：一个看"在不在窟中 + 到没到顶"，一个只看"在不在窟中"——亮灰条件不同源就会分叉 */
BTN.push(["btnDig", () => A.dig()], ["btnDigKeep", () => A.digkeep()]);
/* 罗盘钮的置灰条件有四项（在窟中 / 有货 / 未锁 / 未到顶格），与 useItem 的守卫必须逐条同源 */
BTN.push(["btnCompass", () => A.item("compass")]);
/* 行程钮恒亮（循环定档永远合法），与罗盘同属"窟内规划"，走的是同一条校验 */
BTN.push(["btnPlan", () => A.caveplan()]);
/* 姿势预设三钮：恒亮（摆哪套都合法），所以必须恒被接受；它只改四个选择开关 */
(D.PRESETS || []).forEach(p => BTN.push(["pre-" + p.id, () => A.applyPreset(p.id)]));
/* 自定套两钮：「存我这套」恒合法；「我 的」只在没存过时置灰——那正是游戏也会拒绝的唯一态 */
BTN.push(["btnPresetSave", () => A.presetSave()], ["pre-mine", () => A.applyPreset("mine")]);
/* 起手势 / 赏格两颗 chip 条：先前根本没进名单（_uiparity 只测自己列出的 id）。
   "已经在这势/这格"时点它是幂等空操作，不是游戏拒绝——用 NA 跳过，其余状态必须真换成功。 */
T.STANCES.forEach(s => BTN.push(["st-" + s.id, () => S.duelSt === s.id ? "NA" : A.duelStance(s.id)]));
T.DISC_CONTRACTS.forEach(c => BTN.push(["ct-" + c.id, () => S.disc.ct === c.id ? "NA" : A.discCt(c.id)]));
T.SKILLS.forEach(x => { BTN.push(["sk-" + x.id, () => A.skillUp(x.id)]); BTN.push(["sku-" + x.id, () => A.skill(x.id)]); });
T.T_SLOTS.forEach(t => { BTN.push(["btnForge-" + t.id, () => A.forge(t.id)], ["btnRefine-" + t.id, () => A.refine(t.id)], ["btnAwe-" + t.id, () => A.awaken(t.id)]); });
T.TOWER_SHOP.forEach(it => BTN.push(["tb-" + it.id, () => A.towerBuy(it.id)]));
T.DUELS.forEach((d, i) => BTN.push(["btnDuel-" + i, () => A.duel(i)]));
/* 弟子位按钮在不同状态下指向不同动作；"应当置灰"的情形返回 NA 让主循环跳过，别算成 bug */
T.DISCIPLES.forEach(d => {
  BTN.push(["bd-" + d.id, () => {
    const o = S.disc.own[d.id], m = S.disc.m[d.id];
    if (!o) return A.disc(d.id);
    if (m && m.left > 0) return "NA"; /* 遣字置灰中 */
    if (m) return A.errclaim(d.id);
    return A.errand(d.id);
  }], ["bt-" + d.id, () => {
    const o = S.disc.own[d.id];
    if (!o || o.lv >= T.DLV_MAX) return "NA";
    return A.etrain(d.id);
  }]);
});
for (let i = 0; i < 3; i++) { BTN.push(["lsn" + i, () => A.lesson(i)], ["wk" + i, () => A.week(i)]); }
BTN.push(["btnChapA", () => A.chapter("a")], ["btnChapB", () => A.chapter("b")]);

let seed = parseInt(process.argv[3] || "654321", 10);
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 100000) / 100000; };
const ri = n => Math.floor(rnd() * n);

function randomize() {
  /* 性格随机：界面亮不亮是游戏守卫的事，与助手胆量无关——三档轮着按才能证明这一点 */
  try { g.window.__XLLM.setPsy(["steady", "mid", "bold"][ri(3)]); } catch (e) {}
  S.realm = ri(17); S.layer = 1 + ri(9);
  S.stone = Math.floor(Math.pow(10, 1 + rnd() * 12)); S.exp = Math.floor(Math.pow(10, rnd() * 9));
  S.pts = ri(25); S.fame = Math.floor(Math.pow(10, rnd() * 7)); S.karma = ri(600) - 300; S.luck = ri(40);
  S.sect = ri(6); S.contrib = ri(4000); S.contribAll = S.contrib + ri(15000);
  S.trib = ri(11); S.tribCd = ri(2) ? 0 : 900; S.age = ri(300000); S.lifeBonus = ri(300); S.bodyPill = ri(6); S.surePill = ri(2) === 1;
  S.bld = { field: ri(90), garden: ri(90), cave: ri(90), room: ri(90), vault: ri(90), hall: ri(90) };
  S.art = { lv: ri(13) }; S.bowl = { lv: ri(31) }; S.caveCd = ri(2) ? 0 : 900; S.cd = ri(2) ? 0 : 3;
  S.pill = { id: ri(3) ? null : "qi", left: ri(80) };
  S.beast = { lv: ri(27), evo: ri(2) }; S.tiger = { lv: ri(22), evo: ri(2) };
  S.tower = { depth: ri(40), best: ri(40), tok: ri(400), n: ri(60), cd: ri(2) ? 0 : 30, mod: "calm", shop: { pow: ri(51), cd: ri(11), luck: ri(21), heart: ri(11), frag: ri(37) } };
  S.tre = { lv: {}, aff: {}, refineN: ri(25), beat: {}, duelCd: ri(2) ? 0 : 90, sp: {}, forgeN: ri(60), winN: ri(10) };
  T.T_SLOTS.forEach(t => { S.tre.lv[t.id] = ri(22); if (rnd() < .3) S.tre.aff[t.id] = T.AFFIX[ri(T.AFFIX.length)].id; if (rnd() < .2) S.tre.sp[t.id] = 1; });
  S.asc = { rank: ri(7), ord: ri(37), incense: ri(20000), times: ri(4) };
  S.disc = { own: {}, m: {}, n: ri(25) };
  T.DISCIPLES.forEach(d => { if (rnd() < .55) { S.disc.own[d.id] = { q: ri(4), lv: 1 + ri(5) }; if (rnd() < .6) S.disc.m[d.id] = { left: ri(2) ? 0 : 400, job: d.job }; } });
  S.sk = { lv: {}, cd: {}, left: {}, n: 0 };
  T.SKILLS.forEach(x => { S.sk.lv[x.id] = ri(6); S.sk.cd[x.id] = ri(2) ? 0 : 200; if (rnd() < .2) S.sk.left[x.id] = 30; });
  S.dao = {}; T.DAOS.forEach(d => { S.dao[d.id] = ri(4); });
  /* 道统：本命位/道行/已悟阶数/静养冷却 全随机，让"本命""满""悟"三种按钮态都被扫到 */
  S.sch = { id: rnd() < .7 ? T.SCHOOLS[ri(T.SCHOOLS.length)].id : null, x: {}, t: {}, cd: ri(2) ? 0 : 900, swap: ri(3), keN: 0 };
  T.SCHOOLS.forEach(s => { S.sch.x[s.id] = ri(300); S.sch.t[s.id] = ri(6); });
  /* 万宝楼：有货/已鉴/冷却 随机，让 逛·鉴·成交 三钮的亮与灰都被扫到 */
  S.stall = { id: ri(2) ? T.TREASURES[ri(T.TREASURES.length)].id : null, ask: 100 + ri(4000), worth: ri(8000), seen: ri(2) === 1, cd: ri(2) ? 0 : 600, n: ri(20), bought: ri(12), good: ri(5), appN: ri(20), best: Math.random() * 2, net: ri(9000) };
  /* 洞窟深入：不在窟中 / 窟中带货 / 已到顶格 三态都撞上（置灰条件与游戏守卫必须同源） */
  { const doors = ["jade", "gold", "black"], inRun = rnd() < .75;
    S.cave = { door: inRun ? doors[ri(3)] : null, depth: inRun ? 1 + ri(T.DIG_MAX) : 0, hs: ri(50000), he: ri(20000), risk: .15 + rnd() * .8, hint: ri(3) - 1, max: ri(T.DIG_MAX + 1), lock: ri(2), plan: ri(3) ? 2 + ri(4) : 0 }; }
    S.cavePlan = ri(20);
  /* 自定套：存过 / 没存过 两态都要撞上。没存过时"我 的"必须置灰，且游戏也真会拒绝——
     只把钮藏起来（display:none）而留着 disabled=false，正是"看着能点、点了没反应"的温床。 */
  { const ps = ["steady", "mid", "bold"];
    S.presetMine = rnd() < .6
      ? { on: 1, st: T.STANCES[ri(T.STANCES.length)].id, psy: ps[ri(3)], plan: rnd() < .7 ? 2 + ri(4) : 0, ct: T.DISC_CONTRACTS[ri(T.DISC_CONTRACTS.length)].id }
      : { on: 0 };
    S.presetMineS = ri(9); S.presetMineA = ri(9); }
  S.comp = {}; T.COMPANIONS.forEach(c => { if (rnd() < .5) S.comp[c.id] = 1; });
  S.mkt = { t: ri(400), hold: {}, earned: ri(1e5), spent: ri(1e5), ask: {}, askN: ri(30) }; T.GOODS.forEach(g2 => { S.mkt.hold[g2.id] = ri(10); /* 挂单：三档正规价位 + 偶尔一个野价位（越界应被 ensureState 夹回，非档位值点一次即归卸单） */
    S.mkt.ask[g2.id] = rnd() < .25 ? 0 : (rnd() < .85 ? Math.floor(g2.base * T.ASK_STEPS[1 + ri(3)]) : Math.floor(g2.base * (0.5 + rnd()))); });
  S.rec = {}; T.RECIPES.forEach(r2 => { if (rnd() < .6) S.rec[r2.id] = 1; });
  S.prestige = { blaze: ri(7), beckon: ri(7), guard: ri(7) };
  S.exch = { attr: ri(12), luck: ri(5), fame: ri(6) };
  S.itm = { charm: ri(4), pearl: ri(2), heal: ri(4), life: ri(6), compass: ri(3) }; S.pearl = ri(60);
  S.areas = T.AREAS.map((a, i) => i === 0 || rnd() < .4); S.area = 0; while (!S.areas[S.area]) S.area++;
  S.daily = { day: D.dayStamp(), signed: rnd() < .5, gathered: rnd() < .5, secretUsed: ri(5), lessons: [], lessonDone: {}, snap: null };
  S.week = { wk: "w", goals: [], done: {}, snap: {} };
  S.chap = { cur: ri(13), done: {}, life: ri(40), run: ri(13) };
  S.sq = { idx: ri(11) }; S.omen = { id: null, left: 0, t: 600 }; S.chapEternal = ri(12);
  S.attr = { spirit: ri(200), body: ri(200), soul: ri(200), heart: ri(200) };
  D.ensureState();
  if (D.dailyRoll) D.dailyRoll(); /* 让今日道课按当前日戳生成 */
  S.daily.lessons = D.pickLessons ? D.pickLessons(S.daily.day) : S.daily.lessons;
}

const N = parseInt(process.argv[2] || "200", 10);
const dead = {}, grayed = {}, checked = {};
const restore = snap => { const o = JSON.parse(snap); Object.keys(o).forEach(k => { S[k] = o[k]; }); };
for (let i = 0; i < N; i++) {
  randomize();
  D.updUI();
  const av = (function () { try { return g.window.__XLLM.availableActions(); } catch (e) { return {}; } })();
  BTN.forEach(([id, fn]) => {
    const el = els[id];
    if (!el || typeof el.disabled !== "boolean") return;
    const snap = JSON.stringify(S);
    let refusedByGame = false, na = false;
    try { if (fn() === "NA") na = true; } catch (e) { refusedByGame = true; }
    if (na) { restore(snap); return; }
    if (JSON.stringify(S) === snap) refusedByGame = true;
    restore(snap);
    const clickable = el.disabled === false;
    checked[id] = (checked[id] || 0) + 1;
    if (clickable && refusedByGame) (dead[id] = dead[id] || []).push("按钮亮着、点了没反应");
    if (!clickable && !refusedByGame) grayed[id] = (grayed[id] || 0) + 1;
  });
}
let bad = 0;
function ok2(cond, msg, onFail) { console.log((cond ? "  ok  " : "FAIL  ") + msg); if (!cond && onFail) onFail(); }
console.log("UI↔游戏一致性（" + N + " 组随机局面，检查 " + Object.keys(checked).length + " 个按钮 / " + Object.values(checked).reduce((a, b) => a + b, 0) + " 次点击）");
Object.keys(dead).forEach(id => { console.log("  可点却无效  " + id + "  " + dead[id].length + "/" + checked[id] + " 次"); bad += dead[id].length; });
const soft = Object.keys(grayed).filter(k => grayed[k] > N * 0.15);
if (soft.length) console.log("  （参考）长期置灰但其实可行：" + soft.map(k => k + " " + grayed[k] + "/" + checked[k]).join("  "));
/* 关卡自己的两处盲点：
   1) 主循环 `if(!el) return` 会把写错的 id 静默吞掉——测了 151 颗，可能一颗都不存在。
   2) 只测 BTN 名单，等于"没写进名单的钮永远不被测"。第 44 轮的「我 的」正是这么漏掉的：
      它在 DOM 里、有 onclick、会被点，却不在名单上。于是反过来查：凡是挂了 onclick 的节点都必须有主。 */
const reg = new Set(BTN.map(b => b[0]));
const ghost = BTN.map(b => b[0]).filter(id => !(id in els) || typeof els[id].disabled !== "boolean");
ok2(ghost.length === 0, "名单里每颗钮在 DOM 都认得（查无: " + (ghost.join(",") || "无") + "）", () => bad += ghost.length);
/* 破坏性与纯 UI 钮刻意不进名单（点了会清档/改名/关弹窗，不是"能不能执行"的问题） */
/* 豁免必须逐颗写理由，且必须指向一颗真实存在的钮：
   空口豁免会让名单越积越松，指错 id 的豁免又会把"这颗钮改名后没人测了"重新藏起来。 */
const EXEMPT = {
  /* —— 大模型助手面板：动的是 cfg / 请求 / 弹窗，不改 S，本关卡的"点了有没有反应"对它无意义 —— */
  mok: "助手弹窗·确认", mcancel: "助手弹窗·取消", llmback: "助手面板·遮罩", llmClose: "助手面板·关闭",
  btnConn: "助手面板·连接测试", btnPilot: "助手面板·代打开关", modelList: "助手面板·模型清单",
  btnKeyEye: "助手面板·密钥显隐", btnEv: "助手面板·生成剧情", btnNpc: "助手面板·生成剧情",
  btnQuest: "助手面板·生成剧情", btnRand: "助手面板·生成剧情",
  "abtn-1": "助手面板·快捷指令", "abtn-2": "助手面板·快捷指令", "abtn-3": "助手面板·快捷指令",
  "abtn-4": "助手面板·快捷指令", "abtn-5": "助手面板·快捷指令", "abtn-6": "助手面板·快捷指令",
  "abtn-7": "助手面板·快捷指令", "abtn-8": "助手面板·快捷指令", "abtn-9": "助手面板·快捷指令",
  /* —— 纯 UI / 破坏性：改了也不该被"随机点一下"验证 —— */
  btnTabMax: "纯 UI·标签页放大", btnRename: "破坏性·改名弹窗", btnReset: "破坏性·清档",
  "nav-cult": "纯 UI·模块跳转", "nav-legacy": "纯 UI·模块跳转", "nav-daily": "纯 UI·模块跳转",
  "nav-res": "纯 UI·模块跳转", "nav-pal": "纯 UI·模块跳转", "nav-war": "纯 UI·模块跳转", "nav-end": "纯 UI·模块跳转",
  btnAscend: "跨世·整局重置（点了这一世就没了，不能拿随机局面去试）", btnRebirth: "跨世·转世确认（同上）",
  /* 前程卡的两个容器：点击是"委托"在容器上的（列表每帧用 innerHTML 重绘），本关卡既造不出
     被点的那个行，也不该把"跳转"当成游戏动作——行的行为由 _smoke 直接调 focusAch/jumpTo 来钉。 */
  goalRows: "纯 UI·成就行的委托跳转（点行只导航，不改状态）",
  busyInfo: "纯 UI·在途行的委托跳转（同上）",
  /* 七个模块标题与「全展开」：窄屏收起/展开模块，宽屏只滚动定位——都不碰 S，
     桩件里也没有真实布局可验（折叠效果由浏览器实测与 _struct9 的静态判据守住） */
  "grp-cult": "纯 UI·只看这一组", "grp-legacy": "纯 UI·只看这一组", "grp-daily": "纯 UI·只看这一组",
  "grp-res": "纯 UI·只看这一组", "grp-pal": "纯 UI·只看这一组", "grp-war": "纯 UI·只看这一组", "grp-end": "纯 UI·只看这一组",
  "nav-all": "纯 UI·一次展开所有模块"
};
Object.keys(EXEMPT).forEach(id => { if (!(id in els)) { ok2(false, "豁免表里的 " + id + " 在 DOM 查无（豁免已过期）", () => bad++); } });
const wired = Object.keys(els).filter(id => typeof els[id].onclick === "function");
const orphan = wired.filter(id => !reg.has(id) && !EXEMPT[id]);
ok2(orphan.length === 0, "挂过 onclick 的钮全在名单上（漏测: " + (orphan.join(",") || "无") + "）", () => bad += orphan.length);
console.log("  ——  DOM 里挂了 onclick 的节点 " + wired.length + " 颗，名单覆盖 " + (wired.length - orphan.length) + " 颗，豁免 " + wired.filter(id => EXEMPT[id]).length + " 颗");
console.log(bad ? "\n发现 " + bad + " 次「按钮亮着但游戏拒绝」/ 名单破口" : "\n未发现「按钮亮着但游戏拒绝」，名单无破口");
process.exit(bad ? 1 : 0);
