#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""启课智能教学台 - 单文件构建管线
读取 src/app/index.html，内联 styles.css 与 js/*.js，输出单文件交付物。
用法: python build_app.py [--output 输出路径]
"""

import os, re, sys, json

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src", "app")
OUT_DEFAULT = os.path.join(ROOT, "qike-studio.html")

JS_ORDER = [
    "app-content.js",
    "app-data.js",
    "app-engine.js",
    "app-voice.js",
    "app-whiteboard.js",
    "app-search.js",
    "app-export.js",
    "app-ui.js",
    "app-main.js",
]


def main():
    out = OUT_DEFAULT
    if "--output" in sys.argv:
        out = os.path.abspath(sys.argv[sys.argv.index("--output") + 1].strip('"'))
    html = open(os.path.join(SRC, "index.html"), encoding="utf-8").read()

    # 内联 CSS
    css = open(os.path.join(SRC, "styles.css"), encoding="utf-8").read()
    css_inline = "<style>\n" + css + "\n</style>"
    html = html.replace('<link rel="stylesheet" href="styles.css">', css_inline)

    # 内联 JS
    parts = []
    report = {}
    for name in JS_ORDER:
        p = os.path.join(SRC, "js", name)
        if not os.path.exists(p):
            raise FileNotFoundError(f"缺少 JS 文件: {p}")
        js = open(p, encoding="utf-8").read()
        report[name] = len(js)
        parts.append(f"/* ===== {name} ===== */\n{js}")
    js_inline = "<script>\n" + "\n".join(parts) + "\n</script>"
    html = re.sub(r'<script src="js/[^"]+\.js"></script>', "", html).strip()
    # 在 </body> 前注入合并脚本
    html = html.replace("</body>", js_inline + "\n</body>")

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)

    print(
        json.dumps(
            {
                "ok": True,
                "output": out,
                "bytes": os.path.getsize(out),
                "js_components": report,
                "single_file": True,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
