/* 编译关卡：把 HTML 里每个 <script> 抽出来单独 node --check。
   补丁常常只在字符串里"看起来对"，语法坏了却要到运行时才炸——这一步先把语法钉住。 */
const fs = require("fs"), cp = require("child_process"), path = require("path");
const F = path.join(__dirname, "仙界闭关小能手.html");
const h = fs.readFileSync(F, "utf8");
const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
let m, i = 0, bad = 0, n = 0;
while ((m = re.exec(h))) {
  i++;
  if (/src\s*=/i.test(m[1])) { console.log("#" + i + " 外部脚本，跳过"); continue; }
  n++;
  const tmp = path.join(__dirname, "_chk" + i + ".js");
  fs.writeFileSync(tmp, m[2], "utf8");
  const r = cp.spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
  if (r.status === 0) console.log("#" + i + " 语法 OK（" + m[2].length + " 字符）");
  else {
    bad++;
    console.log("#" + i + " 语法失败:\n" + (r.stderr || "").split("\n").slice(0, 8).join("\n"));
  }
  fs.unlinkSync(tmp);
}
console.log(bad ? "FAIL 编译 " + bad + " 处坏" : "编译通过：" + n + " 段脚本");
process.exit(bad ? 1 : 0);
