/* ============================================================
 * app-main.js · 应用入口与交互
 * ============================================================ */
(function () {
  "use strict";

  const C = window.QIKE_CONTENT;
  const E = window.QIKE_ENGINE;
  const U = window.QIKE_UI;

  const $ = (id) => document.getElementById(id);
  const DEFAULT_SETTINGS = {
    engine: "local",
    slots: {
      A: { url: "", model: "", key: "" },
      B: { url: "", model: "", key: "" },
      C: { url: "", model: "", key: "" },
    },
    route: { lesson: "A", classroom: "B", experiment: "C" },
    webhooks: { feishu: "", slack: "", telegram: "" },
    voice: { tts: true, stt: true },
  };
  const state = {
    view: "dashboard",
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    history: [],
    lastArt: {},   // 每类最近产物（供收藏/重开）
  };

  /* ---------- 存储（localStorage 容错降级） ---------- */
  const Store = {
    ok: (function () { try { localStorage.setItem("qk_t", "1"); localStorage.removeItem("qk_t"); return true; } catch (e) { return false; } })(),
    get(k, dft) {
      try { const v = localStorage.getItem("qk_" + k); return v == null ? dft : JSON.parse(v); } catch (e) { return dft; }
    },
    set(k, v) {
      try { localStorage.setItem("qk_" + k, JSON.stringify(v)); } catch (e) { /* 降级：仅内存 */ }
    },
  };

  /* ---------- 导航 ---------- */
  function switchView(view) {
    state.view = view;
    document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== "view-" + view; });
    document.querySelectorAll(".nav-btn").forEach((b) => {
      const active = b.dataset.view === view;
      b.classList.toggle("is-active", active);
      if (active) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    const menu = $("topnav");
    const isMobile = window.matchMedia("(max-width:640px)").matches;
    if (isMobile) { menu.classList.remove("open"); menu.setAttribute("aria-expanded", "false"); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- 级联下拉填充 ---------- */
  function fillStageSelect(sel) {
    sel.innerHTML = "";
    C.stages.forEach((s) => {
      const o = document.createElement("option");
      o.value = s.id; o.textContent = s.label;
      sel.appendChild(o);
    });
  }
  function cascade(prefix, stageId, subject, grade) {
    // 兼容两个表单形态：课件/互动带 subject；作业带 subject；可缺省 version/chapter/grade
    const subjSel = $(prefix + "-subject");
    if (!subjSel) return;
    const subjects = C.getSubjects(stageId);
    subjSel.innerHTML = "";
    subjects.forEach((s) => {
      const o = document.createElement("option"); o.value = s; o.textContent = s;
      subjSel.appendChild(o);
    });
    const subj = (subject && subjects.indexOf(subject) >= 0) ? subject : subjects[0];
    subjSel.value = subj;

    const verSel = $(prefix + "-version");
    if (verSel) {
      const vers = C.getVersionsFor(subj);
      verSel.innerHTML = "";
      vers.forEach((v) => {
        const o = document.createElement("option"); o.value = v; o.textContent = v;
        verSel.appendChild(o);
      });
    }

    const gradeSel = $(prefix + "-grade");
    if (gradeSel) {
      const grades = C.getUnitGrades(stageId, subj);
      gradeSel.innerHTML = "";
      if (grades.length) {
        grades.forEach((g) => {
          const o = document.createElement("option"); o.value = g; o.textContent = g + " 年级";
          gradeSel.appendChild(o);
        });
      } else {
        const o = document.createElement("option"); o.value = ""; o.textContent = "通学段";
        gradeSel.appendChild(o);
      }
    }

    const chSel = $(prefix + "-chapter");
    if (chSel) {
      const units = C.getUnits(stageId, subj, grade || (gradeSel ? gradeSel.value : ""));
      chSel.innerHTML = "";
      if (units.length) {
        units.forEach((u) => {
          const o = document.createElement("option"); o.value = u; o.textContent = u;
          chSel.appendChild(o);
        });
      } else {
        const o = document.createElement("option"); o.value = "本学段通识主题"; o.textContent = "本学段通识主题";
        chSel.appendChild(o);
      }
    }
    return subj;
  }

  function bindCascade(prefix) {
    const stageSel = $(prefix + "-stage");
    if (!stageSel) return;
    const subjSel = $(prefix + "-subject");
    const verSel = $(prefix + "-version");
    const chSel = $(prefix + "-chapter");
    const gradeSel = $(prefix + "-grade");
    fillStageSelect(stageSel);
    cascade(prefix, stageSel.value);
    stageSel.addEventListener("change", () => cascade(prefix, stageSel.value));
    if (subjSel) {
      subjSel.addEventListener("change", () => {
        const subj = cascade(prefix, stageSel.value, subjSel.value);
        subjSel.value = subj;
      });
    }
    if (gradeSel) gradeSel.addEventListener("change", () => cascade(prefix, stageSel.value, subjSel.value, gradeSel.value));
    if (verSel) verSel.addEventListener("change", () => { /* 保持 */ });
    if (chSel) chSel.addEventListener("change", () => { /* 无后续依赖 */ });
  }

  /* ---------- 历史 ---------- */
  function historySubtitle(art) {
    if (art.subtitle) return art.subtitle;
    if (art.meta) return art.meta.subject + " · " + (art.meta.chapter || "");
    return art.shape || (art.kind === "geometry" ? "几何图形" : art.kind);
  }

  function addHistory(art) {
    const item = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      kind: art.kind,
      title: art.title,
      subtitle: historySubtitle(art),
      at: new Date().toLocaleString("zh-CN", { hour12: false }),
      art,
    };
    state.history.unshift(item);
    if (state.history.length > 50) state.history.pop();
    Store.set("history", state.history);
    renderHistory();
    saveRecent(art);
  }
  function saveRecent(art) {
    state.lastArt[art.kind] = art;
  }
  function renderHistory() {
    const list = $("history-list");
    const clearBtn = $("btn-clear-history");
    if (!list) return;
    list.innerHTML = "";
    if (!state.history.length) {
      clearBtn.hidden = true;
      const li = document.createElement("li");
      li.className = "empty-hint";
      li.textContent = "还没有生成记录。去上面挑一个模块，开始您的第一份课堂成果吧！";
      list.appendChild(li);
      return;
    }
    clearBtn.hidden = false;
    const ico = { lesson: "📗", interactive: "🎯", homework: "📝", geometry: "📐", slides: "🎞️", classroom: "🧑‍🏫", experiment: "⚗️", pbl: "🧩", lecture: "💬" };
    state.history.forEach((h) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="h-item">
          <span class="h-ico">${ico[h.kind] || "📄"}</span>
          <div class="h-txt">
            <div class="h-title">${U.esc(h.title)}</div>
            <div class="h-meta">${U.esc(h.subtitle)} · ${U.esc(h.at)}</div>
          </div>
        </div>
        <div class="h-actions">
          <button class="h-open" data-id="${h.id}">打开</button>
          <button class="h-del" data-id="${h.id}">删除</button>
        </div>`;
      list.appendChild(li);
    });
  }
  function openHistory(id) {
    const h = state.history.find((x) => x.id === id);
    if (!h) return;
    const viewMap = { lesson: "lesson", interactive: "interactive", homework: "homework", geometry: "geometry", slides: "classroom", classroom: "classroom", experiment: "experiment", pbl: "pbl", lecture: "lecture" };
    const view = viewMap[h.kind];
    if (!view) return;
    switchView(view);
    renderArtifact(h.art);
  }
  function deleteHistory(id) {
    state.history = state.history.filter((x) => x.id !== id);
    Store.set("history", state.history);
    renderHistory();
    U.success("已删除该条记录");
  }
  function clearHistory() {
    if (!state.history.length) return;
    if (!window.confirm("确定清空全部生成记录吗？此操作不可恢复。")) return;
    state.history = [];
    Store.set("history", state.history);
    renderHistory();
    U.success("生成记录已清空");
  }

  /* ---------- 产物渲染调度 ---------- */
  function renderArtifact(art) {
    if (art.rawText && (art.kind === "lesson" || art.kind === "interactive" || art.kind === "homework")) {
      // API 深度生成：按段落渲染原始长文本
      const paperMap = { lesson: "lesson-paper", interactive: "interactive-paper", homework: "homework-paper" };
      const paper = $(paperMap[art.kind]);
      const paras = String(art.rawText).split(/\n+/).filter((s) => s.trim());
      const html = paras
        .map((p) => {
          const t = U.esc(p.trim());
          if (/^#+\s/.test(t)) {
            const level = Math.min(3, (t.match(/^#+/) || ["#"])[0].length);
            return `<h${level}>${t.replace(/^#+\s*/, "")}</h${level}>`;
          }
          return `<p>${t}</p>`;
        })
        .join("");
      paper.innerHTML = html || "<p>（暂无内容）</p>";
      if (art.kind === "lesson") {
        $("lesson-result-title").textContent = art.title;
        $("lesson-result").hidden = false;
      } else if (art.kind === "interactive") {
        $("interactive-result").hidden = false;
      } else {
        $("homework-result").hidden = false;
      }
      return;
    }
    if (art.kind === "lesson") {
      U.renderLesson(art, $("lesson-paper"));
      $("lesson-result").hidden = false;
      $("lesson-result-title").textContent = art.title;
      $("lesson-slides").hidden = false;
    } else if (art.kind === "lecture") {
      U.renderLesson(art, $("lecture-paper"));
      $("lecture-result").hidden = false;
      $("lecture-result-title").textContent = art.title;
      $("lecture-slides").hidden = false;
    } else if (art.kind === "interactive") {
      U.renderInteractive(art, $("interactive-paper"));
      $("interactive-result").hidden = false;
      $("interactive-quiz").hidden = false;
    } else if (art.kind === "homework") {
      U.renderHomework(art, $("homework-paper"));
      $("homework-result").hidden = false;
    } else if (art.kind === "geometry") {
      U.renderGeometry(art);
      $("geometry-result").hidden = false;
      state.lastGeo = art;
    } else if (art.kind === "experiment") {
      mountExperimentIntoStage(art);
      $("experiment-result-title").textContent = art.title + " · " + (art.allPass ? "断言全部通过 ✓" : "存在未通过断言");
      $("experiment-result").hidden = false;
      state.lastArt.experiment = art;
      state.lastExpKind = art.expId;
    } else if (art.kind === "pbl") {
      U.renderPBL(art, $("pbl-paper"));
      $("pbl-result").hidden = false;
      state.lastArt.pbl = art;
    }
  }

  /* ---------- 模拟实验挂载（滑杆联动重算数值断言） ---------- */
  let experimentRun = null;
  function mountExperimentIntoStage(art) {
    if (experimentRun) { experimentRun.destroy(); experimentRun = null; }
    const kind = art.expId;
    const host = $("experiment-stage");
    experimentRun = U.mountExperiment(art, host, {
      apply: (vals, renderCb) => { renderCb(E.runExperiment(kind, vals)); },
    });
  }

  /* ---------- 生成执行（本地/API，按场景路由多模型） ---------- */
  function sceneOf(kind) {
    if (kind === "lesson" || kind === "interactive" || kind === "homework") return "lesson";
    if (kind === "classroom" || kind === "slides" || kind === "quiz") return "classroom";
    if (kind === "experiment" || kind === "pbl") return "experiment";
    return "lesson";
  }
  async function runGenerate(kind, params, generator) {
    const cfg = state.settings;
    const slot = pickSlot(sceneOf(kind));
    const useApi =
      (cfg.engine === "api" || cfg.engine === "hybrid") &&
      slot && slot.url && slot.key;
    if (useApi) {
      try {
        const sys = "你是" + params.stageName + "优秀教师与课程设计专家，请基于国家课程标准生成专业、亲和、可直接使用的教学内容，使用中文，结构清晰。";
        const user = "请为主题“" + params.topic + "”（" + params.subject + "，" + (params.chapter || "本课") + "）生成本节内容，要求专业严谨、语言亲切易懂。";
        const text = await E.callApi({ url: slot.url, model: slot.model || "", key: slot.key, system: sys, user });
        const art = { kind, meta: { ...params, engine: "api", slot: sceneOf(kind) }, title: params.topic, subtitle: text.slice(0, 120) + "…", rawText: text };
        renderArtifact(art);
        addHistory(art);
        U.success("已通过 API 深度生成（场景路由 " + sceneOf(kind) + "）");
        saveRecent(art);
        return art;
      } catch (err) {
        if (cfg.engine === "api") {
          U.warn("API 调用失败（" + err.message + "），已自动回退本地引擎生成。");
          saveRecent(null);
        } else {
          // hybrid：本地已生成则直接使用本地结果
        }
      }
    }
    const art = generator();
    renderArtifact(art);
    addHistory(art);
    saveRecent(art);
    if (useApi && cfg.engine === "hybrid") U.success("本地引擎已生成（可配置 API 升级深度生成）");
    return art;
  }

  /* ---------- 课件表单 ---------- */
  function initLesson() {
    bindCascade("lesson");
    $("lesson-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const stageId = $("lesson-stage").value;
      const stage = C.stages.find((s) => s.id === stageId);
      const subject = $("lesson-subject").value;
      const version = $("lesson-version").value;
      const chapter = $("lesson-chapter").value;
      const topic = $("lesson-topic").value.trim() || chapter;
      const gradeSel = $("lesson-grade");
      const grade = gradeSel ? gradeSel.value : "";
      if (topic.length > 80) { U.warn("主题太长了，请控制在 80 字以内。"); return; }
      const btn = $("lesson-gen-btn");
      btn.disabled = true; btn.textContent = "生成中…";
      await runGenerate("lesson", { stageName: stage.name, grade, subject, version, chapter, topic }, () =>
        E.generateLesson({ stageName: stage.name, grade, subject, version, chapter, topic }));
      btn.disabled = false; btn.textContent = "生成课件";
    });
    $("lesson-regen").addEventListener("click", () => {
      const art = E.generateLesson({
        stageName: C.stages.find((s) => s.id === $("lesson-stage").value).name,
        subject: $("lesson-subject").value, version: $("lesson-version").value,
        chapter: $("lesson-chapter").value, topic: $("lesson-topic").value.trim() || $("lesson-chapter").value,
      });
      renderArtifact(art); addHistory(art);
      U.success("已重新生成一组新内容");
    });
    $("lesson-print").addEventListener("click", () => {
      if (state.lastArt.lesson) U.printArt(state.lastArt.lesson, "课件导出");
    });
    // 📤 导出 PPTX / 交互式 HTML（本地引擎，零外部依赖）
    function exportOf(kind) {
      const art = state.lastArt[kind];
      if (!art) { U.warn("请先生成内容，再导出文件。"); return null; }
      return art;
    }
    $("lesson-export-pptx").addEventListener("click", () => {
      const art = exportOf("lesson");
      if (art) {
        const r = window.QIKE_EXPORT.exportPPTX(art, "qike-course-" + window.QIKE_EXPORT.safeName(art.title) + ".pptx");
        U.success(r.ok ? "PPTX 已导出：" + r.slides + " 页（可逐元素编辑）" : "导出失败：" + r.reason);
      }
    });
    $("lesson-export-html").addEventListener("click", () => {
      const art = exportOf("lesson");
      if (!art) return;
      // 交互式 HTML：课件页 + 随堂测验（选择题可作答、即时批改）
      const quiz = E.makeQuiz(art.meta.subject, art.meta.topic, 5);
      const r = window.QIKE_EXPORT.exportHTML(art, "qike-course-" + window.QIKE_EXPORT.safeName(art.title) + "-interactive.html", {
        qa: quiz.items, quizTitle: "随堂测验 · " + art.meta.topic, quizMode: true,
      });
      U.success(r.ok ? "交互式 HTML 已导出：" + r.bytes + " 字节，可离线打开作答" : "导出失败");
    });
    // 🎞 幻灯片讲课：本地生成幻灯片播放器（聚光灯/激光笔/跟读讲解）
    let slidesPlayer = null;
    $("lesson-slides").addEventListener("click", () => {
      const art = state.lastArt.lesson;
      if (!art) { U.warn("请先生成课件，再进入幻灯片讲课。"); return; }
      if (slidesPlayer) { slidesPlayer.destroy(); slidesPlayer = null; $("lesson-player").hidden = true; $("lesson-slides").classList.remove("is-lit"); return; }
      const deck = E.makeSlides(art);
      if (!deck || !deck.slides || !deck.slides.length) { U.warn("这份课件没有可用的幻灯片结构，无法讲课。"); return; }
      const box = $("lesson-player");
      box.hidden = false;
      slidesPlayer = U.mountSlides(deck.slides, box, { spotlight: true, laser: true });
      $("lesson-slides").classList.add("is-lit");
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
      U.success("已就绪：共 " + deck.count + " 页，可自动放映、跟读讲解或逐页播放。");
    });
  }

  /* ---------- 题目讲课（类百度搜索框：文字/语音提问 → 自动讲解课件） ---------- */
  function initLecture() {
    const form = $("lecture-form");
    const input = $("lecture-q");
    const goBtn = $("lecture-go");
    const voiceBtn = $("lecture-voice");
    const demoBox = $("lecture-demos");
    let player = null;

    function clearPlayer() {
      if (player) { player.destroy(); player = null; }
      $("lecture-player").hidden = true;
      $("lecture-slides").classList.remove("is-lit");
    }
    function run(q) {
      const text = String(q == null ? input.value : q).trim();
      if (!text) { U.warn("请先输入或说出你的问题或题目内容。"); input.focus(); return; }
      goBtn.disabled = true; goBtn.textContent = "识别生成中…";
      setTimeout(() => {
        const art = E.makeLecture(text);
        goBtn.disabled = false; goBtn.textContent = "生成讲解";
        if (!art) { U.warn("没能生成讲解课件，请换一种说法试试。"); return; }
        clearPlayer();           // 切换新题目时回收旧播放器
        renderArtifact(art);
        addHistory(art);
        saveRecent(art);
        const d = art.detected;
        U.success("已识别：" + d.subject + " · " + d.stageLabel + (d.grade && d.grade > 0 ? "（约" + d.grade + "年级）" : "") + " · " + d.typeName + "，共 " + art.slides.length + " 页课件。");
        input.classList.add("has-value");
      }, 70);
    }
    // 提交
    form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
    // 语音输入（类百度搜索框的麦克风）
    voiceBtn.addEventListener("click", () => {
      const V = window.QIKE_VOICE;
      if (!V || !V.listen) { U.warn("当前浏览器不支持语音识别，请直接用文字输入。"); return; }
      const lit = voiceBtn.classList.toggle("is-lit");
      if (!lit) { clearPlayer(); return; }      // 再点一次取消聆听
      voiceBtn.disabled = true;
      V.listen((ok, text, err) => {
        voiceBtn.disabled = false; voiceBtn.classList.remove("is-lit");
        if (!ok || !text) { U.warn(err || "没有听清，请重试或改用文字输入。"); return; }
        input.value = text;
        run();
      });
    });
    // 示例问题（快速体验 1–12 年级各学段学科）
    const demos = [
      { label: "三年级 · 分数加减法", q: "三年级 分数加减法怎么算？比如 1/4 + 2/4 等于多少？" },
      { label: "初一 · 一元一次方程", q: "初一 解方程：3x + 5 = 20，x 等于多少？" },
      { label: "初二 · 勾股定理", q: "初二 直角三角形两条直角边是 3 和 4，斜边为什么等于 5？" },
      { label: "五年级 · 圆的面积", q: "五年级 为什么圆的面积等于 πr²？" },
      { label: "高一 · 函数定义", q: "高一 什么是函数？为什么 y = 2x + 1 是函数？" },
      { label: "高三 · 导数几何意义", q: "高三 导数的几何意义是什么？怎么求切线方程？" },
      { label: "小学 · 古诗背诵", q: "小学 古诗《静夜思》怎么背诵记忆？" },
      { label: "初三 · 化学方程式", q: "初三 化学方程式配平怎么做？" },
      { label: "六年级 · 阅读理解", q: "六年级 语文阅读理解怎么概括中心思想？" },
      { label: "高二 · 英语语法", q: "高二 英语一般过去时和现在完成时有什么区别？" },
    ];
    demos.forEach((d) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "lecture-chip";
      chip.textContent = d.label;
      chip.title = d.q;
      chip.addEventListener("click", () => { input.value = d.q; run(); });
      demoBox.appendChild(chip);
    });
    // 结果区：打印 / 导出 / 幻灯片
    $("lecture-print").addEventListener("click", () => {
      const art = state.lastArt.lecture;
      if (!art) { U.warn("请先生成讲解课件，再导出文件。"); return; }
      U.printArt(art, "题目讲解课件");
    });
    $("lecture-export-pptx").addEventListener("click", () => {
      const art = state.lastArt.lecture;
      if (!art) { U.warn("请先生成讲解课件，再导出文件。"); return; }
      const r = window.QIKE_EXPORT.exportPPTX(art, "qike-lecture-" + window.QIKE_EXPORT.safeName(art.title) + ".pptx");
      U.success(r.ok ? "PPTX 已导出：" + r.slides + " 页（可逐元素编辑）" : "导出失败：" + r.reason);
    });
    $("lecture-export-html").addEventListener("click", () => {
      const art = state.lastArt.lecture;
      if (!art) { U.warn("请先生成讲解课件，再导出文件。"); return; }
      const r = window.QIKE_EXPORT.exportHTML(art, "qike-lecture-" + window.QIKE_EXPORT.safeName(art.title) + "-interactive.html", {});
      U.success(r.ok ? "交互式 HTML 已导出，可离线打开" : "导出失败");
    });
    $("lecture-slides").addEventListener("click", () => {
      const art = state.lastArt.lecture;
      if (!art) { U.warn("请先生成讲解课件，再进入幻灯片讲课。"); return; }
      if (player) { clearPlayer(); return; }
      if (!art.slides || !art.slides.length) { U.warn("这份讲解没有可用的幻灯片结构，无法讲课。"); return; }
      const box = $("lecture-player");
      box.hidden = false;
      player = U.mountSlides(art.slides, box, { spotlight: true, laser: true });
      $("lecture-slides").classList.add("is-lit");
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
      U.success("已就绪：共 " + art.slides.length + " 页，可自动放映、跟读讲解或逐页播放。");
    });
    // 快捷引导：把搜索框放回页面顶部
    $("lecture-backtop") && $("lecture-backtop").addEventListener("click", () => {
      $("view-lecture").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* ---------- 互动表单 ---------- */
  function initInteractive() {
    bindCascade("interactive");
    $("interactive-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const type = $("interactive-type").value;
      const stageId = $("interactive-stage").value;
      const stage = C.stages.find((s) => s.id === stageId);
      const subject = $("interactive-subject").value;
      const topic = $("interactive-topic").value.trim() || $("interactive-subject").value;
      const chapter = "";
      const count = $("interactive-count").value;
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = "生成中…";
      const art = await runGenerate("interactive", { stageName: stage.name, subject, chapter, topic }, () =>
        E.generateInteractive({ type, stageName: stage.name, subject, chapter, topic, count }));
      if (art) { btn.disabled = false; btn.textContent = "生成互动活动"; }
    });
    $("interactive-print").addEventListener("click", () => {
      if (state.lastArt.interactive) U.printArt(state.lastArt.interactive, "课堂互动包");
    });
    $("interactive-export-pptx").addEventListener("click", () => {
      const art = state.lastArt.interactive;
      if (!art) { U.warn("请先生成互动活动，再导出文件。"); return; }
      const r = window.QIKE_EXPORT.exportPPTX(art, "qike-interactive-" + window.QIKE_EXPORT.safeName(art.title) + ".pptx");
      U.success(r.ok ? "PPTX 已导出：" + r.slides + " 页" : "导出失败：" + r.reason);
    });
    $("interactive-export-html").addEventListener("click", () => {
      const art = state.lastArt.interactive;
      if (!art) { U.warn("请先生成互动活动，再导出文件。"); return; }
      const r = window.QIKE_EXPORT.exportHTML(art, "qike-interactive-" + window.QIKE_EXPORT.safeName(art.title) + ".html", {
        qa: art.items, quizTitle: art.modeLabel === "随堂测验" || art.modeLabel === "游戏化小测" ? "题目与答案" : "题目与提示",
      });
      U.success(r.ok ? "交互式 HTML 已导出，可离线打开" : "导出失败");
    });
    // 🧪 实时测验：随时开测，逐题即时批改并反馈解析
    $("interactive-quiz").addEventListener("click", () => {
      const last = state.lastArt.interactive;
      if (!last) { U.warn("请先生成互动活动，再进入实时测验。"); return; }
      const subject = last.meta && last.meta.subject ? last.meta.subject : "数学";
      const topic = (last.meta && last.meta.topic) || subject;
      const quiz = E.makeQuiz(subject, topic, 5);
      if (!quiz || !quiz.items || !quiz.items.length) { U.warn("题库没有可用题目，请换个学科或主题。"); return; }
      const box = $("quiz-player");
      box.hidden = false;
      U.mountQuizRunner(quiz.items, box, {
        onAnswer: (ok, it) => " 本次" + (ok ? "答对" : "答错") + "，继续加油！",
        onDone: (r) => U.success("测验完成：" + r.score + "/" + r.total + "，正确率 " + r.rate + "%"),
      });
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  /* ---------- 多角色 AI 课堂 ---------- */
  function initClassroom() {
    bindCascade("classroom");
    let session = null;
    let shell = null;
    let stat = null;
    let curStep = 0;
    let awaiting = false;
    let autoTimer = null;
    let board = null;

    function stopAuto() { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } }

    function totalScore() { return stat.quizScore + stat.openScore; }
    function refreshStatus() {
      if (!shell) return;
      shell.setStatus("step", session.steps[curStep] ? session.steps[curStep].no + "/" + session.count : session.count + "/" + session.count);
      shell.setStatus("score", totalScore());
      shell.setStatus("part", stat.participation + " 次");
    }

    function playNext() {
      stopAuto();
      if (!session || !shell) return;
      if (curStep >= session.steps.length) { finishStream(); return; }
      const step = session.steps[curStep];
      refreshStatus();
      shell.say(step.role, step.name, step.avatar, step.text, step.kind);
      if (step.kind === "slide") {
        if (!shell.getPlayer()) shell.mountSlidePlayer(session.slides);
        if (step.meta && typeof step.meta.slide === "number") shell.getPlayer().goto(step.meta.slide);
        shell.setState("正在讲解第 " + (((step.meta && step.meta.slide) || 0) + 1) + " 页…");
        autoTimer = setTimeout(() => { curStep += 1; playNext(); }, 2400);
        return;
      }
      if (step.kind === "question") {
        awaiting = true;
        shell.setState("轮到学生回答，请在下方输入或点击 🎤 语音作答");
        shell.setInputEnabled(true);
        const ib = shell.getInputBox(); if (ib) ib.focus();
        return;
      }
      if (step.kind === "quiz") {
        shell.setState("随堂测验进行中，请逐题作答…");
        shell.setInputEnabled(false);
        shell.showQuiz(() => '<div id="cr-qz-mount"></div>');
        const host = document.getElementById("cr-qz-mount");
        U.mountQuizRunner(session.quiz.items, host, {
          onAnswer: (ok) => { stat.answered += 1; stat.participation += 1; refreshStatus(); },
          onDone: (r) => {
            stat.quizScore = r.score; stat.quizTotal = r.total; refreshStatus();
            shell.setState("测验完成，助教进行课堂小结…");
            // 逐题播报步骤已在测验面板整体完成，跳过 quizQ 步骤
            let ahead = curStep + 1;
            while (ahead < session.steps.length && session.steps[ahead].kind === "quizQ") ahead += 1;
            curStep = ahead;
            autoTimer = setTimeout(playNext, 900);
          },
        });
        return;
      }
      if (step.kind === "close") shell.setState("课堂结束，可生成课堂报告");
      else if (step.kind === "summary") shell.setState("助教进行课堂小结");
      else if (step.kind === "ask") shell.setState("同学提问互动");
      else if (step.kind === "explain") shell.setState("助教讲解中");
      else shell.setState("AI 老师讲解中");
      autoTimer = setTimeout(() => { curStep += 1; playNext(); }, step.kind === "ask" || step.kind === "explain" ? 1100 : 1400);
    }

    function handleAnswer(text) {
      if (!session || !shell || !awaiting) return;
      const step = session.steps[curStep];
      awaiting = false;
      shell.setInputEnabled(false);
      stat.participation += 1;
      refreshStatus();
      shell.say("user", "学生", "🙋", text, "answer");
      const ref = (step.meta && step.meta.ref) || "";
      const g = E.gradeKeyword(text, ref);
      stat.answered += 1;
      if (g.score >= 60) stat.correct += 1;
      stat.openScore += Math.round(g.score / 10);
      refreshStatus();
      const fb = g.miss && g.miss.length
        ? "批改：命中关键词 " + (g.hit.join("、") || "（无）") + "；还可补充 " + g.miss.join("、") + "。本题得 " + g.score + " 分。"
        : "批改：回答完整，命中全部关键词，得 " + g.score + " 分！";
      shell.say("teacher", "AI 老师", "🧑‍🏫", fb, "explain");
      shell.setState("批改完成，继续课堂…");
      autoTimer = setTimeout(() => { curStep += 1; playNext(); }, 1200);
    }

    function finishStream() {
      stopAuto();
      if (!shell) return;
      shell.setInputEnabled(false);
      stat.durationSec = Math.round((Date.now() - session._start) / 1000);
      shell.setState("课堂结束，点击「结束并生成课堂报告」查看学习数据");
      U.success("课堂结束，可生成课堂报告了。");
    }

    $("classroom-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      stopAuto();
      const stageId = $("classroom-stage").value;
      const stage = C.stages.find((s) => s.id === stageId);
      const subject = $("classroom-subject").value;
      const topic = $("classroom-topic").value.trim() || subject;
      if (topic.length > 80) { U.warn("主题太长了，请控制在 80 字以内。"); return; }
      const btn = $("classroom-start-btn");
      btn.disabled = true; btn.textContent = "课堂准备中…";
      await new Promise((r) => setTimeout(r, 30));
      const lesson = E.generateLesson({ stageName: stage.name, grade: "", subject, version: "", chapter: "", topic });
      session = E.makeClassroom({ lesson, subject, topic, quizCount: 5 });
      session._start = Date.now();
      stat = { steps: session.count, answered: 0, correct: 0, participation: 0, quizScore: 0, quizTotal: 0, durationSec: 0, openScore: 0 };
      curStep = 0;
      $("classroom-result-title").textContent = "AI 课堂 · " + topic;
      $("classroom-result").hidden = false;
      $("classroom-report").hidden = true;
      shell = U.mountClassroomShell(session, $("classroom-shell"), { onUserText: handleAnswer });
      // 实时共享白板（同课堂多标签页自动同步）
      if (board) { board.destroy(); board = null; }
      const boardBox = $("classroom-board-host");
      if (boardBox && window.QIKE_BOARD) {
        const bwrap = document.createElement("div");
        boardBox.appendChild(bwrap);
        board = U.mountBoard(bwrap, { channel: "qike-classroom-board" });
      }
      addHistory(session);
      saveRecent(session);
      btn.disabled = false; btn.textContent = "再开一堂课";
      U.success("课堂就绪 · 共 " + session.count + " 步 · 随堂测验 " + session.quiz.count + " 题 · 白板可随讲随写");
      playNext();
    });

    $("classroom-report-btn").addEventListener("click", () => {
      if (!session || !shell) { U.warn("请先开始一场 AI 课堂。"); return; }
      stopAuto();
      stat.durationSec = Math.round((Date.now() - session._start) / 1000);
      const report = E.classroomReport(session, stat);
      U.renderReport(report, $("classroom-report"));
      $("classroom-report").hidden = false;
      $("classroom-report").scrollIntoView({ behavior: "smooth", block: "nearest" });
      U.success("课堂报告已生成");
    });

    $("classroom-open-webhook").addEventListener("click", async () => {
      if (!session) { U.warn("请先开始一场 AI 课堂。"); return; }
      const wh = (state.settings && state.settings.webhooks) || {};
      if (!(wh.feishu || wh.slack || wh.telegram)) {
        U.warn("尚未配置开课渠道，请到「设置 > 一键开课渠道」填写 Webhook / Token。");
        return;
      }
      const results = await sendClassroomNotice(session);
      const msg = results.map((r) => r.ch + (r.ok ? " ✓" : " ✗" + (r.status ? "（HTTP " + r.status + "）" : r.error ? "（" + r.error + "）" : ""))).join("  ");
      if (results.every((r) => r.ok)) U.success("开课通知已推送：" + msg);
      else U.warn("部分渠道未送达：" + msg);
    });

    $("classroom-copy-link").addEventListener("click", () => {
      const link = classroomShareLink();
      copyTextToClipboard(link, () => U.success("课堂链接已复制：" + link));
    });
  }

  /* ---------- 一键开课（飞书 / Slack / Telegram） ---------- */
  function classroomShareLink() {
    const base = location.href.split("#")[0];
    return base + "#classroom";
  }
  function buildClassNotice(session) {
    const topic = (session && session.meta && session.meta.topic) || "AI 课堂";
    const subject = (session && session.meta && session.meta.subject) || "";
    const link = classroomShareLink();
    return "【启课智能教学台 · 开课通知】\n📚 课题：" + topic + (subject ? "（" + subject + "）" : "") + "\n🔗 课堂链接：" + link + "\n🕐 " + new Date().toLocaleString("zh-CN", { hour12: false });
  }
  async function sendClassroomNotice(session) {
    const wh = (state.settings && state.settings.webhooks) || {};
    const text = buildClassNotice(session);
    const tasks = [];
    if (wh.feishu) {
      tasks.push({
        ch: "飞书",
        fn: () => fetch(wh.feishu, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msg_type: "text", content: { text } }) }),
      });
    }
    if (wh.slack) {
      tasks.push({
        ch: "Slack",
        fn: () => fetch(wh.slack, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }),
      });
    }
    if (wh.telegram) {
      tasks.push({
        ch: "Telegram",
        fn: async () => {
          if (/^https?:\/\//i.test(wh.telegram)) {
            const sep = wh.telegram.includes("?") ? "&" : "?";
            return fetch(wh.telegram + sep + "text=" + encodeURIComponent(text));
          }
          // 仅 token：getUpdates 找最近的 chat_id（需先给机器人发过消息）
          const upd = await (await fetch("https://api.telegram.org/bot" + wh.telegram + "/getUpdates")).json();
          const msgs = (upd && upd.result) || [];
          const chat = msgs.length ? (msgs[msgs.length - 1].message || {}).chat : null;
          if (!chat) throw new Error("NO_CHAT");
          return fetch("https://api.telegram.org/bot" + wh.telegram + "/sendMessage?chat_id=" + chat.id + "&text=" + encodeURIComponent(text));
        },
      });
    }
    const results = [];
    for (const t of tasks) {
      try {
        const r = await t.fn();
        results.push({ ch: t.ch, ok: r.ok, status: r.status });
      } catch (e) {
        results.push({ ch: t.ch, ok: false, error: e && e.message === "NO_CHAT" ? "机器人暂无会话，请先在 Telegram 向其发一条消息" : "网络错误或地址无效" });
      }
    }
    return results;
  }
  function copyTextToClipboard(text, okCB) {
    const done = () => { if (okCB) okCB(); };
    const fallback = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch (e) { U.warn("复制失败，请手动复制链接：" + text); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  /* ---------- 作业表单 ---------- */
  function initHomework() {
    bindCascade("homework");
    $("homework-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const stageId = $("homework-stage").value;
      const stage = C.stages.find((s) => s.id === stageId);
      const subject = $("homework-subject").value;
      const topic = $("homework-topic").value.trim() || $("homework-subject").value;
      const chapter = "";
      const level = $("homework-level").value;
      const count = $("homework-count").value;
      const withAnswer = $("homework-answer").value;
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = "生成中…";
      const art = await runGenerate("homework", { stageName: stage.name, subject, chapter, topic }, () =>
        E.generateHomework({ stageName: stage.name, subject, chapter, topic, level, count, withAnswer }));
      if (art) { btn.disabled = false; btn.textContent = "生成分层作业"; }
    });
    $("homework-print").addEventListener("click", () => {
      if (state.lastArt.homework) U.printArt(state.lastArt.homework, "分层作业");
    });
    $("homework-export-pptx").addEventListener("click", () => {
      const art = state.lastArt.homework;
      if (!art) { U.warn("请先生成分层作业，再导出文件。"); return; }
      const r = window.QIKE_EXPORT.exportPPTX(art, "qike-homework-" + window.QIKE_EXPORT.safeName(art.title) + ".pptx");
      U.success(r.ok ? "PPTX 已导出：" + r.slides + " 页（按分层分页）" : "导出失败：" + r.reason);
    });
    $("homework-export-html").addEventListener("click", () => {
      const art = state.lastArt.homework;
      if (!art) { U.warn("请先生成分层作业，再导出文件。"); return; }
      const r = window.QIKE_EXPORT.exportHTML(art, "qike-homework-" + window.QIKE_EXPORT.safeName(art.title) + ".html", {
        qa: art.items, quizTitle: art.withAnswer ? "参考答案" : "作业题目",
      });
      U.success(r.ok ? "HTML 已导出：" + (art.withAnswer ? "含参考答案" : "题目版（不含答案）") : "导出失败");
    });
  }

  /* ---------- 几何表单 ---------- */
  function initGeometry() {
    const typeSel = $("geometry-type");
    const shapeSel = $("geometry-shape");
    const options = {
      triangle: ["scalene", "right", "isosceles", "equilateral"],
      quad: ["rectangle", "square", "rhombus", "trapezoid", "parallelogram"],
      circle: ["circle"],
    };
    function fillShape() {
      const type = typeSel.value;
      const shapes = options[type] || options.triangle;
      shapeSel.innerHTML = "";
      const labels = {
        scalene: "任意三角形", right: "直角三角形", isosceles: "等腰三角形", equilateral: "等边三角形",
        rectangle: "矩形", square: "正方形", rhombus: "菱形", trapezoid: "梯形", parallelogram: "平行四边形", circle: "圆（半径可调）",
      };
      shapes.forEach((s) => {
        const o = document.createElement("option"); o.value = s; o.textContent = labels[s] || s;
        shapeSel.appendChild(o);
      });
    }
    typeSel.addEventListener("change", fillShape);
    fillShape();
    $("geometry-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const type = typeSel.value;
      const shape = shapeSel.value === "circle" ? "circle" : shapeSel.value;
      const size = Number($("geometry-size").value) || 220;
      const art = E.generateGeometry({ type, shape, size });
      renderArtifact(art);
      addHistory(art);
      U.success(art.allPass ? "图形建模、渲染、验证全部通过" : "验证未全部通过，请调整参数");
    });
    $("geometry-download-svg").addEventListener("click", () => {
      if (!state.lastGeo) return;
      const svg = E.renderSVG(state.lastGeo);
      U.downloadText("qike-geometry.svg", svg, "image/svg+xml;charset=utf-8");
      U.success("SVG 已下载，可直接插入 Word / PPT / 课件");
    });
    $("geometry-print").addEventListener("click", () => {
      if (!state.lastGeo) return;
      const art = state.lastGeo;
      const win = window.open("", "_blank");
      if (!win) { U.warn("浏览器拦截了打印窗口，请允许弹出窗口后重试。"); return; }
      const checks = art.checks.map((c) => `<div>${c.pass ? "✓" : "✗"} ${U.esc(c.name)}（${U.esc(c.detail)}）</div>`).join("");
      win.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>几何图形 · ${U.esc(art.shape)}</title>
        <style>body{font-family:sans-serif;margin:34px}h1{border-bottom:2px solid #1457d9;padding-bottom:8px}
        .ok{color:#179863;font-weight:700}.fail{color:#d23b3b;font-weight:700}</style></head>
        <body><h1>几何图形 · ${U.esc(art.shape)}</h1>
        <div>验证结果：${art.allPass ? '<span class="ok">全部通过</span>' : '<span class="fail">有未通过项</span>'}</div>
        <div style="margin:24px 0">${E.renderSVG(art)}</div>
        <h2>验证报告</h2>${checks}</body></html>`);
      win.document.close();
      setTimeout(() => win.print(), 200);
    });
  }

  /* ---------- 模拟实验表单 ---------- */
  function initExperiment() {
    const sel = $("experiment-select");
    const exps = (window.QIKE_DATA && window.QIKE_DATA.experiments) || {};
    // 填充三款实验下拉
    sel.innerHTML = Object.keys(exps).map((id) => {
      const e = exps[id];
      if (!e || !e.id) return "";
      return '<option value="' + id + '">' + (e.icon || "🧪") + " " + U.esc(e.title) + "（" + U.esc(e.subject) + "）</option>";
    }).join("");
    sel.addEventListener("change", () => {
      // 切换实验：清空旧结果区并复位
      if (experimentRun) { experimentRun.destroy(); experimentRun = null; }
      $("experiment-result").hidden = true;
      state.lastArt.experiment = null;
    });
    $("experiment-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const kind = sel.value;
      if (!exps[kind]) { U.warn("请选择一款实验。"); return; }
      let art;
      try {
        art = E.makeExperiment(kind);
      } catch (err) {
        U.error("实验初始化失败：" + err.message);
        return;
      }
      renderArtifact(art);
      addHistory(art);
      saveRecent(art);
      U.success(art.allPass ? "实验已运行：" + art.title + "，确定性断言全部通过" : "实验已运行，部分断言未通过，请调整参数观察");
      $("experiment-run-btn").blur();
    });
    $("experiment-reset-btn").addEventListener("click", () => {
      const kind = sel.value;
      if (!state.lastArt.experiment) { U.warn("请先运行实验。"); return; }
      const art = E.makeExperiment(kind);   // 默认参数 = 重置
      renderArtifact(art);
      U.success("参数已重置为默认值");
    });
    $("experiment-print").addEventListener("click", () => {
      const art = state.lastArt.experiment;
      if (!art) { U.warn("请先运行实验，再打印实验记录。"); return; }
      // 打印当前滑杆状态下的最新结果
      const cur = experimentRun ? E.runExperiment(art.expId, experimentRun.getVals()) : art;
      U.printArtV2(cur, "实验记录 · " + cur.title);
    });
  }

  /* ---------- PBL 项目学习表单 ---------- */
  function initPBL() {
    bindCascade("pbl");
    $("pbl-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const stageId = $("pbl-stage").value;
      const stage = C.stages.find((s) => s.id === stageId);
      const subject = $("pbl-subject").value;
      const topic = $("pbl-topic").value.trim();
      const period = Number($("pbl-period").value) || 8;
      const size = Number($("pbl-size").value) || 4;
      if (!topic) { U.warn("请填写项目主题，例如“校园水资源的调查报告”。"); return; }
      if (topic.length > 60) { U.warn("项目主题请控制在 60 字以内。"); return; }
      const btn = $("pbl-gen-btn");
      btn.disabled = true; btn.textContent = "生成中…";
      let art;
      try {
        art = E.makePBL({ stageName: stage.name, subject, topic, chapter: "", period, size });
      } catch (err) {
        U.error("项目方案生成失败：" + err.message);
        btn.disabled = false; btn.textContent = "生成项目方案";
        return;
      }
      renderArtifact(art);
      addHistory(art);
      saveRecent(art);
      U.success("已生成 PBL 项目方案：驱动问题 → 里程碑 → 任务卡 → 评价量表");
      btn.disabled = false; btn.textContent = "生成项目方案";
    });
    $("pbl-print").addEventListener("click", () => {
      const art = state.lastArt.pbl;
      if (!art) { U.warn("请先生成项目方案，再打印导出。"); return; }
      U.printArtV2(art, "PBL 项目方案 · " + art.meta.topic);
    });
    $("pbl-export-pptx").addEventListener("click", () => {
      const art = state.lastArt.pbl;
      if (!art) { U.warn("请先生成项目方案，再导出文件。"); return; }
      const r = window.QIKE_EXPORT.exportPPTX(art, "qike-pbl-" + window.QIKE_EXPORT.safeName(art.title) + ".pptx");
      U.success(r.ok ? "PPTX 已导出：" + r.slides + " 页（驱动问题→里程碑→任务卡→量表）" : "导出失败：" + r.reason);
    });
    $("pbl-export-html").addEventListener("click", () => {
      const art = state.lastArt.pbl;
      if (!art) { U.warn("请先生成项目方案，再导出文件。"); return; }
      const r = window.QIKE_EXPORT.exportHTML(art, "qike-pbl-" + window.QIKE_EXPORT.safeName(art.title) + ".html", { qa: [], quizTitle: "" });
      U.success(r.ok ? "HTML 已导出，可离线打开" : "导出失败");
    });
  }

  /* ---------- 联网搜索面板（DDG 即时答案内联 + 新标签兜底） ---------- */
  function initSearch() {
    const S = window.QIKE_SEARCH;
    if (!S) return;
    const q = $("search-q");
    const engineSel = $("search-engine");
    const paper = $("search-paper");
    const result = $("search-result");
    const openBtn = $("search-open");

    function runSearch() {
      const query = q.value.trim();
      if (!query) { U.warn("请输入搜索关键词。"); return; }
      const btn = $("search-go");
      btn.disabled = true; btn.textContent = "搜索中…";
      result.hidden = true;
      S.search(query, (res) => {
        btn.disabled = false; btn.textContent = "搜索";
        result.hidden = false;
        $("search-result-title").textContent = "“" + query + "” 的搜索结果";
        if (!res.ok) {
          paper.innerHTML =
            '<div class="search-empty">' +
            '<div class="search-empty-ico">📡</div>' +
            '<p>' + U.esc(res.error || "搜索不可用") + "</p>" +
            '<p class="mini-hint">可点击右上角“在新标签页打开原文引擎”继续搜索。</p></div>';
          openBtn.hidden = false;
          return;
        }
        if (!res.hasContent) {
          paper.innerHTML =
            '<div class="search-empty">' +
            '<div class="search-empty-ico">🤔</div>' +
            '<p>内联摘要没有直接命中，试试换一组关键词，或在新标签页继续搜索。</p></div>';
          openBtn.hidden = false;
          return;
        }
        let h = "";
        // 即时答案（可能为短答案或头条词条名）
        if (res.headline || res.abstract) {
          h += '<div class="search-answer">';
          if (res.headline) h += '<div class="search-headline">' + U.esc(res.headline) + "</div>";
          if (res.abstract) h += "<p>" + U.esc(res.abstract) + "</p>";
          if (res.abstractUrl) h += '<a class="search-src" href="' + U.esc(res.abstractUrl) + '" target="_blank" rel="noopener">查看百科原文 ↗</a>';
          h += "</div>";
        }
        if (res.topics && res.topics.length) {
          h += '<div class="search-related"><div class="search-related-title">相关话题</div><ul>';
          res.topics.forEach((t) => {
            h += "<li><a href='" + U.esc(t.url) + "' target='_blank' rel='noopener'>" + U.esc(t.text) + "</a></li>";
          });
          h += "</ul></div>";
        }
        paper.innerHTML = h;
        openBtn.hidden = false;
      });
    }

    $("search-form").addEventListener("submit", (e) => { e.preventDefault(); runSearch(); });
    openBtn.addEventListener("click", () => {
      const query = q.value.trim();
      if (!query) { U.warn("请先输入搜索关键词。"); return; }
      S.openExternal(query, engineSel.value);
    });
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } });
  }

  /* ---------- 设置 ---------- */
  function migrateSettings(raw) {
    // v1 单模型设置 → v2 多模型路由
    const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!raw || typeof raw !== "object") return s;
    s.engine = raw.engine === "api" ? "api" : (raw.engine === "hybrid" ? "hybrid" : "local");
    const slots = raw.slots || {};
    if (raw.url || raw.model || raw.key) {
      slots.A = { url: raw.url || "", model: raw.model || "", key: raw.key || "" };
    }
    s.slots = {
      A: { url: (slots.A && slots.A.url) || "", model: (slots.A && slots.A.model) || "", key: (slots.A && slots.A.key) || "" },
      B: { url: (slots.B && slots.B.url) || "", model: (slots.B && slots.B.model) || "", key: (slots.B && slots.B.key) || "" },
      C: { url: (slots.C && slots.C.url) || "", model: (slots.C && slots.C.model) || "", key: (slots.C && slots.C.key) || "" },
    };
    s.route = Object.assign({ lesson: "A", classroom: "B", experiment: "C" }, raw.route || {});
    s.webhooks = Object.assign({ feishu: "", slack: "", telegram: "" }, raw.webhooks || {});
    s.voice = Object.assign({ tts: true, stt: true }, raw.voice || {});
    for (const k of ["lesson", "classroom", "experiment"]) {
      if (!["A", "B", "C"].includes(s.route[k])) s.route[k] = DEFAULT_SETTINGS.route[k];
    }
    return s;
  }
  function pickSlot(scene) {
    const routes = state.settings.route || DEFAULT_SETTINGS.route;
    const id = routes[scene] || "A";
    return state.settings.slots[id] || state.settings.slots.A;
  }
  function loadSettings() {
    state.settings = migrateSettings(Store.get("settings", {}));
    $("set-engine").value = state.settings.engine;
    const slotMap = { "set-slot-a": "A", "set-slot-b": "B", "set-slot-c": "C" };
    Object.keys(slotMap).forEach((p) => {
      const s = state.settings.slots[slotMap[p]] || { url: "", model: "", key: "" };
      $(p + "-url").value = s.url || "";
      $(p + "-model").value = s.model || "";
      $(p + "-key").value = s.key || "";
    });
    const routeMap = { "route-lesson": "lesson", "route-classroom": "classroom", "route-experiment": "experiment" };
    Object.keys(routeMap).forEach((p) => { $(p).value = state.settings.route[routeMap[p]] || "A"; });
    $("set-webhook-feishu").value = (state.settings.webhooks && state.settings.webhooks.feishu) || "";
    $("set-webhook-slack").value = (state.settings.webhooks && state.settings.webhooks.slack) || "";
    $("set-webhook-telegram").value = (state.settings.webhooks && state.settings.webhooks.telegram) || "";
    const vc = state.settings.voice || { tts: true, stt: true };
    $("set-voice-tts").checked = vc.tts !== false;
    $("set-voice-stt").checked = vc.stt !== false;
    applyVoiceCfg();
  }
  function applyVoiceCfg() {
    const vc = state.settings.voice || { tts: true, stt: true };
    const V = window.QIKE_VOICE;
    if (V && V.setCfg) V.setCfg({ tts: vc.tts !== false, stt: vc.stt !== false });
  }
  function collectSettings() {
    const slotMap = { "set-slot-a": "A", "set-slot-b": "B", "set-slot-c": "C" };
    const slots = {};
    Object.keys(slotMap).forEach((p) => {
      slots[slotMap[p]] = {
        url: $(p + "-url").value.trim(),
        model: $(p + "-model").value.trim(),
        key: $(p + "-key").value.trim(),
      };
    });
    const routeMap = { "route-lesson": "lesson", "route-classroom": "classroom", "route-experiment": "experiment" };
    const route = {};
    Object.keys(routeMap).forEach((p) => { route[routeMap[p]] = $(p).value; });
    return {
      engine: $("set-engine").value,
      slots,
      route,
      webhooks: {
        feishu: $("set-webhook-feishu").value.trim(),
        slack: $("set-webhook-slack").value.trim(),
        telegram: $("set-webhook-telegram").value.trim(),
      },
      voice: { tts: $("set-voice-tts").checked, stt: $("set-voice-stt").checked },
    };
  }
  function initSettings() {
    $("btn-settings").addEventListener("click", () => $("settings-drawer").hidden = false);
    $("btn-help").addEventListener("click", () => $("help-drawer").hidden = false);
    document.querySelectorAll(".drawer [data-close]").forEach((el) => {
      el.addEventListener("click", () => el.closest(".drawer").hidden = true);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".drawer").forEach((d) => { d.hidden = true; });
        const navMobile = $("topnav");
        if (navMobile.classList.contains("open")) navMobile.classList.remove("open");
      }
    });
    $("settings-save").addEventListener("click", () => {
      state.settings = collectSettings();
      Store.set("settings", state.settings);
      applyVoiceCfg();
      U.success("设置已保存（仅存于本机浏览器）");
      $("settings-drawer").hidden = true;
    });
    $("settings-reset").addEventListener("click", () => {
      state.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      Store.set("settings", state.settings);   // 先落盘，避免 loadSettings 重读旧值覆盖
      loadSettings();
      U.success("已恢复默认：本地引擎");
    });
  }

  /* ---------- 移动端汉堡 ---------- */
  function initMobileNav() {
    // 移动端用汉堡按钮：在 640px 以下把 brand 右侧显示汉堡。简易方案：点击品牌区域切换菜单
    const toggle = document.createElement("button");
    toggle.id = "nav-toggle";
    toggle.className = "icon-btn";
    toggle.setAttribute("aria-label", "菜单");
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
    const actions = document.querySelector(".topbar-actions");
    actions.insertBefore(toggle, actions.firstChild);
    toggle.addEventListener("click", () => {
      const menu = $("topnav");
      const open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.addEventListener("click", () => {
        const menu = $("topnav");
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- 快速入口 & 启动 ---------- */
  function initQuickCards() {
    document.querySelectorAll(".quick-card").forEach((c) => {
      c.addEventListener("click", () => switchView(c.dataset.goto));
    });
  }

  function init() {
    initLesson(); initLecture(); initInteractive(); initClassroom(); initHomework(); initGeometry(); initExperiment(); initPBL(); initSearch();
    initSettings(); initMobileNav(); initQuickCards();
    // 导航
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.addEventListener("click", () => switchView(b.dataset.view));
    });
    $("btn-clear-history").addEventListener("click", clearHistory);
    $("history-list").addEventListener("click", (e) => {
      const openBtn = e.target.closest(".h-open");
      const delBtn = e.target.closest(".h-del");
      if (openBtn) openHistory(openBtn.dataset.id);
      else if (delBtn) deleteHistory(delBtn.dataset.id);
    });
    state.history = Store.get("history", []);
    renderHistory();
    loadSettings();
    const want = location.hash.replace(/^#/, "");
    switchView(document.getElementById("view-" + want) ? want : "dashboard");
    // 亲和力欢迎语
    const hour = new Date().getHours();
    const greet = hour < 6 ? "夜深了，备课辛苦了" : hour < 12 ? "早上好，新的一天从好课开始" : hour < 18 ? "下午好，备完课也别忘了休息" : "晚上好，今天的课堂辛苦了";
    const kicker = document.getElementById("dashboard-title");
    if (kicker && !kicker.dataset.custom) kicker.textContent = greet + " 👋";
  }

  document.addEventListener("DOMContentLoaded", init);
})();