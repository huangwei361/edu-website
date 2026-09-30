/* ============================================================
 * app-export.js · 导出引擎
 * 内联 ZIP 写入器 → 可逐元素编辑的 PPTX（每环节一页）
 * 交互式 HTML 单文件导出（课件 + 测验可作答）
 * 零外部依赖、完全离线可用
 * ============================================================ */
window.QIKE_EXPORT = (function () {
  "use strict";

  const DATA = window.QIKE_DATA;
  const ENGINE = window.QIKE_ENGINE;

  /* ---------- 基础工具 ---------- */
  function escXml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function safeName(name) {
    const n = String(name || "导出").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "");
    return n || "导出";
  }
  function utf8(str) {
    const enc = new TextEncoder();
    return enc.encode(str);
  }

  /* ============================================================
   * 1 · 内联 ZIP 写入器（stored 压缩，兼容 PPTX OOXML）
   * ============================================================ */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(v) { return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]); }
  function u32(v) {
    const a = new Uint8Array(4);
    new DataView(a.buffer).setUint32(0, v >>> 0, true);
    return a;
  }
  function zipBuild(files) {
    // files: [{ name, data: Uint8Array }]
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const DOS_DATE = 0x4A21, DOS_TIME = 0x0000; // 2020-01-01 00:00 固定时间戳，可复现
    files.forEach((f) => {
      const nameBytes = encoder.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;
      // local file header
      const lf = new Uint8Array(30);
      const dv = new DataView(lf.buffer);
      dv.setUint32(0, 0x04034B50, true);           // signature
      dv.setUint16(4, 20, true);                   // version needed
      dv.setUint16(6, 0x0800, true);               // flags: UTF-8 names
      dv.setUint16(8, 0, true);                    // method: stored
      dv.setUint16(10, DOS_TIME, true);            // mod time
      dv.setUint16(12, DOS_DATE, true);            // mod date
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);                   // extra len
      chunks.push(lf, nameBytes, f.data);
      // central directory record
      const cd = new Uint8Array(46);
      const cdv = new DataView(cd.buffer);
      cdv.setUint32(0, 0x02014B50, true);          // signature
      cdv.setUint16(4, 20, true);                  // version made by
      cdv.setUint16(6, 20, true);                  // version needed
      cdv.setUint16(8, 0x0800, true);              // flags
      cdv.setUint16(10, 0, true);                  // method
      cdv.setUint16(12, DOS_TIME, true);
      cdv.setUint16(14, DOS_DATE, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, size, true);
      cdv.setUint32(24, size, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint16(30, 0, true);                  // extra len
      cdv.setUint16(32, 0, true);                  // comment len
      cdv.setUint16(34, 0, true);                  // disk start
      cdv.setUint16(36, 0, true);                  // internal attrs
      cdv.setUint32(38, 0, true);                  // external attrs
      cdv.setUint32(42, offset, true);             // local header offset
      central.push(cd, nameBytes);
      offset += 30 + nameBytes.length + size;
    });
    // end of central directory
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054B50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);
    const total = chunks.reduce((n, c) => n + c.length, 0) + cdSize + 22;
    const out = new Uint8Array(total);
    let p = 0;
    chunks.forEach((c) => { out.set(c, p); p += c.length; });
    central.forEach((c) => { out.set(c, p); p += c.length; });
    out.set(eocd, p);
    return out;
  }

  /* ============================================================
   * 2 · PPTX（OOXML）生成
   * 每环节一页，文本逐段可编辑
   * ============================================================ */
  const EMU_W = 12192000, EMU_H = 6858000; // 16:9

  function slideXML(pageNo, sl, isLast) {
    const title = sl.title || "（无标题）";
    const kicker = sl.kicker ? sl.kicker + " · " : "";
    const bullets = (sl.bullets || []).map((b) => String(b)).filter((b) => b.length > 2);
    const hasNote = sl.note && String(sl.note).length > 2;
    const bodyLines = kicker ? [kicker.replace(/\s+$/, "")] : [];
    bodyLines.push(...bullets);
    if (hasNote) bodyLines.push("→ " + sl.note);

    // 段落 XML：每段一个可编辑 a:p
    const parXml = (text, sz, bold, color, algn) => {
      const pPr = algn ? `<a:pPr algn="${algn}"/>` : "";
      return `<a:p>${pPr}<a:r><a:rPr lang="zh-CN" sz="${sz}"${bold ? ' b="1"' : ""} dirty="0">` +
        (color ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : "") +
        `</a:rPr><a:t>${escXml(text)}</a:t></a:r></a:p>`;
    };

    let bodyXml = "";
    bodyLines.forEach((line, i) => {
      bodyXml += parXml(line, i === 0 ? 2400 : 2000, i === 0, i === 0 ? "#1457d9" : "", null);
    });
    const hasBody = bodyLines.length > 0;

    const spTree =
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
      '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      // 标题占位符
      '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
      '<p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="548640" y="411480"/><a:ext cx="11094720" cy="1447800"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>' +
      parXml(kicker + title, 3200, true, "#1c2433", "ctr") +
      "</p:txBody></p:sp>" +
      // 正文占位符（kicker 首行 = 环节标签）
      (hasBody
        ? '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
          '<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
          '<p:spPr><a:xfrm><a:off x="685800" y="2103120"/><a:ext cx="10820400" cy="4227840"/></a:xfrm>' +
          '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
          '<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>' + bodyXml + "</p:txBody></p:sp>"
        : "") +
      // 页码脚标
      '<p:sp><p:nvSpPr><p:cNvPr id="4" name="PageNo"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' +
      '<p:nvPr/></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="914400" y="6400800"/><a:ext cx="10363200" cy="304800"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>' +
      parXml((isLast ? "🎯 本课件由「启课智能教学台」生成 · 可逐元素编辑" : "第 " + pageNo + " 页 / 共 " + "N" + " 页"), 1400, false, "#8b96ad", "ctr") +
      "</p:txBody></p:sp>";

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      "<p:cSld><p:spTree>" + spTree + "</p:spTree></p:cSld>" +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' +
      "</p:sld>"
    );
  }

  function slideMasterXML() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      "<p:cSld>" +
      '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
      "<p:spTree>" +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      "</p:spTree></p:cSld>" +
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
      "<p:txStyles>" +
      "<p:titleStyle><a:lvl1pPr><a:defRPr sz=" + '"4000"' + '/></a:lvl1pPr></p:titleStyle>' +
      "<p:bodyStyle><a:lvl1pPr><a:defRPr sz=" + '"2000"' + '/></a:lvl1pPr></p:bodyStyle>' +
      "<p:otherStyle/></p:txStyles>" +
      "</p:sldMaster>"
    );
  }

  function slideLayoutXML() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">' +
      "<p:cSld><p:spTree>" +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      "</p:spTree></p:cSld>" +
      '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' +
      "</p:sldLayout>"
    );
  }

  function themeXML() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="QikeStudioTheme">' +
      "<a:themeElements>" +
      '<a:clrScheme name="QikeStudio">' +
      '<a:dk1><a:srgbClr val="1C2433"/></a:dk1>' +
      '<a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
      '<a:dk2><a:srgbClr val="1457D9"/></a:dk2>' +
      '<a:lt2><a:srgbClr val="F2F6FF"/></a:lt2>' +
      '<a:accent1><a:srgbClr val="1457D9"/></a:accent1>' +
      '<a:accent2><a:srgbClr val="F59E0B"/></a:accent2>' +
      '<a:accent3><a:srgbClr val="179863"/></a:accent3>' +
      '<a:accent4><a:srgbClr val="D23B3B"/></a:accent4>' +
      '<a:accent5><a:srgbClr val="8B5CF6"/></a:accent5>' +
      '<a:accent6><a:srgbClr val="0EA5E9"/></a:accent6>' +
      '<a:hlink><a:srgbClr val="0B4EA2"/></a:hlink>' +
      '<a:folHlink><a:srgbClr val="7A3FA0"/></a:folHlink>' +
      "</a:clrScheme>" +
      '<a:fontScheme name="QikeStudio">' +
      '<a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface="微软雅黑"/><a:cs typeface=""/></a:majorFont>' +
      '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="微软雅黑"/><a:cs typeface=""/></a:minorFont>' +
      "</a:fontScheme>" +
      '<a:fmtScheme name="QikeStudio">' +
      "<a:fillStyleLst>" +
      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
      '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill>' +
      '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:shade val="51000"/><a:satMod val="130000"/></a:schemeClr></a:gs><a:gs pos="80000"><a:schemeClr val="phClr"><a:shade val="93000"/><a:satMod val="130000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="94000"/><a:satMod val="135000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill>' +
      "</a:fillStyleLst>" +
      "<a:lnStyleLst>" +
      '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>' +
      '<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>' +
      '<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>' +
      "</a:lnStyleLst>" +
      "<a:effectStyleLst>" +
      "<a:effectStyle><a:effectLst/></a:effectStyle>" +
      "<a:effectStyle><a:effectLst/></a:effectStyle>" +
      "<a:effectStyle><a:effectLst/></a:effectStyle>" +
      "</a:effectStyleLst>" +
      "<a:bgFillStyleLst>" +
      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
      '<a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill>' +
      '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill>' +
      "</a:bgFillStyleLst>" +
      "</a:fmtScheme>" +
      "</a:themeElements>" +
      "<a:objectDefaults/><a:extraClrSchemeLst/>" +
      "</a:theme>"
    );
  }

  function docsXML(art, slidesCount) {
    const now = new Date().toISOString();
    const title = art && art.title ? art.title : "课件";
    const core =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      "<dc:title>" + escXml(title) + "</dc:title>" +
      "<dc:creator>启课智能教学台</dc:creator>" +
      "<cp:lastModifiedBy>启课智能教学台</cp:lastModifiedBy>" +
      "<dcterms:created xsi:type=\"dcterms:W3CDTF\">" + now + "</dcterms:created>" +
      "<dcterms:modified xsi:type=\"dcterms:W3CDTF\">" + now + "</dcterms:modified>" +
      "</cp:coreProperties>";
    const app =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      "<Application>启课智能教学台</Application>" +
      "<Slides>" + slidesCount + "</Slides>" +
      "<Notes>0</Notes>" +
      "<HiddenSlides>0</HiddenSlides>" +
      "<MMClips>0</MMClips>" +
      "<ScaleCrop>false</ScaleCrop>" +
      "</Properties>";
    return { core, app };
  }

  function contentTypeXML(slideCount) {
    let slides = "";
    for (let i = 1; i <= slideCount; i++) {
      slides += '<Override PartName="/ppt/slides/slide' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    }
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      slides +
      '<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      "</Types>"
    );
  }

  function buildPPTX(art, slides) {
    const S = slides || toSlides(art);
    const N = S.length;
    const files = [];
    const add = (name, text) => files.push({ name, data: utf8(text) });

    const doc = docsXML(art, N);
    add("[Content_Types].xml", contentTypeXML(N));
    add("_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      "</Relationships>");
    add("docProps/core.xml", doc.core);
    add("docProps/app.xml", doc.app);

    // presentation.xml
    let sldIdLst = "";
    for (let i = 0; i < N; i++) sldIdLst += '<p:sldId id="' + (256 + i) + '" r:id="rId' + (2 + i) + '"/>';
    add("ppt/presentation.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      "<p:sldIdLst>" + sldIdLst + "</p:sldIdLst>" +
      '<p:sldSz cx="' + EMU_W + '" cy="' + EMU_H + '"/>' +
      '<p:notesSz cx="6858000" cy="9144000"/>' +
      "</p:presentation>");

    // presentation rels
    let presRels =
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>';
    for (let i = 0; i < N; i++) {
      presRels += '<Relationship Id="rId' + (2 + i) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + (i + 1) + '.xml"/>';
    }
    presRels += '<Relationship Id="rId' + (2 + N) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>';
    add("ppt/_rels/presentation.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      presRels + "</Relationships>");

    add("ppt/slideMasters/slideMaster1.xml", slideMasterXML());
    add("ppt/slideMasters/_rels/slideMaster1.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
      "</Relationships>");
    add("ppt/slideLayouts/slideLayout1.xml", slideLayoutXML());
    add("ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
      "</Relationships>");
    add("ppt/theme/theme1.xml", themeXML());

    for (let i = 0; i < N; i++) {
      add("ppt/slides/slide" + (i + 1) + ".xml", slideXML(i + 1, S[i], i === N - 1));
      add("ppt/slides/_rels/slide" + (i + 1) + ".xml.rels",
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
        "</Relationships>");
    }
    // 备注页 notesSlide（最小备注，提升兼容性）仅在第一张声明
    add("ppt/notesSlides/notesSlide1.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      "<p:cSld><p:spTree>" +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
      '<p:spPr><a:xfrm><a:off x="91440" y="91440"/><a:ext cx="6675120" cy="8552880"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
      '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>由启课智能教学台生成</a:t></a:r></a:p></p:txBody></p:sp>' +
      "</p:spTree></p:cSld>" +
      "</p:notes>");
    add("ppt/notesSlides/_rels/notesSlide1.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide1.xml"/>' +
      "</Relationships>");

    return zipBuild(files);
  }

  /* ============================================================
   * 3 · 规范化产物 → 幻灯片页（每环节一页）
   * ============================================================ */
  function toSlides(art) {
    if (!art) return [];
    const meta = art.meta || {};
    if (art.kind === "lesson") {
      const deck = ENGINE.makeSlides(art);
      return (deck && deck.slides ? deck.slides : []);
    }
    if (art.kind === "interactive") {
      const S = [];
      S.push({ kicker: "互动课堂", title: art.title, bullets: [meta.stage + " · " + meta.subject + (meta.topic ? " · " + meta.topic : ""), "活动类型：" + (art.modeLabel || ""), "共 " + (art.count || 0) + " 个环节/题目"] });
      if (art.rules) S.push({ kicker: "活动规则", title: "活动规则", bullets: art.rules } );
      if (art.items) {
        const per = 4;
        for (let g = 0; g < art.items.length; g += per) {
          const partItems = art.items.slice(g, g + per);
          S.push({
            kicker: "题目 " + (g / per + 1),
            title: "题目 " + (g + 1) + "–" + (g + partItems.length),
            bullets: partItems.map((it) => {
              const bl = it.a ? [it.q, "▲ 提示：" + it.a] : [it.q];
              return bl.join("\n");
            }),
          });
        }
      }
      if (art.tasks) {
        art.tasks.forEach((t) => {
          S.push({ kicker: "任务包", title: t.t, bullets: [t.desc] });
        });
      }
      return S;
    }
    if (art.kind === "homework") {
      const S = [];
      S.push({
        kicker: "分层作业", title: art.title, bullets: [
          meta.subject + " · " + meta.topic,
          "题量：基础 " + art.plan.basic + " · 提升 " + art.plan.mid + " · 拓展 " + art.plan.hard,
          art.withAnswer ? "含参考答案与解析（教师版）" : "不含答案（学生版），作答后由教师评讲",
        ],
      });
      const layerName = { basic: "基础巩固", mid: "能力提升", hard: "拓展挑战" };
      let cur = "";
      const pageBlocks = [];
      art.items.forEach((it) => {
        if (it.layer !== cur) cur = it.layer;
        if (!pageBlocks[cur]) pageBlocks[cur] = [];
        pageBlocks[cur].push(it);
      });
      Object.keys(layerName).forEach((key) => {
        const items = pageBlocks[key];
        if (!items || !items.length) return;
        S.push({
          kicker: "分层作业",
          title: layerName[key],
          bullets: items.map((it) => it.q + (art.withAnswer && it.a ? "\n答案：" + it.a : "")),
        });
      });
      return S;
    }
    if (art.kind === "pbl") {
      const S = [];
      S.push({ kicker: "项目式学习", title: art.title, bullets: [art.subtitle || "", "建议周期：" + (art.duration || "7-8 课时"), "评价量表：" + art.rubric.map((r) => r.dim + " " + r.weight).join("、")] });
      S.push({ kicker: "驱动性问题", title: "驱动性问题", bullets: [art.driving] });
      S.push({ kicker: "项目背景", title: "项目情境与背景", bullets: [art.background] });
      art.milestones.forEach((m) => {
        S.push({ kicker: "里程碑 " + m.no + " · " + m.hours, title: m.t, bullets: m.tasks });
      });
      art.taskCards.forEach((c) => {
        S.push({ kicker: "任务卡", title: c.no + ". " + c.title, bullets: c.tasks });
      });
      S.push({ kicker: "成果要求", title: "项目成果", bullets: art.deliverables });
      S.push({ kicker: "评价量表", title: "评价量表", bullets: art.rubric.map((r) => r.dim + "（" + r.weight + "）：" + r.levels[0]) });
      return S;
    }
    if (art.kind === "quiz") {
      const S = [];
      S.push({ kicker: "随堂测验", title: art.title, bullets: [meta.subject + " · " + meta.topic, "共 " + art.count + " 题，作答后即时批改并附解析"] });
      art.items.forEach((it) => {
        const optsTxt = it.opts ? it.opts.map((o, i) => String.fromCharCode(65 + i) + ". " + o).join("\n") : "";
        S.push({
          kicker: "随堂测验",
          title: "第 " + it.no + " 题",
          bullets: [it.q, optsTxt, "✓ 答案：" + (typeof it.a === "number" ? String.fromCharCode(65 + it.a) : it.a), "解析：" + (it.why || "")],
        });
      });
      return S;
    }
    if (art.kind === "report") {
      const S = [];
      S.push({ kicker: "课堂报告", title: art.title, bullets: Object.keys(art.stats).map((k) => k + "：" + art.stats[k]) });
      art.lines.forEach((line) => S.push({ kicker: "课堂报告", title: "分析要点", bullets: [line] }));
      S.push({ kicker: "课堂报告", title: "后续建议", bullets: art.suggestions });
      return S;
    }
    return [{ kicker: "成果", title: art.title || "教学成果", bullets: [art.subtitle || ""] }];
  }

  /* ============================================================
   * 4 · 交互式 HTML 单文件导出（课件＋测验可作答）
   * ============================================================ */
  function collectQA(art) {
    // 返回可交互的测验题：{no,q,opts?,a(索引或文本),why?}
    if (art.kind === "quiz") return (art.items || []).map((it) => ({ no: it.no, q: it.q, opts: it.opts, a: it.a, why: it.why }));
    if (art.kind === "interactive") {
      // question/race/game 为问答卡（显示答案），quiz 无 opts 也作问答卡
      return (art.items || []).map((it) => ({ no: it.no, q: it.q, a: it.a, why: "" }));
    }
    if (art.kind === "homework") {
      return (art.items || []).map((it) => ({ no: it.no, q: it.q, a: art.withAnswer ? it.a : "", why: "" }));
    }
    // lesson：无内置测验，由调用方决定是否附加
    return [];
  }

  function buildHTML(art, opts) {
    const o = opts || {};
    const slides = o.slides || toSlides(art);
    let qa = o.qa;
    let quizTitle = o.quizTitle || "";
    if (qa === undefined || qa === null) {
      qa = collectQA(art);
      quizTitle = art.kind === "homework" ? "参考答案" : "随堂测验";
    }
    if (!qa || !qa.length) {
      qa = [];
      quizTitle = "";
    }
    const meta = art.meta || {};
    const title = (art && art.title) || "启课教学成果";
    const isQuiz = o.quizTitle && o.quizMode !== false;
    const dataJson = JSON.stringify({
      title: art.title || "",
      subtitle: art.subtitle || "",
      meta: meta ? { stage: meta.stage || "", subject: meta.subject || "", topic: meta.topic || "", chapter: meta.chapter || "", type: meta.type || "" } : {},
      slides, qa, quizTitle,
    }).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

    const css = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;background:#eef2f9;color:#1c2433;line-height:1.7}
.wrap{max-width:980px;margin:0 auto;padding:14px 14px 40px}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 2px 14px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px;color:#1457d9}
.brand .logo{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#1457d9,#4c8dff);display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff}
.topbtns{display:flex;gap:8px}
.tbtn{border:1px solid #c9d6ee;background:#fff;color:#1457d9;border-radius:10px;padding:7px 13px;font-size:13px;cursor:pointer;transition:.15s}
.tbtn:hover{border-color:#1457d9;background:#f2f6ff}
.card{background:#fff;border:1px solid #e2e9f5;border-radius:18px;box-shadow:0 6px 24px rgba(28,36,51,.06);padding:26px 30px;margin-bottom:16px}
.kicker{font-size:12px;letter-spacing:1.5px;color:#4c8dff;font-weight:700;margin-bottom:4px}
h1{font-size:26px;line-height:1.35;margin-bottom:6px}
.sub{color:#7d8ca9;font-size:13.5px;margin-bottom:14px}
.meta-line{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.tag{font-size:12px;color:#1457d9;background:#eef4ff;border:1px solid #d5e2ff;border-radius:20px;padding:3px 12px}
.stage{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px}
.stage .dots{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.dot{width:9px;height:9px;border-radius:50%;background:#d5e2ff;cursor:pointer;border:0;padding:0}
.dot.on{background:#1457d9;transform:scale(1.25)}
.navbtns{display:flex;gap:8px}
.navbtn{min-width:86px;border:1px solid #c9d6ee;background:#fff;color:#1c2433;border-radius:10px;padding:8px 14px;font-size:14px;cursor:pointer}
.navbtn:disabled{opacity:.4;cursor:default}
.navbtn.primary{background:#1457d9;border-color:#1457d9;color:#fff}
.counter{font-size:13px;color:#7d8ca9;text-align:center;margin-top:10px}
.slide-kicker{font-size:12.5px;letter-spacing:1.5px;color:#4c8dff;font-weight:700;margin-bottom:6px}
.slide-title{font-size:22px;font-weight:800;margin-bottom:16px;color:#1c2433}
ul.bullets{list-style:none}
ul.bullets li{position:relative;padding:9px 0 9px 26px;border-bottom:1px dashed #e8eef8;font-size:15px}
ul.bullets li:last-child{border-bottom:0}
ul.bullets li::before{content:"";position:absolute;left:4px;top:17px;width:8px;height:8px;border-radius:3px;background:#4c8dff}
.qcard{background:#f7faff;border:1px solid #e2e9f5;border-radius:14px;padding:18px 20px;margin-bottom:14px}
.qno{font-size:12.5px;font-weight:800;color:#4c8dff;margin-bottom:6px}
.qq{font-size:15.5px;font-weight:600;margin-bottom:12px}
.opt{display:block;width:100%;text-align:left;background:#fff;border:1.5px solid #dde6f5;border-radius:11px;padding:10px 14px;margin:8px 0;font-size:14.5px;cursor:pointer;transition:.15s;color:#1c2433}
.opt:hover:not(:disabled){border-color:#4c8dff;background:#f0f6ff}
.opt:disabled{cursor:default}
.opt.correct{background:#e7f8ef;border-color:#179863;color:#0d6e43;font-weight:700}
.opt.wrong{background:#fdecec;border-color:#d23b3b;color:#a02a2a}
.qwhy{margin-top:10px;font-size:13.5px;color:#5f6672;background:#eef4ff;border-left:4px solid #4c8dff;padding:9px 13px;border-radius:6px;display:none}
.qwhy.show{display:block}
.score-box{text-align:center;padding:26px 10px}
.score-num{font-size:46px;font-weight:900;color:#1457d9}
.score-tip{margin-top:8px;color:#5f6672;font-size:14.5px}
.qa-answer{font-size:13.5px;color:#0d6e43;background:#e7f8ef;border-radius:8px;padding:8px 12px;margin-top:8px}
.noqa{color:#7d8ca9;font-size:14px;text-align:center;padding:22px 0}
.foot{text-align:center;color:#a4aec2;font-size:12px;margin-top:22px}
@media print{.topbar,.stage{display:none}.card{box-shadow:none;border-color:#c9d6ee;break-inside:avoid}}
@media (max-width:640px){.card{padding:18px 16px}h1{font-size:21px}.navbtn{min-width:64px;font-size:13px;padding:8px 8px}}
`;

    const js = `
(function(){
  var D=window.QK_DATA;
  var cur=0;
  var $=function(id){return document.getElementById(id)};
  function renderSlide(){
    var s=D.slides[cur];
    $("sv").innerHTML='<div class="slide-kicker">'+e(s.kicker||"")+'</div><div class="slide-title">'+e(s.title||"")+'</div><ul class="bullets">'+(s.bullets||[]).map(function(b){return "<li>"+e(b).replace(/\\n/g,"<br>")+"</li>"}).join("")+'</ul>';
    $("prevB").disabled=cur<=0;
    $("nextB").disabled=cur>=D.slides.length-1;
    var d=$("dots");d.innerHTML="";
    D.slides.forEach(function(x,i){var b=document.createElement("button");b.className="dot"+(i===cur?" on":"");b.setAttribute("aria-label","第"+(i+1)+"页");b.onclick=function(){cur=i;renderSlide()};d.appendChild(b)});
    $("cnt").textContent=(cur+1)+" / "+D.slides.length;
  }
  function renderQuiz(){
    var tb=$("titleB");
    if(!tb)return; /* 无测验区块（qa 为空且非 quiz 模式）时不渲染 */
    tb.textContent=D.quizTitle;
    var host=$("qz");
    if(!D.qa||!D.qa.length){host.innerHTML='<div class="noqa">本成果暂无独立测验题，可与课件页配合使用。</div>';return}
    var answered=0,score=0;
    host.innerHTML="";
    D.qa.forEach(function(it,i){
      var card=document.createElement("div");card.className="qcard";card.id="q"+i;
      var inner='<div class="qno">第 '+(i+1)+' 题</div><div class="qq">'+e(it.q)+'</div>';
      if(it.opts&&it.opts.length){
        inner+='<div class="opts" data-i="'+i+'">';
        it.opts.forEach(function(op,j){
          inner+='<button class="opt" data-j="'+j+'" data-i="'+i+'">'+String.fromCharCode(65+j)+'. '+e(op)+'</button>';
        });
        inner+='</div>';
        if(it.why) inner+='<div class="qwhy" id="why'+i+'">解析：'+e(it.why)+'</div>';
      }else{
        inner+='<div class="qa-answer">参考答案：'+e(typeof it.a==="number"?String.fromCharCode(65+it.a):(it.a||"—"))+'</div>';
      }
      card.innerHTML=inner;
      host.appendChild(card);
      if(it.opts&&it.opts.length){
        card.querySelectorAll(".opt").forEach(function(btn){
          btn.addEventListener("click",function(){
            if(btn.disabled)return;
            var idx=Number(btn.dataset.i),j=Number(btn.dataset.j);
            var item=D.qa[idx];
            var ok=j===item.a;
            answered++; if(ok)score++;
            card.querySelectorAll(".opt").forEach(function(b){b.disabled=true});
            btn.classList.add(ok?"correct":"wrong");
            if(!ok&&typeof item.a==="number"){
              var right=card.querySelector('.opt[data-j="'+item.a+'"]');
              if(right)right.classList.add("correct");
            }
            var why=$("why"+idx);if(why)why.classList.add("show");
            $("scoreTip").textContent="已作答 "+answered+" / "+D.qa.length+" 题 · 答对 "+score+" 题";
          });
        });
      }
    });
    $("scoreTip").textContent="已作答 0 / "+D.qa.length+" 题";
  }
  function e(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
  function go(n){cur=Math.max(0,Math.min(D.slides.length-1,n));renderSlide()}
  document.addEventListener("keydown",function(ev){
    if(ev.key==="ArrowLeft")go(cur-1);
    if(ev.key==="ArrowRight")go(cur+1);
  });
  $("prevB").addEventListener("click",function(){go(cur-1)});
  $("nextB").addEventListener("click",function(){go(cur+1)});
  $("printB").addEventListener("click",function(){window.print()});
  renderSlide();renderQuiz();
})();
`;

    return (
      "<!DOCTYPE html>" +
      '<html lang="zh-CN"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>" + escHtml(title) + " · 启课教学成果</title>" +
      "<style>" + css + "</style></head><body>" +
      '<div class="wrap">' +
      '<div class="topbar">' +
      '<div class="brand"><span class="logo">启</span>启课智能教学台</div>' +
      '<div class="topbtns"><button class="tbtn" id="printB">🖨 打印</button></div>' +
      "</div>" +
      '<div class="card">' +
      '<div class="kicker">' + escHtml(meta.stage || "") + " · " + escHtml(meta.subject || "") + (meta.topic ? " · " + escHtml(meta.topic) : "") + "</div>" +
      "<h1>" + escHtml(art.title || "") + "</h1>" +
      (art.subtitle ? '<div class="sub">' + escHtml(art.subtitle) + "</div>" : "") +
      '<div class="meta-line">' +
      (meta.chapter ? '<span class="tag">' + escHtml(meta.chapter) + "</span>" : "") +
      (meta.type ? '<span class="tag">' + escHtml(meta.type) + "</span>" : "") +
      '<span class="tag">共 ' + slides.length + ' 页内容</span>' +
      (qa && qa.length ? '<span class="tag">' + qa.length + " 道" + escHtml(quizTitle || "题") + "</span>" : "") +
      "</div></div>" +
      '<div class="card"><div id="sv"></div>' +
      '<div class="stage"><div class="dots" id="dots"></div>' +
      '<div class="navbtns"><button class="navbtn" id="prevB">← 上一页</button>' +
      '<button class="navbtn primary" id="nextB">下一页 →</button></div></div>' +
      '<div class="counter" id="cnt"></div></div>' +
      (isQuiz || qa.length ? '<div class="card"><div class="kicker">互动测验</div><h1 id="titleB">' + escHtml(quizTitle || "随堂测验") + "</h1>" +
        '<div class="sub" id="scoreTip"></div><div id="qz"></div></div>' : "") +
      '<div class="foot">本文件由启课智能教学台生成 · 自包含单文件 · 可离线打开 · 支持打印</div>' +
      "</div>" +
      '<script>window.QK_DATA=' + dataJson + ";</scr" + "ipt>" +
      "<script>" + js + "</scr" + "ipt>" +
      "</body></html>"
    );
  }

  /* ============================================================
   * 5 · 下载与对外接口
   * ============================================================ */
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  }
  function exportPPTX(art, filename) {
    const slides = toSlides(art);
    if (!slides || !slides.length) return { ok: false, reason: "空内容" };
    const bytes = buildPPTX(art, slides);
    const blob = new Blob([bytes.buffer], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    downloadBlob(filename || "qike-" + safeName(art.title) + ".pptx", blob);
    return { ok: true, slides: slides.length, bytes: bytes.length };
  }
  function exportHTML(art, filename, opts) {
    const html = buildHTML(art, opts || {});
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    downloadBlob(filename || "qike-" + safeName(art.title) + ".html", blob);
    return { ok: true, bytes: html.length };
  }

  return { zipBuild, crc32, buildPPTX, toSlides, collectQA, buildHTML, exportPPTX, exportHTML, safeName };
})();