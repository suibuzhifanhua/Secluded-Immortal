/* 端到端实跑：真实 Ollama（127.0.0.1:11434）驱动 XLLM 决策 + 剧情生成 */
const fs = require("fs"), path = require("path");
const html = fs.readFileSync(path.join(__dirname, "仙界闭关小能手.html"), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function mkEl() {
  const e = {
    style: {}, dataset: {}, children: [], _cls: new Set(),
    innerHTML: "", textContent: "", disabled: false, onclick: null,
    checked: false, value: "", scrollHeight: 0, scrollTop: 0, clientHeight: 100,
    classList: { add: c => e._cls.add(c), remove: c => e._cls.delete(c), toggle: (c, f) => (f ? e._cls.add(c) : e._cls.delete(c)), contains: c => e._cls.has(c) },
    appendChild(c) { e.children.push(c); return c; },
    removeChild(c) { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); },
    remove() {}, focus() {}, select() {}, addEventListener() {}, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 })
  };
  return e;
}
const els = {};
global.document = {
  getElementById: id => els[id] || (els[id] = mkEl()),
  querySelectorAll: () => [],
  createElement: mkEl, addEventListener() {}, body: mkEl()
};
global.window = { addEventListener() {} };
global.location = { reload() {} };
global.localStorage = { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
let T = 0;
// 只覆写 now，保留 markResourceTiming 等 undici 依赖的方法
Object.defineProperty(global.performance, "now", { value: () => T, configurable: true, writable: true });
const iv = [];
global.setInterval = f => { iv.push(f); return iv.length; };
// setTimeout / clearTimeout 全部保持真实（undici 内部定时器依赖真实句柄）

eval(js);
const X = global.window.__XLLM;
const D = global.window.__DBG;
X.cfg.url = "http://127.0.0.1:11434";
X.cfg.model = "qwen3.6-35b-a3b-uncensored:latest"; // 本机 MoE，速度快，验链路
X.cfg.timeoutMs = 180000;
X.cfg.retries = 1;
// fresh 开局：模拟用户在弹窗里输入名号并确认
els["minput"].value = "苏眉";
els["mok"].onclick();
if (D.state.name !== "苏眉") { console.error("[0] 开局名号未生效: " + D.state.name); process.exit(1); }
console.log("[0] 开局名号确认:", D.state.name, "| brief 首行:", X.brief().split("\n")[0]);
// 抓取发给模型的 system 提示词，验证主角名注入
let lastSys = "";
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (opts && opts.body) {
    try { const b = JSON.parse(opts.body); const sys = (b.messages || []).find(mm => mm.role === "system"); if (sys) lastSys = sys.content; } catch (e) {}
  }
  return realFetch(url, opts);
};
// 给个有内容的局面
D.state.stone = 500; D.state.exp = 200; D.state.bld.field = 1;

