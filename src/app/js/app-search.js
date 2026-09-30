/* ============================================================
 * app-search.js · 联网搜索面板
 * 内联抓取 DuckDuckGo 即时答案 API（CORS 开放）作为主路径，
 * 失败或结果为空时兜底到“在新标签页搜索”（Bing/百度）。
 * 离线/受限时给出友好提示，不阻塞应用其它功能。
 * ============================================================ */
window.QIKE_SEARCH = (function () {
  "use strict";

  /* DDG Instant Answer API：返回 {ok, query, abstract, url, topics:[{text,url}], error?} */
  async function ddgInstant(q) {
    const url = "https://api.duckduckgo.com/?q=" + encodeURIComponent(q) +
      "&format=json&no_html=1&skip_disambig=1&t=qike-studio";
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const topics = [];
    const walk = (list) => {
      (list || []).forEach((t) => {
        if (t.Topics) walk(t.Topics);
        else if (t.Text && (t.FirstURL || t.URL)) topics.push({ text: t.Text, url: t.FirstURL || t.URL });
      });
    };
    walk(data.RelatedTopics);
    return {
      ok: true, query: q,
      abstract: (data.AbstractText || "").trim(),
      abstractUrl: data.AbstractURL || "",
      headline: data.Answer || data.Heading || "",
      topics: topics.slice(0, 6),
    };
  }

  /* 主搜索入口：优先内联结果，其余信息交给回调 */
  async function search(q, cb) {
    const query = String(q || "").trim();
    if (!query) { if (cb) cb({ ok: false, error: "请输入搜索关键词。" }); return; }
    try {
      const r = await ddgInstant(query);
      if (cb) cb({ ok: true, ...r, hasContent: !!(r.abstract || r.headline || r.topics.length) });
    } catch (err) {
      if (cb) cb({ ok: false, error: "内联搜索不可用（" + err.message + "），可点击下方“在新标签页搜索”。", query });
    }
  }

  /* 兜底：新标签页打开搜索引擎 */
  function openExternal(query, engine) {
    const q = encodeURIComponent(String(query || "").trim());
    const url = engine === "baidu"
      ? "https://www.baidu.com/s?wd=" + q
      : engine === "bing" ? "https://www.bing.com/search?q=" + q
        : "https://www.google.com/search?q=" + q;
    window.open(url, "_blank", "noopener");
    return url;
  }

  return { search, openExternal, ddgInstant };
})();