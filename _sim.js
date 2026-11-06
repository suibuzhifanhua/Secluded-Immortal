/* 第二十一轮模拟：助手代打推进曲线（步长 5s，含真实冷却） */
const fs = require("fs"), vm = require("vm");
const js = fs.readFileSync("仙界闭关小能手.html", "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
function mkEl() {
  const e = { style: {}, dataset: {}, children: [], _cls: new Set(), innerHTML: "", textContent: "", disabled: false, value: "", checked: false, scrollHeight: 0, scrollTop: 0, clientHeight: 100,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { e.children.push(c); return c; }, get firstChild() { return e.children[0] || null; },
    removeChild(c) { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); }, remove() {}, focus() {}, select() {}, addEventListener() {}, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 }) };
  return e;
}
const els = {}, store = {}, iv = [];
let NOW = 0;
/* 沙箱里换一个"可推进的 Date"：游戏用 Date.now() 算日/周翻页（dayStamp/weekStamp/支线时限），
   真实时钟下模拟 24 小时只过现实 1 分钟 → 签到·日课·周愿·秘境日限这些按日历刷新的内容
   在长跑里根本没被跑到（首版就漏掉了"24 小时没完成过一次周愿"这种假象）。
   这里保持 1:1 走时（不加速），要看日历翻页就把小时数开到 ≥24。 */
const REAL_DATE = Date;
let SIM_MS = REAL_DATE.now();
class SimDate extends REAL_DATE {
  constructor(...a) { super(a.length ? a[0] : SIM_MS); }
  static now() { return SIM_MS; }
}
SimDate.UTC = REAL_DATE.UTC;
SimDate.parse = REAL_DATE.parse;
SimDate.prototype = REAL_DATE.prototype;
const g = {
  console, Math, Date: SimDate, JSON, String, Number, Object, Array, Boolean, parseInt, parseFloat, isFinite,
  setTimeout: () => 0, clearTimeout() {}, setInterval: f => { iv.push(f); return iv.length; }, clearInterval() {},
  document: { getElementById: id => els[id] || (els[id] = mkEl()), querySelectorAll: () => [], createElement: mkEl, addEventListener() {}, body: mkEl() },
  window: { addEventListener() {} }, location: { reload() {} },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  performance: { now: () => NOW }
};
g.global = g; g.globalThis = g;
vm.createContext(g);
vm.runInContext(js, g, { timeout: 60000 });
const D = g.window.__DBG, X = g.window.__XLLM, S = D.state;

const STEP = 5, HOURS = parseFloat(process.argv[2] || "4");
/* `node _sim.js 168 loop` —— 让代打真正走完「一世修满 → 碎丹转世 → 择祝福 / 承天命」。
   此前历轮长跑里 转世 一次都没发生（act.rebirth 不在 ACT_SET，助手不会自己碎丹），
   于是 天命 / 轮回祝福 / 纪事 / 转世重置 这些路径从来没被任何关卡跑到过。
   这是测量口径，不改产品行为：产品里转世仍由玩家在弹窗上亲手确认。 */
/* 性格可以从命令行指定：node _sim.js 8 bold / node _sim.js 8 steady loop
   —— 直方图会替我们回答"这枚旋钮到底改变了什么"。两个开关都按 token 扫，顺序随意。 */
let LOOP = false;
{
  const toks = process.argv.slice(3).map(s => String(s).toLowerCase());
  const pk = ["steady", "mid", "bold"].find(t => toks.includes(t));
  if (pk) X.setPsy(pk);
  LOOP = toks.includes("loop");
}
const PSYN = X.psy();
/* 转世节流：真人一局一世要打很多天，不会一满顶就碎丹（实测不限速时 12 小时转了 47 次，
   二档 break 吃满决策位，成就反而从 103 掉到 64——那是"重放"不是"玩")。
   每 2 小时最多一世，剩下的时间才真正用来打终局（石台/秩序/飞升/神域）。 */
const LOOP_GAP = 2 * 3600;
let lastLoopT = -1e9;
let loopN = 0, fateRounds = 0;
const loopLog = [];
const STEPS = Math.floor(HOURS * 3600 / STEP);
const ms = {}; let last = -1, reclimb = 0;
const acts = {};
const avSeen = {};
/* 首开阶梯三张表：avAll=这套档序里存在过的系统名；avFirst=第一次"可做"的时刻与当时境界；avUsed=第一次真被选中 */
const avAll = {}, avFirst = {}, avUsed = {};
const daySeen = {}, weekSeen = {}, dayLessons = {};
/* 认出游戏自己的 tick：init 里第一个 setInterval 就是它。
   模拟不再手抄"哪些字段是冷却"（那份清单已经漏过 sch.cd、stall.cd 两次），
   也不再手算收入——收入·冷却·寿元·日/周翻页·支线时限·天象 全部交给游戏本体推进，
   这样"模拟里能玩"才真的等于"浏览器里能玩"。 */
