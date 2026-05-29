import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  tasks: await readFile("DEVELOPMENT_TASKS.md", "utf8"),
  desktop: await readFile("docs/DESKTOP_APP_ARCHITECTURE.md", "utf8"),
  release: await readFile("docs/DESKTOP_RELEASE_PLAN.md", "utf8"),
  budget: await readFile("docs/RESOURCE_BUDGET.md", "utf8"),
  strategy: await readFile("docs/PRODUCT_STRATEGY.md", "utf8"),
  multiModel: await readFile("docs/MULTI_MODEL_ARCHITECTURE.md", "utf8"),
};

function assertIncludes(fileKey, expected) {
  assert.equal(
    files[fileKey].includes(expected),
    true,
    `${fileKey} should mention: ${expected}`
  );
}

function assertExcludes(fileKey, forbidden) {
  assert.equal(
    files[fileKey].includes(forbidden),
    false,
    `${fileKey} should no longer mention stale wording: ${forbidden}`
  );
}

function assertExcludesPattern(fileKey, pattern, description) {
  assert.equal(
    pattern.test(files[fileKey]),
    false,
    `${fileKey} should no longer match stale pattern (${description}): ${pattern}`
  );
}

// DEVELOPMENT_TASKS.md
assertIncludes("tasks", "不依赖 Office、LibreOffice、Pandoc、云端转换或云端 OCR/AI");
assertIncludes("tasks", "Repair Engine");
assertIncludes("tasks", "model-cache");
assertIncludes("tasks", "30–80 MB");
assertIncludes("tasks", "默认包不含 GB 级模型");
assertIncludes("tasks", "OCR 模型按需下载");
assertIncludes("tasks", "qualityReport.ruleDiff");
assertExcludes("tasks", "不依赖 Office、LibreOffice、Pandoc、云端转换或 OCR/AI");
assertExcludesPattern(
  "tasks",
  /手动\s*安装[、，,]\s*手动\s*启用/,
  "manual install + manual enable drift"
);
assertExcludes("tasks", "默认安装包内置 PaddleOCR-VL");
assertExcludes("tasks", "默认安装包内置 MinerU");
assertExcludes("tasks", "默认打包 PaddleOCR-VL");
assertExcludes("tasks", "默认打包 MinerU");
assertExcludes("tasks", "默认内置 GB 级模型");

// docs/DESKTOP_APP_ARCHITECTURE.md
assertIncludes("desktop", "Repair Engine");
assertIncludes("desktop", "30–80 MB");
assertIncludes("desktop", "model-cache");
assertIncludes("desktop", "on-demand local OCR/layout model resources");
assertIncludes("desktop", "不进入默认安装包");
assertExcludes("desktop", "安装包内置、按需加载、可禁用");
assertExcludes("desktop", "手动安装、手动启用");
assertExcludes("desktop", "bundled local document models");
assertExcludesPattern(
  "desktop",
  /本地模型[^。]{0,40}需要[^。]{0,20}手动(安装|启用)/,
  "local-model needs manual install/enable drift"
);

// docs/DESKTOP_RELEASE_PLAN.md
assertIncludes("release", "OCR 模型资源不进入默认安装包");
assertIncludes("release", "首次启用时本地下载到 model-cache");
assertIncludes("release", "30–80 MB");
assertIncludes("release", "checksum");
assertIncludes("release", "缓存路径");
assertIncludes("release", "断网降级提示");
assertIncludes("release", "规则 diff");
assertIncludes("release", "SSIM 视觉对比");
assertIncludes("release", "OCR 回读");
assertExcludes("release", "本地模型资源必须手动安装");
assertExcludes("release", "模型资源随正式安装包交付");
assertExcludes("release", "含模型版本必须包含内置模型 manifest");
assertExcludesPattern(
  "release",
  /模型[^。\n]{0,40}随\s*(正式)?\s*安装包\s*交付/,
  "models-shipped-with-installer drift"
);
assertExcludesPattern(
  "release",
  /模型[^。]{0,20}必须[^。]{0,20}手动(安装|启用|下载)/,
  "model must-be-manually-installed drift"
);

