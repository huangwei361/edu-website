import fs from "fs";
import vm from "vm";

const base = "src/app/js/";
const sandbox = { window: {}, console, Math };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);

for (const f of ["app-content.js", "app-data.js", "app-engine.js"]) {
  const code = fs.readFileSync(base + f, "utf8");
  vm.runInContext(code, sandbox, { filename: f });
}

const ENG = sandbox.window.QIKE_ENGINE;
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " :: " + extra : "")); }
}

const cases = [
  { q: "三年级 分数加减法怎么算？比如 1/4 + 2/4 等于多少？", sub: "数学", stage: "小学", grade: 3, type: "计算求解" },
  { q: "初一 解方程：3x + 5 = 20，x 等于多少？", sub: "数学", stage: "初中", grade: 7, type: "计算求解" },
  { q: "初二 直角三角形两条直角边是 3 和 4，斜边为什么等于 5？", sub: "数学", stage: "初中", grade: 8, type: "证明推理" },
  { q: "为什么圆的面积等于 πr²？", sub: "数学", stage: "小学", grade: 4, type: "" },
  { q: "高一 什么是函数？y = 2x + 1 是函数吗？", sub: "数学", stage: "高中", grade: 10, type: "概念理解" },
  { q: "小学 古诗《静夜思》怎么背诵记忆？", sub: "语文", stage: "小学", grade: 4, type: "记忆背诵" },
  { q: "初三 化学方程式配平怎么做？", sub: "化学", stage: "初中", grade: 9, type: "" },
  { q: "六年级 语文阅读理解怎么概括中心思想？", sub: "语文", stage: "小学", grade: 6, type: "阅读赏析" },
  { q: "高二 英语一般过去时和现在完成时有什么区别？", sub: "英语", stage: "高中", grade: 11, type: "概念理解" },
  { q: "高三 导数的几何意义是什么？怎么求切线方程？", sub: "数学", stage: "高中", grade: 12, type: "概念理解" },
];

for (const c of cases) {
  const art = ENG.makeLecture(c.q);
  if (!art) { fail++; console.log("  FAIL makeLecture null for: " + c.q); continue; }
  const d = art.detected;
  check("subject[" + c.q.slice(0, 10) + "…]=" + d.subject, d.subject === c.sub, d.subject);
  check("stage=" + d.stageLabel, d.stageLabel === c.stage, d.stageLabel);
  check("grade=" + d.grade, d.grade === c.grade, String(d.grade));
  if (c.type) check("type=" + d.typeName, d.typeName === c.type, d.typeName);
  check("kind=lecture", art.kind === "lecture");
  check("slides>=6", art.slides && art.slides.length >= 6, String(art.slides && art.slides.length));
  check("sections>=6", art.sections && art.sections.length >= 6, String(art.sections && art.sections.length));
  check("objectives=4", art.objectives && art.objectives.length === 4, String(art.objectives && art.objectives.length));
  const hasRaw = art.sections[0].body[0].indexOf(c.q.slice(0, 4)) >= 0;
  check("sections keeps raw", hasRaw);
  const slideStruct = art.slides.every((s) => s.page && s.kicker && s.title && Array.isArray(s.bullets));
  check("slide struct valid", slideStruct);
}

// 空输入与极端输入
check("null on empty", ENG.makeLecture("   ") === null);
check("null on null", ENG.makeLecture(null) === null);
const longA = ENG.makeLecture("七年级 一个长方形的长是 12 厘米，宽比长少 4 厘米，请问这个长方形的面积是多少平方厘米？");
check("long word problem", longA && longA.detected.subject === "数学" && longA.detected.grade === 7);

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);