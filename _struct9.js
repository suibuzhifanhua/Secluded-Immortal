const fs=require("fs"),path=require("path"),vm=require("vm");
const html=fs.readFileSync(path.join(__dirname,"仙界闭关小能手.html"),"utf8");
let pass=0,fail=0;function ok(c,m){if(c){pass++;console.log("  ok  "+m);}else{fail++;console.log("FAIL  "+m);}}
// 1. vm 编译
const m=html.match(/<script>([\s\S]*?)<\/script>/);
ok(!!m,"存在 <script> 块");
let compiled=false;
try{new vm.Script(m[1]);compiled=true;}catch(e){console.log("   编译错误:",e.message);}
ok(compiled,"vm 编译通过（脚本 len="+m[1].length+"）");
// 2. HTML id 唯一
const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]);
const dup=ids.filter((v,i)=>ids.indexOf(v)!==i);
ok(dup.length===0,"HTML id 无重复（共 "+ids.length+" 个，重复: "+(dup.length?dup.join(","):"无")+"）");
// 3. 括号配平（粗略）
const open=(m[1].match(/{/g)||[]).length, close=(m[1].match(/}/g)||[]).length;
ok(open===close,"花括号配平（{ "+open+" / } "+close+"）");
/* 只作参考计数：本行不做分词，正则字面量与字符串里的括号都会被算进来，
   差值恒定不代表语法有问题——真正的语法判据是上面的 vm 编译。 */
const po=(m[1].match(/\(/g)||[]).length, pc=(m[1].match(/\)/g)||[]).length;
console.log("  ——  圆括号粗计（( "+po+" / ) "+pc+"，含字符串与正则字面量，仅参考）");
// 4. sectquest 动作一致性：XLLM 侧无残留大写 sectQuest 作为 action
const actSet=(m[1].match(/const ACT_SET=\{[^}]*\}/)||[""])[0];
ok(actSet.indexOf("sectquest:1")>=0,"ACT_SET 含 sectquest:1（小写）");
ok(actSet.indexOf("sectQuest")<0,"ACT_SET 无残留大写 sectQuest");
const caseLine=m[1].indexOf('case "sectquest":G.act.sectQuest()');
ok(caseLine>=0,"execDecision case \"sectquest\" 保留 act 键 sectQuest()");
const branchLine=m[1].indexOf('if(a==="sectquest")');
ok(branchLine>=0,"validateDecision 分支 a===\"sectquest\"（小写）");
// 5. 新系统关键串在盘
["function evolveBeast","function claimSectQuest","function lifeGain","const SECT_QUESTS","lifeLimitEff","延寿丹","灵玉","九尾","腾霄"].forEach(s=>{
  ok(m[1].indexOf(s)>=0,"在盘: "+s);
});
// 6. 典籍覆盖率：连续六轮新玩法（道统/三势/鉴宝/深入/罗盘/挂单/赏格/性格）在游戏自己的说明里出现 0 次。
//    读不到说明就等于玩不到——这条关卡把"新增玩法必须同时写说明"变成硬要求。
/* 第 42 轮：说明从"52 行拼接串"改成 HELP 数据表 + helpHTML() 分组渲染。
   关卡必须跟着换目标——抽取式对着老形状匹配的话，条目数会悄悄变 0，绿灯全成假的。
   所以这里既解析新表，也反过来禁止老拼接串复活：同一份说明只许有一个数据源。 */
const helpBlock=(m[1].match(/const HELP=\[[\s\S]*?\n\s*\];/)||[""])[0];
const HELPROWS=(helpBlock.match(/\{s:"[^"]*",t:"[^"]*",b:"[^"]*"\}/g)||[]).map(s=>{
  const p=s.match(/^\{s:"([^"]*)",t:"([^"]*)",b:"([^"]*)"\}$/);
  return p?{cat:p[1],title:p[2],body:p[3]}:null;
}).filter(Boolean);
const help=HELPROWS.map(r=>r.cat+" "+r.title+"："+r.body).join("\n");
ok(HELPROWS.length>=50,"HELP 数据表条目数 = "+HELPROWS.length);
const ENTRY_OLD=/^\s*"\d{1,2}\. 【[^】]+】：.*"\+$/;
const stale=m[1].split("\n").filter(l=>ENTRY_OLD.test(l));
ok(stale.length===0,"没有残留的旧拼接串条目行（残留 "+stale.length+" 行）——一份说明只许一个数据源");
const incomplete=HELPROWS.filter(r=>!r.cat||!r.title||r.body.length<8);
ok(incomplete.length===0,"每条都有主题 / 题名 / 正文（不合 "+incomplete.length+" 条）");
const cats=HELPROWS.map(r=>r.cat);
const uniqCats=[...new Set(cats)];
ok(uniqCats.length>=6,"主题分了 "+uniqCats.length+" 组");
/* 主题必须成段连续，否则目录跳过去会漏掉同组的后半段 */
const runs=cats.filter((c,i)=>i===0||c!==cats[i-1]);
ok(new Set(runs).size===runs.length,"每个主题只出现一段（重复出现的: "+(runs.filter((c,i)=>runs.indexOf(c)!==i).join(",")||"无")+"）");
ok(/function helpHTML\(\)/.test(m[1])&&/\$\("tab-help"\)\.innerHTML=[\s\S]{0,400}helpHTML\(\)/.test(m[1]),"tab-help 确实经 helpHTML() 渲染（改了数据表不会白改）");
const UNDOC=["道统","三势","鉴宝","深入","罗盘","行程","挂单","赏格","性格","预设","存我这套","前程","在途","连续全勤","明日","周常","道课","飞升","天命","洗练","器灵","纪事"]
  .filter(k=>help.indexOf(k)<0);