let tick = null;
{
  /* 用"寿元是否在走"认 tick：新档 stoneRate 可能为 0（还没建灵田），收入探针会误判 */
  for (const f of iv) {
    const probe = S.age;
    NOW += 2000;
    try { f(); } catch (e) {}
    if (S.age > probe) { tick = f; break; }
  }
}
if (!tick) { console.log("FAIL 没能从 setInterval 里认出 tick（脚手架失效，结论不可信）"); process.exit(1); }
const SUB = 2, SUBT = STEP / SUB;   /* tick 内部把 dt 上限压在 3s，STEP=5 拆成两小步全额记账 */
/* 代劳修行必须一起跑：产品里 startPilot() 无条件 startGo()，只要助手在做决策，
   每 250ms 就有一拍"探索就绪即探、否则打坐"在消耗 explore 的 2.5 秒冷却。
   模拟不跑它，avail.explore 就几乎恒真，于是排在探索之后的档（坊市套利）整局 0 次——
   这不是游戏缺陷，是测量口径错（与第 34 轮"模拟从不推进 mkt.t"同一类）。
   时间预算不变：250ms × 10 拍 = 原来的 2.5s，tick 依旧按 SUBT 记账。 */
const GO_MS = 250, GO_PER_SUB = Math.round(SUBT * 1000 / GO_MS);
for (let i = 1; i <= STEPS; i++) {
  const t = i * STEP;
  for (let k = 0; k < SUB; k++) {
    for (let j = 0; j < GO_PER_SUB; j++) {
      NOW += GO_MS; SIM_MS += GO_MS;
      if (D.cd() <= 0) D.act.explore(); else D.act.cultivate();
    }
    tick();
  }
  /* 覆盖率记账：直方图只说"选了什么"，说不出"能不能选却没选"。
     两者是不同的病——后者是档序饿死（第 35 轮 dig×0 就是），前者只是尚未解锁。
     availableActions 是纯读函数，重复调一次不改变局面。 */
  { const av = X.availableActions(), prim = new Set();
    for (const k in av) {
      const c = k.indexOf(":"), p = c < 0 ? k : k.slice(0, c);
      avAll[p] = 1;   /* 键名出现过就算"这套档序里存在的系统"，不论当时真假 */
      if (!av[k]) continue;
      prim.add(p); avSeen[p] = (avSeen[p] || 0) + 1;
      /* 首开阶梯：不看"能不能做"，看"什么时候第一次能做、当时人在哪一境"。
         这是回答"系统是不是按进度逐步开放"的唯一诚实口径——谓词一律用游戏自己的 availableActions，
         量具里绝不抄第二份解锁条件（抄的那份永远对不上）。 */
      if (!(p in avFirst)) avFirst[p] = { t, realm: S.realm, lab: D.realmLabel(), rb: S.rebirths || 0 };
    } }
  { const d = X.ruleAction();
    acts[d.action] = (acts[d.action] || 0) + 1;
    const c0 = String(d.action).indexOf(":");
    const pr = c0 < 0 ? String(d.action) : String(d.action).slice(0, c0);
    if (!(pr in avUsed)) avUsed[pr] = t;
    X.execDecision(d, "规则"); }
  /* 一世修到顶格就转世：祝福轮流择（覆盖每一条），天命按 0→1→2→3 条轮换（让 逆命而行/三重天命/天命烙印 真被跑到） */
  if (LOOP && D.isMaxed() && t - lastLoopT >= LOOP_GAP) {
    lastLoopT = t;
    const BL = D.tables.BLESS, FT = D.tables.FATES, FM = D.tables.FATE_MAX;
    const k = BL[loopN % BL.length].k;
    const cnt = loopN % (FM + 1);
    const fts = [];
    for (let i = 0; i < cnt; i++) fts.push(FT[(loopN + i) % FT.length].id);
    const rb0 = S.rebirths;
    D.act.rebirth(k, fts);
    if (S.rebirths === rb0) { console.log("FAIL loop 里转世没生效（realm=" + S.realm + "，act.rebirth 被守卫挡了）"); process.exit(1); }
    loopN++; fateRounds += fts.length;
    loopLog.push("第" + S.rebirths + "世 祝福·" + k + " 天命×" + fts.length + (fts.length ? "(" + fts.join(",") + ")" : "") + " @ " + (t / 3600).toFixed(1) + "h");
  }
  /* 境界推进记的是"首次抵达"：渡劫跌落/转世会重回低境，覆盖成"最近一次"以后
     同一份档序里"多久到混元"能从 34min 跳到 258min，曲线就没法横向比了（实测踩过）。
     重登的次数另记，落在曲线下方一行。 */
  if (S.realm !== last) {
    if (!(S.realm in ms)) ms[S.realm] = { t, name: D.tables.REALMS[S.realm][0], world: D.tables.REALMS[S.realm][1], stone: S.allStone };
    if (S.realm < last) reclimb++;
    last = S.realm;
  }
  /* 日历翻页追踪：签到/日课/周愿都是按真日期刷新的，长跑必须能看见"到底跨了几天几周" */
  if (S.daily && S.daily.day) daySeen[S.daily.day] = (daySeen[S.daily.day] || 0) + (S.daily.signed ? 1 : 0);
  if (S.week && S.week.wk) weekSeen[S.week.wk] = 1;
  /* 逐日记录当天最多偿到第几课：日课全勤偏低时，要看得见是"每天都差一两门"还是"有几天全军覆没" */
  if (S.daily && S.daily.day) {
    const dn = Object.keys(S.daily.lessonDone || {}).length;
    const cur = dayLessons[S.daily.day] || { n: 0, set: [] };
    if (dn > cur.n) { cur.n = dn; cur.set = (S.daily.lessons || []).slice(); dayLessons[S.daily.day] = cur; }
    else if (!cur.set.length) cur.set = (S.daily.lessons || []).slice();
  }
}
const rows = Object.keys(ms).map(Number).sort((a, b) => a - b);
console.log("助手代打 " + HOURS + " 小时（步长 " + STEP + "s·性格 " + X.PSY[PSYN].n + "）境界推进：");
let prev = 0;
for (const r of rows) { const m = ms[r]; console.log("  " + (m.t / 60).toFixed(1) + "min (+" + ((m.t - prev) / 60).toFixed(1) + ")  " + m.world + " · " + m.name + "  累计灵石 " + D.fmt(m.stone)); prev = m.t; }
if (reclimb) console.log("  （境界回落 " + reclimb + " 次：渡劫跌落或转世；上表按首次抵达计，重登不算进度）");
/* 全局倍率的构成打在长跑末尾：数值这轮到底慢没慢，看"越线的项是否贴住了顶"最直接。
   只列 ≠1 的项，并标出哪些已经撞到 GM_PARTS 注释里承诺的封顶。 */
{ const parts = (D.gmParts ? D.gmParts() : []).filter(p => p && isFinite(p.v) && Math.abs(p.v - 1) > 1e-9).sort((a, b) => b.v - a.v);
  const top = parts.slice(0, 8).map(p => p.k + "×" + (p.v >= 100 ? p.v.toFixed(0) : p.v.toFixed(2))).join(" · ");
  console.log("全局倍率 gm()=" + D.gm().toFixed(1) + "（前列：" + top + "）"); }
