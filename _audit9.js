/* 第九轮改动落盘审计（临时，跑完即删） */
const fs = require("fs");
const h = fs.readFileSync("仙界闭关小能手.html", "utf8");
const checks = [
  ["GOODS 灵玉", h.includes('base:2000, phase:6')],
  ["ITEMS 延寿丹", h.includes('id:"life", n:"延寿丹"')],
  ["SECT_QUESTS 表", h.includes("const SECT_QUESTS=")],
  ["ACHS evoFox/evoTiger", h.includes('id:"evoFox"') && h.includes('id:"evoTiger"')],
  ["ACHS sq5/sq10", h.includes('id:"sq5"') && h.includes('id:"sq10"')],
  ["ACHS life1/life3/mkt5w/age3000", h.includes('id:"life1"') && h.includes('id:"life3"') && h.includes('id:"mkt5w"') && h.includes('id:"age3000"')],
  ["itm5 含 life", h.includes("(s.itm.life||0)>=5")],
  ["evolveCost", h.includes("function evolveCost()")],
  ["lifeLimitEff", h.includes("function lifeLimitEff()")],
  ["DEF 新字段", h.includes("beast:{lv:0,evo:0}") && h.includes("tiger:{lv:0,evo:0}") && h.includes("sq:{idx:0}") && h.includes("lifeBonus:0") && h.includes("cd:0,")],
  ["DEF itm/mkt", h.includes("itm:{charm:0,pearl:0,heal:0,life:0}") && h.includes("powder:0,jade:0}")],
  ["load 回填", h.includes("S.sq=Object.assign({idx:0},d.sq||{})") && h.includes("S.lifeBonus=d.lifeBonus||0;S.cd=d.cd||0") && h.includes("heal:0,life:0},d.itm||{}") && h.includes("powder:0,jade:0},(d.mkt||{}).hold||{}")],
  ["offline cd 推进", h.includes("S.cd=Math.max(0,(S.cd||0)-dt)")],
  ["gm 进化因子", h.includes(".04*S.beast.lv*(S.beast.evo?1.5:1)") && h.includes(".03*Math.min(S.tiger.lv,TIGER_MAX)*(S.tiger.evo?1.5:1)")],
  ["doExplore 用 S.cd", h.includes("if(S.cd>0)return;") && h.includes("S.cd=2.5;")],
  ["tick 用 S.cd", h.includes("if(S.cd>0)S.cd=Math.max(0,S.cd-dt);") && h.includes("S.cd<=0)doExplore(true)")],
  ["无 exploreCd 残留", !h.includes("exploreCd")],
  ["lifeGain", h.includes("function lifeGain()")],
  ["掉落点 secret/cave", h.includes("if(Math.random()<.3)lifeGain()") && h.includes("if(Math.random()<.25)lifeGain()")],
  ["useItem life 分支", h.includes('else if(id==="life")')],
  ["evolveBeast/claimSectQuest", h.includes("function evolveBeast(which)") && h.includes("function claimSectQuest()")],
  ["转世重置", h.includes("life:0};S.lifeBonus=0;S.cd=0;")],
  ["checkLifespan 有效寿限", h.includes("const lim=lifeLimitEff(),ay=ageYears()")],
  ["ageInfo 延寿显示", h.includes("延寿丹 +\"+S.lifeBonus")],
  ["进化 UI", h.includes('btnEvoF").disabled=!!S.beast.evo') && h.includes('btnEvoT").disabled=!!S.tiger.evo')],
  ["委任 UI", h.includes('setHTML("sqInfo"') && h.includes('btnSq").disabled=S.sq.idx>=SECT_QUESTS.length')],
  ["行囊延寿丹 UI", h.includes('itmLife").textContent=S.itm.life||0') && h.includes("btnLife\").disabled")],
  ["坊市趋势修复", h.includes("const p0=S.mkt.t>=10?goodPrice(g,S.mkt.t-10):p")],
  ["cdTxt 用 S.cd", h.includes('cdTxt").textContent=S.cd>0')],
  ["帮助页 24/25/26", h.includes("【灵兽进化】") && h.includes("【宗门委任务】") && h.includes("【延寿丹】")],
  ["HTML 新 id", h.includes('id="itmLife"') && h.includes('id="btnLife"') && h.includes('id="btnEvoF"') && h.includes('id="btnEvoT"') && h.includes('id="sqInfo"') && h.includes('id="btnSq"') && h.includes('id="mkPrice-jade"') && h.includes('id="mkHold-jade"')],
  ["bind 4 按钮", h.includes('btnEvoF").onclick=()=>evolveBeast("fox")') && h.includes("btnSq\").onclick=claimSectQuest") && h.includes('btnLife").onclick=()=>useItem("life")')],
  ["__DBG 导出", h.includes("cd:()=>S.cd") && h.includes("lifeLimitEff,ageYears,evolveCost") && h.includes("lifeGain,claimSectQuest") && h.includes("SECT_QUESTS:SECT_QUESTS")],
  ["__DBG act", h.includes('evolve:w=>evolveBeast(w||"fox")') && h.includes("sectQuest:claimSectQuest,")],
  ["ACT_SET 20 动作", h.includes("prestige:1,evolve:1,sectQuest:1")],
  ["validate 白名单", h.includes('["pearl","heal","life"].indexOf') && h.includes('if(a==="evolve")') && h.includes('if(a==="sectQuest")')],
  ["availableActions", h.includes('o["evolve:fox"]') && h.includes("o.sectQuest=sqIdx<T.SECT_QUESTS.length") && h.includes("s.itm.life>0)")],
  ["ruleAction", h.includes('evolve:tiger"])return{action:"evolve",target:"tiger"') && h.includes('avail.sectQuest)return{action:"sectQuest"')],
  ["execDecision", h.includes('case "evolve":G.act.evolve(d.target)') && h.includes('case "sectQuest":G.act.sectQuest()')],
  ["brief 新字段", h.includes("宗门委任: ") && h.includes('延寿丹×"+(s.itm.life||0)') && h.includes("九尾进化，+6%")],
  ["AUTOPILOT_SYS", h.includes("evolve 时填 fox/tiger") && h.includes("宗门委任条件达成则领取(sectQuest") && h.includes("buy_jade/sell_jade")]
];
let bad = 0;
for (const [n, okk] of checks) { if (!okk) { bad++; console.log("MISSING: " + n); } }
console.log(bad === 0 ? "全部 " + checks.length + " 类改动均已落盘 OK" : bad + " 项丢失");
const vm = require("vm");
const m = h.match(/<script>([\s\S]*?)<\/script>/);
new vm.Script(m[1]);
console.log("vm 编译 OK, 脚本 len=" + m[1].length);
process.exit(bad > 0 ? 1 : 0);