ok(UNDOC.length===0,"每个机制都在典籍里有一条说明（未写: "+(UNDOC.join(",")||"无")+"）");
/* 第 45 轮加的「前程 · 还差多少」：数据表与渲染必须同时在场。
   只加表不接渲染 = 玩家永远看不到；只加 DOM 不写渲染 = 一屏空白。两头都查。 */
ok(/id="goalRows"/.test(html)&&/setHTML\("goalRows"/.test(m[1]),"前程一节既有 DOM 也由 updUI 写入（改数据表不会白改）");
ok(/id="cdInfo"/.test(html)&&/setHTML\("cdInfo"/.test(m[1]),"冷却预告同样接上渲染");
/* 第 48 轮「明日课表」：DOM/渲染两头要在，且那句免责必须写在静态 HTML 里——
   写在 JS 字符串里就等于"渲染代码哪天不高兴可以顺手删掉"，而它是界面对玩家的承诺。 */
ok(/id="nextInfo"/.test(html)&&/setHTML\("nextInfo"/.test(m[1]),"课表一节 DOM 与渲染两头都在");
ok(/id="nextWarn"[^>]*>[^<]*不带进明天/.test(html),"明日课表的免责条在静态 HTML（写明'按今日推算'与'进度不跨日'）");
/* 前程行的三段必须都允许收缩：1440 档实测被 "34465.96 / 109万" 撑出 31px 溢出，
   写死 min-width 或 flex:0 0 auto 都会让"数字太长"变成"布局捅破面板"。 */
{ const css=(html.match(/<style>([\s\S]*?)<\/style>/)||[,""])[1];
  const gn=css.match(/\.gr \.gn\{[^}]*\}/), gv=css.match(/\.gr \.gv\{[^}]*\}/), gb=css.match(/\.gr \.gb\{[^}]*\}/);
  ok(!!gn&&/min-width:0/.test(gn[0])&&!!gv&&/min-width:0/.test(gv[0])&&!!gb&&/flex:0 1/.test(gb[0]),
    "前程行三段都可收缩（gn/gv min-width:0，gb 允许 shrink）——否则长数字会捅破面板");
/* ---------- 10. 间距令牌的单调性与下限（第 49 轮加）----------
   上一版实测抓到过倒挂：768 的模块间距 8px 比 560 的 10px 还小——因为 :root 用 clamp(8px,1.1vw,12px)
   在 768 只算出 8.45，而 ≤760 的断点把 --gap 写死成 10。屏幕更宽反而更挤，肉眼看不见，量出来才知道。
   这里不看浏览器、只在纸上把 clamp 与断点覆盖一起算出来，要求随宽度单调不减且不低于下限。 */
function clampAt(decl,W){
  const c=decl.match(/clamp\(([^)]*)\)/);
  if(!c){const px=parseFloat(decl);return isNaN(px)?null:px;}
  const parts=c[1].split(",").map(s=>s.trim());
  const ev=(e)=>String(e).split(/\s*\+\s*/).reduce((a,t)=>{const m=String(t).trim().match(/^([\d.]+)(px|vw)$/);return a+(m?(+m[1])*(m[2]==="vw"?W/100:1):0)},0);
  return Math.min(Math.max(ev(parts[0]),ev(parts[1])),ev(parts[2]));
}
  const rootCss=(css.match(/:root\{([\s\S]*?)\}/)||[,"",""])[1];
  const media=(css.match(/@media\(max-width:(\d+)px\)\{[\s\S]*?:root\{([^}]*)\}/g)||[]);
  const over=[];media.forEach(b=>{const w=+(b.match(/max-width:(\d+)px/)||[0,0])[1];const body=(b.match(/:root\{([^}]*)\}/)||[,"",""])[1];over.push([w,body]);});
  /* 先自证看得见断点覆盖：读不到覆盖的"单调判据"是空转的绿灯（本条正则一开始就写成 (760) 而 CSS 是 (760px)，
     于是 over 一直是空数组，倒挂永远查不出——绿色的前提是量具真的在看。） */
  { const withSp=over.filter(o=>/--(gap|pad)/.test(o[1]));
    ok(withSp.length>=1&&withSp.some(o=>o[0]===400),"间距判据真的读到了断点覆盖（读到 "+withSp.map(o=>o[0]).join("/")+"，须含 ≤400 那一档）"); }
  const tokenAt=(name,W)=>{
    for(const [mw,body] of over.sort((a,b)=>b[0]-a[0])){ if(W<=mw){const m=body.match(new RegExp("--"+name+":([^;]*)"));if(m)return clampAt(m[1],W);} }
    const m=rootCss.match(new RegExp("--"+name+":([^;]*)"));return m?clampAt(m[1],W):null;
  };
  const WS=[320,390,400,401,560,760,761,900,1024,1025,1440,1920];
  const FLOOR={gap:11,"gap-s":8,pad:13,"pad-s":11};
  Object.keys(FLOOR).forEach(t=>{
    const vs=WS.map(W=>[W,tokenAt(t,W)]);
    const inv=[];for(let i=1;i<vs.length;i++)if(vs[i][1]<vs[i-1][1]-0.01)inv.push(vs[i-1][0]+"px→"+vs[i-1][1].toFixed(1)+" 却大于 "+vs[i][0]+"px→"+vs[i][1].toFixed(1));
    const low=vs.filter(v=>v[1]<FLOOR[t]).map(v=>v[0]+"px:"+v[1].toFixed(1));
    ok(inv.length===0&&low.length===0,"--"+t+" 随屏幕宽度单调不减、且全程 ≥"+FLOOR[t]+"px（倒挂: "+(inv.join(" / ")||"无")+"；破底: "+(low.join(",")||"无")+"）");
  }); }