console.log("\n终点 " + D.realmLabel() + " | 石台 峰值" + S.tower.best + "/现" + S.tower.depth + " 层 令 " + S.tower.tok + " | 主线 " + (S.chap.run || 0) + "/" + D.tables.CHAPTERS.length + " | 战力 " + D.powerLabel() +
  " | 弟子 " + D.discCount() + " | 丹方 " + D.recipeCount() + "/5 | 秩序 " + D.orderStr() + (S.asc.rank ? "（已凝格 " + S.asc.rank + " 次·秩序是花掉的，不是掉了）" : "") + " | 劫印 " + S.trib + "/10 | 神通 " + D.tables.SKILLS.reduce((a, x) => a + (S.sk.lv[x.id] || 0), 0) + "/30 | 道统 " + (S.sch && S.sch.id ? (D.tables.SCHOOLS.find(x => x.id === S.sch.id).n + "第" + D.schT(S.sch.id) + "阶·总" + D.schSum()) : "未择") + " | 成就 " + Object.keys(S.ach).length + "/" + D.tables.ACHS.length);
const miss = D.tables.ACHS.filter(a => !S.ach[a.id]);
console.log("成就 " + miss.length + " 条未达：" + miss.map(a => a.name + "（" + a.desc + "）").slice(0, 16).join(" ｜ ") + "\n");
/* 内容流水必须以游戏自己的计数为准：代劳修行会自己按探索，助手"没选探索"≠"没探索"。
   少了这一行，把套利提到探索之前看起来像砍掉了内容入口（助手 explore 2096→145），实际总探索几乎没动。 */
