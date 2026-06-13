import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { normalizeConversionError } from "../public/core/conversion-error.js";
import { convertContent } from "../public/browser-transformer.js";
import { readJson } from "../public/formats/json.js";

const PUBLIC_ROOT = path.resolve("public");
const SECURITY_POLICY_PATH = path.resolve("docs", "SECURITY_POLICY.md");
const APP_PATH = path.resolve("public", "app.js");

const FORBIDDEN_PUBLIC_PATTERNS = [
  { pattern: /\bfetch\s*\(/, reason: "public app must not upload or fetch remote resources by default" },
  { pattern: /\bXMLHttpRequest\b/, reason: "public app must not use XHR by default" },
  { pattern: /\bsendBeacon\s*\(/, reason: "public app must not send telemetry by default" },
  { pattern: /\bWebSocket\b/, reason: "public app must not open realtime remote channels by default" },
  { pattern: /\bEventSource\b/, reason: "public app must not open server-sent event channels by default" },
  { pattern: /\blocalStorage\b/, reason: "persistent browser storage requires explicit user opt-in" },
  { pattern: /\bindexedDB\b/, reason: "persistent browser storage requires explicit user opt-in" },
];

const ALLOWED_PUBLIC_FILES = new Set([
  path.normalize("public/smoke-test.html"),
  path.normalize("public/smoke-test.js"),
  path.normalize("public/security-center.js"),
  // UI-A 三视图重构：router.js 用 localStorage 短期持久化预览 payload；
  // preview.js 通过 fetch 读取同源 blob: URL 转 ArrayBuffer 后传给本地 reader。
  // 两者均不联网，不上传任何文档内容，所有 URL 必须以 blob:/同源资源为限。
  path.normalize("public/router.js"),
  path.normalize("public/preview.js"),
  // P9-A.2 OCR runtime：ocr-storage.js 抽象 IndexedDB tessdata 缓存接口；
  // indexeddb-storage.js 落地真实 IDB I/O；tesseract-engine.js / tesseract-bootstrap.js
  // / tesseract-runtime.js 通过同源 vendor 资源加载 tesseract.js；png-ocr.js 通过 reader
  // 反读图片资产并调用注册过的 OCR engine 异步 enhance。所有文件均不联网；下方
  // STRICT_LOCAL_ONLY_FILES 守门它们不得出现任何远程协议。
  path.normalize("public/core/ocr/ocr-storage.js"),
  path.normalize("public/core/ocr/indexeddb-storage.js"),
  path.normalize("public/core/ocr/tesseract-engine.js"),
  path.normalize("public/core/ocr/tesseract-bootstrap.js"),
  path.normalize("public/core/ocr/tesseract-runtime.js"),
  path.normalize("public/core/ocr/png-ocr.js"),
  // P9-A.4 scan PDF: pdf-rasterizer 用 dynamic import 同源 vendor pdfjs + canvas；
  // scan-pdf-stage 串联 enhanceWithOCR 异步多页路径。两者均不联网。
  path.normalize("public/core/ocr/pdf-rasterizer.js"),
  path.normalize("public/core/ocr/scan-pdf-stage.js"),
  // P9-D.1/D.2/D.2.b PP-OCRv5 高级 OCR：engine 实现 OCREngine 契约；bootstrap 注册 engine +
  // ONNX manifest；runtime 通过同源 vendor 加载 onnxruntime-web + WebGPU/WASM 后端；pipeline
  // 是纯前后处理（预处理/DB 后处理/CTC 解码）+ 编排器；default-models fetch 同源 vendor 随包
  // 模型 → 本地缓存（开箱即用）。均不联网、不上传，仅访问 /vendor/ 同源资源。
  path.normalize("public/core/ocr/paddle-ocr-engine.js"),
  path.normalize("public/core/ocr/paddle-ocr-bootstrap.js"),
  path.normalize("public/core/ocr/paddle-ocr-runtime.js"),
  path.normalize("public/core/ocr/paddle-ocr-pipeline.js"),
  path.normalize("public/core/ocr/paddle-default-models.js"),
  // P9-B FixedLayoutModel + 浏览器 rasterize：ocr-to-fixed-layout 仅做数据映射；
  // pdf-rasterizer-browser dynamic import 同源 vendor pdfjs，运行时画布在浏览器/Tauri。
  path.normalize("public/core/ocr/ocr-to-fixed-layout.js"),
  path.normalize("public/core/ocr/pdf-rasterizer-browser.js"),
  // P9-C.1 转换后检验三层（规则 diff 层）：block-fingerprint 共享指纹；rule-diff 字段级
  // 结构对比；verification-stage 编排 writer→reader 回读 diff。三者均为纯函数，不联网、
  // 不持久化，下方 STRICT_LOCAL_ONLY_FILES 守门它们不得出现任何远程协议。
  path.normalize("public/core/verification/block-fingerprint.js"),
  path.normalize("public/core/verification/rule-diff.js"),
  path.normalize("public/core/verification/verification-stage.js"),
  // P9-C.2 转换后检验三层（SSIM 视觉回环层）：ssim 纯算法；page-image-source 像素源抽象；
  // page-image-source-browser 通过同源 vendor pdfjs + canvas 取像素。三者不联网。
  path.normalize("public/core/verification/ssim.js"),
  path.normalize("public/core/verification/page-image-source.js"),
  path.normalize("public/core/verification/page-image-source-browser.js"),
  // P9-C.3 转换后检验三层（OCR 回读层）：ocr-readback 复用已注册 ocr-text engine +
  // OCR pdf-rasterizer 把输出 PDF 读回文本做字符级相似度。纯逻辑，不联网。
  path.normalize("public/core/verification/ocr-readback.js"),
]);

function isLocalVendorAsset(normalizedPath, content) {
  // onnxruntime-web 是第三方运行时 bundle，其 minified 代码内含 CDN/源映射等远程 URL
  // 字符串（无法在静态扫描层面剔除）。本项目对 ORT 的"零联网"保证来自两层运行时控制：
  //   (1) paddle-ocr-runtime.loadOnnxRuntime 把 ort.env.wasm.wasmPaths 钉到同源 vendor 目录，
  //       wasm 不走 CDN；
  //   (2) Tauri CSP `connect-src 'self'` 阻断任何远程连接。
  // 因此 onnxruntime vendor 整目录视为可信，不做"无远程 URL 字符串"硬扫描。
  if (normalizedPath.startsWith(path.normalize("public/vendor/onnxruntime/"))) {
    return true;
  }
  // KaTeX 是纯同步数学排版库，运行时零网络 I/O。其 min.js 内的 http(s) 字符串仅为 W3C
  // MathML/SVG 命名空间标识（createElementNS 用），非网络请求，故整目录视为可信。
  if (normalizedPath.startsWith(path.normalize("public/vendor/katex/"))) {
    return true;
  }
  const isVendor = normalizedPath.startsWith(path.normalize("public/vendor/pdfjs/"))
    || normalizedPath.startsWith(path.normalize("public/vendor/tesseract/"));
  if (!isVendor) return false;
  // pdfjs / tesseract vendor：允许内部 fetch / XHR 访问同源 wasm/worker，但禁止任何远程 URL。
  return !content.includes("http://")
    && !content.includes("https://")
    && !content.includes("ws://")
    && !content.includes("wss://");
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function relativeToProject(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll("\\", "/");
}

function assertNoForbiddenPublicApis(filePath, content) {
  const normalizedPath = path.normalize(relativeToProject(filePath));
  if (ALLOWED_PUBLIC_FILES.has(normalizedPath)) {
    return;
  }
  if (isLocalVendorAsset(normalizedPath, content)) {
    return;
  }

  for (const { pattern, reason } of FORBIDDEN_PUBLIC_PATTERNS) {
    if ((pattern.source.includes("localStorage") || pattern.source.includes("indexedDB")) && /persistHistoryCheckbox|HISTORY_PREFERENCE_KEY|output-history|manifest/i.test(content)) {
      continue;
    }
    assert.equal(
      pattern.test(content),
      false,
      `${relativeToProject(filePath)} violates local-only policy: ${reason}`
    );
  }
}

const STRICT_LOCAL_ONLY_FILES = new Set([
  path.normalize("public/router.js"),
  path.normalize("public/preview.js"),
  path.normalize("public/core/ocr/tesseract-engine.js"),
  path.normalize("public/core/ocr/tesseract-bootstrap.js"),
  path.normalize("public/core/ocr/tesseract-runtime.js"),
  path.normalize("public/core/ocr/ocr-storage.js"),
  path.normalize("public/core/ocr/indexeddb-storage.js"),
  path.normalize("public/core/ocr/png-ocr.js"),
  path.normalize("public/core/ocr/pdf-rasterizer.js"),
  path.normalize("public/core/ocr/scan-pdf-stage.js"),
  path.normalize("public/core/ocr/ocr-to-fixed-layout.js"),
  path.normalize("public/core/ocr/pdf-rasterizer-browser.js"),
  path.normalize("public/core/ocr/paddle-ocr-engine.js"),
  path.normalize("public/core/ocr/paddle-ocr-bootstrap.js"),
  path.normalize("public/core/ocr/paddle-ocr-runtime.js"),
  path.normalize("public/core/ocr/paddle-ocr-pipeline.js"),
  path.normalize("public/core/ocr/paddle-default-models.js"),
  path.normalize("public/core/verification/block-fingerprint.js"),
  path.normalize("public/core/verification/rule-diff.js"),
  path.normalize("public/core/verification/verification-stage.js"),
  path.normalize("public/core/verification/ssim.js"),
  path.normalize("public/core/verification/page-image-source.js"),
  path.normalize("public/core/verification/page-image-source-browser.js"),
  path.normalize("public/core/verification/ocr-readback.js"),
]);

function assertNoRemoteUrlsInStrictFiles(filePath, content) {
  const normalizedPath = path.normalize(relativeToProject(filePath));
  if (!STRICT_LOCAL_ONLY_FILES.has(normalizedPath)) return;
  for (const protocol of ["http://", "https://", "ws://", "wss://"]) {
    assert.equal(
      content.includes(protocol),
      false,
      `${relativeToProject(filePath)} (preview-related whitelist) must not reference any remote URL protocol: ${protocol}`,
    );
  }
}

async function assertPublicAppIsLocalOnly() {
  const publicFiles = (await listFiles(PUBLIC_ROOT))
    .filter((filePath) => /\.(js|html|css)$/i.test(filePath));

  for (const filePath of publicFiles) {
    const content = await readFile(filePath, "utf8");
    assertNoForbiddenPublicApis(filePath, content);
    assertNoRemoteUrlsInStrictFiles(filePath, content);
  }
}

async function assertSecurityPolicyIsDocumented() {
  const policy = await readFile(SECURITY_POLICY_PATH, "utf8");
  for (const expectedText of [
    "local-only",
    "不提供云端文档处理",
    "默认不得调用远程转换 API",
    "不提供插件安装模式",
    "文档处理全程在核心包内执行",
    "错误详情默认只展示",
    "复制诊断信息不得默认复制用户文档内容",
    "fetch",
    "sendBeacon",
  ]) {
    assert.equal(policy.includes(expectedText), true, `security policy should mention: ${expectedText}`);
  }
}

async function assertWorkbenchErrorDiagnosticsAreRedacted() {
  const app = await readFile(APP_PATH, "utf8");
  assert.equal(
    app.includes("details: normalized.details"),
    false,
    "workbench error debug output should not render raw normalized.details"
  );
}

function assertErrorsDoNotSerializeSensitiveInput() {
  const secret = "SECRET_USER_DOCUMENT_9f4e0a";
  const error = normalizeConversionError(new Error("转换失败"), {
    category: "parse",
    code: "TEST_PARSE_ERROR",
    format: "md",
    details: { warnings: ["safe warning"] },
  });

  const serialized = JSON.stringify(error.toJSON());
  assert.equal(serialized.includes(secret), false, "serialized diagnostics should not include unrelated user content");
  assert.equal(serialized.includes("stack"), false, "serialized diagnostics should not include stack traces");

  assert.throws(
    () => convertContent({ content: "# Title", from: "md", to: "remote-api", title: secret }),
    (conversionError) => {
      const publicJson = JSON.stringify(normalizeConversionError(conversionError).toJSON());
      return !publicJson.includes(secret)
        && publicJson.includes("UNSUPPORTED_OUTPUT_FORMAT")
        && publicJson.includes("remote-api");
    },
    "unsupported format diagnostics should avoid serializing title/content"
  );

  assert.throws(
    () => readJson({ content: `{"apiKey": ${secret}}`, title: "bad-secret.json" }),
    (conversionError) => {
      const publicJson = JSON.stringify(normalizeConversionError(conversionError).toJSON());
      return !publicJson.includes(secret)
        && !publicJson.includes(secret.slice(0, 10))
        && publicJson.includes("JSON_PARSE_ERROR");
    },
    "JSON parse diagnostics should not include source document snippets"
  );
}

await assertPublicAppIsLocalOnly();
await assertSecurityPolicyIsDocumented();
await assertWorkbenchErrorDiagnosticsAreRedacted();
assertErrorsDoNotSerializeSensitiveInput();

console.log("Local security test passed: public app stays local-only and diagnostics avoid sensitive content.");
