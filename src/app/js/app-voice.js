/* ============================================================
 * app-voice.js · 语音交互封装（Web Speech 能力 + 优雅降级）
 * TTS 语音讲解：speechSynthesis；STT 语音答题：SpeechRecognition
 * 不支持时均返回 false，调用方降级到文字输入
 * ============================================================ */
window.QIKE_VOICE = (function () {
  "use strict";

  const hasSynth = "speechSynthesis" in window;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let voices = [];
  /* 全局开关：TTS 讲解 / STT 语音答题，由设置面板写入；关闭时空实现，调用方自动降级文字 */
  const cfg = { tts: true, stt: true };
  function setCfg(c) {
    if (c && typeof c === "object") {
      if (typeof c.tts === "boolean") cfg.tts = c.tts;
      if (typeof c.stt === "boolean") cfg.stt = c.stt;
    }
  }
  function ttsEnabled() { return cfg.tts && hasSynth; }
  function sttEnabled() { return cfg.stt && !!SR; }

  function loadVoices() {
    try { voices = hasSynth ? window.speechSynthesis.getVoices() : []; } catch (e) { voices = []; }
  }
  if (hasSynth) {
    loadVoices();
    try { window.speechSynthesis.onvoiceschanged = loadVoices; } catch (e) { /* ignore */ }
  }

  function ttsSupported() { return hasSynth; }

  function pickZhVoice() {
    const list = voices.slice();
    return list.find((v) => /^zh/i.test(v.lang || "")) || null;
  }

  /* 可选中文音色列表（供播放器/课堂切换音色） */
  function zhVoices() {
    return voices.filter((v) => /^zh/i.test(v.lang || ""));
  }

  /* 朗读一段文本；opts {rate, pitch, voiceName, voiceLang, onEnd} */
  function speak(text, opts) {
    if (!ttsEnabled() || !text) return false;
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    const u = new SpeechSynthesisUtterance(String(text));
    const o = opts || {};
    u.lang = o.voiceLang || "zh-CN";
    u.rate = Number(o.rate) || 0.95;
    u.pitch = Number(o.pitch) || 1.0;
    u.volume = 1;
    if (o.voiceName) {
      const hit = voices.find((v) => v.name === o.voiceName);
      if (hit) u.voice = hit;
      else { const v = pickZhVoice(); if (v) u.voice = v; }
    } else { const v = pickZhVoice(); if (v) u.voice = v; }
    if (typeof o.onEnd === "function") { u.onend = o.onEnd; u.onerror = o.onEnd; }
    window.speechSynthesis.speak(u);
    return true;
  }

  function stop() {
    if (!hasSynth) return;
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }

  function sttSupported() { return !!SR; }

  /* 语音识别一次并回调结果文本；onEnd(isSupported, text|null, errorMsg?) */
  function listen(onEnd) {
    if (!sttEnabled()) {
      if (onEnd) onEnd(false, null, cfg.stt ? "当前浏览器不支持语音识别，已切换到文字作答。" : "语音答题已关闭，请使用文字作答。");
      return false;
    }
    try {
      const rec = new SR();
      rec.lang = "zh-CN";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        const text = ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : "";
        if (onEnd) onEnd(true, text || null, null);
      };
      rec.onerror = (ev) => { if (onEnd) onEnd(true, null, "语音识别出错（" + (ev.error || "unknown") + "）"); };
      rec.onend = () => { /* 已通过 result/error 回调 */ };
      rec.start();
      return true;
    } catch (e) {
      if (onEnd) onEnd(false, null, "语音识别启动失败：" + e.message);
      return false;
    }
  }

  return { ttsSupported, sttSupported, speak, stop, listen, pickZhVoice, zhVoices, setCfg, ttsEnabled, sttEnabled };
})();