console.log("内容流水：累计探索 " + D.fmt(S.explores) + " 次 · 事件 " + D.fmt(S.evN) + " 次 · 点击 " + D.fmt(S.clicks) +
  " 次 · 主线 " + (S.chap.run || 0) + " 章 · 遗宝残片 " + D.fmt(Object.keys((S.rel && S.rel.fr) || {}).reduce((a, k) => a + (+S.rel.fr[k] || 0), 0)) +
  /* 直方图把 item 归成一个主名，看不出罗盘到底烧没烧——洞窟那条线要单独有计数才测得到（dig×0 的教训） */
  " · 深入 " + (S.caveDig || 0) + " 层/折戟 " + (S.caveFail || 0) + " · 罗盘动用 " + (S.caveLock || 0) + " 次（持 " + (S.itm.compass || 0) + "）" +
  " · 行程完成 " + (S.cavePlan || 0) + " 次" +
  " · 挂单成交 " + ((S.mkt && S.mkt.askN) || 0) + " 笔");
if (LOOP) {
  console.log("轮回：转世 " + S.rebirths + " 次 · 累计承天命 " + fateRounds + " 条（现带 " + (S.fate.ids || []).length + " 条：" + ((S.fate.ids || []).join(",") || "无") + "） · 轮回祝福 " +
    Object.entries(S.bless || {}).map(([k, v]) => k + "×" + v).join(" ") + " · 纪事 " + ((S.chron || []).length) + " 条");
  console.log("  " + loopLog.slice(-6).join("\n  "));
  /* 转世回路必须真的把天命成就带进可达区，否则这个模式白跑（说明成就或谓词有问题） */
  const loopAch = D.tables.ACHS.filter(a => /rebirth|fate|逆命|天命|祝福/.test(a.id + a.name)).map(a => a.name + (S.ach[a.id] ? "✓" : "✗"));
  console.log("  轮回/天命成就：" + loopAch.join(" "));
}
/* 连续全勤也打出来：长跑里它应当是"很小"的数——代打是在同一个真实日内重放很多个游戏日，
   按本地日相接的连续自然每次归 1。要是这里冒出几十，说明连续被游戏日(而非日历日)骗着走了。 */
console.log("日历：跨 " + Object.keys(daySeen).length + " 天 / " + Object.keys(weekSeen).length + " 周 · 日课全勤 " + (S.lessonDays || 0) + " 日"
  + "（连续 " + (S.streak || 0) + " · 最长 " + (S.streakBest || 0) + "） · 周愿圆满 " + (S.weekAll || 0) + " 次 · 执事 " + S.disc.n + " 次 · 签到按钮被按 " + (acts.signin || 0) + " 次");
/* 周愿明细：三条愿里到底是哪一条卡住，只有按"本周实际增量"打出来才看得见
   （weekProg 已经是 当前累计 − 周初快照，所以这里读的就是真进度） */
