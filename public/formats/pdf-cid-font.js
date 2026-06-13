// PDF CID 字体公共模块：供 pdf-output.js 与 pdf-output-high-fidelity.js 共享，
// 避免双份字体/编码逻辑，统一解决 #105（/W 宽度数组）与 #107（编码声明）。

// UTF-16BE hex 编码（含代理对）：>0xFFFF 码点拆为 D800-DBFF + DC00-DFFF。
export function utf16BeHex(value) {
  return [...String(value ?? "")]
    .map((char) => char.codePointAt(0))
    .flatMap((codePoint) => {
      if (codePoint <= 0xffff) return [codePoint];
      const offset = codePoint - 0x10000;
      return [0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)];
    })
    .map((codeUnit) => codeUnit.toString(16).toUpperCase().padStart(4, "0"))
    .join("");
}

// PDF Unicode 字符串（BOM + UTF-16BE hex）：用于 /Title 等元信息。
export function pdfUnicodeString(value) {
  return `<FEFF${utf16BeHex(value)}>`;
}

// 构建 CID 字体对象字典（#105 + #107）：
// /W [1 95 500] 把 Adobe-GB1 半角 Latin CID 区段（U+0020-U+007E）声明为 500/1000em；
// /Encoding UniGB-UTF16-H（Adobe CMap，4 字节 codespace 含代理对，BMP 区向后兼容 UCS-2）；
// /Supplement 5 对应 Adobe-GB1-5（含 CJK Ext-B）。
export function buildCidFontObjects({ cidFontRef, descriptorRef }) {
  const type0 = `<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UTF16-H /DescendantFonts [${cidFontRef} 0 R] >>`;

  const cidFont = `<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >> /FontDescriptor ${descriptorRef} 0 R /DW 1000 /W [1 95 500] >>`;

  const descriptor = `<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /FontBBox [-160 -249 1015 1000] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 737 /StemV 58 >>`;

  return { type0, cidFont, descriptor };
}

// 字符宽度系数（配合 /W 与 DW）：ASCII 半角 0.5（对齐 500/1000），其他全角 1.0（DW=1000）。
export function charWidthFactor(codePoint) {
  return (codePoint >= 0x20 && codePoint <= 0x7e) ? 0.5 : 1.0;
}

// Adobe-GB1 覆盖外字符降级（#107）：谚文/emoji 等替换为 □（U+25A1，GB2312 一区已收，
// 全角 1000 与 charWidthFactor 1.0 一致）。返回 { text, dropped }。
export function sanitizeGb1Text(text) {
  const dropped = new Map();
  const hangul = (cp) => (cp >= 0x1100 && cp <= 0x11FF) || (cp >= 0x3130 && cp <= 0x318F)
    || (cp >= 0xA960 && cp <= 0xA97F) || (cp >= 0xAC00 && cp <= 0xD7FF);
  const cjkExtB = (cp) => cp >= 0x20000 && cp <= 0x2A6DF;

  const chars = [...String(text ?? "")];
  const out = chars.map((char) => {
    const cp = char.codePointAt(0);
    if (hangul(cp) || (cp > 0xFFFF && !cjkExtB(cp))) {
      dropped.set(char, (dropped.get(char) || 0) + 1);
      return "□";
    }
    return char;
  });

  return { text: out.join(""), dropped };
}
