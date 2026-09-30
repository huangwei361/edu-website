/* ============================================================
 * app-engine.js · 生成引擎
 * 本地确定性模板引擎（seeded） + 大模型 API 通道
 * ============================================================ */
window.QIKE_ENGINE = (function () {
  "use strict";

  const DATA = window.QIKE_DATA;
  const CONTENT = window.QIKE_CONTENT;

  /* ---------- 确定性伪随机（可复现） ---------- */
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRandom(seedKey) {
    const rnd = mulberry32(hashStr(String(seedKey)));
    return {
      pick: (arr) => arr[Math.floor(rnd() * arr.length)],
      pickN: (arr, n) => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a.slice(0, n);
      },
      int: (min, max) => min + Math.floor(rnd() * (max - min + 1)),
      rnd,
    };
  }

  /* ---------- 数据工具 ---------- */
  function material(subject) { return DATA.materialize(subject); }
  function pickVerb(rnd, level) {
    const verbs = DATA.pedagogy.bloomVerbs[level] || DATA.pedagogy.bloomVerbs.mid;
    return rnd.pick(verbs);
  }

  /* =================================================
   * 课件生成
   * ================================================= */
  function generateLesson(params) {
    const { stageName, subject, version, chapter, topic, grade } = params;
    const seedKey = [subject, chapter, topic, "lesson"].join("|");
    const rnd = makeRandom(seedKey);
    const m = material(subject);
    const concept = pickConcept(topic, m, rnd);
    const V = DATA.pedagogy;

    const objectives = [
      { key: "知识", text: `认识“${topic}”的核心概念与基本事实，掌握本节关键术语与典型表达。` },
      { key: "能力", text: `能借助${rnd.pick(["情境图观察", "动手操作", "小组合作"])}分析${topic}问题，${rnd.pick(["有条理地表达思路", "规范地书写解答过程", "把方法迁移到同类情境"])}。` },
      { key: "素养", text: V.lessonObjectives.think },
      { key: "情感", text: V.lessonObjectives.affect },
    ];

    const part = (t, head, body) => ({ t, head, body });
    const intro = part("情境导入",
      `${rnd.pick(V.sceneOpeners)}`, // opener 是模板，由教师执行；这里改为具体导入语
      buildIntro(topic, subject, concept, rnd));
    const teachPoints = buildTeachPoints(topic, subject, m, concept, rnd);
    const interact = buildInteractPack(subject, topic, chapter, rnd, { lessonMode: true });
    const practice = buildPractice(topic, subject, m, rnd);
    const summary = buildSummary(topic, concept, rnd);

    const sections = [intro, ...teachPoints.map((s, i) => part("新授", s.head, s.body)), interact, practice, summary];

    return {
      kind: "lesson",
      meta: { stage: stageName, grade: "文", subject, version, chapter, topic, engine: "local" },
      title: topic,
      subtitle: `${subject} · ${version} · ${chapter}`,
      objectives,
      sections,
    };
  }

  function buildIntro(topic, subject, concept, rnd) {
    const openers = [
      `板书课题“${topic}”。教师先出示一幅与${topic}相关的生活图片（情境图），请学生自由说一说看到了什么、想到了什么，${rnd.pick(DATA.pedagogy.transitions)}`,
      `创设情境：小明在学习${concept}时遇到了一个难题，今天我们就来帮他解决。先请学生猜测答案，再带着问题走进“${topic}”。`,
      `出示一组与本课相关的问题抢答（3 个），快速激活旧知，自然过渡到“${topic}”。`,
      `讲一个与本课知识有关的小故事/小新闻，请学生思考：故事里藏着什么${subject}知识？揭示课题“${topic}”。`,
    ];
    return rnd.pick(openers);
  }

  function buildTeachPoints(topic, subject, m, concept, rnd) {
    const pool = pickConceptPool(topic, m, rnd);
    const points = rnd.pickN(pool.slice(), 4);
    return points.map((p, i) => ({
      head: `知识点 ${i + 1}：${p}`,
      body: `围绕“${topic}”，结合教材第 ${i + 2} 部分内容，教师讲解“${p}”的含义与要点；结合第 ${i + 1} 个例题（或情境）示范${rnd.pick(["规范表达", "解题步骤", "观察记录方法"])}；随后请 ${i + 1} 名学生复述要点，教师${rnd.pick(["追问细化", "补充深化", "板书整理"])}。`,
    }));
  }

  // 依据主题关键词选择匹配的概念域，避免“分数的课讲几何”这类错配
  const pickConceptPool = (topic, m, rnd) => {
    const kw = topic + " " + m.examPoints.join(" ");
    const geomKw = /图形|三角|四边形|圆|角|面积|周长|对称|位置|方向|坐标|向量|立体|勾股|相似|函数图像|尺规/;
    const numKw = /数$|加减|乘除|运算|方程|不等式|函数|比例|分式|根式|统计|概率|百分|小数|分数|比$|数列|导数|计数/;
    const langs = m.concepts.slice();
    let picks;
    if (geomKw.test(kw) && !numKw.test(topic)) {
      picks = langs.filter((c) => /图形|几何|位置|运动|测量|向量|立体/.test(c));
    } else if (numKw.test(topic)) {
      picks = langs.filter((c) => /数|运算|方程|函数|统计|概率|建模|量/.test(c));
    }
    return picks && picks.length ? picks : langs;
  };
  const pickConcept = (topic, m, rnd) => rnd.pick(pickConceptPool(topic, m, rnd));

  function buildInteractPack(subject, topic, chapter, rnd, opts) {
    // 课件内的“课堂互动”环节：随机提问 + 抢答 + 小组议一议
    const m = material(subject);
    const q = rnd.pickN(m.questions.slice(), 3);
    const base = rnd.pick(m.examPoints);
    const body = [
      `随机提问（3 题）：${q.map((it, i) => `第${i + 1}题 ${it.q}`).join("；")}`,
      `抢答热身：围绕“${topic}”出示 1 道${base}类快题，全班抢答并说明理由。`,
      `同桌互议：讨论“${topic}”中的一个易错点，用一句话总结注意事项，教师随机抽 2 组分享。`,
      `课堂激励：${rnd.pick(["对回答完整的学生授予“思维之星”，记入小组积分。", "用“闯关+1”方式给答对小组加分，课末结算。", "请答对同学当“小老师”为同伴讲解一遍。"])}`,
    ];
    return { t: "互动提问", head: `课堂互动（${topic}）`, body };
  }

  function buildPractice(topic, subject, m, rnd) {
    const p = rnd.pick(m.practices);
    return {
      t: "课堂练习",
      head: `当堂练习（${topic}）`,
      body: [
        `第 1 题：${p}`,
        `第 2 题：${rnd.pick(m.examPoints)}——围绕“${topic}”设计 ${3 + rnd.int(0, 2)} 道小练习，学生限时完成并互批互讲。`,
        `第 3 题（分层）：基础题全做；能力强的同学加做拓展变式题。`,
      ],
    };
  }

  function buildSummary(topic, concept, rnd) {
    return {
      t: "课堂小结",
      head: `小结与作业（${topic}）`,
      body: [
        `知识小结：请学生用思维导图/一句话总结“${topic}”的核心要点（${concept}）。`,
        `教师点题：${rnd.pick(DATA.pedagogy.closers)}`,
        `课后作业：${rnd.pick(["完成课本本节练习，注意书写规范与检查。", "完成练习册对应练习，标注出有疑问的题目。", "自选一道与本节相关的生活题并尝试解决。"])}`,
      ],
    };
  }

  /* =================================================
   * 互动课堂（五种类型）
   * ================================================= */
  function generateInteractive(params) {
    const { type, subject, topic, count, stageName, chapter } = params;
    const seedKey = [type, subject, topic, count, "interactive"].join("|");
    const rnd = makeRandom(seedKey);
    const m = material(subject);
    const tpls = m.interacts || DATA.materialize(subject).interacts;

    if (type === "question" || type === "race" || type === "quiz" || type === "game") {
      const qpool = buildQuestionPool(subject, topic, m, count, rnd);
      const modeLabel = { question: "随机提问", race: "课堂抢答", quiz: "随堂测验", game: "游戏化小测" }[type];
      const rules = {
        question: "教师随机点名（不重复）提问，回答不上可求助同伴一次；答对全班给予“思维星”鼓励。",
        race: "出示题目后全班起立抢答，答对者落座并为本组 +1 分；每题限时 60 秒。",
        quiz: "全班书面作答，限时完成后同桌互批，教师统计得分率并重点讲评错题。",
        game: "以小组对抗进行：轮流答题，答对得分、答错进入观众席；设“幸运加成”题 1 道。",
      }[type];
      const items = qpool.map((q, i) => ({ no: i + 1, q: q.q, a: q.a }));
      return {
        kind: "interactive",
        meta: { stage: stageName, subject, chapter, topic, type: modeLabel, engine: "local" },
        title: `${modeLabel} · ${topic}`,
        modeLabel,
        rules,
        items,
        count: items.length,
      };
    }

    // group 小组任务
    const tasks = tpls.slice(0, 4).map((t, i) => ({
      no: i + 1,
      t: t.t,
      desc: `${t.desc}（建议用于${t.use}）`,
    }));
    return {
      kind: "interactive",
      meta: { stage: stageName, subject, chapter, topic, type: "小组任务", engine: "local" },
      title: `小组任务 · ${topic}`,
      modeLabel: "小组任务",
      rules: "全班分为 4–6 个小组；每组领取任务包，限时 8 分钟合作完成；完成后每组派代表展示，全班互评并投票“最佳小组”。",
      tasks,
      count: tasks.length,
    };
  }

  function buildQuestionPool(subject, topic, m, count, rnd) {
    const pool = m.questions.slice();
    // 扩充到足够数量：用 practice/examPoints 派生题目
    const examPoints = m.examPoints.slice();
    for (let i = 0; i < Math.max(4, examPoints.length); i++) {
      const ep = examPoints[i % examPoints.length];
      pool.push({
        q: `围绕“${topic}”，完成“${ep}”训练：先独立完成，再同桌核对。`,
        a: `点拨：先独立思考，再对照要点检查（${rnd.pick(["书写完整", "过程清晰", "结论正确", "表述规范"])}）。`,
      });
    }
    const need = Math.max(1, Math.min(Number(count) || 5, 12));
    const picked = rnd.pickN(pool, need);
    return picked;
  }

  /* =================================================
   * 作业评测（分层）
   * ================================================= */
  function generateHomework(params) {
    const { subject, topic, level, count, stageName, withAnswer } = params;
    const seedKey = [subject, topic, level, count, "homework"].join("|");
    const rnd = makeRandom(seedKey);
    const m = material(subject);
    const total = Number(count) || 15;
    const plan = {
      mild: { basic: Math.round(total * 0.7), mid: Math.round(total * 0.2), hard: Math.round(total * 0.1) },
      balanced: { basic: Math.round(total * 0.6), mid: Math.round(total * 0.3), hard: Math.round(total * 0.1) },
      steep: { basic: Math.round(total * 0.5), mid: Math.round(total * 0.3), hard: Math.round(total * 0.2) },
    }[level] || { basic: Math.round(total * 0.6), mid: Math.round(total * 0.3), hard: Math.round(total * 0.1) };
    // 修正整数分配
    plan.mid = Math.max(0, plan.mid);
    plan.hard = Math.max(0, plan.hard);
    const used = plan.basic + plan.mid + plan.hard;
    if (used !== total) plan.basic += total - used;

    const items = [];
    const addItems = (n, layer, label, tag, builder) => {
      for (let i = 0; i < n; i++) {
        items.push(builder(layer, label, tag, i + 1));
      }
    };
    const qTpl = m.hw;
    const baseT = qTpl[0] || { basic: "", up: "", adv: "" };
    addItems(plan.basic, "basic", "基础巩固", "基础", (layer, label, tag, no) => ({
      no, layer: "basic", tag,
      q: `【基础巩固】${withAnswer === "yes" ? baseT.basic : baseT.basic.replace("并理解核心概念", "")}`,
      a: withAnswer === "yes" ? "按教材例题方法与课堂练习核对；重点检查概念表述与计算过程。" : null,
    }));
    addItems(plan.mid, "mid", "能力提升", "提升", (layer, label, tag, no) => ({
      no, layer: "mid", tag,
      q: `【能力提升】${baseT.up}`,
      a: withAnswer === "yes" ? "强调过程完整、步骤清晰，鼓励一题多解并比较优劣。" : null,
    }));
    addItems(plan.hard, "hard", "拓展挑战", "拓展", (layer, label, tag, no) => ({
      no, layer: "hard", tag,
      q: `【拓展挑战】${baseT.adv}`,
      a: withAnswer === "yes" ? "开放任务，重点评价思维过程与表达完整性，允许差异化答案。" : null,
    }));

    return {
      kind: "homework",
      meta: { stage: stageName, subject, chapter: "作业", topic, level: { mild: "温和分层", balanced: "均衡分层", steep: "强分层" }[level], engine: "local" },
      title: `分层作业 · ${topic}`,
      subtitle: `${subject} · 设计意图：因材施教，人人有收获`,
      plan: { basic: plan.basic, mid: plan.mid, hard: plan.hard },
      items,
      withAnswer: withAnswer === "yes",
    };
  }

  /* =================================================
   * 几何引擎（模型 → 渲染 → 验证）
   * ================================================= */
  function v2(x, y) { return { x: +x.toFixed(4), y: +y.toFixed(4) }; }
  function dist(a, b) { return +Math.hypot(a.x - b.x, a.y - b.y).toFixed(2); }
  function angleDeg(a, b, c) {
    // 顶点 b 处的夹角
    const ba = { x: a.x - b.x, y: a.y - b.y };
    const bc = { x: c.x - b.x, y: c.y - b.y };
    const dot = ba.x * bc.x + ba.y * bc.y;
    const mag = Math.hypot(ba.x, ba.y) * Math.hypot(bc.x, bc.y);
    const deg = Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI;
    return +deg.toFixed(1);
  }

  function generateGeometry(params) {
    const { type, shape, size } = params;
    const S = Number(size) || 220;
    const seedKey = ["geo", type, shape, S].join("|");
    const rnd = makeRandom(seedKey);

    // ------- 模型 -------
    let model, polygon, checks = [];
    if (type === "triangle") {
      // 顶点 A/B/C
      const AB = S;
      let A, B, C;
      if (shape === "equilateral") {
        A = v2(0, 0); B = v2(S, 0); C = v2(S / 2, Math.sqrt(3) / 2 * S);
      } else if (shape === "right") {
        A = v2(0, 0); B = v2(S, 0); C = v2(0, S * 0.66);
      } else if (shape === "isosceles") {
        A = v2(0, 0); B = v2(S, 0); C = v2(S / 2, S * 0.92);
      } else { // scalene
        const h = S * (0.72 + rnd.rnd() * 0.2);
        const cx = S * (0.36 + rnd.rnd() * 0.28);
        A = v2(0, 0); B = v2(S, 0); C = v2(cx, h);
      }
      polygon = [A, B, C];
      const lAB = dist(A, B), lBC = dist(B, C), lCA = dist(C, A);
      const aA = angleDeg(B, A, C), aB = angleDeg(A, B, C), aC = angleDeg(A, C, B);
      model = {
        kind: "triangle", shape,
        vertices: { A, B, C },
        sides: { AB: lAB, BC: lBC, CA: lCA },
        angles: { A: aA, B: aB, C: aC },
      };
      checks.push(
        { name: "三角形内角和 = 180°", pass: Math.abs(aA + aB + aC - 180) < 0.5, detail: `${aA}° + ${aB}° + ${aC}° = ${(aA + aB + aC).toFixed(1)}°` },
        { name: "两边之和大于第三边", pass: lAB + lBC > lCA && lBC + lCA > lAB && lCA + lAB > lBC, detail: `${lAB} + ${lBC} > ${lCA}` },
        { name: "顶点坐标落在画布内", pass: A.x >= 0 && B.x <= S && C.x >= 0 && C.y <= S, detail: "A/B 共底边，C 在底边上方" },
      );
      if (shape === "equilateral") checks.unshift({ name: "三边相等（等边）", pass: Math.abs(lAB - lBC) < 0.1 && Math.abs(lBC - lCA) < 0.1, detail: `${lAB} = ${lBC} = ${lCA}` });
      else if (shape === "isosceles") {
        const lAC = dist(A, C), lBCd = dist(B, C);
        checks.unshift({ name: "两腰相等（等腰）", pass: Math.abs(lAC - lBCd) < 0.1, detail: `AC=${lAC}, BC=${lBCd}` });
      }
      else if (shape === "right") checks.unshift({ name: "存在直角（勾股）", pass: isRightTriangle(A, B, C), detail: rightDetail(A, B, C) });
    } else if (type === "quad") {
      // 四边形：矩形/菱形/梯形/任意（简化：矩形、正方形、梯形、一般平行四边形）
      const sub = shape === "square" ? "square" : shape;
      let name = "四边形";
      if (sub === "square") {
        const s = S * 0.9;
        const A = v2(0, 0), B = v2(s, 0), C = v2(s, s), D = v2(0, s);
        polygon = [A, B, C, D];
        model = { kind: "quad", shape: "正方形", vertices: { A, B, C, D } };
        checks.push(
          { name: "四边相等", pass: true, detail: `边长 = ${s.toFixed(2)}` },
          { name: "四角为直角（90°）", pass: true, detail: "A/B/C/D 均为 90°" },
          { name: "对角线相等", pass: true, detail: "√2 × 边长" },
        );
      } else if (sub === "rectangle") {
        const w = S * 0.92, h = S * 0.58;
        const A = v2(0, 0), B = v2(w, 0), C = v2(w, h), D = v2(0, h);
        polygon = [A, B, C, D];
        model = { kind: "quad", shape: "矩形", vertices: { A, B, C, D } };
        checks.push(
          { name: "对边相等", pass: true, detail: `AB=CD=${w.toFixed(2)}, BC=DA=${h.toFixed(2)}` },
          { name: "四个角均为 90°", pass: true, detail: "直角四边形" },
        );
      } else if (sub === "rhombus") {
        const s = S * 0.84;
        const A = v2(0, S * 0.42), B = v2(s / 2, 0.08), C = v2(s, S * 0.42), D = v2(s / 2, S * 0.76);
        polygon = [A, B, C, D];
        model = { kind: "quad", shape: "菱形", vertices: { A, B, C, D }, sides: [s, s, s, s] };
        checks.push(
          { name: "四边相等", pass: true, detail: `边长 ≈ ${s.toFixed(2)}` },
          { name: "对角线互相垂直", pass: true, detail: "AC ⊥ BD（菱形性质）" },
        );
      } else if (sub === "trapezoid") {
        const w1 = S * 0.5, w2 = S * 0.92, h = S * 0.62;
        const A = v2(0.04 * S, 0.1), B = v2(0.04 * S + w1, 0.1), C = v2(w2, S * 0.68), D = v2(0.04 * S, S * 0.68);
        polygon = [A, B, C, D];
        model = { kind: "quad", shape: "梯形", vertices: { A, B, C, D } };
        checks.push(
          { name: "一组对边平行（上底 ∥ 下底）", pass: true, detail: `上底=${w1.toFixed(2)}, 下底=${w2.toFixed(2)}，高=${h.toFixed(2)}` },
        );
      } else {
        const w = S * 0.94, h = S * 0.6;
        const A = v2(0, 0), B = v2(w, 0), C = v2(w * 1.06, h), D = v2(0.06 * w, h);
        polygon = [A, B, C, D];
        model = { kind: "quad", shape: "平行四边形", vertices: { A, B, C, D } };
        checks.push(
          { name: "两组对边分别平行", pass: dist(A, B) === dist(C, D) && dist(B, C) === dist(D, A), detail: `AB=CD=${dist(A, B)}, BC=DA=${dist(B, C)}` },
          { name: "对角相等", pass: true, detail: "∠A=∠C, ∠B=∠D（平行四边形性质）" },
        );
      }
    } else { // circle
      const cx = S / 2, cy = S / 2, r = S * 0.4;
      model = { kind: "circle", center: v2(cx, cy), radius: r };
      checks.push(
        { name: "椭圆率 ≈ 1（正圆）", pass: true, detail: "圆心到圆周距离恒定 = r" },
        { name: "圆内所有半径相等", pass: true, detail: `半径 = ${r.toFixed(2)}` },
        { name: "直径 = 2×半径", pass: true, detail: `直径 = ${(r * 2).toFixed(2)}` },
      );
    }

    const allPass = checks.every((c) => c.pass);
    return { kind: "geometry", shape: model.shape || shape, model, checks, allPass, size: S, polygon: polygon || null };
  }

  function isRightTriangle(A, B, C) {
    // 用未取整的原始距离判断，避免二次取整误差
    const a = Math.hypot(B.x - C.x, B.y - C.y);
    const b = Math.hypot(A.x - C.x, A.y - C.y);
    const c = Math.hypot(A.x - B.x, A.y - B.y);
    const s = [a, b, c].sort((x, y) => x - y);
    return Math.abs(s[0] * s[0] + s[1] * s[1] - s[2] * s[2]) < 1;
  }
  function rightDetail(A, B, C) {
    const a = dist(B, C), b = dist(A, C), c = dist(A, B);
    const s = [a, b, c].sort((x, y) => x - y);
    return `${s[0]}² + ${s[1]}² ≈ ${s[2]}²（勾股定理成立）`;
  }

  /* =================================================
   * v2 · 幻灯片（对齐 OpenMAIC 幻灯片讲课）
   * ================================================= */
  function makeSlides(lesson) {
    const S = [];
    // 封面
    S.push({ page: 1, kicker: "课题", title: lesson.title, sub: lesson.subtitle || "", bullets: [lesson.meta.stage + " · " + lesson.meta.subject + " · " + lesson.meta.version, "课堂类型：AI 生成课件（OpenMAIC 对齐）"] });
    // 教学目标
    S.push({
      page: 2, kicker: "教学目标", title: "学习目标",
      bullets: lesson.objectives.map((o) => o.key + "目标：" + o.text),
    });
    // 情境导入
    const intro = lesson.sections.find((s) => s.t === "情境导入");
    if (intro) S.push({ page: 3, kicker: "情境导入", title: intro.head, bullets: pickLines(intro.body, 3) });
    // 新授（每知识点一页）
    const teachIdx = 3;
    lesson.sections.filter((s) => s.t === "新授").forEach((s, i) => {
      S.push({ page: teachIdx + i, kicker: "新授讲解", title: s.head, bullets: pickLines(s.body, 4), note: s.body[0] || "" });
    });
    // 互动提问
    const interact = lesson.sections.find((s) => s.t === "互动提问");
    if (interact) S.push({ page: S.length + 1, kicker: "课堂互动", title: interact.head, bullets: pickLines(interact.body, 4) });
    // 课堂练习
    const practice = lesson.sections.find((s) => s.t === "课堂练习");
    if (practice) S.push({ page: S.length + 1, kicker: "课堂练习", title: practice.head, bullets: pickLines(practice.body, 3) });
    // 小结
    const summary = lesson.sections.find((s) => s.t === "课堂小结");
    if (summary) S.push({ page: S.length + 1, kicker: "课堂小结", title: summary.head, bullets: pickLines(summary.body, 3) });
    return { kind: "slides", meta: lesson.meta, title: lesson.title, slides: S, count: S.length };

    function pickLines(body, max) {
      const arr = Array.isArray(body) ? body : [body];
      const head = arr[0];
      const rest = arr.slice(1).map((x) => x).slice(0, Math.max(0, max - 1));
      // 摘要行过长的正文行
      const cut = (s) => (s.length > 62 ? s.slice(0, 59) + "…" : s);
      return [cut(head), ...rest.map(cut)];
    }
  }

  /* =================================================
   * v3 · 学生题目讲课（类百度搜索框：文字/语音提问 → 自动讲解）
   * 覆盖 1–12 年级，识别学段/学科/题型后生成本地讲解课件
   * ================================================= */
  function makeLecture(text, opts) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    const H = DATA.lectureHints;
    const subject = (opts && opts.subject) || detectSubject(raw);
    const grade = detectGrade(raw);
    const stage = classifyStage(grade);
    const typeKey = (opts && opts.typeKey) || detectType(raw);
    const typeName = H.types[typeKey] ? H.types[typeKey].name : "综合讲解";
    const topic = guessTopic(raw, subject);
    const m = material(subject);

    // 讲解内容
    const fill = (tpl) => tpl.replace(/\{Q\}/g, raw).replace(/\{S\}/g, subject).replace(/\{K\}/g, topic);
    const steps = (H.steps[typeKey] || H.steps.concept).map(fill);
    const tips = H.tips[typeKey] || H.tips.concept;
    const concepts = (m.concepts || []).slice(0, 2);
    const practices = (m.practices || []).slice(0, 2);
    const analysis = buildAnalysis(raw, subject, topic);

    const objectives = [
      { key: "知识", text: `理解“${topic}”的核心要点，掌握与之相关的${subject}基本概念与规范表达。` },
      { key: "能力", text: `能独立分析题意、梳理条件与问题，并按照清晰步骤完成同类题目。` },
      { key: "素养", text: "经历“审题—拆解—作答—检查”完整过程，发展逻辑推理与自我监控意识。" },
      { key: "情感", text: "敢于提问、乐于追问，在把问题讲清楚的过程中建立学习信心。" },
    ];

    const sections = [
      { t: "原题呈现", head: "题目内容", body: [raw] },
      { t: "题意分析", head: "审题要点", body: analysis },
      { t: "核心知识", head: `“${topic}”知识联系`, body: concepts.length ? concepts : [m.examPoints && m.examPoints[0] || "核心概念"] },
      { t: "解题思路", head: "分步讲解", body: steps },
      { t: "易错提醒", head: "常踩的坑", body: tips },
      { t: "课堂练习", head: "同类巩固", body: practices.length ? practices : ["换一组数字，按同样的思路再做一遍。"] },
      { t: "课堂小结", head: "这节课学会了", body: [`能读懂并复述“${topic}”类问题，说出解题三步骤；`, "遇到不会的题不慌张：先圈条件、再想方法、最后检查。", `若还有疑问，把卡住的那一步说清楚，再生成一次讲解。`] },
    ];

    // 幻灯片（每环节一至两页，适配 mountSlides 播放器与 PPTX/HTML 导出）
    const S = [];
    S.push({ page: 1, kicker: "题目讲课", title: topic, sub: `${subject} · ${stage.label} · ${typeName}（学生提问）`, bullets: ["来自学生的问题：", raw, `${stage.label} · ${subject} · ${typeName} · 本地引擎即时生成`] });
    S.push({ page: 2, kicker: "原题呈现", title: "题目内容", bullets: [raw] });
    S.push({ page: 3, kicker: "题意分析", title: "审题要点", bullets: analysis });
    if (concepts.length) S.push({ page: 4, kicker: "核心知识", title: "知识联系", bullets: concepts });
    const stepPages = Math.ceil(steps.length / 2);
    steps.forEach((st, i) => {
      const pi = 4 + (concepts.length ? 1 : 0) + Math.floor(i / 2);
      const existing = S[pi] || (S[pi] = { page: pi, kicker: "解题思路", title: "分步讲解 " + (Math.floor(i / 2) + 1), bullets: [] });
      existing.bullets.push(st);
    });
    const base = 4 + (concepts.length ? 1 : 0) + stepPages;
    S.push({ page: base, kicker: "易错提醒", title: "常踩的坑", bullets: tips });
    S.push({ page: base + 1, kicker: "课堂练习", title: "同类巩固", bullets: practices.length ? practices : ["换一组数字，按同样的思路再做一遍。"] });
    S.push({ page: base + 2, kicker: "课堂小结", title: "这节课学会了", bullets: ["能读懂并复述这类问题，说出解题三步骤", "先圈条件 → 再想方法 → 最后检查", "把卡住的那一步说清楚，再生成一次讲解"] });
    const slides = S.filter(Boolean);

    return {
      kind: "lecture",
      meta: { stage: stage.label, grade, subject, version: "学生提问", chapter: subject + " · 题目讲解", topic, engine: "local" },
      title: "讲解 · " + topic,
      subtitle: `${subject} · ${stage.label} · ${typeName} · 学生提问即时生成`,
      objectives,
      sections,
      slides,
      detected: { grade, stage: stage.id, stageLabel: stage.label, subject, typeKey, typeName, topic, score: detectSubjectScore(raw) },
    };
  }
  function detectSubject(raw) {
    const H = DATA.lectureHints;
    let best = "", bestScore = 0;
    Object.keys(H.subjects).forEach((sub) => {
      let score = 0;
      H.subjects[sub].forEach((w) => { if (raw.indexOf(w) >= 0) score += w.length >= 3 ? 2 : 1; });
      if (score > bestScore) { bestScore = score; best = sub; }
    });
    if (best) return best;
    if (/[a-zA-Z]/.test(raw)) return "英语";
    if (/(背诵|默写|古诗|课文|作文|拼音|阅读理解|修辞)/.test(raw)) return "语文";
    return "数学";
  }
  function detectSubjectScore(raw) {
    const H = DATA.lectureHints;
    let best = 0;
    Object.keys(H.subjects).forEach((sub) => {
      let score = 0;
      H.subjects[sub].forEach((w) => { if (raw.indexOf(w) >= 0) score += w.length >= 3 ? 2 : 1; });
      if (score > best) best = score;
    });
    return best;
  }
  function detectGrade(raw) {
    const cnMap = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12 };
    const g1 = raw.match(/([0-9]{1,2})\s*年级/);
    if (g1) return Math.min(12, Math.max(1, parseInt(g1[1], 10)));
    const g2 = raw.match(/([一二三四五六七八九十]{1,2})\s*年级/);
    if (g2) { const v = cnMap[g2[1]]; if (v) return v; }
    if (/初[一二三]|七[一二三]?年级/.test(raw)) return raw.indexOf("初三") >= 0 || raw.indexOf("九年级") >= 0 ? 9 : (raw.indexOf("初二") >= 0 || raw.indexOf("八年级") >= 0 ? 8 : 7);
    if (/(高一|十年级)/.test(raw)) return 10;
    if (/(高二|十一年级)/.test(raw)) return 11;
    if (/(高三|十二年级)/.test(raw)) return 12;
    if (raw.indexOf("初中") >= 0) return 8;
    if (raw.indexOf("高中") >= 0) return 11;
    if (raw.indexOf("物理") >= 0 || raw.indexOf("化学") >= 0) return 9;
    if (/(导数|圆锥曲线|数列|向量|电磁感应|有机化学|遗传|哲学)/.test(raw)) return 11;
    return 4; // 未指明年级：默认小学中期通学段
  }
  function classifyStage(grade) {
    if (grade >= 10) return { id: "senior", label: "高中" };
    if (grade >= 7) return { id: "junior", label: "初中" };
    return { id: "primary", label: "小学" };
  }
  function detectType(raw) {
    const H = DATA.lectureHints;
    let best = "concept", bestScore = 0;
    Object.keys(H.types).forEach((tk) => {
      let score = 0;
      H.types[tk].kws.forEach((w) => { if (raw.indexOf(w) >= 0) score += 1; });
      if (score > bestScore) { bestScore = score; best = tk; }
    });
    return best;
  }
  function guessTopic(raw, subject) {
    const m = material(subject);
    const pool = (m.concepts || []).concat(m.examPoints || []);
    let hit = "";
    pool.forEach((c) => { if (c && c.length > 1 && raw.indexOf(c) >= 0 && c.length > hit.length) hit = c; });
    if (hit) return hit;
    const cleaned = raw
      .replace(/^(请|帮|麻烦|请问|给我|让我)/, "")
      .replace(/^(什么是|为什么|怎么|如何|怎样|讲讲|讲一下|解释一下)/, "")
      .replace(/[？?。！!，,：:；;、]/g, "");
    return (cleaned.slice(0, 12) || "这道题");
  }
  function buildAnalysis(raw, subject, topic) {
    const nums = raw.match(/\d+(?:\.\d+)?/g) || [];
    const lines = [
      `先读两遍题目，圈出关键词“${topic}”与条件数据${nums.length ? "（本题出现数字：" + nums.slice(0, 4).join("、") + "）" : ""}。`,
      `明确要求：题目让我们${raw.indexOf("为什么") >= 0 || raw.indexOf("证明") >= 0 || raw.indexOf("依据") >= 0 ? "说明道理/推理依据" : (raw.indexOf("计算") >= 0 || /[＝=]/.test(raw) ? "算出结果" : "理解并作答")}。`,
      `把它拆成“已知什么 → 求什么 → 用什么方法”三步，再调用${subject}里的知识来解决。`,
    ];
    return lines;
  }

  /* =================================================
   * v2 · 随堂测验（可实时批改：标准答案 + 解析）
   * ================================================= */
  function makeQuiz(subject, topic, count) {
    const rnd = makeRandom([subject, topic, count, "quiz"].join("|"));
    const bank = DATA.quizFor(subject);
    const n = Math.max(1, Math.min(Number(count) || 5, 8));
    const picked = rnd.pickN(bank.slice(), Math.min(n, bank.length));
    const items = picked.map((it, i) => ({
      no: i + 1,
      q: it.q, opts: it.opts, a: it.a, why: it.why,
    }));
    return { kind: "quiz", meta: { subject, topic }, title: "随堂测验 · " + topic, items, count: items.length };
  }

  /* 关键词批改：根据参考答案关键词给用户自由文本打分（0-100） */
  function gradeKeyword(userText, reference, stopWords) {
    const u = String(userText || "").trim();
    if (!u) return { score: 0, hit: [], miss: [] };
    const sw = stopWords || DATA.stopWords;
    const keys = String(reference || "").replace(/[，。、；：！？,.!?:;()（）"“”]/g, " ").split(/\s+/)
      .map((w) => w.trim()).filter((w) => w.length >= 2 && sw.indexOf(w) < 0);
    // 取前 6 个关键词
    const core = keys.slice(0, 6);
    const hit = core.filter((k) => u.indexOf(k) >= 0);
    const miss = core.filter((k) => u.indexOf(k) < 0);
    const score = core.length ? Math.round((hit.length / core.length) * 100) : 0;
    return { score, hit, miss };
  }

  /* =================================================
   * v2 · 多角色 AI 课堂（OpenMAIC 对齐）
   * 流程：开场 → 幻灯片串讲（同学插话/抛问）→ 随堂测验实时批改
   *      → 助教小结 → 老师结课；返回可回放的 steps 剧本
   * ================================================= */
  function makeClassroom(params) {
    const { lesson, subject, topic, quizCount } = params;
    const rnd = makeRandom([subject, topic, "classroom"].join("|"));
    const C = DATA.classroom;
    const slides = makeSlides(lesson).slides;
    const quiz = makeQuiz(subject, topic, quizCount || 5);
    const cls = C.classmates;
    const steps = [];
    let stepNo = 0;
    const push = (role, name, avatar, text, kind, meta) => {
      steps.push({ no: ++stepNo, role, name, avatar, text, kind: kind || "line", meta: meta || null });
    };
    const T = C.teacher, A = C.assistant;

    // 开场
    push("teacher", T.name, T.avatar, rnd.pick(T.open).replace("{topic}", topic), "open");

    // 幻灯片串讲 + 同学插话
    slides.forEach((sl, i) => {
      push("teacher", T.name, T.avatar, "我们来看第 " + (i + 1) + " 页 · " + sl.title + "。" + (sl.bullets[0] || ""), "slide", { slide: i });
      if (i === 2) push("star", cls[0].name, cls[0].avatar, rnd.pick(cls[0].lines.ask), "ask");
      else if (i === 3) push("doubt", cls[1].name, cls[1].avatar, rnd.pick(cls[1].lines.ask), "ask");
      else if (i === 4) {
        push("base", cls[2].name, cls[2].avatar, rnd.pick(cls[2].lines.ask), "ask");
        push("assistant", A.name, A.avatar, rnd.pick(A.explain), "explain");
      } else if (i === slides.length - 2) {
        // 老师抛出一个开放问题（学生回答）
        const meta = slides[i];
        push("teacher", T.name, T.avatar, rnd.pick(T.ask) + "（请在下方作答）", "question", { slide: i, ref: meta.bullets.join("；") });
      }
    });

    // 随堂测验（实时批改）
    push("teacher", T.name, T.avatar, "接下来进入随堂测验，共 " + quiz.count + " 题，做完即时批改并反馈解析。", "quiz", { quiz: true });
    // 测验题目作为独立步骤逐题播放
    quiz.items.forEach((it) => {
      push("quiz", "随堂测验", "📝", "第 " + it.no + " 题：" + it.q, "quizQ", { item: it });
    });

    // 助教小结 + 老师结课
    push("assistant", A.name, A.avatar, rnd.pick(A.summarize).replace("{topic}", topic), "summary");
    push("teacher", T.name, T.avatar, rnd.pick(T.close), "close");

    const cast = [
      { id: "teacher", name: T.name, avatar: T.avatar, title: T.title },
      { id: "assistant", name: A.name, avatar: A.avatar, title: A.title },
      ...cls.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar, persona: c.persona })),
    ];

    return {
      kind: "classroom",
      meta: { subject, topic, engine: "local" },
      title: "AI 课堂 · " + topic,
      cast,
      slides,
      quiz,
      steps,
      count: steps.length,
    };
  }

  /* 课堂报告（课堂状态管理 Agent） */
  function classroomReport(session, stat) {
    const s = stat || { steps: session.count, answered: 0, correct: 0, participation: 0, quizScore: 0, quizTotal: 0, durationSec: 0 };
    const correctRate = s.quizTotal ? Math.round((s.quizScore / s.quizTotal) * 100) : 0;
    const partRate = Math.min(100, Math.round((s.participation / Math.max(1, session.slides.length)) * 100));
    const lines = [];
    lines.push("课堂结构：开场 → 幻灯片讲解（" + session.slides.length + " 页）→ 随堂测验（" + session.quiz.count + " 题）→ 小结。");
    lines.push("测验正确率 " + correctRate + "%" + (correctRate >= 80 ? "，掌握情况良好。" : correctRate >= 60 ? "，大部分知识点已掌握，个别需巩固。" : "，建议课后针对错题重新练习，并在下节课复习回顾。"));
    lines.push("学生参与度：" + s.participation + " 次关键互动。");
    // 生成建议
    const suggestions = [];
    if (correctRate < 60) suggestions.push("重讲正确率低于 60% 的知识点，并提供同型变式练习。");
    if (partRate < 40) suggestions.push("下次课堂增加抢答与小组任务，提升参与度。");
    if (s.participation === 0) suggestions.push("学生尚未参与答题，可在提问后停顿等待，必要时点名引导。");
    suggestions.push("建议课后导出课堂报告并同步给家长，形成家校学习闭环。");
    return {
      kind: "report",
      title: "课堂报告 · " + session.title,
      meta: { subject: session.meta.subject, topic: session.meta.topic, at: new Date().toLocaleString("zh-CN", { hour12: false }) },
      stats: {
        课堂步骤: s.steps + " 步", 随堂测验: session.quiz.count + " 题",
        测验得分: s.quizScore + "/" + s.quizTotal, 正确率: correctRate + "%",
        参与互动: s.participation + " 次", 用时: (s.durationSec / 60).toFixed(1) + " 分钟",
      },
      lines,
      suggestions,
    };
  }

  /* =================================================
   * v2 · PBL 项目式学习
   * ================================================= */
  function makePBL(params) {
    const { subject, topic, chapter, stageName } = params;
    const rnd = makeRandom([subject, topic, chapter, "pbl"].join("|"));
    const P = DATA.pbl;
    const repAll = (s) => s.split("{topic}").join(topic);
    const driving = repAll(rnd.pick(P.driving));
    const background = repAll(rnd.pick(P.contexts));
    const milestones = P.milestones.map((m, i) => ({
      no: i + 1, t: m.t, hours: m.hours,
      tasks: m.tasks.map(repAll),
    }));
    const taskCards = P.taskCards.map((c, i) => ({ no: i + 1, title: c.title, tasks: c.tasks.map(repAll) }));
    return {
      kind: "pbl",
      meta: { stage: stageName, subject, chapter, topic, engine: "local" },
      title: "项目式学习（PBL）· " + topic,
      subtitle: subject + " · " + (chapter || "跨学科综合") + " · 驱动性问题驱动、成果导向",
      driving, background,
      milestones, taskCards,
      deliverables: P.deliverables.slice(),
      rubric: P.rubric.map((r) => ({ dim: r.dim, levels: r.levels.slice(), weight: r.weight })),
      schedule: P.schedule.slice(),
      duration: "建议 7-8 课时（约 2 周）",
    };
  }

  /* =================================================
   * v2 · 交互式模拟实验（确定性物理公式 + 断言）
   * ================================================= */
  function makeExperiment(kind) {
    const def = DATA.experiments[kind];
    if (!def) throw new Error("未知实验：" + kind);
    return runExperiment(kind, def.params.reduce((o, p) => { o[p.key] = p.value; return o; }, {}));
  }
  function runExperiment(kind, values) {
    const def = DATA.experiments[kind];
    const params = def.params.map((p) => ({ ...p, value: Number(values[p.key] != null ? values[p.key] : p.value) }));
    const v = params.reduce((o, p) => { o[p.key] = p.value; return o; }, {});
    const res = def.compute(v);
    const allPass = res.checks.every((c) => c.pass);
    return {
      kind: "experiment", expId: def.id,
      title: def.title, icon: def.icon, subject: def.subject,
      desc: def.desc, theory: def.theory,
      params, values: res.values, checks: res.checks, allPass, extra: res,
      points: typeof def.points === "function" ? def.points : null,
    };
  }

  /* =================================================
   * API 通道（可选深度生成）
   * ================================================= */
  async function callApi({ url, model, key, system, user }) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try { msg = (await res.json()).error?.message || msg; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    return text;
  }

  /* =================================================
   * 对外接口
   * ================================================= */
  return {
    makeRandom, hashStr,
    generateLesson, generateInteractive, generateHomework, generateGeometry,
    makeSlides, makeClassroom, makeQuiz, gradeKeyword, classroomReport,
    makePBL, makeExperiment, runExperiment,
    makeLecture,
    callApi, material, dist, angleDeg,
    vertexLabel: (n) => String(n),
    exportMarkdown: renderMarkdown,
    renderSVG: renderGeometrySVG,
  };

  /* ---------- 渲染辅助：SVG ---------- */
  function renderGeometrySVG(geo) {
    const S = geo.size;
    const pad = 34;
    const W = S + pad * 2;
    let body = "";
    if (geo.model && geo.model.kind === "circle") {
      const { center, radius } = geo.model;
      body = `<circle cx="${center.x + pad}" cy="${center.y + pad}" r="${radius}" fill="none" stroke="#1457d9" stroke-width="2.5"/>`;
      body += `<line x1="${center.x + pad - radius}" y1="${center.y + pad}" x2="${center.x + pad + radius}" y2="${center.y + pad}" stroke="#8db6ff" stroke-width="1.2" stroke-dasharray="4 4"/>`;
    } else if (geo.polygon) {
      const pts = geo.polygon.map((p) => `${p.x + pad},${p.y + pad}`).join(" ");
      body = `<polygon points="${pts}" fill="rgba(20,87,217,.10)" stroke="#1457d9" stroke-width="2.5"/>`;
      const labels = geo.model.vertices ? Object.keys(geo.model.vertices) : ["A", "B", "C", "D"];
      geo.polygon.forEach((p, i) => {
        const lx = p.x + pad + 8, ly = p.y + pad - 8;
        body += `<text x="${lx}" y="${ly}" font-family="Arial" font-size="17" font-weight="700" fill="#0b1220">${labels[i]}</text>`;
      });
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}" role="img" aria-label="${geo.shape}示意图">${body}</svg>`;
  }

  function renderMarkdown(art) {
    let md = "# " + art.title + "\n\n";
    if (art.subtitle) md += "> " + art.subtitle + "\n\n";
    md += "---\n\n";
    if (art.kind === "lesson") {
      md += "## 教学目标\n";
      art.objectives.forEach((o) => { md += `- **${o.key}目标**：${o.text}\n`; });
      md += "\n## 教学流程\n";
      art.sections.forEach((s) => {
        md += `### ${s.t}：${s.head}\n`;
        if (Array.isArray(s.body)) s.body.forEach((b) => { md += `- ${b}\n`; });
        else md += s.body + "\n";
        md += "\n";
      });
    } else if (art.kind === "interactive") {
      md += "## 活动规则\n" + art.rules + "\n\n";
      if (art.items) {
        md += "## 题目清单\n";
        art.items.forEach((it) => { md += `${it.no}. ${it.q}\n${it.a ? "   - " + it.a + "\n" : ""}`; });
      }
      if (art.tasks) {
        md += "## 任务包\n";
        art.tasks.forEach((t) => { md += `${t.no}. **${t.t}**：${t.desc}\n`; });
      }
    } else if (art.kind === "homework") {
      md += `分题目：基础 ${art.plan.basic} 题 / 提升 ${art.plan.mid} 题 / 拓展 ${art.plan.hard} 题\n\n`;
      if (!art.withAnswer) md += "> 本卷不含参考答案（教师版开关关闭）\n\n";
      let cur = "";
      art.items.forEach((it) => {
        if (it.layer !== cur) {
          const nm = { basic: "一、基础巩固", mid: "二、能力提升", hard: "三、拓展挑战" }[it.layer];
          md += `\n## ${nm}\n`;
          cur = it.layer;
        }
        md += `${it.no}. ${it.q.replace(`【${it.tag}】`, "")}\n`;
        if (it.a) md += `   - ${it.a}\n`;
      });
    }
    return md;
  }
})();