if (S.week && (S.week.goals || []).length) {
  console.log("  本周 " + S.week.wk + " 三愿：" + S.week.goals.map(id => {
    const p = D.weekProg(id), t0 = D.weekTarget(id);
    return D.weekName(id).replace(/\{t\}/, t0) + " " + Math.min(p, t0) + "/" + t0 + ((S.week.done || {})[id] ? "✓偿" : (p >= t0 ? "○可偿未偿" : ""));
  }).join(" ｜ "));
}
{
  const ks = Object.keys(dayLessons);
  if (ks.length) console.log("  逐日课业（当天偿掉几门）：" + ks.map(d => d.slice(5) + " " + dayLessons[d].n + "/3[" + (dayLessons[d].set || []).join(",") + "]").join(" ｜ "));
}
console.log("动作分布：" + Object.entries(acts).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + "×" + v).join("  "));
/* ---- 覆盖率：把"能做却没做"与"根本没解锁"分开 ----
   饿死名单里的 cultivate 是终末兜底（探索永远压它一头），属设计而非缺陷，故显式豁免并注明理由。 */
{
  const EXEMPT = {
    cultivate: "终末兜底：探索就绪时永远压它一头，本就不该被规则选中",
    story: "非进度动作：剧情由自己的定时器异步生成，规则档不参与",
    idle: "非进度动作：idle 是「这一拍不做主」的合法弃权，规则档永远要给具体动作"
  };
  /* 兄弟动作：同一档里"进/退""逛/买"是一对。兄弟被选过就说明这一档被走到了，
     本格 0 次是性格主动放弃，不是排在谁下面饿死——两者必须分开，否则旋钮一开就满屏假警报。 */
  const SIBLING = { dig: "digkeep", digkeep: "dig", stallbuy: "stall", stallapp: "stall" };
  const starved = [], locked = [], declined = [];
  for (const k in avSeen) {
    if ((acts[k] || 0) > 0 || EXEMPT[k]) continue;
    if (SIBLING[k] && (acts[SIBLING[k]] || 0) > 0) { declined.push(k + "(兄弟 " + SIBLING[k] + "×" + acts[SIBLING[k]] + " 已选)"); continue; }
    (avSeen[k] >= STEPS * 0.01 ? starved : locked).push(k + "(" + Math.round(avSeen[k] / STEPS * 100) + "%)");
  }
  console.log("覆盖率：可做却从未被选 " + (starved.length ? starved.join(" ") : "无") +
    " ｜ 主动放弃(同档兄弟已被选) " + (declined.length ? declined.join(" ") : "无") +
    " ｜ 全程未解锁 " + (locked.length ? locked.join(" ") : "无"));
  /* loop 模式下只报不判：每一世都在重放 144 次突破，二档的 break 天然吃满决策位，
     这是"高速重放"的性质而非产品缺陷——覆盖率这把尺子是照"单世正常玩"校零的。 */
  /* 第二处口径下限（本轮实测出来的）：3h/4h 各跑两次都满屏"饿死"，6h/8h 各跑两次都是"无"。
     原因不是档位排错，而是低档动作（explore/trade/feed/dig…）只在"其它全在冷却"的空拍才浮出来，
     3h 全程 1892 次决策几乎都被 buy/attr/skill/tower/break 占满，样本不够就说不出饿死。
     所以判红需要 ≥6h 的样本；短跑照旧打印，但标成"样本不足"，不拿量具的分辨率去当产品的罪。 */
  const MIN_HOURS_FOR_STARVE = 6;
  if (starved.length && LOOP) console.log("   （loop 模式：只报不判）");
  else if (starved.length && HOURS < MIN_HOURS_FOR_STARVE) console.log("   （样本不足：仅 " + HOURS + "h，未满 " + MIN_HOURS_FOR_STARVE + "h 判据下限——低档动作要靠空拍才浮出，这里只报不判）");
  else if (starved.length) { console.log("   FAIL 档序饿死：" + starved.join(" ") + " 在 ≥1% 的决策位上一直可做，却一次都没被选——它排在某个'恒可做'的动作下面了"); process.exitCode = 1; }
  else if (starved.length) console.log("   （loop 模式：break 重放整世 progression，故本次不作判定）");
}
/* ---- 系统首开阶梯：回答"是不是按进度逐步开放"----
   谓词全部取自游戏自己的 availableActions（量具里不抄第二份解锁条件）。
   三个口径分开：从未可做（锁死）/ 可做却从未被选中（排在谁下面）/ 首开时刻与当时境界。 */
{
  /* story/idle 不是系统而是"这一拍不做主"的合法弃权，摆进阶梯只会被读成未解锁 */
  const EXEMPT_PRIM = ["story", "idle"];
  const ks = Object.keys(avAll).sort();
  const never = ks.filter(k => !avFirst[k] && !EXEMPT_PRIM.includes(k));
  const opened = ks.filter(k => avFirst[k]).sort((a, b) => avFirst[a].t - avFirst[b].t);
  console.log("\n系统首开阶梯（" + opened.length + " 个可做 · " + ks.length + " 个在册 · 从未可做 " + (never.length || 0) + "）：");
  const byRealm = {};
  opened.forEach(k => { const r = avFirst[k].realm; (byRealm[r] = byRealm[r] || []).push(k); });
  Object.keys(byRealm).map(Number).sort((a, b) => a - b).forEach(r => {
    const one = avFirst[byRealm[r][0]];
    console.log("  第 " + String(r).padStart(2) + " 境 " + String(one.lab).padEnd(12) + "@" + String((one.t / 60).toFixed(1)).padStart(7) + "min +" + String(byRealm[r].length).padStart(2) + " 个：" + byRealm[r].map(k => k + (avUsed[k] ? "" : "✗从未被选")).join(" "));
  });
  if (never.length) console.log("  从未可做：" + never.join(" "));
  const late = Object.keys(acts).filter(a => !avFirst[a] && !EXEMPT_PRIM.includes(a) && (acts[a] || 0) > 0);
  if (late.length) console.log("  （被选中过却不曾出现在可做表：" + late.join(" ") + "——主名/键名不一致，见本段口径）");
}
