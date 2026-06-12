// OCR 语言码单一事实来源：canonical 码沿用 ocr-result.js 的 OCR_LANGUAGES
// （BCP-47 风格：zh-CN/zh-TW/en/ja/ko/auto）；tesseract 码（chi_sim 等）只在
// tesseract 边界出现。零依赖，避免循环 import。

export const DEFAULT_OCR_LANGUAGE = "zh-CN";

// canonical 语言枚举的单一定义点（ocr-result.js re-export 以保持既有 API）。
export const OCR_LANGUAGES = Object.freeze([
  "zh-CN",
  "zh-TW",
  "en",
  "ja",
  "ko",
  "auto",
]);

const ALIASES = new Map([
  ["chi_sim", "zh-CN"],
  ["chi_tra", "zh-TW"],
  ["eng", "en"],
  ["jpn", "ja"],
  ["kor", "ko"],
  ["zh", "zh-CN"],
  ["zh-cn", "zh-CN"],
  ["zh_cn", "zh-CN"],
  ["zh-hans", "zh-CN"],
  ["zh-tw", "zh-TW"],
  ["zh_tw", "zh-TW"],
  ["zh-hant", "zh-TW"],
  ["en", "en"],
  ["en-us", "en"],
  ["ja", "ja"],
  ["ko", "ko"],
  ["auto", "auto"],
]);

// 未知值原样透传：validateOCRResult 继续拒绝真正的垃圾值，归一化只消化已知别名。
export function normalizeOCRLanguage(value) {
  if (value === undefined || value === null || value === "") return "auto";
  const key = String(value).trim().toLowerCase();
  return ALIASES.get(key) || String(value);
}

// stage 边界用：用户配置的未知语言收敛为 "auto"，避免推理成功后才在结果校验处
// 整体失败（与 #47 同签名的静默丢弃）。引擎边界（createOCRResult）仍用严格透传版。
export function coerceOCRLanguage(value) {
  const normalized = normalizeOCRLanguage(value);
  return OCR_LANGUAGES.includes(normalized) ? normalized : "auto";
}

const TESSDATA = new Map([
  ["zh-CN", "chi_sim"],
  ["zh-TW", "chi_tra"],
  ["en", "eng"],
  ["ja", "jpn"],
  ["ko", "kor"],
]);

// canonical 码 → tessdata 文件语言码；auto/未知 → null（调用方回退默认候选序）。
export function toTesseractLanguage(value) {
  return TESSDATA.get(normalizeOCRLanguage(value)) || null;
}