// docs/RESOURCE_BUDGET.md
assertIncludes("budget", "轻量核心预算");
assertIncludes("budget", "OCR 模型缓存目录预算");
assertIncludes("budget", "30–80 MB");
assertIncludes("budget", "model-cache");
assertIncludes("budget", "GB 级模型");
assertExcludes("budget", "模型增强桌面包预算");
assertExcludes("budget", "模型资源随安装包交付");
assertExcludesPattern(
  "budget",
  /模型[^。\n]{0,30}随\s*(正式)?\s*安装包\s*交付/,
  "models-shipped-with-installer budget drift"
);

// docs/PRODUCT_STRATEGY.md
assertIncludes("strategy", "软件自动修复");
assertIncludes("strategy", "文档图像、文字、版面和表格专用本地模型");
assertIncludes("strategy", "默认包不含 GB 级模型");
assertIncludes("strategy", "model-cache");
assertIncludes("strategy", "规则 diff");
assertIncludes("strategy", "OCR 回读");

// docs/MULTI_MODEL_ARCHITECTURE.md
assertIncludes("multiModel", "Repair Engine");
assertIncludes("multiModel", "核心本地内置模型");
assertIncludes("multiModel", "model-cache");
assertIncludes("multiModel", "30–80 MB");
assertIncludes("multiModel", "REPAIR_ACTION_TYPES");
assertIncludes("multiModel", "runCycle");
assertIncludes("multiModel", "defaultRepairEngine");
assertIncludes("multiModel", "defaultModelCache");
assertIncludes("multiModel", "MODEL_TASKS");
assertIncludes("multiModel", "MODEL_ENGINES");
assertIncludes("multiModel", "createModelManifest");
assertIncludes("multiModel", "defaultOCRRegistry");
assertIncludes("multiModel", "createOCRResult");
assertIncludes("multiModel", "OCR_UNAVAILABLE");
assertIncludes("multiModel", "placeholderOCREngine");
assertIncludes("multiModel", "tesseractOCREngine");
assertIncludes("multiModel", "defaultOCRStorage");
assertIncludes("multiModel", "wasm-unsafe-eval");
assertIncludes("multiModel", "IndexedDBStorage");
assertIncludes("multiModel", "loadTesseractRuntime");
assertIncludes("multiModel", "enhanceWithOCR");
assertIncludes("multiModel", "convertContentAsync");
assertIncludes("multiModel", "runOCRStage");
assertIncludes("multiModel", "detectOCRLowConfidence");
assertIncludes("multiModel", "isScannedPdf");
assertIncludes("multiModel", "runScannedPdfOCRStage");
assertIncludes("multiModel", "defaultPdfPageRasterizer");
assertIncludes("multiModel", "ocrResultToFixedLayoutPage");
assertIncludes("multiModel", "mergeOCRResultsToFixedLayout");
assertIncludes("multiModel", "createBrowserPdfPageRasterizer");
assertIncludes("multiModel", "MODEL_TEXT_ORDER_HEURISTIC");
assertIncludes("multiModel", "runVerificationStage");
assertIncludes("multiModel", "diffSemanticDocs");
assertIncludes("multiModel", "RULE_DIFF_DRIFT");
assertIncludes("multiModel", "computeSSIM");
assertIncludes("multiModel", "runVerificationStageAsync");
assertIncludes("multiModel", "SSIM_VISUAL_DRIFT");
assertIncludes("multiModel", "runOcrReadbackLayer");
assertIncludes("multiModel", "compareText");
assertIncludes("multiModel", "OCR_READBACK_DRIFT");
assertIncludes("budget", "model-cache/<task>/<engine>/<modelVersion>");
assertIncludes("budget", "SHA-256");
assertExcludes("multiModel", "external engine 一律插件化");
assertExcludesPattern(
  "multiModel",
  /external\s+engine[^。\n]{0,30}插件化/i,
  "external-engine plugin drift"
);

console.log("Local model direction test passed: active docs match lightweight-default-bundle + on-demand OCR direction.");
