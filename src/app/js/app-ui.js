/* ============================================================
 * app-ui.js · UI 工具：toast、渲染器、打印/下载
 * ============================================================ */
window.QIKE_UI = (function () {
  "use strict";

  const ENGINE = window.QIKE_ENGINE;

  /* ---------- Toast ---------- */
  function toast(msg, type) {
    const region = document.getElementById("toast-region");
    if (!region) return;
    const el = document.createElement("div");
    el.className = "toast" + (type === "warn" ? " toast-warn" : type === "err" ? " toast-err" : "");
    el.textContent = msg;
    region.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .4s";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 420);
    }, 3600);
  }
  const success = (m) => toast(m, "ok");
  const warn = (m) => toast(m, "warn");
  const error = (m) => toast(m, "err");

  /* ---------- HTML 转义 ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------- 渲染：课件 ---------- */
  function renderLesson(art, container) {
    const meta = art.meta;
    let h = "";
    h += `<h1>${esc(art.title)}</h1>`;
    h += `<p class="paper-meta">${esc(art.subtitle)}</p>`;
    h += `<p class="paper-meta">${esc(meta.stage)} · ${esc(meta.subject)} · ${esc(meta.version)} · ${esc(meta.chapter)}</p>`;
    h += `<h2>教学目标</h2><ul>`;
    art.objectives.forEach((o) => { h += `<li><b>${esc(o.key)}目标</b>：${esc(o.text)}</li>`; });
    h += `</ul>`;
    art.sections.forEach((s, i) => {
      h += `<h2>${i + 1}. ${esc(s.t)}</h2><h3>${esc(s.head)}</h3>`;
      if (Array.isArray(s.body)) {
        h += `<ul>`;
        s.body.forEach((b) => { h += `<li>${esc(b)}</li>`; });
        h += `</ul>`;
      } else {
        h += `<p>${esc(s.body)}</p>`;
      }
    });
    container.innerHTML = h;
  }

  /* ---------- 渲染：互动 ---------- */
  function renderInteractive(art, container) {
    let h = "";
    h += `<h1>${esc(art.title)}</h1>`;
    h += `<p class="paper-meta">${esc(art.meta.stage)} · ${esc(art.meta.subject)}${art.meta.topic ? " · " + esc(art.meta.topic) : ""}</p>`;
    h += `<h2>活动规则</h2><p>${esc(art.rules)}</p>`;
    if (art.items) {
      h += `<h2>题目清单（共 ${art.items.length} 题）</h2><ol>`;
      art.items.forEach((it) => {
        h += `<li class="paper-qa"><div class="qa-q">${it.no}. ${esc(it.q)}</div>`;
        if (it.a) h += `<div style="font-size:13px;color:#5f6672;margin-top:4px">${esc(it.a)}</div>`;
        h += `</li>`;
      });
      h += `</ol>`;
    }
    if (art.tasks) {
      h += `<h2>任务包</h2><ol>`;
      art.tasks.forEach((t) => { h += `<li><b>${esc(t.t)}</b>：${esc(t.desc)}</li>`; });
      h += `</ol>`;
    }
    container.innerHTML = h;
  }

  /* ---------- 渲染：作业 ---------- */
  function renderHomework(art, container) {
    let h = "";
    h += `<h1>${esc(art.title)}</h1>`;
    h += `<p class="paper-meta">${esc(art.subtitle)}</p>`;
    h += `<p class="paper-meta">分层：基础 ${art.plan.basic} 题 · 提升 ${art.plan.mid} 题 · 拓展 ${art.plan.hard} 题${art.withAnswer ? "" : "（本卷未附答案）"}</p>`;
    let cur = "";
    art.items.forEach((it) => {
      if (it.layer !== cur) {
        const nm = { basic: "一、基础巩固", mid: "二、能力提升", hard: "三、拓展挑战" }[it.layer];
        h += `<h2>${nm}</h2>`;
        cur = it.layer;
      }
      const tag = { basic: "基础", mid: "提升", hard: "拓展" }[it.layer];
      const tagCls = { basic: "level-basic", mid: "level-mid", hard: "level-hard" }[it.layer];
      const layerLabel = { basic: "基础巩固", mid: "能力提升", hard: "拓展挑战" }[it.layer];
      h += `<div class="paper-qa"><span class="level-tag ${tagCls}">${tag}</span>`;
      h += `<div class="qa-q">${it.no}. ${esc(it.q.replace("【" + layerLabel + "】", ""))}</div>`;
      if (it.a) h += `<div style="font-size:13px;color:#5f6672;margin-top:6px"><b>参考答案：</b>${esc(it.a)}</div>`;
      h += `</div>`;
    });
    container.innerHTML = h;
  }

  /* ---------- 渲染：几何 ---------- */
  function renderGeometry(art /*, container */) {
    const svg = ENGINE.renderSVG(art);
    const model = art.model;
    let h = "";
    h += `<h3>M1 · 符号化建模</h3>`;
    if (model.vertices) {
      Object.keys(model.vertices).forEach((k) => {
        const v = model.vertices[k];
        h += `<div class="geo-model-line">${k}(${v.x.toFixed(2)}, ${v.y.toFixed(2)})</div>`;
      });
    }
    if (model.sides) {
      if (Array.isArray(model.sides)) {
        h += `<div class="geo-model-line">四边等长 ≈ ${model.sides[0]}</div>`;
      } else {
        Object.keys(model.sides).forEach((k) => {
          h += `<div class="geo-model-line">边长 ${k} = ${model.sides[k]}</div>`;
        });
      }
    }
    if (model.angles) {
      h += `<div class="geo-model-line">角度：A=${model.angles.A}° B=${model.angles.B}° C=${model.angles.C}°</div>`;
    }
    if (model.center) {
      h += `<div class="geo-model-line">圆心(${model.center.x}, ${model.center.y}) 半径 r=${model.radius}</div>`;
    }
    h += `<h3>M2 · 确定性渲染</h3>`;
    h += `<div class="formula">${svg}</div>`;
    h += `<h3>M3 · 验证器断言</h3>`;
    art.checks.forEach((c) => {
      const cls = c.pass ? "vpass" : "vfail";
      const mark = c.pass ? "✓ 通过" : "✗ 未通过";
      h += `<div><span class="${cls}">${mark}</span> ${esc(c.name)}<br><small style="color:#7d8ca9">${esc(c.detail)}</small></div>`;
    });
    h += `<div style="margin-top:10px;font-weight:800;color:${art.allPass ? "#179863" : "#d23b3b"}">${art.allPass ? "验证全部通过：图形与设定一致，可直接用于课件与作业。" : "存在未通过断言，请调整参数。"}</div>`;
    // 单独挂 SVG 供下载 + 报告
    const canvas = document.getElementById("geometry-canvas");
    if (canvas) canvas.innerHTML = `<div class="svg-standalone">${svg}</div>`;
    const reportEl = document.getElementById("geometry-report");
    if (reportEl) reportEl.innerHTML = h;
    return h;
  }

  /* ---------- 打印 ---------- */
  function printArt(art, title) {
    const win = window.open("", "_blank");
    if (!win) { warn("浏览器拦截了打印窗口，请允许弹出窗口后重试。"); return; }
    let body = "";
    const container = document.createElement("div");
    if (art.kind === "lesson" || art.kind === "lecture") renderLesson(art, container);
    else if (art.kind === "interactive") renderInteractive(art, container);
    else if (art.kind === "homework") renderHomework(art, container);
    const css = `body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#1c2433;margin:34px;line-height:1.75}
      h1{font-size:22px;border-bottom:2px solid #1457d9;padding-bottom:8px}
      h2{font-size:16px;color:#1457d9;margin-top:22px}h3{font-size:14px;color:#333}
      .meta{color:#7d8ca9;font-size:12.5px;margin:4px 0}li{margin:5px 0}
      @media print{body{margin:16mm}}`;
    win.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${esc(title)}</title>
      <style>${css}</style></head><body><h1>${esc(art.title)}</h1>
      <div class="meta">${esc(art.kind === "lesson" ? art.subtitle + " · " + art.meta.stage : art.meta.stage + " · " + art.meta.subject)}</div>
      ${container.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 260);
  }

  /* ---------- 下载文本 ---------- */
  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
  }

  /* ============================================================
   * v2 · 幻灯片播放器（聚光灯 / 激光笔动画、手动/自动翻页、TTS 讲解）
   * ============================================================ */
  function mountSlides(slides, container, opts) {
    const O = opts || {};
    const n = slides.length;
    let cur = 0;
    let autoTimer = null;
    let spotOn = !!O.spotlight;
    let laserOn = !!O.laser;
    let rate = Number(O.rate) || 0.95;
    let voiceName = O.voiceName || "";
    let follow = false;

    function el(sel) { return container.querySelector(sel); }

    /* 填充中文音色下拉（按需显示） */
    let voiceTries = 0;
    function fillVoices() {
      const v = window.QIKE_VOICE;
      const pick = el(".sp-voicepick");
      const sel = el(".sp-vpick");
      if (!pick || !sel || !v || !v.zhVoices) return;
      const list = v.zhVoices();
      if (!list.length) {
        pick.hidden = true;
        // 语音列表异步加载：短时间重试几次
        if (voiceTries < 4) { voiceTries += 1; setTimeout(fillVoices, 700); }
        return;
      }
      pick.hidden = false;
      const keep = sel.value || voiceName;
      sel.innerHTML = list.map((vo) =>
        '<option value="' + esc(vo.name) + '">' + esc(vo.name) + "</option>").join("");
      if (keep && list.some((vo) => vo.name === keep)) sel.value = keep;
      voiceName = sel.value || voiceName;
    }

    function render() {
      const s = slides[cur] || slides[0];
      let h = "";
      h += '<div class="sp-head"><span class="sp-kicker">' + esc(s.kicker || "") + "</span>";
      h += '<span class="sp-page">' + (cur + 1) + " / " + n + "</span></div>";
      h += '<div class="sp-title">' + esc(s.title || "") + "</div>";
      if (s.sub) h += '<div class="sp-sub">' + esc(s.sub) + "</div>";
      h += '<ul class="sp-bullets">';
      (s.bullets || []).forEach((b) => { h += "<li>" + esc(b) + "</li>"; });
      h += "</ul>";
      const spot = el(".sp-stage");
      if (spot) {
        spot.innerHTML = h + '<div class="sp-mask' + (spotOn ? " on" : "") + '"></div><div class="sp-spot"></div><div class="sp-laser' + (laserOn ? " on" : "") + '"></div>';
      }
      const bar = el(".sp-progress-fill");
      if (bar) bar.style.width = (((cur + 1) / n) * 100) + "%";
      const counter = el(".sp-counter");
      if (counter) counter.textContent = (cur + 1) + " / " + n;
      const prevBtn = el(".sp-prev"), nextBtn = el(".sp-next");
      if (prevBtn) prevBtn.disabled = cur <= 0;
      if (nextBtn) nextBtn.disabled = cur >= n - 1;
      if (O.onChange) O.onChange(cur);
    }

    function goto(i) {
      cur = Math.max(0, Math.min(n - 1, i));
      render();
    }
    function next() { goto(cur + 1); }
    function prev() { goto(cur - 1); }

    function startAuto(sec) {
      stopAuto();
      autoTimer = setInterval(() => {
        if (cur >= n - 1) { stopAuto(); return; }
        next();
      }, (sec || 6) * 1000);
    }
    function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }

    function speakCurrent() {
      const v = window.QIKE_VOICE;
      const s = slides[cur];
      if (!v || !v.ttsEnabled || !v.ttsEnabled() || !s) return false;
      const text = (s.kicker || "") + "，" + (s.title || "") + "。" + (s.bullets || []).slice(0, 3).join("。");
      return v.speak(text, { rate: rate, voiceName: voiceName, onEnd: () => {
        // 跟读模式：讲完自动翻页继续讲解
        if (follow && cur < n - 1) { next(); speakCurrent(); }
        else if (follow && cur >= n - 1) follow = false;
      } });
    }
    function stopSpeak() {
      const v = window.QIKE_VOICE;
      if (v) v.stop();
      follow = false;
    }

    // 指针交互：聚光灯（跟随光亮圆）与激光笔（红点描线）
    function onPointerMove(ev) {
      const stage = el(".sp-stage");
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      const spot = el(".sp-spot"), laser = el(".sp-laser");
      if (spot && spotOn) {
        spot.style.opacity = "1";
        spot.style.left = x + "px"; spot.style.top = y + "px";
      }
      if (laser && laserOn) {
        laser.style.opacity = "1";
        laser.style.left = x + "px"; laser.style.top = y + "px";
      }
    }
    function onPointerLeave() {
      const spot = el(".sp-spot"), laser = el(".sp-laser");
      if (spot) spot.style.opacity = "0";
      if (laser) laser.style.opacity = "0";
    }

    container.innerHTML =
      '<div class="sp-toolbar">' +
      '<div class="sp-progress"><div class="sp-progress-fill"></div></div>' +
      '<div class="sp-tools">' +
      '<button class="btn btn-ghost sp-tool sp-auto">▶ 自动放映</button>' +
      '<button class="btn btn-ghost sp-tool sp-voice">🔊 连续讲解</button>' +
      '<button class="btn btn-ghost sp-tool sp-spot">🔦 聚光灯</button>' +
      '<button class="btn btn-ghost sp-tool sp-laser-btn">🖱️ 激光笔</button>' +
      '<label class="sp-pick sp-ratepick">语速<select class="sp-rate" aria-label="讲解语速">' +
      '<option value="0.75">慢</option><option value="0.95" selected>正常</option><option value="1.2">快</option></select></label>' +
      '<label class="sp-pick sp-voicepick" hidden>音色<select class="sp-vpick" aria-label="讲解音色"></select></label>' +
      "</div></div>" +
      '<div class="sp-stage" tabindex="0" role="group" aria-label="幻灯片"></div>' +
      '<div class="sp-nav"><button class="btn btn-ghost sp-prev" aria-label="上一页">‹ 上一页</button>' +
      '<span class="sp-counter">1 / ' + n + "</span>" +
      '<button class="btn btn-primary sp-next" aria-label="下一页">下一页 ›</button></div>';

    container.querySelector(".sp-auto").addEventListener("click", (e) => {
      if (autoTimer) { stopAuto(); e.currentTarget.textContent = "▶ 自动放映"; }
      else { startAuto(6); e.currentTarget.textContent = "⏸ 停止自动"; }
    });
    container.querySelector(".sp-voice").addEventListener("click", (e) => {
      follow = !follow;
      if (!follow) { stopSpeak(); e.currentTarget.textContent = "🔊 连续讲解"; return; }
      e.currentTarget.textContent = "⏹ 停止讲解";
      const ok = speakCurrent();
      if (!ok) { follow = false; e.currentTarget.textContent = "🔊 连续讲解"; warn("当前浏览器不支持语音合成，已保持文字讲解。"); }
    });
    const rateSel = container.querySelector(".sp-rate");
    if (rateSel) rateSel.addEventListener("change", () => { rate = Number(rateSel.value) || 0.95; });
    const vpick = container.querySelector(".sp-vpick");
    if (vpick) vpick.addEventListener("change", () => { voiceName = vpick.value || ""; });
    container.querySelector(".sp-spot").addEventListener("click", (e) => {
      spotOn = !spotOn; render();
      e.currentTarget.classList.toggle("is-lit", spotOn);
    });
    container.querySelector(".sp-laser-btn").addEventListener("click", (e) => {
      laserOn = !laserOn; render();
      e.currentTarget.classList.toggle("is-lit", laserOn);
    });
    container.querySelector(".sp-stage").addEventListener("pointermove", onPointerMove);
    container.querySelector(".sp-stage").addEventListener("pointerleave", onPointerLeave);
    container.querySelector(".sp-stage").addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    });
    container.querySelector(".sp-prev").addEventListener("click", prev);
    container.querySelector(".sp-next").addEventListener("click", next);

    render();
    fillVoices();
    return { goto, next, prev, startAuto, stopAuto, speakCurrent, stopSpeak, setFollow: (v) => { follow = !!v; }, destroy: () => { stopAuto(); stopSpeak(); } };
  }

  /* ============================================================
   * v2 · 课堂图表文案工具
   * ============================================================ */
  function msgBubble(role, name, avatar, text, kind) {
    const cls = role === "assistant" ? "cr-assistant" : role === "star" ? "cr-star" : role === "doubt" ? "cr-doubt" : role === "base" ? "cr-base" : role === "user" ? "cr-user" : "cr-teacher";
    const kindMark = kind === "ask" ? "💬" : kind === "quiz" ? "📝" : kind === "explain" ? "💡" : kind === "summary" ? "🏁" : kind === "close" ? "🎉" : kind === "question" ? "🙋" : "";
    return '<div class="cr-msg ' + cls + '"><span class="cr-avatar" aria-hidden="true">' + (avatar || "🗣️") + "</span>" +
      '<div class="cr-body"><div class="cr-name">' + esc(name || role) + (kindMark ? ' <span class="cr-kind">' + kindMark + "</span>" : "") + '</div><div class="cr-text">' + esc(text) + "</div></div></div>";
  }

  /* ============================================================
   * v2 · AI 课堂外壳（状态条 + 聊天流 + 输入 + 测验/报告容器）
   * ============================================================ */
  function mountClassroomShell(session, container, hooks) {
    const H = hooks || {};
    const castHtml = (session.cast || []).map((c) =>
      '<div class="cr-cast-item" data-id="' + esc(c.id) + '" title="' + esc(c.persona || c.title || "") + '">' +
      '<span class="cr-cast-avatar">' + esc(c.avatar || "🎭") + "</span>" +
      "<b>" + esc(c.name) + "</b>" +
      "<small>" + esc(c.persona || c.title || "") + "</small></div>").join("");
    container.innerHTML =
      '<div class="cr-top">' +
      '<div class="cr-cast" aria-label="课堂角色">' + castHtml + "</div>" +
      '<div class="cr-statusbar">' +
      '<span class="cr-stat" data-k="step">进度 <b>0/' + session.count + "</b></span>" +
      '<span class="cr-stat" data-k="score">得分 <b>0</b></span>' +
      '<span class="cr-stat" data-k="part">参与 <b>0</b> 次</span>' +
      '<span class="cr-stat cr-state" data-k="state">AI 状态：等待开始</span>' +
      "</div>" +
      '<div class="cr-slidebox" id="cr-slidebox"></div>' +
      "</div>" +
      '<div class="cr-log" id="cr-log" aria-live="polite"></div>' +
      '<div class="cr-quizbox" id="cr-quizbox" hidden></div>' +
      '<div class="cr-reportbox" id="cr-reportbox" hidden></div>' +
      '<div class="cr-input" id="cr-input">' +
      '<input type="text" id="cr-text" placeholder="输入你的回答（或点击 🎤 语音作答）" autocomplete="off">' +
      '<button class="btn btn-ghost cr-mic" id="cr-mic" title="语音作答">🎤</button>' +
      '<button class="btn btn-primary cr-send" id="cr-send">发送</button>' +
      "</div>";

    const log = container.querySelector("#cr-log");
    function say(role, name, avatar, text, kind) {
      const d = document.createElement("div");
      d.innerHTML = msgBubble(role, name, avatar, text, kind);
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
      // 说话高亮对应角色（cast item 的 data-id 与 step.role 对应）
      container.querySelectorAll(".cr-cast-item").forEach((el) => {
        const lit = el.dataset.id === role;
        el.classList.toggle("is-speaking", lit);
        if (lit) { clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("is-speaking"), 1400); }
      });
      return d;
    }
    function setStatus(k, val) {
      const el = container.querySelector('[data-k="' + k + '"] b');
      if (el) el.textContent = val;
    }
    function setState(text) {
      const el = container.querySelector('[data-k="state"]');
      if (el) el.textContent = "AI 状态：" + text;
    }

    const slidebox = container.querySelector("#cr-slidebox");
    let player = null;
    function mountSlidePlayer(slides) {
      slidebox.innerHTML = "";
      player = mountSlides(slides, slidebox, { spotlight: false, laser: false });
      return player;
    }

    const quizbox = container.querySelector("#cr-quizbox");
    function showQuiz(cb) {
      quizbox.hidden = false;
      if (cb) quizbox.innerHTML = cb();
    }
    function hideQuiz() { quizbox.hidden = true; quizbox.innerHTML = ""; }

    const reportbox = container.querySelector("#cr-reportbox");
    function showReport(html) { reportbox.hidden = false; reportbox.innerHTML = html; }
    function hideReport() { reportbox.hidden = true; }

    const inputWrap = container.querySelector("#cr-input");
    const textInput = container.querySelector("#cr-text");
    function setInputEnabled(on) {
      if (textInput) textInput.disabled = !on;
      const send = container.querySelector("#cr-send");
      if (send) send.disabled = !on;
      const mic = container.querySelector("#cr-mic");
      if (mic) mic.disabled = !on;
    }
    container.querySelector("#cr-send").addEventListener("click", () => {
      const v = textInput.value.trim();
      if (!v) return;
      textInput.value = "";
      if (H.onUserText) H.onUserText(v);
    });
    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        container.querySelector("#cr-send").click();
      }
    });
    container.querySelector("#cr-mic").addEventListener("click", () => {
      const VOICE = window.QIKE_VOICE;
      if (!VOICE || !VOICE.sttEnabled || !VOICE.sttEnabled()) { warn("语音答题不可用，请直接打字作答。"); return; }
      setState("正在倾听…");
      VOICE.listen((supported, text, errMsg) => {
        if (text && text.trim()) {
          setState("已识别，正在批改…");
          if (H.onUserText) H.onUserText(text.trim());
        } else {
          setState("未识别到语音");
          if (errMsg) warn(errMsg);
        }
      });
    });

    return {
      say, setStatus, setState, mountSlidePlayer, getPlayer: () => player,
      showQuiz, hideQuiz, showReport, hideReport,
      setInputEnabled, getInputBox: () => textInput,
      destroy() {
        if (player) { try { player.destroy(); } catch (e) { /* ignore */ } }
        container.innerHTML = "";
      },
    };
  }

  /* ============================================================
   * v2 · 随堂测验批改器（逐题作答 + 即时批改 + 解析反馈）
   * ============================================================ */
  function mountQuizRunner(items, container, hooks) {
    const H = hooks || {};
    let idx = 0;
    let score = 0;
    let done = 0;

    function render() {
      const it = items[idx];
      if (!it) { renderResult(); return; }
      let h = '<div class="qz-head"><span class="qz-title">随堂测验 · 第 ' + (idx + 1) + "/" + items.length + " 题</span>" +
        '<span class="qz-score">得分 ' + score + "</span></div>";
      h += '<div class="qz-q">' + esc(it.q) + "</div>";
      h += '<div class="qz-opts">';
      it.opts.forEach((op, i) => {
        h += '<button class="qz-opt" data-i="' + i + '">' + String.fromCharCode(65 + i) + ". " + esc(op) + "</button>";
      });
      h += "</div><div class='qz-feedback' id='qz-feedback'></div>";
      container.innerHTML = h;
      container.querySelectorAll(".qz-opt").forEach((btn) => {
        btn.addEventListener("click", () => pick(Number(btn.dataset.i)));
      });
    }

    function pick(i) {
      const it = items[idx];
      if (it._done) return;
      it._done = true;
      done += 1;
      const ok = i === it.a;
      if (ok) score += 1;
      const opts = container.querySelectorAll(".qz-opt");
      opts.forEach((btn, j) => {
        btn.disabled = true;
        if (j === it.a) btn.classList.add("is-right");
        else if (j === i && !ok) btn.classList.add("is-wrong");
      });
      const fb = container.querySelector("#qz-feedback");
      fb.innerHTML = (ok ? '<span class="qz-ok">✓ 回答正确！</span>' : '<span class="qz-bad">✗ 回答错误，正确答案是 ' + String.fromCharCode(65 + it.a) + "。</span>") +
        '<div class="qz-why">解析：' + esc(it.why || "") + "</div>" +
        (H.onAnswer ? H.onAnswer(ok, it, i) : "");
      const nextBtn = document.createElement("button");
      nextBtn.className = "btn btn-primary qz-next";
      nextBtn.textContent = idx >= items.length - 1 ? "查看成绩" : "下一题";
      nextBtn.addEventListener("click", () => { idx += 1; render(); });
      fb.appendChild(nextBtn);
    }

    function renderResult() {
      const rate = items.length ? Math.round((score / items.length) * 100) : 0;
      const praise = rate >= 90 ? "太棒了，几乎全对！🎉" : rate >= 70 ? "掌握得不错，继续保持！" : rate >= 50 ? "基础还可以，再巩固一下错题。" : "别灰心，对照解析把错题弄懂，再试一次吧。";
      container.innerHTML =
        '<div class="qz-result"><div class="qz-score-big">' + score + " / " + items.length + "</div>" +
        '<div class="qz-rate">正确率 ' + rate + "%</div>" +
        '<div class="qz-praise">' + praise + "</div>" +
        '<button class="btn btn-primary qz-retry">重新作答</button></div>';
      container.querySelector(".qz-retry").addEventListener("click", () => {
        items.forEach((i2) => { i2._done = false; });
        idx = 0; score = 0; done = 0; render();
      });
      if (H.onDone) H.onDone({ score, total: items.length, rate });
    }

    render();
    return { render, getScore: () => ({ score, total: items.length }) };
  }

  /* ============================================================
   * v2 · 实验渲染器（HTML 交互式模拟实验）
   * ============================================================ */
  function mountExperiment(exp, container, hooks) {
    const H = hooks || {};
    let anim = null;
    let animT0 = Date.now();   // 动画时钟基准（确定性：物理时间由该基准 + 公式驱动）
    let last = 0;
    const vals = {};
    exp.params.forEach((p) => { vals[p.key] = p.value; });
    let lastRes = null;   // 由 apply/peek 计算的最新数值断言结果（动画与绘制共用）

    // 画布尺寸
    const CW = 340, CH = 240;
    // 动画节奏（秒）
    const DUR = { projectile: 2.4, spring: 2.0, circlePi: 1.6 };

    function svgFrame(inner) {
      return '<svg viewBox="0 0 ' + CW + " " + CH + '" width="100%" height="240" role="img" aria-label="' + esc(exp.title) + '">' + inner + "</svg>";
    }

    function render() {
      let h = '<div class="exp-card"><div class="exp-head"><span class="exp-icon">' + (exp.icon || "🧪") + "</span>" +
        "<div><h4>" + esc(exp.title) + "</h4><p>" + esc(exp.desc) + "</p></div></div>";
      h += '<div class="exp-body"><div class="exp-stage">' + svgFrame("") + "</div>";
      h += '<div class="exp-side"><div class="exp-controls">';
      exp.params.forEach((p) => {
        h += '<label class="exp-ctrl"><span>' + esc(p.label) + " ：<b data-v=\"" + p.key + '">' + vals[p.key] + "</b></span>" +
          '<input type="range" data-k="' + p.key + '" min="' + p.min + '" max="' + p.max + '" step="' + p.step + '" value="' + vals[p.key] + '"></label>';
      });
      h += "</div><div class='exp-values' id='exp-values'></div><div class='exp-checks' id='exp-checks'></div></div></div></div>";
      container.innerHTML = h;
      container.querySelectorAll("input[type=range][data-k]").forEach((r) => {
        r.addEventListener("input", () => {
          const k = r.dataset.k;
          const v = Number(r.value);
          vals[k] = v;
          const b = container.querySelector('[data-v="' + k + '"]');
          if (b) b.textContent = v;
          animT0 = Date.now();   // 参数变化 → 动画从零重新播放（确定性）
          refresh();
          if (H.onChange) H.onChange(Object.assign({}, vals));
        });
      });
      refresh();
      startAnim();
    }

    function peekRes() { return H.peek ? H.peek(Object.assign({}, vals)) : null; }

    function refresh() {
      // 由调用方更新结果（hooks.apply 计算新值并写回 dom）
      if (H.apply) H.apply(Object.assign({}, vals), (res) => { lastRes = res; renderValuesChecks(res); });
      else { lastRes = peekRes(); renderValuesChecks(lastRes); }
    }
    function renderValuesChecks(res) {
      const vbox = container.querySelector("#exp-values");
      if (vbox && res && res.values) {
        vbox.innerHTML = '<div class="exp-values-title">数值结果</div>' + Object.keys(res.values).map((k) =>
          '<div class="exp-value"><span>' + esc(k) + "</span><b>" + esc(res.values[k]) + "</b></div>").join("");
      }
      const cbox = container.querySelector("#exp-checks");
      if (cbox && res && res.checks) {
        cbox.innerHTML = '<div class="exp-values-title">公式断言</div>' + res.checks.map((c) =>
          '<div class="exp-check ' + (c.pass ? "is-pass" : "is-fail") + '">' + (c.pass ? "✓" : "✗") + " " + esc(c.name) +
          '<span class="exp-check-detail">' + esc(c.detail) + "</span></div>").join("");
      }
    }

    function stageSVG(inner) {
      const stage = container.querySelector(".exp-stage");
      if (stage) stage.innerHTML = svgFrame(inner);
    }

    function drawProjectile(now) {
      const res = lastRes;
      const t = res ? res.extra.t : 2.02;
      const range = res ? res.extra.range : 40.4;
      const h = vals.h;
      const scaleX = (CW - 40) / Math.max(1, range);
      const scaleY = (CH - 40) / Math.max(1, h + 4);
      const p = Math.min(1, Math.max(0, (now - animT0) / 1000 / DUR.projectile));
      // 地面
      let s = '<line x1="20" y1="' + (CH - 20) + '" x2="' + (CW - 20) + '" y2="' + (CH - 20) + '" stroke="#7d8ca9" stroke-width="2"/>';
      // 完整参考轨迹（淡虚线）
      const ref = [];
      for (let i = 0; i <= 40; i++) {
        const t0 = (t * i) / 40;
        const x = vals.v0 * t0, y = 0.5 * 9.8 * t0 * t0;
        ref.push((20 + x * scaleX) + "," + (CH - 20 - y * scaleY));
      }
      s += '<polyline points="' + ref.join(" ") + '" fill="none" stroke="#c9d8f5" stroke-width="1.5" stroke-dasharray="5 4"/>';
      // 已飞行部分（实线高亮）
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const t0 = (t * Math.min(1, p) * i) / 40;
        const x = vals.v0 * t0, y = 0.5 * 9.8 * t0 * t0;
        pts.push((20 + x * scaleX) + "," + (CH - 20 - y * scaleY));
      }
      s += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="#1457d9" stroke-width="2.5"/>';
      // 小球当前位置（确定性 t = p·T）
      const bx = (20 + vals.v0 * (t * p) * scaleX);
      const by = (CH - 20 - 0.5 * 9.8 * (t * p) * (t * p) * scaleY);
      s += '<circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="5" fill="#e5484d"/>';
      s += '<text x="20" y="26" font-size="12" fill="#5f6672">t = ' + (t * p).toFixed(1) + " s / " + t.toFixed(1) + " s · x = " + (vals.v0 * t * p).toFixed(1) + " m</text>";
      s += '<text x="20" y="' + (CH - 26) + '" font-size="12" fill="#5f6672">轨迹：x = v₀t，y = ½gt²（t = √(2h/g)）</text>';
      return s;
    }

    function drawSpring(now) {
      const baseX = 60, baseY = 140;
      const res = lastRes;
      const omega = res ? res.extra.omega : 3.16;
      const A = vals.A;
      const scaleX = (CW - 120 - 40) / 2 / Math.max(1, 12);
      const tNow = (now - animT0) / 1000;
      const x = A * Math.cos(omega * tNow);    // 确定性简谐运动
      const px = baseX + x * scaleX;
      let s = '<line x1="20" y1="' + baseY + '" x2="' + (baseX - 12) + '" y2="' + baseY + '" stroke="#7d8ca9" stroke-width="3"/>';
      // 弹簧（多段折线模拟螺旋）
      let spring = "M" + (baseX - 12) + "," + baseY;
      const coils = 6, len = Math.max(4, px - (baseX - 12));
      for (let i = 1; i <= coils; i++) {
        const xx = baseX - 12 + (len * i) / coils;
        spring += (i % 2 === 1 ? " L" : " L") + xx.toFixed(1) + "," + (baseY + (i % 2 === 1 ? -26 : 0));
      }
      s += '<path d="' + spring + '" fill="none" stroke="#1457d9" stroke-width="2.5"/>';
      // 物块
      s += '<rect x="' + (px - 20).toFixed(1) + '" y="' + (baseY - 22) + '" width="40" height="44" rx="4" fill="rgba(20,87,217,.25)" stroke="#1457d9" stroke-width="2"/>';
      // 平衡位置虚线
      s += '<line x1="' + baseX + '" y1="' + (baseY - 32) + '" x2="' + baseX + '" y2="' + (baseY + 56) + '" stroke="#c9d8f5" stroke-width="1" stroke-dasharray="3 3"/>';
      s += '<line x1="20" y1="' + (baseY + 44 + 12) + '" x2="' + (CW - 20) + '" y2="' + (baseY + 44 + 12) + '" stroke="#7d8ca9" stroke-width="2"/>';
      s += '<text x="20" y="' + (baseY - 50) + '" font-size="12" fill="#5f6672">x = ' + x.toFixed(1) + " cm · t = " + tNow.toFixed(1) + " s</text>";
      s += '<text x="20" y="' + (baseY + 76) + '" font-size="12" fill="#5f6672">x = A·cos(ωt)，T = 2π√(m/k)</text>';
      return s;
    }

    function drawCirclePi(now) {
      const n = vals.n || 8, r = vals.r || 72;
      const cx = (CW / 2), cy = (CH / 2) + 6;
      const res = lastRes;
      // 边数从 3 生长到 n（割圆逼近动画）
      const p = Math.min(1, Math.max(0, (now - animT0) / 1000 / DUR.circlePi));
      const showN = Math.max(3, Math.round(3 + (n - 3) * p));
      const piEst = showN >= 3 ? showN * Math.sin(Math.PI / showN) : 0;
      let s = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#c9d8f5" stroke-width="1.5"/>';
      let pts = "";
      for (let i = 0; i <= showN; i++) {
        const th = ((i % showN) / showN) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r;
        pts += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
      }
      s += '<path d="' + pts + 'Z" fill="rgba(20,87,217,.12)" stroke="#1457d9" stroke-width="2"/>';
      s += '<text x="20" y="26" font-size="13" fill="#0b1220">内接正 ' + showN + " 边形" + (showN < n ? "（逼近中…）" : "") + "</text>";
      s += '<text x="20" y="44" font-size="12" fill="#5f6672">π ≈ ' + piEst.toFixed(4) + "（目标 3.1416）</text>";
      // 误差条：估值离 π 的接近程度
      const err = Math.abs(piEst - Math.PI);
      const bar = Math.max(0, 1 - err / 0.5);
      s += '<rect x="20" y="56" width="' + (Math.round(bar * (CW - 40))) + '" height="8" rx="4" fill="#179863"/>';
      s += '<text x="20" y="78" font-size="11" fill="#5f6672">误差 ' + err.toFixed(5) + "（越小越接近 π）</text>";
      if (res) {
        s += '<text x="20" y="' + (CH - 8) + '" font-size="11" fill="#5f6672">n=' + n + " 时估值 " + res.values["π 估值"] + "（数值断言见右侧）</text>";
      }
      s += '<text x="' + cx + '" y="' + (cy + r + 20) + '" font-size="12" fill="#5f6672" text-anchor="middle">割圆术：边数越多，估值越接近 π</text>';
      return s;
    }

    function tick() {
      const now = Date.now();
      if (now - last > 40) {   // ~25fps，节流
        last = now;
        let cv = "";
        if (exp.expId === "projectile") cv = drawProjectile(now);
        else if (exp.expId === "spring") cv = drawSpring(now);
        else cv = drawCirclePi(now);
        stageSVG(cv);
      }
      anim = requestAnimationFrame(tick);
    }
    function startAnim() { if (anim) cancelAnimationFrame(anim); last = 0; anim = requestAnimationFrame(tick); }

    render();
    return {
      update(pars) {
        if (pars) { exp.params.forEach((p) => { if (pars[p.key] != null) vals[p.key] = pars[p.key]; }); }
        animT0 = Date.now();
        refresh();
      },
      getVals: () => Object.assign({}, vals),
      destroy: () => { if (anim) cancelAnimationFrame(anim); container.innerHTML = ""; },
    };
  }

  /* ============================================================
   * v2 · 实时白板（工具栏 + 实例）
   * ============================================================ */
  const BOARD_TOOLS = [
    { id: "pen", icon: "✏️", title: "画笔" },
    { id: "highlighter", icon: "🖍️", title: "荧光笔" },
    { id: "eraser", icon: "🧽", title: "橡皮" },
    { id: "text", icon: "🔤", title: "文本" },
    { id: "formula", icon: "∑", title: "公式" },
    { id: "line", icon: "╱", title: "直线" },
    { id: "rect", icon: "▭", title: "矩形" },
    { id: "ellipse", icon: "⬭", title: "椭圆" },
  ];

  function mountBoard(container, opts) {
    const O = opts || {};
    const B = window.QIKE_BOARD;
    if (!B) return null;
    const palette = ["#0b1220", "#1457d9", "#e5484d", "#f7a000", "#179863", "#7a3cc4"];
    container.innerHTML =
      '<div class="wb-panel">' +
      '<div class="wb-bar">' +
      '<div class="wb-group" aria-label="工具">' +
      BOARD_TOOLS.map((t, i) =>
        '<button class="wb-btn wb-tool' + (t.id === (O.tool || "pen") ? " is-on" : "") + '" data-tool="' + t.id + '" title="' + t.title + '">' + t.icon + "</button>").join("") +
      "</div>" +
      '<div class="wb-group" aria-label="颜色">' +
      palette.map((c) =>
        '<button class="wb-color' + (c === (O.color || "#1457d9") ? " is-on" : "") + '" data-color="' + c + '" style="background:' + c + '" title="颜色"></button>').join("") +
      '<label class="wb-custom" title="自定义颜色"><input type="color" class="wb-color-custom" value="' + (O.color || "#1457d9") + '"></label>' +
      "</div>" +
      '<div class="wb-group" aria-label="粗细"><label class="wb-size-label">粗细<input type="range" class="wb-size" min="1" max="12" value="' + (O.size || 3) + '"></label></div>' +
      '<div class="wb-textline" hidden>' +
      '<input type="text" class="wb-text" placeholder="输入文字/公式后，点击画板放置（支持 \\n 换行与 Unicode 数学符号）" maxlength="120">' +
      "</div>" +
      '<div class="wb-group wb-ops" aria-label="操作">' +
      '<button class="wb-btn wb-undo" title="撤销">↶</button>' +
      '<button class="wb-btn wb-clear" title="清空板书">🗑️</button>' +
      '<button class="wb-btn wb-export" title="导出板书为图片">📷</button>' +
      "</div>" +
      "</div>" +
      '<div class="wb-host"></div>' +
      "</div>";

    const host = container.querySelector(".wb-host");
    const board = B.create(host, { tool: O.tool, color: O.color, size: O.size, channel: O.channel });
    const custom = container.querySelector(".wb-color-custom");

    container.querySelectorAll(".wb-tool").forEach((btn) => {
      btn.addEventListener("click", () => {
        board.setTool(btn.dataset.tool);
        container.querySelectorAll(".wb-tool").forEach((b) => b.classList.toggle("is-on", b === btn));
        container.querySelector(".wb-textline").hidden = !(btn.dataset.tool === "text" || btn.dataset.tool === "formula");
      });
    });
    container.querySelectorAll(".wb-color").forEach((c) => {
      c.addEventListener("click", () => {
        board.setColor(c.dataset.color);
        container.querySelectorAll(".wb-color").forEach((b) => b.classList.toggle("is-on", b === c));
        custom.value = c.dataset.color;
      });
    });
    custom.addEventListener("input", () => {
      board.setColor(custom.value);
      container.querySelectorAll(".wb-color").forEach((b) => b.classList.remove("is-on"));
    });
    const sizeInput = container.querySelector(".wb-size");
    sizeInput.addEventListener("input", () => board.setSize(Number(sizeInput.value)));
    const textInput = container.querySelector(".wb-text");
    textInput.addEventListener("input", () => board.setText(textInput.value));
    container.querySelector(".wb-undo").addEventListener("click", () => board.undo());
    container.querySelector(".wb-clear").addEventListener("click", () => {
      if (board.count() && !window.confirm("确定清空全部板书吗？")) return;
      board.clear();
    });
    container.querySelector(".wb-export").addEventListener("click", () => {
      try {
        board.exportPNG("qike-whiteboard-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".png");
      } catch (e) { success("导出失败：" + e.message); return; }
      success("板书已导出为 PNG 图片");
    });

    return {
      board,
      setTool: board.setTool,
      setColor: board.setColor,
      setSize: board.setSize,
      setText: board.setText,
      clear: board.clear,
      undo: board.undo,
      exportPNG: board.exportPNG,
      getStrokes: board.getStrokes,
      destroy() {
        board.destroy();
        container.innerHTML = "";
      },
    };
  }

  /* ============================================================
   * v2 · PBL 渲染 / 课堂报告渲染
   * ============================================================ */
  function renderPBL(art, container) {
    let h = '<h1>' + esc(art.title) + "</h1>";
    h += '<p class="paper-meta">' + esc(art.subtitle) + "</p>";
    h += '<p class="paper-meta">' + esc(art.meta.stage) + " · " + esc(art.meta.subject) + (art.meta.chapter ? " · " + esc(art.meta.chapter) : "") + " · " + esc(art.duration) + "</p>";
    h += '<h2>驱动性问题</h2><div class="pbl-driving">' + esc(art.driving) + "</div>";
    h += "<h2>项目背景</h2><p>" + esc(art.background) + "</p>";
    h += "<h2>里程碑与任务</h2>";
    art.milestones.forEach((m) => {
      h += '<h3>M' + m.no + " · " + esc(m.t) + ' <span class="pbl-hours">' + esc(m.hours) + "</span></h3><ul>";
      m.tasks.forEach((tk) => { h += "<li>" + esc(tk) + "</li>"; });
      h += "</ul>";
    });
    h += "<h2>任务卡</h2><div class='pbl-cards'>";
    art.taskCards.forEach((c) => {
      h += '<div class="pbl-card"><div class="pbl-card-title">' + esc(c.title) + "</div><ul>";
      c.tasks.forEach((t) => { h += "<li>" + esc(t) + "</li>"; });
      h += "</ul></div>";
    });
    h += "</div>";
    h += "<h2>成果要求</h2><ul>";
    art.deliverables.forEach((d) => { h += "<li>" + esc(d) + "</li>"; });
    h += "</ul>";
    h += "<h2>评价量表（加权评分）</h2><div class='pbl-rubric'>";
    art.rubric.forEach((r) => {
      h += '<div class="pbl-rubric-row"><div class="pbl-rubric-dim">' + esc(r.dim) + ' <span class="pbl-weight">' + esc(r.weight) + "</span></div>";
      r.levels.forEach((lv, i) => { h += '<div class="pbl-rubric-lv">' + esc(["优秀", "良好", "合格", "待改进"][i]) + "：" + esc(lv) + "</div>"; });
      h += "</div>";
    });
    h += "</div>";
    h += "<h2>时间规划</h2><ul>";
    art.schedule.forEach((s) => { h += "<li>" + esc(s) + "</li>"; });
    h += "</ul>";
    container.innerHTML = h;
  }

  function renderReport(art, container) {
    let h = '<h1>' + esc(art.title) + "</h1>";
    h += '<p class="paper-meta">' + esc(art.meta.subject) + " · " + esc(art.meta.topic) + " · " + esc(art.meta.at) + "</p>";
    h += "<h2>课堂数据</h2><div class='report-stats'>";
    Object.keys(art.stats || {}).forEach((k) => {
      h += '<div class="report-stat"><span>' + esc(k) + "</span><b>" + esc(art.stats[k]) + "</b></div>";
    });
    h += "</div>";
    h += "<h2>课堂回顾</h2><ul>";
    (art.lines || []).forEach((l) => { h += "<li>" + esc(l) + "</li>"; });
    h += "</ul>";
    h += "<h2>AI 助教建议</h2><ul class='report-suggest'>";
    (art.suggestions || []).forEach((s) => { h += "<li>💡 " + esc(s) + "</li>"; });
    h += "</ul>";
    container.innerHTML = h;
  }

  function renderExperimentPaper(exp, container) {
    // 实验讲义（打印用）：说明 + 结论 + 断言
    let h = "<h1>" + esc(exp.title) + "</h1>";
    h += '<p class="paper-meta">' + esc(exp.subject) + " · 交互式模拟实验</p>";
    h += "<h2>实验原理</h2><p>" + esc(exp.theory) + "</p>";
    h += "<h2>实验步骤</h2><ol><li>拖动滑杆调节参数；</li><li>观察动画轨迹/振动/逼近过程；</li><li>对照右侧数值与断言，记录结果；</li><li>改变参数重复实验，验证公式。</li></ol>";
    container.innerHTML = h;
  }

  // 更新打印路由以支持 v2 产物
  function printArtV2(art, title) {
    if (art.kind === "pbl") {
      const win = window.open("", "_blank");
      if (!win) { warn("浏览器拦截了打印窗口，请允许弹出窗口后重试。"); return; }
      const container = document.createElement("div");
      renderPBL(art, container);
      const css = 'body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#1c2433;margin:34px;line-height:1.75}h1{font-size:22px;border-bottom:2px solid #1457d9;padding-bottom:8px}h2{font-size:16px;color:#1457d9;margin-top:22px}h3{font-size:14px;color:#333}li{margin:5px 0}.paper-meta{color:#7d8ca9;font-size:12.5px;margin:4px 0}.pbl-driving{background:#f2f6ff;border-left:4px solid #1457d9;padding:12px 14px;font-weight:700}.pbl-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pbl-card{border:1px solid #d5e2ff;border-radius:8px;padding:10px 14px}.pbl-rubric-row{border:1px solid #e4eaf5;border-radius:8px;padding:10px 12px;margin:8px 0}.pbl-rubric-lv{margin:3px 0;font-size:13px}.pbl-weight{color:#1457d9;font-size:12px}@media print{body{margin:16mm}}';
      win.document.write('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>' + esc(title) + '</title><style>' + css + "</style></head><body>" + container.innerHTML + "</body></html>");
      win.document.close();
      setTimeout(() => win.print(), 260);
      return;
    }
    if (art.kind === "experiment") {
      const win = window.open("", "_blank");
      if (!win) { warn("浏览器拦截了打印窗口，请允许弹出窗口后重试。"); return; }
      const container = document.createElement("div");
      renderExperimentPaper(art, container);
      const css = 'body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#1c2433;margin:34px;line-height:1.75}h1{font-size:22px;border-bottom:2px solid #1457d9;padding-bottom:8px}h2{font-size:16px;color:#1457d9;margin-top:22px}li{margin:5px 0}.paper-meta{color:#7d8ca9;font-size:12.5px}@media print{body{margin:16mm}}';
      win.document.write('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>' + esc(title) + '</title><style>' + css + "</style></head><body>" + container.innerHTML + "</body></html>");
      win.document.close();
      setTimeout(() => win.print(), 260);
      return;
    }
    if (art.kind === "report" || art.kind === "classroom") {
      const win = window.open("", "_blank");
      if (!win) { warn("浏览器拦截了打印窗口，请允许弹出窗口后重试。"); return; }
      const container = document.createElement("div");
      if (art.kind === "report") renderReport(art, container);
      const css = 'body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#1c2433;margin:34px;line-height:1.75}h1{font-size:22px;border-bottom:2px solid #1457d9;padding-bottom:8px}h2{font-size:16px;color:#1457d9;margin-top:22px}li{margin:5px 0}.paper-meta{color:#7d8ca9;font-size:12.5px}.report-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:12px 0}.report-stat{border:1px solid #d5e2ff;border-radius:8px;padding:10px;text-align:center}.report-stat span{display:block;color:#7d8ca9;font-size:12px}.report-stat b{font-size:18px;color:#1457d9}@media print{body{margin:16mm}}';
      win.document.write('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>' + esc(title) + '</title><style>' + css + "</style></head><body>" + container.innerHTML + "</body></html>");
      win.document.close();
      setTimeout(() => win.print(), 260);
    }
  }

  return { toast, success, warn, error, esc, renderLesson, renderInteractive, renderHomework, renderGeometry, printArt, downloadText,
    mountSlides, mountClassroomShell, mountQuizRunner, mountExperiment, mountBoard, renderPBL, renderReport, renderExperimentPaper, printArtV2 };
})();