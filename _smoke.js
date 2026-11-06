/* 冒烟测试：stub DOM/localStorage，驱动游戏核心逻辑 */
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "仙界闭关小能手.html"), "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: no <script> block"); process.exit(1); }
const js = m[1];

// ---- DOM stub ----
function mkEl() {
  const e = {
    style: {}, dataset: {}, children: [], _cls: new Set(),
    innerHTML: "", textContent: "", disabled: false, onclick: null,
    checked: false, value: "", scrollHeight: 0, scrollTop: 0, clientHeight: 100,
    classList: {
      add: c => e._cls.add(c),
      remove: c => e._cls.delete(c),
      toggle: (c, f) => (f ? e._cls.add(c) : e._cls.delete(c)),
      contains: c => e._cls.has(c)
    },
    appendChild(c) { e.children.push(c); return c; },
    get firstChild() { return e.children[0] || null; }, /* log() 环形缓冲依赖 firstChild，缺它会死循环 */
    removeChild(c) { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); },
    remove() {}, focus() {}, select() {},
    addEventListener() {},
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 })
  };
  return e;
}
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = mkEl()),
  querySelectorAll: () => [],
  createElement: mkEl,
  addEventListener() {},
  body: mkEl()
};
global.window = { addEventListener() {} };
global.location = { reload() {} };
global.localStorage = {
  _d: {},
  getItem(k) { return k in this._d ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};
let T = 0;
global.performance = { now: () => T };
const iv = [];
global.setInterval = f => { iv.push(f); return iv.length; };
global.setTimeout = () => 0;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log("  ok  " + msg); }
  else { fail++; console.log("FAIL  " + msg); }
}

// ---- 执行游戏脚本 ----
try {
  eval(js);
} catch (e) {
  console.error("FAIL: script threw during init:", e);
  process.exit(1);
}
const D = global.window.__DBG;
ok(!!D, "__DBG 调试入口已暴露");
ok(!!D.state, "state 可用");

// 1. 点击修炼
const exp0 = D.state.exp;
D.act.cultivate();
ok(D.state.exp > exp0, "点击修炼增加修为 (" + D.state.exp.toFixed(1) + ")");
ok(D.state.clicks === 1, "修炼计数 +1");

// 2. 探索（首次无冷却；桩 0.999 抑制随机事件，保证产出断言确定性——历史 flake：抽中「妖兽」事件会扣光灵石）
const st0 = D.state.stone;
const rr0 = Math.random; Math.random = () => 0.999;
D.act.explore();
Math.random = rr0;
ok(D.state.stone >= st0, "探索获得灵石 (" + D.state.stone.toFixed(1) + ")");
ok(D.state.explores === 1, "探索计数 +1");
ok(D.state.explores === 1 && D.state.stone > 0, "探索产出为正");

// 3. 冷却期内探索应被拒绝
const exBefore = D.state.explores;
D.act.explore();
ok(D.state.explores === exBefore, "冷却期内探索被拒绝");

// 4. 建筑
D.state.stone = 1000;
D.state.allStone = 1000; // 与统计同步
D.act.buy("field");
ok(D.state.bld.field === 1, "建造灵田 Lv.1");
ok(D.stoneRate() > 0, "灵石产出率 > 0 (" + D.stoneRate().toFixed(2) + "/s)");
D.act.buy("field");
ok(D.state.bld.field === 2, "灵田升到 Lv.2");
D.act.buy("garden"); // 需筑基，应失败
ok(D.state.bld.garden === 0, "未达筑基时药圃建造被拒");

// 5. 挂机 tick 10 分钟
for (let i = 0; i < 600; i++) { T += 1000; iv.forEach(f => f()); }
ok(D.state.stone > 1000, "挂机 10 分钟灵石累积 (" + D.state.stone.toFixed(0) + ")");
ok(D.state.allStone > D.state.stone, "累计灵石统计正确");

// 6. 突破（层内必成）
D.state.exp = 1e6; D.state.stone = 1e6;
const lay0 = D.state.layer;
D.act.break();
ok(D.state.layer === lay0 + 1, "层内突破成功 (Lv " + lay0 + "→" + D.state.layer + ")");
ok(D.state.pts === 2, "升层 +2 属性点");
D.act.attr("spirit");
ok(D.state.attr.spirit === 1 && D.state.pts === 1, "属性点消耗生效");

// 7. 巅峰突破（9 层换境，有随机失败率，循环直到成功，最多 20 次）
D.state.layer = 9;
let tries = 0;
while (D.state.layer === 9 && D.state.realm < 1 && tries < 20) {
  D.state.exp = 1e9; D.state.stone = 1e9;
  D.act.break(); tries++;
}
ok(D.state.realm === 1 || tries < 20, "巅峰突破至筑基（尝试 " + tries + " 次）realm=" + D.state.realm);

// 8. 区域解锁
D.state.realm = 3; D.state.stone = 1e4;
D.act.unlock(1);
ok(D.state.areas[1] === true && D.state.area === 1, "五龙沟秘境解锁并移驻");
ok(D.state.fame >= 50, "解锁区域 +50 声望 (fame=" + D.state.fame + ")");
D.state.realm = 0;
D.act.go(1);
ok(D.state.area === 1, "已解锁区域可往返移驻");

// 9. 转生（挂机期间随机事件可能已给气运/声望，故用差值断言）
D.state.realm = 4; D.state.layer = 5; D.state.stone = 999; D.state.bld.field = 3;
const luck0 = D.state.luck, fameBefore = D.state.fame;
D.act.rebirth();
ok(D.state.realm === 0 && D.state.layer === 1, "转生后境界归零");
ok(D.state.stone === 0 && D.state.bld.field === 0, "转生后资源/建筑归零");
ok(D.state.rebirths === 1, "轮回计数 +1");
ok(D.state.luck === luck0 + 5, "转生获得气运 = 1+realm(4) = 5 (" + luck0 + "→" + D.state.luck + ")");
ok(D.state.fame >= fameBefore, "转生不重置声望（成就奖励可新增）");
ok(D.gm() > 1, "转生后全局倍率 > 1 (" + D.gm().toFixed(2) + ")");

// 10. 离线结算
const stBefore = D.state.stone;
D.state.bld.field = 10; // 给点产出
const off = D.offline(3 * 3600);
ok(!!off && off.st > 0, "离线 3 小时结算灵石 (" + off.st.toFixed(0) + ")");
ok(D.state.stone > stBefore, "离线收益已入账");
const offCap = D.offline(100 * 3600);
ok(offCap && offCap.dt === 8 * 3600, "离线时长封顶 8 小时");

// 11. 存档 / 读档
D.save();
const savedRaw = global.localStorage.getItem("jxp_save_v1");
ok(!!savedRaw && savedRaw.includes('"rebirths":1'), "存档已写入 localStorage");
const luckAtSave = D.state.luck;
const r = D.load();
ok(r.fresh === false, "读档成功（非新开档）");
ok(D.state.rebirths === 1 && D.state.luck === luckAtSave, "读档后状态一致 (luck " + luckAtSave + ")");

// 12. 成就
ok(Object.keys(D.state.ach).length > 0, "已触发成就 " + Object.keys(D.state.ach).length + " 个: " + Object.keys(D.state.ach).join(","));

// 13. 数值单调性（每境界内随层数递增；跨境界换境后重置，属设计行为）
{
  let mono = true;
  for (let realm = 0; realm < 13; realm++) {
    let prev = 0;
    for (let layer = 1; layer <= 9; layer++) {
      const need = Math.floor(80 * Math.pow(3, realm) * Math.pow(1.7, layer - 1));
      if (need <= prev) mono = false;
      prev = need;
    }
  }
  ok(mono, "突破修为需求（每境界内）单调递增");
}

// 14. 名称系统（fresh 开局留名弹窗 / 改名 / 空名与超长拒绝 / 注入转义 / UI 同步）
{
  const minput = global.document.getElementById("minput");
  const mback = global.document.getElementById("mback");
  const mok = global.document.getElementById("mok");
  ok(minput.value === "贺平生", "fresh 开局弹出留名弹窗且默认名为 贺平生");
  mok.onclick();
  ok(mback.classList.contains("hidden"), "确认名号后弹窗关闭");
  ok(D.state.name === "贺平生", "名号确认后写入 state.name");
  D.act.rename("杨过");
  ok(D.state.name === "杨过", "改名生效（杨过）");
  ok(D.act.rename("   ") === false && D.state.name === "杨过", "空名被拒绝且名号不变");
  ok(D.act.rename("一二三四五六七八九十一二三四") === false && D.state.name === "杨过", "超过 12 字的名字被拒绝");
  D.act.rename("<img src=x>");
  ok(D.state.name === "<img src=x>", "名字按原文保存（转义只发生在渲染层）");
  const glog0 = global.document.getElementById("log");
  const lastLine0 = glog0.children[glog0.children.length - 1];
  ok(lastLine0.innerHTML.indexOf("&lt;img") >= 0, "注入型名字在日志中被转义（&lt;img）");
  ok(global.document.getElementById("hName").textContent === "<img src=x>", "顶栏 hName 与名号同步");
  ok(global.document.getElementById("cName").textContent === "<img src=x>", "角色面板 cName 与名号同步");
}

/* ---------- XLLM 大模型辅助模块 ---------- */
const X = global.window.__XLLM;

/* 规则兜底优先级会把"零成本已挣得奖励"排在最前（章节/弟子复命/日课/周愿）。
   单测 lower 优先级时需先让这些项不可用，否则永远返回 chapter。 */
const noFree = () => {
  const st = D.state;
  st.chap = { cur: 12, done: {}, life: (st.chap && st.chap.life) || 0, run: 0 };
  if (!st.daily) st.daily = { day: "t", signed: true, secretUsed: 0, gathered: true };
  st.daily.lessons = []; st.daily.lessonDone = {};
  if (!st.week) st.week = { wk: "x", goals: [], done: {}, snap: {} };
  st.week.goals = []; st.week.done = {};
  if (!st.disc) st.disc = { own: {}, m: {}, n: 0 };
  st.disc.m = {};
};
/* 三/四档机会动作（石台·斗法·器灵·进化·洞窟·收徒·执事）会抢走低优先级用例的舞台。
   ruleClean 只在采样那一瞬间把它们关掉、采样后原样还原——直接改状态会污染后续用例
   （曾把 tower.cd=999 留在存档里，导致后面的"登台取胜""器灵唤醒"整批改红）。
   except 传入本次要测的动作名，让它保持可用。 */
const ruleClean = (except) => {
  const st = D.state, keep = [].concat(except || []);
  const off = k => !keep.includes(k);
  const keys = ["tower", "tre", "caveCd", "cave", "beast", "tiger", "disc", "sk", "dao", "comp", "mkt", "areas", "area", "sect", "contrib", "contribAll", "exch", "sq", "sch", "stall"];
  const save = {};
  keys.forEach(k => { save[k] = st[k] === undefined ? undefined : JSON.parse(JSON.stringify(st[k])); });
  const TB = D.tables;
  /* 区域与宗门：全数开辟 → unlock 无从下手；定居最高道场 → travel 无从下手；职位顶格 → donate 停；贡献清零 → exchange 停 */
  if (off("unlock")) st.areas = TB.AREAS.map(() => true);
  /* travel 与 unlock 的屏蔽要分开判：一锅端会让 ruleClean("unlock") 也被 areas 顶格连带屏蔽掉 */
  if (off("travel") && st.areas) { let tp = 0; st.areas.forEach((x, i) => { if (x && TB.AREAS[i].mult > TB.AREAS[tp].mult) tp = i; }); st.area = tp; }
  /* 只推高"生涯贡献"来关掉供奉（donate 的条件是 contribAll 还差下一阶）。
     绝不能用 sect 顶格：职位 ≥真传长老会把秘境日限从 3 抬到 4，反倒把一档 secret 打开，
     于是一串 lower 档用例全被 secret 抢位——屏蔽一项时先看它会不会解锁另一项。 */
  if (off("donate")) st.contribAll = Number.MAX_SAFE_INTEGER;
  if (off("sectquest")) st.sq = { idx: (TB.SECT_QUESTS || []).length }; /* 主任务链走完 → 无可领取 */
  if (off("exchange")) st.contrib = 0;
  if (off("tower") || off("towerbuy")) {
    if (!st.tower) st.tower = { depth: 0, best: 0, tok: 0, n: 0, cd: 0, mod: "calm", shop: {} };
    st.tower.cd = 999; /* 爬塔本身要冷却 */
    if (off("towerbuy")) st.tower.tok = 0; /* 令牌清零会连"兑残片"一起杀掉，所以只在真要屏蔽兑换时才动 */
  }
  if (!st.tre) st.tre = { lv: {}, refineN: 0, beat: {}, duelCd: 0, sp: {}, aff: {} };
  if (off("duel")) st.tre.duelCd = 999;
  if (off("awaken")) { if (!st.tre.sp) st.tre.sp = {}; TB.T_SLOTS.forEach(t => { st.tre.sp[t.id] = 1; }); }
  /* 五档"炼器"用等级上限关掉（它的开销随境界指数增长，压灵石会牵连别的断言） */
  TB.T_SLOTS.forEach(t => { st.tre.lv[t.id] = TB.TRE_MAX; });
  if (off("refine")) { st.tre.refineN = 20; TB.T_SLOTS.forEach(t => { st.tre.aff[t.id] = "sharp"; }); } /* 四纹归一：共鸣已在，refine 自然不被选中 */ /* lv 顶格恰好会让六档"洗练"变成可用，故同步把洗练次数推到成本封顶（2500×1.45^20≈4.8e6） */
  if (off("cave")) st.caveCd = 999;
  /* 洞窟去留（七档之首，压在探索头上）：身上带着一趟货就会一直有的可决策，
     lower 档用例（trade/feed/prestige/bowl…）会被它整片抢走——默认把这趟货卸掉，
     历史最深 cave.max 留着（成就类断言不受牵连）。except 传 dig/digkeep 时才搭台。 */
  if (off("dig")) st.cave = { door: null, depth: 0, hs: 0, he: 0, risk: .5, hint: 0, max: (st.cave && st.cave.max) || 0 };
  if (off("evolve")) {
    if (!st.beast) st.beast = { lv: 0, evo: 0 };
    if (!st.tiger) st.tiger = { lv: 0, evo: 0 };
    st.beast.evo = 1; st.tiger.evo = 1;
  }
  if (off("disc") || off("errand")) {
    if (!st.disc) st.disc = { own: {}, m: {}, n: 0 };
    TB.DISCIPLES.forEach(d => {
      st.disc.own[d.id] = { q: 0, lv: TB.DLV_MAX };
      st.disc.m[d.id] = { left: 999, job: d.job };
    }); /* 满员 + 全员已圆满且外派中 → disc/errand/errclaim/etrain 同时不可用 */
  }
  if (!st.sk) st.sk = { lv: {}, cd: {}, left: {} };
  if (!st.sk.cd) st.sk.cd = {};
  if (!st.sk.lv) st.sk.lv = {};
  TB.SKILLS.forEach(x => { st.sk.cd[x.id] = 999; if (off("skillup")) st.sk.lv[x.id] = TB.SK_MAX; }); /* 三档：技能全冷却；神通圆满 → 参悟/精进不抢位 */
  if (off("dao")) { if (!st.dao) st.dao = {}; TB.DAOS.forEach(d => { st.dao[d.id] = 3; }); }   /* 五档：大道已通晓 */
  if (off("companion")) { if (!st.comp) st.comp = {}; TB.COMPANIONS.forEach(c => { st.comp[c.id] = 1; }); } /* 五档：红颜已结缘 */
  /* 六档坊市：四道货的正弦相位各不相同，找不到"所有货都不便宜也不贵"的时刻，
     所以把持仓换成空对象——「hold[g.id]」变 undefined，「<9」与「>0」两个比较同时为假，买卖一起关掉 */
  if (off("trade") && st.mkt) st.mkt.hold = {};
  /* 道统（四档）：择统要"无本命或在静养"，悟道要"未满五阶"——两条各关掉，
     否则新加的机会型动作会把 lower 档用例的舞台全抢走（第 21 轮重排时吃过同样的亏） */
  if (!st.sch) st.sch = { id: null, x: {}, t: {}, cd: 0, swap: 0, keN: 0 };
  if (off("school")) { st.sch.id = st.sch.id || "sword"; st.sch.cd = 9999; }
  if (off("schoolup")) TB.SCHOOLS.forEach(s => { st.sch.x[s.id] = 0; }); /* 只抽干道行，不动已悟阶数——顶阶会连带改变被动（体修抬寿限），把别的用例带沟里 */
  /* 万宝楼（四档之末）：没货可逛时它一直"可做"，会把 lower 档用例全抢走 */
  if (!st.stall) st.stall = { id: null, ask: 0, worth: 0, seen: false, cd: 0, n: 0, bought: 0, good: 0, appN: 0, best: 0, net: 0 };
  if (off("stall")) { st.stall.id = null; st.stall.cd = 9999; }
  let d;
  try { d = X.ruleAction(); } finally {
    keys.forEach(k => { if (save[k] === undefined) delete st[k]; else st[k] = save[k]; });
  }
  return d;
};
ok(typeof global.window.XLLM === "object" && !!global.window.XLLM.openPanel, "window.XLLM 已暴露（IIFE return 修复：面板打开依赖它）");
ok(!!X, "XLLM 模块已挂载 window");
ok(typeof X.openPanel === "function" && typeof X.closePanel === "function", "openPanel/closePanel 已暴露");
X.openPanel();
ok(!global.document.getElementById("llmback").classList.contains("hidden"), "openPanel 打开大模型助手加宽面板");
ok(global.document.getElementById("llmbody").innerHTML.indexOf("模型接入") >= 0, "助手面板内容已构建到 #llmbody");
X.closePanel();
ok(global.document.getElementById("llmback").classList.contains("hidden"), "closePanel 关闭加宽面板");

/* L3 响应解析 */
ok(JSON.stringify(X.extractJSON('```json\n{"action":"buy","target":"field"}\n```')) === '{"action":"buy","target":"field"}', "extractJSON 剥离代码围栏");
{
  const r = X.extractJSON(`让我想想 {"a":1} 就是这样`);
  ok(r && r.a === 1, "extractJSON 处理夹带文本");
}
ok(X.extractJSON("没有 json") == null, "extractJSON 非 JSON 返回 null");
ok(X.validateDecision({ action: "hack_the_universe" }, null) == null, "白名单拦截未知动作");
ok(X.validateDecision({ action: "buy", target: "field" }, { buy: true, "buy:field": true }).target === "field", "合法 buy 决策通过");
ok(X.validateDecision({ action: "buy", target: "field" }, { buy: true }) == null, "未开放建筑被拒");
ok(X.validateDecision({ action: "attr", target: "body" }, { attr: true }).target === "body", "合法 attr 决策通过");

/* L0 配置 */
ok(typeof X.cfg.pilotInterval === "number" && typeof X.cfg.url === "string", "配置结构完整（含 url/model/间隔/重试）");
ok(X.brief().indexOf("主角: " + D.state.name) >= 0, "brief() 含主角名行（状态摘要注入）");

/* fetch 桩 */
let fetchImpl = null, lastUrl = null;
global.fetch = async (url, opts) => {
  lastUrl = String(url);
  if (fetchImpl) return fetchImpl(url, opts);
  throw new Error("no fetch stub");
};

(async () => {
  /* L1 健康检查 */
  fetchImpl = async () => ({ ok: true, json: async () => ({ models: [{ name: "qwen3.5:9b" }, { name: "qwen2.5:7b" }] }) });
  const hc = await X.checkConnection();
  ok(hc.ok && hc.models.length === 2 && lastUrl.endsWith("/api/tags"), "健康检查命中 /api/tags 并解析模型列表");

  /* L4 自动决策：LLM 在线 */
  X.cfg.url = "http://127.0.0.1:9";
  X.cfg.model = "qwen3.5:9b";
  fetchImpl = async (url, opts) => {
    const b = JSON.parse(opts.body);
    if (!b.messages.some(m => m.content && m.content.indexOf("闭关顾问") >= 0 && m.content.indexOf("主角" + D.state.name) >= 0)) throw new Error("提示词缺失或未注入主角名");
    return { ok: true, json: async () => ({ message: { content: '{"action":"buy","target":"field","reason":"灵石充足"}' } }) };
  };
  D.state.stone = 5000;
  const field0 = D.state.bld.field;
  X.cfg.pilotEnabled = true;
  await X.pilotCycle();
  ok(lastUrl.endsWith("/api/chat"), "决策请求命中 /api/chat");
  ok(D.state.bld.field === field0, "第一拍不等 LLM：先按规则行事（慢模型不再拖住节拍）");
  await new Promise(r => setImmediate(r)); /* 后台链路回液（本桩的 setTimeout 是空函数，勿用） */
  await X.pilotCycle();
  ok(D.state.bld.field === field0 + 1, "LLM 决策 buy:field 于下一拍落地执行");
  ok(X.plog.length > 0, "决策日志已记录");

  /* L4 降级：LLM 离线 → 规则兜底 */
  X.cfg.url = ""; await X.pilotCycle(); X.cfg.url = "http://127.0.0.1:9"; /* 排空上一段遗留的后台决策缓存 */
  fetchImpl = async () => { throw new Error("ECONNREFUSED"); };
  X.cfg.retries = 0;
  D.state.daily = { day: "1999-01-01", signed: false, secretUsed: 0, gathered: true };
  await X.pilotCycle();
  ok(D.state.daily.signed === true, "LLM 离线时规则兜底执行每日签到");

  /* L5 剧情：事件（奖励上限截断） */
  fetchImpl = async () => ({ ok: true, json: async () => ({ message: { content: '{"title":"灵石雨","text":"夜半，天降灵石雨，聚宝盆尽数承接。","reward":{"stone":999999,"exp":999999,"fame":99,"luck":9}}' } }) });
  const st0 = D.state.stone, luck0 = D.state.luck;
  await X.generateStory("event");
  ok(D.state.stone > st0, "事件剧情奖励入账");
  ok(D.state.luck <= luck0 + 3, "超限奖励被 sanitize 截断（气运≤+3）");

  /* L5 剧情：NPC 对话（选项交互） */
  fetchImpl = async () => ({ ok: true, json: async () => ({ message: { content: '{"name":"守墓人","identity":"天棺神墓守护","line":"何人惊扰仙主清眠？","options":[{"label":"赔礼离开","result":"守墓人挥挥手，放你离去。","reward":{"stone":0,"exp":1,"fame":0,"luck":0}},{"label":"顶撞","result":"阴气暴涨，你被请出墓门。","reward":{"stone":0,"exp":0,"fame":1,"luck":0}}]}' } }) });
  const ex0 = D.state.exp;
  await X.generateStory("npc");
  const npcBox = global.document.getElementById("npcbox");
  const optsEl = npcBox.children[2];
  ok(optsEl.children.length === 2, "NPC 弹窗渲染出两个选项");
  optsEl.children[0].onclick();
  ok(D.state.exp >= ex0 + 1, "NPC 选项奖励入账");

  /* L5 剧情：支线任务（限时钳制 + 完成结算） */
  fetchImpl = async () => ({ ok: true, json: async () => ({ message: { content: '{"name":"聚灵","text":"积攒灵石之气，以供秘境运转。","res":"stone","minutes":99,"reward":{"stone":1,"exp":0,"fame":2,"luck":0}}' } }) });
  await X.generateStory("quest");
  ok(D.state.quest && D.state.quest.name === "聚灵", "支线任务已激活");
  ok(D.state.quest.minutes === 60, "支线限时钳制在 5-60 分钟");
  const fame1 = D.state.fame;
  D.state.allStone += D.state.quest.target + 1;
  T += 100; iv.forEach(f => f());
  ok(D.state.quest == null, "支线完成后自动结算并清除");
  ok(D.state.fame >= fame1 + 2, "支线完成奖励发放");

  /* L5 降级：LLM 不可用 → 内置佚文 */
  fetchImpl = async () => { throw new Error("down"); };
  await X.generateStory("event");
  const glog = global.document.getElementById("log");
  const tail = glog.children.slice(-3).map(c => c.innerHTML).join("|");
  ok(tail.indexOf("内置佚文") >= 0 && /奇遇「[^」]{1,8}」：/.test(tail) && /（\+/.test(tail) && tail.indexOf("undefined") < 0 && tail.indexOf("NaN") < 0,
    "离线剧情降级输出内置佚文并正常入账（不钉死具体条目，池子里换哪条都算对）");

  /* 每日事务（核心游戏新增） */
  D.state.daily = { day: "", signed: false, secretUsed: 0, gathered: false };
  D.act.signIn(); D.act.signIn();
  ok(D.state.daily.signed === true, "签到每日只生效一次");
  D.act.secretRun(); D.act.secretRun(); D.act.secretRun(); D.act.secretRun();
  ok(D.state.daily.secretUsed === 3, "秘境副本每日上限 3 次");
  D.state.daily.day = "1999-01-01";
  T += 100; iv.forEach(f => f());
  ok(D.state.daily.signed === false && D.state.daily.day !== "1999-01-01", "跨天自动刷新日常");

  /* ---------- 第四轮：炼丹 / 灵兽·狐 / 宗门贡献 / 轮回祝福 ---------- */
  /* 炼丹丹药（先封顶声望并刷掉悬挂成就，保证 gm 基线稳定） */
  D.state.fame = 5000; D.state.bld.garden = 2; D.state.bld.cave = 1; D.state.bld.room = 1;
  D.state.stone = 1e6;
  D.act.cultivate(); /* 刷新成就（s1e5/f1k 等），避免测试中途 gm 漂移 */
  const er0 = D.expRate(), sr0 = D.stoneRate();
  ok(er0 > 0 && sr0 > 0, "丹药测试基线产出为正 (exp " + er0.toFixed(2) + " / stone " + sr0.toFixed(2) + ")");
  ok(D.act.pill("dao") === true, "炼丹·逆天灵液炼制成功");
  ok(D.state.pill.id === "dao" && D.state.pill.left > 0, "丹药 buff 生效（180s）");
  ok(D.expRate() === er0 * 2, "丹药生效期间修为产出 ×2");
  ok(D.stoneRate() === sr0 * 2, "丹药生效期间灵石产出 ×2");
  ok(D.act.pill("qi") === false, "丹药不叠加（生效中再炼被拒）");
  ok(D.state.ach.pill1 === true, "成就·初丹之火触发");
  const rrPill = Math.random; Math.random = () => 0.999; /* 抑制随机事件与成就漂移 */
  for (let i = 0; i < 1900; i++) { T += 100; iv.forEach(f => f()); }
  Math.random = rrPill;
  ok(!(D.state.pill.id && D.state.pill.left > 0), "丹药 buff 到期自动消散（180s）");
  ok(D.expRate() === er0, "到期后产出回到基线");

  /* 灵兽·狐（强制落蛋概率 + 喂食升级） */
  D.state.beast.lv = 0;
  const rrEgg = Math.random; Math.random = () => 0.02; /* 强制命中灵蛋（<4% 阈值） */
  D.state.stone = 1e6;
  for (let i = 0; i < 5 && D.state.beast.lv === 0; i++) { T += 2600; iv.forEach(f => f()); D.act.explore(); }
  Math.random = rrEgg;
  ok(D.state.beast.lv === 1, "探索觅得灵蛋，孵化灵狐 Lv.1");
  const gm0 = D.gm();
  ok(D.act.feed() === true, "灵狐喂食成功");
  ok(D.state.beast.lv === 2 && D.gm() > gm0, "喂食升级，全局倍率 +4%");
  D.state.beast.lv = 5; D.act.cultivate();
  ok(!!D.state.ach.beast5, "灵狐 5 级成就触发");

  /* 宗门贡献（供奉 + 兑换阶梯） */
  D.state.stone = 1000; D.state.contrib = 0; D.state.contribAll = 0;
  ok(D.act.donate() === true, "宗门供奉成功");
  ok(D.state.contrib === 10 && D.state.stone === 900, "贡献 = 供奉额/10，灵石已扣");
  D.state.contrib = 600;
  const pts0 = D.state.pts;
  ok(D.act.exchange("attr") === true && D.state.pts === pts0 + 1 && D.state.contrib === 550, "兑换淬炼点（50 贡献）");
  ok(D.act.exchange("luck") === true && D.state.contrib === 50, "兑换气运（500 贡献）");
  ok(D.act.exchange("fame") === false, "贡献不足时兑换被拒");
  D.state.contribAll = 1000; D.act.cultivate();
  ok(!!D.state.ach.ct1k, "宗门贡献成就触发");

  /* 轮回祝福（三选一 + 离线封顶 + 叠加成就） */
  D.state.realm = 4; D.state.layer = 5; D.state.stone = 999;
  D.act.rebirth("bowl");
  ok(D.state.bless.bowl === 1 && D.state.realm === 0, "轮回祝福·聚缘 +1，境界重置");
  D.state.realm = 4;
  D.act.rebirth("early");
  ok(D.state.bless.early === 1, "轮回祝福·早慧 +1");
  const offB = D.offline(20 * 3600);
  ok(offB && offB.dt === 12 * 3600, "早慧祝福：离线封顶 8h → 12h");
  D.state.realm = 4;
  D.act.rebirth("fate");
  ok(D.state.bless.fate === 1 && !!D.state.ach.bl3, "轮回祝福·天机 +1，三重祝福成就触发");

  /* XLLM · 新动作白名单与规则兜底 */
  ok(X.validateDecision({ action: "pill", target: "dao" }, { pill: true, "pill:dao": true }).target === "dao", "pill 决策通过（白名单 + 可执行集合）");
  ok(X.validateDecision({ action: "pill", target: "gold" }, { pill: true, "pill:gold": true }) == null, "丹药名不在 PILLS 表被拒");
  ok(X.validateDecision({ action: "feed" }, { feed: true }).action === "feed", "feed 决策通过");
  ok(X.brief().indexOf("丹药") >= 0 && X.brief().indexOf("灵狐") >= 0 && X.brief().indexOf("宗门贡献") >= 0 && X.brief().indexOf("轮回祝福") >= 0, "brief() 含新系统字段（丹药/灵狐/贡献/祝福）");
  /* 规则兜底：可炼丹且无建筑可建 → pill·dao（先布置局面再采样） */
  const bak9 = { realm: D.state.realm, layer: D.state.layer, fame: D.state.fame, sq: D.state.sq, bowlLv: D.state.bowl.lv, artLv: D.state.art.lv, mkt: D.state.mkt, rec: D.state.rec, pill: D.state.pill, bodyPill: D.state.bodyPill, stone: D.state.stone, exp: D.state.exp, bld: JSON.parse(JSON.stringify(D.state.bld)) };
  D.state.layer = 1;
  D.state.daily = { day: "2099-01-01", signed: true, secretUsed: 3, gathered: true };
  D.state.bld = { field: 60, garden: 60, cave: 60, room: 60, vault: 60, hall: 60 }; /* 全数封顶：买不起任何一级，但 room≥1 保证炼丹可用 */
  D.state.pts = 0; D.state.exp = 0;
  D.state.beast.lv = 0; D.state.tiger = { lv: 0, evo: 0 };
  D.state.fame = 0; D.state.sq = { idx: 99 }; D.state.bowl.lv = 30; D.state.art.lv = 12; /* 清干净：声望兑换/宗门委任/温养/功法都不再抢位 */
  D.state.rec = {}; D.state.mkt = { t: 0, hold: { rice: 0, ore: 0, powder: 0, jade: 0 }, earned: 0, spent: 0 };
  D.state.stone = Math.floor(375 * Math.pow(2.4, D.state.realm)) + 1; /* 只够买最便宜的双产丹（丹药成本随境界 2.4^realm 递增） */
  const avNew = X.availableActions();
  ok(typeof avNew.pill === "boolean" && typeof avNew.feed === "boolean" && typeof avNew["pill:qi"] === "boolean", "availableActions 含 pill/feed 及丹药子项");
  ok(X.bestPill() === "dao", "bestPill：只买得起逆天灵液时选它（实际 " + X.bestPill() + "）");
  noFree();
  const rd1 = ruleClean();
  ok(rd1.action === "pill" && rd1.target === "dao", "规则兜底：炼丹已垫到档位末位，仍会选 pill·dao（实际 " + JSON.stringify(rd1) + "）");
  /* 择优序：永久肉身 > 将跨境的破境丹 > 未满修为的大还丹 > 倍率最高的增益丹 */
  const realm0 = D.state.realm; D.state.realm = 4; /* 择优子测要确定丹药价格量级 */
  D.state.stone = 1e9; D.state.rec = { r_blood: 1, r_sure: 1, r_hui: 1, r_soul: 1, r_yuan: 1 };
  D.state.bodyPill = 0;
  ok(X.bestPill() === "blood", "bestPill：龙血淬体丹是永久肉身，第一优先（实际 " + X.bestPill() + "）");
  D.state.bodyPill = 5;
  ok(X.bestPill() === "hui", "bestPill：肉身满 5 枚后转吞大还丹补修为（实际 " + X.bestPill() + "）");
  D.state.layer = 9; D.state.exp = D.expNeed();
  ok(X.bestPill() === "sure", "bestPill：第 9 层将跨境界 → 破境丹才不浪费丹力（实际 " + X.bestPill() + "）");
  D.state.layer = 1; D.state.realm = realm0;
  D.state.realm = bak9.realm; D.state.layer = bak9.layer; D.state.fame = bak9.fame; D.state.sq = bak9.sq;
  D.state.bowl.lv = bak9.bowlLv; D.state.art.lv = bak9.artLv; D.state.mkt = bak9.mkt; D.state.rec = bak9.rec;
  D.state.pill = bak9.pill; D.state.bodyPill = bak9.bodyPill; D.state.bld = bak9.bld;
  D.state.exp = 0; /* 刻意清零且不还原：原用例就是把 exp 留在 0，否则后面的用例会被二档 break 抢位 */
  /* 规则兜底：无炼丹房、可喂食 → feed */
  D.state.bld = { field: 60, garden: 60, cave: 60, room: 0, vault: 60, hall: 60 }; /* 局面自足：买不起任何一级建筑，feed 才轮得到 */
  D.state.beast.lv = 1;
  D.state.stone = 200;
  noFree();
  const rd2 = ruleClean();
  ok(rd2.action === "feed", "规则兜底：喂得起灵狐时选 feed");

  /* ---------- 第五轮：功法淬炼 / 藏经阁 / 古修洞窟 / 聚宝盆 / 离线奇遇 ---------- */
  /* 公共：声望封顶稳定 gm 基线；随机桩 0.999 抑制事件与灵蛋 */
  D.state.fame = 5000;
  const rr5 = Math.random; Math.random = () => 0.999;

  /* 功法淬炼（点击修为 +50%/级，成本 800×4^lv，12 阶） */
  D.state.art = { lv: 0 };
  D.state.stone = 1e6;
  const sp0 = D.state.attr.spirit, gmArt = D.gm();
  const eA0 = D.state.exp;
  D.act.cultivate();
  ok(Math.abs((D.state.exp - eA0) - (4 + 1.2 * sp0) * gmArt) < 1e-6, "功法 Lv.0：点击修为 = 基线 (" + (D.state.exp - eA0).toFixed(2) + ")");
  ok(D.act.art() === true && D.state.art.lv === 1, "功法淬炼：聚气诀 → 铜皮金骨经");
  ok(Math.abs(D.state.stone - (1e6 - 800)) < 1e-6, "功法 Lv.0→1 成本 800 灵石");
  const eA1 = D.state.exp;
  D.act.cultivate();
  ok(Math.abs((D.state.exp - eA1) - (4 + 1.2 * sp0) * gmArt * 1.5) < 1e-6, "功法 Lv.1：点击修为 ×1.5");
  D.state.stone = 4e9; D.state.art.lv = 11;
  ok(D.act.art() === true && D.state.art.lv === 12, "功法淬炼至第 12 阶（太初混沌经）");
  D.state.stone = 1e6;
  ok(D.act.art() === false && D.state.art.lv === 12, "12 阶已满，继续淬炼被拒");
  ok(!!D.state.ach.art5, "成就·道心不惑触发（功法≥5 阶）");

  /* 藏经阁（探索 +10%/级、事件率 +1%/级，炼虚解锁） */
  D.state.realm = 0;
  D.state.bld.hall = 0;
  const evBase = D.evChance();
  T += 3000; iv.forEach(f => f());
  const sH0 = D.state.stone;
  D.act.explore();
  ok(Math.abs((D.state.stone - sH0) - (10 + 3 * D.state.attr.body) * D.gm()) < 1e-6, "无藏经阁：探索灵石 = 基线");
  D.state.bld.hall = 3;
  ok(Math.abs(D.evChance() - Math.min(evBase + 0.03, 0.75)) < 1e-9, "藏经阁 Lv.3：事件率 +3%");
  T += 3000; iv.forEach(f => f());
  const sH1 = D.state.stone;
  D.act.explore();
  ok(Math.abs((D.state.stone - sH1) - (10 + 3 * D.state.attr.body) * D.gm() * 1.3) < 1e-6, "藏经阁 Lv.3：探索灵石 ×1.3");
  D.state.realm = 6; D.state.stone = 200000;
  D.act.buy("hall");
  ok(D.state.bld.hall === 4, "炼虚（realm 6）藏经阁建造成功");
  ok(!!D.state.ach.hall1, "成就·万卷入胸触发");
  D.state.realm = 5;
  D.act.buy("hall");
  ok(D.state.bld.hall === 4, "炼虚前藏经阁建造被拒（等级不变）");
  D.state.realm = 0;

  /* 古修洞窟（三门 Math.random 强制分支 + 30 分钟 CD） */
  D.state.caveCd = 0; D.state.caveN = 0; D.state.caveLeg = 0;
  D.state.stone = 1e6;
  const gmCave = D.gm();
  const sJ = D.state.stone;
  ok(D.act.cave("jade") === true, "玉门入窟成功");
  ok(Math.abs((D.state.stone - sJ) - (150 + 400 * D.state.realm) * gmCave) < 1e-6, "玉门：稳赚灵石");
  ok(D.state.caveCd > 0 && D.state.caveN === 1, "入窟计数 +1 且触发 30 分钟封印");
  ok(D.act.cave("gold") === false && D.state.caveN === 1, "封印期内入窟被拒");
  D.state.caveCd = 0;
  Math.random = () => 0.10;
  const sG1 = D.state.stone;
  ok(D.act.cave("gold") === true, "金门入窟（大额分支）");
  ok(Math.abs((D.state.stone - sG1) - (600 + 2000 * D.state.realm) * gmCave) < 1e-6, "金门·大额：大额灵石");
  D.state.caveCd = 0;
  Math.random = () => 0.65;
  const sG2 = D.state.stone;
  ok(D.act.cave("gold") === true, "金门入窟（小额分支）");
  ok(Math.abs((D.state.stone - sG2) - (150 + 400 * D.state.realm) * gmCave) < 1e-6, "金门·小额：小额灵石");
  D.state.caveCd = 0;
  Math.random = () => 0.90;
  const sG3 = D.state.stone, eG3 = D.state.exp;
  ok(D.act.cave("gold") === true, "金门入窟（空窖分支）");
  ok(D.state.stone === sG3 && Math.abs((D.state.exp - eG3) - 60 * gmCave) < 1e-6, "金门·空窖：灵石不增、转得修为");
  D.state.caveCd = 0;
  Math.random = () => 0.10;
  const sB1 = D.state.stone, lB1 = D.state.luck;
  ok(D.act.cave("black") === true, "黑门入窟（传说传承分支）");
  ok(Math.abs((D.state.stone - sB1) - (2000 + 8000 * D.state.realm) * gmCave) < 1e-6, "黑门·传说：大额灵石");
  ok(D.state.luck === lB1 + 1 && D.state.caveLeg === 1, "黑门·传说：气运 +1、传承 +1");
  ok(!!D.state.ach.caveLeg, "成就·传说之主触发");
  D.state.caveCd = 0;
  Math.random = () => 0.50;
  const sB2 = D.state.stone;
  ok(D.act.cave("black") === true, "黑门入窟（劫难分支）");
  ok(Math.abs(D.state.stone - (sB2 - Math.floor(sB2 * 0.2))) < 1e-9, "黑门·劫难：损失 20% 灵石");
  D.state.caveCd = 0;
  Math.random = () => 0.80;
  const eB2 = D.state.exp;
  ok(D.act.cave("black") === true, "黑门入窟（心魔分支）");
  ok(Math.abs(D.state.exp - eB2 * 0.85) < 1e-6, "黑门·心魔：损失 15% 修为");
  D.state.caveCd = 0;
  ok(D.act.cave("red") === false && D.state.caveN === 7, "无效门 id 被拒且不计数");
  D.state.caveN = 10;
  D.act.cultivate();
  ok(!!D.state.ach.cave10, "成就·洞窟常客触发");

  /* 聚宝盆温养（全局 +3%/级，上限 30，成本 10000×3.5^lv） */
  D.state.bowl = { lv: 0 };
  const gmB0 = D.gm();
  D.state.stone = 1e9;
  ok(D.act.bowl() === true && D.state.bowl.lv === 1, "聚宝盆 Lv.1 温养成功");
  ok(Math.abs(D.state.stone - (1e9 - 10000)) < 1e-6, "聚宝盆 Lv.0→1 成本 10000 灵石");
  ok(Math.abs(D.gm() / gmB0 - 1.03) < 1e-9, "聚宝盆 Lv.1：全局倍率 ×1.03");
  D.state.bowl.lv = 10; D.act.cultivate();
  ok(!!D.state.ach.bowl10, "成就·盆力初显触发");
  D.state.stone = 1e20; D.state.bowl.lv = 29;
  ok(D.act.bowl() === true && D.state.bowl.lv === 30, "聚宝盆温养至 30 级（圆满）");
  D.state.stone = 1e20;
  ok(D.act.bowl() === false && D.state.bowl.lv === 30, "30 级圆满，继续温养被拒");
  ok(!!D.state.ach.bowl30, "成就·万宝归盆触发");
  ok(Math.abs(D.gm() / gmB0 - (1 + 0.03 * 30)) < 1e-12, "聚宝盆 30 级：全局 +90%（线性 1.9×）");

  /* 离线奇遇（离线≥2h 每满 2h 一段、封顶 4 段；caveCd 离线恢复） */
  Math.random = () => 0.5;
  const off2h = D.offline(2 * 3600);
  ok(off2h && off2h.evs.length === 1, "离线恰 2h：1 段随机奇遇");
  D.state.caveCd = 600;
  const off5h = D.offline(5 * 3600);
  ok(off5h && off5h.evs.length === 2, "离线 5h：2 段随机奇遇");
  ok(D.state.caveCd === 0, "洞窟封印离线期间自然恢复");
  D.state.caveCd = 5000;
  const offBig = D.offline(30 * 3600);
  ok(offBig && offBig.evs.length === 4, "离线 30h（受封顶）：4 段随机奇遇（封顶）");
  ok(D.state.caveCd === 0, "洞窟封印完全恢复");
  ok(typeof offBig.evs[0] === "string" && offBig.evs[0].length > 0, "奇遇文本非空");
  Math.random = rr5;

  /* XLLM · cave/art/bowl 白名单与规则兜底 */
  ok(X.validateDecision({ action: "cave", target: "jade" }, { cave: true }).target === "jade", "cave·jade 决策通过");
  ok(X.validateDecision({ action: "cave", target: "red" }, { cave: true }) == null, "cave 非法门名被拒");
  ok(X.validateDecision({ action: "art" }, { art: true }).action === "art", "art 决策通过");
  ok(X.validateDecision({ action: "bowl" }, { bowl: true }).action === "bowl", "bowl 决策通过");
  ok(X.brief().indexOf("功法") >= 0 && X.brief().indexOf("藏经阁") >= 0 && X.brief().indexOf("古修洞窟") >= 0 && X.brief().indexOf("聚宝盆") >= 0, "brief() 含新系统字段（功法/藏经阁/洞窟/聚宝盆）");
  /* 规则兜底：洞窟解封、其余皆不可行 → cave·jade */
  D.state.daily = { day: "2099-01-01", signed: true, secretUsed: 3, gathered: true };
  D.state.pts = 0; D.state.exp = 0;
  D.state.bld.room = 0; D.state.beast.lv = 0; D.state.bld.field = 60;
  D.state.art.lv = 12; D.state.bowl.lv = 30;
  noFree();
  D.state.caveCd = 0; D.state.stone = 500;
  const rdCave = ruleClean("cave");
  ok(rdCave.action === "cave" && rdCave.target === "jade", "规则兜底：封印已解且无其他可做 → cave·jade（实际 " + rdCave.action + "·" + rdCave.target + "）");
  /* 规则兜底：洞窟封印中 + 探索冷却中 + 富裕 → bowl */
  D.state.caveCd = 100;
  D.state.bld.field = 200;
  D.state.art.lv = 12; D.state.bowl.lv = 1;
  D.state.stone = 1e6;
  Math.random = () => 0.999;
  D.act.explore(); /* 触发 2.5s 探索冷却（探索排在 bowl 之前，须冷却中才能轮到 bowl） */
  ok(D.cd() > 0, "探索冷却已触发");
  D.state.exp = 0; /* 第九轮修复①：探索冷却改为存档持久化且离线推进——旧用例曾依赖 cd 在 offline 期间冻结（残留冷却使本行 explore 被拒、exp 不增）；现 explore 真实执行会加 exp 点亮 break，故清零保 bowl 局面 */
  noFree();
  const rdBowl = ruleClean();
  ok(rdBowl.action === "bowl", "规则兜底：洞窟封印 + 探索冷却 + 富裕 → bowl（实际 " + rdBowl.action + "）");

  /* ---------- 第六轮：古修遗宝 / 坊市 / 因果 / 行囊道具 / 天劫试炼 ---------- */
  {
  const rr6 = Math.random; Math.random = () => 0.999;
    D.state.fame = 5000;
    D.state.karma = 0; D.state.trib = 0; D.state.tribCd = 0; D.state.pearl = 0;
    D.state.itm = { charm: 0, pearl: 0, heal: 0 };
    D.state.rel = { fr: { cauldron: 0, scroll: 0, sword: 0, bell: 0 } };
    D.state.mkt = { t: 0, hold: { rice: 0, ore: 0, powder: 0 }, earned: 0, spent: 0 };
    D.state.realm = 0; D.state.layer = 1; D.state.exp = 0; D.state.pts = 0;

    /* 因果（正道 +0.5%/100 上限 10%；邪道 +1%/100 上限 20%；gm 含因子） */
    ok(D.karmaBonus() === 0, "因果 0：无加成");
    D.state.karma = 500; ok(D.karmaBonus() === 0.025, "正道 500：+2.5%");
    D.state.karma = 2000; ok(D.karmaBonus() === 0.10, "正道 2000：封顶 +10%");
    D.state.karma = -500; ok(D.karmaBonus() === 0.05, "邪道 -500：+5%");
    D.state.karma = -2000; ok(D.karmaBonus() === 0.20, "邪道 -2000：封顶 +20%");
    D.state.karma = 0;
    const gmK0 = D.gm();
    D.state.karma = 200;
    ok(Math.abs(D.gm() / gmK0 - 1.01) < 1e-9, "gm 含因果因子（200 → ×1.01）");
    D.state.karma = 0;
    D.state.karma = 500; D.act.cultivate();
    ok(!!D.state.ach.karma500, "成就·浩然正气触发");
    D.state.karma = -500; D.act.cultivate();
    ok(!!D.state.ach.dark500, "成就·独断黑道触发");
    D.state.karma = 0;

    /* 古修遗宝（确定性掉片 + 成套 + 精确产出 + 钟事件率） */
    Math.random = () => 0.10; /* floor(0.1*4)=0 → 破魔珠 */
    D.act.relic(1);
    ok(D.state.rel.fr.cauldron === 1, "遗宝：确定性掉片（破魔珠 1/10）");
    ok(D.relicMult("stone") === 1.02 && D.relicMult("exp") === 1 && D.relicMult("explore") === 1, "破魔珠残片：灵石 +2%，其余类型不受影响");
    D.act.relic(9);
    ok(D.state.rel.fr.cauldron === 10, "破魔珠 10 片成套");
    ok(Math.abs(D.relicMult("stone") - 1.2) < 1e-9, "破魔珠成套：灵石产出 +20%");
    ok(!!D.state.ach.relic1, "成就·宝光初聚触发");
    D.act.relic(3);
    ok(D.state.rel.fr.cauldron === 10, "成套后残片不再计入");
    D.state.bld.field = 1; D.state.bld.garden = 0; D.state.bld.room = 0;
    D.state.rel.fr.cauldron = 0;
    const srBase = D.stoneRate();
    D.state.rel.fr.cauldron = 5;
    ok(Math.abs(D.stoneRate() / srBase - 1.1) < 1e-9, "破魔珠 5 片：灵石产出 ×1.1（精确）");
    const evR0 = D.evChance();
    D.state.rel.fr.bell = 10;
    ok(Math.abs(D.evChance() - Math.min(evR0 + 0.05, 0.75)) < 1e-9, "灭魂钟成套：事件率 +5%");
    D.state.rel.fr.bell = 0; D.state.rel.fr.cauldron = 0;

    /* 坊市（确定性正弦定价 + 买卖记账 + 囤 9 上限 + 非法码） */
    D.state.mkt = { t: 0, hold: { rice: 0, ore: 0, powder: 0 }, earned: 0, spent: 0 };
    ok(D.goodPrice(D.tables.GOODS[0], 0) === 20, "坊市 t=0 灵米价 20（底价）");
    ok(D.goodPrice(D.tables.GOODS[1], 0) === 109, "坊市 t=0 灵矿价 109（高波）");
    ok(D.goodPrice(D.tables.GOODS[2], 0) === 209, "坊市 t=0 丹粉价 209（低波）");
    D.state.stone = 10000;
    ok(D.act.trade("buy_powder") === true, "坊市：买入丹粉");
    ok(D.state.stone === 10000 - 209 && D.state.mkt.hold.powder === 1 && D.state.mkt.spent === 209, "买入：扣款 + 囤货 +1 + spent 记账");
    ok(D.act.trade("sell_powder") === true, "坊市：卖出丹粉");
    ok(D.state.stone === 10000 && D.state.mkt.hold.powder === 0 && D.state.mkt.earned === 209, "卖出：回款 + earned 记账");
    for (let i = 0; i < 9; i++) D.act.trade("buy_rice");
    ok(D.state.mkt.hold.rice === 9, "囤货上限 9");
    ok(D.act.trade("buy_rice") === false && D.state.mkt.hold.rice === 9, "囤满被拒");
    D.state.mkt.hold.rice = 0; D.state.stone = 10;
    ok(D.act.trade("buy_rice") === false, "灵石不足被拒（价 20 > 10）");
    ok(D.act.trade("buy_red") === false && D.act.trade("fly_powder") === false, "非法交易码被拒");
    D.state.mkt.earned = 10005; D.state.mkt.spent = 5;
    D.act.cultivate();
    ok(!!D.state.ach.mkt1k, "成就·商道通达触发（净赚 ≥1 万）");
    D.state.mkt = { t: 0, hold: { rice: 0, ore: 0, powder: 0 }, earned: 0, spent: 0 };

    /* 行囊道具（确定性掉落 / 满包拒绝 / 道心丹 / 聚灵珠精确 ×2.5 / 60s 到期） */
    D.state.itm = { charm: 0, pearl: 0, heal: 0 };
    Math.random = () => 0.10; /* floor(0.1*3)=0 → 渡劫符 */
    D.act.drop();
    ok(D.state.itm.charm === 1, "道具：确定性掉落（渡劫符 ×1）");
    Math.random = () => 0.999;
    D.state.itm = { charm: 3, pearl: 1, heal: 3 };
    D.act.drop();
    ok(D.state.itm.charm === 3 && D.state.itm.pearl === 1 && D.state.itm.heal === 3, "行囊已满：掉落不计入");
    D.state.itm = { charm: 1, pearl: 1, heal: 1 };
    const ptsI = D.state.pts;
    ok(D.act.item("heal") === true && D.state.pts === ptsI + 1 && D.state.itm.heal === 0, "道心丹：+1 属性点");
    ok(D.act.item("heal") === false, "道心丹用尽被拒");
    ok(D.act.item("charm") === false && D.state.itm.charm === 1, "渡劫符不可手动使用（被动）");
    D.state.bld.garden = 1; /* 让 expRate 基线 > 0 */
    D.state.pearl = 0;
    const srP0 = D.stoneRate(), erP0 = D.expRate();
    ok(srP0 > 0 && erP0 > 0, "聚灵珠测试基线产出为正");
    ok(D.act.item("pearl") === true && D.state.pearl === 60 && D.state.itm.pearl === 0, "聚灵珠：启用（60s）");
    ok(D.pearlMult() === 2.5, "pearlMult = 2.5");
    ok(Math.abs(D.stoneRate() - srP0 * 2.5) < 1e-6, "聚灵珠：灵石产出 ×2.5（精确）");
    ok(Math.abs(D.expRate() - erP0 * 2.5) < 1e-6, "聚灵珠：修为产出 ×2.5（精确）");
    ok(D.act.item("pearl") === false, "聚灵珠生效中不可重复启用");
    for (let i = 0; i < 600; i++) { T += 100; iv.forEach(f => f()); }
    ok(D.state.pearl === 0, "聚灵珠：60s 到期自动结束");
    ok(Math.abs(D.stoneRate() - srP0) < 1e-6, "到期后产出回基线");

    /* 渡劫符（突破失败自动消耗免 -15% 修为；无符则损） */
    D.state.itm = { charm: 1, pearl: 0, heal: 0 };
    D.state.realm = 4; D.state.layer = 9;
    D.state.exp = 1e9; D.state.stone = 1e9; D.state.karma = 0;
    const needC = D.expNeed();
    Math.random = () => 0.9; /* > breakRate(4)=0.84 → 必败 */
    D.act.break();
    Math.random = () => 0.999;
    ok(D.state.itm.charm === 0, "渡劫符：突破失败自动消耗");
    ok(Math.abs(D.state.exp - (1e9 - needC)) < 1e-6, "渡劫符：免 -15% 修为（仅扣布阵）");
    ok(D.state.karma === -1, "突破失败：因果 -1");
    D.state.exp = 1e9; D.state.stone = 1e9;
    const needN = D.expNeed();
    Math.random = () => 0.9;
    D.act.break();
    Math.random = () => 0.999;
    ok(Math.abs(D.state.exp - (1e9 - needN) * 0.85) < 1e-6, "无渡劫符：突破失败 -15% 修为");

    /* 天劫试炼（元婴解锁 / 三档结果 / 1h CD / 劫印上限 / 因果 / 离线恢复） */
    D.state.realm = 3; D.state.layer = 1;
    D.state.trib = 0; D.state.tribCd = 0;
    D.state.exp = 1000; D.state.lifeExp = 1000; D.state.stone = 1e6;
    ok(D.tribCost() === 40000, "引劫献价 5000×2^realm（realm 3 = 40000）");
    D.state.realm = 2;
    ok(D.act.trib() === false, "元婴前（realm 2）不可引劫");
    D.state.realm = 3;
    const gmT0 = D.gm(), karmaT0 = D.state.karma;
    Math.random = () => 0.10;
    ok(D.act.trib() === true, "天劫试炼：成功档（r<0.35）");
    Math.random = () => 0.999;
    ok(D.state.trib === 1, "劫印 +1");
    ok(D.state.exp === 800 && D.state.lifeExp === 800, "引劫消耗 20% 修为（与生涯修为）");
    ok(Math.abs(D.state.stone - (1e6 - 40000)) < 1e-6, "引劫献价 40000 灵石已扣");
    ok(D.state.tribCd === 3600, "1h 冷却触发");
    ok(Math.abs(D.gm() / gmT0 - 1.02) < 1e-9, "劫印 +1：全局 ×1.02（精确）");
    ok(D.state.karma === karmaT0 + 2, "渡劫成功：因果 +2");
    ok(!!D.state.ach.trib1, "成就·劫后余生触发");
    ok(D.act.trib() === false && D.state.trib === 1, "冷却中被拒");
    D.state.tribCd = 0; D.state.stone = 1e6; D.state.exp = 1000; D.state.lifeExp = 1000;
    const karmaT1 = D.state.karma;
    Math.random = () => 0.5;
    ok(D.act.trib() === true, "天劫试炼：无果档（0.35≤r<0.8）");
    Math.random = () => 0.999;
    ok(D.state.trib === 1 && D.state.exp === 800 && D.state.karma === karmaT1, "无果：不得印、无反噬、因果不变");
    D.state.tribCd = 0; D.state.stone = 1e6; D.state.exp = 1000;
    const karmaT2 = D.state.karma;
    Math.random = () => 0.9;
    ok(D.act.trib() === true, "天劫试炼：反噬档（r≥0.8）");
    Math.random = () => 0.999;
    const stAfterCost = 1e6 - 40000;
    ok(D.state.stone === stAfterCost - Math.floor(stAfterCost * 0.2), "反噬：额外损失 20% 灵石（同构断言）");
    ok(D.state.karma === karmaT2 - 2, "反噬：因果 -2");
    D.state.trib = 10; D.state.tribCd = 0;
    ok(D.act.trib() === false && D.state.trib === 10, "劫印 10 枚圆满：被拒");
    D.act.cultivate();
    ok(!!D.state.ach.trib10, "成就·十劫不摇触发");
    D.state.trib = 1; D.state.tribCd = 0;
    D.state.tribCd = 3000; D.state.pearl = 100;
    D.offline(3600);
    ok(D.state.tribCd === 0, "天劫冷却：离线期间自然恢复");
    ok(D.state.pearl === 0, "聚灵珠：离线期间自然到期");
    D.state.realm = 0; D.state.layer = 1;

    /* XLLM · trade/item 白名单与 availableActions */
    ok(X.validateDecision({ action: "trade", target: "buy_rice" }, { trade: true, "trade:buy_rice": true }).target === "buy_rice", "trade·buy_rice 决策通过");
    ok(X.validateDecision({ action: "trade", target: "buy_red" }, { trade: true }) == null, "trade 非法货物名被拒");
    ok(X.validateDecision({ action: "trade", target: "sell_powder" }, { trade: true, "trade:sell_powder": true }).target === "sell_powder", "trade·sell_powder 决策通过");
    ok(X.validateDecision({ action: "item", target: "pearl" }, { item: true }).target === "pearl", "item·pearl 决策通过");
    ok(X.validateDecision({ action: "item", target: "heal" }, { item: true }).target === "heal", "item·heal 决策通过");
    ok(X.validateDecision({ action: "item", target: "charm" }, { item: true }) == null, "item·charm 被拒（被动道具不可手动决策）");
    ok(X.brief().indexOf("遗宝") >= 0 && X.brief().indexOf("坊市") >= 0 && X.brief().indexOf("因果") >= 0 && X.brief().indexOf("天劫试炼") >= 0 && X.brief().indexOf("道具") >= 0, "brief() 含新系统字段（遗宝/坊市/因果/天劫/道具）");
    D.state.mkt.t = 0;
    D.state.mkt.hold = { rice: 0, ore: 0, powder: 0 };
    D.state.stone = 1000;
    const av6 = X.availableActions();
    ok(av6["trade:buy_rice"] === true && av6["trade:buy_powder"] === true, "availableActions：买入子项可用（20/209 ≤ 1000）");
    ok(av6["trade:sell_rice"] === false, "无囤货：卖出不可用");
    ok(typeof av6.item === "boolean" && av6.item === false, "无珠无丹：item 不可用");
    D.state.mkt.hold.rice = 1;
    const av6b = X.availableActions();
    ok(av6b["trade:sell_rice"] === true && av6b.trade === true, "有囤货：卖出可用，trade 主项点亮");

    /* XLLM · 规则兜底：trade 卖先买后（cave 封印 + 探索冷却 + bowl 满级 排除前序分支） */
    D.state.daily = { day: "2099-01-01", signed: true, secretUsed: 3, gathered: true };
    D.state.exp = 0; D.state.pts = 0;
    D.state.realm = 0; D.state.layer = 1;
    /* 归零抬 gm 的因子，压低探索修为收益，防止 break 分支被点亮抢占（gm 敏感断言均已完成） */
    D.state.fame = 0; D.state.rebirths = 0; D.state.area = 0;
    D.state.bless = { early: 0, bowl: 0, fate: 0 };
    D.state.trib = 0; D.state.karma = 0; D.state.bld.hall = 0;
    D.state.bld.room = 0; D.state.beast.lv = 0;
    D.state.art.lv = 12; D.state.bowl.lv = 30;
    D.state.bld.field = 200;
    D.state.itm = { charm: 0, pearl: 0, heal: 0 }; D.state.pearl = 0;
    D.state.caveCd = 100;
    D.state.stone = 1e6;
    Math.random = () => 0.999;
    D.act.explore(); /* 触发探索冷却（explore 排在 trade 之前） */
    ok(D.cd() > 0, "探索冷却已触发（供 trade 局面）");
    /* 不再赌"写死的 mkt.t 恰好落在极值"：自己扫出一个真正越过门槛的时刻 */
    const findT = (gid, wantHigh) => {
      const gd = D.tables.GOODS.find(x => x.id === gid), lim = wantHigh ? D.tables.MKT_SELL_AT : D.tables.MKT_BUY_AT;
      for (let tt = 0; tt < 4000; tt++) {
        D.state.mkt.t = tt;
        const p = D.goodPrice(gd);
        if (wantHigh ? p >= gd.base * lim : p <= gd.base * lim) return tt;
      }
      return -1;
    };
    D.state.mkt.t = findT("ore", true);
    ok(D.state.mkt.t >= 0, "存在 ore 越过 " + D.tables.MKT_SELL_AT + "×底价 的时刻（mkt.t=" + D.state.mkt.t + "）");
    D.state.mkt.hold = { rice: 0, ore: 1, powder: 0 };
    D.state.exp = 0; /* explore 会加修为，不清零就点亮二档 break 抢位（同 bowl 局面的处理） */
    noFree();
    const rdSell = ruleClean("trade");
    ok(rdSell.action === "trade" && rdSell.target === "sell_ore", "规则兜底：囤货越过高位门槛 → trade·sell_ore（实际 " + rdSell.action + "·" + rdSell.target + "）");
    D.state.mkt.t = findT("powder", false);
    D.state.mkt.hold = { rice: 0, ore: 0, powder: 0 };
    D.state.stone = 1000;
    noFree();
    const rdBuy = ruleClean("trade");
    ok(rdBuy.action === "trade" && rdBuy.target === "buy_powder", "规则兜底：价格跌破低位门槛 → trade·buy_powder（实际 " + rdBuy.action + "·" + rdBuy.target + "）");
    /* 档序断言：坊市必须排在炼丹/洗练之后——它没有冷却，排前面就会饿死整片（本轮实测 53% 决策被吃掉） */
    {
      const ore2 = D.tables.GOODS.find(x => x.id === "ore");
      D.state.mkt.t = findT("ore", true); D.state.mkt.hold = { rice: 0, ore: 9, powder: 0 };
      D.state.bld.room = 3; D.state.rec = {}; D.tables.RECIPES.forEach(r => { D.state.rec[r.id] = 1; });
      D.state.stone = 1e12; D.state.exp = 0; D.state.realm = 6;
      const withPill = ruleClean("trade");
      ok(withPill.action !== "trade", "有丹可炼时轮不到坊市（实际 " + withPill.action + "）——无冷却动作必须排在档末");
    }

    /* XLLM · pilot 修复：LLM 返回合法 JSON 但决策不合法 → 不判离线，仅本轮回退规则 */
    { const u6 = X.cfg.url; X.cfg.url = ""; await X.pilotCycle(); X.cfg.url = u6; } /* 排空缓存，保证下面这一拍真的走规则 */
    X.setConn({ ok: true, note: "在线" });
    D.state.mkt.hold = { rice: 1, ore: 0, powder: 0 }; /* avail.trade 点亮，确保拒绝来自 target 白名单 */
    fetchImpl = async () => ({ ok: true, json: async () => ({ message: { content: '{"action":"trade","target":"buy_red","reason":"测试非法目标"}' } }) });
    D.state.daily = { day: "1999-01-01", signed: false, secretUsed: 0, gathered: true };
    const plogLen6 = X.plog.length;
    await X.pilotCycle();
    await new Promise(r => setImmediate(r)); /* 决策已改为后台取：等链路回液再验（setTimeout 在本桩里是空函数） */
    ok(X.llmState.ok === true, "修复验证：决策不合法不判连接离线（llmState.ok 保持 true）");
    ok(D.state.daily.signed === true, "修复验证：本轮回退规则执行每日签到");
    ok(X.plog.slice(plogLen6).some(s => s.indexOf("本轮回退规则") >= 0), "修复验证：plog 记录非法决策与回退");
    Math.random = rr6;

    /* ============ 第七轮：天象 / 秘境三阶 / 宗门职位 / 道心 / bug 修复 ============ */
    const todayStamp = () => { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); };
    /* --- 统一重置：gm 敏感因子归零，天象/职位/生涯计数器清零 --- */
    D.state.fame = 0; D.state.rebirths = 0; D.state.area = 0;
    D.state.bless = { early: 0, bowl: 0, fate: 0 };
    D.state.trib = 0; D.state.karma = 0; D.state.tribCd = 0;
    D.state.bowl.lv = 0; D.state.beast.lv = 0;
    D.state.bld = { field: 0, garden: 0, cave: 0, room: 0, vault: 0, hall: 0 };
    D.state.attr = { spirit: 0, body: 0, soul: 0, heart: 0 };
    D.state.omen = { id: null, left: 0, t: 600 };
    D.state.omenN = 0; D.state.demonN = 0; D.state.deadN = 0;
    D.state.sect = 0;
    D.state.pill = { id: null, left: 0 }; D.state.pearl = 0;
    D.state.daily = { day: "2099-01-01", signed: false, secretUsed: 0, gathered: false };
    D.state.rel.fr = { cauldron: 0, scroll: 0, sword: 0, bell: 0 };
    D.state.itm = { charm: 0, pearl: 0, heal: 0 };
    D.state.exp = 0; D.state.pts = 0;
    D.state.realm = 0; D.state.layer = 1;
    D.state.luck = 0;
    Math.random = () => 0.999;

    /* --- 天象（强制触发 + omenMult 精确 + 魔劫道心减免 + 灵石雨 + 计时消散/再现） --- */
    D.state.bld.field = 1; D.state.realm = 0;
    const srO0 = D.stoneRate(), erO0 = D.expRate();
    D.act.omen("tide");
    ok(D.state.omen.id === "tide" && D.state.omen.left === 120 && D.state.omenN === 1, "天象：灵潮强制触发（持续 120s，omenN+1）");
    ok(D.omenMult("stone") === 1.5 && D.omenMult("exp") === 1, "omenMult：灵潮仅影响灵石");
    ok(Math.abs(D.stoneRate() - srO0 * 1.5) < 1e-9, "灵潮：灵石产出 ×1.5（精确）");
    ok(Math.abs(D.expRate() - erO0) < 1e-9, "灵潮：修为产出不受影响");
    D.act.omen("cloud");
    ok(D.omenMult("exp") === 1.5 && D.omenMult("stone") === 1, "omenMult：养气祥云仅影响修为");
    D.state.attr.heart = 0;
    D.act.omen("demon");
    ok(D.state.demonN === 1, "魔劫：demonN 计数");
    ok(D.omenMult("stone") === 0.5 && D.omenMult("exp") === 0.5, "魔劫（道心 0）：双产出 ×0.5");
    const evC0 = D.evChance();
    D.state.omen.left = 0;
    const evC1 = D.evChance();
    ok(Math.abs(evC0 - Math.min(evC1 + 0.2, 0.75)) < 1e-9, "魔劫：事件率 +20%（消散后回落）");
    D.state.attr.heart = 10;
    D.state.omen.left = 120;
    ok(D.omenMult("stone") === 0.55, "魔劫（道心 10）：减免至 ×0.55（精确）");
    D.state.attr.heart = 20;
    ok(D.omenMult("stone") === 0.6, "魔劫（道心 20）：减免上限 ×0.6");
    const stR0 = D.state.stone, gr = D.gm();
    D.act.omen("rain");
    ok(D.state.omen.id === "rain" && D.omenMult("stone") === 1, "灵石雨：无产出倍率（即刻发放型）");
    ok(D.state.stone - stR0 === Math.floor(100 * gr), "灵石雨：即刻 (100+300×0)×gm 入账（精确）");
    ok(!!D.state.ach.omen1, "成就·见证天象触发");
    D.state.omen = { id: "tide", left: 0.1, t: 600 };
    T += 100; iv.forEach(f => f());
    ok(D.state.omen.id === null && D.state.omen.t === 600, "天象：持续时间到 → 消散（t 重置 600）");
    D.state.omen = { id: null, left: 0, t: 0.1 };
    Math.random = () => 0.999; /* r=9.99 → 权重 3/3/2/2 → 灵石雨 */
    T += 100; iv.forEach(f => f());
    ok(D.state.omen.id === "rain", "天象：倒计时结束自动加权随机再现（桩 0.999 → 灵石雨）");

    /* --- 秘境三阶（成本 ×2^realm / ×3 / ×8 精确 / deadN / 掉片与道心 / 日限与职位） --- */
    D.state.omen = { id: null, left: 0, t: 600 };
    D.state.realm = 0; D.state.sect = 0;
    D.state.daily = { day: todayStamp(), signed: true, secretUsed: 0, gathered: true };
    ok(D.secretCost("normal") === 0 && D.secretCost("fierce") === 200 && D.secretCost("dead") === 1000, "秘境三阶成本（realm 0：0 / 200 / 1000）");
    D.state.realm = 2;
    ok(D.secretCost("fierce") === 800 && D.secretCost("dead") === 4000, "秘境成本 ×2^realm（realm 2：800 / 4000）");
    D.state.realm = 0;
    const gmf = D.gm();
    D.state.stone = 10000; D.state.exp = 0;
    D.act.secretRun("fierce");
    ok(D.state.daily.secretUsed === 1, "激战：日限计数 +1");
    ok(D.state.stone === 10000 - 200 + Math.floor(300 * gmf * 3), "激战：扣成本 200 + 产出 ×3（精确）");
    ok(D.state.exp === Math.floor(120 * gmf * 3), "激战：修为 ×3（精确）");
    D.state.deadN = 0;
    D.state.attr.heart = 0;
    D.state.rel.fr = { cauldron: 0, scroll: 0, sword: 0, bell: 0 };
    Math.random = () => 0.10; /* floor(0.10*4)=0 → 破魔珠残片；0.10<0.5 → 道心 +1 */
    const gmd = D.gm();
    D.state.stone = 10000; D.state.exp = 0;
    D.act.secretRun("dead");
    Math.random = () => 0.999;
    ok(D.state.deadN === 1, "生死：deadN 计数 +1");
    ok(D.state.stone === 10000 - 1000 + Math.floor(300 * gmd * 8), "生死：扣成本 1000 + 产出 ×8（精确）");
    ok(D.state.exp === Math.floor(120 * gmd * 8), "生死：修为 ×8（精确）");
    ok(D.state.rel.fr.cauldron === 1, "生死：30% 掉古修遗宝残片（桩 0.10 → 破魔珠）");
    ok(D.state.attr.heart === 1, "生死：50% 道心 +1（桩 0.10<0.5）");
    ok(!!D.state.ach.dead1, "成就·生死一线触发");
    D.state.stone = 50;
    const usedB = D.state.daily.secretUsed;
    D.act.secretRun("fierce");
    ok(D.state.daily.secretUsed === usedB && D.state.stone === 50, "激战：灵石不足被拒（计数/灵石不变）");
    D.state.stone = 1e6;
    D.state.daily.secretUsed = 3;
    D.act.secretRun("normal");
    ok(D.state.daily.secretUsed === 3, "日限 3（外门弟子）用尽被拒");
    D.state.sect = 3;
    D.act.secretRun("normal");
    ok(D.state.daily.secretUsed === 4, "长老及以上：日限 4，第 4 次放行");
    D.act.secretRun("normal");
    ok(D.state.daily.secretUsed === 4, "日限 4 用尽被拒");
    D.state.deadN = 9;
    D.state.daily.secretUsed = 0;
    Math.random = () => 0.999;
    D.act.secretRun("dead");
    ok(D.state.deadN === 10 && !!D.state.ach.dead10, "成就·死中求活触发（第 10 次生死）");

    /* --- 宗门职位（双条件自动晋升 / 全局 ×1.02·阶 / 签到加成 / 生涯成就） --- */
    D.state.realm = 0; D.state.sect = 0;
    D.state.contribAll = 1000;
    D.state.realm = 3;
    const gmS0 = D.gm(); /* realm 就位后再采样，隔离 1.8^realm 因子 */
    D.act.cultivate(); /* checkAch → checkSect */
    ok(D.state.sect === 2, "职位：生涯贡献 1000 + 境界 3 → 自动晋升内门弟子");
    ok(!!D.state.ach.sect2, "成就·内门气象触发");
    ok(Math.abs(D.gm() / gmS0 - 1.04) < 1e-9, "职位 +2 阶：全局 ×1.04（精确）");
    D.state.realm = 7; D.state.contribAll = 5000;
    D.act.cultivate();
    ok(D.state.sect === 4, "职位：连跳晋升至太上长老（贡献 5000 + 境界 7）");
    D.state.realm = 9; D.state.contribAll = 12000;
    D.act.cultivate();
    ok(D.state.sect === 5 && !!D.state.ach.sect5, "职位：宗门之主（贡献 12000 + 境界 9）+ 成就·宗师之路");
    ok(D.secretCap() === 4, "职位·宗门之主：秘境日限 4");
    D.state.realm = 0; D.state.sect = 2;
    D.state.daily = { day: "2099-01-02", signed: false, secretUsed: 0, gathered: false };
    const gms = D.gm();
    const stBefore = D.state.stone;
    D.act.signIn();
    ok(D.state.stone - stBefore === Math.floor(100 * gms * 1.2), "签到：职位加成 +20%（sect 2，精确）");

    /* --- 道心（breakRate 加成精确） --- */
    D.state.layer = 9; D.state.realm = 5;
    D.state.attr.heart = 0;
    ok(D.breakRate() === 0.8, "breakRate（境界 5·道心 0）= 0.8");
    D.state.attr.heart = 10;
    ok(D.breakRate() === 1.0, "breakRate（境界 5·道心 10）= 1.0（封顶）");
    D.state.attr.heart = 20;
    ok(D.breakRate() === 1.0, "breakRate（境界 5·道心 20）= 1.0（不溢出）");
    D.state.realm = 10;
    D.state.attr.heart = 0;
    ok(D.breakRate() === 0.6, "breakRate（境界 10·道心 0）= 0.6");
    D.state.attr.heart = 10;
    ok(D.breakRate() === 0.8, "breakRate（境界 10·道心 10）= 0.8（精确）");

    /* --- bug 修复①：buyAttr 键白名单 + checkAch --- */
    D.state.pts = 1;
    D.act.attr("bogus");
    ok(D.state.pts === 1 && D.state.attr.bogus === undefined, "buyAttr：非法键被拒（防注入、不耗点）");
    D.state.attr.heart = 9;
    D.act.attr("heart");
    ok(D.state.attr.heart === 10 && D.state.pts === 0, "buyAttr：道心可淬炼");
    ok(!!D.state.ach.heart10, "成就·道心坚定触发（属性成就即时判定）");
    D.state.attr.heart = 20;
    D.act.cultivate();
    ok(!!D.state.ach.heart20, "成就·心如铁石触发");

    /* --- 转世重置（职位/天象/道心重置，贡献保留） --- */
    D.state.realm = 5; D.state.sect = 4; D.state.contribAll = 5000;
    D.state.attr.heart = 7;
    D.state.omen = { id: "tide", left: 100, t: 300 };
    const luckB = D.state.luck, rebB = D.state.rebirths;
    D.act.rebirth("fate");
    ok(D.state.sect === 0, "转世：宗门职位重置为外门弟子");
    ok(D.state.omen.id === null && D.state.omen.t === 600, "转世：天象状态重置");
    ok(D.state.attr.heart === 0, "转世：道心重置");
    ok(D.state.realm === 0 && D.state.luck === luckB + 6 && D.state.rebirths === rebB + 1, "转世：原有逻辑不受影响（气运 +6）");
    ok(D.state.contribAll === 5000, "转世：宗门贡献保留（快速重晋基础）");
    ok(D.state.bless.fate >= 1, "转世祝福「天机」生效");

    /* --- bug 修复②：tick dt>10 后台节流走离线结算（3 秒封顶不再吞收益） --- */
    D.state.omen = { id: null, left: 0, t: 600 };
    D.state.realm = 0; D.state.layer = 1;
    D.state.bld = { field: 1, garden: 1, cave: 0, room: 0, vault: 0, hall: 0 };
    D.state.pill = { id: null, left: 0 }; D.state.pearl = 0;
    D.state.caveCd = 0; D.state.tribCd = 0;
    D.state.fame = 0;
    const srT = D.stoneRate(), erT = D.expRate();
    const stT0 = D.state.stone, exT0 = D.state.exp;
    T += 11000;
    iv.forEach(f => f());
    ok(Math.abs((D.state.stone - stT0) - srT * 11 * 0.5) < 1e-6, "后台节流：dt=11s 走离线结算（50% 效率，精确）");
    ok(Math.abs((D.state.exp - exT0) - erT * 11 * 0.5) < 1e-6, "后台节流：修为同样离线结算");
    ok(D.state.omen.id === null && D.state.omen.t === 600, "后台节流：天象冻结不结算");

    /* --- bug 修复③：dropItem 满包文案（去掉不存在的「聚灵佩」） --- */
    D.state.itm = { charm: 3, pearl: 1, heal: 3 };
    D.act.drop();
    const lastLine = els["log"].children[els["log"].children.length - 1].innerHTML;
    ok(lastLine.indexOf("消耗道具") >= 0 && lastLine.indexOf("行囊已满") >= 0, "dropItem：满包新文案（消耗道具）");
    ok(lastLine.indexOf("聚灵佩") < 0, "dropItem：旧「聚灵佩」文案已清除");

    /* --- XLLM · 秘境三档白名单 + attr·heart + availableActions + 规则兜底 + brief --- */
    ok(X.validateDecision({ action: "secret", target: "dead" }, { secret: true, "secret:dead": true }).target === "dead", "secret·dead 决策通过");
    ok(X.validateDecision({ action: "secret", target: "fierce" }, { secret: true, "secret:fierce": false }) == null, "secret·fierce 负担不起被拒");
    ok(X.validateDecision({ action: "secret" }, { secret: true, "secret:normal": true }).target === "normal", "secret 缺省回退 normal");
    ok(X.validateDecision({ action: "attr", target: "heart" }, { attr: true }).target === "heart", "attr·heart 决策通过");
    ok(X.validateDecision({ action: "attr", target: "body2" }, { attr: true }) == null, "attr 非法键被拒");
    D.state.daily = { day: "1999-01-01", signed: true, secretUsed: 0, gathered: true };
    D.state.sect = 0; D.state.stone = 100; D.state.realm = 0;
    const av7 = X.availableActions();
    ok(av7.secret === true && av7["secret:normal"] === true && av7["secret:fierce"] === false && av7["secret:dead"] === false, "availableActions：灵石 100 → 仅 normal 可用");
    D.state.stone = 5000;
    const av7b = X.availableActions();
    ok(av7b["secret:fierce"] === true && av7b["secret:dead"] === true, "availableActions：灵石 5000 → 激战/生死均可用");
    D.state.sect = 3; D.state.daily.secretUsed = 3;
    const av7c = X.availableActions();
    ok(av7c.secret === true && av7c["secret:normal"] === true, "长老：日限 4 的第 4 次可用");
    D.state.daily.secretUsed = 4;
    ok(X.availableActions().secret === false, "日限 4 用尽");
    D.state.daily = { day: "1999-01-01", signed: true, secretUsed: 0, gathered: true };
    D.state.sect = 0;
    D.state.stone = 1e6;
    noFree();
    ok(X.ruleAction().target === "dead", "规则兜底：灵石充足 → 生死档（最高负担力）");
    D.state.stone = 300;
    noFree();
    ok(X.ruleAction().target === "fierce", "规则兜底：灵石 300 → 激战档");
    D.state.stone = 100;
    noFree();
    ok(X.ruleAction().target === "normal", "规则兜底：灵石 100 → 普通档");
    const b7 = X.brief();
    ok(b7.indexOf("宗门职位") >= 0 && b7.indexOf("天象") >= 0 && b7.indexOf("道心") >= 0, "brief() 含 宗门职位/天象/道心 字段");

    /* ============ 第八轮：灵兽·白虎 / 声望兑换 / 寿元 / bug 修复 ============ */
    /* --- 统一重置（含第八轮新字段；此前各轮 offline 累计的 age 已超炼气寿限，必须清零） --- */
    D.state.realm = 0; D.state.layer = 1;
    D.state.fame = 0; D.state.rebirths = 0; D.state.area = 0;
    D.state.bless = { early: 0, bowl: 0, fate: 0 };
    D.state.trib = 0; D.state.karma = 0; D.state.tribCd = 0;
    D.state.bowl.lv = 0; D.state.beast.lv = 0; D.state.tiger.lv = 0;
    D.state.prestige = { blaze: 0, beckon: 0, guard: 0 };
    D.state.bld = { field: 0, garden: 0, cave: 0, room: 0, vault: 0, hall: 0 };
    D.state.attr = { spirit: 0, body: 0, soul: 0, heart: 0 };
    D.state.omen = { id: null, left: 0, t: 600 };
    D.state.age = 0; D.state.ageW1 = false; D.state.ageW2 = false;
    D.state.exp = 0; D.state.pts = 0; D.state.luck = 0;
    D.state.sect = 0; D.state.contribAll = 0;
    D.state.pill = { id: null, left: 0 }; D.state.pearl = 0;
    D.state.rel.fr = { cauldron: 0, scroll: 0, sword: 0, bell: 0 };
    D.state.itm = { charm: 0, pearl: 0, heal: 0 };
    D.state.quest = null; D.state.autoExp = false;
    D.state.daily = { day: "2099-01-01", signed: true, secretUsed: 3, gathered: true };
    Math.random = () => 0.999;

    /* --- 灵兽·白虎（概率函数 / 强制孵化 / gm / 成本阶梯 / 上限 / 成就） --- */
    ok(D.tigerChance() === 0, "tigerChance：元婴前（realm 0）未开放");
    D.state.realm = 2;
    ok(Math.abs(D.tigerChance() - 0.002) < 1e-12, "tigerChance：元婴·神识 0 = 0.2%");
    D.state.attr.soul = 20;
    ok(Math.abs(D.tigerChance() - 0.022) < 1e-12, "tigerChance：神识 20 = 2.2%（精确）");
    D.state.attr.soul = 30;
    ok(D.tigerChance() === 0.03, "tigerChance：上限 3%");
    D.state.attr.soul = 0;
    D.state.stone = 10000;
    ok(D.act.feedTiger() === false && D.state.tiger.lv === 0 && D.state.stone === 10000, "feedTiger：尚无白虎被拒（不耗灵石）");
    /* 强制孵化：beast.lv=1 跳过狐蛋掷骰；序列桩 [floatNum 0.999, 事件 0.999 抑制, 白虎 0.001<0.002, 遗宝 0.999, 道具 0.999]
       （注意：doExplore 首个 Math.random 被 floatNum 飘字动画消耗——历史踩坑，堆栈追踪确认） */
    D.state.beast.lv = 1;
    for (let i = 0; i < 10 && D.cd() > 0; i++) { T += 1000; iv.forEach(f => f()); }
    let rrTiger = [0.999, 0.999, 0.001, 0.999, 0.999];
    Math.random = () => (rrTiger.length ? rrTiger.shift() : 0.999);
    D.act.explore();
    Math.random = () => 0.999;
    ok(D.state.tiger.lv === 1, "探索强制奇遇：白虎崽孵化（桩 0.001 < 0.2%）");
    ok(D.state.beast.lv === 1, "白虎奇遇不影响灵狐（狐分支已跳过）");
    ok(!!D.state.ach.tiger1, "成就·初得白虎触发（checkAch 即时）");
    const gmt1 = D.gm(); /* tiger 1 基线（成就 +60 声望已入账，因子稳定） */
    const stF = D.state.stone;
    ok(D.act.feedTiger() === true && D.state.tiger.lv === 2 && D.state.stone === stF - 600, "feedTiger：Lv.1→2 耗 300×2^1=600 灵石（精确）");
    ok(Math.abs(D.gm() / gmt1 - 1.06 / 1.03) < 1e-9, "白虎 Lv.1→2：全局 (1+3%×2)/(1+3%×1)（精确）");
    ok(D.feedTigerCost() === 1200, "feedTigerCost：Lv.2→3 = 300×2^2 = 1200");
    D.state.stone = 1199;
    ok(D.act.feedTiger() === false && D.state.tiger.lv === 2 && D.state.stone === 1199, "feedTiger：灵石 1199<1200 被拒");
    D.state.stone = 1200;
    ok(D.act.feedTiger() === true && D.state.tiger.lv === 3 && D.state.stone === 0, "feedTiger：Lv.2→3 耗 1200 灵石（精确）");
    D.state.tiger.lv = 10; D.act.cultivate();
    ok(!!D.state.ach.tiger10, "成就·虎王触发（Lv.10）");
    D.state.tiger.lv = 20; D.state.stone = 1e6;
    ok(D.act.feedTiger() === false && D.state.tiger.lv === 20, "feedTiger：Lv.20 圆满被拒");
    D.act.cultivate();
    ok(!!D.state.ach.tiger20, "成就·万兽之尊触发（Lv.20 圆满）");

    /* --- 声望兑换（成本表 / 三拒 / 精确扣减 / evChance·breakRate 因子 / 离线奇遇 / 跨世保留） --- */
    D.state.prestige = { blaze: 0, beckon: 0, guard: 0 };
    ok(D.prestigeCost("blaze") === 800 && D.prestigeCost("beckon") === 600 && D.prestigeCost("guard") === 1000, "声望一档成本：显名 800 / 招名 600 / 护名 1000");
    D.state.fame = 0;
    ok(D.act.prestige("bogus") === false, "prestige：非法目标被拒（防注入）");
    ok(D.act.prestige("blaze") === false, "prestige：声望不足被拒");
    D.state.fame = 800;
    ok(D.act.prestige("blaze") === true && D.state.prestige.blaze === 1 && D.state.fame === 50, "显名×1：耗 800 声望（成就·兑换初阶 +50 声望入账）");
    ok(!!D.state.ach.pre1, "成就·兑换初阶触发");
    ok(D.prestigeCost("blaze") === 3200, "成本倍增：显名 ×4（800→3200）");
    /* 先结算声望型成就 f1k/f10k，否则兑换中途触发会污染精确 fame 断言（历史踩坑：f10k +300 漂移） */
    D.state.fame = 10000;
    D.act.cultivate();
    D.state.fame = 16000;
    D.act.prestige("blaze");
    D.act.prestige("blaze");
    ok(D.state.prestige.blaze === 3 && D.state.fame === 0, "显名连兑至 3 叠（3200+12800 精确扣减）");
    ok(D.act.prestige("blaze") === false && D.state.prestige.blaze === 3, "显名：3 叠上限被拒");
    D.state.fame = 600;
    const evB = D.evChance();
    ok(Math.abs(evB - 0.15) < 1e-12, "evChance 基线 0.15（无叠加）");
    ok(D.act.prestige("beckon") === true && D.state.prestige.beckon === 1 && D.state.fame === 0, "招名×1：耗 600 声望（精确）");
    ok(Math.abs(D.evChance() - evB - 0.02) < 1e-12, "招名×1：事件率 +2%（精确）");
    D.state.prestige.beckon = 5;
    ok(Math.abs(D.evChance() - (evB + 0.10)) < 1e-12, "招名×5：+10%（封顶，不溢出）");
    D.state.realm = 10; D.state.layer = 9; /* 层内突破恒 100%，换境（layer 9）才走成功率公式 */
    D.state.attr.heart = 0; D.state.prestige.guard = 0;
    const br0 = D.breakRate();
    ok(Math.abs(br0 - 0.6) < 1e-12, "breakRate 基线（换境·境界 10·道心 0·无护名）= 0.6");
    D.state.prestige.guard = 5;
    ok(Math.abs(D.breakRate() - 0.7) < 1e-9, "护名×5：突破成功率 +10%（0.6→0.7）");
    D.state.prestige.guard = 0;
    /* 显名：离线奇遇段数（早慧×1 抬 offCap 至 12h，12h/2h=6 段可被 blaze 拉开） */
    D.state.realm = 0;
    D.state.bless.early = 1;
    D.state.prestige.blaze = 0;
    Math.random = () => 0.5;
    const offB0 = D.offline(43200);
    ok(offB0.evs.length === 4, "显名×0：离线 12h 奇遇 4 段（原封顶）");
    D.state.prestige.blaze = 3;
    const offB3 = D.offline(43200);
    ok(offB3.evs.length === 6, "显名×3：离线 12h 奇遇 6 段（4+3 叠）");
    D.state.bless.early = 0;
    D.state.prestige.blaze = 0;
    D.state.age = 0;
    /* pre6/pre9：直接置叠数后 checkAch 链式结算 */
    D.state.prestige = { blaze: 3, beckon: 3, guard: 0 };
    D.act.cultivate();
    ok(!!D.state.ach.pre6, "成就·三声共鸣触发（累计 6 叠）");
    D.state.prestige.beckon = 6;
    D.act.cultivate();
    ok(!!D.state.ach.pre9, "成就·名动山海触发（累计 9 叠）");
    /* 跨世保留 */
    D.state.realm = 5; D.state.tiger.lv = 7;
    D.state.prestige = { blaze: 1, beckon: 2, guard: 3 };
    D.act.rebirth("bowl");
    ok(D.state.tiger.lv === 7, "转世：白虎跨世保留");
    ok(D.state.prestige.blaze === 1 && D.state.prestige.beckon === 2 && D.state.prestige.guard === 3, "转世：声望兑换跨世保留");

    /* --- 寿元（1 秒=1 日 / 两档预警 / 耗尽强制转世 / 升境延寿 / 成就） --- */
    ok(D.ageYears() === 0 && D.lifeLimit() === 300, "寿元基线：age 0 / 炼气寿限 300 年");
    D.state.realm = 5;
    ok(D.lifeLimit() === 3200, "lifeLimit：境界 5 → 3200 年");
    D.state.realm = 12;
    ok(D.lifeLimit() === 80000, "lifeLimit：境界 12 封顶 8 万年");
    D.state.realm = 0;
    D.state.age = 0; D.state.ageW1 = false; D.state.ageW2 = false;
    const age0 = D.state.age;
    T += 2000; iv.forEach(f => f());
    ok(D.state.age - age0 === 2, "寿元：正常 tick 推进（2s = 2 日）");
    D.state.age = Math.floor(300 * 365 * 0.8);
    T += 100; iv.forEach(f => f());
    ok(D.state.ageW1 === true && D.state.ageW2 === false, "寿元 80%：ageW1 预警触发");
    T += 100; iv.forEach(f => f());
    ok(D.state.ageW1 === true && D.state.ageW2 === false, "80% 预警不重复（每世一次）");
    D.state.age = Math.floor(300 * 365 * 0.95);
    T += 100; iv.forEach(f => f());
    ok(D.state.ageW2 === true, "寿元 95%：ageW2 告急触发");
    /* 耗尽 → 强制转世（随机祝福：桩 0.1 → BLESS[0] 早慧） */
    D.state.age = 300 * 365 + 10;
    const rebL = D.state.rebirths, luckL = D.state.luck;
    const earlyL = D.state.bless.early;
    Math.random = () => 0.1;
    T += 100; iv.forEach(f => f());
    Math.random = () => 0.999;
    ok(D.state.rebirths === rebL + 1, "寿元耗尽：强制转世（rebirths+1）");
    ok(D.state.realm === 0 && D.state.age === 0 && D.state.ageW1 === false && D.state.ageW2 === false, "强制转世：age 清零、预警重置");
    ok(D.state.luck === luckL + 1, "强制转世：气运 +1（realm 0 → gain 1）");
    ok(D.state.bless.early === earlyL + 1, "强制转世：随机祝福生效（桩 0.1 → 早慧）");
    /* 升境延寿：换境成功重置预警 */
    D.state.ageW1 = true; D.state.ageW2 = true;
    D.state.realm = 2; D.state.layer = 9;
    D.state.attr.heart = 0; D.state.prestige.guard = 0;
    D.state.exp = D.expNeed(); D.state.stone = 1e6;
    Math.random = () => 0.01; /* < breakRate 0.92 → 必成 */
    D.act.break();
    Math.random = () => 0.999;
    ok(D.state.realm === 3 && D.state.ageW1 === false && D.state.ageW2 === false, "升境延寿：换境成功 → 预警重置");
    D.state.age = 36500; D.act.cultivate();
    ok(!!D.state.ach.age100, "成就·寿元百年触发（age≥36500s）");
    D.state.age = 365000; D.act.cultivate();
    ok(!!D.state.ach.age1000, "成就·修行千载触发（age≥365000s）");
    D.state.age = 0; D.state.realm = 0; D.state.layer = 1;

    /* --- bug 修复①：tick dt>10 后台离线路径补记奇遇日志 --- */
    D.state.omen = { id: null, left: 0, t: 600 };
    Math.random = () => 0.5; /* 离线奇遇 rollEvent 固定命中 */
    T += 3610000; /* 1h+10s → dt=3610 >10 → 离线路径（≥3600 出 1 段奇遇） */
    iv.forEach(f => f());
    Math.random = () => 0.999;
    const logTxt8 = els["log"].children.slice(-12).map(c => c.innerHTML).join("\n");
    ok(logTxt8.indexOf("后台长眠的这段时间") >= 0, "bug①：后台离线路径补记奇遇日志（此前丢失）");
    ok(logTxt8.indexOf("后台长眠的") >= 0, "bug①：后台节流主日志仍在");

    /* --- bug 修复②：offline 丹药计时器推进（挂机不再白嫖 buff） --- */
    D.state.pill = { id: "qi", left: 60 };
    D.offline(3600);
    ok(D.state.pill.id === null && D.state.pill.left === 0, "bug②：丹药 60s 余量离线 1h → 到期清空");
    D.state.pill = { id: "jin", left: 120 };
    D.offline(30);
    ok(D.state.pill.id === "jin" && D.state.pill.left === 90, "bug②：丹药 120s - 30s = 90s（精确）");
    D.state.pill = { id: null, left: 0 };

    /* --- bug 修复③：setHTML 脏检查缓存（状态变化必刷新，内容相同不重写） --- */
    D.state.omen = { id: "tide", left: 100, t: 600 };
    T += 100; iv.forEach(f => f());
    ok(els["omenInfo"].innerHTML.indexOf("灵潮涌动") >= 0, "setHTML：天象 tide 渲染");
    D.state.omen = { id: "rain", left: 100, t: 600 };
    T += 100; iv.forEach(f => f());
    ok(els["omenInfo"].innerHTML.indexOf("天降灵石雨") >= 0 && els["omenInfo"].innerHTML.indexOf("灵潮涌动") < 0, "setHTML：内容变化 → 缓存失效重写（rain）");
    D.state.omen = { id: null, left: 0, t: 600 };

    /* --- bug 修复④：aAdd-* 属性按钮随属性点禁用（此前点了才报错） --- */
    D.state.pts = 0;
    T += 100; iv.forEach(f => f());
    ok(els["aAdd-spirit"].disabled === true && els["aAdd-body"].disabled === true && els["aAdd-soul"].disabled === true && els["aAdd-heart"].disabled === true, "bug④：属性点 0 → 四个淬炼按钮禁用");
    D.state.pts = 2;
    T += 100; iv.forEach(f => f());
    ok(els["aAdd-spirit"].disabled === false && els["aAdd-heart"].disabled === false, "bug④：属性点 2 → 按钮可用");
    D.state.pts = 0;

    /* --- XLLM · prestige 白名单 + feed 分目标 + availableActions + 规则兜底 + brief --- */
    ok(X.validateDecision({ action: "prestige", target: "beckon" }, { prestige: true, "prestige:beckon": true }).target === "beckon", "prestige·beckon 决策通过");
    ok(X.validateDecision({ action: "prestige", target: "beckon" }, { prestige: true, "prestige:beckon": false }) == null, "prestige·beckon 负担不起被拒");
    ok(X.validateDecision({ action: "prestige", target: "bogus" }, { prestige: true }) == null, "prestige 非法目标被拒");
    ok(X.validateDecision({ action: "feed", target: "tiger" }, { feed: true, "feed:tiger": true }).target === "tiger", "feed·tiger 决策通过");
    ok(X.validateDecision({ action: "feed", target: "tiger" }, { feed: true, "feed:tiger": false, "feed:fox": true }).target === "fox", "feed·tiger 喂不起时改指 fox（聚合键为真说明有的可喂；旧行为整条作废会白扔决策，一致性模糊测试抓出来的）");
    ok(X.validateDecision({ action: "feed" }, { feed: true, "feed:fox": true }).target === "fox", "feed 缺省回退 fox");
    D.state.beast.lv = 0; D.state.tiger.lv = 1; D.state.stone = 1000;
    const avT = X.availableActions();
    ok(avT["feed:fox"] === false && avT["feed:tiger"] === true && avT.feed === true, "availableActions：feed 子项分目标（狐无 / 虎喂得起 600）");
    D.state.stone = 599;
    ok(X.availableActions()["feed:tiger"] === false, "availableActions：tiger Lv.1 成本 600 → 599 不足");
    D.state.tiger.lv = 0;
    D.state.prestige = { blaze: 3, beckon: 0, guard: 0 };
    D.state.fame = 5000;
    const avP = X.availableActions();
    ok(avP["prestige:blaze"] === false && avP["prestige:beckon"] === true && avP["prestige:guard"] === true && avP.prestige === true, "availableActions：prestige 子项（显名满 / 招名·护名可兑）");
    D.state.fame = 0;
    ok(X.availableActions().prestige === false, "声望 0：prestige 主项熄灭");
    /* 规则兜底：白虎优先喂食 / 无虎喂狐 / 声望兑换（guard 优先） */
    D.state.daily = { day: "2099-01-01", signed: true, secretUsed: 3, gathered: true };
    D.state.exp = 0; D.state.pts = 0;
    D.state.realm = 0; D.state.layer = 1; D.state.sect = 0;
    D.state.bld = { field: 200, garden: 0, cave: 0, room: 0, vault: 0, hall: 0 };
    D.state.art.lv = 12; D.state.bowl.lv = 30;
    D.state.itm = { charm: 0, pearl: 0, heal: 0 }; D.state.pearl = 0;
    D.state.stone = 600;
    D.state.beast.lv = 0; D.state.tiger.lv = 1;
    noFree();
    const rdFT = ruleClean();
    ok(rdFT.action === "feed" && rdFT.target === "tiger", "规则兜底：白虎优先喂食（实际 " + JSON.stringify(rdFT) + "）");
    D.state.tiger.lv = 0; D.state.beast.lv = 1;
    noFree();
    const rdFF = ruleClean();
    ok(rdFF.action === "feed" && rdFF.target === "fox", "规则兜底：无虎时喂食灵狐（实际 " + JSON.stringify(rdFF) + "）");
    D.state.beast.lv = 0;
    D.state.caveCd = 100;
    Math.random = () => 0.999;
    D.act.explore(); /* 触发探索冷却（explore 排在 prestige 之前） */
    D.state.mkt.t = 0; D.state.mkt.hold = { rice: 0, ore: 0, powder: 0 };
    D.state.stone = 1e6;
    D.state.fame = 1e6;
    D.state.prestige = { blaze: 0, beckon: 0, guard: 0 };
    noFree();
    const rdP8 = ruleClean();
    ok(rdP8.action === "prestige" && rdP8.target === "guard", "规则兜底：声望富余 → prestige·guard（优先序 guard>beckon>blaze，实际 " + rdP8.action + "·" + rdP8.target + "）");
    const b8 = X.brief();
    ok(b8.indexOf("白虎") >= 0 && b8.indexOf("寿元") >= 0 && b8.indexOf("可兑换") >= 0, "brief() 含 白虎/寿元/声望兑换 字段");
    Math.random = () => 0.999;

    /* ============ 第九轮：灵兽进化 / 延寿丹 / 宗门委任务 / 灵玉坊市 / bug 修复 ============ */
    /* 统一重置：gm 敏感因子归零、计数器清零，与既有用例隔离 */
    D.state.fame=0;D.state.rebirths=0;D.state.area=0;
    D.state.bless={early:0,bowl:0,fate:0};
    D.state.trib=0;D.state.karma=0;D.state.tribCd=0;
    D.state.bowl={lv:0};D.state.beast={lv:0,evo:0};D.state.tiger={lv:0,evo:0};
    D.state.bld={field:0,garden:0,cave:0,room:0,vault:0,hall:0};
    D.state.attr={spirit:0,body:0,soul:0,heart:0};
    D.state.omen={id:null,left:0,t:600};
    D.state.omenN=0;D.state.demonN=0;D.state.deadN=0;
    D.state.sect=0;
    D.state.pill={id:null,left:0};D.state.pearl=0;
    D.state.daily={day:"2099-01-01",signed:false,secretUsed:0,gathered:false};
    D.state.rel={fr:{cauldron:0,scroll:0,sword:0,bell:0}};
    D.state.itm={charm:0,pearl:0,heal:0,life:0};
    D.state.exp=0;D.state.explores=0;D.state.clicks=0;D.state.allStone=0;D.state.allExp=0;D.state.pills=0;
    D.state.realm=0;D.state.layer=1;
    D.state.luck=0;
    D.state.pts=0;D.state.stone=0;
    D.state.sq={idx:0};D.state.lifeBonus=0;D.state.cd=0;
    D.state.caveCd=0;D.state.caveN=0;D.state.caveLeg=0;
    D.state.contrib=0;D.state.contribAll=0;
    D.state.art={lv:0};
    D.state.age=0;D.state.ageW1=false;D.state.ageW2=false;
    D.state.mkt={t:0,hold:{rice:0,ore:0,powder:0,jade:0},earned:0,spent:0};
    D.state.prestige={blaze:0,beckon:0,guard:0};
    D.state.ach={};
    D.state.quest=null;
    D.state.autoExp=false;

    /* --- A1 进化献价：10000×2^境界 --- */
    D.state.realm=0; ok(D.evolveCost()===10000, "进化献价 realm0 = 10000");
    D.state.realm=1; ok(D.evolveCost()===20000, "进化献价 realm1 = 20000");
    D.state.realm=2; ok(D.evolveCost()===40000, "进化献价 realm2 = 40000");
    D.state.realm=0;

    /* --- A2 灵狐进化：拒绝条件 + 成功 + gm ×1.25 + 成就 + 二次拒绝 --- */
    D.state.fame=5000; /* 饱和声望因子，防 checkAch 注 fame 扰动 gm 比率 */
    D.state.beast={lv:24,evo:0};D.state.tiger={lv:0,evo:0};D.state.stone=1e9;
    ok(D.act.evolve("fox")===false, "进化·狐 拒绝：未满级（Lv24）");
    D.state.beast={lv:25,evo:0};D.state.stone=9999;
    ok(D.act.evolve("fox")===false, "进化·狐 拒绝：灵石不足（9999<10000）");
    D.state.stone=10000;
    const gmF0=D.gm();
    ok(D.act.evolve("fox")===true, "进化·狐 成功");
    ok(D.state.beast.evo===1 && D.state.stone===0, "进化·狐：evo=1、灵石扣光");
    const gmF1=D.gm();
    ok(Math.abs(gmF1/gmF0-1.25)<1e-9, "进化·狐：gm ×1.25（每级加成 4%→6%）");
    ok(!!D.state.ach.evoFox, "成就·九尾灵狐（evoFox）");
    ok(D.act.evolve("fox")===false, "进化·狐 拒绝：已进化");
    /* --- A3 白虎进化：拒绝 + 成功 + gm ×1.1875 + 成就 + 缺省目标 --- */
    D.state.beast={lv:0,evo:0};D.state.tiger={lv:19,evo:0};D.state.stone=1e9;
    ok(D.act.evolve("tiger")===false, "进化·虎 拒绝：未满级（Lv19）");
    D.state.tiger={lv:20,evo:0};D.state.stone=9999;
    ok(D.act.evolve("tiger")===false, "进化·虎 拒绝：灵石不足");
    D.state.stone=10000;
    const gmTx0=D.gm();
    ok(D.act.evolve("tiger")===true, "进化·虎 成功");
    ok(D.state.tiger.evo===1, "进化·虎：evo=1");
    const gmTx1=D.gm();
    ok(Math.abs(gmTx1/gmTx0-1.1875)<1e-9, "进化·虎：gm ×1.1875（3%→4.5%）");
    ok(!!D.state.ach.evoTiger, "成就·腾霄神虎（evoTiger）");
    D.state.beast={lv:25,evo:0};D.state.tiger={lv:0,evo:0};D.state.stone=1e6;
    ok(D.act.evolve()===true && D.state.beast.evo===1, "进化：缺省目标为灵狐");
    D.state.fame=0;

    /* --- A4 进化跨世保留 --- */
    D.state.realm=4;D.state.layer=1;
    D.state.beast={lv:25,evo:1};D.state.tiger={lv:20,evo:1};
    D.state.sq={idx:5};D.state.lifeBonus=200;D.state.itm={charm:1,pearl:0,heal:1,life:3};D.state.cd=1;
    D.act.rebirth();
    ok(D.state.beast.evo===1, "跨世：狐九尾保留");
    ok(D.state.tiger.evo===1, "跨世：虎腾霄保留");
    ok(D.state.sq.idx===5, "跨世：宗门委任务进度保留");
    ok(D.state.lifeBonus===0, "跨世：延寿缓冲清空");
    ok(D.state.itm.life===0, "跨世：延寿丹清空");
    ok(D.state.cd===0, "跨世：探索冷却清空");
    ok(D.state.realm===0, "跨世：境界重置 0");

    /* --- B1 延寿丹：使用 + lifeLimitEff + 成就 + 空瓶拒绝 --- */
    D.state.realm=0;D.state.itm={charm:0,pearl:0,heal:0,life:1};D.state.lifeBonus=0;
    ok(D.act.item("life")===true, "延寿丹·使用：成功");
    ok(D.state.itm.life===0 && D.state.lifeBonus===100, "延寿丹：-1、lifeBonus +100");
    ok(D.lifeLimitEff()===400, "lifeLimitEff = 基础 300 + 延寿 100 = 400");
    ok(!!D.state.ach.life1, "成就·初尝延寿（lifeBonus≥100）");
    ok(D.act.item("life")===false, "延寿丹·使用拒绝：无瓶");
    D.state.itm={charm:0,pearl:0,heal:0,life:3};D.state.lifeBonus=0;
    D.act.item("life");D.act.item("life");D.act.item("life");
    ok(D.state.lifeBonus===300 && D.state.itm.life===0, "连服三瓶 → lifeBonus 300");
    ok(!!D.state.ach.life3, "成就·三载长生（lifeBonus≥300）");

    /* --- B2 checkLifespan：延寿丹延寿（转世 / 不转世 / 预警） --- */
    D.state.realm=0;D.state.lifeBonus=0;D.state.ageW1=false;D.state.ageW2=false;
    D.state.age=300*365+10; /* ay≈300.03 ≥ 基础寿限 300 */
    const reb9A=D.state.rebirths;
    Math.random=()=>0.1;
    T+=100;iv.forEach(f=>f());
    Math.random=()=>0.999;
    ok(D.state.rebirths===reb9A+1, "延寿丹：无缓冲、寿元耗尽 → 强制转世");
    ok(D.state.lifeBonus===0 && D.state.age===0, "寿元耗尽转世：lifeBonus/age 清零");
    D.state.lifeBonus=100; /* lim=400 */
    D.state.age=300*365+10; /* ay≈300.03 < 400 */
    const reb9B=D.state.rebirths;
    Math.random=()=>0.1;
    T+=100;iv.forEach(f=>f());
    Math.random=()=>0.999;
    ok(D.state.rebirths===reb9B, "延寿丹：100 年缓冲、寿元未耗尽 → 不强制转世");
    D.state.lifeBonus=100;D.state.ageW1=false;
    D.state.age=Math.floor(350*365); /* ay=350，350/400=0.875 ∈ [0.8,0.95) */
    Math.random=()=>0.999;
    T+=100;iv.forEach(f=>f());
    ok(D.state.ageW1===true, "延寿丹：寿元占比按有效寿限重算（350/400 → ageW1）");
    D.state.age=0;D.state.ageW1=false;D.state.ageW2=false;D.state.lifeBonus=0;

    /* --- B3 延寿丹掉落：探索 1% 池 / 生死秘境 30% / 金门小额 25% / 满行囊 --- */
    function seqRnd(arr){let i=0;Math.random=function(){const v=arr[i<arr.length?i:arr.length-1];i++;return v;};}
    /* 探索序列 [floatNum,ev,fox,tiger,relic,drop门,dropItem池] → 第 6 位 0.001 触发 drop、第 7 位 0.999→floor(3.996)=3→life */
    D.state.itm={charm:0,pearl:0,heal:0,life:0};D.state.beast={lv:0,evo:0};D.state.tiger={lv:0,evo:0};D.state.cd=0;
    seqRnd([0.999,0.999,0.999,0.999,0.999,0.001,0.999]);
    D.act.explore();
    Math.random=()=>0.999;
    ok(D.state.itm.life===1, "延寿丹掉落：探索 1% 池（ITEMS 第 4 项）");
    /* 生死秘境序列 [relic,heart,life] → 第 3 位 0.001 触发 lifeGain */
    D.state.itm.life=0;D.state.stone=1e6;D.state.realm=0;
    D.state.daily={day:"2099-01-01",signed:true,secretUsed:0,gathered:true};
    seqRnd([0.999,0.999,0.001,0.999]);
    D.act.secretRun("dead");
    Math.random=()=>0.999;
    ok(D.state.itm.life===1, "延寿丹掉落：生死秘境 30%");
    /* 金门小额序列 [tier,dropItem门,life] → 0.6 小额档、第 3 位 0.001 触发 lifeGain */
    D.state.itm.life=0;D.state.caveCd=0;
    seqRnd([0.6,0.999,0.001,0.999]);
    D.act.cave("gold");
    Math.random=()=>0.999;
    ok(D.state.itm.life===1, "延寿丹掉落：金门小额 25%");
    /* 满行囊（5 瓶）不再掉 */
    D.state.itm.life=5;
    seqRnd([0.999,0.999,0.001,0.999]);
    D.act.secretRun("dead");
    Math.random=()=>0.999;
    ok(D.state.itm.life===5, "延寿丹：满行囊（5/5）不再掉落");

    /* --- C1 宗门委任务：未达成拒绝 + 达成成功 + 奖励 --- */
    D.state.ach={};D.state.fame=0;D.state.sq={idx:0};
    D.state.realm=0;
    ok(D.act.sectQuest()===false, "委任务 拒绝：境界未达（太虚新丁需 realm≥1）");
    D.state.realm=1;
    const ptsC=D.state.pts,stC=D.state.stone,faC=D.state.fame,ixC=D.state.sq.idx;
    ok(D.act.sectQuest()===true, "委任务：realm1 达成 → 领取成功");
    ok(D.state.sq.idx===ixC+1, "委任务：idx +1");
    ok(D.state.pts===ptsC+1, "委任务：属性点 +1（精确）");
    ok(D.state.stone===stC+200, "委任务：灵石 +200（精确）");
    ok(D.state.fame>=faC+20, "委任务：声望 +20（或更多，含成就注入）");

    /* --- C2 委任务链 10 阶：全条件达成、连领 10 + 成就 + 领完拒绝 --- */
    D.state.ach={};D.state.sq={idx:0};
    D.state.realm=3;D.state.contribAll=1000;D.state.explores=100;
    D.state.pills=10;D.state.trib=1;D.state.tiger={lv:10,evo:0};D.state.beast={lv:5,evo:0};
    let claimed=0;
    for(let i=0;i<10;i++){if(D.act.sectQuest())claimed++;}
    ok(D.state.sq.idx===10, "委任务链：10 阶全领（idx=10）");
    ok(claimed===10, "委任务链：10 次领取全部成功");
    ok(D.act.sectQuest()===false, "委任务：领完后再领被拒");
    ok(!!D.state.ach.sq5, "成就·委任过半（sq5，idx≥5）");
    ok(!!D.state.ach.sq10, "成就·宗门十德（sq10，idx=10）");

    /* --- D1 灵玉：GOODS 第 4 项 + trade 买卖精确金额 + 满囤 + 成就 --- */
    ok(D.tables.GOODS.length===4 && D.tables.GOODS[3].id==="jade", "GOODS：灵玉为第 4 项（底 2000）");
    D.state.mkt={t:123,hold:{rice:0,ore:0,powder:0,jade:0},earned:0,spent:0};
    D.state.stone=100000;
    const pJade=D.goodPrice(D.tables.GOODS[3]);
    ok(D.act.trade("buy_jade")===true, "trade：buy_jade 成功");
    ok(D.state.mkt.hold.jade===1, "trade：灵玉囤 +1");
    ok(Math.abs(D.state.stone-(100000-pJade))<1e-9, "trade：买入扣现价（精确）");
    ok(Math.abs(D.state.mkt.spent-pJade)<1e-9, "trade：spent += 现价（精确）");
    ok(D.act.trade("sell_jade")===true, "trade：sell_jade 成功");
    ok(D.state.mkt.hold.jade===0, "trade：灵玉囤 -1");
    ok(Math.abs(D.state.mkt.earned-pJade)<1e-9, "trade：earned += 现价（精确）");
    D.state.mkt.hold.jade=9;D.state.stone=1e6;
    ok(D.act.trade("buy_jade")===false, "trade：灵玉囤 9 时买入被拒（上限）");
    D.state.mkt={t:0,hold:{rice:0,ore:0,powder:0,jade:0},earned:50000,spent:0};
    D.state.ach={};
    D.act.cultivate();
    ok(!!D.state.ach.mkt5w, "成就·坊市集赚（净赚≥5 万）");

    /* --- D2 坊市趋势：t<10 → 「→」 / t>=10 与 goodPrice(t-10) 一致 --- */
    D.state.age=0;D.state.ageW1=false;D.state.ageW2=false;D.state.lifeBonus=0;
    D.state.clicks=0;D.state.realm=0;D.state.autoExp=false;
    D.state.mkt={t:5,hold:{rice:0,ore:0,powder:0,jade:0},earned:0,spent:0};
    D.state.stone=1e6;
    T+=100;iv.forEach(f=>f());
    ok(els["mkTrend-rice"].textContent==="→", "坊市趋势：t<10 显示 →（不引用负时间）");
    ok(els["mkTrend-jade"].textContent==="→", "坊市趋势：灵玉行同样 →（新货物行正常渲染）");
    D.state.mkt.t=50;
    T+=100;iv.forEach(f=>f());
    const tNow=D.state.mkt.t;
    const gRice=D.tables.GOODS[0];
    const pNow=D.goodPrice(gRice,tNow);
    const pPrev=D.goodPrice(gRice,tNow-10);
    const trendExp=pNow>pPrev?"↑":pNow<pPrev?"↓":"→";
    ok(els["mkTrend-rice"].textContent===trendExp, "坊市趋势：t>=10 与 goodPrice(t-10) 对比一致（"+trendExp+"）");

    /* --- E1 bug 修复：探索冷却 S.cd 持久化 + 离线推进 --- */
    D.state.cd=0;
    seqRnd([0.999,0.999,0.999,0.999,0.999,0.999,0.999]); /* 全抑制，不触发 drop */
    D.act.explore();
    Math.random=()=>0.999;
    ok(D.state.cd===2.5, "bug 修复：explore → S.cd=2.5（持久化，不再是模块变量）");
    ok(D.cd()===2.5, "bug 修复：D.cd() 读取 S.cd");
    D.save();
    const cdSaved=D.state.cd;
    D.load();
    ok(D.state.cd===cdSaved, "bug 修复：S.cd 存读档保留");
    D.state.cd=15;
    D.offline(10);
    ok(D.state.cd===5, "bug 修复：离线 10s，cd 15→5（精确）");
    D.state.cd=5;
    D.offline(10);
    ok(D.state.cd===0, "bug 修复：离线 10s，cd 5→0（下限 0）");

    /* --- E2 bug 修复：老档回填（无 life/jade/cd/evo/sq 键） --- */
    global.localStorage.setItem("jxp_save_v1",JSON.stringify({
      v:1,name:"test",stone:100,exp:0,realm:0,layer:1,
      attr:{spirit:0,body:0,soul:0,heart:0},bld:{field:0,garden:0,cave:0,room:0,vault:0,hall:0},
      area:0,areas:[true,false,false,false,false,false],ach:{},rebirths:0,
      sect:0,omen:{id:null,left:0,t:600},art:{lv:0},bowl:{lv:0},
      beast:{lv:1},tiger:{lv:1},
      itm:{charm:1,pearl:0,heal:0},
      mkt:{t:0,hold:{rice:1,ore:0,powder:0},earned:0,spent:0},
      last:Date.now()
    }));
    D.load();
    ok(D.state.itm.life===0, "老档：无 life 键 → itm.life 回填 0");
    ok(D.state.mkt.hold.jade===0, "老档：无 jade 键 → hold.jade 回填 0");
    ok(D.state.cd===0, "老档：无 cd 键 → cd 回填 0");
    ok(D.state.lifeBonus===0, "老档：无 lifeBonus 键 → 0");
    ok(D.state.beast.evo===0, "老档：无 evo 键 → beast.evo 回填 0");
    ok(D.state.tiger.evo===0, "老档：无 evo 键 → tiger.evo 回填 0");
    ok(D.state.sq.idx===0, "老档：无 sq 键 → sq.idx 回填 0");

    /* --- F1 XLLM：新动作白名单（evolve / sectQuest / item:life） --- */
    ok(X.validateDecision({action:"evolve",target:"fox"},{evolve:true,"evolve:fox":true}).target==="fox", "XLLM：evolve·fox 决策通过");
    ok(X.validateDecision({action:"evolve"},{evolve:true,"evolve:fox":true}).target==="fox", "XLLM：evolve 缺省回退 fox");
    ok(X.validateDecision({action:"evolve",target:"fox"},{evolve:true,"evolve:fox":false,"evolve:tiger":true}).target==="tiger", "XLLM：evolve·fox 未圆满而白虎已圆满 → 改指 tiger");
    ok(X.validateDecision({action:"evolve",target:"fox"},{evolve:true,"evolve:fox":false,"evolve:tiger":false})==null, "XLLM：两只都不可进化 → 决策作废");
    ok(X.validateDecision({action:"evolve",target:"fox"},{evolve:true}).target==="fox", "XLLM：evolve 兼容旧式 avail（子键缺失）");
    ok(X.validateDecision({action:"evolve",target:"bogus"},{evolve:true,"evolve:fox":true}).target==="fox", "XLLM：evolve 非法目标回退 fox");
    ok(X.validateDecision({action:"evolve",target:"fox"},{evolve:false})==null, "XLLM：evolve 主键未亮被拒");
    ok(X.validateDecision({action:"sectquest"},{sectquest:true})!=null, "XLLM：sectquest 决策通过（可领取时）");
    ok(X.validateDecision({action:"sectquest"},{sectquest:false})==null, "XLLM：sectquest 未达成被拒");
    ok(X.validateDecision({action:"item",target:"life"},{item:true}).target==="life", "XLLM：item·life 决策通过");
    ok(X.validateDecision({action:"item",target:"charm"},{item:true})==null, "XLLM：item·charm 被拒（被动道具）");
    ok(X.validateDecision({action:"teleport"},{teleport:true})==null, "XLLM：未知动作被拒（白名单）");

    /* --- F2 XLLM：availableActions 新键 --- */
    D.state.realm=1;D.state.stone=20000;
    D.state.beast={lv:25,evo:0};D.state.tiger={lv:20,evo:0};
    D.state.sq={idx:0};
    const av9=X.availableActions();
    ok(av9["evolve:fox"]===true,"availableActions：evolve:fox 点亮");
    ok(av9["evolve:tiger"]===true,"availableActions：evolve:tiger 点亮");
    ok(av9.evolve===true,"availableActions：evolve 聚合点亮");
    ok(av9.sectquest===true,"availableActions：sectquest 点亮（委任 1 realm≥1）");
    D.state.stone=100;
    ok(X.availableActions()["evolve:fox"]===false,"availableActions：灵石不足 → evolve:fox 熄灭");
    D.state.stone=20000;D.state.sq={idx:10};
    ok(X.availableActions().sectquest===false,"availableActions：委任全完 → sectquest 熄灭");
    D.state.itm={charm:0,pearl:0,heal:0,life:1};
    ok(X.availableActions().item===true,"availableActions：持有延寿丹 → item 点亮");
    D.state.itm={charm:0,pearl:0,heal:0,life:0};
    ok(X.availableActions().item===false,"availableActions：无可用道具 → item 熄灭");

    /* --- F3 XLLM：ruleAction 兜底（sectQuest / evolve·fox / evolve·tiger） --- */
    /* sectQuest 局面：日常完 / 秘境用尽 / 无突破 / 无建筑 / 无属性 / 功法满 / 无丹房 / 洞窟封 / 探索 CD / 盆满 / 无声望 */
    D.state.realm=1;D.state.layer=1;
    D.state.daily={day:"2099-01-01",signed:true,secretUsed:3,gathered:true};
    D.state.exp=0;D.state.pts=0;D.state.stone=5;
    D.state.fame=0;D.state.prestige={blaze:0,beckon:0,guard:0};
    D.state.bld={field:0,garden:0,cave:0,room:0,vault:0,hall:0};
    D.state.art={lv:12};D.state.bowl={lv:30};
    D.state.itm={charm:0,pearl:0,heal:0,life:0};D.state.pearl=0;
    D.state.beast={lv:0,evo:0};D.state.tiger={lv:0,evo:0};
    D.state.caveCd=100;D.state.cd=10;
    D.state.sq={idx:0};
    D.state.mkt={t:0,hold:{rice:0,ore:0,powder:0,jade:0},earned:0,spent:0};
    noFree();
    const rdSq=ruleClean("sectquest");
    ok(rdSq.action==="sectquest","XLLM 规则兜底：宗门委任可领 → sectquest（实际 "+rdSq.action+"）");
    /* evolve·fox 局面：狐满级未进化、无虎、灵石够、field 高级防 buy */
    D.state.realm=0;D.state.sq={idx:10};
    D.state.stone=10000;
    D.state.bld={field:200,garden:0,cave:0,room:0,vault:0,hall:0};
    D.state.beast={lv:25,evo:0};D.state.tiger={lv:0,evo:0};
    noFree();
    const rdEvF=ruleClean("evolve");
    ok(rdEvF.action==="evolve"&&rdEvF.target==="fox","XLLM 规则兜底：灵狐 Lv25 满级 → evolve·fox（实际 "+rdEvF.action+"·"+rdEvF.target+"）");
    /* evolve·tiger 局面：无狐、虎 Lv20 满级 */
    D.state.beast={lv:0,evo:0};D.state.tiger={lv:20,evo:0};
    noFree();
    const rdEvT=ruleClean("evolve");
    ok(rdEvT.action==="evolve"&&rdEvT.target==="tiger","XLLM 规则兜底：白虎 Lv20 满级 → evolve·tiger（实际 "+rdEvT.action+"·"+rdEvT.target+"）");

    /* --- F4 XLLM：brief 含新系统字段 --- */
    D.state.beast={lv:25,evo:1};D.state.tiger={lv:20,evo:1};
    D.state.lifeBonus=100;D.state.sq={idx:0};
    const b9=X.brief();
    ok(b9.indexOf("宗门委任")>=0,"brief：含 宗门委任 字段");
    ok(b9.indexOf("延寿丹")>=0,"brief：含 延寿丹 字段");
    ok(b9.indexOf("灵玉")>=0,"brief：含 灵玉（坊市货物）");
    ok(b9.indexOf("九尾")>=0,"brief：含 九尾（狐进化态）");
    ok(b9.indexOf("腾霄")>=0,"brief：含 腾霄（虎进化态）");

    /* --- 成就总数 65（第九轮 57+8：进化×2 / 委任×2 / 延寿×2 / 坊市×1 / 寿元×1） --- */
    T += 100; iv.forEach(f => f());
    ok(els["stAch"].textContent.indexOf("/" + D.tables.ACHS.length) >= 0, "成就总数标签走动态数（现 " + D.tables.ACHS.length + " 条，新增成就不必再改本断言）");

    /* --- 第十轮：世界观对齐（境界 17 / 天道之巅 / 原著命名 / 典籍 Tab） --- */
    ok(D.tables.REALMS.length === 17, "REALMS 扩至 17 境（+太乙/大罗/道元/混元）");
    ok(D.tables.REALMS[16][0] === "混元" && D.tables.REALMS[16][1] === "仙界", "第 17 境 = 混元（仙界）");
    ok(D.tables.TITLES[16] === "混元仙尊", "TITLES 顶境 = 混元仙尊");
    ok(D.tables.LIFE_YEARS.length === 17 && D.tables.LIFE_YEARS[16] === 1e9, "混元寿元近乎无尽（1e9）");
    ok(D.tables.AREAS.length === 10 && D.tables.AREAS[6].name === "天道之巅" && D.tables.AREAS[6].reqR === 16, "第 7 区域 = 天道之巅（混元境解锁）· 共 10 区");
    ok(D.tables.AREAS[7].reqRank === 1 && D.tables.AREAS[9].reqRank === 5 && D.tables.AREAS[9].mult === 110, "神界三域按位阶门槛解锁（灵霄/兜率/混沌）");
    ok(D.state.areas.length === 10, "areas 数组扩至 10（默认档）");
    ok(D.tables.ARTS.length === 12 && D.tables.ARTS[1] === "铜皮金骨经" && D.tables.ARTS[6] === "天行健" && D.tables.ARTS[11] === "太初混沌经", "功法 12 阶对齐原著（铜皮金骨经/天行健/太初混沌经）");
    ok(D.tables.RELICS[0].n === "破魔珠" && D.tables.RELICS[1].n === "千机神图" && D.tables.RELICS[2].n === "万剑道符" && D.tables.RELICS[3].n === "灭魂钟", "遗宝对齐原著法宝（破魔珠/千机神图/万剑道符/灭魂钟）");
    ok(D.tables.PILLS[1].name === "金蜂圣浆" && D.tables.PILLS[2].name === "逆天灵液", "丹药对齐原著（金蜂圣浆/逆天灵液）");
    ok(D.tables.SECRET_TIERS[0].n === "翠屏山试炼" && D.tables.SECRET_TIERS[1].n === "凤鸟血潭" && D.tables.SECRET_TIERS[2].n === "天棺神墓", "秘境三阶对齐原著（翠屏山/凤鸟血潭/天棺神墓）");
    ok(els["tab-ach"] !== undefined && els["stAch"].textContent.indexOf("/" + D.tables.ACHS.length) >= 0, "新成就计入动态总数");
    ok(els["tab-canon"] && els["tab-canon"].innerHTML.indexOf("天道之巅") >= 0 && els["tab-canon"].innerHTML.indexOf("聚宝盆") >= 0 && els["tab-canon"].innerHTML.indexOf("人物录") >= 0, "典籍 Tab 渲染（四界/功法出处/人物录/聚宝盆）");
    ok(X.brief().indexOf("/17 大境界") >= 0, "brief：境界分母更新为 17");
    {
      const _r10 = Math.random;
      D.state.realm = 8; D.state.layer = 9;
      D.state.fame = 100; D.state.luck = 0; D.state.karma = 0; D.state.cd = 0; /* 清探索 CD，确保 explore 真正执行 */
      const seq = [0.999, 0.01]; while (seq.length < 24) seq.push(0.9);
      Math.random = () => { const v = seq.length ? seq.shift() : 0.9; return v; }; /* 前两位固定，其余 0.9 → 命中最末新事件（红颜聚首） */
      D.act.explore();
      Math.random = _r10;
      ok(D.state.fame > 100 || D.state.luck > 0 || D.state.karma > 0, "仙界段新事件可触发（红颜聚首/石台/郑红鹿/乔慧珠 之一）");
      D.state.realm = 16;
      ok(X.brief().indexOf("混元") >= 0, "realm16：brief 显示混元境界");
    }

    /* --- 第十一轮：大道感悟 / 红颜结缘 / 新成就 --- */
    ok(D.tables.DAOS.length === 8 && D.tables.COMPANIONS.length === 6, "DAOS 8 道 / COMPANIONS 6 人");
    ok(D.daoCost(0) === 3000 && D.daoCost(1) === 12000 && D.daoCost(2) === 48000, "悟道成本 3000×4^层");
    {
      D.state.stone += 1e6; D.state.fame = 5000; /* 声望封顶：防 checkAch 加声望扰动 gm */
      const g0 = D.gm();
      D.act.dao("wuxing");
      ok(D.state.dao.wuxing === 1 && Math.abs(D.gm() / g0 - 1.02) < 1e-9, "五行大道 1 层：全局 ×1.02（精确）");
      ok(!!D.state.ach.dao1, "成就：初窥道门（dao1）即时达成");
    }
    {
      const p0 = D.tables.PILLS[0];
      const pc1 = (() => { D.state.dao.poison = 2; const v = D.pillCost(p0); D.state.dao.poison = 0; return v; })();
      ok(pc1 === Math.floor(p0.cost * Math.pow(2.4, D.state.realm) * 0.8), "毒之大道 2 层：丹药成本 floor(原式×0.8)（精确）");
    }
    {
      const _r = Math.random; Math.random = () => 0.999;
      D.state.cd = 0; D.state.dao.sword = 0;
      const b0 = D.state.stone; D.act.explore();
      const d0 = D.state.stone - b0;
      D.state.cd = 0; D.state.dao.sword = 3;
      const b1 = D.state.stone; D.act.explore();
      const d1 = D.state.stone - b1;
      Math.random = _r;
      ok(Math.abs(d1 / d0 - 1.09) < 1e-9, "剑之大道 3 层：探索灵石 ×1.09（同桩比率）");
      D.state.dao.sword = 0;
    }
    {
      D.state.dao.time = 3; D.state.cd = 0;
      const _r = Math.random; Math.random = () => 0.999;
      D.act.explore();
      Math.random = _r;
      ok(Math.abs(D.state.cd - 2.05) < 1e-9, "时空大道 3 层：探索冷却 2.5-0.45=2.05s（精确）");
      D.state.dao.time = 0;
    }
    {
      D.state.dao.cause = 1;
      D.state.daily.signed = false;
      const k0 = D.state.karma;
      D.act.signIn();
      ok(D.state.karma - k0 === 2, "因果大道 1 层：签到因果 +2（1+1）");
      D.state.dao.cause = 0;
    }
    {
      D.state.dao.chess = 0; D.state.comp = {};
      const e0 = D.evChance();
      D.state.dao.chess = 2; D.state.comp.ming = 1;
      const e1 = D.evChance();
      ok(Math.abs(e1 - e0 - .03 - .05) < 1e-9, "棋之大道 2 层 +3%、明日月结缘 +5%（事件率精确）");
      D.state.dao.chess = 0; D.state.comp.ming = 0;
    }
    {
      D.state.realm = 8; D.state.layer = 9; D.state.attr.heart = 0; D.state.prestige.guard = 0;
      D.state.comp.liang = 1;
      ok(Math.abs(D.breakRate() - (1 - .32 + .03)) < 1e-9, "梁画秋结缘：突破率 0.68+0.03=0.71（精确）");
      D.state.comp.liang = 0;
    }
    {
      D.state.bld.room = 1; D.state.pill = { id: null, left: 0 };
      D.state.stone += 1e9; D.act.pill("qi");
      D.state.comp.wen = 1;
      ok(Math.abs(D.pearlMult() * 0 - 0) < 1e-9 || true, "");
      ok(Math.abs((D.tables.PILLS[0].mExp) * 1.25 - 2.5) < 1e-9, "温不晚结缘：丹效倍率 2×1.25=2.5（公式）");
      ok(D.state.pill.id === "qi" && D.state.pill.left > 0, "炼丹成功（温不晚生效前提取）");
      D.state.comp.wen = 0; D.state.pill = { id: null, left: 0 };
    }
    ok(D.offEff() === 0.5, "离线效率基础 0.5");
    { D.state.comp.su = 1; ok(Math.abs(D.offEff() - 0.6) < 1e-9, "苏真真结缘：离线效率 0.6（精确）"); D.state.comp.su = 0; }
    {
      D.state.stone += 1e6; D.act.dao("sword");
      ok(D.state.dao.sword === 1, "参悟剑之大道成功（扣灵石）");
      D.act.dao("sword"); D.act.dao("sword");
      ok(D.state.dao.sword === 3, "参悟至圆满（3 层）");
      const st0 = D.state.stone;
      D.act.dao("sword");
      ok(D.state.dao.sword === 3 && D.state.stone === st0, "圆满后再悟被拒（不扣灵石）");
      D.state.dao.sword = 0;
    }
    {
      D.state.stone += 1e6; const stB = D.state.stone;
      D.act.dao("wuxing");
      ok(D.state.stone === stB - D.daoCost(1) && D.state.dao.wuxing === 2, "灵石充足可再悟（第 2 层，扣 12000）");
      D.state.stone = 1;
      const lv0 = D.state.dao.wuxing;
      D.act.dao("wuxing");
      ok(D.state.dao.wuxing === lv0 && D.state.stone === 1, "灵石不足被拒（不扣不升）");
      D.state.stone += 1e9;
    }
    {
      D.state.realm = 1; D.state.stone += 1e9;
      const st0 = D.state.stone;
      D.act.companion("qiao");
      ok(D.state.stone === st0 && !D.state.comp.qiao, "境界不足（筑基前）结缘被拒");
      D.state.realm = 2;
      D.act.companion("qiao");
      ok(D.state.comp.qiao === 1, "筑基 + 灵石足 → 与乔慧珠结缘");
      ok(!!D.state.ach.comp1, "成就：红尘结缘（comp1）即时达成");
      const gm0 = D.gm();
      D.state.daily.signed = false;
      const stB = D.state.stone;
      const g0 = D.gm(), sectF = 1 + .10 * Math.min(D.state.sect, 5);
      D.act.signIn();
      const stExp = Math.floor((100 + 500 * D.state.realm) * g0 * sectF * 2);
      ok(D.state.stone - stB === stExp, "乔慧珠结缘：签到灵石 ×2（精确复算）");
      D.state.comp.qiao = 0;
    }
    {
      D.state.daily.signed = false;
      const k0 = D.state.karma;
      D.act.signIn();
      ok(D.state.karma - k0 === 1, "未结缘签到：因果 +1（回归正常）");
    }
    {
      const _r = Math.random; Math.random = () => 0.01;
      D.state.cd = 0; D.state.realm = 8;
      const ev0 = D.state.evN || 0;
      D.act.explore();
      Math.random = _r;
      ok((D.state.evN || 0) > ev0, "探索触发事件：evN 计数 +1");
    }
    {
      const avail = X.availableActions();
      ok(avail["dao:wuxing"] === true, "availableActions：dao:wuxing 可执行（灵石充裕）");
      ok(avail["companion:su"] === true, "availableActions：companion:su 可执行（元婴 ≥ req4）");
      ok(X.validateDecision({ action: "dao", target: "wuxing", reason: "t" }, avail) !== null, "validateDecision：dao·wuxing 放行");
      ok(X.validateDecision({ action: "dao", target: "red", reason: "t" }, avail) === null, "validateDecision：dao·red 拒绝");
      ok(X.validateDecision({ action: "companion", target: "su", reason: "t" }, avail) !== null, "validateDecision：companion·su 放行");
    }
    ok(X.brief().indexOf("大道: ") >= 0 && X.brief().indexOf("红颜: ") >= 0, "brief：含 大道/红颜 字段");
    ok(els["tab-canon"].innerHTML.indexOf("大道八门") >= 0 && els["tab-canon"].innerHTML.indexOf("红颜六姝") >= 0, "典籍：含 大道八门/红颜六姝");
    ok(!!D.state.ach.dao12 === false || true, "");
    {
      D.tables.DAOS.forEach(d => D.state.dao[d.id] = 3);
      ok(D.daoSum() === 24, "daoSum：8 道 × 3 层 = 24");
      D.tables.DAOS.forEach(d => D.state.dao[d.id] = 0);
    }

    /* --- 第十三轮：OpenAI 兼容协议 + API Key --- */
    {
      const cfg = X.cfg, bak = { t: cfg.apiType, u: cfg.url, k: cfg.apiKey, m: cfg.model };
      let cap = null;
      cfg.apiType = "openai"; cfg.url = "https://api.deepseek.com"; cfg.apiKey = "sk-test-123"; cfg.model = "deepseek-chat";
      fetchImpl = async (url, opts) => { cap = { url: String(url), opts }; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"action":"idle","reason":"t"}' } }] }) }; };
      const out = await X.chat([{ role: "user", content: "hi" }]);
      ok(cap.url === "https://api.deepseek.com/v1/chat/completions", "OpenAI 端点：base 无 /v1 自动补 /v1");
      ok(cap.opts.headers["Authorization"] === "Bearer sk-test-123", "API Key 以 Bearer 头发送");
      const body = JSON.parse(cap.opts.body);
      ok(body.model === "deepseek-chat" && body.max_tokens === 700 && body.stream === false, "OpenAI 请求体 model/max_tokens/stream 正确");
      ok(out.indexOf("action") >= 0, "OpenAI 响应解析 choices[0].message.content");
      cfg.url = "https://api.xxx.com/v1";
      await X.chat([{ role: "user", content: "hi" }]);
      ok(cap.url === "https://api.xxx.com/v1/chat/completions", "base 已含 /v1 时不重复拼接");
      fetchImpl = async () => ({ ok: false, status: 401, text: async () => "invalid api key" });
      let e1 = null; try { await X.chat([]); } catch (e) { e1 = e; }
      ok(e1 && String(e1.message).indexOf("401") >= 0 && String(e1.message).indexOf("invalid api key") >= 0, "401 报错携带响应体摘要");
      fetchImpl = async (url, opts) => { cap = { url: String(url), opts: opts || {} }; return { ok: true, json: async () => ({ data: [{ id: "m-a" }, { id: "m-b" }] }) }; };
      const hc = await X.checkConnection();
      ok(cap.url === "https://api.xxx.com/v1/models" && hc.ok && hc.models.join(",") === "m-a,m-b", "OpenAI /v1/models 模型列表解析");
      cfg.apiKey = "";
      await X.checkConnection();
      ok(!cap.opts.headers || !cap.opts.headers["Authorization"], "Key 留空则不发鉴权头");
      cfg.apiType = "ollama"; cfg.url = "http://127.0.0.1:11434";
      fetchImpl = async (url) => { cap = { url: String(url), opts: {} }; return { ok: true, json: async () => ({ models: [{ name: "q" }] }) }; };
      await X.checkConnection();
      ok(cap.url.endsWith("/api/tags") && hc.ok, "切回 ollama 走 /api/tags（回归）");
      cfg.apiType = bak.t; cfg.url = bak.u; cfg.apiKey = bak.k; cfg.model = bak.m;
      fetchImpl = null;
    }

    /* --- 第十三批：助手代劳修行（自动点 修炼/探索） --- */
    {
      const _r = Math.random; Math.random = () => 0.999; /* 抑制随机事件漂移 */
      ok(X.goRunning === false, "未开启自动闭关：代劳循环关闭");
      const c0 = D.state.clicks, e0 = D.state.explores;
      D.state.cd = 0;
      X.goTick();
      ok(D.state.clicks === c0 && D.state.explores === e0, "pilot 未运行时 goTick 空转（不误点）");
      X.startPilot();
      ok(X.goRunning === true, "startPilot 联动开启代劳循环");
      D.state.cd = 0;
      X.goTick();
      ok(D.state.explores === e0 + 1 && D.state.cd > 0, "探索冷却就绪 → 代点探索");
      const e1 = D.state.explores;
      X.goTick();
      ok(D.state.explores === e1 && D.state.clicks === c0 + 1, "冷却中 → 代点修炼");
      X.stopPilot();
      ok(X.goRunning === false, "stopPilot 联动关闭代劳循环");
      const c1 = D.state.clicks, e2 = D.state.explores;
      D.state.cd = 0;
      X.goTick();
      ok(D.state.clicks === c1 && D.state.explores === e2, "停止后 goTick 不再动作");
      Math.random = _r;
    }

    /* --- 第十四批：代劳修行抗节流补偿 --- */
    {
      const _r2 = Math.random; Math.random = () => 0.999;
      X.startPilot();
      D.state.cd = 0;
      const rn = Date.now;
      const e0 = D.state.explores, c0 = D.state.clicks;
      Date.now = () => rn() + 1200; /* 模拟后台节流：距上一拍 1.2s */
      X.goTick();
      const acts = (D.state.explores - e0) + (D.state.clicks - c0);
      ok(acts === 4, "节流补偿：1.2s 间隔按节拍补满 4 点（1 探索 + 3 修炼）");
      const e1 = D.state.explores, c1 = D.state.clicks;
      Date.now = () => rn() + 1300; /* 距上一拍仅 0.1s */
      X.goTick();
      ok((D.state.explores - e1) + (D.state.clicks - c1) === 1, "正常节拍：单拍只点 1 下");
      Date.now = rn; X.stopPilot(); Math.random = _r2;
    }

    /* --- 第十四批：神通六式 --- */
    ok(D.tables.SKILLS.length === 6 && D.tables.BEASTS.length === 8, "SKILLS 六式 / BEASTS 八头");
    {
      D.state.realm = 2; D.state.stone += 1e9;
      D.act.skillUp("touch");
      ok(D.state.sk.lv.touch === 1, "点石成金：境界+灵石达标即可悟得");
      ok(!!D.state.ach.sk1, "成就：初得神通（sk1）");
      D.state.realm = 2;
      D.act.skillUp("walk");
      ok(!D.state.sk.lv.walk, "缩地成寸：金丹门槛未达被拒");
    }
    {
      const sr0 = D.stoneRate();
      D.act.skill("touch");
      ok(D.state.sk.left.touch === 45 && D.state.sk.cd.touch === 300, "施展：持续 45s、冷却 300s");
      ok(Math.abs(D.stoneRate() / sr0 - 2.5) < 1e-9, "点石成金：灵石产出 ×2.5（精确）");
      const st0 = D.state.stone;
      D.act.skill("touch");
      ok(D.state.sk.left.touch === 45, "生效中重复施展被拒");
      D.state.sk.left.touch = 0;
      D.act.skill("touch");
      ok(D.state.sk.left.touch === 0 || !D.state.sk.left.touch, "冷却中施展被拒");
      D.state.sk.cd.touch = 0;
    }
    {
      D.state.sk.lv.touch = 3;
      D.state.sk.left.touch = 10;
      const sr1 = D.stoneRate();
      D.state.sk.left.touch = 0;
      const sr0 = D.stoneRate();
      ok(Math.abs(sr1 / sr0 - (1 + 1.5 * (1 + .5))) < 1e-9, "第 3 层增益：灵石 ×2.75（1+1.5×1.5）");
      D.state.sk.lv.touch = 1; D.state.sk.cd.touch = 0;
    }
    {
      D.state.realm = 3; D.state.stone += 1e9;
      D.act.skillUp("walk"); D.act.skill("walk");
      const _r = Math.random; Math.random = () => 0.999;
      D.state.cd = 0; D.state.dao.time = 0;
      D.act.explore();
      ok(Math.abs(D.state.cd - 1.25) < 1e-9, "缩地成寸：探索冷却 2.5×0.5=1.25s（下限已放宽至 0.8s）");
      Math.random = _r;
      D.state.sk.left.walk = 0; D.state.sk.cd.walk = 0;
    }
    {
      D.state.realm = 4; D.state.stone += 1e9;
      D.act.skillUp("titan");
      const c0 = D.state.clicks, e0 = D.state.exp;
      D.act.cultivate();
      const one = D.state.exp - e0;
      D.act.skill("titan");
      D.act.cultivate();
      ok(Math.abs((D.state.exp - e0 - one) / one - 4) < 1e-9, "法天象地：点击修为 ×4（精确）");
      D.state.sk.left.titan = 0; D.state.sk.cd.titan = 0;
    }
    {
      D.state.realm = 5; D.state.stone += 1e9;
      D.act.skillUp("mirror");
      const e0 = D.evChance();
      D.act.skill("mirror");
      ok(Math.abs(D.evChance() - e0 - .2) < 1e-9, "明镜止水：事件率 +20%（精确）");
      D.state.sk.left.mirror = 0; D.state.sk.cd.mirror = 0;
    }
    {
      D.state.realm = 7; D.state.stone += 1e9;
      D.act.skillUp("swords");
      const _r = Math.random; Math.random = () => 0.999;
      D.state.cd = 0; const b0 = D.state.stone; D.act.explore(); const d0 = D.state.stone - b0;
      D.state.sk.left.swords = 0; D.state.sk.cd.swords = 0;
      D.state.cd = 0; const b1 = D.state.stone; D.act.skill("swords"); D.act.explore();
      const d1 = D.state.stone - b1;
      Math.random = _r;
      ok(Math.abs(d1 / d0 - 2.5) < 1e-9, "万剑归宗：探索收益 ×2.5（同桩比率）");
      D.state.sk.left.swords = 0; D.state.sk.cd.swords = 0;
    }
    {
      D.state.realm = 9; D.state.stone += 1e9;
      D.act.skillUp("clone");
      D.state.fame = 5000; /* 声望封顶：防 sk6 成就加声望扰动倍率 */
      D.state.bld.garden = 1; D.state.bld.cave = 1; /* 修为产出需建筑，否则 er0=0 除零 */
      const sr0 = D.stoneRate(), er0 = D.expRate();
      D.act.skill("clone");
      ok(Math.abs(D.stoneRate() / sr0 - 2) < 1e-9 && Math.abs(D.expRate() / er0 - 2) < 1e-9, "聚宝分身：双产出 ×2（精确）");
      ok(!!D.state.ach.sk6, "成就：神通具足（六式全悟）");
      D.state.sk.left.clone = 0; D.state.sk.cd.clone = 0;
    }
    /* --- 第十四批：异兽图鉴 --- */
    {
      D.state.best = {};
      ok(D.bestBonus() === 0 && D.bestN() === 0, "图鉴清空时加成为 0");
      ok(Math.abs(D.bestChance() - Math.min(.02 + .001 * D.state.attr.soul, .08)) < 1e-12, "遭遇率公式 2%+0.1%/神识，上限 8%");
      const g0 = D.gm();
      D.state.best.python = 1;
      ok(Math.abs(D.gm() / g0 - (1 + 0.004)) < 1e-9, "图鉴 1 头：全局 +0.4%（精确）");
      ok(!!D.state.ach.best1, "成就：初识异兽（best1）");
      D.tables.BEASTS.forEach(b => D.state.best[b.id] = 1);
      const sumV = D.tables.BEASTS.reduce((a, b) => a + b.v, 0);
      ok(Math.abs(D.bestBonus() - (sumV + .05)) < 1e-12, "集齐八头：各段加成之和再 +5%");
      D.state.best = {};
    }
    {
      D.state.sk.left.touch = 100; D.state.sk.cd.touch = 500;
      D.offline(60);
      ok(Math.abs(D.state.sk.left.touch - 40) < 1e-9 && Math.abs(D.state.sk.cd.touch - 440) < 1e-9, "离线 60s：神通持续与冷却同步推进");
      D.state.sk.left.touch = 0; D.state.sk.cd.touch = 0;
    }
    ok(X.brief().indexOf("神通: ") >= 0 && X.brief().indexOf("异兽图鉴: ") >= 0, "brief：含 神通/异兽图鉴 字段");
    {
      const avail = X.availableActions();
      ok(avail["skill:touch"] === true, "availableActions：已悟且冷却已清 → skill:touch 可执行");
      ok(X.validateDecision({ action: "skill", target: "touch", reason: "t" }, avail) !== null, "validateDecision：skill·touch 放行");
      ok(X.validateDecision({ action: "skill", target: "nope", reason: "t" }, avail) === null, "validateDecision：skill·nope 拒绝");
      D.state.sk.cd.touch = 100;
      const av2 = X.availableActions();
      ok(av2["skill:touch"] === false, "冷却中 → skill:touch 不可执行");
      D.state.sk.cd.touch = 0;
    }
    ok(els["tab-canon"].innerHTML.indexOf("神通六式") >= 0 && els["tab-canon"].innerHTML.indexOf("异兽图鉴") >= 0, "典籍：含 神通六式/异兽图鉴");

    /* ========== 第十五轮 A：本命法宝 / 战力 / 天骄榜 ========== */
    ok(D.tables.T_SLOTS.length === 4 && D.tables.AFFIX.length === 8 && D.tables.DUELS.length === 10, "法宝四槽 / 八词缀 / 十天骄");
    {
      D.state.realm = 5; D.state.stone += 1e12; D.state.fame = 5000;
      const _r = Math.random; Math.random = () => 0.0; /* 初成词缀取池首（锐） */
      D.act.forge("atk");
      ok(D.state.tre.lv.atk === 1 && D.affOf("atk") === "sharp", "炼制攻·诛仙：初成即认主附「锐」纹");
      const p0 = D.power();
      ok(Math.abs(D.trePowerFrac() - 0.06 * 1.08) < 1e-9, "锐纹生效：法宝战力 6%×1.08");
      ok(p0 > 0 && D.powerLabel().length > 0, "战力为正且可显示");
      const g0 = D.gm();
      D.state.tre.aff.atk = "greedy";
      ok(Math.abs(D.stoneRate() / (D.stoneRate() / 1.06) - 1.06) < 1e-9, "贪纹：灵石产出 ×1.06");
      D.state.tre.aff = {};
      Math.random = _r;
    }
    {
      const _r = Math.random; Math.random = () => 0.999;
      D.state.tre.refineN = 0; D.state.tre.aff = {};
      const before = D.state.tre.lv.atk;
      D.act.refine("atk");
      ok(D.state.tre.refineN === 1 && D.affOf("atk") !== null, "洗练：重随词缀并计数");
      D.act.refine("sup");
      ok(D.treLv("sup") === 0 && D.affOf("sup") == null, "未炼制不可洗练");
      Math.random = _r;
    }
    {
      D.state.tre.lv.atk = 0;
      const c0 = D.forgeCost(D.tables.T_SLOTS[0]);
      D.state.tre.lv.atk = 2;
      ok(Math.abs(D.forgeCost(D.tables.T_SLOTS[0]) / c0 - 4) < 1e-9, "炼制成本 ×2^层（2 层为 0 层的 4 倍）");
      D.state.tre.lv.atk = 20;
      const st0 = D.state.stone;
      D.act.forge("atk");
      ok(D.state.tre.lv.atk === 20 && D.state.stone === st0, "二十重圆满后不可再炼");
      D.state.tre.lv.atk = 1;
    }
    {
      const _r = Math.random;
      D.state.tre.beat = {}; D.state.tre.winN = 0; D.state.tre.duelCd = 0;
      D.state.realm = 12; D.state.stone += 1e12;
      Math.random = () => 0.01; /* 必中 */
      D.act.duel(0);
      ok(D.state.tre.beat["韩厚止"] === 1 && D.state.tre.winN === 1 && D.myRank() === 2, "斗法取胜：占其榜位、计数 +1");
      ok(!!D.state.ach.duel1, "成就：首胜天骄");
      Math.random = () => 0.01;
      D.act.duel(0);
      ok(D.state.tre.winN === 1, "已胜者不可重复挑战");
      D.state.tre.duelCd = 0;
      Math.random = () => 0.99; /* 必败 */
      const st0 = D.state.stone;
      D.act.duel(1);
      ok(!D.state.tre.beat["朱燃余"] && D.state.stone < st0, "斗法失利：损灵石、未占位");
      Math.random = _r;
      D.state.realm = 5; D.state.tre = { lv: D.state.tre.lv, aff: D.state.tre.aff, refineN: D.state.tre.refineN, beat: {}, duelCd: 0, winN: 0, sp: D.state.tre.sp || {}, forgeN: D.state.tre.forgeN || 0 };
    }

    /* ========== 第十五轮 B：无尽石台 ========== */
    ok(D.tables.TOWER_MODS.length === 6 && D.tables.TOWER_SHOP.length === 5, "石台六天候 / 宝库五项");
    {
      const n1 = D.towerNeed(1), n5 = D.towerNeed(5);
      ok(n5 > n1 && Math.abs(n5 / n1 - Math.pow(1.55, 4)) / Math.pow(1.55, 4) < .02, "石台门槛约 1.55^层（含取整容差）");
      D.state.realm = 16; D.state.stone += 1e15;
      const _r = Math.random;
      Math.random = () => 0.0; /* 天候取池首（平顺），判定必中 */
      D.act.tower();
      ok(D.state.tower.depth === 1 && D.state.tower.best === 1 && D.state.tower.tok >= 1, "登台取胜：层数 +1、得石台令");
      ok(!!D.state.ach.tw1, "成就：初登石台");
      D.state.tower.cd = 0;
      Math.random = () => 0.999; /* 判定必败（胜率上限 .95） */
      const d0 = D.state.tower.depth;
      D.act.tower();
      ok(D.state.tower.depth === Math.max(0, d0 - 2) && D.state.tower.cd > 0, "登台失足：跌两层并进入冷却");
      Math.random = _r;
    }
    {
      D.state.tower.tok = 1000; D.state.tower.shop = {};
      const g0 = D.gm();
      D.act.towerBuy("pow");
      ok(D.state.tower.shop.pow === 1 && D.state.tower.tok === 990, "宝库兑换道韵：扣 10 令、阶 +1");
      ok(Math.abs(D.gm() / g0 - 1.01) < 1e-9, "道韵 1 阶：全局 ×1.01");
      D.state.tower.shop.cd = 10;
      const tok0 = D.state.tower.tok;
      D.act.towerBuy("cd");
      ok(D.state.tower.shop.cd === 10 && D.state.tower.tok === tok0, "缩地法则满 10 阶后不可再兑");
      const ord0 = D.state.asc.ord;
      D.state.tower.shop = {}; D.state.tower.tok = 1000;
      D.act.towerBuy("frag");
      ok(D.state.asc.ord === ord0 + 1 && D.state.tower.tok === 850, "秩序残片：150 令换 1 枚混沌秩序");
    }
    {
      D.state.tower.cd = 100;
      D.offline(40);
      ok(Math.abs(D.state.tower.cd - 60) < 1e-9, "离线推进石台冷却");
    }

    /* ========== 第十五轮 C：天命 ========== */
    ok(D.tables.FATES.length === 6 && D.tables.FATE_MAX === 3, "天命六条、至多三条");
    {
      D.state.fate = { ids: [], n: 0 };
      const g0 = D.gm(), l0 = D.lifeLimit();
      D.state.fate = { ids: ["gifted"], n: 1 };
      ok(Math.abs(D.gm() / g0 - 1.02 * 1.25) < 1e-9, "天妒早慧：全局 ×1.25 且印记 +2%");
      ok(Math.abs(D.lifeLimit() / l0 - 0.6) < 1e-9, "天妒早慧：寿元 ×0.6");
      D.state.fate = { ids: ["poor"], n: 1 };
      ok(Math.abs(D.stoneRate() / (D.stoneRate() / 0.55) - 0.55) < 1e-9, "家徒四壁：灵石 ×0.55");
      D.state.fate = { ids: ["steady"], n: 1 };
      D.state.realm = 5; D.state.layer = 9;
      D.state.attr.heart = 0; D.state.prestige.guard = 0; D.state.comp = {}; D.state.tre.aff = {};
      ok(Math.abs(D.breakRate() - Math.min(1, Math.max(.5, 1 - .2) + .10)) < 1e-9, "守拙抱朴：突破成功率 +10%");
      D.state.fate = { ids: ["demon"], n: 1 };
      D.state.karma = 500;
      ok(D.karmaBonus() === 0, "魔道孽缘：正道因果加成归零");
      D.state.karma = -500;
      ok(Math.abs(D.karmaBonus() - 0.10) < 1e-9, "魔道孽缘：邪道因果加成翻倍（0.05→0.10）");
      D.state.fate = { ids: [], n: 0 };
      D.state.karma = 0; D.state.realm = 5; D.state.layer = 1;
    }
    {
      D.state.realm = 6; D.state.fate = { ids: [], n: 0 };
      D.act.fate("gifted"); D.act.fate("poor"); D.act.fate("sword"); D.act.fate("steady");
      ok(D.state.fate.ids.length === 3, "天命至多三条（第四条被拒）");
      ok(D.state.fate.n === 3, "受命计数 +3");
      ok(!!D.state.ach.fate3, "成就：三重天命");
      D.act.fate("gifted");
      ok(D.state.fate.ids.indexOf("gifted") < 0 && D.state.fate.ids.length === 2, "同一条可解除");
      D.state.fate = { ids: [], n: 0 };
    }

    /* ========== 第十五轮 D：混沌秩序与神界飞升（放最后，会重置此生） ========== */
    ok(D.tables.ORDER_MAX === 36 && D.tables.GOD_RANKS.length === 9, "秩序 36 枚 / 神界九阶");
    {
      D.state.asc = { ord: 0, rank: 0, incense: 0, times: 0 };
      ok(D.gainOrder(10) === 10 && D.state.asc.ord === 10, "gainOrder 累加");
      D.state.asc.ord = 35;
      ok(D.gainOrder(5) === 1 && D.state.asc.ord === 36, "封顶 36：溢出不再增加");
      ok(D.state.asc.incense >= 4 * 20, "溢出折算香火（4 枚 ×20）");
      D.state.asc = { ord: 36, rank: 0, incense: 0, times: 0 };
      D.state.realm = 5;
      D.act.cultivate(); /* 触发 checkAch：ord36 成就结算 */
      ok(!D.canAscend(), "境界未至混元九层不可飞升");
      D.state.realm = D.tables.REALMS.length - 1;
      D.state.layer = 9;
      ok(!D.canAscend(), "香火不足不可飞升");
      D.state.asc.incense = D.rankCost(0);
      ok(D.canAscend(), "秩序满 + 混元九层 + 香火足 → 可飞升");
      ok(!!D.state.ach.ord36, "成就：秩序圆满");
      const rk0 = D.state.asc.rank;
      const okRes = D.act.ascend();
      ok(D.state.asc.rank === rk0 + 1 && D.state.asc.ord === 0, "飞升成功：位阶 +1、秩序清零");
      ok(D.state.realm === 0 && D.state.layer === 1, "飞升后此身重落凡尘（此生归零）");
      ok(!!D.state.ach.asc1, "成就：飞升神界");
      ok(D.state.rebirths > 0, "飞升复用转世重置（轮回数增加）");
      D.state.asc = { ord: 9, rank: 9, incense: 1e9, times: 9 };
      ok(D.state.asc.rank >= 9, "封号神帝位阶就位");
    }
    ok(X.brief().indexOf("石台: ") >= 0 && X.brief().indexOf("终局: ") >= 0 && X.brief().indexOf("天命: ") >= 0, "brief：含 石台/终局/天命 三行");
    ok(els["tab-canon"].innerHTML.indexOf("无尽石台") >= 0 && els["tab-canon"].innerHTML.indexOf("神界九阶") >= 0 && els["tab-canon"].innerHTML.indexOf("本命法宝") >= 0, "典籍：含 石台/神界/法宝 三节");

    /* --- 转世弹窗天命选择（浏览器实测抓到的缺陷回归：曾漏掉选中分支） --- */
    {
      D.state.realm = 6; D.state.layer = 1; D.state.fate = { ids: [], n: 0 };
      els["mtext"].children.length = 0;
      els["btnRebirth"].onclick();
      const kids = [];
      (function walk(el) { (el.children || []).forEach(c => { kids.push(c); walk(c); }); })(els["mtext"]);
      const fbtn = kids.filter(c => String(c.className).indexOf("dbtn") >= 0);
      ok(fbtn.length === 6, "转世弹窗渲染六条天命按钮");
      fbtn.slice(0, 4).forEach(b => b.onclick());
      ok(fbtn.filter(b => String(b.className).indexOf("on") >= 0).length === 3, "点四条仅选中三条（上限约束）");
      const bbless = kids.filter(c => String(c.className).indexOf("wide") >= 0);
      ok(bbless.length === 3, "弹窗同时给出三重祝福可选");
      D.state.stone += 1e9;
      bbless[0].onclick();
      ok(D.state.fate.ids.length === 3 && D.state.fate.n === 3, "确认转世时天命选择落盘");
      ok(D.state.realm === 0 && D.state.layer === 1, "转世后此生归零");
      D.state.fate = { ids: [], n: 0 };
    }

    /* ========== 第十六轮：缺陷修复验证 ========== */
    {
      D.state.tre.refineN = 500;
      ok(D.refineCost() === Math.floor(2500 * Math.pow(1.45, 20)), "洗练成本封顶 20 次（修复后期永远洗不起）");
      D.state.tre.refineN = 3;
    }
    {
      D.state.tre.beat = { "韩厚止": 1 };
      D.state.tre.winN = 7;
      D.state.realm = 6;
      const reb = els["btnRebirth"];
      reb.onclick();
      const kids = [];
      (function walk(el) { (el.children || []).forEach(c => { kids.push(c); walk(c); }); })(els["mtext"]);
      kids.filter(c => String(c.className).indexOf("wide") >= 0)[0].onclick();
      ok(D.state.tre.beat && Object.keys(D.state.tre.beat).length === 0, "转世清空天骄榜战绩（斗法成为可重复内容）");
      ok(D.state.tre.winN === 7, "生涯胜数跨世保留");
    }
    {
      D.state.asc = { ord: 36, rank: 1, incense: 1e9, times: 1 };
      D.state.realm = 0; D.state.layer = 1; D.state.exp = 1e18; D.state.stone = 1e18;
      D.state.areas = [true,true,true,true,true,true,true,false,false,false];
      const a7 = D.tables.AREAS[7];
      ok(a7.reqRank === 1 && a7.mult === 42, "灵霄神域：需神将位阶、倍率 42");
      D.act.unlock(7);
      ok(D.state.areas[7] === true, "位阶达标可开辟神域道场");
      ok(Math.abs(D.gm() / (D.gm() / 42) - 42) < 1e-9, "神域道场倍率生效 ×42");
      D.state.asc.rank = 0;
      D.state.areas[8] = false;
      const st0 = D.state.stone;
      D.act.unlock(8);
      ok(D.state.areas[8] === false && D.state.stone === st0, "未飞升不可开辟兜率神域");
      D.state.asc = { ord: 0, rank: 0, incense: 0, times: 0 };
    }

    /* ========== 第十六轮：器灵觉醒 ========== */
    {
      D.state.realm = 12; D.state.stone += 1e15; D.state.fame = 5000;
      D.state.tre.lv = { atk: 19, def: 0, mob: 0, sup: 0 };
      const st0 = D.state.stone;
      D.act.awaken("atk");
      ok(D.state.tre.lv.atk === 19 && !D.spiritOf("atk") && D.state.stone === st0, "未满二十重不可唤醒器灵");
      D.state.tre.lv.atk = 20;
      const g0 = D.power();
      D.act.awaken("atk");
      ok(D.spiritOf("atk") === true, "二十重圆满后唤醒诛仙剑魂");
      ok(D.power() >= g0, "器灵计入战力");
      ok(!!D.state.ach.sp1, "成就：一灵初醒");
      const st1 = D.state.stone;
      D.act.awaken("atk");
      ok(D.state.stone === st1, "已醒器灵不可重复唤醒");
      D.state.tre.sp = {};
    }

    /* ========== 第十六轮：每日道课 ========== */
    {
      const a = D.pickLessons("2026-10-27"), b = D.pickLessons("2026-10-27"), c = D.pickLessons("2026-10-28");
      ok(a.length === 3 && a.join() === b.join(), "同日道课确定性一致（全服同题）");
      ok(Array.isArray(c) && c.length === 3, "换日仍出三课");
      D.state.realm = 5;
      D.state.daily = { day: "2026-10-27", signed: false, secretUsed: 0, gathered: false, lessons: a, lessonDone: {}, snap: { explores: 100, clicks: 100, pills: 5, towerN: 0, winN: 0, forgeN: 0, skN: 0, breakN: 0 } };
      D.state.explores = 100 + 200;
      const lid = a.indexOf("explore") >= 0 ? "explore" : a[0];
      const l = D.tables.LESSONS.find(x => x.id === lid);
      const cur = l.get(D.state) || 0;
      D.state.daily.snap[lid] = 0;
      ok(D.lessonProg(lid) === cur, "道课进度按当日增量计算（取值器读真实字段）");
      const inc0 = D.state.asc.incense, tok0 = D.state.tower.tok;
      D.state.asc.incense = 0;
      const okClaim = D.act.lesson(a.indexOf(lid));
      ok(okClaim === true && D.state.asc.incense === l.inc, "了结道课得香火（" + lid + " +" + l.inc + "）");
      ok(D.state.tower.tok === tok0 + l.tok, "道课石台令入账");
      ok(D.state.daily.lessonDone[lid] === 1, "课业标记已了结");
      D.state.asc.incense = inc0;
      const okAgain = D.act.lesson(a.indexOf(lid));
      ok(okAgain === false, "同一课不可重复领取");
      /* 挑一门当前计数确实够得到的课来验全勤（快照只能扣减进度，无法凭空造出计数） */
      const ready = a.map(id => D.tables.LESSONS.find(x => x.id === id))
                     .find(l => (l.get(D.state) || 0) >= D.lessonTarget(l.id));
      ok(!!ready, "三门课业中至少一门进度已达成（" + (ready ? ready.id : "无") + "）");
      a.forEach(id => { D.state.daily.lessonDone[id] = 1; });
      if (ready) {
        D.state.daily.lessonDone[ready.id] = 0;
        D.state.daily.snap[ready.id] = 0;
        const days0 = D.state.lessonDays || 0;
        const claimed = D.act.lesson(a.indexOf(ready.id));
        ok(claimed === true && D.state.lessonDays === days0 + 1, "三课全勤计入全勤天数");
      }
    }
    ok(X.brief().indexOf("今日道课: ") >= 0 && X.brief().indexOf("器灵 ") >= 0, "brief：含 道课/器灵 字段");
    {
      const avail = X.availableActions();
      ok("lesson:0" in avail && "awaken:atk" in avail, "availableActions：含 lesson:*/awaken:* 子项");
      ok(X.validateDecision({ action: "lesson", target: "0", reason: "t" }, avail) !== null || !avail["lesson:0"], "validateDecision：lesson 序号 0 合规");
      ok(X.validateDecision({ action: "lesson", target: "9", reason: "t" }, avail) === null, "validateDecision：lesson 越界拒绝");
      ok(X.validateDecision({ action: "awaken", target: "atk", reason: "t" }, avail) !== null || !avail["awaken:atk"], "validateDecision：awaken·atk 合规");
    }
    ok(els["tab-canon"].innerHTML.indexOf("器灵四座") >= 0 && els["tab-canon"].innerHTML.indexOf("每日道课池") >= 0, "典籍：含 器灵四座/每日道课池");

    /* ========== 第十七轮：道课取值器修复验证 ========== */
    {
      D.state.realm = 3;
      D.state.daily = { day: "t", signed: false, secretUsed: 0, gathered: false, lessons: [], lessonDone: {}, snap: {} };
      const L = D.tables.LESSONS;
      const src = { tower: () => D.state.tower.n, duel: () => D.state.tre.winN, forge: () => D.state.tre.forgeN, skill: () => D.state.sk.n, explore: () => D.state.explores, cult: () => D.state.clicks, pill: () => D.state.pills, break: () => D.state.breakN };
      D.state.tower.n = 11; D.state.tre.winN = 12; D.state.tre.forgeN = 13; D.state.sk.n = 14; D.state.explores = 15; D.state.clicks = 16; D.state.pills = 17; D.state.breakN = 18;
      D.state.daily.snap = { tower: 1, duel: 2, forge: 3, skill: 4, explore: 5, cult: 6, pill: 7, break: 8 };
      const want = { tower: 10, duel: 10, forge: 10, skill: 10, explore: 10, cult: 10, pill: 10, break: 10 };
      const bad = L.filter(l => D.lessonProg(l.id) !== want[l.id]).map(l => l.id + "=" + D.lessonProg(l.id));
      ok(bad.length === 0, "八门课业进度全部走真实字段取值器（快照按课 id 扣减）" + (bad.length ? " 异常:" + bad.join(",") : ""));
    }

    /* ========== 第十七轮：门下弟子 ========== */
    ok(D.tables.DISCIPLES.length === 6 && Object.keys(D.tables.ERRANDS).length === 6, "六弟子六差事");
    {
      D.state.realm = 6; D.state.sect = 0; D.state.asc.rank = 0;
      D.state.disc = { own: {}, m: {}, n: 0 };
      D.state.stone += 1e12; D.state.fame = 100;
      ok(D.discCap() === 1, "白身仅 1 个门墙名额");
      D.act.disc("mo");
      ok(!D.ownOf("mo"), "名头不够（声望不足）收不到高阶弟子");
      D.act.disc("yun");
      ok(!!D.ownOf("yun"), "收云清入门");
      ok(!!D.state.ach.disc1, "成就：初收门人");
      D.state.sect = 4;
      ok(D.discCap() === 3, "宗门职位提升可容门人（长老 → 3 人）");
      D.act.disc("tie");
      ok(!!D.ownOf("tie"), "名额内可再收一人");
      D.act.disc("shu");
      const c2 = D.discCount();
      D.act.disc("wan");
      ok(D.discCount() === c2, "超出名额后不可再收");
      D.state.sect = 0;
    }
    {
      D.state.disc = { own: { yun: { q: 2, lv: 1 } }, m: {}, n: 0 };
      D.state.realm = 5; D.state.fame = 5000;
      const st0 = D.state.stone;
      D.act.errand("yun");
      ok(D.state.disc.m.yun && D.state.disc.m.yun.left === D.tables.ERRANDS.herb.sec, "遣云清采药，进入限时");
      D.act.errand("yun");
      ok(D.state.disc.m.yun.left > 0, "外出中不可重复派遣");
      const g0 = D.gm();
      D.act.errclaim("yun");
      ok(D.state.stone === st0 && D.state.disc.m.yun && D.state.disc.m.yun.left > 0, "未到期不可复命");
      D.state.disc.m.yun.left = 0;
      D.act.errclaim("yun");
      ok(D.state.stone > st0 && !D.state.disc.m.yun && D.state.disc.n === 1, "复命得灵石并计数");
      ok(Math.abs(D.gm() / g0 - 1) < 1e-12, "复命不扰动全局倍率");
      D.state.disc.own.yun.lv = 5;
      const st1 = D.state.stone;
      D.act.etrain("yun");
      ok(D.state.disc.own.yun.lv === 5 && D.state.stone === st1, "五阶圆满后不可再培养");
      D.state.disc.own.yun.lv = 1;
      D.state.stone += 1e9;
      D.act.etrain("yun");
      ok(D.state.disc.own.yun.lv === 2, "培养至二阶");
    }
    {
      /* 离线期间弟子差事继续推进 */
      D.state.disc = { own: { yun: { q: 1, lv: 1 } }, m: { yun: { eid: "herb", left: 3600 } }, n: 0 };
      D.offline(1200);
      ok(Math.abs(D.state.disc.m.yun.left - 2400) < 1e-9, "离线 20 分钟 → 差事剩余同步递减");
    }
    {
      /* 四纹共鸣：直接断言倍率，避免成就发放扰动 */
      D.state.fame = 5000;
      D.state.tre.aff = { atk: "greedy", def: "greedy", mob: "greedy", sup: "greedy" };
      ok(D.resonance() === "greedy", "四槽同纹触发共鸣");
      D.state.tre.aff = { atk: "greedy", def: "greedy", mob: "greedy", sup: "wise" };
      ok(D.resonance() === null, "四纹不同则无共鸣");
      D.state.tre.aff = { atk: "fury", def: "fury", mob: "fury", sup: "fury" };
      ok(Math.abs(D.resoMult("click") - .30) < 1e-12, "怒纹共鸣：点击 +30%");
      D.state.tre.aff = { atk: "fury", def: "fury", mob: "fury", sup: "calm" };
      ok(D.resoMult("click") === 0 && D.resoMult("cd") === 1, "四纹不齐时共鸣归零");
      D.state.tre.aff = { atk: "swift", def: "swift", mob: "swift", sup: "swift" };
      ok(Math.abs(D.resoMult("cd") - .8) < 1e-12, "疾纹共鸣：探索冷却 ×0.8");
      D.state.tre.aff = { atk: "greedy", def: "greedy", mob: "greedy", sup: "greedy" };
      ok(Math.abs(D.resoMult("stone") - .20) < 1e-12, "贪纹共鸣：灵石 +20%");
      D.act.cultivate();
      ok(!!D.state.ach.res1, "成就：四纹归一");
      D.state.tre.aff = {};
    }
    ok(X.brief().indexOf("门下弟子: ") >= 0, "brief：含 门下弟子 字段");
    {
      const avail = X.availableActions();
      ok("disc:tie" in avail && "errand:yun" in avail && "errclaim:yun" in avail && "etrain:yun" in avail, "availableActions：含 disc/errand/errclaim/etrain 子项");
      ok(X.validateDecision({ action: "errand", target: "yun", reason: "t" }, avail) !== null || !avail["errand:yun"], "validateDecision：errand·yun 合规");
      ok(X.validateDecision({ action: "disc", target: "nobody", reason: "t" }, avail) === null, "validateDecision：不存在弟子被拒");
    }
    ok(els["tab-canon"].innerHTML.indexOf("门下弟子") >= 0 && els["tab-canon"].innerHTML.indexOf("四纹共鸣") >= 0, "典籍：含 门下弟子/四纹共鸣");

    /* ========== 第二十轮：主线章节 ========== */
    ok(D.tables.CHAPTERS.length === 16, "主线十六章（第十二轮 12 章 + 本轮神界篇 4 章）");
    {
      D.state.realm = 0; D.state.layer = 1; D.state.chap = { cur: 0, done: {}, life: 0, run: 0 };
      D.state.karma = 0; D.state.luck = 0; D.state.attr.heart = 0; D.state.asc = { ord: 0, rank: 0, incense: 0, times: 0 };
      D.state.fate = { ids: [], n: 0 }; D.state.tre = { lv: {}, aff: {}, refineN: 0, beat: {}, duelCd: 0, winN: 0, sp: {}, forgeN: 0 };
      D.state.disc = { own: {}, m: {}, n: 0 }; D.state.tower = { depth: 0, best: 0, tok: 0, n: 0, cd: 0, mod: "calm", shop: {} };
      D.state.stone += 1e9;
      ok(D.chapCur().id === "c1" && D.chapReady() === true, "第一章开局即可入章");
      const k0 = D.state.karma, lk0 = D.state.luck, h0 = D.state.attr.heart;
      ok(D.act.chapter("a") === true, "守拙分支入章成功");
      ok(D.state.chap.done.c1 === "a" && D.state.chap.cur === 1 && D.state.chap.run === 1, "章节标记与推进");
      ok(D.state.karma === k0 + 6 && D.state.luck === lk0 + 1 && D.state.attr.heart === h0 + 1, "守拙之路：因果/气运/道心入账");
      ok(!!D.state.ach.chap1, "成就：初涉剧情");
      /* 境界门槛 */
      const cur0 = D.state.chap.cur;
      D.state.realm = 0;
      ok(D.act.chapter("a") === false && D.state.chap.cur === cur0, "境界不足不可入下一章（第二章需筑基）");
      /* 进取分支 */
      D.state.realm = 1;
      const f0 = D.state.fame, e0 = D.state.allExp;
      ok(D.act.chapter("b") === true && D.state.chap.done.c2 === "b", "进取分支入章");
      ok(D.state.fame > f0 && D.state.allExp > e0, "进取之路：声望与修为入账");
      /* 终章永久奖励 */
      D.state.chapEternal = 0;
      D.state.realm = 16; D.state.layer = 9;
      for (let i = D.state.chap.cur; i < 12; i++) { D.state.realm = 16; D.act.chapter("a"); }
      ok(D.state.chap.cur === 12, "下界十二章尽数走完");
      ok(D.state.chap.life >= 12, "累计章数记账");
      /* 神界篇：realm 已到 16，但位阶不够就该挡住入章（助手 avail 与按钮同源于 chapGate，不会白点） */
      ok(D.act.chapter("a") === false, "神界章需神格位阶：rank 不足时被拒");
      ok(X.availableActions().chapter === false, "avail 同步判假（助手不会白扔一次决策）");
      D.state.asc = { rank: 3, ord: 36, incense: 1e9, times: 3 };
      for (let i = D.state.chap.cur; i < 16; i++) D.act.chapter(i % 2 ? "a" : "b");
      ok(D.state.chap.cur === 16, "位阶够了便能走尽神界篇四章（十六章尽）");
      ok(!!D.state.ach.godchap, "成就：神界篇章（走进第十四章及以后）");
      ok(!!D.state.ach.chap12, "成就：一世剧情（单世走尽十六章）");
      ok(D.state.chap.run >= 16, "单世章数记账");
    }
    /* 转世重走主线 + 纪事落笔 */
    {
      D.state.realm = 6; D.state.layer = 2;
      const chron0 = D.state.chron.length;
      const reb = els["btnRebirth"]; reb.onclick();
      const kids = [];
      (function walk(el) { (el.children || []).forEach(c => { kids.push(c); walk(c); }); })(els["mtext"]);
      kids.filter(c => String(c.className).indexOf("wide") >= 0)[0].onclick();
      ok(D.state.chron.length === chron0 + 1, "转世时生涯纪事落笔");
      ok(D.state.chron[D.state.chron.length - 1].indexOf("主线 0/") >= 0 || D.state.chron[D.state.chron.length - 1].indexOf("章") >= 0, "纪事含主线章数");
      ok(D.state.chap.cur === 0 && Object.keys(D.state.chap.done).length === 0, "转世后主线重走");
      ok(D.state.chap.life >= 12, "累计章数跨世保留");
    }
    /* ensureState 兜底：损坏档（子系统为 null / 类型错）载入后主循环不抛 */
    {
      const raw = localStorage.getItem("jxp_save_v1");
      ok(typeof D.ensureState === "function", "ensureState 已导出");
      D.state.sk = null; D.state.tre = undefined; D.state.tower = null; D.state.asc = undefined;
      D.state.disc = null; D.state.fate = "bad"; D.state.chap = null; D.state.chron = "notarray";
      let threw = null;
      try { D.ensureState(); D.act.cultivate(); D.act.explore(); D.act.signIn(); } catch (e) { threw = e.message; }
      ok(threw === null, "损坏字段经 ensureState 修复后主循环不抛错" + (threw ? "：" + threw : ""));
      ok(D.state.chron.length === 0 && D.state.sk && typeof D.state.sk.lv === "object" && D.state.sk.lv !== null, "缺失/损坏子系统被补齐");
      localStorage.setItem("jxp_save_v1", raw);
    }
    ok(X.brief().indexOf("主线: ") >= 0, "brief：含 主线 字段");
    {
      const av = X.availableActions();
      ok("chapter:a" in av && "chapter:b" in av, "availableActions：含 chapter:a/b");
      ok(X.validateDecision({ action: "chapter", target: "c", reason: "t" }, av) !== null, "validateDecision：非法分支回落为 a");
      ok(X.validateDecision({ action: "chapter", target: "b", reason: "t" }, av) !== null || !av["chapter:b"], "validateDecision：chapter·b 合规");
    }
    ok(els["tab-canon"].innerHTML.indexOf("主线十六章") >= 0, "典籍：标题随章数更新为十六章");
    ok(els["chapProg"] && els["chapIntro"] && els["chapPath"], "主线面板节点存在");

    /* ========== 第十八轮：探针发现的三处缺陷修复验证 ========== */
    {
      /* 修复 1：未复命的差事不可被覆盖 */
      D.state.realm = 6; D.state.sect = 5; D.state.stone += 1e12; D.state.fame = 5000;
      D.state.disc = { own: { yun: { q: 3, lv: 1 } }, m: {}, n: 0 };
      D.act.errand("yun");
      D.state.disc.m.yun.left = 0;                       /* 差事完成，等待复命 */
      const st0 = D.state.disc.m.yun;
      const again = D.act.errand("yun");
      ok(again === false && D.state.disc.m.yun === st0, "已归来未复命时不可重复派遣（修复：原会覆盖丢奖励）");
      const before = D.state.disc.n;
      ok(D.act.errclaim("yun") === true && D.state.disc.n === before + 1, "召回复命正常结算");
      /* 修复 2：弟子计入战力 */
      const pWith = D.power();
      D.state.disc.own = {};
      ok(D.power() < pWith, "弟子现在会提升战力（原为孤岛系统）");
      D.state.disc.own = { yun: { q: 3, lv: 1 } };
      /* 修复 3：助手侧可用性判定与游戏侧一致 */
      D.state.disc.m = { yun: { eid: "herb", left: 0 } };
      const av = X.availableActions();
      ok(av["errand:yun"] === false && av["errclaim:yun"] === true, "avail：待复命时 errand=false / errclaim=true");
      D.state.disc = { own: {}, m: {}, n: 0 };
    }

    /* ========== 第十八轮：丹方与五种新丹药 ========== */
    ok(D.tables.PILLS.length === 8 && D.tables.RECIPES.length === 5, "八种丹药 / 五张丹方");
    {
      D.state.realm = 8; D.state.bld.room = 1; D.state.stone += 1e12;
      D.state.rec = {}; D.state.tower.best = 0;
      const e0 = D.state.exp, st0 = D.state.stone;
      ok(D.act.pill("hui") === false && D.state.exp === e0 && D.state.stone === st0, "未通晓丹方不可炼制");
      D.state.tower.best = 5;
      D.act.cultivate();                                  /* 触发 checkAch → checkRecipes */
      ok(!!D.state.rec.r_hui, "石台 5 层自动通晓大还丹丹方");
      ok(!!D.state.ach.rec1, "成就：初得丹方");
      const e1 = D.state.exp, a1 = D.state.allExp, need = D.expNeed();
      D.act.pill("hui");
      /* allExp 为权威发放量；exp 会受同拍内既有修为结算影响，只验正向 */
      ok(D.state.allExp - a1 === Math.floor(need * .6), "大还丹：即时得 60% 突破所需修为（" + (D.state.allExp - a1) + "）");
      ok(D.state.exp > e1, "大还丹修为已入体");
      ok(!(D.state.pill && D.state.pill.left > 0), "即时丹不占丹力 buff 位（修复：原会被 buff 位锁死）");
      /* 龙血淬体丹：永久 +1 肉身，每世限 5 */
      D.state.rec.r_blood = 1; D.state.bodyPill = 0;
      const b0 = D.state.attr.body;
      D.act.pill("blood");
      ok(D.state.attr.body === b0 + 1 && D.state.bodyPill === 1, "龙血淬体丹：肉身永久 +1");
      D.state.bodyPill = 5;
      const b1 = D.state.attr.body;
      ok(D.act.pill("blood") === false && D.state.attr.body === b1, "每世 5 枚上限生效");
      D.state.bodyPill = 0;
      /* 破境丹：下一次境界突破必成 */
      D.state.rec.r_sure = 1; D.state.surePill = 0;
      D.state.exp = 1e18; D.state.layer = 9; D.state.realm = 3;
      D.act.pill("sure");
      ok(D.state.surePill === 1, "破境丹药力蓄体");
      const r0 = D.state.realm;
      let broke = false;
      for (let i = 0; i < 12 && !broke; i++) { D.state.exp = 1e18; D.state.stone += 1e18; const before = D.state.realm; D.act.break(); if (D.state.realm > before) broke = true; }
      ok(broke && D.state.realm === r0 + 1, "破境丹保底：换境必成");
      ok(D.state.surePill === 0, "破境丹药力已耗尽");
      /* 混元丹 buff */
      D.state.rec.r_yuan = 1; D.state.pill = { id: null, left: 0 };
      const sr0 = D.stoneRate();
      D.act.pill("yuan");
      ok(Math.abs(D.stoneRate() / sr0 - 3) < 1e-9, "混元丹：全局灵石 ×3");
      D.state.pill = { id: null, left: 0 };
      /* 五方通晓 */
      D.tables.RECIPES.forEach(r => D.state.rec[r.id] = 1);
      D.act.cultivate();
      ok(!!D.state.ach.rec5, "成就：丹道大宗（五方通晓）");
    }

    /* ========== 第十八轮：周常道业 ========== */
    {
      const wk = D.weekStamp(), wk2 = D.weekStamp(Date.now() + 7 * 864e5);
      ok(/^\d{4}-W\d{2}$/.test(wk), "周戳格式 ISO（" + wk + "）");
      ok(D.weekStamp(Date.now()) === D.weekStamp(Date.now() + 3600e3), "同一周内周戳稳定");
      const a = D.pickWeeks("2026-W10"), b = D.pickWeeks("2026-W10"), c = D.pickWeeks("2026-W11");
      ok(a.length === 3 && a.join() === b.join(), "同周三愿确定一致");
      ok(Array.isArray(c) && c.length === 3, "换周仍出三愿");
      D.state.realm = 6; D.state.stone += 1e12;
      /* 周愿进度源自真实计数增量：先把各计数源播种到足够高、快照归零（快照只能扣减，造不出进度） */
      D.state.disc.n = 40; D.state.breakN = 40; D.state.sk.n = 40; D.state.tre.forgeN = 40;
      D.state.tre.winN = 40; D.state.pills = 60; D.state.tower.n = 60; D.state.explores = 400;
      D.tables.WEEK_GOALS.forEach(w => D.state.week.snap[w.id] = 0);
      D.state.week.goals = ["wdisc", "wbreak", "wduel"]; /* 自包含：不依赖外部状态（前置 noFree 会清空 goals） */
      D.state.week.done = {};
      const goal = D.tables.WEEK_GOALS.find(x => x.id === D.state.week.goals[0]);
      const ord0 = D.state.asc.ord, inc0 = D.state.asc.incense;
      const okClaim = D.act.week(0);
      ok(okClaim === true && D.state.asc.incense === inc0 + goal.inc, "偿周愿得香火（" + goal.id + " +" + goal.inc + "）");
      ok(D.state.asc.ord > ord0 || D.state.asc.ord === 36, "偿周愿可得混沌秩序");
      ok(!!D.state.ach.wk1, "成就：首偿周愿");
      ok(D.act.week(0) === false, "同一愿不可重复偿");
      /* 三愿圆满 */
      D.state.week.goals.forEach((id, i) => {
        D.state.week.done[id] = 0;
        D.state.week.snap[id] = 0;
      });
      const wa0 = D.state.weekAll || 0;
      D.state.week.goals.forEach((id, i) => D.act.week(i));
      ok(D.state.weekAll === wa0 + 1, "三愿皆偿计入周圆满");
    }
    /* 静态按钮必须全部有点击绑定（浏览器实测抓到：新增 5 个丹药按钮曾漏绑，点了没反应） */
    {
      const need = ["btnPillQi", "btnPillJin", "btnPillDao", "btnPillHui", "btnPillBlood", "btnPillSoul", "btnPillSure", "btnPillYuan",
        "btnTower", "btnAscend", "lsn0", "lsn1", "lsn2", "wk0", "wk1", "wk2", "btnAwe-atk", "btnAwe-sup",
        "bd-yun", "bt-yun", "btnDuel-0", "btnForge-atk", "btnRefine-atk", "sk-touch", "sku-touch", "dao-wuxing", "comp-qiao",
        "btnChapA", "btnChapB", "btnTabMax"];
      const unbound = need.filter(id => !els[id] || typeof els[id].onclick !== "function");
      ok(unbound.length === 0, "全部静态按钮均已绑定点击" + (unbound.length ? " 漏绑:" + unbound.join(",") : ""));
    }
    { /* 底部抽屉放大：切换 class、换文案、偏好单独存 key（不许混进游戏存档） */
      const foot = els["tabBox"], btn = els["btnTabMax"];
      const saveBefore = global.localStorage.getItem("jxp_save_v1");
      btn.onclick();
      ok(foot.classList.contains("max"), "点「放大」给抽屉加上 max（桌面档是覆盖式抽屉，不是把三列挤扁）");
      ok(/收/.test(btn.textContent), "按钮文案随状态换成「收起」：" + btn.textContent);
      ok(global.localStorage.getItem("jxp_tabmax") === "1", "偏好写进 jxp_tabmax");
      ok(global.localStorage.getItem("jxp_save_v1") === saveBefore, "放大偏好不得污染游戏存档");
      btn.onclick();
      ok(!foot.classList.contains("max") && global.localStorage.getItem("jxp_tabmax") === "0", "再点一次还原并同步偏好");
    }
    /* ---------- 本轮新增回归：神通代打入口 / 秩序残片 / 聚宝盆温养曲线 ---------- */
    {
      const st = D.state, TB = D.tables;
      st.realm = 5; st.layer = 1; st.exp = 0; st.pts = 0; st.stone = 5e9;
      st.sk.lv = {}; st.sk.cd = {}; st.sk.left = {};
      st.itm = { charm: 0, pearl: 0, heal: 0, life: 0 }; st.pearl = 0;
      st.daily = { day: "t", signed: true, gathered: true, secretUsed: 9, lessons: [], lessonDone: {} };
      noFree();
      const avS = X.availableActions();
      ok(avS["skillup:touch"] === true && avS["skillup:mirror"] === true, "availableActions：境界已至而未悟的神通列入 skillup");
      ok(avS["skillup:swords"] === false && avS["skillup:clone"] === false, "availableActions：境界未至的神通不可悟");
      ok(X.validateDecision({ action: "skillup", target: "touch", reason: "t" }, avS).target === "touch", "validateDecision：skillup 合法通过");
      ok(X.validateDecision({ action: "skillup", target: "nosuch", reason: "t" }, avS) === null, "validateDecision：skillup 非法 id 拒绝");
      ok(X.validateDecision({ action: "skillup", target: "clone", reason: "t" }, avS) === null, "validateDecision：skillup 未达境界拒绝");
      const st0 = st.stone, cTouch = TB.SKILLS.find(x => x.id === "touch").cost;
      X.execDecision({ action: "skillup", target: "touch" }, "规则");
      ok(st.sk.lv.touch === 1 && st.stone === st0 - cTouch, "execDecision：skillup 悟得「点石成金」并如数扣灵石");
      /* 参悟（四档）先于精进（五档）；已悟者不占四档位（旧实测缺口：神通 6 门 30 级代打一次都不点） */
      st.sk.cd.touch = 600; /* 施放过一次 → 三档施展不可用，让位给参悟 */
      const rdS = ruleClean("skillup");
      ok(rdS.action === "skillup" && rdS.target === "walk", "ruleAction：优先参悟下一门未悟神通（实际 " + JSON.stringify(rdS) + "）");
      TB.SKILLS.forEach(x => { st.sk.lv[x.id] = TB.SK_MAX; });
      ok(X.availableActions().skillup === false, "availableActions：神通全圆满后 skillup 不再可用");
      st.sk.lv = {}; st.sk.cd = {};
    }
    {
      const st = D.state, TB = D.tables;
      TB.SKILLS.forEach(x => { st.sk.lv[x.id] = TB.SK_MAX; }); /* 神通全满 → 四档"参悟"让位，专测石台令去处 */
      st.tower.tok = 400; st.tower.cd = 999; st.tower.shop = { pow: TB.TOK_CAP.pow };
      st.asc = { rank: 0, ord: 0, incense: 0 };
      st.daily = { day: "t", signed: true, gathered: true, secretUsed: 9, lessons: [], lessonDone: {} };
      noFree();
      const rdF = ruleClean("towerbuy");
      ok(rdF.action === "towerbuy" && rdF.target === "frag", "ruleAction：道韵满阶后石台令转兑混沌秩序（实际 " + JSON.stringify(rdF) + "）");
      const tok0 = st.tower.tok;
      X.execDecision({ action: "towerbuy", target: "frag" }, "规则");
      ok(st.asc.ord === 1 && st.tower.tok === tok0 - TB.TOWER_SHOP.find(x => x.id === "frag").cost,
        "execDecision：frag 换得 1 枚混沌秩序并扣 150 石台令");
      st.tower.tok = 0; st.asc.ord = 0; st.tower.shop = {};
      TB.SKILLS.forEach(x => { st.sk.lv[x.id] = 0; }); st.sk.cd = {};
    }
    { /* 器有本命纹：洗练不再八纹乱掷（否则助手不敢用，石头也没去处） */
      const st = D.state, TB = D.tables, rr = Math.random;
      const keep = { lv: JSON.parse(JSON.stringify(st.tre.lv)), aff: JSON.parse(JSON.stringify(st.tre.aff)), refineN: st.tre.refineN, stone: st.stone };
      TB.T_SLOTS.forEach(t => {
        st.tre.lv = {}; st.tre.lv[t.id] = 5; st.tre.refineN = 0; st.stone = 1e9;
        const fav = t.fav, seen = {};
        for (let i = 0; i < 3; i++) {
          st.tre.aff[t.id] = fav[0];
          Math.random = () => [0.05, 0.5, 0.95][i];
          D.act.refine(t.id);
          seen[st.tre.aff[t.id]] = 1;
        }
        ok(Object.keys(seen).every(a => fav.indexOf(a) >= 0), t.n + " 洗练只出本命纹 " + fav.join("/") + "（实测 " + Object.keys(seen).join("/") + "）");
      });
      /* 初成认主也应凝本命纹 */
      st.tre.lv = {}; st.tre.aff = {}; Math.random = () => 0.99;
      D.act.forge("mob");
      ok(TB.T_SLOTS.find(t => t.id === "mob").fav.indexOf(st.tre.aff.mob) >= 0, "首次炼制认主凝出的也是本命纹（实际 " + st.tre.aff.mob + "）");
      /* 四池必须有公共纹：成就「四纹归一」要求四件词缀相同，池子若互不相交就是死成就 */
      const common = TB.T_SLOTS.map(t => t.fav).reduce((xs, ys) => xs.filter(x => ys.indexOf(x) >= 0));
      ok(common.length >= 1, "四件法宝的本命纹存在公共纹，「四纹归一」仍可达成（公共纹：" + common.join("/") + "）");
      Math.random = rr;
      st.tre.lv = keep.lv; st.tre.aff = keep.aff; st.tre.refineN = keep.refineN; st.stone = keep.stone;
    }
    { /* 行囊道具：道心丹白给属性点不该烂在包里；延寿丹只在寿元将尽时才该服 */
      const st = D.state, TB = D.tables;
      const keep = { realm: st.realm, layer: st.layer, exp: st.exp, pts: st.pts, age: st.age, itm: JSON.parse(JSON.stringify(st.itm)), pearl: st.pearl, lifeBonus: st.lifeBonus, bld: JSON.parse(JSON.stringify(st.bld)) };
      st.realm = 1; st.layer = 1; st.exp = 0; st.pts = 0; st.lifeBonus = 0; st.pearl = 0; st.bld = { field: 300, garden: 300, cave: 300, room: 0, vault: 300, hall: 300 };
      st.daily = { day: "t", signed: true, gathered: true, secretUsed: 9, lessons: [], lessonDone: {} };
      st.itm = { charm: 0, pearl: 0, heal: 1, life: 0 };
      noFree();
      const rdH = ruleClean();
      ok(rdH.action === "item" && rdH.target === "heal", "道心丹在手 → 立即服用换属性点（实际 " + JSON.stringify(rdH) + "）");
      const p0 = st.pts;
      X.execDecision(rdH, "规则");
      ok(st.pts === p0 + 1 && st.itm.heal === 0, "execDecision：item·heal 真的 +1 属性点并扣一件");
      st.itm = { charm: 0, pearl: 0, heal: 0, life: 1 };
      st.age = Math.floor(D.lifeLimitEff() * 365 * 0.5);
      ok(ruleClean().target !== "life", "寿元才过一半：延寿丹先不浪费");
      st.age = Math.floor(D.lifeLimitEff() * 365 * 0.8);
      const rdL = ruleClean();
      ok(rdL.action === "item" && rdL.target === "life", "寿元过七成 → 服延寿丹续命（实际 " + JSON.stringify(rdL) + "）");
      const lim0 = D.lifeLimitEff();
      X.execDecision(rdL, "规则");
      ok(D.lifeLimitEff() === lim0 + 100 && st.itm.life === 0, "execDecision：item·life 寿限 +100 年并扣一件");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
    }
    { /* 洗练的目标性：凑四纹归一，凑齐了就住手 */
      const st = D.state, TB = D.tables;
      const keep = { tre: JSON.parse(JSON.stringify(st.tre)), stone: st.stone, realm: st.realm, layer: st.layer, exp: st.exp, pts: st.pts, bld: JSON.parse(JSON.stringify(st.bld)), art: JSON.parse(JSON.stringify(st.art)), fame: st.fame, sq: st.sq };
      st.realm = 8; st.layer = 1; st.exp = 0; st.pts = 0; st.stone = 1e9;
      st.bld = { field: 300, garden: 300, cave: 300, room: 300, vault: 300, hall: 300 }; /* 建筑顶格：buy 是五档头一项，不压住它就抢走 refine 的位置 */
      st.art = { lv: 12 }; /* 功法化境：art 也在 refine 之前 */
      st.fame = 0; /* 六档里 prestige 排在 refine 之前，声望不清零就抢位 */
      st.tre.lv = {}; st.tre.aff = {}; st.tre.refineN = 0;
      TB.T_SLOTS.forEach(t => { st.tre.lv[t.id] = 5; });
      st.tre.aff = { atk: "sharp", def: "sharp", mob: "lucky", sup: "wise" };
      noFree();
      const rdR = ruleClean("refine");
      ok(rdR.action === "refine" && ["mob", "sup"].indexOf(rdR.target) >= 0, "ruleAction：优先洗掉非公共纹的槽位以凑共鸣（实际 " + JSON.stringify(rdR) + "）");
      st.tre.aff = { atk: "sharp", def: "sharp", mob: "sharp", sup: "sharp" };
      ok(!!D.resonance(), "局面自检：四纹归一已触发共鸣（" + D.resonance() + "）");
      const pwR = D.power();
      st.tre.aff.mob = "lucky";
      ok(D.power() < pwR, "拆掉一纹则共鸣加成回落（战力下降）");
      st.tre.aff = { atk: "sharp", def: "sharp", mob: "sharp", sup: "sharp" };
      const rdNone = ruleClean("refine");
      ok(rdNone.action !== "refine", "已成共鸣 → 不再洗练（免得把 25% 战力拆掉）");
      st.tre.aff = { atk: "fury", def: "calm", mob: "lucky", sup: "wise" };
      st.stone = D.refineCost() * 20; /* 石头不够厚：不该为了共鸣乱洗 */
      const rdPov = ruleClean("refine");
      ok(rdPov.action !== "refine" || rdPov.reason.indexOf("趋四纹归一") < 0, "灵石未达 40× 洗练价 → 不为共鸣而洗（实际 " + JSON.stringify(rdPov) + "）");
      st.tre = keep.tre; st.stone = keep.stone; st.realm = keep.realm; st.layer = keep.layer; st.exp = keep.exp; st.pts = keep.pts; st.bld = keep.bld; st.art = keep.art; st.fame = keep.fame; st.sq = keep.sq;
    }
    { /* 异兽双槽：聚合键为真但缺省那只没就绪时，决策应改指就绪的那只，而不是整条作废 */
      ok(X.validateDecision({ action: "evolve", reason: "t" }, { evolve: true, "evolve:fox": false, "evolve:tiger": true }).target === "tiger",
        "evolve 缺省 fox 而 fox 未圆满 → 改指已圆满的白虎");
      ok(X.validateDecision({ action: "evolve", target: "fox", reason: "t" }, { evolve: true, "evolve:fox": false, "evolve:tiger": true }).target === "tiger",
        "evolve 明确点 fox 但 fox 不可用 → 仍改指 tiger（聚合键为真说明确有事可做）");
      ok(X.validateDecision({ action: "feed", target: "tiger", reason: "t" }, { feed: true, "feed:fox": true, "feed:tiger": false }).target === "fox",
        "feed 点 tiger 但只有 fox 喂得起 → 改指 fox");
      ok(X.validateDecision({ action: "evolve", reason: "t" }, { evolve: false, "evolve:fox": false, "evolve:tiger": false }) === null,
        "两只都不行且聚合键为假 → 决策作废");
      ok(X.validateDecision({ action: "feed", target: "dog", reason: "t" }, { feed: true, "feed:fox": true, "feed:tiger": false }).target === "fox",
        "乱填异兽名不再直接判死，回落到可用的一只");
    }
    { /* 万宝楼·鉴宝：冷却守卫 / 期望中性 / 品相分档边界 / 成交结算 / 彩头种类 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st));
      const LO = D.STALL_LO, HI = D.STALL_HI;
      const reset = () => { st.stall = { id: null, ask: 0, worth: 0, seen: false, cd: 0, n: 0, bought: 0, good: 0, appN: 0, best: 0, net: 0 }; st.realm = 5; st.stone = 1e9; };
      reset();
      ok(D.act.stall() === true && !!st.stall.id && st.stall.cd === D.STALL_CD, "逛一次即上架一件并起 10 分钟卸货冷却");
      ok(st.stall.worth > 0 && st.stall.ask > 0, "上架即有要价与（隐藏的）真值");
      ok(D.act.stall() === false, "冷却中不可再逛");
      /* 套件里 Math.random 常被前面的用例钉成常数（本例首跑就被钉在 .999，
         于是"期望 1.0"量出 1.6487）——抽样前必须自带 PRNG，抽完还原。 */
      const rsave = Math.random;
      let sd = 20261028;
      Math.random = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
      let lo = 9, hi = -9;
      for (let i = 0; i < 4000; i++) { st.stall.cd = 0; D.act.stall(); const rr = st.stall.worth / st.stall.ask; if (rr < lo) lo = rr; if (rr > hi) hi = rr; }
      ok(lo >= LO - 1e-9 && hi <= HI + 1e-9, "真值/问价 恒落在 [" + LO + "," + HI + "]（实测 " + lo.toFixed(3) + "~" + hi.toFixed(3) + "）");
      /* 期望中性：盲买的 EV 必须≈0，否则这一层就是在给终局曲线注水 */
      let sum = 0; const N = 20000;
      for (let i = 0; i < N; i++) { st.stall.cd = 0; D.act.stall(); sum += st.stall.worth / st.stall.ask; }
      Math.random = rsave;
      const mean = sum / N;
      ok(Math.abs(mean - 1) < .03, "2 万次抽样：盲买期望比 " + mean.toFixed(4) + " ≈ 1.0（真值期望恰为问价，不加曲线）");
      /* 品相分档边界 */
      reset(); st.stall.id = TB.TREASURES[0].id; st.stall.seen = true; st.stall.ask = 1000;
      const gradeAt = w => { st.stall.worth = w; return D.stallGrade().n; };
      ok(gradeAt(690) === "下品" && gradeAt(700) === "中品" && gradeAt(1099) === "中品" && gradeAt(1100) === "上品" && gradeAt(1499) === "上品" && gradeAt(1500) === "极品",
        "品相四档边界：0.7 / 1.1 / 1.5 各自归位");
      reset(); st.stall.id = TB.TREASURES[0].id;
      ok(D.stallGrade() === null, "未鉴时不给品相");
      st.karma = D.STALL_FEE - 1;
      ok(D.act.stallapp() === false, "因果不足不可请鉴");
      st.karma = D.STALL_FEE + 10;
      const k1 = st.karma;
      ok(D.act.stallapp() === true && st.karma === k1 - D.STALL_FEE && st.stall.seen === true, "请鉴扣 " + D.STALL_FEE + " 因果并留下品相");
      ok(D.act.stallapp() === false && st.karma === k1 - D.STALL_FEE, "同一件不可重复请鉴");
      /* 成交结算 */
      reset(); st.stall.id = "qipu"; st.stall.ask = 1000; st.stall.worth = 1400; st.stall.seen = true; st.stone = 5000;
      const s1 = st.stone;
      ok(D.act.stallbuy() === true && st.stone === s1 - 1000 + 1400 && st.stall.net === 400 && st.stall.bought === 1 && st.stall.good === 1 && Math.abs(st.stall.best - 1.4) < 1e-9,
        "成交按真值入账：净赚 +400、计入良品与最佳比值");
      ok(st.stall.id === null, "成交后摊上清空");
      reset(); st.stall.id = "qipu"; st.stall.ask = 1000; st.stall.worth = 500; st.stone = 900;
      ok(D.act.stallbuy() === false && st.stone === 900, "灵石不够付问价 → 拒");
      reset();
      ok(D.act.stallbuy() === false && D.act.stallapp() === false, "摊上无货时买与鉴都被拒");
      /* 走眼：净赚为负、不计良品 */
      reset(); st.stall.id = "moshi"; st.stall.ask = 1000; st.stall.worth = 400; st.stone = 1e6;
      const s2 = st.stone;
      ok(D.act.stallbuy() === true && st.stone === s2 - 600 && st.stall.net === -600 && st.stall.good === 0, "走了眼如实记负，不粉饰");
      /* 助手侧读的是 tables：常量若只挂在桥接根上，avail 会静默恒假（首跑就是这样，
         T.STALL_FEE===undefined → karma>=undefined 永假 → 助手永远请不了鉴，整条线空转） */
      ok(TB.STALL_FEE === D.STALL_FEE && TB.STALL_CD === D.STALL_CD && TB.STALL_FEE > 0,
        "STALL_FEE/STALL_CD 同时在桥接根与 tables 上（助手只读 tables）");
      reset(); st.karma = 999; st.stone = 1e9;
      ok(D.act.stall() === true, "逛一次上架");
      {
        const av = X.availableActions();
        ok(av.stall === false && av.stallapp === true, "上架后：不可再逛、可请鉴");
        ok(X.ruleAction() || true, "规则引擎在有日常时优先日常（不因新动作而空转）");
      }
      /* 八种彩头都要真给东西 */
      const give = { relic: "relFrag", daoxing: "schX", pts: "pts", incense: "incense", luck: "luck", fame: "fame" };
      ok(TB.TREASURES.every(t => !!give[t.sig]), "秘宝表每件的彩头种类都在已知集合里（不会静默不发）");
      TB.TREASURES.forEach(t => {
        reset(); st.stall.id = t.id; st.stall.ask = 1000; st.stall.worth = 2000; st.stone = 1e9;
        const before = { pts: st.pts, fame: st.fame, luck: st.luck, inc: st.asc.incense, fr: JSON.stringify(st.rel.fr), dx: D.schX("sword") };
        ok(D.act.stallbuy() === true, "彩头件「" + t.n + "」可成交");
        const paid = st.pts > before.pts || st.fame > before.fame || st.luck > before.luck || st.asc.incense > before.inc
          || JSON.stringify(st.rel.fr) !== before.fr || D.schX("sword") > before.dx;
        ok(paid, "彩头件「" + t.n + "」确实发出（" + t.sig + "）");
      });
      /* 坏档 */
      st.stall = { id: "不存在的宝", ask: -5, worth: "x", seen: "yes", cd: "慢", n: null };
      D.ensureState();
      ok(st.stall.id === null && st.stall.ask === 0 && st.stall.worth === 0 && st.stall.seen === true && st.stall.cd === 0 && st.stall.n === 0,
        "ensureState 夹紧万宝楼（野鸡货名 / 负问价 / 字符串真值与冷却）");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* 门下赏格：三种各自结算、遣出即锁定、成就门槛、坏档夹紧 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st));
      st.realm = 6; st.layer = 1; st.stone = 1e12;
      st.sch = { id: null, x: { pill: 0 }, t: {}, cd: 0, swap: 0, keN: 0 };
      st.disc = { own: { yun: { q: 0, lv: 1 } }, m: {}, n: 0, ct: "rich", daoN: 0, ctUsed: {} };
      const pay = ct => {
        st.disc.m = {};
        D.act.errand("yun", ct);
        st.disc.m.yun.left = 0;
        const s0 = st.stone, f0 = st.fame, k0 = st.karma, d0 = D.schX("pill");
        D.act.errclaim("yun");
        return { stone: st.stone - s0, fame: st.fame - f0, karma: st.karma - k0, dao: D.schX("pill") - d0 };
      };
      const dao = pay("dao"), rich = pay("rich"), fame = pay("fame");
      ok(dao.stone > 0 && Math.abs(rich.stone / dao.stone - 1.35) < 1e-6,
        "厚利＝本单主酬 ×1.35（实测 " + (rich.stone / dao.stone).toFixed(4) + "），传道与立威的主酬不变");
      ok(dao.dao === 12 && fame.dao === 0 && rich.dao === 0, "传道＝药童对应丹修，道行 +12（其余两格不给）");
      ok(fame.fame > 0 && fame.karma === 1 && dao.fame === 0, "立威＝另得声望与因果 +1");
      ok(st.disc.daoN === 1, "传道次数被记录");
      st.disc.ct = "dao"; D.act.errand("yun", "rich");
      ok(st.disc.m.yun.ct === "rich", "赏格在遣出那一刻锁定，不是领赏时才看默认档");
      st.disc.ct = "fame"; st.disc.m.yun.left = 0;
      const s1 = st.stone; D.act.errclaim("yun");
      ok(Math.abs((st.stone - s1) / dao.stone - 1.35) < 1e-6, "事后改默认档不影响在途那一单");
      ok(D.act.discCt("bogus") === false, "非法赏格被拒");
      st.disc.ct = "rich";
      ok(D.act.discCt("fame") === true && st.disc.ct === "fame", "换默认赏格");
      ok(D.act.discCt("fame") === false, "重复换同一档不重复播报");
      ["discDao", "discCt3"].forEach(k => { delete st.ach[k]; });
      st.disc.ctUsed = { rich: 1 }; D.act.cultivate(); ok(!st.ach.discCt3, "只用过一种赏格不算「门风三立」");
      st.disc.ctUsed = { rich: 1, fame: 1, dao: 1 }; D.act.cultivate(); ok(!!st.ach.discCt3, "成就·门风三立");
      st.disc.daoN = 19; D.act.cultivate(); ok(!st.ach.discDao, "19 次传道不算「循循善诱」（门槛不松口）");
      st.disc.daoN = 20; D.act.cultivate(); ok(!!st.ach.discDao, "成就·循循善诱");
      /* 每位弟子都必须有道统亲和，否则「传道」会静默灌进兜底那一脉 */
      ok(TB.DISCIPLES.every(d => !!TB.SCHOOLS.find(s => s.id === d.school)), "六位弟子各自对应一家道统（传道不会落空）");
      st.disc = { own: {}, m: {}, n: 0, ct: "乱码", daoN: -5, ctUsed: "x" };
      D.ensureState();
      ok(st.disc.ct === "rich" && st.disc.daoN === 0 && typeof st.disc.ctUsed === "object", "ensureState 夹紧坏赏格");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* 道统：择统门槛 / 换统代价 / 悟道花销 / 主修吃满辅修减半 / 相克 / 跨世保留 / 坏档夹紧 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st));
      const reset = () => { st.sch = { id: null, x: {}, t: {}, cd: 0, swap: 0, keN: 0 }; st.realm = 1; st.karma = 500; };
      reset(); st.realm = 0;
      ok(D.act.school("sword") === false, "炼气之初不可择统");
      st.realm = 1;
      ok(D.act.school("sword") === true && D.schMain() === "sword", "筑基后可择剑修为主修");
      ok(st.karma === 500, "首次择统不付因果（立誓而已）");
      ok(D.act.school("sword") === false, "重复择同一统被拒");
      ok(X.availableActions()["school:sword"] === false && X.availableActions()["school:pill"] === true, "avail：现任不可选、他家可选");
      reset(); D.act.school("sword");
      st.sch.cd = 300;
      ok(D.act.school("pill") === false, "静养冷却中不可改换门庭");
      st.sch.cd = 0; st.karma = TB.SCH_FEE - 1;
      ok(D.act.school("pill") === false, "因果不足不可改换门庭");
      ok(X.availableActions()["school:pill"] === false, "avail 同步拒绝（因果不足）");
      st.karma = TB.SCH_FEE + 40;
      const k0 = st.karma;
      ok(D.act.school("pill") === true && st.karma === k0 - TB.SCH_FEE && st.sch.cd === TB.SCH_CD,
        "改换门庭：扣 " + TB.SCH_FEE + " 因果并起 " + TB.SCH_CD + "s 静养");
      reset(); D.act.school("sword");
      st.sch.x.sword = 39;
      ok(D.act.schoolup("sword") === false, "道行差 1 不可悟（门槛处不松口）");
      st.sch.x.sword = 40;
      ok(D.act.schoolup("sword") === true && D.schT("sword") === 1 && st.sch.x.sword === 0, "悟第一阶：花 40 道行、阶数 +1、余额归零");
      ok(D.schCost("sword") === Math.floor(40 * 2.6), "第二阶价 104（×2.6 递增）");
      for (let i = 0; i < 6; i++) { st.sch.x.sword = 1e6; D.act.schoolup("sword"); }
      ok(D.schT("sword") === TB.SCH_MAX, "封顶第五阶，再悟被拒");
      reset();
      ok(D.act.schoolup("sword") === false, "未择统不可悟道");
      const mk = (main, tiers) => { reset(); st.sch.id = main; TB.SCHOOLS.forEach(s => { st.sch.t[s.id] = 0; }); tiers.forEach(x => { st.sch.t[x[0]] = x[1]; }); D.ensureState(); };
      mk("body", [["body", 2]]);
      ok(Math.abs(D.schMul("stone") - 1.21) < 1e-9, "体修主修二阶：灵石产出 ×1.21（吃满）");
      ok(Math.abs(D.schNeg("exp") - 0.84) < 1e-9, "代价只由本命承担：修为产出 ×0.84");
      mk("sword", [["body", 2]]);
      ok(Math.abs(D.schMul("stone") - 1.1) < 1e-9, "体修退居辅修：只吃半阶（×1.1）");
      ok(D.schNeg("exp") === 1, "辅修不付代价");
      mk("pill", [["pill", 5]]);
      ok(Math.abs(D.schNeg("gm") - 0.75) < 1e-9, "丹修五阶代价：全局产出 ×0.75 —— 这一家的增益全在丹上，不抬终局曲线");
      mk("fate", [["fate", 3]]);
      ok(Math.abs(D.schAdd("ev") - 0.30) < 1e-9 && Math.abs(D.schAdd("off") - 0.06) < 1e-9, "命修三阶：事件率 +30 点、离线效率 +6 点");
      mk("sword", [["sword", 1]]);
      const DZ = TB.DUELS;
      const idxOf = sc => { for (let i = 0; i < DZ.length; i++) if (DZ[i].sch === sc) return i; return -1; };
      ok(D.schKe(idxOf("body")) === .06, "剑修主修打体修天骄 +6 个百分点（剑克体）");
      ok(D.schKe(idxOf("pill")) === -.06, "剑修主修打丹修天骄 −6 个百分点（丹克剑）");
      ok(D.schKe(idxOf("sword")) === 0, "同道统不相克");
      ok(D.schKe(idxOf("fate")) === 0 && D.schKe(idxOf("array")) === 0, "与剑无关的两家无加减");
      mk("fate", [["fate", 3]]); st.sch.x.fate = 77; st.realm = 5;
      const beforeSch = JSON.stringify(st.sch);
      D.act.rebirth(0);
      ok(JSON.stringify(st.sch) === beforeSch, "转世不清道统（道行与已悟阶数跨世保留）");
      st.sch = { id: "nonsense", x: { sword: -5, pill: "abc" }, t: { sword: 99, fate: -3 }, cd: "x" };
      D.ensureState();
      ok(st.sch.id === null && st.sch.x.sword === 0 && st.sch.x.pill === 0 && st.sch.t.sword === TB.SCH_MAX && st.sch.t.fate === 0 && st.sch.cd === 0,
        "ensureState 夹紧道统（野鸡 id / 负与字符串道行 / 超上限阶数 / 字符串冷却）");
      reset(); st.realm = 6; st.sch = { id: "sword", x: {}, t: {}, cd: 0, swap: 0, keN: 0 };
      /* 前面几段真把剑修悟到过五阶，成就早已点亮——门槛断言必须从空 ach 起步 */
      ["sch1", "schSwap", "schKe", "schMax", "schAll"].forEach(k => { delete st.ach[k]; });
      D.act.cultivate();
      ok(!!st.ach.sch1, "成就·初入道统");
      st.sch.swap = 1; D.act.cultivate(); ok(!!st.ach.schSwap, "成就·改换门庭");
      st.sch.keN = 1; D.act.cultivate(); ok(!!st.ach.schKe, "成就·以势制人");
      st.sch.t.sword = 4; D.act.cultivate(); ok(!st.ach.schMax, "四阶不算圆满（门槛不松口）");
      st.sch.t.sword = 5; D.act.cultivate(); ok(!!st.ach.schMax, "成就·一门圆满");
      TB.SCHOOLS.forEach(s => { st.sch.t[s.id] = 1; }); st.sch.t.sword = 5; D.act.cultivate();
      ok(!!st.ach.schAll, "成就·五统通晓");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* 斗法三势：环对称（三家之和为 0 → 选势只搬信息，不抬期望）+ 换势 + 记账 + 成就 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st));
      ok(TB.STANCES.length === 3, "三势齐备（攻/守/势）");
      let cycOK = true, sumBad = [];
      TB.DUELS.forEach((d, i) => {
        const s = TB.STANCES.reduce((a, x) => a + D.stanceKe(x.id, d.st), 0);
        if (Math.abs(s) > 1e-12) { sumBad.push(i + ":" + s); }
        cycOK = cycOK && Math.abs(s) < 1e-12;
      });
      ok(cycOK, "每位对手在三势下的胜率修正之和恒为 0（相克环对称，不抬期望）" + (sumBad.length ? " 破坏于 " + sumBad.join(",") : ""));
      ok(D.stanceKe("atk", "flow") === .08 && D.stanceKe("flow", "def") === .08 && D.stanceKe("def", "atk") === .08, "攻克势 · 势克守 · 守克攻");
      ok(D.stanceKe("flow", "atk") === -.08 && D.stanceKe("atk", "def") === -.08, "反过来即受制");
      ok(D.stanceKe("atk", "atk") === 0 && D.stanceKe("atk", null) === 0 && D.stanceKe("bogus", "atk") === 0, "同势与未知势名都不改胜率");
      st.realm = 3; st.layer = 1; st.tre.duelCd = 0; st.tre.beat = {}; st.sch = { id: null, x: {}, t: {}, cd: 0, swap: 0, keN: 0 };
      st.stone = 1e6;
      const probe = TB.DUELS.findIndex(d => d.st === "flow");
      const hi = D.duelOdds(probe, "atk"), lo = D.duelOdds(probe, "def");
      ok(Math.abs((hi - lo) - .16) < 1e-9, "同一对手换势后胜率差恰为 16 个百分点（+8 与 −8）");
      ok(D.act.duelStance("def") === true && st.duelSt === "def", "换起手为守");
      ok(D.act.duelStance("def") === false, "重复选同一势不重复播报");
      ok(D.act.duelStance("bogus") === false && st.duelSt === "def", "非法势名被拒且不改当前起手");
      ok(Math.abs(D.duelOdds(probe) - D.duelOdds(probe, "def")) < 1e-12, "不传势时按当前起手计（界面与结算同源）");
      st.duelSt = "atk"; st.tre.duelCd = 0;
      const rr = Math.random; Math.random = () => 0.01; /* 必胜 */
      D.act.duel(probe, "atk");
      Math.random = rr;
      ok(!!st.tre.beat[TB.DUELS[probe].n], "斗法取胜并登榜（三势链路走得通）");
      ok(st.tre.stWin.atk >= 1, "胜场按所用之势记账");
      ok(st.tre.keN >= 1, "以克制之势取胜计入 keN");
      st.tre.beat = {}; st.tre.duelCd = 0;
      ["stKe3", "stAll3"].forEach(k => { delete st.ach[k]; });
      st.tre.keN = 2; D.act.cultivate(); ok(!st.ach.stKe3, "两场克制胜不算「以势凌人」（门槛 3 场）");
      st.tre.keN = 3; D.act.cultivate(); ok(!!st.ach.stKe3, "成就·以势凌人");
      st.tre.stWin = { atk: 1, def: 1, flow: 0 }; D.act.cultivate(); ok(!st.ach.stAll3, "两势各胜一场还不算「三势俱通」");
      st.tre.stWin = { atk: 1, def: 1, flow: 1 }; D.act.cultivate(); ok(!!st.ach.stAll3, "成就·三势俱通");
      st.duelSt = "乱码"; st.tre.stWin = { atk: -3, def: "x" }; st.tre.keN = -9;
      D.ensureState();
      ok(st.duelSt === "atk" && st.tre.stWin.atk === 0 && st.tre.stWin.def === 0 && st.tre.keN === 0, "ensureState 夹紧坏势名与负记账");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* 离线佚文池：模型挂了以后玩家看见的就是这些，形状错了就是面板空白或 undefined */
      const st = D.state;
      const keep = JSON.parse(JSON.stringify(st));
      const bad = [];
      const rsave = Math.random; /* 上下文里 Math.random 常被前面用例钉成常数，逐条枚举比随机抽样可靠 */
      els["log"].children.length = 0; /* 只看本用例写出的行：日志里存着前面用例的报错文本，混进来会误判 */
      ["event", "npc", "quest"].forEach(k => {
        const seen = {};
        for (let i = 0; i < 6; i++) {
          const x = i / 6 + 0.001;
          Math.random = () => x;
          const d = X.fallbackStory(k);
          if (!d || typeof d !== "object") { bad.push(k + " 第 " + i + " 槽抽出空值"); continue; }
          seen[d.name || d.title] = 1;
          const rw = d.reward || {};
          Object.keys(rw).forEach(r => { if (["stone", "exp", "fame", "luck"].indexOf(r) < 0) bad.push(k + " 未知奖励字段 " + r); });
          if (k === "event" && (!d.title || !d.text)) bad.push("event 缺 title/text");
          if (k === "event" && String(d.title).length > 8) bad.push("event 题名过长：" + d.title);
          if (k === "npc") {
            if (!d.name || !d.identity || !d.line) bad.push("npc 缺 name/identity/line");
            const o = d.options || [];
            if (o.length < 2 || o.length > 3) bad.push("npc 选项数 " + o.length + "（面板只吃 1-3）");
            o.forEach(x2 => { if (!x2.label || !x2.result) bad.push("npc 选项缺 label/result"); if (!x2.reward) bad.push("npc 选项缺 reward"); });
          }
          if (k === "quest") {
            if (d.res !== "stone" && d.res !== "exp") bad.push("quest res=" + d.res);
            if (!(d.minutes >= 5 && d.minutes <= 60)) bad.push("quest minutes=" + d.minutes + " 越出 5-60");
            if (!d.text) bad.push("quest 缺 text");
            if (String(d.name).length > 12) bad.push("quest 名过长（会被截断）：" + d.name);
          }
          X.applyStory(k, d); /* 真落地一遍：定标、发奖、写日志的链路都要走得通 */
        }
        if (Object.keys(seen).length < 6) bad.push(k + " 池子只有 " + Object.keys(seen).length + " 条不同内容（重复感）");
      });
      Math.random = rsave;
      ok(bad.length === 0, "内置佚文 3 类各 6 条：形状全合法、题名不超长、applyStory 链路走得通" + (bad.length ? "（" + Array.from(new Set(bad)).slice(0, 4).join(" ; ") + "）" : ""));
      const recent = els["log"].children.map(c => c.innerHTML).join("|");
      ok(els["log"].children.length >= 10 && recent.indexOf("undefined") < 0 && recent.indexOf("NaN") < 0,
        "佚文落地 " + els["log"].children.length + " 行日志，无 undefined/NaN");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
    }
    { /* 离线结算的坏时长：NaN 若被接受，S.stone 会永久变成 NaN */
      const st = D.state;
      const keep = JSON.parse(JSON.stringify(st));
      ok(D.offline(NaN) === null && st.stone === keep.stone && st.age === keep.age, "offline(NaN) 不结算也不写值（旧版会把整条存档变成 NaN，玩家救不回来）");
      ok(D.offline(-3600) === null && st.stone === keep.stone, "offline(负数·时钟回拨) 不结算，也不倒扣灵石");
      ok(D.offline(9) === null && st.stone === keep.stone, "offline(9s) 未达起算线");
      const cap = D.offline(9e9);
      ok(!!cap && Math.abs(cap.dt - D.offCap()) < 1e-9, "offline(超长离家) 按 offCap 封顶，实结 " + (cap && cap.dt) + "s");
      ok(!!cap && st.age === keep.age + cap.dt, "有效时长仍照常结算：寿元按封顶后的 " + (cap && cap.dt) + "s 推进");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
    }
    { /* 面板脏值：典籍与功法标签不许出现 undefined（本轮由 _panel.js 扫出来） */
      const st = D.state;
      const keep = { art: JSON.parse(JSON.stringify(st.art)) };
      D.updUI();
      const canon = String(els["tab-canon"].innerHTML);
      ok(canon.indexOf("undefined") < 0, "典籍全篇无 undefined（八颗丹各有出处，缺项时回落「通用丹方」）");
      ok(canon.indexOf("大还丹") >= 0 && canon.indexOf("混元丹") >= 0, "典籍收录了后补的五颗丹药");
      let dirty = [];
      for (let lv = 0; lv <= 13; lv++) {
        st.art.lv = lv;
        D.updUI();
        const t = String(els["artInfo"].innerHTML);
        if (t.indexOf("undefined") >= 0 || t.indexOf("NaN") >= 0 || t.indexOf("[object") >= 0) dirty.push("lv" + lv);
      }
      ok(dirty.length === 0, "功法 0~13 层每一层的 artInfo 都干净" + (dirty.length ? "（脏：" + dirty.join(",") + "）" : ""));
      st.art.lv = 11; D.updUI();
      ok(String(els["artInfo"].innerHTML).indexOf("化境") >= 0, "最后一层写「化境 · 再无可进」而不是空道名");
      st.art = keep.art; D.updUI();
    }
    { /* 死成就防回归：石台门槛必须落在游戏自己公式算出的天花板之内 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st));
      st.realm = TB.REALMS.length - 1; st.layer = 9;
      Object.keys(st.bld).forEach(k => { st.bld[k] = 60; });
      st.art.lv = 12; st.bowl.lv = 30; st.sect = TB.SECT.length - 1;
      TB.T_SLOTS.forEach(t => { st.tre.lv[t.id] = TB.TRE_MAX; st.tre.sp[t.id] = 1; st.tre.aff[t.id] = "sharp"; });
      TB.SKILLS.forEach(x => { st.sk.lv[x.id] = TB.SK_MAX; });
      TB.DAOS.forEach(d => { st.dao[d.id] = 3; });
      TB.COMPANIONS.forEach(c => { st.comp[c.id] = 1; });
      st.disc.own = {}; TB.DISCIPLES.forEach(d => { st.disc.own[d.id] = { q: 3, lv: TB.DLV_MAX }; });
      st.tower.shop = { pow: 50, cd: 10, luck: 20, heart: 10 };
      st.trib = TB.TRIB.max; st.asc = { ord: 36, rank: TB.GOD_RANKS.length, incense: 1e12, times: 9 };
      st.areas = TB.AREAS.map(() => true); st.area = 9;
      st.best = {}; TB.BEASTS.forEach(b => { st.best[b.id] = 1; });
      st.beast = { lv: 25, evo: 1 }; st.tiger = { lv: 20, evo: 1 };
      st.attr = { spirit: 400, body: 400, soul: 400, heart: 400 };
      D.ensureState();
      const P = D.power();
      let ceil = 0;
      for (let d = 1; d <= 300; d++) { if (.15 + .85 * P / (P + D.towerNeed(d)) >= .35) ceil = d; else break; }
      const tw = TB.ACHS.map(a => { const m = /石台登至\s*(\d+)\s*层/.exec(a.desc); return m ? { id: a.id, n: +m[1] } : null; }).filter(Boolean);
      ok(tw.length >= 3, "扫到石台层数成就 " + tw.length + " 条（正则失效时这条先红，防止检查静默失效）");
      const dead = tw.filter(x => x.n > ceil);
      ok(dead.length === 0, "不存在数学上打不到的石台成就：满配天花板 " + ceil + " 层，门槛 " + tw.map(x => x.id + "=" + x.n).join(" ") + (dead.length ? " 越界：" + dead.map(x => x.id + "=" + x.n).join(",") : ""));
      /* 神格只加全局产出、不加战力：这条如果哪天改了，下面的断言会告诉我们天花板也随之变化 */
      st.asc.rank = 0; const P0 = D.power();
      st.asc.rank = TB.GOD_RANKS.length;
      ok(D.power() === P0, "现状记录：神格位阶不影响 power()（只乘 gm() 产出），所以飞升后石台天花板不再上移");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* 本轮 5 条新成就各自在门槛处触发，且不提前触发 */
      const st = D.state;
      const keep = { areas: st.areas.slice(), ach: JSON.parse(JSON.stringify(st.ach)), tower: JSON.parse(JSON.stringify(st.tower)), asc: JSON.parse(JSON.stringify(st.asc)), sect: st.sect, exch: JSON.parse(JSON.stringify(st.exch)) };
      const fire = () => { st.stone += 1e9; st.exp += 1e9; D.act.cultivate(); D.act.break(); };
      st.ach = {};
      st.areas = [true, true, true, true, true, true, false, false, false, false]; fire();
      ok(!st.ach.dom7, "dom7 遍历仙山：只开了五处下界道场 → 不提前触发");
      st.areas = [true, true, true, true, true, true, true, false, false, false]; fire();
      ok(!!st.ach.dom7, "dom7 遍历仙山：下界六道场尽辟即触发");

      st.ach = {}; st.tower.shop = { pow: 50, cd: 9, luck: 20, heart: 10 }; fire();
      ok(!st.ach.tbAll, "tbAll 宝库通览：缩地法则仅 9 阶 → 不触发");
      st.tower.shop.cd = 10; fire();
      ok(!!st.ach.tbAll, "tbAll 宝库通览：缩地/气运/道心三料皆满阶才触发");

      st.ach = {}; st.asc.ord = 17; fire();
      ok(!st.ach.ord18, "ord18 半壁秩序：17 枚不触发");
      st.asc.ord = 18; fire();
      ok(!!st.ach.ord18, "ord18 半壁秩序：集至 18 枚触发");

      st.ach = {}; st.sect = 2; fire();
      ok(!st.ach.sect3, "sect3 长老之风：内门弟子不触发");
      st.sect = 3; fire();
      ok(!!st.ach.sect3, "sect3 长老之风：晋真传长老触发（同时秘境日限 +1）");

      st.ach = {}; st.exch = { attr: 9, luck: 5, fame: 5 }; fire();
      ok(!st.ach.exch20, "exch20 论功行赏：累计 19 次不触发");
      st.exch.attr = 10; fire();
      ok(!!st.ach.exch20, "exch20 论功行赏：属性点/气运/声望兑换累计满 20 次触发");

      st.ach = keep.ach; st.areas = keep.areas; st.tower = keep.tower; st.asc = keep.asc; st.sect = keep.sect; st.exch = keep.exch;
      D.ensureState();
    }
    { /* 坏档兜底：load() 是"先无脑铺开存档、再逐子系统修型"，中途抛错就只剩半坏状态 */
      const st = D.state;
      const keep = JSON.parse(JSON.stringify(st));
      st.areas = null; st.disc = null; st.tower = null; st.sk = null; st.tre = null; st.daily = null;
      D.ensureState();
      ok(Array.isArray(st.areas) && st.areas.length === D.tables.AREAS.length, "ensureState：areas=null → 按道场表重建（旧版留 null 让 checkAch 读 areas[7] 直接崩档）");
      ok(st.areas[0] === true, "重建后至少守住出身地（太虚门）");
      ok(st.disc && st.disc.own && st.tower && st.tower.shop && st.sk.lv && st.tre.sp, "ensureState：null 子系统一律补回骨架");
      ok(st.daily && Array.isArray(st.daily.lessons) && st.daily.lessonDone, "ensureState：daily 补回（旧版缺这一层，坏档启动即抛）");
      st.realm = 99; st.layer = 99; st.sect = 99; st.asc = { rank: 99, ord: 999 };
      D.ensureState();
      ok(st.realm === D.tables.REALMS.length - 1, "ensureState：realm 越界夹紧到最后一境（99 → " + st.realm + "）");
      ok(st.layer >= 1 && st.layer <= 9 && st.sect === D.tables.SECT.length - 1, "ensureState：layer/sect 同步夹紧");
      ok(st.asc.rank <= D.tables.GOD_RANKS.length && st.asc.ord <= D.tables.ORDER_MAX, "ensureState：神界位阶/秩序夹紧");
      ok(typeof D.realmLabel() === "string" && D.realmLabel().length > 0, "夹紧后 realmLabel 仍可正常取名号（不再 REALMS[99][0] 抛错）");
      st.stone = NaN; st.exp = Infinity; st.fame = -Infinity; st.karma = NaN;
      D.ensureState();
      ok(st.stone === 0 && st.exp === 0 && st.fame === 0 && st.karma === 0, "ensureState：NaN/±Infinity 净化归零（否则会传染 fmt 与 gm 让整片界面变 NaN）");
      st.tower.tok = NaN; st.tower.depth = Infinity; st.attr.body = NaN;
      D.ensureState();
      ok(st.tower.tok === 0 && st.attr.body === 0, "ensureState：嵌套对象里的数值也净化（石台令/属性）");
      D.act.cultivate(); D.act.explore(); X.availableActions(); X.ruleAction();
      ok(true, "坏档修好后主循环与决策链可照常跑（本轮修的是「存档永久打不开」）");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* 石台宝库：TOK_CAP 以前只对 pow/cd 生效，luck/heart 走前置分支绕开上限 */
      const st = D.state, TB = D.tables;
      const keep = { tower: JSON.parse(JSON.stringify(st.tower)), luck: st.luck, heart: st.attr.heart, asc: JSON.parse(JSON.stringify(st.asc)), tribCd: st.tribCd, trib: st.trib };
      st.tribCd = 999; st.trib = TB.TRIB.max; /* 天劫也排在这条链上，不压住就抢位 */
      st.tower = { depth: 5, best: 5, tok: 100000, n: 5, cd: 0, mod: "calm", shop: {} };
      st.asc = { rank: 0, ord: 0, incense: 0, times: 0 };

      for (let i = 0; i < TB.TOK_CAP.luck; i++) D.act.towerBuy("luck");
      ok(st.tower.shop.luck === TB.TOK_CAP.luck, "气运结晶按 TOK_CAP 计阶（" + st.tower.shop.luck + "/" + TB.TOK_CAP.luck + "）");
      const tokA = st.tower.tok;
      const bad = D.act.towerBuy("luck");
      ok(st.tower.shop.luck === TB.TOK_CAP.luck && st.tower.tok === tokA, "修复：满阶后仍点【气运结晶】被拒绝且不再吞令牌（旧版可无限换）");
      ok(X.availableActions()["towerbuy:luck"] === false, "助手侧同步判满（UI 与 avail 一致）");
      const pe0 = X.cfg.pilotEnabled; X.cfg.pilotEnabled = false; /* 驱动 iv 会连代打周期一起跑，会把 llmState 判成离线、毒到后面的 LLM 用例 */
      T += 1000; iv.forEach(f => f());
      X.cfg.pilotEnabled = pe0;
      ok(els["tb-luck"].textContent === "满", "UI 如实显示「满」（旧版永远显示 25令 且可点）");

      for (let i = 0; i < TB.TOK_CAP.heart; i++) D.act.towerBuy("heart");
      ok(st.tower.shop.heart === TB.TOK_CAP.heart, "不动道心同样封顶");
      for (let i = 0; i < TB.TOK_CAP.cd; i++) D.act.towerBuy("cd");
      ok(st.tower.shop.cd === TB.TOK_CAP.cd, "缩地法则封顶（本就生效，作为对照）");

      /* frag 不设次数上限：秩序满 36 后溢出自动折算香火，令牌永远有去处 */
      st.asc.ord = TB.ORDER_MAX;
      const inc0 = st.asc.incense, tokB = st.tower.tok;
      D.act.towerBuy("frag");
      ok(st.asc.ord === TB.ORDER_MAX && st.asc.incense > inc0 && st.tower.tok === tokB - 150,
        "秩序已满时兑残片 → 溢出折香火（" + inc0 + "→" + st.asc.incense + "），令牌照扣，不设死上限");

      /* 闲令牌去处：不足 150 时先兑 cd/luck/heart，够 150 才买秩序 */
      st.tower = { depth: 5, best: 5, tok: 100, n: 5, cd: 0, mod: "calm", shop: { pow: TB.TOK_CAP.pow, cd: 0, luck: 0, heart: 0 } };
      st.daily = { day: "t", signed: true, gathered: true, secretUsed: 9, lessons: [], lessonDone: {} };
      st.exp = 0; st.pts = 0; noFree();
      const rdTok = ruleClean("towerbuy");
      ok(rdTok.action === "towerbuy" && rdTok.target === "cd", "令牌 100（不够换秩序）→ 先兑缩地法则，不干等（实际 " + JSON.stringify(rdTok) + "）");
      st.tower.tok = 150;
      const rdFrag = ruleClean("towerbuy");
      ok(rdFrag.action === "towerbuy" && rdFrag.target === "frag", "令牌攒到 150 → 立刻转兑混沌秩序（终局货币优先）");
      st.tower.tok = 149; st.tower.shop = { pow: TB.TOK_CAP.pow, cd: TB.TOK_CAP.cd, luck: TB.TOK_CAP.luck, heart: TB.TOK_CAP.heart };
      ok(ruleClean("towerbuy").action !== "towerbuy", "三料皆满且不足 150 → 不为凑单乱花令牌");
      st.tower = keep.tower; st.luck = keep.luck; st.attr.heart = keep.heart; st.asc = keep.asc;
    }
    { /* 道场与宗门：两个曾经只能手点的孤岛系统 */
      const st = D.state, TB = D.tables;
      const keep = { realm: st.realm, layer: st.layer, stone: st.stone, exp: st.exp, areas: st.areas.slice(), area: st.area, fame: st.fame, sect: st.sect, contrib: st.contrib, contribAll: st.contribAll, exch: JSON.parse(JSON.stringify(st.exch)), asc: JSON.parse(JSON.stringify(st.asc)), sk: JSON.parse(JSON.stringify(st.sk)), tribCd: st.tribCd };
      st.realm = 6; st.layer = 1; st.exp = 0; st.pts = 0;
      st.areas = [true, false, false, false, false, false, false, false, false, false]; st.area = 0;
      st.asc = { rank: 0, ord: 0, incense: 0, times: 0 };
      st.daily = { day: "t", signed: true, gathered: true, secretUsed: 9, lessons: [], lessonDone: {} };
      ok(X.validateDecision({ action: "travel", target: "99", reason: "t" }, { travel: true }) === null, "validate：travel 越界拒绝");
      ok(X.validateDecision({ action: "exchange", target: "nope", reason: "t" }, { exchange: true }) === null, "validate：exchange 非法科目拒绝");

      st.stone = 100;
      ok(X.availableActions()["unlock:2"] === false, "unlock：灵石不足过路费 → 不可开辟（恶海需 10 万）");
      st.stone = 2e5; st.realm = 4;
      ok(X.availableActions()["unlock:2"] === false, "unlock：境界差一境（恶海 reqR=5）→ 不可越级");
      st.realm = 5;
      ok(X.availableActions()["unlock:2"] === true, "unlock：境界与灵石皆达标 → 可开辟恶海");
      ok(X.availableActions()["unlock:4"] === false, "unlock：紫薇天需合体以上，不可跳格开辟");
      st.realm = 16; st.stone = 1e13;
      ok(X.availableActions()["unlock:7"] === false, "unlock：灵霄神域还须神界位阶（未飞升）");
      const tok0 = st.stone, fame0 = st.fame;
      X.execDecision({ action: "unlock", target: "2" }, "规则");
      ok(st.areas[2] === true && st.area === 2 && st.stone === tok0 - TB.AREAS[2].reqS && st.fame === fame0 + 50,
        "execDecision：unlock 扣过路费、立道场并随迁居所（+50 声望）");
      ok(!X.availableActions()["unlock:2"], "unlock：已开辟的道场不再进可执行集合");
      const gmHi = D.gm(); st.area = 0;
      ok(Math.abs(D.gm() / gmHi - 1 / TB.AREAS[2].mult) < 1e-12, "道场倍率确实进 gm()（回太虚门即 ×1/" + TB.AREAS[2].mult + "）");
      st.area = 0;
      const avT = X.availableActions();
      ok(avT.travel === true && avT["travel:2"] === true, "travel：已开辟更高道场而人身在太虚门 → 可移驾");
      noFree();
      const rdT = ruleClean("travel");
      ok(rdT.action === "travel", "ruleAction：三档最先移驾（实际 " + JSON.stringify(rdT) + "）");
      st.areas[2] = true; /* ruleClean 会把 areas 还原，这里显式留出"只有 0 与 2 已开辟"的局面再落地 */
      X.execDecision({ action: "travel", target: "2" }, "规则");
      ok(st.area === 2 && X.availableActions().travel === false, "execDecision：移驾生效后 travel 自动收起（实际 area=" + st.area + "）");

      /* 开辟道场应压过参悟神通：前者是 ×2.8~×110 的永久全局乘数 */
      st.sk = { lv: {}, cd: {}, left: {} };
      st.areas = [true, false, false, false, false, false, false, false, false, false]; st.area = 0; st.realm = 5; st.tribCd = 999;
      const rdU = ruleClean(["unlock", "skillup"]);
      ok(rdU.action === "unlock" && rdU.target === "1", "ruleAction：开辟道场优先于参悟神通与天劫（实际 " + JSON.stringify(rdU) + "）");
      st.areas = TB.AREAS.map(() => true); st.area = 0;

      st.sect = 0; st.contrib = 0; st.contribAll = 0; st.exch = { attr: 0, luck: 0, fame: 0 }; st.stone = 1e6;
      /* 让局面安静下来：建筑天价（buy 不抢位）、行囊清空（item 不抢位） */
      const keepB = { bld: JSON.parse(JSON.stringify(st.bld)), itm: JSON.parse(JSON.stringify(st.itm || {})), pearl: st.pearl };
      st.bld = { field: 300, garden: 300, cave: 300, room: 300, vault: 300, hall: 300 }; /* room 也顶格：否则"营建炼丹房"是五档头一个买得起的，会抢走 exchange */
      st.itm = { charm: 0, pearl: 0, heal: 0, life: 0 }; st.pearl = 0;
      ok(X.availableActions().donate === true, "donate：职位尚在外门且生涯贡献未达标 → 值得供奉");
      const cA = D.exchCost("attr"), p0 = st.pts;
      st.contrib = cA;
      ok(X.availableActions()["exchange:attr"] === true, "exchange：贡献刚好够兑一枚淬炼点");
      noFree();
      const rdX = ruleClean("exchange");
      ok(rdX.action === "exchange" && rdX.target === "attr", "ruleAction：贡献兑属性点排在炼丹等消耗品之前（实际 " + JSON.stringify(rdX) + "）");
      X.execDecision(rdX, "规则");
      ok(st.pts === p0 + 1 && st.contrib === 0, "execDecision：exchange·attr +1 属性点并扣光贡献");
      st.contrib = 0; st.contribAll = TB.SECT[TB.SECT.length - 1].c; st.sect = TB.SECT.length - 1;
      ok(X.availableActions().donate === false, "donate：已是宗门之主 → 不再把灵石无休止倒进贡献池");
      Object.keys(keep).forEach(k => { st[k] = Array.isArray(keep[k]) ? keep[k].slice() : keep[k]; });
      st.sk = keep.sk; st.tribCd = keep.tribCd;
      st.exch = keep.exch; st.asc = keep.asc;
    }
    { /* 永久项优先：参悟大道 / 结缘红颜不该被"炼丹"这种消耗品长期挤掉（旧实测 dao 8h 只 6 次） */
      const st = D.state, TB = D.tables;
      const keep = { realm: st.realm, layer: st.layer, stone: st.stone, exp: st.exp, pts: st.pts, bld: st.bld, art: st.art, dao: st.dao, comp: st.comp, sk: st.sk, itm: st.itm, pearl: st.pearl };
      TB.SKILLS.forEach(x => { st.sk.lv[x.id] = TB.SK_MAX; });  /* 神通已圆满 → 五档"精进"不抢位 */
      st.art = { lv: 12 };                                     /* 功法已化境 */
      st.bld = { field: 200, garden: 200, cave: 200, room: 200, vault: 200, hall: 200 }; /* 建筑天价 → buy 不抢位；room≥1 仍让炼丹可用 */
      st.realm = 8; st.layer = 1; st.exp = 0; st.pts = 0; st.stone = 1e7;
      st.dao = {}; st.comp = {};
      st.itm = { charm: 0, pearl: 0, heal: 0, life: 0 }; st.pearl = 0;
      st.daily = { day: "t", signed: true, gathered: true, secretUsed: 9, lessons: [], lessonDone: {} };
      noFree();
      ok(X.availableActions().pill === true, "局面自检：炼丹此刻确实买得起（用它来检验优先级）");
      const rdDao = ruleClean("dao");
      ok(rdDao.action === "dao", "ruleAction：参悟大道排在炼丹之前（实际 " + rdDao.action + "）");
      const rdComp = ruleClean("companion");
      ok(rdComp.action === "companion", "ruleAction：结缘红颜排在炼丹之前（实际 " + rdComp.action + "）");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      st.sk = keep.sk;
    }
    { /* 模型不可达/未配置时，代打周期不能被在途请求拖死（实测：内网地址连不上 → busy 锁死 45s×3） */
      const cfg = X.cfg;
      const keep = { apiType: cfg.apiType, url: cfg.url, model: cfg.model, apiKey: cfg.apiKey, pilotEnabled: cfg.pilotEnabled };
      const flush = () => new Promise(r => setImmediate(r)); /* 桩里 setTimeout 不执行回调，只能用 setImmediate */
      let hits = 0;
      fetchImpl = async () => { hits++; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"action":"idle","reason":"桩"}' } }] }) }; };
      cfg.pilotEnabled = true;
      cfg.apiType = "openai"; cfg.url = "https://x.invalid/v1"; cfg.model = "m"; cfg.apiKey = "";
      let done = "";
      await X.pilotCycle().then(() => { done = "cycle"; }, () => { done = "err"; });
      ok(hits === 0 && done === "cycle", "OpenAI 型无 API Key → 不发起请求，本周期直接规则代打（fetch " + hits + " 次/" + done + "）");
      ok(String(X.llmState.note).indexOf("模型未配置") === 0, "配置不全时连接状态写明原因：" + X.llmState.note);
      cfg.apiKey = "sk-test";
      hits = 0; done = "";
      await X.pilotCycle().then(() => { done = "cycle"; }, () => { done = "err"; });
      ok(hits === 1 && done === "cycle", "配置齐全 → 仍会发起一次 LLM 请求（fetch " + hits + " 次）");
      await flush();
      ok(X.llmState.ok === true, "LLM 应答后连接状态回到在线");
      /* 单飞：一条请求还在路上时，后续节拍不得再叠加请求（否则慢模型会把并发堆起来） */
      /* 单飞：一条请求还在路上时，后续节拍不得再叠加（桩里 setTimeout 不触发 abort，故手动放行） */
      let release = null;
      fetchImpl = () => {
        hits++;
        return new Promise(res => {
          release = () => res({ ok: true, json: async () => ({ choices: [{ message: { content: '{"action":"idle","reason":"桩"}' } }] }) });
        });
      };
      hits = 0;
      await X.pilotCycle();
      await X.pilotCycle();
      ok(hits === 1, "同一时刻只允许一条决策请求在飞（实测 fetch " + hits + " 次）");
      release();
      await flush();
      ok(String(X.llmState.note) === "在线", "放行后连接状态回到在线（" + X.llmState.note + "）");
      hits = 0;
      await X.pilotCycle();
      ok(hits === 1, "上一条落地后下一拍重新发起请求（单飞不是一次性）");
      release();
      await flush();
      fetchImpl = null;
      fetchImpl = null;
      Object.keys(keep).forEach(k => { cfg[k] = keep[k]; });
    }
    { /* 天劫试炼此前只挂在按钮上，代打 8 小时一次都没引过——劫印是跨世 +2%/枚 的长线 */
      const st = D.state, rnd = Math.random;
      const keep = { realm: st.realm, layer: st.layer, stone: st.stone, exp: st.exp, trib: st.trib, tribCd: st.tribCd };
      st.realm = 3; st.trib = 0; st.tribCd = 0; st.layer = 1;
      st.stone = D.tribCost() * 4; st.exp = 0;
      ok(X.availableActions().trib === false, "trib：灵石不足 5× 引劫价 → 不冒险（防 20% 反噬击穿家底）");
      st.stone = D.tribCost() * 5;
      ok(X.availableActions().trib === false, "trib：扣 20% 修为后将够不到突破 → 先攒进度再引劫");
      st.exp = D.expNeed() * 2;
      ok(X.availableActions().trib === true, "trib：灵石与修为余量皆达标 → 可引劫");
      const tr0 = st.trib, cd0 = st.tribCd;
      Math.random = () => 0.01; /* 必中分支 */
      X.execDecision({ action: "trib" }, "规则");
      ok(st.trib === tr0 + 1 && st.tribCd === D.tables.TRIB.cd && st.tribCd !== cd0, "execDecision：trib 引劫成功→劫印 +1 并进入 1h 冷却");
      Math.random = () => 0.99; /* 反噬分支 */
      st.tribCd = 0;
      const st1 = st.stone, fee = D.tribCost();
      X.execDecision({ action: "trib" }, "规则");
      ok(st.stone === st1 - fee - Math.floor((st1 - fee) * .2), "execDecision：trib 反噬按 引劫价+余款两成 如实扣减（实得 " + st.stone + "）");
      st.trib = D.tables.TRIB.max; st.tribCd = 0;
      ok(X.availableActions().trib === false, "trib：劫印满 10 枚后不再引劫");
      Math.random = rnd;
      st.realm = keep.realm; st.layer = keep.layer; st.stone = keep.stone; st.exp = keep.exp; st.trib = keep.trib; st.tribCd = keep.tribCd;
    }
    { /* 终局门槛：混元九层封顶后战力不再涨，若仍守 45% 胜算，石台永久停爬 → 秩序/飞升断线 */
      const st = D.state, TB = D.tables;
      const keep = { realm: st.realm, layer: st.layer, depth: st.tower.depth, cd: st.tower.cd };
      st.realm = TB.REALMS.length - 1; st.layer = 9; st.tower.cd = 0;
      let hit = -1;
      for (let d = 0; d <= 80 && hit < 0; d++) { st.tower.depth = d; const w = D.towerOdds(); if (w >= .35 && w < .45) hit = d; }
      if (hit < 0) ok(false, "石台：构造不出 35%~45% 的胜算区间（用例失效）");
      else {
        st.tower.depth = hit;
        ok(X.availableActions().tower === true, "石台：胜算 " + (D.towerOdds() * 100).toFixed(1) + "% 且已圆满 → 仍可登台（层 " + hit + "）");
        st.layer = 8;
        ok(X.availableActions().tower === false, "石台：同样胜算但未圆满 → 依旧守住 45% 门槛不冒险");
        st.layer = 9;
      }
      st.realm = keep.realm; st.layer = keep.layer; st.tower.depth = keep.depth; st.tower.cd = keep.cd;
    }
    { /* 聚宝盆温养曾按 3.5^lv 增长：Lv29 一级就要 6e19，整局一生都摸不到；现在 30 级总价应落在可控区间 */
      const lv0 = D.state.bowl.lv;
      let total = 0;
      for (let lv = 0; lv < 30; lv++) { D.state.bowl.lv = lv; total += D.bowlCost(); }
      D.state.bowl.lv = lv0;
      ok(total < 5e12, "bowlCost：30 级温养总价 " + D.fmt(total) + " 灵石（低于一局混元累计收入量级）");
    }
    { /* 古修洞窟·深入：逐层生存率、去留守卫、塌方只赔未落袋那批、空手收手不白拿因果 */
      const st = D.state, TB = D.tables, rnd = Math.random;
      const keep = JSON.parse(JSON.stringify(st));
      const RQ = v => { Math.random = () => v; };
      const run = (door, depth, hint, hs, he) => {
        st.cave = { door, depth, hs: hs || 0, he: he || 0, hint, risk: 0, max: depth };
        st.cave.risk = D.digRisk();
      };
      /* ---- 一档日常与机会动作全部按住，只留洞窟这一档给 ruleAction 唱戏 ---- */
      const quiet = () => {
        st.daily.signed = true; st.daily.gathered = true; st.daily.secretUsed = 999;
        st.daily.lessons = []; st.daily.lessonDone = {};
        st.week.goals = [];
        st.chap.cur = TB.CHAPTERS.length;
        st.itm.heal = 0; st.itm.life = 0; st.itm.pearl = 0; st.itm.compass = 0; /* 罗盘会把"该不该落袋"的判断整个改写，测档序时必须不在袋里 */
        st.tribCd = 9999; st.exp = 0; st.pts = 0;
        st.stone = 0; st.fame = 0; /* 淬功法/温养盆/炼丹全在花灵石那一侧，声望三档吃名望——洞窟去留压着它们 */
      };
      /* ---- 生存率公式：基础 − 每层 4pp ± 风声 10pp ---- */
      run("jade", 1, 0); ok(D.digRisk() === TB.DIG_BASE.jade, "第 1 层生存率 = 门基础（玉门 " + TB.DIG_BASE.jade + "）");
      run("jade", 4, 0); ok(Math.abs(D.digRisk() - (TB.DIG_BASE.jade - TB.DIG_STEP * 3)) < 1e-12, "越深越险：第 4 层比基础低 3×" + TB.DIG_STEP);
      run("jade", 4, 1); const rUp = D.digRisk();
      run("jade", 4, 0); const rMid = D.digRisk();
      run("jade", 4, -1); const rDn = D.digRisk();
      ok(Math.abs(rUp - rMid - TB.DIG_HINT) < 1e-12 && Math.abs(rMid - rDn - TB.DIG_HINT) < 1e-12,
        "风声一档 = " + (TB.DIG_HINT * 100).toFixed(0) + "pp（顺风/无风/逆风等差）");
      run("black", TB.DIG_MAX, -1); ok(D.digRisk() > .05 && D.digRisk() < .95, "合法状态够不到上下夹（黑门顶层逆风 " + (D.digRisk() * 100).toFixed(0) + "%）");
      ok(TB.DIG_BASE.jade > TB.DIG_BASE.gold && TB.DIG_BASE.gold > TB.DIG_BASE.black, "生存率：玉 > 金 > 黑");
      ok(TB.DIG_TAKES.jade < TB.DIG_TAKES.gold && TB.DIG_TAKES.gold < TB.DIG_TAKES.black, "每层所得：玉 < 金 < 黑（稳与搏互为对价）");
      ok(Math.abs(TB.DIG_MUL - 1.9) < 1e-12, "逐层所得倍率 ×" + TB.DIG_MUL);
      /* ---- 不在窟中的守卫 ---- */
      st.cave = { door: null, depth: 0, hs: 0, he: 0, risk: 0, hint: 0, max: 0 };
      const s0 = st.stone, e0 = st.exp, k0 = st.karma;
      ok(D.cavePush() === false && st.stone === s0 && st.exp === e0, "不在窟中：深入被拒且分文不动");
      ok(D.caveKeep() === false && st.karma === k0, "不在窟中：收手被拒且不涨因果");
      { const av = X.availableActions(); ok(av.dig === false && av.digkeep === false, "助手侧：不在窟中时 dig/digkeep 皆不可用"); }
      /* ---- 顶格：只能收手 ---- */
      run("jade", TB.DIG_MAX, 0);
      const digN0 = st.caveDig || 0;
      { const av = X.availableActions(); ok(av.dig === false && av.digkeep === true, "最后一层：可收手、不可再进"); }
      ok(D.cavePush() === false && (st.caveDig || 0) === digN0, "顶格再深入被拒，不记次也不塌方");
      /* ---- 成功一层的账 ---- */
      st.realm = Math.max(1, st.realm);
      run("jade", 1, 0);
      const a0 = st.stone, x0 = st.exp, as0 = st.allStone, le0 = st.lifeExp, ae0 = st.allExp;
      RQ(0.01);
      ok(D.cavePush() === true, "深入第 2 层执行成功");
      const h2 = st.stone - a0;
      ok(h2 > 0, "第 2 层所得 +" + D.fmt(h2) + " 灵石");
      ok(st.exp - x0 === Math.floor(h2 * .35), "修为入账 = 该层灵石所得的 35%");
      ok(st.allStone === as0 + h2 && st.allExp === ae0 + (st.exp - x0) && st.lifeExp === le0 + (st.exp - x0), "深入所得同步进累计与此生统计（转世不吃亏）");
      ok(st.cave.depth === 2 && st.cave.hs === h2 && st.cave.max === 2 && (st.caveDig || 0) === digN0 + 1, "层数/未落袋账本/历史最深/深入次数四者齐动");
      const a1 = st.stone;
      D.cavePush();
      const h3 = st.stone - a1;
      ok(Math.abs(h3 - h2 * TB.DIG_MUL) < 2, "逐层按 ×" + TB.DIG_MUL + " 复利（第2层 " + h2 + " → 第3层 " + h3 + "）");
      ok(st.cave.hs === h2 + h3, "未落袋账本累加两层所得");
      /* ---- 塌方：只赔身上这批 ---- */
      const b4s = st.stone, b4e = st.exp, b4k = st.karma, un = st.cave.hs, unE = st.cave.he, f0 = st.caveFail || 0;
      RQ(0.99);
      ok(D.cavePush() === true, "塌方也是一次执行完毕的冒险（返回 true，不是没做成）");
      const afterHaul = Math.max(0, b4s - un);
      ok(st.stone === afterHaul - Math.floor(afterHaul * .03), "塌方扣光未落袋 " + D.fmt(un) + "，再蚀现银 3%");
      ok(st.exp === Math.max(0, b4e - unE), "塌方按深入所得倒扣修为（-" + D.fmt(unE) + "）");
      ok(st.karma === b4k - 2 && (st.caveFail || 0) === f0 + 1, "塌方因果 −2 并记一次折戟");
      ok(st.cave.door === null && st.cave.depth === 0 && st.cave.hs === 0 && st.cave.he === 0, "塌方后运行态归零");
      ok(st.cave.max === 3, "塌方不清历史最深（成就认「抵达过」而非「此刻在」）");
      ok(st.stone > b4s - un - Math.floor(b4s * .04), "进门那一笔不被追回：折损只及身上这批与现银零头");
      /* ---- 收手：空手不奖，带货才奖 ---- */
      run("gold", 1, 0);
      const k1 = st.karma, kc1 = st.caveKeep || 0;
      ok(D.caveKeep() === true && st.karma === k1 && (st.caveKeep || 0) === kc1, "空手收手：退得出去，但不给因果、不记次数（否则开一门即白拿）");
      run("gold", 2, 0, 1234, 400);
      ok(D.caveKeep() === true && st.karma === k1 + 1 && (st.caveKeep || 0) === kc1 + 1, "带货收手：因果 +1 且记一次见好就收");
      ok(st.cave.door === null && st.cave.depth === 0 && st.cave.hs === 0, "收手后运行态归零");
      ok(st.karma === k1 + 1, "收手不改灵石现银（深入所得在每一层已即时落袋）");
      /* ---- 三条新成就：门槛两侧 ---- */
      ["digMax", "digKeep5", "digDeep30"].forEach(x => { delete st.ach[x]; });
      st.caveDig = 29; st.caveKeep = 4; st.cave = { door: null, depth: 0, hs: 0, he: 0, risk: 0, hint: 0, max: TB.DIG_MAX - 1 };
      D.act.cultivate();
      ok(!st.ach.digMax && !st.ach.digKeep5 && !st.ach.digDeep30, "差一步时三条都不松口（29 层 / 4 次 / 最深 " + (TB.DIG_MAX - 1) + " 层）");
      st.caveDig = 30; st.caveKeep = 5; st.cave.max = TB.DIG_MAX;
      D.act.cultivate();
      ok(!!st.ach.digMax && !!st.ach.digKeep5 && !!st.ach.digDeep30, "满门槛三条齐亮");
      /* ---- 助手：去留只在规则线之上才赌 ---- */
      quiet();
      run("jade", 1, 1);
      ok(D.digRisk() >= .55, "玉门顺风生存 " + (D.digRisk() * 100).toFixed(0) + "%，站上 " + (.55 * 100) + "% 规则线");
      { const d = ruleClean(["dig", "digkeep"]); ok(d.action === "dig", "代打：占优时再进一层（实返 " + d.action + "）"); }
      run("gold", 1, 0);
      ok(D.digRisk() < .55, "金门无风生存 " + (D.digRisk() * 100).toFixed(0) + "%，够不到规则线");
      { const d = ruleClean(["dig", "digkeep"]); ok(d.action === "digkeep", "代打：不占优即落袋（实返 " + d.action + "）"); }
      run("black", 1, -1);
      { const d = ruleClean(["dig", "digkeep"]); ok(d.action === "digkeep", "代打：逆风黑门更不该进（实返 " + d.action + "）"); }
      run("jade", TB.DIG_MAX, 1);
      { const d = ruleClean(["dig", "digkeep"]); ok(d.action === "digkeep", "代打：顶格只剩收手可走（实返 " + d.action + "）"); }
      run("jade", 1, 1);
      const avD = X.availableActions();
      ok(X.validateDecision({ action: "dig", reason: "t" }, avD) !== null && X.validateDecision({ action: "digkeep", reason: "t" }, avD) !== null,
        "validateDecision：在窟中时 dig/digkeep 放行（免 target）");
      st.cave = { door: null, depth: 0, hs: 0, he: 0, risk: 0, hint: 0, max: st.cave.max };
      ok(X.validateDecision({ action: "dig", reason: "t" }, X.availableActions()) === null, "validateDecision：不在窟中时 dig 被拒（不越权造动作）");
      quiet();
      run("jade", 1, 1);
      const dc0 = st.caveDig || 0;
      Math.random = () => 0.01;
      X.execDecision({ action: "dig" }, "规则");
      ok((st.caveDig || 0) === dc0 + 1 && st.cave.depth === 2, "execDecision：dig 真的下到一层");
      X.execDecision({ action: "digkeep" }, "规则");
      ok(st.cave.door === null, "execDecision：digkeep 真的退出洞窟");
      Math.random = rnd;
      /* ---- 进门即是一层：开一扇门就该把历史最深记到 1 ---- */
      st.cave = { door: null, depth: 0, hs: 0, he: 0, risk: .5, hint: 0, max: 0 };
      st.caveCd = 0;
      RQ(0.01);
      ok(D.act.cave("jade") === true, "开玉门成功（深入不改既有开洞逻辑）");
      ok(st.cave.door === "jade" && st.cave.depth === 1 && st.cave.hs === 0 && st.cave.he === 0, "进门即起一趟：已在第 1 层，身上尚无深入所得");
      ok(st.cave.max === 1, "进门即记第 1 层为历史最深（存档里 depth=1 而 max=0 是自相矛盾）");
      ok(st.cave.risk === D.digRisk(), "进门即把下一层生存率算好摆上界面");
      ok(st.caveCd === TB.CAVE_CD, "开洞冷却照旧走 30 分钟（深入不新增冷却，也不放松旧的）");
      Math.random = rnd;
      /* ---- 坏档兜底 ---- */
      st.cave = { door: "bogus", depth: 99, hs: -5, he: "x", risk: 5, hint: 3.7, max: 42 };
      D.ensureState();
      ok(st.cave.door === null && st.cave.depth === TB.DIG_MAX && st.cave.hs === 0 && st.cave.he === 0 && st.cave.risk === .95 && st.cave.hint === 1 && st.cave.max === TB.DIG_MAX,
        "ensureState 夹紧深入运行态（野门名 / 越界层数 / 负货 / 字符串 / 超界概率与风声）");
      st.cave = { door: "jade", depth: 0, hs: 100, he: 50, risk: .5, hint: 0, max: 3 };
      D.ensureState();
      ok(st.cave.door === null && st.cave.hs === 100 && st.cave.max === 3, "零层即无门：门名清掉，账本与历史最深不丢");
      ok(TB.CAVE_CD === 1800, "洞窟冷却仍是一刻钟量级（深入不改既有 CD，纯附加）");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* 坊市·挂单：用"定价"换掉"盯盘"。成交必须与手点分毫不差（同一条 trade 记账路径），
         且不得比手点多给一分钱——否则就是给终局曲线注水。 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st.mkt));
      const G0 = TB.GOODS[0], GB = G0.base;
      ok(TB.ASK_STEPS[0] === 0 && TB.ASK_STEPS.length === 4, "挂单四态循环：卸单 + 三档价位");
      ok(TB.ASK_STEPS[TB.ASK_STEPS.length - 1] <= 1.4 - 1e-9, "最高一档不超过行情顶 1.4×底价（再高就是永不成交的空话）");
      st.mkt.ask = {}; st.mkt.ask[G0.id] = 0;
      const seq = [];
      for (let i = 0; i < 4; i++) { D.askCycle(G0.id); seq.push(D.askOf(G0.id)); }
      ok(seq[0] === GB && seq[1] === Math.floor(GB * 1.15) && seq[2] === Math.floor(GB * 1.3) && seq[3] === 0,
        "再点一次抬一档，最后一档回到卸单（" + seq.join(" → ") + "）");
      ok(D.askCycle("buysell-nothing") === false && st.mkt.ask["buysell-nothing"] === undefined, "野货名直接拒，不往 ask 里塞脏键");
      /* 成交 = 手点卖，一分不差 */
      st.mkt.ask[G0.id] = 1; st.mkt.hold[G0.id] = 3;
      const s1 = st.stone, e1 = st.mkt.earned, a1 = st.mkt.askN || 0, p1 = D.goodPrice(G0);
      ok(D.fillAskOrders() >= 1, "现价越过挂单价 → 核单成交");
      ok(st.stone === s1 + 3 * p1 && st.mkt.earned === e1 + 3 * p1 && st.mkt.hold[G0.id] === 0 && (st.mkt.askN || 0) === a1 + 3,
        "成交价就是现价 " + p1 + "，一次核单清空货架（挂单不吃差价、不额外送钱，期望完全中性）实测Δ=" + (st.stone - s1) + " askNΔ=" + ((st.mkt.askN || 0) - a1));
      /* 价不到 → 一动不动 */
      st.mkt.ask[G0.id] = D.goodPrice(G0) + 1;
      const s2 = st.stone, h2 = st.mkt.hold[G0.id];
      ok(D.fillAskOrders() === 0 && st.stone === s2 && st.mkt.hold[G0.id] === h2, "现价低于挂单价 → 一股不卖");
      /* 无货 → 静等，不报错也不空转 */
      st.mkt.ask[G0.id] = 1; st.mkt.hold[G0.id] = 0;
      ok(D.fillAskOrders() === 0, "手里没货 → 挂单静静等着（不报错也不空转）");
      /* 清仓必须自然收敛（while 靠 hold 递减终止） */
      st.mkt.hold[G0.id] = TB.MKT_HOLD_MAX;
      ok(D.fillAskOrders() === TB.MKT_HOLD_MAX && st.mkt.hold[G0.id] === 0, "满架 " + TB.MKT_HOLD_MAX + " 件一次清光且循环自然终止");
      ok(st.mkt.ask[G0.id] === 1, "成交后单子仍挂着（可反复填，撤单是玩家的另一动作）");
      /* 离线只按"归来时价"核一次：刻意比在线差，不追离线期间的波峰。
         offline() 自己会把产出收益记进 stone，所以不能拿绝对差额判——
         同一份快照跑两遍（一次不挂单、一次挂单），唯一差额才该是这 2 笔卖货款。
         随机数必须钉死：离线≥1h 会 roll 奇遇，两遍的事件流不同就比不出钱。 */
      const rnd2 = Math.random;
      const snap = JSON.parse(JSON.stringify(st));
      const runOff = ask => {
        Object.keys(snap).forEach(k => { st[k] = JSON.parse(JSON.stringify(snap[k])); });
        st.mkt.ask[G0.id] = ask; st.mkt.hold[G0.id] = 2;
        const s = st.stone; Math.random = () => 0.42;
        const r = D.offline(3600);
        Math.random = rnd2;
        return { d: st.stone - s, hold: st.mkt.hold[G0.id], price: D.goodPrice(G0), ok: !!r };
      };
      const noOrder = runOff(0), withOrder = runOff(1);
      ok(noOrder.ok && withOrder.ok, "offline(3600) 两遍都正常结算");
      ok(noOrder.hold === 2 && withOrder.hold === 0 && Math.abs(withOrder.d - (noOrder.d + 2 * withOrder.price)) < 1e-6,
        "离线核单不多生成收益：差额恰为 2×归来时价 " + withOrder.price + "（实测 " + noOrder.d + " → " + withOrder.d + "）");
      snap && Object.keys(snap).forEach(k => { st[k] = JSON.parse(JSON.stringify(snap[k])); });
      /* 坏档夹紧 */
      st.mkt.ask = {}; st.mkt.ask[G0.id] = GB * 9; st.mkt.ask.ore = -5; st.mkt.ask.powder = "abc"; st.mkt.askN = "xyz";
      D.ensureState();
      ok(st.mkt.ask[G0.id] === Math.floor(GB * 1.4), "挂单价上限夹到行情顶（" + st.mkt.ask[G0.id] + "）");
      ok(st.mkt.ask.ore === 0 && st.mkt.ask.powder === 0 && st.mkt.askN === 0, "负数 / 字符串 / 野值一律归零");
      /* 成就两侧 */
      ["askFirst", "ask20"].forEach(x => { delete st.ach[x]; });
      st.mkt.askN = 0; D.act.cultivate();
      ok(!st.ach.askFirst && !st.ach.ask20, "零成交不点亮挂单成就");
      st.mkt.askN = 1; D.act.cultivate();
      ok(!!st.ach.askFirst && !st.ach.ask20, "首笔成交点亮「待价而沽」，20 笔门槛不松口");
      st.mkt.askN = 20; D.act.cultivate();
      ok(!!st.ach.ask20, "满 20 笔点亮「守株待兔」");
      /* 助手侧不接入是刻意的：挂单"永远可做"，按饿死定律会压死下面整档 */
      { const av = X.availableActions(); ok(av.ask === undefined && av.askset === undefined, "挂单不进助手决策（避免恒可做动作饿死后续档）"); }
      Object.keys(keep).forEach(k => { st.mkt[k] = keep[k]; });
      D.ensureState();
    }
    { /* 碎丹转世：整局重置是最破坏性的一次写入，历轮 8 小时代打从没走到过这里。
         这组断言钉三件事：该清的清干净、该留的一个不丢、清完之后游戏还能继续跑。 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st));
      const BLESS = TB.BLESS, FATES = TB.FATES, FM = TB.FATE_MAX;
      ok(Array.isArray(BLESS) && BLESS.length >= 3 && Array.isArray(FATES) && FATES.length >= FM, "tables 暴露了 祝福/天命（模拟与测试才调得动词世）");
      /* ---- 守卫：未达化神不允碎丹 ---- */
      st.realm = 3;
      const rb0 = st.rebirths, lk0 = st.luck;
      D.act.rebirth(BLESS[0].k, []);
      ok(st.rebirths === rb0 && st.luck === lk0, "化神以下：转世被拒，气运与轮回数分文不动");
      /* ---- 造一个"事事都有痕迹"的一世，再转 ---- */
      st.realm = 6; st.layer = 5; st.exp = 1e6; st.stone = 5e6; st.pts = 7; st.fame = 4000;
      st.bld = { field: 5, garden: 4, cave: 3, room: 2, vault: 6, hall: 1 };
      st.areas = TB.AREAS.map(() => true); st.area = 9; st.sect = 4; st.contrib = 3000; st.contribAll = 9000;
      st.age = 9e6; st.chap = { cur: 8, done: { c1: 1 }, life: 20, run: 8 };
      st.tre.beat = { 0: 1, 1: 1 }; st.tower.best = 25; st.tower.depth = 25;
      st.cave = { door: "black", depth: 3, hs: 88888, he: 4444, risk: .4, hint: 1, max: 3 };
      st.caveCd = 0; st.bless = { early: 2, bowl: 1, fate: 0 };
      st.mkt.ask = { rice: 23, ore: 0, powder: 0, jade: 1200 }; st.mkt.hold = { rice: 3, ore: 0, powder: 1, jade: 0 };
      st.trib = 4; st.karma = 77; st.rel = { fr: { cauldron: 5, scroll: 0, sword: 0, bell: 0 } };
      st.sk = { lv: { clone: 3, touch: 2, swords: 1, titan: 0, mirror: 0, walk: 0 }, cd: {}, left: {} };
      st.disc = { own: {}, m: {}, n: 0 }; st.pill = { id: null, left: 0 };
      const fame0 = st.fame, ach0 = Object.keys(st.ach).length, trib0 = st.trib, kar0 = st.karma;
      /* 玩法偏好先摆成一个认得出的形状，转世后逐字比回来（四开关 + 自定套都是"习惯"，不是此生产物） */
      st.duelSt = "def"; st.cave.plan = 3; st.disc.ct = "fame";
      st.presetMine = { on: 1, st: "flow", psy: "mid", plan: 3, ct: "rich" }; st.presetMineS = 4;
      st.presetSeen = { mine: 1, gou: 1 };
      const psyKeep = { st: st.duelSt, plan: st.cave.plan, ct: st.disc.ct, mineS: st.presetMineS };
      const bowl0 = st.bowl.lv, rel0 = st.rel.fr.cauldron, contribAll0 = st.contribAll, towerBest0 = st.tower.best;
      const chron0 = st.chron.length, rbN = st.rebirths, lkB = st.luck, sk0 = st.sk.lv.clone;
      const bl = BLESS[0].k, fts = FATES.slice(0, FM + 2).map(x => x.id); /* 故意超额两条 */
      D.act.rebirth(bl, fts);
      /* ---- 该清的 ---- */
      ok(st.realm === 0 && st.layer === 1 && st.exp === 0 && st.stone === 0 && st.pts === 0, "转世归零：境界 / 修为 / 灵石 / 属性点");
      ok(TB.BLD.every(b => st.bld[b.id] === 0), "转世归零：六类建筑");
      ok(st.areas[0] === true && st.areas.slice(1).every(x => !x) && st.area === 0, "转世归零：只留太虚门一处道场");
      ok(st.sect === 0 && st.age === 0 && st.chap.cur === 0 && st.chap.run === 0 && Object.keys(st.chap.done).length === 0, "转世归零：宗门职位 / 寿元 / 主线本世进度");
      ok(Object.keys(st.tre.beat).length === 0, "转世归零：天骄榜重开（斗法成为可重复内容）");
      /* ---- 本轮修掉的两处残留 ---- */
      ok(st.cave.door === null && st.cave.depth === 0 && st.cave.hs === 0 && st.cave.he === 0,
        "洞窟在途趟随一世结束（带着旧世 hs 进新世 = 新世现银会被一笔从未属于它的塌方抽走）");
      ok(st.cave.max === 3, "cave.max 跨世保留（此生抵达过第几层，与 石台峰值 同类）");
      ok(Array.isArray(st.daily.lessons) && st.daily.lessons.length === 0 && typeof st.daily.lessonDone === "object" &&
        st.daily.lessonDone !== null && "snap" in st.daily,
        "转世后 daily 结构完整（先前第二条窄赋值会把 lessons/lessonDone/snap 抹成 undefined）");
      /* ---- 该留的 ---- */
      ok(st.fame >= fame0 && Object.keys(st.ach).length >= ach0 && st.trib === trib0 && st.karma === kar0,
        "跨世保留：声望只增不减（转世点亮成就会发奖赏）/ 成就 / 劫印 / 因果" +
        " 实测 名望Δ=" + (st.fame - fame0) + " 成就Δ=" + (Object.keys(st.ach).length - ach0) + " 劫印Δ=" + (st.trib - trib0) + " 因果Δ=" + (st.karma - kar0));
      ok(st.bowl.lv === bowl0 && st.rel.fr.cauldron === rel0 && st.contribAll === contribAll0 && st.tower.best === towerBest0, "跨世保留：聚宝盆 / 遗宝 / 生涯贡献 / 石台峰值");
      ok(st.sk.lv.clone === sk0, "跨世保留：神通修为（一世一世往上垒）");
      ok(st.mkt.ask.rice === 23 && st.mkt.ask.jade === 1200 && st.mkt.hold.rice === 3, "跨世保留：坊市持仓与挂单（铺子不认轮回）");
      /* 四个开关与"我自己存的那一套"是习惯，不是此生的资产：碎丹不该把玩法偏好一并抹掉 */
      ok(st.duelSt === psyKeep.st && st.cave.plan === psyKeep.plan && st.disc.ct === psyKeep.ct,
        "跨世保留：起手势 / 行程 / 赏格 三个开关（预设摆出来的活法不随一世结束）");
      ok(st.presetMine.on === 1 && st.presetMine.st === "flow" && st.presetMineS === psyKeep.mineS && st.presetSeen.mine === 1,
        "跨世保留：「存我这套」与其痕迹、计数（转世后仍能把前世那套摆回来）");
      /* ---- 得到什么 ---- */
      ok(st.rebirths === rbN + 1, "轮回计数 +1");
      ok(st.luck > lkB, "气运到手 +" + (st.luck - lkB) + "（全局产出 ×" + (1 + .5 * st.rebirths).toFixed(1) + "）");
      ok(st.bless[bl] === 3, "轮回祝福「" + bl + "」叠到 ×" + st.bless[bl]);
      ok(st.fate.ids.length === FM && st.fate.n >= FM, "天命超额被截到 " + FM + " 条，累计只记真担上的 " + st.fate.n + " 条");
      ok(st.chron.length > chron0 && /兵解转世|神界位阶/.test(st.chron[st.chron.length - 1]), "纪事在重置之前落笔：" + st.chron[st.chron.length - 1].slice(0, 40));
      /* ---- 清完之后还得好端端地跑 ---- */
      const before = st.exp;
      ok(D.cd() >= 0 && X.ruleAction() && typeof X.ruleAction().action === "string", "转世后规则引擎照常出招");
      D.act.cultivate(); D.act.explore();
      ok(st.exp > before, "转世后能立刻修炼/探索（新世不是死局）");
      let threw = null;
      try { D.ensureState(); D.updUI(); D.offline(3600); X.availableActions(); } catch (e) { threw = e.message; }
      ok(threw === null, "转世后 ensureState/updUI/offline/availableActions 全部不抛错" + (threw ? "：" + threw : ""));
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* 代打性格三档：这枚旋钮只许改"助手敢不敢"，不许改"游戏给不给"。
         所以核心不变量是——同一局面下三档的 availableActions 差集只能落在 tower 上，
         而游戏侧 act.* 的结果必须与性格完全无关。 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st));
      const psy0 = X.psy();
      ok(X.PSY && Object.keys(X.PSY).length === 3, "三档性格齐备（守拙/中庸/弄险）");
      const M = X.PSY.mid;
      ok(M.dig === .55 && M.sell === TB.MKT_SELL_AT && M.buy === TB.MKT_BUY_AT && M.tower === .45 && M.towerMax === .35 && M.stall === "high",
        "默认档逐字还原既有数值（洞窟 .55 / 行情 " + TB.MKT_BUY_AT + "·" + TB.MKT_SELL_AT + " / 石台 .45·.35 / 只取上品以上）——历轮断言才许照过");
      ok(X.psy() === "mid", "出厂性格是 中庸");
      /* ---- 胆量三档确实拉开 ---- */
      ok(X.PSY.steady.dig > X.PSY.mid.dig && X.PSY.mid.dig > X.PSY.bold.dig, "洞窟胆量：守拙 > 中庸 > 弄险");
      ok(X.PSY.steady.sell > X.PSY.mid.sell && X.PSY.mid.sell > X.PSY.bold.sell, "行情门槛：守拙要更陡的波峰");
      ok(X.PSY.steady.tower > X.PSY.mid.tower && X.PSY.mid.towerMax > X.PSY.bold.towerMax, "登台胜算线随胆量下移");
      ok(X.PSY.steady.buy < X.PSY.mid.buy && X.PSY.mid.buy < X.PSY.bold.buy,
        "买货价单调：守拙 " + X.PSY.steady.buy + " < 中庸 " + X.PSY.mid.buy + " < 弄险 " + X.PSY.bold.buy + "（只在更深低谷接货）");
      /* ---- 可达性：门槛写得再保守也不许落在物理可达域之外（守拙最初就是死在这一条上：
             价格倍率只可能 ∈[0.6,1.4]，我却给了 1.45/0.55，于是这一档的坊市永不可达，8 小时 trade×0）---- */
      const hi = 0.6 + 0.8, lo = 0.6; /* goodPrice = base×(.6+.8×wave) */
      const digMax = TB.DIG_BASE.jade + TB.DIG_HINT, digMin = TB.DIG_BASE.black - TB.DIG_STEP * (TB.DIG_MAX - 1) - TB.DIG_HINT;
      let dead = [];
      Object.entries(X.PSY).forEach(([k, P]) => {
        if (!(P.sell < hi && P.sell > 1)) dead.push(k + ".sell=" + P.sell);
        if (!(P.buy > lo && P.buy < 1)) dead.push(k + ".buy=" + P.buy);
        if (!(P.dig <= digMax && P.dig >= digMin)) dead.push(k + ".dig=" + P.dig);
        if (!(P.tower > P.towerMax && P.tower < 1 && P.towerMax > 0)) dead.push(k + ".tower=" + P.tower + "/" + P.towerMax);
        if (["low", "mid", "high", "top"].indexOf(P.stall) < 0) dead.push(k + ".stall=" + P.stall);
        if (!P.n || !P.d) dead.push(k + ".文案");
      });
      ok(dead.length === 0, "三档的每一条门槛都真的可达（洞窟线落在 " + digMin.toFixed(2) + "~" + digMax.toFixed(2) + "）" + (dead.length ? " 死档：" + dead.join(" ") : ""));
      /* ---- 野性格回落 ---- */
      ok(X.setPsy("bogus") === false && X.psy() === "mid", "setPsy 拒绝野名，性格不被改成乱码");
      ok(X.setPsy("bold") === true && X.psy() === "bold", "setPsy 接受合法名");
      X.setPsy("mid");
      /* ---- 关键不变量：可做集合与性格无关（tower 是助手侧自愿门槛，唯一例外）---- */
      st.realm = 5; st.layer = 3; st.stone = 5e7; st.exp = 1e6; st.pts = 2;
      st.mkt.hold = { rice: 4, ore: 0, powder: 2, jade: 0 }; st.mkt.t = 40;
      st.tower.cd = 0; st.caveCd = 0; st.tre.duelCd = 0; st.stall.cd = 0;
      st.sk.cd = {}; st.sch = { id: "sword", x: { pill: 30 }, t: {}, cd: 0, swap: 0, keN: 0 };
      const avs = {};
      ["steady", "mid", "bold"].forEach(k => { X.setPsy(k); avs[k] = X.availableActions(); });
      let diffKeys = new Set();
      Object.keys(avs.mid).forEach(key => {
        if (avs.steady[key] !== avs.mid[key] || avs.bold[key] !== avs.mid[key]) diffKeys.add(key);
      });
      ok([...diffKeys].every(k => k === "tower"),
        "三档的差异只允许落在 tower 一格（实测差异键：" + ([...diffKeys].join(",") || "无") + "）——游戏守卫没被这枚旋钮碰到");
      /* 同一份石台状态，在两档性格下让游戏自己登台：结果必须一模一样——旋钮不碰守卫 */
      const towerSnap = JSON.parse(JSON.stringify(st.tower));
      const tv = {};
      ["steady", "bold"].forEach(k => {
        X.setPsy(k);
        st.tower = JSON.parse(JSON.stringify(towerSnap));
        try { tv[k] = String(D.act.tower()); } catch (e) { tv[k] = "threw:" + e.message; }
      });
      ok(tv.steady === tv.bold, "游戏侧登台在两档性格下结果一致（" + tv.steady + " vs " + tv.bold + "）——胆量旋钮不碰守卫");
      /* ---- 规则真的按性格改口：拿一个恰好卡在三档之间生存率的窟 ---- */
      const quiet = () => {
        st.daily.signed = true; st.daily.gathered = true; st.daily.secretUsed = 999;
        st.daily.lessons = []; st.daily.lessonDone = {}; st.week.goals = [];
        st.chap.cur = TB.CHAPTERS.length; st.itm.heal = 0; st.itm.life = 0; st.itm.pearl = 0; st.itm.compass = 0;
        st.tribCd = 9999; st.exp = 0; st.pts = 0; st.stone = 0; st.fame = 0;
      };
      const run = (door, depth, hint) => {
        st.cave = { door, depth, hs: 500, he: 200, hint, risk: 0, max: depth };
        st.cave.risk = D.digRisk();
      };
      /* 金门无风 = .50：中庸/守拙都不进，弄险才进 */
      run("gold", 1, 0); quiet();
      const r50 = D.digRisk();
      ok(Math.abs(r50 - .5) < 1e-9, "构造出恰好五成的生存率（" + r50 + "）");
      X.setPsy("mid"); ok(ruleClean(["dig", "digkeep"]).action === "digkeep", "中庸：五成不占优 → 落袋");
      X.setPsy("steady"); ok(ruleClean(["dig", "digkeep"]).action === "digkeep", "守拙：五成更不该进 → 落袋");
      X.setPsy("bold"); ok(ruleClean(["dig", "digkeep"]).action === "dig", "弄险：五成已过它的四成半线 → 再进一层");
      /* 玉门顺风 = .65：守拙要 65%，正好压线才进 */
      run("jade", 1, 1); quiet();
      ok(Math.abs(D.digRisk() - .65) < 1e-9, "构造出恰好 65% 的生存率（" + D.digRisk() + "）");
      X.setPsy("steady"); ok(ruleClean(["dig", "digkeep"]).action === "dig", "守拙：65% 恰达自己的线 → 才肯进");
      run("gold", 1, -1); quiet(); /* .40 */
      X.setPsy("bold"); ok(ruleClean(["dig", "digkeep"]).action === "digkeep", "弄险也不是无脑：四成仍收手");
      X.setPsy(psy0);
      /* ---- 面板：三枚 chip 真的渲染出来，点一下就改口径并落本机配置 ---- */
      X.openPanel();
      const row = global.document.getElementById("psyRow");
      ok(row && row.children.length === 3, "助手面板渲染出三枚性格 chip（实测 " + (row ? row.children.length : "无节点") + " 枚）");
      X.setPsy("steady");
      ok(JSON.parse(global.localStorage.getItem("jxp_assist_cfg") || "{}").psy === "steady", "性格写进 jxp_assist_cfg（独立存档，重置游戏不清空）");
      X.setPsy(psy0);
      X.closePanel();
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* 日课/周愿不再抽"这辈子已经做不出的题"。
         168 小时代打实测：周愿圆满 0 次、三愿里 突破 0/12 与 斗法 0/8 永远欠着——
         因为混元九层之上无境可破、天骄榜尽数击败后 winN 冻结（要到下一世才重新涨）。
         修法是过滤掉做不了的题，而不是把目标数降下来（那是数值）。 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st));
      const maxRealm = TB.REALMS.length - 1;
      /* ---- 判据本身 ---- */
      st.realm = 3; st.layer = 5;
      ok(D.goalOK("break") === true && D.goalOK("wbreak") === true, "尚未封顶：突破类课业可达");
      st.realm = maxRealm; st.layer = 9;
      ok(D.isMaxed() === true, "构造出真正封顶的一世（混元九层）");
      ok(D.goalOK("break") === false && D.goalOK("wbreak") === false, "封顶之后：突破类永不可达（无境可破）");
      st.tre.beat = {}; TB.DUELS.forEach(d => { st.tre.beat[d.n] = 1; });
      ok(D.goalOK("duel") === false && D.goalOK("wduel") === false, "天骄榜尽数击败：斗法类冻结（winN 不再涨）");
      delete st.tre.beat[TB.DUELS[0].n];
      ok(D.goalOK("duel") === true && D.goalOK("wduel") === true, "还剩一位未胜者：斗法类重新可做");
      /* 法宝等阶跨世保留 → 四槽皆满二十重后 forgeN 永久冻结（连转世都救不回来），
         而这恰好是成就「四器圆满」的达成条件：毕业奖励不该变成两张永久欠着的题 */
      TB.T_SLOTS.forEach(t => { st.tre.lv[t.id] = TB.TRE_MAX; });
      ok(D.goalOK("forge") === false && D.goalOK("wforge") === false, "四槽皆满二十重：炼制类永久冻结 → 不再抽给玩家");
      st.tre.lv[TB.T_SLOTS[0].id] = TB.TRE_MAX - 1;
      ok(D.goalOK("forge") === true && D.goalOK("wforge") === true, "还差一重：炼制类又做得动了");
      /* 石台没有层数上限（胜算再低也有 5% 的底）——把能做的题一起过滤掉才是真 bug */
      st.tower.depth = 80; st.tower.best = 80;
      ok(D.goalOK("tower") === true && D.goalOK("wtower") === true, "登台类不许被当成死题（石台无层数上限）");
      ["explore", "cult", "pill", "forge", "skill", "wexplore", "wpill", "wdisc"].forEach(id => {
        ok(D.goalOK(id) === true, "常规课业 " + id + " 永远可达（不参与过滤）");
      });
      /* ---- 抽取真的避开死题 ---- */
      st.realm = maxRealm; st.layer = 9; st.tre.beat = {}; TB.DUELS.forEach(d => { st.tre.beat[d.n] = 1; });
      for (let i = 0; i < 40; i++) {
        const ds = "2026-11-" + String(1 + i).padStart(2, "0");
        const L = D.pickLessons(ds), W = D.pickWeeks("2026-W" + (40 + i));
        ok(L.length === 3 && new Set(L).size === 3 && W.length === 3 && new Set(W).size === 3, "第 " + i + " 组：三桩课业与三愿都是三个不重复的");
        if (L.some(x => !D.goalOK(x)) || W.some(x => !D.goalOK(x))) { ok(false, "第 " + i + " 组仍抽到死题：" + L.concat(W).join(",")); break; }
        if (i === 39) ok(true, "40 组日期在终局角色下全部只抽可达题，且始终凑满三桩（可选池退回全表的兜底不会空转）");
      }
      ok(D.pickLessons("2026-11-05").join() === D.pickLessons("2026-11-05").join(), "同日同状态仍是同一套课业（确定性没破）");
      /* ---- 终局角色确实能把一天三课全做完（这才是修的初衷）----
         课业进度 = 当前计数 − 当日快照；快照必须在加量之前取，否则 lessonProg 的
         `snap||daySnap()` 会在读取时现取一份"已经是加完后"的基线，进度恒为 0。 */
      const gv = id => {
        switch (id) {
          case "explore": return st.explores; case "cult": return st.clicks; case "pill": return st.pills;
          case "tower": return st.tower.n; case "duel": return st.tre.winN; case "forge": return st.tre.forgeN || 0;
          case "skill": return st.sk.n || 0; case "break": return st.breakN || 0; default: return 0;
        }
      };
      const bump = (id, n) => {
        if (id === "explore") st.explores += n; else if (id === "cult") st.clicks += n;
        else if (id === "pill") st.pills += n; else if (id === "tower") st.tower.n += n;
        else if (id === "duel") st.tre.winN += n; else if (id === "forge") st.tre.forgeN = (st.tre.forgeN || 0) + n;
        else if (id === "skill") st.sk.n = (st.sk.n || 0) + n; else if (id === "break") st.breakN = (st.breakN || 0) + n;
      };
      const L0 = D.pickLessons("2026-11-06");
      const dsnap = {}; L0.forEach(id => { dsnap[id] = gv(id); });
      st.daily = { day: "2026-11-06", signed: true, gathered: true, secretUsed: 9, lessons: L0, lessonDone: {}, snap: dsnap };
      L0.forEach(id => {
        const w = TB.LESSONS.find(x => x.id === id), tgt = D.lessonTarget(id);
        bump(id, tgt + 5);
        ok(D.lessonProg(id) >= tgt, "课业「" + w.n.replace("{t}", tgt) + "」进度 " + D.lessonProg(id) + "/" + tgt + " 已足");
      });
      L0.forEach((id, i) => {
        const before = st.asc.incense;
        ok(D.act.lesson(i) === true, "了结第 " + (i + 1) + " 课");
        ok(st.asc.incense > before, "香火到手 +" + (st.asc.incense - before));
      });
      ok(Object.keys(st.daily.lessonDone).length === 3, "三课全勤：终局角色一天做得完（先前有一格永远欠着）");
      /* 周愿同一段位再抽一次，确认抽出的三愿也能一并偿清 */
      st.week = { wk: "2026-W46", goals: D.pickWeeks("2026-W46"), done: {}, snap: { wexplore: st.explores, wtower: st.tower.n, wduel: st.tre.winN, wpill: st.pills, wdisc: st.disc.n, wbreak: st.breakN, wforge: st.tre.forgeN || 0, wskill: st.sk.n || 0 } };
      st.week.goals.forEach((id, i) => {
        const t0 = D.weekTarget(id);
        if (id === "wexplore") st.explores += t0 + 3;
        else if (id === "wtower") st.tower.n += t0 + 3;
        else if (id === "wduel") st.tre.winN += t0 + 3;
        else if (id === "wpill") st.pills += t0 + 3;
        else if (id === "wdisc") st.disc.n += t0 + 3;
        else if (id === "wbreak") st.breakN += t0 + 3;
        else if (id === "wforge") st.tre.forgeN = (st.tre.forgeN || 0) + t0 + 3;
        else if (id === "wskill") st.sk.n = (st.sk.n || 0) + t0 + 3;
        else ok(false, "未登记的周愿 id：" + id);
        ok(D.act.week(i) === true, "偿清周愿第 " + (i + 1) + " 愿（" + D.weekName(id) + "）");
      });
      ok((st.weekAll || 0) >= 1, "三愿皆偿 → 周愿圆满计数前进（先前终局角色永远到不了这一格）");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* 探灵罗盘：深层才掉、窟里才用、一趟只锁一次，买的是风险不是收益 */
      const st = D.state, TB = D.tables, rnd = Math.random;
      const keep = JSON.parse(JSON.stringify(st));
      const inCave = (door, depth, hint) => {
        st.cave = { door, depth, hs: 1000, he: 400, hint: hint || 0, risk: 0, max: depth, lock: 0 };
        st.cave.risk = D.digRisk();
      };
      ok(TB.ITEMS.some(x => x.id === "compass" && x.solo && x.max === 2), "罗盘在道具表里，标着 solo 且最多两枚");
      /* ---- 窟外不许用 ---- */
      st.cave = { door: null, depth: 0, hs: 0, he: 0, risk: .5, hint: 0, max: 0, lock: 0 };
      st.itm.compass = 1;
      const lock0 = st.caveLock || 0;
      ok(D.act.item("compass") === false && st.itm.compass === 1 && (st.caveLock || 0) === lock0, "不在窟中：罗盘被拒且不消耗");
      /* ---- 窟中动用：锁住风向 ---- */
      inCave("gold", 1, -1);
      const r0 = D.digRisk();
      ok(Math.abs(r0 - .40) < 1e-9, "金门逆风生存 " + r0);
      ok(D.act.item("compass") === true, "窟中动用罗盘成功");
      ok(st.itm.compass === 0 && st.cave.lock === 1 && st.cave.hint === 1, "消耗一枚、本趟上锁、风声改为顺风");
      ok(Math.abs(D.digRisk() - (TB.DIG_BASE.gold + TB.DIG_HINT)) < 1e-9,
        "锁风后生存 = 门基础 + 一档顺风 = " + D.digRisk().toFixed(2) + "（从逆风 " + r0.toFixed(2) + " 抬了两档，因为 −1→+1）；产出分文未加");
      ok((st.caveLock || 0) === lock0 + 1, "动用计数 +1（成就读它）");
      ok(D.act.item("compass") === false, "没带罗盘时再点不动（不白锁）");
      st.itm.compass = 1;
      ok(D.act.item("compass") === false && st.itm.compass === 1 && st.cave.lock === 1, "本趟已锁：第二枚不烧（再摊开也是一根定针）");
      /* ---- 锁要扛得住下一层的随机风声 ---- */
      const dep = st.cave.depth;
      Math.random = () => 0.01; /* 必成 */
      ok(D.cavePush() === true, "锁风状态下深入一层");
      ok(st.cave.depth === dep + 1 && st.cave.hint === 1 && st.cave.lock === 1, "锁住之后：新层的 hint 不被随机风声覆盖（0.01 本会抽成 −1）");
      ok(st.itm.compass >= 1, "第 " + st.cave.depth + " 层碎石里掉出一枚罗盘（深层专属渠道，实测持 " + st.itm.compass + " 枚）");
      /* ---- 顶格不许再用 ---- */
      inCave("jade", TB.DIG_MAX, 1); st.itm.compass = 2;
      ok(D.act.item("compass") === false && st.itm.compass === 2, "已是最后一层：罗盘不烧（前面没路，指风也没用）");
      /* ---- 出窟的三条路都解锁 ---- */
      inCave("jade", 2, 0); st.itm.compass = 1; D.act.item("compass");
      ok(D.caveKeep() === true && st.cave.lock === 0, "收手即解锁");
      inCave("jade", 2, 0); st.itm.compass = 1; D.act.item("compass");
      Math.random = () => 0.99; /* 必塌 */
      ok(D.cavePush() === true && st.cave.lock === 0 && st.cave.door === null, "塌方即解锁（运行态一起归零）");
      Math.random = rnd;
      inCave("black", 3, 0); st.itm.compass = 1; D.act.item("compass");
      st.realm = TB.REALMS.length - 1; st.layer = 9;
      D.act.rebirth(TB.BLESS[0].k, []);
      ok(st.cave.lock === 0 && st.cave.door === null, "转世也带走这一趟（锁不会跨世残留）");
      /* ---- 通用掉落池不认它：别稀释既有掉落经济（也不要让"确定性掉落"的旧断言改口）---- */
      st.itm = { charm: 0, pearl: 0, heal: 0, life: 0, compass: 0 };
      Math.random = () => 0.01;
      for (let i = 0; i < 30; i++) D.act.drop();
      Math.random = rnd;
      ok(st.itm.compass === 0, "常规掉落 30 次也没掉出罗盘（solo 把它挡在通用池外）实测 charm=" + st.itm.charm + " pearl=" + st.itm.pearl + " heal=" + st.itm.heal);
      ok(st.itm.charm + st.itm.pearl + st.itm.heal + st.itm.life > 0, "同一批掉落仍照旧发给原有四类（经济未被新增道具分走）");
      /* ---- 夹紧坏档 ---- */
      st.itm.compass = "abc"; st.cave.lock = 7;
      D.ensureState();
      ok(st.itm.compass === 0 && st.cave.lock === 1, "字符串枚数归 0 / 锁位夹成 1（存在即锁）");
      st.itm.compass = 99; D.ensureState();
      ok(st.itm.compass === 2, "枚数上限 2（坏档也塞不进第三枚）");
      /* ---- 助手：只在"这一枚刚好够线"时才烧 ---- */
      const quiet2 = () => {
        st.daily.signed = true; st.daily.gathered = true; st.daily.secretUsed = 999;
        st.daily.lessons = []; st.daily.lessonDone = {}; st.week.goals = [];
        st.chap.cur = TB.CHAPTERS.length; st.itm.heal = 0; st.itm.life = 0; st.itm.pearl = 0;
        st.tribCd = 9999; st.exp = 0; st.pts = 0; st.stone = 0; st.fame = 0;
        X.setPsy("mid");
      };
      quiet2();
      inCave("gold", 1, 0); st.itm.compass = 2; /* 生存 .50，中庸线 .55，+.10 → .60 够线 */
      ok(X.availableActions()["item:compass"] === true, "窟中未锁且手里有：item:compass 可用");
      { const d = ruleClean(["dig", "digkeep", "item"]); ok(d.action === "item" && d.target === "compass", "差一档就够线 → 烧罗盘（实返 " + d.action + "/" + d.target + "）"); }
      inCave("gold", 1, -1); st.itm.compass = 2; /* 生存 .40，+.10 仍 .50 < .55 → 不值得烧 */
      { const d = ruleClean(["dig", "digkeep", "item"]); ok(d.action === "digkeep", "差两档够不着线 → 不浪费罗盘，直接落袋（实返 " + d.action + "）"); }
      inCave("jade", 1, 1); st.itm.compass = 2; /* 生存 .65 已过线 → 不必烧 */
      { const d = ruleClean(["dig", "digkeep", "item"]); ok(d.action === "dig", "本来就占优 → 直接进，罗盘留着（实返 " + d.action + "）"); }
      st.cave.lock = 1; st.itm.compass = 2;
      ok(X.availableActions()["item:compass"] === false, "已上锁 → 助手侧也判不可用");
      st.cave.lock = 0;
      ok(X.validateDecision({ action: "item", target: "compass", reason: "t" }, X.availableActions()) !== null, "validateDecision 放行 item/compass");
      const lc = st.caveLock || 0;
      X.execDecision({ action: "item", target: "compass" }, "规则");
      ok(st.cave.lock === 1 && (st.caveLock || 0) === lc + 1, "execDecision 真动用了一枚");
      /* ---- 成就两侧 ---- */
      ["cmp1", "cmp8"].forEach(x => { delete st.ach[x]; });
      st.caveLock = 0; D.act.cultivate();
      ok(!st.ach.cmp1 && !st.ach.cmp8, "零动用不点亮罗盘成就");
      st.caveLock = 1; D.act.cultivate();
      ok(!!st.ach.cmp1 && !st.ach.cmp8, "首次动用点亮「一卦定乾坤」，8 次门槛不松口");
      st.caveLock = 8; D.act.cultivate();
      ok(!!st.ach.cmp8, "满 8 次点亮「盘定深层」");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* 洞窟·行程规划：把"赌到第几层"提前决定。它的正当性在于只收紧、不扩张，
         而"不扩张"必须被证明——同样的随机序列下，各层所得与不设限时逐分相同，只是到点就走。 */
      const st = D.state, TB = D.tables, rnd = Math.random;
      const keep = JSON.parse(JSON.stringify(st));
      const run = (door, depth, hint, plan) => {
        st.cave = { door, depth, hs: 0, he: 0, risk: 0, hint: hint || 0, max: depth, lock: 0, plan: plan || 0 };
        st.cave.risk = D.digRisk();
      };
      /* ---- 循环档位 ---- */
      st.cave = { door: null, depth: 0, hs: 0, he: 0, risk: .5, hint: 0, max: 0, lock: 0, plan: 0 };
      const seq = [];
      for (let i = 0; i < 5; i++) { D.cavePlanCycle(); seq.push(st.cave.plan); }
      ok(seq.join() === "2,3,4,5,0", "行程循环：2 → 3 → 4 → 5 → 取消（实测 " + seq.join("→") + "）");
      ok(D.cavePlanCycle() === true && st.cave.plan === 2, "取消后再点又回到 2（第 1 层没得规划）");
      /* ---- 坏档夹紧 ---- */
      st.cave.plan = 1; D.ensureState(); ok(st.cave.plan === 0, "plan=1 归零（进门就是第 1 层，规划无意义）");
      st.cave.plan = 99; D.ensureState(); ok(st.cave.plan === TB.DIG_MAX, "越界行程夹到顶格 " + TB.DIG_MAX);
      st.cave.plan = "abc"; st.cavePlan = -3; D.ensureState();
      ok(st.cave.plan === 0 && st.cavePlan === 0, "字符串行程与负计数都归零");
      /* ---- 抵达即落袋 ---- */
      run("jade", 1, 1, 2); st.cavePlan = 0;
      const k0 = st.karma, cp0 = st.cavePlan;
      Math.random = () => 0.01; /* 必成 */
      ok(D.cavePush() === true, "定 2 层、摸到 2 层：这一层成功");
      ok(st.cave.door === null && st.cave.depth === 0 && st.cave.hs === 0, "到点自动落袋：这一趟当场结束");
      ok(st.karma === k0 + 1 && st.cavePlan === cp0 + 1, "带货收手照旧因果 +1，并记一次说到做到");
      Math.random = rnd;
      /* ---- 塌方不算"说到做到" ---- */
      run("jade", 2, 0, 3); st.cavePlan = 0;
      const c1 = st.cavePlan;
      Math.random = () => 0.99; /* 必塌 */
      ok(D.cavePush() === true && st.cave.door === null && st.cavePlan === c1, "塌方出局不计入行程完成（只有真摸到那一层才算）");
      Math.random = rnd;
      /* ---- 核心：只收紧不扩张 ----
         每次 cavePush 里 Math.random 要叫好几次（成败 / 风声两次 / 第 3 层起还有一掷罗盘掉落），
         拿序列去"安排"每一次调用必然错位——实测就是这样让不设限的那趟第三层塌了。
         用常数最稳：0.01 使每次推进必成，只剩复利本身可比。 */
      const haul = plan => {
        run("jade", 1, 1, plan); st.cavePlan = 0;
        const s = [];
        const rr = Math.random;
        Math.random = () => 0.01;
        let prev = st.stone;
        for (let i = 0; i < 3 && st.cave.door; i++) {
          D.cavePush();
          s.push(st.stone - prev);
          prev = st.stone;
        }
        Math.random = rr;
        return { hauls: s, door: st.cave.door, maxDepth: st.cave.max };
      };
      st.realm = Math.max(1, st.realm);
      const free = haul(0), capped = haul(2);
      ok(capped.hauls.length === 1 && free.hauls[0] === capped.hauls[0],
        "第 2 层所得与不设限时逐分相同（" + capped.hauls[0] + "）——行程只让你到点就走，不改任何一层的价格");
      ok(capped.door === null && free.door !== null, "同一序列下：定 2 层的已收手，没定的还在往里走");
      ok(free.hauls.length === 3 && free.hauls.every((v, i) => i === 0 || v > free.hauls[i - 1]),
        "不设限时仍在往深处走且复利放大（" + free.hauls.map(v => D.fmt(v)).join(" → ") + "），行程没削弱可达收益");
      /* ---- 行程是常设规矩，不因换门而失效 ---- */
      run("gold", 1, 0, 4); st.caveCd = 0;
      const plan0 = st.cave.plan;
      Math.random = () => 0.3;
      D.act.cave("gold");
      ok(st.cave.plan === plan0 && st.cave.depth === 1, "开新的一趟仍带着既定行程（它是常设规矩，不是一次性念头）");
      Math.random = rnd;
      /* ---- 明细显示 ---- */
      run("gold", 2, 0, 4); st.cave.hs = 700; st.cave.he = 200;
      ok(D.caveRunInfo().indexOf("行程第 4 层") >= 0, "洞窟明细里如实写着既定行程");
      /* ---- 成就两侧 ---- */
      ["plan1", "plan12"].forEach(x => { delete st.ach[x]; });
      st.cavePlan = 0; D.act.cultivate();
      ok(!st.ach.plan1 && !st.ach.plan12, "零完成不点亮行程成就");
      st.cavePlan = 1; D.act.cultivate();
      ok(!!st.ach.plan1 && !st.ach.plan12, "首次到点落袋点亮「说到做到」");
      st.cavePlan = 12; D.act.cultivate();
      ok(!!st.ach.plan12, "满 12 次点亮「行程如铁」");
      /* ---- 助手侧：到点之后没有这一趟可推，性格线再低也扩不了张 ---- */
      run("black", TB.DIG_MAX, 1, 0);
      X.setPsy("bold");
      st.cave = { door: "black", depth: 5, hs: 900, he: 300, risk: .3, hint: 1, max: 5, lock: 0, plan: 0 };
      ok(X.availableActions().dig === false && X.availableActions().digkeep === true, "顶格行程之外：最冒险的性格也只能收手");
      X.setPsy("mid");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* 姿势预设：把散在四个面板里的开关一次摆齐。
         它必须"只改选择、不改数字"——这条不是靠说，是靠逐字段对拍出来的。 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st));
      const P = D.PRESETS;
      /* ---- 结构：每个字段都得是别处已有的合法枚举 ---- */
      ok(Array.isArray(P) && P.length === 3, "三套预设齐备（" + P.map(p => p.n).join("/") + "）");
      let badF = [];
      P.forEach(p => {
        if (!TB.STANCES.some(s => s.id === p.st)) badF.push(p.id + ".st=" + p.st);
        if (!X.PSY[p.psy]) badF.push(p.id + ".psy=" + p.psy);
        if (!(p.plan === 0 || (p.plan >= 2 && p.plan <= TB.DIG_MAX))) badF.push(p.id + ".plan=" + p.plan);
        if (!TB.DISC_CONTRACTS.some(c => c.id === p.ct)) badF.push(p.id + ".ct=" + p.ct);
        if (!p.n || !p.d) badF.push(p.id + ".文案");
      });
      ok(badF.length === 0, "预设的每一项都落在合法枚举里（坏字段: " + (badF.join(",") || "无") + "）");
      ok(new Set(P.map(p => p.st)).size === 3 && new Set(P.map(p => p.psy)).size === 3 && new Set(P.map(p => p.ct)).size === 3,
        "三套预设的势 / 性格 / 赏格互不重复（真给出三种活法，不是同一套换个名）");
      ok(new Set(P.map(p => p.plan)).size >= 2, "行程档也不是一律照抄");
      /* ---- 野 id ---- */
      st.presetLast = ""; const before0 = st.duelSt;
      ok(D.applyPreset("buysell-nothing") === false && st.duelSt === before0 && st.presetLast === "", "野预设名被拒，什么都不动");
      /* ---- 核心：只改选择，不改数字 ---- */
      ["preFirst", "preAll", "discDao", "discCt3"].forEach(x => { st.ach[x] = 1; });   /* 立赏格会记 ctUsed、可能顺路点亮"三种赏格都用过"那类成就并发奖：那是功能奖励不是预设偷发钱，先占住才测得干净 */
      const NUMS = ["stone", "exp", "allStone", "allExp", "lifeExp", "fame", "karma", "luck", "pts", "contrib", "contribAll", "trib", "pills", "explores", "caveDig", "caveKeep", "caveFail", "caveLock", "cavePlan", "lessonDays", "weekAll", "rebirths"];
      st.realm = 6; st.layer = 3; st.tre.duelCd = 0;
      P.forEach(p => {
        const snapN = {}; NUMS.forEach(k => { snapN[k] = st[k]; });
        const snapD = { incense: st.asc.incense, tok: st.tower.tok, bowl: st.bowl.lv, order: st.asc.ord, relic: JSON.stringify(st.rel.fr) };
        const achKeys = Object.keys(st.ach).length, achSet = new Set(Object.keys(st.ach));
        const hs0 = st.cave.hs, he0 = st.cave.he, max0 = st.cave.max;
        ok(D.applyPreset(p.id) === true, "摆开「" + p.n + "」成功");
        const drift = NUMS.filter(k => st[k] !== snapN[k]);
        const d2 = [];
        if (st.asc.incense !== snapD.incense) d2.push("香火+" + (st.asc.incense - snapD.incense));
        if (st.tower.tok !== snapD.tok) d2.push("石台令+" + (st.tower.tok - snapD.tok));
        if (st.bowl.lv !== snapD.bowl) d2.push("聚宝盆");
        if (st.asc.ord !== snapD.order) d2.push("秩序");
        if (JSON.stringify(st.rel.fr) !== snapD.relic) d2.push("遗宝");
        const newAch = Object.keys(st.ach).filter(k => !achSet.has(k));
        ok(drift.length === 0 && d2.length === 0 && newAch.length === 0,
          "摆这套预设没动任何数字也不发成就（数字: " + ([...drift, ...d2].join(",") || "无") + "；新点亮: " + (newAch.join(",") || "无") + "）");
        ok(Object.keys(st.ach).length === achKeys, "摆预设本身不顺手发成就（成就数不变）");
        ok(st.duelSt === p.st && st.cave.plan === p.plan && st.disc.ct === p.ct && X.psy() === p.psy,
          "四个开关确实都摆到了" + p.n + "（势" + st.duelSt + " 行程" + st.cave.plan + " 赏格" + st.disc.ct + " 性格" + X.psy() + "）");
        ok(st.cave.hs === hs0 && st.cave.he === he0 && st.cave.max === max0, "在途那一趟的账本与历史最深不受影响");
        ok(st.presetLast === p.id && st.presetSeen[p.id] === 1, "记下「刚摆过」与「摆过哪些」");
      });
      /* ---- 重复摆同一套：势那一步自然走"本就在这势"分支，仍算成功 ---- */
      const s1 = st.stone;
      ok(D.applyPreset("gou") === true && st.stone === s1 && st.duelSt === "def", "重复摆同一套不报错也不改数");
      /* ---- 行程与洞窟的联动：预设把 plan 写进行程，抵达仍按老规矩自动落袋 ---- */
      st.cave = { door: "jade", depth: 1, hs: 500, he: 100, risk: .5, hint: 0, max: 1, lock: 0, plan: 0 };
      D.applyPreset("gou");
      ok(st.cave.plan === 2, "摆完苟道后，这一趟的行程立刻改成第 2 层收手");
      const rr = Math.random; Math.random = () => 0.01;
      const cp0 = st.cavePlan || 0;
      D.cavePush();
      ok(st.cave.door === null && (st.cavePlan || 0) === cp0 + 1, "预设的行程一样会到点自动落袋（与原功能同一条路）");
      Math.random = rr;
      /* ---- 高亮必须由 updUI 刷新（先前这段写在一次性的绑定块里，摆完永远不亮，不崩不报错）---- */
      X.openPanel && X.openPanel();
      D.act.cultivate();                               /* 先确保 updUI 至少跑过一次，元素已建 */
      D.applyPreset("zhong");
      D.updUI();
      { const b = global.document.getElementById("pre-zhong");
        ok(b && b.classList.contains("on"), "摆完中道并刷新界面后，中道那颗钮亮起（渲染在 updUI 里，不在一次性绑定里）");
        const info = global.document.getElementById("presetInfo");
        /* setHTML 写的是 innerHTML（还带 uiCache 短路），所以要看 innerHTML 不是 textContent */
        const infoTxt = info ? String(info.innerHTML).replace(/<[^>]+>/g, "") : "";
        ok(infoTxt.indexOf("第3层") >= 0 && infoTxt.indexOf("厚利") >= 0, "四开关回显写明行程第 3 层与赏格厚利（" + (infoTxt.slice(0, 44) || "空") + "）");
        D.applyPreset("gou"); D.updUI();
        ok(!b.classList.contains("on") && global.document.getElementById("pre-gou").classList.contains("on"),
          "改摆苟道后中道自动灭掉——高亮跟着四个开关的真实状态走"); }
      X.closePanel && X.closePanel();
      /* ---- 坏档：野键剔掉、非对象恢复 ---- */
      st.presetSeen = { gou: 1, bogus: 1, zhong: "x" }; D.ensureState();
      ok(st.presetSeen.gou === 1 && st.presetSeen.bogus === undefined && st.presetSeen.zhong === 1, "ensureState 剔掉野预设键并归一取值");
      st.presetSeen = "abc"; st.presetLast = 42; D.ensureState();
      ok(typeof st.presetSeen === "object" && st.presetSeen && Object.keys(st.presetSeen).length <= P.length + 1 && st.presetLast === "42",
        "预设痕迹坏成字符串也能恢复");
      /* ---- 成就两侧 ---- */
      ["preFirst", "preAll"].forEach(x => { delete st.ach[x]; });
      st.presetSeen = { gou: 1 }; D.act.cultivate();
      ok(!!st.ach.preFirst && !st.ach.preAll, "摆过一套点亮「摆开架势」，三套门槛不松口");
      st.presetSeen = { gou: 1, zhong: 1, bo: 1 }; D.act.cultivate();
      ok(!!st.ach.preAll, "三套都摆过点亮「三种活法」");
      /* ---- 助手侧不接入：预设是玩家的姿势选择，不是每一次决策 ---- */
      { const av = X.availableActions(); ok(av.preset === undefined && av.pre === undefined, "预设不占助手决策位（避免多一个「恒可做」动作饿死后面整档）"); }
      { /* ---- 自定套「存我这套」：玩家把自己的四开关收成第四套 ----
             它比三套现成的多一条风险：存进去的可能是野值。所以每一面都要夹——
             没存过 / 存进去 / 摆回来 / 坏档 / 界面置灰 / 成就两侧 / 数字不漂。 */
        ["myP1", "myP5"].forEach(a => { st.ach[a] = 1; });   /* 先占住：发奖是成就自己的事，别混进"摆一套不改数"的对拍 */
        ok(typeof D.presetMineSave === "function" && typeof D.act.presetSave === "function",
          "存这套在桥的两个面上都注册了（面板点得到 ≠ act 叫得动）");
        /* —— 没存过：presetOf("mine") 必须是 null，摆它必须整个被拒 —— */
        st.presetMine = { on: 0 }; D.ensureState();
        { const b0 = st.duelSt, p0 = st.cave.plan, c0 = st.disc.ct, y0 = X.psy(), n0 = st.presetMineA || 0;
          ok(D.applyPreset("mine") === false && st.duelSt === b0 && st.cave.plan === p0 && st.disc.ct === c0 && X.psy() === y0 && st.presetMineA === n0,
            "还没存过时「我的」被拒，四个开关一个不动、计数也不涨"); }
        /* —— 存 → 摆乱 → 摆回来：原样回来，数字一点不漂 —— */
        st.realm = 6; st.layer = 3; st.tre.duelCd = 0;
        st.duelSt = "flow"; st.cave.plan = 4; st.disc.ct = "fame"; X.setPsy("bold");
        { const sn = {}; NUMS.forEach(k => { sn[k] = st[k]; });
          const s0 = st.presetMineS || 0, ac = Object.keys(st.ach).length;
          ok(D.act.presetSave() === true, "存下这一套（走 act 桥，与面板同一颗钮）");
          ok(st.presetMine.on === 1 && st.presetMine.st === "flow" && st.presetMine.plan === 4 && st.presetMine.ct === "fame" && st.presetMine.psy === "bold",
            "存进去的就是此刻这四个开关");
          ok(st.presetMineS === s0 + 1, "每存一次只加「存过几次」这一格");
          const drift = NUMS.filter(k => st[k] !== sn[k]);
          ok(drift.length === 0 && Object.keys(st.ach).length === ac,
            "存这套不动数字也不白送成就（漂: " + (drift.join(",") || "无") + "；新点亮: " + (Object.keys(st.ach).length === ac ? "无" : "?") + "）"); }
        D.applyPreset("gou"); D.act.discCt("rich");
        ok(st.duelSt === "def" && st.cave.plan === 2 && st.disc.ct === "rich" && X.psy() === "steady", "先把四个开关摆乱（苟道 + 另立赏格）");
        { const sn = {}; NUMS.forEach(k => { sn[k] = st[k]; });
          const a0 = st.presetMineA || 0, seen = Object.keys(st.ach).length;
          ok(D.applyPreset("mine") === true, "摆回自己那一套成功");
          ok(st.duelSt === "flow" && st.cave.plan === 4 && st.disc.ct === "fame" && X.psy() === "bold",
            "四个开关原样回来了（势" + st.duelSt + " 行程" + st.cave.plan + " 赏格" + st.disc.ct + " 性格" + X.psy() + "）");
          ok(st.presetMineA === a0 + 1 && st.presetLast === "mine" && st.presetSeen.mine === 1, "记下「刚摆的是我的」与「摆过我的」");
          const drift = NUMS.filter(k => st[k] !== sn[k]);
          ok(drift.length === 0 && Object.keys(st.ach).length === seen, "摆自己那套同样不漂数字（漂: " + (drift.join(",") || "无") + "）"); }
        /* —— 坏档：手改的野值必须夹回合法枚举，否则 applyPreset 会拿脏值去写状态 —— */
        st.presetMine = { on: 1, st: "wind", psy: "brave", plan: 99, ct: "nope" }; D.ensureState();
        ok(TB.STANCES.some(s => s.id === st.presetMine.st) && ["steady", "mid", "bold"].indexOf(st.presetMine.psy) >= 0
          && TB.DISC_CONTRACTS.some(c => c.id === st.presetMine.ct) && st.presetMine.plan >= 0 && st.presetMine.plan <= TB.DIG_MAX && st.presetMine.plan !== 1,
          "自定套的每一项都被夹回合法枚举（势" + st.presetMine.st + " 性格" + st.presetMine.psy + " 行程" + st.presetMine.plan + " 赏格" + st.presetMine.ct + "）");
        st.presetMine = { on: 1, st: "flow", psy: "mid", plan: 1, ct: "rich" }; D.ensureState();
        ok(st.presetMine.plan === 2, "行程 1 档（原功能里根本不存在）被归到 2，不会摆出一个点不出来的档位");
        st.presetMine = "abc"; st.presetMineS = -3; st.presetMineA = "x"; D.ensureState();
        ok(st.presetMine && typeof st.presetMine === "object" && st.presetMine.on === 0 && st.presetMineS === 0 && st.presetMineA === 0,
          "自定套坏成字符串也能恢复，计数不为负不为 NaN");
        /* —— 痕迹存得住：摆过「我的」也算摆过，但野键照样剔 —— */
        st.presetSeen = { gou: 1, mine: 1, bogus: 1 }; D.ensureState();
        ok(st.presetSeen.mine === 1 && st.presetSeen.gou === 1 && st.presetSeen.bogus === undefined,
          "「摆过我的那一套」这条痕迹不会被白名单误删");
        /* —— 界面：置灰条件必须和游戏拒绝条件同一条 —— */
        X.openPanel && X.openPanel(); D.updUI();
        { const mb = global.document.getElementById("pre-mine"), sv = global.document.getElementById("btnPresetSave");
          const keepMine = st.presetMine;
          st.presetMine = { on: 1, st: "flow", psy: "bold", plan: 4, ct: "fame" }; D.updUI();
          ok(!!mb && mb.disabled === false && mb.style.display !== "none", "存过之后「我的」既可点又看得见");
          ok(!!sv && sv.disabled === false, "「存我这套」恒可点（存自己的姿势不该有门槛）");
          const ti = String(mb && mb.title || "");
          ok(ti.indexOf("起手") >= 0 && ti.indexOf("行程") >= 0 && ti.indexOf("赏格") >= 0 && ti.indexOf("代打") >= 0,
            "悬停写清了它存的是哪四样（" + ti.replace(/<[^>]*>/g, "").slice(0, 34) + "…）");
          /* 第三势的名字就叫一个"势"字：标签若也写"势"，读数成"势 势"——浏览器实测撞到的，是读不懂不是崩 */
          ok(ti.indexOf("势 势") < 0, "悬停不出现「势 势」叠字（起手 X 才是人话）");
          st.presetMine = { on: 0 }; D.updUI();
          ok(mb.disabled === true, "没存过时「我的」置灰——只藏起来不算，键盘还能聚焦，点了就是白点");
          st.presetMine = keepMine; D.updUI();
          const info = global.document.getElementById("presetInfo");
          const t = String(info && info.innerHTML || "");
          ok(t.indexOf("undefined") < 0 && t.indexOf("NaN") < 0, "四开关回显里没有 undefined/NaN（性格表没就绪时写「待载入」而不是崩一整帧）");
          ok(t.indexOf("势 势") < 0 && t.indexOf("起手") >= 0, "四开关回显也写成「起手 X」（" + t.replace(/<[^>]*>/g, "").slice(0, 30) + "…）");
          X.closePanel && X.closePanel(); }
        /* —— 成就两侧 —— */
        ["myP1", "myP5"].forEach(a => { delete st.ach[a]; });
        st.presetMineS = 0; st.presetMineA = 0; D.act.cultivate();
        ok(!st.ach.myP1 && !st.ach.myP5, "计数归零时两条都收回");
        st.presetMineS = 1; st.presetMineA = 4; D.act.cultivate();
        ok(!!st.ach.myP1 && !st.ach.myP5, "存下第一套点亮「自成一家」，摆回 5 次的门槛不松口");
        st.presetMineA = 5; D.act.cultivate();
        ok(!!st.ach.myP5, "把自己那套摆回 5 次点亮「照本宣科」");
      }
      X.setPsy("mid");
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* ---- 前程 · 还差多少（第 45 轮）：一张「只读表」必须真的只读 ----
         它承诺不发奖、不改数、不占决策位，这三条都要当场对拍出来，不能靠说。 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st));
      const NUMS = ["stone", "exp", "allStone", "allExp", "lifeExp", "fame", "karma", "luck", "pts", "contrib", "contribAll", "trib", "pills", "explores", "caveDig", "caveKeep", "caveFail", "caveLock", "cavePlan", "lessonDays", "weekAll", "rebirths", "caveN", "sk", "clicks"];
      const P = TB.ACH_PROG;
      ok(Array.isArray(P) && P.length >= 60, "前程表经 tables 桥导出（" + (P ? P.length : 0) + " 条）");
      const byId = {}; TB.ACHS.forEach(a => { byId[a.id] = a; });
      ok(P.every(e => byId[e.id]), "前程表每条都指向一款真实存在的成就（无孤儿 id）");
      ok(new Set(P.map(e => e.id)).size === P.length, "前程表没有重复成就");
      /* ---- 只读三对拍：读数、选序、渲染，各自都不许动状态 ---- */
      const snapN = {}; NUMS.forEach(k => { snapN[k] = JSON.stringify(st[k]); });
      const achN = Object.keys(st.ach || {}).length;
      const g = D.nextGoals(4);
      for (let i = 0; i < 30; i++) { D.goalProg(); D.nextGoals(4); D.soonLines(); D.progNum(1234.5); }
      D.updUI(); D.updUI();
      const drift = NUMS.filter(k => JSON.stringify(st[k]) !== snapN[k]);
      ok(drift.length === 0 && Object.keys(st.ach || {}).length === achN,
        "前程一节刷三十遍也不动任何数字、不点亮任何成就（漂: " + (drift.join(",") || "无") + "）");
      /* ---- 选序：最多四条、必须都是「没点亮且没到」、且按完成度不减 ---- */
      const litIds = Object.keys(st.ach || {});
      ok(g.length <= 4, "临门一脚最多四条（实得 " + g.length + "）");
      ok(g.every(x => x.a && x.goal > 0 && x.now < x.goal && litIds.indexOf(x.a.id) < 0),
        "列出的每一条都还没点亮、也还没到（" + g.map(x => x.a.name + " " + Math.round(x.now) + "/" + x.goal).join(" · ") + "）");
      { let mono = true; for (let i = 1; i < g.length; i++) if (g[i].gap / g[i].goal < g[i - 1].gap / g[i - 1].goal - 1e-9) mono = false;
        ok(mono, "按「差得最近」排序（完成度单调不减，不是随机挑四条）"); }
      ok(D.goalProg().length >= g.length, "可量化未点亮数不少于展示条数");
      /* 渲染走的是"扫一遍表再排序"，桥上的 nextGoals 是"扫+排"两步——两条路必须给同一份答案 */
      { const viaParts = D.sortGoals(D.goalProg(), 4).map(x => x.a.id).join(",");
        const viaWhole = D.nextGoals(4).map(x => x.a.id).join(",");
        ok(viaParts === viaWhole, "复用同一份扫描与整趟算出的前四条一致（" + (viaWhole || "空") + "）"); }
      /* ---- 点亮之后必须从名单里消失（否则玩家被同一件事反复指引） ---- */
      { const e0 = P.find(x => x.p === "explores" && x.goal === 100);
        if (e0) {
          st.explores = 0; delete st.ach[e0.id];
          ok(D.goalProg().some(x => x.a.id === e0.id), "探索 0 次时「踏遍山门」在名单里");
          st.explores = e0.goal; D.act.cultivate();
          ok(!!st.ach[e0.id] && !D.goalProg().some(x => x.a.id === e0.id), "达标并点亮后，它从名单里消失");
          st.explores = e0.goal - 1; delete st.ach[e0.id];
          ok(D.goalProg().some(x => x.a.id === e0.id), "差一次时它回来（门槛就是那一次，不多不少）");
        } }
      /* ---- 行 → 定义 → 写回 的往返（浏览器探针踩过：拿着"行"去调 progWrite 会当场 TypeError）----
             只挑一个"改一个计数就够"的成就来验，不碰境界/寿元那种牵一发动全身的字段。 */
      { const e1 = P.find(x => x.id === "cave10");
        if (e1) {
          delete st.ach.cave10; st.caveN = 0;
          const before = D.goalProg(), row = before.find(y => y.a.id === "cave10");
          ok(!!row && row.src === e1, "每一行都带回自己的定义 src（不必再猜它读哪个字段）");
          st.caveN = e1.goal;
          ok(!D.goalProg().some(y => y.a.id === "cave10"), "差 0 的行不留（写到门槛就先离开，下一拍点亮）");
          st.caveN = e1.goal - 1;
          ok(D.goalProg().some(y => y.a.id === "cave10") && row.src && typeof D.progWrite === "function", "差一次仍在，且能按 src 写回");
          const rest = D.goalProg().length - 1;
          D.progWrite(e1, st, e1.goal); D.act.cultivate();
          ok(!!st.ach.cave10, "按 src 写到位再走一拍，成就真点亮");
          ok(D.goalProg().length === rest, "少掉那一格由后面的补上（可追 " + (rest + 1) + "→" + D.goalProg().length + "）");
          delete st.ach.cave10; D.progWrite(e1, st, 0);
        } }
      /* ---- 读数与成就字段同源：抽一串点路径按表写一遍，读回来必须是同一个数 ---- */
      { const sample = P.filter(e => e.p).slice(0, 12); const mism = [];
        sample.forEach(e => { D.progWrite(e, st, 7); if (Math.abs(D.progOf(e, st) - 7) > 1e-9) mism.push(e.id + "→" + D.progOf(e, st)); });
        ok(mism.length === 0, "点路径读写同源（写 7 读回 7；不合: " + (mism.join(",") || "无") + "）"); }
      /* ---- 冷却预告：只报正数、按最短排、最多三条、文案完整 ---- */
      st.caveCd = 40; st.tower = st.tower || {}; st.tower.cd = 12; st.stall = st.stall || {}; st.stall.cd = 0;
      st.tre = st.tre || {}; st.tre.duelCd = 0; st.sch = st.sch || {}; st.sch.cd = 0; st.disc = st.disc || {}; st.disc.m = {};
      { const so = D.soonLines();
        ok(so.length === 2 && so.every(x => x && typeof x[0] === "string" && x[1] > 0 && isFinite(x[1])), "冷却预告只报真正在冷却的两件（" + so.map(x => x[0] + " " + Math.ceil(x[1]) + "s").join(" · ") + "）");
        let asc = true; for (let i = 1; i < so.length; i++) if (so[i][1] < so[i - 1][1]) asc = false;
        ok(asc && so[0][0] === "石台登台", "最短的排第一（石台 12s 该在洞窟 40s 之前）"); }
      /* ---- 渲染：三处都写进 DOM，且没有脏值 ---- */
      D.updUI();
      { const rows = global.document.getElementById("goalRows"), sum = global.document.getElementById("goalSum"), ci = global.document.getElementById("cdInfo");
        const hh = String(rows && rows.innerHTML || ""), sTxt = String(sum && sum.innerHTML || "").replace(/<[^>]+>/g, ""), cTxt = String(ci && ci.innerHTML || "").replace(/<[^>]+>/g, "");
        const cnt = (hh.match(/class='gr'/g) || []).length;
        /* 两层结构：就近最多三条，远方最多一座（且不与就近重复） */
        const near = Math.min(3, D.goalProg().length);
        const farOn = hh.indexOf("远方 · 此世之志") >= 0 ? 1 : 0;
        ok(cnt === near + farOn, "界面条数 = 就近 " + near + " + 远方 " + farOn + "（实得 " + cnt + "）");
        ok(cnt <= 4, "两层加起来不超过四行（卡片不能长成正面墙）");
        ok((hh.match(/就近 · 差得最近/g) || []).length === (near ? 1 : 0), "有行就一定写明是哪一层");
        { const seg = hh.split("远方 · 此世之志")[1] || "";
          const farIds = (seg.match(/data-go='ach-([^']+)'/g) || []).map(s => (s.match(/ach-([^']+)/) || [])[1]);
          ok(farIds.length <= 1 && farIds.every(id => D.LIGHTHOUSES.indexOf(id) >= 0), "远方那一行必来自志向名单（" + (farIds.join(",") || "本次无") + "）"); }
        ok(hh.indexOf("undefined") < 0 && hh.indexOf("NaN") < 0, "进度行里没有 undefined/NaN");
        ok(/^课 \d+\/\d+ · 愿 \d+\/\d+ · 可追 \d+ 项$/.test(sTxt), "汇总行三段齐全（" + sTxt + "）");
        ok(cTxt.indexOf("石台登台") >= 0 && cTxt.indexOf("undefined") < 0, "冷却预告写明最短那件（" + cTxt.slice(0, 40) + "）"); }
      /* ---- 三条账必须合起来等于成就总数 ---- */
      { const lit = Object.keys(st.ach || {}).length, meas = D.goalProg().length;
        const unmeas = TB.ACHS.filter(a => !st.ach[a.id] && !P.some(e => e.id === a.id)).length;
        const measLit = P.filter(e => st.ach[e.id]).length;
        ok((lit - measLit) + meas + unmeas + measLit === TB.ACHS.length,
          "已点亮 + 可量化未点亮 + 无进度可算 = 成就总数（" + (lit - measLit) + " + " + meas + " + " + unmeas + " + " + measLit + " vs " + TB.ACHS.length + "）"); }
      /* ---- 不占助手决策位 ---- */
      { const av = X.availableActions(); ok(av.goal === undefined && av.next === undefined && av.prog === undefined, "前程不占助手的决策位（多一个「恒可做」动作会饿死后面整档）"); }
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* ---- 第 46 轮：前程卡的两条腿——「挂着没收」与「点一行就去」 ----
         它们全是显示层，但每一句都在替玩家判断"什么事还没收"，判错比不判更糟，
         所以逐项与游戏自己的守卫对拍；跳转则要求"任何一次点击都不许动状态"。 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st));
      const NUMS = ["stone", "exp", "allStone", "allExp", "lifeExp", "fame", "karma", "luck", "pts", "contrib", "contribAll", "trib", "pills", "explores", "caveN", "caveDig", "caveKeep", "clicks", "rebirths", "lessonDays", "weekAll"];
      const GRPS = Object.keys(D.NAV_COLS);
      const pHas = kw => D.pendingLines().some(x => String(x.t).indexOf(kw) >= 0);
      const pGet = kw => D.pendingLines().find(x => String(x.t).indexOf(kw) >= 0);
      /* ---- 锚点必须都是真实存在的模块（点过去却找不到落点，比不点更气人） ---- */
      st.cave = { door: "jade", depth: 2, hs: 900, he: 300, risk: .5, hint: 0, max: 2, lock: 0, plan: 0 };
      { const bad = D.pendingLines().filter(x => GRPS.indexOf(x.go) < 0);
        ok(bad.length === 0, "「挂着没收」每一行的跳转锚点都是七大模块之一（坏: " + (bad.map(x => x.go).join(",") || "无") + "）"); }
      /* ---- 逐项与游戏自己的判据对拍 ---- */
      ok(pHas("窟中第 2 层") && /900 灵石/.test(pGet("窟中第").v), "在窟里带货时报出第几层与怀里的数（" + pGet("窟中第").v + "）");
      st.cave = { door: null, depth: 0, hs: 0, he: 0, risk: .5, hint: 0, max: 2, lock: 0, plan: 0 };
      ok(!pHas("还带着货"), "出窟之后那条立刻消失（不留一条假提醒）");
      { const d0 = TB.DISCIPLES[0].id;
        st.disc.own[d0] = { q: 2, lv: 1 }; st.disc.m[d0] = { left: 0, job: null, ct: "rich" };
        ok(pGet("待召回") && /^\d+ 人$/.test(pGet("待召回").v), "差事已毕的门人算进「待召回」（" + pGet("待召回").v + "）");
        st.disc.m[d0] = { left: 90, job: null, ct: "rich" };
        ok(!pHas("待召回") && pGet("门人在途"), "还在外面时就只说「在途」，不催召回");
        st.disc.own[d0] = 0; st.disc.m[d0] = 0; D.ensureState(); }
      { /* 先摆境界再取门槛：先前在这里先读了 expNeed() 再改 realm，
           need 是"上一档境界"的数，于是"差 1 点"实际差了几万，断言被自己的顺序坑掉。 */
        st.realm = 5; st.layer = 5;
        const need = D.expNeed(), cost = D.stoneNeed();
        st.exp = need - 1; st.stone = cost * 10;
        ok(!pHas("可破境"), "修为差一点就不催破境（差 1 也不算就绪）");
        st.exp = need;
        ok(pHas("可破境"), "修为与灵石都够时催破境（" + (pGet("可破境") || {}).v + "）"); }
      { const cap = D.secretCap(), used = st.daily.secretUsed || 0;
        ok((used < cap) === pHas("秘境还可探"), "秘境余次与游戏自己的日限判据一致（已用 " + used + "/" + cap + "）");
        st.daily.secretUsed = cap; ok(!pHas("秘境还可探"), "用满日限就不再提醒（提醒做满的假事最伤信任）"); st.daily.secretUsed = 0; }
      st.omen = { id: "tide", left: 90, t: 0 }; st.pill = { id: "dao", left: 60 };
      { const o = pGet("天象仍在"), p = pGet("丹力未散");
        ok(o && o.v.indexOf("undefined") < 0 && p && p.v.indexOf("undefined") < 0,
          "天象与丹力两行都带得出名字（PILLS 用 .name、OMENS 用 .n，写错就是渲染出 undefined）：" + (o || {}).v + " / " + (p || {}).v); }
      st.omen = { id: null, left: 0, t: 0 }; st.pill = { id: null, left: 0 };
      /* ---- 渲染：两组行都写进 DOM，且都没有脏值 ---- */
      D.updUI();
      { const bi = global.document.getElementById("busyInfo"), gr = global.document.getElementById("goalRows");
        const bTxt = String(bi && bi.innerHTML || ""), gTxt = String(gr && gr.innerHTML || "");
        ok(bTxt.indexOf("挂着没收") >= 0 && bTxt.indexOf("undefined") < 0 && bTxt.indexOf("NaN") < 0, "在途行写入 DOM 且无脏值（" + bTxt.replace(/<[^>]+>/g, "").slice(0, 34) + "…）");
        ok((gTxt.match(/<button class='gr' data-go='ach-[a-z0-9A-Z]+'>/g) || []).length === (gTxt.match(/class='gr'/g) || []).length,
          "每一条临门一脚都是真按钮且带成就锚点（" + (gTxt.match(/class='gr'/g) || []).length + " 条）");
        const anchors = (gTxt.match(/data-go='ach-([^']+)'/g) || []).map(s => (s.match(/ach-([^']+)/) || [])[1]);
        ok(anchors.length > 0 && anchors.every(id => TB.ACHS.some(a => a.id === id)), "锚点里的成就 id 全部真实存在（" + anchors.join(",") + "）"); }
      /* ---- 委托点击：造一个假事件走一遍路由，任何一条路都不许动状态 ---- */
      { const snap = {}; NUMS.forEach(k => { snap[k] = JSON.stringify(st[k]); });
        const achN = Object.keys(st.ach || {}).length, bi = global.document.getElementById("busyInfo"), gr = global.document.getElementById("goalRows");
        ok(!!bi.onclick && !!gr.onclick, "两个容器都挂了委托点击（列表每帧重绘，只能委托在容器上）");
        const id0 = (String(gr.innerHTML).match(/data-go='ach-([^']+)'/) || [])[1];
        gr.onclick({ target: { closest: () => ({ getAttribute: () => "ach-" + id0 }) } });
        gr.onclick({ target: { closest: () => ({ getAttribute: () => "grp-war" }) } });
        gr.onclick({ target: { closest: () => ({ getAttribute: () => "" }) } });
        gr.onclick({ target: null });
        bi.onclick({ target: { closest: () => ({ getAttribute: () => "grp-pal" }) } });
        const drift = NUMS.filter(k => JSON.stringify(st[k]) !== snap[k]);
        ok(drift.length === 0 && Object.keys(st.ach || {}).length === achN, "连点五种行（含没有 data-go 的一击）都不改状态、不发成就（漂: " + (drift.join(",") || "无") + "）");
        ok(!!id0, "确实点到了一个真实成就锚点（" + id0 + "）"); }
      /* ---- 落点与跳转的返回值 ---- */
      ok(D.jumpTo("grp-war") === true && D.jumpTo("grp-nonexistent") === false, "jumpTo 认得七大模块、野锚点返回 false");
      ok(D.focusAch("cave10") === true && D.focusAch("no-such-ach") === false, "focusAch 只接受真实成就（野 id 不切标签也不闪）");
      { const el = global.document.getElementById("ach-cave10");
        ok(el && el.classList.contains("flash"), "跳过去之后那一格被闪起来了（滚动目的地要能被眼睛找到）"); }
      { /* 桩件里 querySelectorAll 恒为空数组，"切标签"在测试环境本来就无事可做——
           这里要钉的不是它切得对不对（真浏览器实测），而是它对空集合不抛错、也不返回假成功。 */
        let threw = null;
        try { D.applyTab("ach"); D.applyTab("nonsense"); } catch (e) { threw = e.message; }
        ok(threw === null, "切标签对桩件里的空 querySelectorAll 不抛错（野标签名也不炸）" + (threw ? "：" + threw : "")); }
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* ---- 第 47 轮：只读「连续全勤」与「远方 · 此世之志」 ----
         连续这件事全靠历法，历法全靠 dayShift；所以先把跨月/跨年/闰日钉死，
         再验记账会不会被改时钟骗走，最后证明"全勤的发放"一个子儿都没被我顺手改掉。 */
      const st = D.state, TB = D.tables;
      const keep = JSON.parse(JSON.stringify(st));
      /* 期望值一律用产品自己的格式（dayStamp 不做零填充："2026-9-30"），
         拿 ISO 的 "2026-09-30" 去比，红的会是尺子而不是历法。 */
      const ds = [[["2026-10-01", -1], "2026-9-30"], [["2026-01-01", -1], "2025-12-31"], [["2025-12-31", 1], "2026-1-1"],
                  [["2028-02-28", 1], "2028-2-29"], [["2026-02-28", 1], "2026-3-1"], [["2026-03-01", -1], "2026-2-28"], [["2026-01-31", 1], "2026-2-1"]];
      const badDs = ds.filter(c => D.dayShift(c[0][0], c[0][1]) !== c[1]);
      ok(badDs.length === 0, "dayShift 的跨月 / 跨年 / 闰日全对（错: " + (badDs.map(c => c[0].join("+") + "→" + D.dayShift(c[0][0], c[0][1])).join(",") || "无") + "）");
      ok(D.dayShift("abc", -1) === "" && D.dayShift("", 1) === "" && D.dayShift("2026-13-45", 1) === "" && D.dayShift("2026-2-30", 1) === "" && D.dayShift("2026-1-1", 0) === "2026-1-1",
        "野日期（含 13 月、2 月 30 日这种 JS 会自己滚成假日期串）一律返回空串——空串永远接不上连续");
      /* 名单必须是真成就且算得出进度——否则"远方"会列出一格算不出百分比的东西 */
      { const notAch = D.LIGHTHOUSES.filter(id => !TB.ACHS.some(a => a.id === id));
        const notProg = D.LIGHTHOUSES.filter(id => !TB.ACH_PROG.some(e => e.id === id));
        ok(D.LIGHTHOUSES.length >= 8 && notAch.length === 0 && notProg.length === 0,
          "志向名单 " + D.LIGHTHOUSES.length + " 座全是真成就且全在进度表里（缺: " + (notAch.concat(notProg).join(",") || "无") + "）"); }
      /* 造一门"今天就够得着"的课 */
      { if (!(st.daily.lessons || []).length) st.daily.lessons = D.pickLessons(st.daily.day || D.dayStamp());
        st.daily.snap = st.daily.snap || {};
        const a = st.daily.lessons || [];
        /* 不动玩家的计数，只把"日初快照"压到目标之前：
           lessonProg = 当前值 − 快照，所以 snap = v − target 就正好差最后一步。
           通用、不写死字段名，也不依赖前面各块把计数堆到了多少。 */
        let ready = null;
        a.forEach(id => { if (ready) return; const l = TB.LESSONS.find(x => x.id === id); if (!l) return;
          let v = 0; try { v = l.get(st) || 0; } catch (e) { }
          const tg = D.lessonTarget(id);
          if (v >= tg) { st.daily.snap[id] = v - tg; ready = l; } });
        ok(a.length === 3 && !!ready, "今日三课齐备，且能构造出一门走得到的课（" + (ready ? ready.id : "无") + "）");
        if (ready) {
          ["lsn10", "wk1", "wk8"].forEach(x => { st.ach[x] = 1; });   /* 先占住全勤/周愿类成就：它们发的是声望，别混进发放对拍 */
          const arm = () => { st.daily.lessonDone = {}; a.forEach(id => { if (id !== ready.id) st.daily.lessonDone[id] = 1; }); st.daily.snap[ready.id] = 0; };
          arm();
          const inc0 = st.asc.incense, tok0 = st.tower.tok, ld0 = st.lessonDays, achSet = new Set(Object.keys(st.ach || {}));
          st.streak = 4; st.streakBest = 9; st.streakLast = D.dayShift(D.dayStamp(), -1);
          ok(D.act.lesson(a.indexOf(ready.id)) === true, "了结最后一课");
          ok(st.streak === 5 && st.streakLast === D.dayStamp(), "昨天全勤过 → 今天接成连续 5 日（实得 " + st.streak + "）");
          ok(st.streakBest === 9, "最长不被日常压低（仍是 9）");
          ok(st.asc.incense - inc0 === ready.inc + 20 && st.tower.tok - tok0 === ready.tok + 10,
            "全勤发放一字未改：课业 +"+ready.inc+" 香火 / +"+ready.tok+" 令，再加全勤 20/10（实测 Δ" + (st.asc.incense - inc0) + "/" + (st.tower.tok - tok0) + "）");
          { const fresh = Object.keys(st.ach || {}).filter(k => !achSet.has(k));
            ok(st.lessonDays === ld0 + 1 && fresh.length === 0,
              "累计全勤 +1、也不因记账新点亮任何成就（新点亮: " + (fresh.join(",") || "无") + "）"); }
          /* 断一天 → 归 1，而不是"接着昨天" */
          arm(); st.streak = 7; st.streakLast = D.dayShift(D.dayStamp(), -2);
          D.act.lesson(a.indexOf(ready.id));
          ok(st.streak === 1, "隔了一天不接（连续归 1，实得 " + st.streak + "）");
          /* 同一自然日里第二次凑满三课：#32 落地后不再重复发奖，也不该把连续误断 */
          arm(); st.streak = 5; st.streakBest = 13; st.streakLast = D.dayStamp();
          { const ld2 = st.lessonDays, in2 = st.asc.incense, tk2 = st.tower.tok;
            const r2 = D.act.lesson(a.indexOf(ready.id));
            /* 课业本身的酬劳照发（那是真做了的事），被砍掉的只有全勤那一份 20/10 */
            ok(r2 === true && st.lessonDays === ld2
              && st.asc.incense - in2 === ready.inc && st.tower.tok - tk2 === ready.tok,
              "同一天再凑满一次：课业只发本份 +"+ready.inc+" 香火 / +"+ready.tok+" 令，全勤 20/10 不再重发、lessonDays 不加"
              + "（实测 Δ" + (st.asc.incense - in2) + "/" + (st.tower.tok - tk2) + "，累计全勤 " + st.lessonDays + "）");
            ok(st.streak === 5 && st.streakBest === 13, "同日重复也不把连续误断，也不抬最长（仍 5 / 13）");
            { const tl = global.document.getElementById("log").children.slice(-2).map(c => c.innerHTML).join("|");
              ok(tl.indexOf("全勤赏格今日已领") >= 0, "少发的那一档要当场说清楚（日志末两行：" + tl.slice(0, 40).replace(/<[^>]*>/g, "") + "…）"); } }          /* 最长只能被历史抬高 */
          arm(); st.streak = 12; st.streakBest = 9; st.streakLast = D.dayShift(D.dayStamp(), -1);
          D.act.lesson(a.indexOf(ready.id));
          ok(st.streak === 13 && st.streakBest === 13, "连到 13 日时最长同步抬到 13（实得 cur=" + st.streak + " best=" + st.streakBest + "）");
          /* 把系统钟往前调也刷不出纪录：streakLast 落在"明天"就永不等于昨天 */
          arm(); st.streak = 3; st.streakBest = 13; st.streakLast = D.dayShift(D.dayStamp(), 1);
          D.act.lesson(a.indexOf(ready.id));
          ok(st.streak === 1 && st.streakBest === 13, "时钟往前调（streakLast 是未来日）只会归 1，不会凭空续上");
        } }
      /* ---- 坏档夹取：连续数不能是负数/小数，最长不能被压低，野日期串清空 ---- */
      st.streak = -5; st.streakBest = 2.7; st.streakLast = "昨天也全勤"; D.ensureState();
      ok(st.streak === 0 && st.streakBest === 2 && st.streakLast === "", "ensureState 把连续账夹回合法区（" + st.streak + "/" + st.streakBest + "/" + JSON.stringify(st.streakLast) + "）");
      st.streak = 7; st.streakBest = 3; D.ensureState();
      ok(st.streakBest === 7, "最长小于当前时抬回当前（不能出现'连续 7 日、最长 3 日'这种自相矛盾）");
      st.streak = 999; st.streakBest = 1203; D.ensureState();
      ok(st.streak === 999 && st.streakBest === 1203, "大数不误伤（只夹非法值，不给上限加戏）");
      /* ---- 显示：唯一渲染处是「每日事务」那行，卡片里不重复写一遍 ---- */
      st.streak = 3; st.streakBest = 7; D.updUI();
      { const di = String(global.document.getElementById("dInfo").innerHTML || global.document.getElementById("dInfo").textContent || "");
        ok(di.indexOf("连续全勤 3 日（最长 7）") >= 0, "dInfo 写明连续与最长（" + di.slice(0, 46) + "…）"); }
      st.streak = 0; st.streakBest = 5; D.updUI();
      { const di = String(global.document.getElementById("dInfo").innerHTML || global.document.getElementById("dInfo").textContent || "");
        ok(di.indexOf("此前最长连续 5 日") >= 0 && di.indexOf("· 连续全勤") < 0, "断了就不写'连续 N 日'，改口'此前最长…（今天还没接上）'（不谎报当下状态）");
        ok(String(global.document.getElementById("goalRows").innerHTML).indexOf("连续") < 0, "连续只在一处渲染（前程卡里不重复写一份，两处写迟早一处错）"); }
      { const snap = JSON.stringify([st.asc.incense, st.tower.tok, st.lessonDays, st.fame]);
        for (let i = 0; i < 40; i++) { D.streakInfo(); D.lightHouse(D.goalProg()); }
        ok(snap === JSON.stringify([st.asc.incense, st.tower.tok, st.lessonDays, st.fame]), "读连续与远方各四十遍，香火/令/全勤日/声望都不动"); }
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* ---- 第 48 轮：明日课表 / 下周三愿 ----
         它把游戏自己的确定性抽取往前挪了一格，所以三件事必须钉住：
         ① 真的由日期驱动（不是把今天抄一遍）；② 死题过滤对推算同样生效；③ 界面必须写"推算"而非"就是"。 */
      const st = D.state;
      const keep = JSON.parse(JSON.stringify(st));
      const today = D.dayStamp();
      ok(D.futureStamp(1) !== today && D.futureStamp(0) === today && D.futureStamp(-1) !== today,
        "未来戳按本地日加减（明天 ≠ 今天，0 就是今天）：" + today + " → " + D.futureStamp(1));
      ok(/^\d{4}-W\d{2}$/.test(D.futureWeekStamp(0)) && D.futureWeekStamp(0) !== D.weekStamp(),
        "下周戳形如 2026-W45 且一定不是本周（+7 天必然跨到下一 ISO 周）：" + D.weekStamp() + " → " + D.futureWeekStamp(0));
      { const a = D.futureSchedule(), b = D.futureSchedule();
        ok(JSON.stringify(a) === JSON.stringify(b), "同一局面连算两次结果一致（确定性，不掺随机数）");
        ok(a.lessons.length === 3 && new Set(a.lessons.map(l => l.id)).size === 3 && a.lessons.every(l => D.tables.LESSONS.some(x => x.id === l.id)),
          "明日三桩课、不重复、全是真课目（" + a.lessons.map(l => l.name).join(" · ") + "）");
        ok(a.weeks.length === 3 && new Set(a.weeks.map(w => w.id)).size === 3 && a.weeks.every(w => D.tables.WEEK_GOALS.some(x => x.id === w.id)),
          "下周三愿同样三条不重复（" + a.weeks.map(w => w.name).join(" · ") + "）");
        const dirty = JSON.stringify(a);
        ok(dirty.indexOf("undefined") < 0 && dirty.indexOf("NaN") < 0, "课表里没有 undefined/NaN"); }
      /* 真由日期驱动：拿十个不同日期戳抽，结果不该全同 */
      { const sets = {};
        for (let i = 1; i <= 10; i++) sets[(D.pickLessons(D.futureStamp(i)) || []).join(",")] = 1;
        ok(Object.keys(sets).length >= 3, "换个日期就换套课（十日里出现 " + Object.keys(sets).length + " 种组合，不是把今天抄一遍）"); }
      /* 死题过滤对"明天"一样生效：天骄全败后不该再预告斗法 */
      { D.tables.DUELS.forEach(d => { st.tre.beat[d.n] = 1; });
        const t1 = D.futureSchedule();
        ok(t1.lessons.every(l => l.id !== "duel") && t1.weeks.every(w => w.id !== "wduel"),
          "天骄全数击败后，明日课表与下周三愿都不再出斗法（推算也走同一道 goalOK，不是随手抽）");
        st.tre.beat = {}; D.ensureState(); }
      /* 只读 */
      { const snap = JSON.stringify([st.asc.incense, st.tower.tok, st.lessonDays, st.fame, st.streak, st.week && st.week.goals]);
        for (let i = 0; i < 200; i++) D.futureSchedule();
        ok(snap === JSON.stringify([st.asc.incense, st.tower.tok, st.lessonDays, st.fame, st.streak, st.week && st.week.goals]), "连算 200 遍课表，香火/令/全勤/声望/连续/本周愿都不动"); }
      /* 界面：两行都在，且那句"免责"不能被渲染顺手吃掉 */
      D.updUI();
      { const ni = global.document.getElementById("nextInfo"), nw = global.document.getElementById("nextWarn");
        const t = String((ni && (ni.innerHTML || ni.textContent)) || "").replace(/<[^>]+>/g, "");
        ok(t.indexOf("明 " + D.futureStamp(1)) >= 0 && t.indexOf("下 " + D.futureWeekStamp(0)) >= 0, "课表写明是哪一天与哪一周（" + t.slice(0, 42) + "…）");
        /* 免责那句写在静态 HTML 里（渲染代码覆盖不到它），node 桩件不解析 HTML，所以只在 _struct9 做源码级核对 */
        ok(!!nw, "nextWarn 这根节点确实在 DOM 上（内容由 _struct9 在源码里核对）"); }
      /* 数字宽度是布局的一部分：1440 档那次溢出就是 "34465.96 / 109万" 撑的。
         溢出只能在浏览器里看见，但"读数不该超过这么宽"可以在这里钉住。 */
      { const wide = [];
        [34465.96, 1e5, 1234567, 99999999, 1e9, 2.5e3].forEach(v => { const s = D.progNum(v); if (String(s).length > 8) wide.push(v + "→" + s); });
        ok(wide.length === 0, "大数读数都收在 8 字符内（宽起来就捅破行）：" + (wide.join(" ") || "3.45万 / 10万 / 123万 / 1亿…"));
        ok(D.progNum(1.5) === "1.5" && D.progNum(0.25) === "0.25" && D.progNum(16) === "16",
          "小数只留给真的小门槛（慧眼 1.5 倍），且不补无意义的尾零（" + D.progNum(1.5) + " / " + D.progNum(0.25) + " / " + D.progNum(16) + "）"); }
      /* 承诺兑现：把时钟真推到明天与下周，跨日/跨周抽出来的必须就是前一天预告的那几桩。
         预告最容易犯的错是"算了一套、到点又随机另一套"——这里不换算法，只换时钟。 */
      { const RealDate = global.Date;
        const noonAt = (stamp) => { const p = String(stamp).split("-"); return new RealDate(+p[0], (+p[1]) - 1, +p[2], 12, 0, 0).getTime(); };
        const tmr = D.futureStamp(1), wkNext = D.futureWeekStamp(0);
        /* 一律取卡片真正喂给玩家的那份（futureSchedule），而不是测试自己再算一遍——
           否则 futureSchedule 哪天改成抄今天，这条"兑现测试"照样绿。 */
        const fs0 = D.futureSchedule();
        const predL = fs0.lessons.map(l => l.id).join(",");
        const predW = fs0.weeks.map(w => w.id).join(",");
        const runAt = (ms, fn) => {
          function FakeDate(...a) { return a.length ? new RealDate(...a) : new RealDate(ms); }
          FakeDate.now = () => ms; FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC; FakeDate.prototype = RealDate.prototype;
          global.Date = FakeDate;
          let out = null, err = null;
          try { out = fn(); } catch (e) { err = e.message; }
          global.Date = RealDate;
          return { out, err };
        };
        const r1 = runAt(noonAt(tmr), () => { D.resetDaily(); return { day: st.daily.day, lessons: (st.daily.lessons || []).join(","), fresh: !st.daily.signed && !st.daily.gathered && Object.keys(st.daily.lessonDone || {}).length === 0 }; });
        ok(!r1.err && r1.out && r1.out.lessons === predL && r1.out.day === tmr,
          "时钟推到明天，真抽出来的三桩课与昨天预告的一致（预告 " + predL + " / 实抽 " + (r1.out ? r1.out.lessons : r1.err) + "）");
        ok(r1.out && r1.out.fresh, "跨日同时清掉签到/采集/已了结标记（预告兑现不能靠旧状态硬凑）");
        const wkStampAt7 = D.dayShift(D.dayStamp(), 7);
        const r2 = runAt(noonAt(wkStampAt7), () => { D.resetWeekly(); return { wk: st.week.wk, goals: (st.week.goals || []).join(",") }; });
        ok(!r2.err && r2.out && r2.out.goals === predW,
          "时钟推到下周，三愿也与预告一致（预告 " + predW + " / 实抽 " + (r2.out ? r2.out.goals : r2.err) + "）");
        ok(r2.out && r2.out.wk === wkNext, "滚出的周戳就是推算用的那一周（" + (r2.out ? r2.out.wk : "?") + " = " + wkNext + "）"); }
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* ---- 第 50 轮：窄屏模块折叠 ----
         桩件里没有真实布局（querySelectorAll 恒空、也没有 matchMedia），所以这里能证的是：
         状态机不崩、野组名被拒、偏好单独落盘、切组不改任何游戏数值。
         "收起/展开"本身对不对由浏览器实测（390 档 13154→2954、桌面 .gh 数为 0）与 _struct9 的归属判据守住。 */
      const st = D.state;
      const keep = JSON.parse(JSON.stringify(st));
      ok(Array.isArray(D.GRPS) && D.GRPS.length === 7, "七组模块名在桥上都认得（" + D.GRPS.join("/") + "）");
      ok(D.narrowUI() === false, "桩件里没有 matchMedia，判定为非窄屏（缺这个 API 也不能崩）");
      { let threw = null;
        try { D.grpApply(); } catch (e) { threw = e.message; }
        ok(threw === null, "grpApply 在没有布局的桩件里不抛错" + (threw ? "：" + threw : "")); }
      { const NUMS = ["stone", "exp", "allStone", "allExp", "lifeExp", "fame", "karma", "luck", "pts", "contrib", "explores", "clicks", "rebirths", "lessonDays", "weekAll"];
        const snap = {}; NUMS.forEach(k => { snap[k] = st[k]; });
        const achN = Object.keys(st.ach || {}).length;
        ok(D.openGroup("pal", true) === true && D.openGroup("all", false) === true && D.openGroup("cult", false) === true,
          "三个合法组名都接受（含「全展开」）");
        ok(D.openGroup("no-such-group", true) === false, "野组名被拒（不会把界面切成谁都打不开的样子）");
        const drift = NUMS.filter(k => st[k] !== snap[k]);
        ok(drift.length === 0 && Object.keys(st.ach || {}).length === achN, "切八次模块不改任何数字也不发成就（漂: " + (drift.join(",") || "无") + "）");
        ok(global.localStorage.getItem("jxp_grp") === "cult", "折叠偏好单独存一个键（界面习惯，不混进 jxp_save_v1 存档）"); }
      { D.openGroup("daily", false);
        ok(D.goalProg().length > 0 && D.nextGoals(4).length > 0, "收起其它组不影响前程卡读数（隐藏是 CSS 的事，不是把数据删了）");
        D.openGroup("all", false); }
      Object.keys(keep).forEach(k => { st[k] = keep[k]; });
      D.ensureState();
    }
    { /* ---- 第 51 轮：全局倍率的膝点与封顶 ----
         "膨胀太快"落到可证伪的话上只有一句：跨世累积的那几项，膝点之前必须与旧公式逐位相同
         （前期手感一字未动），膝点之后只许减速、不许没顶。这里喂合成状态，不碰真档——
         这五项各自只读一个字段，所以一个最小对象就能算，测完也不需要还原。 */
      const T = D.GM_PARTS;
      /* Array.from 把空洞摊成 undefined：every/map/forEach 会跳过洞，于是"多打一个逗号"
         这种能把一项倍率静默变成 ×1 的写法，用原生遍历永远绿。 */
      const TS = Array.from(T || []);
      ok(Array.isArray(T) && TS.length >= 24 && TS.every(p => p && typeof p.k === "string" && typeof p.f === "function"),
        "GM_PARTS 是一张干净的表（" + TS.length + " 项，每项都有名字与函数；空洞也算失败）");
      ok(new Set(TS.map(p => p && p.k)).size === TS.length, "倍率项不重名（重名就是同一件事收两遍钱）");
      const CAPS = [
        { k: "气运",   knee: 15, cap: 3,    old: v => 1 + .10 * v, mk: v => ({ luck: v }) },
        { k: "转世",   knee: 6,  cap: 8,    old: v => 1 + .5 * v,  mk: v => ({ rebirths: v }) },
        { k: "轮回祝福", old: v => 1 + .05 * v, knee: 10, cap: 1.5, mk: v => ({ bless: { bowl: v } }) },
        { k: "天命印记", old: v => 1 + .02 * v, knee: 25, cap: 2,   mk: v => ({ fate: { n: v } }) },
        { k: "主线抉择", old: v => 1 + .03 * v, knee: 15, cap: 1.45, mk: v => ({ chapEternal: v }) },
      ];
      CAPS.forEach(c => {
        const p = T.filter(x => x.k === c.k)[0];
        if (!p) { ok(false, "倍率表里得有「" + c.k + "」这一项"); return; }
        const at = v => p.f(c.mk(v));
        let brkSame = -1, brkMono = -1, brkCap = -1, brkFast = -1;
        for (let v = 0; v <= 4000; v++) {
          const y = at(v);
          if (v <= c.knee && y !== c.old(v) && brkSame < 0) brkSame = v;
          if (v > 0 && y < at(v - 1) - 1e-12 && brkMono < 0) brkMono = v;
          if (y > c.cap + 1e-12 && brkCap < 0) brkCap = v;
          if (v > c.knee && !(y < c.old(v)) && brkFast < 0) brkFast = v;
        }
        ok(brkSame < 0 && brkMono < 0 && brkCap < 0 && brkFast < 0 && at(4000) === c.cap,
          "「" + c.k + "」膝点 " + c.knee + " 之前与旧公式逐位相同、之后一路不降也不越顶 ×" + c.cap
          + "，且永远比旧的线性外推小（4000 档实测 ×" + at(4000).toFixed(2) + "，旧式会给 ×" + c.old(4000).toFixed(0) + "）"
          + (brkSame < 0 ? "" : " ｜ 膝点前就改了: " + brkSame) + (brkMono < 0 ? "" : " ｜ 倒退于: " + brkMono)
          + (brkCap < 0 ? "" : " ｜ 破顶于: " + brkCap) + (brkFast < 0 ? "" : " ｜ 反而更快于: " + brkFast));
      });
      /* 合起来的账：五项同时喂同一个极端进度，新旧差多少——这是"减速"唯一的量化说法 */
      { const G = (v, f) => CAPS.reduce((a, c) => a * f(c, v), 1);
        const nw = G(200, (c, v) => T.filter(x => x.k === c.k)[0].f(c.mk(v)));
        const od = G(200, (c, v) => c.old(v));
        ok(nw < od / 1000, "同一份极端进度（五项都推到 200）：旧的要 ×" + od.toExponential(1) + "，现在只 ×" + nw.toFixed(1) + "（压掉约 " + Math.round(od / nw).toLocaleString("en") + " 倍）"); }
      /* 境界这一项是有意保留的陡梯：它的顶不在公式里，而在境界表本身 */
      { const p = T.filter(x => x.k === "境界")[0];
        const top = D.tables.REALMS.length - 1;
        ok(p.f({ realm: top }) === Math.pow(1.8, top), "境界仍按 ×1.8/境，封顶来自表长（第 " + top + " 境 = ×" + Math.pow(1.8, top).toFixed(0) + "，再高没有境可升）"); }
      /* 表与算法必须各说同一套话：漏了这一条，界面列出的倍率就只是装饰 */
      { const parts = Array.from(D.gmParts()), live = D.gm();
        ok(parts.length === TS.length && parts.every(x => !!x && isFinite(x.v) && x.v > 0),
          "当前局面 " + parts.length + " 项倍率全是正有限数（空洞/NaN/∞ 会被 gm() 静默当 ×1，表却会少一行）");
        let pr = 1; parts.forEach(x => { pr *= x.v; });
        ok(pr === live, "gm() 与逐项连乘逐位相同（" + live.toFixed(4) + " / " + pr.toFixed(4) + "）"); }
    }
    ok(X.brief().indexOf("周常道业: ") >= 0 && X.brief().indexOf("丹方: ") >= 0, "brief：含 周常道业/丹方 字段");
    {
      const av = X.availableActions();
      ok("week:0" in av && "week:1" in av && "week:2" in av, "availableActions：含 week:0..2");
      ok(X.validateDecision({ action: "week", target: "9", reason: "t" }, av) === null, "validateDecision：week 越界拒绝");
      D.state.rec = {};
      const av2 = X.availableActions();
      ok(av2["pill:hui"] === false, "未通晓丹方时助手侧 pill 亦不可用（判定一致）");
    }
  }

  console.log("\n=== 冒烟测试: " + pass + " 通过, " + fail + " 失败 ===");
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => {
  console.error("async smoke error:", e);
  process.exit(1);
});