/* 第 50 轮：窄屏"一次一个模块"。三条结构判据各防一种"以后一定会犯"的错：
   面板没人认领（手机上永远看不到）、折叠规则泄漏到宽屏（桌面真少面板）、胶囊计数又退回手写。 */
{ const css=(html.match(/<style>([\s\S]*?)<\/style>/)||[,""])[1];
  const body=html.slice(html.indexOf("<body"),html.indexOf("</body>"));
  const owned=[...body.matchAll(/<section data-grp="([a-z]+)" class="panel/g)].map(x=>x[1]);
  const heads=[...body.matchAll(/id="grp-([a-z]+)"/g)].map(x=>x[1]);
  const unknown=[...new Set(owned)].filter(g=>heads.indexOf(g)<0);
  const orphan=heads.filter(g=>owned.indexOf(g)<0);
  ok(owned.length===28&&unknown.length===0&&orphan.length===0,
    "28 个分组面板都有归属、归属也都是真模块标题（野归属: "+(unknown.join(",")||"无")+"；空组: "+(orphan.join(",")||"无")+"；实到 "+owned.length+"）");
  const subHand=(body.match(/<span class="sub">\d+<\/span>/g)||[]).length;
  ok(subHand===0,"模块胶囊的面板数不再手写（由 init 现算，残留手写 "+subHand+" 处）");
  const mb=css.match(/@media\(max-width:(\d+)px\)\{[\s\S]*?\n\}/g)||[];
  const leak=mb.filter(b=>!/max-width:1023px/.test(b)&&/\.gh\{/.test(b));
  const narrow=(mb.filter(b=>/max-width:1023px/.test(b))[0]||"");
  ok(leak.length===0&&/\.gh\{display:none/.test(narrow),"折叠类 .gh 只写在 ≤1023 那一支（泄漏到宽屏会让桌面真少面板；写在别处等于没生效）");
  /* 窄屏副标题的"类型标签"收起类：class 驱动的行为一旦改名就静默失效，所以类名、所在断点、
     以及 HTML 里那一层 <span class="tg"> 都要同时钉住 */
  const b400=(mb.filter(b=>/max-width:400px/.test(b))[0]||"");
  const tgLeak=mb.filter(b=>!/max-width:400px/.test(b)&&/\.tg\{/.test(b));
  const tgTag=(body.match(/<span class="tg">/g)||[]).length;
  ok(tgLeak.length===0&&/h1 small \.tg\{display:none\}/.test(b400)&&tgTag>=1,
    "副标题收起类 .tg 只写在 ≤400 那一支，且 h1 里真有这一层（泄漏 "+tgLeak.length+" 支、标签 "+tgTag+" 处；改名会让 280 档头部白涨一行而无人报错）"); }
const PROGBLOCK=(m[1].match(/const ACH_PROG=\[[\s\S]*?\n\];/)||[""])[0];
const PROGN=(PROGBLOCK.match(/\{id:"/g)||[]).length;
ok(PROGN>=60,"ACH_PROG 数据表在盘且有 "+PROGN+" 条（条目数掉下来说明表被截断）");
console.log("\n=== 结构校验: "+pass+" 通过, "+fail+" 失败 ===");
process.exit(fail>0?1:0);
