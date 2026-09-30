/* ============================================================
 * app-whiteboard.js · 实时共享白板
 * 画笔/荧光笔/橡皮/文本/公式/直线/矩形/椭圆，颜色与粗细，
 * 撤销、清空、导出 PNG，BroadcastChannel 多端实时同步；
 * Pointer Events 实现，兼容触屏与鼠标。
 * ============================================================ */
window.QIKE_BOARD = (function () {
  "use strict";

  const TOOLS = ["pen", "highlighter", "eraser", "text", "formula", "line", "rect", "ellipse"];

  /* 创建一个白板实例；container 为存放 canvas 的 HTMLElement */
  function create(container, opts) {
    const o = opts || {};
    const canvas = document.createElement("canvas");
    const wrap = document.createElement("div");
    wrap.className = "wb-wrap";
    wrap.appendChild(canvas);
    container.appendChild(wrap);

    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    let strokes = [];        // 已完成的笔画 [{type,color,size,points:[{x,y}], shape:{...}}]
    let current = null;      // 正在画的笔画
    let tool = o.tool || "pen";
    let color = o.color || "#1457d9";
    let size = o.size || 3;
    let drawing = false;
    let textModePending = null; // 文本/公式内容

    /* ---------- 多端实时同步（BroadcastChannel） ---------- */
    const selfId = "wb" + ((Math.random() * 1e9) | 0).toString(36);
    let channel = null;
    let rev = 0;
    if (o.channel && typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(String(o.channel));
      channel.onmessage = (ev) => {
        const d = (ev && ev.data) || {};
        if (!d || d.sender === selfId || d.strokes === undefined) return;
        if ((d.rev || 0) >= rev) {
          strokes = Array.isArray(d.strokes) ? d.strokes : [];
          rev = d.rev || 0;
          redraw();
          if (o.onChange) o.onChange(strokes.length);
        }
      };
    }
    function broadcast() {
      if (!channel) return;
      rev += 1;
      try { channel.postMessage({ sender: selfId, rev, strokes }); } catch (e) { /* ignore */ }
    }

    function resize() {
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      redraw();
    }

    function redraw() {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
      strokes.forEach((s) => paintStroke(s));
      if (current && current.points.length) paintStroke(current);
      ctx.restore();
    }

    function paintStroke(s) {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (s.type === "text" || s.type === "formula") {
        ctx.save();
        ctx.font = (s.type === "formula" ? "italic " : "") + (s.size * (s.type === "formula" ? 1.35 : 1)) + "px \"Cambria Math\", \"Microsoft YaHei\", sans-serif";
        ctx.fillStyle = s.color;
        ctx.textBaseline = "top";
        const lines = String(s.text).split("\n");
        let y = s.y;
        lines.forEach((ln) => { ctx.fillText(ln || " ", s.x, y); y += s.size * 1.35; });
        ctx.restore();
        return;
      }
      if (s.type === "line" || s.type === "rect" || s.type === "ellipse") {
        ctx.save();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.size;
        const a = s.points[0] || { x: 0, y: 0 };
        const b = s.points[1] || a;
        ctx.globalAlpha = s.type === "highlighter" ? 0.45 : 1;
        if (s.type === "line") {
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        } else if (s.type === "rect") {
          ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        } else {
          ctx.beginPath();
          ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
      // pen / highlighter / eraser
      ctx.save();
      ctx.strokeStyle = s.type === "eraser" ? "#ffffff" : s.color;
      ctx.lineWidth = s.size * (s.type === "highlighter" ? 4 : 1);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = s.type === "highlighter" ? 0.5 : 1;
      ctx.beginPath();
      s.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();
      void w; void h;
    }

    function pos(ev) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (ev.clientX - rect.left) * (wrap.clientWidth / Math.max(1, rect.width)),
        y: (ev.clientY - rect.top) * (wrap.clientHeight / Math.max(1, rect.height)),
      };
    }

    function startStroke(ev) {
      ev.preventDefault();
      const p = pos(ev);
      if (tool === "text" || tool === "formula") {
        if (textModePending == null) return;
        strokes.push({ type: tool, text: textModePending, color, size: Math.max(14, size * 4), x: p.x, y: p.y });
        textModePending = null;
        redraw();
        broadcast();
        if (o.onChange) o.onChange(strokes.length);
        return;
      }
      drawing = true;
      current = { type: tool, color, size, points: [p, p] };
      canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
    }

    function moveStroke(ev) {
      if (!drawing || !current) return;
      ev.preventDefault();
      const p = pos(ev);
      const last = current.points[current.points.length - 1];
      if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 1.2) return;
      if (current.type === "line" || current.type === "rect" || current.type === "ellipse") {
        current.points = [current.points[0], p];
      } else {
        current.points.push(p);
      }
      redraw();
    }

    function endStroke() {
      if (!drawing || !current) return;
      drawing = false;
      strokes.push(current);
      current = null;
      redraw();
      broadcast();
      if (o.onChange) o.onChange(strokes.length);
    }

    canvas.addEventListener("pointerdown", startStroke);
    canvas.addEventListener("pointermove", moveStroke);
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointercancel", endStroke);
    if (!("PointerEvent" in window)) {
      canvas.addEventListener("mousedown", (e) => startStroke({ preventDefault() {}, clientX: e.clientX, clientY: e.clientY, pointerId: 1 }));
      canvas.addEventListener("mousemove", (e) => moveStroke({ preventDefault() {}, clientX: e.clientX, clientY: e.clientY }));
      canvas.addEventListener("mouseup", endStroke);
      canvas.addEventListener("touchstart", (e) => {
        const t = e.touches[0];
        startStroke({ preventDefault() { e.preventDefault(); }, clientX: t.clientX, clientY: t.clientY, pointerId: 2 });
      }, { passive: false });
      canvas.addEventListener("touchmove", (e) => {
        const t = e.touches[0];
        moveStroke({ preventDefault() { e.preventDefault(); }, clientX: t.clientX, clientY: t.clientY });
      }, { passive: false });
      canvas.addEventListener("touchend", endStroke);
    }

    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(wrap);
    }
    resize();

    // ---------- 对外 API ----------
    function setTool(t) { tool = TOOLS.indexOf(t) >= 0 ? t : "pen"; }
    function getTool() { return tool; }
    function setColor(c) { color = c; }
    function setSize(s) { size = Math.max(1, Number(s) || 3); }
    function setText(t) { textModePending = t == null ? null : String(t); }
    function undo() { strokes.pop(); redraw(); broadcast(); if (o.onChange) o.onChange(strokes.length); }
    function clear() { strokes = []; current = null; drawing = false; redraw(); broadcast(); if (o.onChange) o.onChange(0); }
    function count() { return strokes.length; }
    function setStrokes(list) { strokes = Array.isArray(list) ? list : []; current = null; drawing = false; redraw(); if (o.onChange) o.onChange(strokes.length); }

    function exportPNG(filename) {
      // 先把当前笔画用白色底画到临时画布再导出（透明背景也保留）
      const tmp = document.createElement("canvas");
      tmp.width = canvas.width; tmp.height = canvas.height;
      const tctx = tmp.getContext("2d");
      tctx.fillStyle = "#ffffff";
      tctx.fillRect(0, 0, tmp.width, tmp.height);
      tctx.drawImage(canvas, 0, 0);
      const url = tmp.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url; a.download = filename || "qike-whiteboard.png";
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
      tmp.width = 1; tmp.height = 1; // 释放
      return url;
    }

    function destroy() {
      if (ro) ro.disconnect();
      canvas.removeEventListener("pointerdown", startStroke);
      canvas.removeEventListener("pointermove", moveStroke);
      canvas.removeEventListener("pointerup", endStroke);
      canvas.removeEventListener("pointercancel", endStroke);
      if (channel) { try { channel.close(); } catch (e) { /* ignore */ } channel = null; }
      wrap.remove();
    }

    return {
      canvas, wrap, setTool, getTool, setColor, setSize, setText, undo, clear,
      count, setStrokes, getStrokes: () => strokes, exportPNG, destroy, resize, redraw,
    };
  }

  return { create, TOOLS };
})();