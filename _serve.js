/* _serve.js —— 只监听 127.0.0.1 的临时静态服务器，用于同源 iframe 多宽度自适应审计。
   file:// 源的 iframe 拿不到 contentWindow（Chrome 把每个 file 当不透明源），
   而媒体查询必须靠"真视口"才作数，所以起一个本地 http 源来嵌自己。用完即停。 */
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = __dirname;
const PORT = parseInt(process.argv[2] || "8765", 10);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json; charset=utf-8" };
const srv = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split("?")[0]); } catch (e) { res.writeHead(400).end(); return; }
  if (p === "/") p = "/仙界闭关小能手.html";
  const f = path.resolve(ROOT, "." + p);
  /* 只在 ROOT 之内：..%2F 之类的越界路径一律拒 */
  if (f !== ROOT && !f.startsWith(ROOT + path.sep)) { res.writeHead(403).end("403"); return; }
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404).end("404"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(buf);
  });
});
srv.listen(PORT, "127.0.0.1", () => console.log("LISTENING http://127.0.0.1:" + PORT + "/"));
