import fs from "fs";
import vm from "vm";

const base = "src/app/js/";
// 模拟浏览器最小环境
const blobSink = [];
global.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts.type; } };
global.URL = { createObjectURL: (b) => "blob:mock-" + blobSink.push(b) };
global.document = { createElement: () => ({ click() {}, set href(v) {}, set download(v) {} }), body: { appendChild() {}, removeChild() {} } };

const sandbox = { window: {}, console, Math, TextEncoder, TextDecoder, Blob: global.Blob, URL: global.URL, document: global.document, setTimeout: (fn) => fn() };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);

for (const f of ["app-content.js", "app-data.js", "app-engine.js", "app-export.js"]) {
  const code = fs.readFileSync(base + f, "utf8");
  vm.runInContext(code, sandbox, { filename: f });
}
const ENG = sandbox.window.QIKE_ENGINE;
const EXP = sandbox.window.QIKE_EXPORT;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " :: " + extra : "")); }
}

const samples = [
  "三年级 分数加减法怎么算？比如 1/4 + 2/4 等于多少？",
  "初二 直角三角形两条直角边是 3 和 4，斜边为什么等于 5？",
  "高一 什么是函数？y = 2x + 1 是函数吗？",
  "初三 化学方程式配平怎么做？",
  "高三 导数的几何意义是什么？怎么求切线方程？",
];
for (const q of samples) {
  const art = ENG.makeLecture(q);
  if (!art) { fail++; console.log("  FAIL makeLecture null: " + q); continue; }
  // toSlides
  const sl = EXP.toSlides(art);
  check("toSlides count>0 [" + art.detected.subject + "]", sl.length >= 6, String(sl.length));
  // collectQA 返回空（讲解无测验）
  const qa = EXP.collectQA(art);
  check("collectQA empty", Array.isArray(qa) && qa.length === 0);
  // buildHTML 不含测验卡片但含课件
  const html = EXP.buildHTML(art, {});
  check("buildHTML ok", html.indexOf("QK_DATA") > 0 && html.length > 6000, String(html.length));
  check("buildHTML no quiz", html.indexOf("互动测验") === -1);
  check("buildHTML keeps title", html.indexOf(art.detected.topic) > 0 || html.indexOf(art.title.replace("讲解 · ", "")) > 0);
  // buildPPTX 能生成 pptx 字节
  const bytes = EXP.buildPPTX(art, sl);
  check("buildPPTX ok", bytes && bytes.length > 20000, String(bytes && bytes.length));
  const head = String.fromCharCode.apply(null, new Uint8Array(bytes.buffer, 0, 4));
  check("buildPPTX zip magic", head === "PK\x03\x04", head);
}
console.log("\nexport chain: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);