(async () => {
  const hc = await X.checkConnection();
  console.log("[1] 健康检查:", hc.ok ? "在线，模型: " + hc.models.join(", ") : "失败 " + hc.error);
  if (!hc.ok) process.exit(1);

  X.cfg.pilotEnabled = true;
  console.time("[2] 自动决策（真实 LLM）");
  await X.pilotCycle();
  console.timeEnd("[2] 自动决策（真实 LLM）");
  console.log("    决策日志:", X.plog.slice(-1)[0].replace(/<[^>]+>/g, ""));
  if (lastSys.indexOf("主角苏眉") < 0) { console.error("FAIL: 决策提示词未注入主角名"); process.exit(1); }
  console.log("    决策提示词已注入主角名（主角苏眉）✓");
  let llmHit = "", warmTps = 0;
  /* 预热：模型被系统换出时，ollama 每次请求都要冷载入（实测 load_duration 76.5s / 总 88s，
     而 ollama.exe 常驻只有 38MB 就说明模型根本没在内存里）。
     那样测到的是操作系统在分页，不是产品的决策链路——所以先把模型叫起来，并把载入耗时如实打出来。 */
  {
    const tw = Date.now();
    try {
      const rw = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: (X.cfg.model || "qwen3.8:latest"), prompt: "ok", stream: false, options: { num_predict: 1 } })
      });
      const jw = await rw.json();
      /* load_duration / eval_duration 单位是纳秒——先前直接标成 "s" 打出过 "冷载入 72220s" 这种荒唐数字；
         而且 num_predict:1 时 eval_duration 会是 0，除出来的 tok/s 就成了 1000000，分类全靠它所以必须换成墙钟实测。 */
      const wall = (Date.now() - tw) / 1000;
      console.log("[2a] 预热：" + wall.toFixed(1) + "s（冷载入 " + Math.round((jw.load_duration || 0) / 1e6) + "ms）");
      /* 稳态吞吐：再问一次，24 个 token，按墙钟算（含载入的那次已经付过学费） */
      const t2 = Date.now();
      const r2 = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: (X.cfg.model || "qwen3.8:latest"), prompt: "数到二十：1 2 3", stream: false, options: { num_predict: 24 } })
      });
      const j2 = await r2.json();
      const wall2 = (Date.now() - t2) / 1000;
      warmTps = (j2.eval_count || 0) / Math.max(0.5, wall2);
      console.log("     稳态实测：" + wall2.toFixed(1) + "s / " + (j2.eval_count || 0) + " token = " + warmTps.toFixed(2) + " tok/s");
    } catch (e) { console.log("[2a] 预热失败（模型不可用，后面的 LLM 落地断言不可信）：" + e.message); }
  }
  /* 慢模型（本机 qwen3.8 实测 21.5s）不该拖住行动节拍：第一拍按规则走，答复落地后由下一拍执行。
     等待窗口必须由自己设的 timeoutMs 推出来——先前写死 75 次 ×2s = 150s，
     而上面把 timeoutMs 设成 180s，等于"给游戏 180 秒耐心、自己 150 秒就判死"；
     机器负载高时（实测一句"说一个字"都要 >90s）就必然假红。文案也一并改成报真实秒数。 */
  const WAIT_MS = Math.max(60000, (X.cfg.timeoutMs || 90000) + 30000);
  const TICK_MS = 2000;
  const ITERS = Math.ceil(WAIT_MS / TICK_MS);
  /* 作废标记必须在轮询里就地抓住：X.plog 是环形缓冲（只留最近若干拍），
     等循环跑完再一次性扫，慢机器上那条"已不适用于此刻局面"早被顶掉了——
     本轮实测就是这样：50s 时尾2拍明明打印过它，210s 后 some() 查不到，于是把"链路其实通了"
     判成 SKIP。链路已被证明就立刻收工，别继续等满窗口。 */
  let stale = false;
  for (let i = 0; i < ITERS && !llmHit && !stale; i++) {
    await X.pilotCycle();
    await new Promise(r => setTimeout(r, TICK_MS));
    const line = X.plog.map(t => String(t).replace(/<[^>]+>/g, "")).find(t => t.indexOf("（LLM）") >= 0) || "";
    if (i % 5 === 4) console.log("    …" + ((i + 1) * TICK_MS / 1000) + "s 状态 " + JSON.stringify(X.llmState) + " | 尾2拍 " + X.plog.slice(-2).map(t => t.replace(/<[^>]+>/g, "")).join(" ⏐ "));
    if (line) llmHit = line;
    if (X.plog.some(t => String(t).indexOf("已不适用于此刻局面") >= 0)) stale = true;
  }
  /* 慢模型期间节拍照走规则；答复回来后要么直接落地，要么因规则已抢先而按当下局面作废——两者都算链路通 */
  console.log("[2b] 后台决策链路:", llmHit ? "LLM 决策已落地 → " + llmHit : (stale ? "LLM 决策已回传，因规则抢先执行而按局面作废（链路通）" : (Math.round(WAIT_MS / 1000)) + "s 内既未落地也无回传"));
  /* 先前的兜底条件是 `|| llmState.note === "在线"`，于是"接口在线、一次决策都没落地"这种最该报警的组合
     反而被算成通过——打印着「未落地」却 exit 0，是比红灯更有害的绿灯。去掉这个逃生门。
     但也不把机器的吞吐当成产品的罪：qwen3.8 是"先想后说"的模型，决策 JSON 排在成百个思考 token 之后，
     吞吐低于 ~3 tok/s 时 180s 预算根本吐不出可见结果（本机此刻实测 <1 tok/s，而它健康时能落地）。
     吞吐不足判 SKIP 并 loudly 标为"未验证"，吞吐正常却不落地才是 FAIL。 */
  const TPS_FLOOR = 3;
  const tooSlow = warmTps <= 0 || warmTps < TPS_FLOOR;
  const SK = [];
  if (!llmHit && !stale) {
    if (tooSlow) { SK.push("LLM 决策"); console.log("   SKIP：本机稳态吞吐 " + warmTps.toFixed(2) + " tok/s（阈值 " + TPS_FLOOR +
      "），思考 token 吃满预算 → **LLM 决策与剧情链路本轮未验证**，这不是通过。"); }
    else { console.error("FAIL: 后台决策链路无迹可走（吞吐 " + warmTps.toFixed(1) + " tok/s 本应在预算内落地）"); process.exit(1); }
  }

  const t3 = Date.now();
  await X.generateStory("event");
  const dt3 = (Date.now() - t3) / 1000;
  console.log("[3] 剧情生成·奇遇：" + dt3.toFixed(1) + "s");
  /* 标着"真实 LLM"却在 0.017ms 内返回，说明它根本没走网络、直接吐了内置佚文——
     那这一步什么都没验证。低于 1 秒就判"未走网络"，并按机器吞吐决定 FAIL 还是 loudly SKIP。 */
  if (dt3 < 1) {
    if (tooSlow) { SK.push("剧情生成"); console.log("   SKIP：本机吞吐不足，剧情链路本轮未验证（不是通过）"); }
    else { console.error("FAIL: 剧情生成 " + dt3.toFixed(3) + "s 返回，未真正走 LLM（回退到了内置佚文）"); process.exit(1); }
  } else console.log("    剧情走了真实模型 ✓");
  if (lastSys.indexOf("主角苏眉") < 0) { console.error("FAIL: 剧情提示词未注入主角名"); process.exit(1); }
  console.log("    剧情提示词已注入主角名（主角苏眉）✓");

  console.log("[4] 主日志最近 4 条:");
  const g = global.document.getElementById("log");
  g.children.slice(-4).forEach(c => console.log("   -", c.innerHTML.replace(/<[^>]+>/g, "").slice(0, 110)));
  /* 收尾一行必须与上面诚实：先前无论 SKIP 几次都印 "E2E OK"，等于把"未验证"洗成"通过"。
     退出码仍留 0——机器吞吐不是产品的罪，但标题不许替它遮。 */
  console.log(SK.length ? "\nE2E 部分通过（" + SK.length + " 项未验证：" + SK.join(" / ") + "）——这不是通过，是本轮没测到" : "\nE2E OK");
  process.exit(0);
})().catch(e => { console.error("e2e fail:", e); process.exit(1); });
