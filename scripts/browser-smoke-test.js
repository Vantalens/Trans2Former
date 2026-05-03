import assert from "node:assert/strict";

import { startWebServer } from "../src/web-server.js";

async function fetchText(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  assert.equal(response.ok, true, `${pathname} should return HTTP ${response.status}`);
  return response.text();
}

const { server, port } = await startWebServer(0);
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.ok, true, "/api/health should be available");
  assert.deepEqual(await healthResponse.json(), { ok: true, mode: "browser-first" });

  const indexHtml = await fetchText(baseUrl, "/");
  assert.equal(indexHtml.includes("id=\"fileInput\""), true, "main app should expose upload control");
  assert.equal(indexHtml.includes("id=\"fromFormatSelect\""), true, "main app should expose input format control");
  assert.equal(indexHtml.includes("id=\"toFormatSelect\""), true, "main app should expose output format control");
  assert.equal(indexHtml.includes("id=\"downloadOutputButton\""), true, "main app should expose download control");
  assert.equal(indexHtml.includes("id=\"htmlPreview\""), true, "main app should expose preview panel");
  assert.equal(indexHtml.includes("id=\"errorDetailsPanel\""), true, "main app should expose error details panel");
  assert.equal(indexHtml.includes("id=\"copyErrorDiagnosticsButton\""), true, "main app should expose sanitized diagnostics copy control");
  assert.equal(indexHtml.includes("id=\"conversionProgress\""), true, "main app should expose conversion progress element");
  assert.equal(indexHtml.includes("id=\"progressStage\""), true, "main app should expose progress stage label");
  assert.equal(indexHtml.includes("id=\"fileQueuePanel\""), true, "P0 workbench should expose file queue panel");
  assert.equal(indexHtml.includes("id=\"selectAllQueueButton\""), true, "P0 workbench should expose batch selection");
  assert.equal(indexHtml.includes("id=\"retryFailedButton\""), true, "P0 workbench should expose failed task retry");
  assert.equal(indexHtml.includes("id=\"outputDirectoryButton\""), true, "P0 workbench should expose output directory chooser");
  assert.equal(indexHtml.includes("id=\"exportNamingInput\""), true, "P0 workbench should expose export naming strategy");
  assert.equal(indexHtml.includes("id=\"inputPreviewPanel\""), true, "P0 workbench should expose input preview pane");
  assert.equal(indexHtml.includes("id=\"documentModelPanel\""), true, "P0 workbench should expose DocumentModel pane");
  assert.equal(indexHtml.includes("id=\"outputPreviewPanel\""), true, "P0 workbench should expose output preview pane");
  assert.equal(indexHtml.includes("id=\"workbenchTabs\""), true, "P0 workbench should expose narrow-screen tabs");
  assert.equal(indexHtml.includes("id=\"bottomReportPanel\""), true, "P0 workbench should expose bottom report panel");
  assert.equal(indexHtml.includes("id=\"warningsPanel\""), true, "P0 workbench should expose warnings panel");
  assert.equal(indexHtml.includes("id=\"qualityReportPanel\""), true, "P0 workbench should expose quality report panel");
  assert.equal(indexHtml.includes("id=\"diffPanel\""), true, "P0 workbench should expose diff panel");
  assert.equal(indexHtml.includes("id=\"versionsPanel\""), true, "P0 workbench should expose versions panel");
  assert.equal(indexHtml.includes("id=\"pluginManagerButton\""), true, "P0 workbench should expose plugin manager entry");
  assert.equal(indexHtml.includes("id=\"securityCenterButton\""), true, "P0 workbench should expose security center entry");
  assert.equal(indexHtml.includes("id=\"pluginDownloadPanel\""), true, "P0 workbench should expose plugin download entry");
  assert.equal(indexHtml.includes("id=\"pluginUpdatePanel\""), true, "P0 workbench should expose plugin update entry");
  assert.equal(indexHtml.includes("<details id=\"fileQueuePanel\""), true, "modern workbench should keep file queue collapsed by default");
  assert.equal(indexHtml.includes("<details id=\"bottomReportPanel\""), true, "modern workbench should keep reports and plugin metadata collapsed by default");
  assert.equal(indexHtml.includes("workspace-primary"), true, "modern workbench should expose a simple primary two-pane workflow");
  assert.equal(indexHtml.includes("class=\"auxiliary-actions\""), true, "modern workbench should group secondary actions away from the primary command path");
  assert.equal(indexHtml.includes("class=\"output-settings\""), true, "modern workbench should keep export settings behind disclosure");
  assert.equal(indexHtml.includes("class=\"viewer-grid single-view\""), true, "modern workbench should show one right-side work view at a time");

  const smokeHtml = await fetchText(baseUrl, "/smoke-test.html");
  assert.equal(smokeHtml.includes("Trans2Former Browser Smoke Test"), true);
  assert.equal(smokeHtml.includes("src=\"/smoke-test.js\""), true);

  const smokeJs = await fetchText(baseUrl, "/smoke-test.js");
  assert.equal(smokeJs.includes("new File("), true, "browser smoke should simulate uploading a sample file");
  assert.equal(smokeJs.includes("detectFormatFromName"), true, "browser smoke should select input format from file name");
  assert.equal(smokeJs.includes("convertContent"), true, "browser smoke should execute conversion");
  assert.equal(smokeJs.includes("createDownloadAnchor"), true, "browser smoke should verify download behavior");
  assert.equal(smokeJs.includes("renderPreviewHtml"), true, "browser smoke should verify preview refresh");

  const transformerJs = await fetchText(baseUrl, "/browser-transformer.js");
  assert.equal(transformerJs.includes("ConverterRegistry"), true, "browser transformer module should be served");

  const appJs = await fetchText(baseUrl, "/app.js");
  assert.equal(appJs.includes("renderErrorDetails"), true, "main app should render structured conversion errors");
  assert.equal(appJs.includes("sanitizeErrorDiagnostics"), true, "main app should sanitize copied diagnostics");
  assert.equal(appJs.includes("updateConversionProgress"), true, "main app should update staged conversion progress");
  assert.equal(appJs.includes("resetGeneratedOutput"), true, "main app should centralize generated output cleanup");
  assert.equal(appJs.includes("resetGeneratedOutput(\"已取消，未保留输出\")"), true, "cancel action should clear stale output and download URLs");
  assert.equal(appJs.includes("requestIdleCallback"), true, "preview rendering should be scheduled through idle callback when available");
  assert.equal(appJs.includes("readFileAsTextChunked"), true, "large text files should enter through chunked reading");
  assert.equal(appJs.includes("LARGE_FILE_PREVIEW_BYTES"), true, "large file preview policy should be explicit");
  assert.equal(appJs.includes("BINARY_INPUT_FORMATS"), true, "binary formats should avoid text decoding");
  assert.equal(appJs.includes("createQueueItem"), true, "main app should track queued files as reusable workbench state");
  assert.equal(appJs.includes("renderDocumentModelPanel"), true, "main app should render DocumentModel inspection");
  assert.equal(appJs.includes("renderBottomReports"), true, "main app should render warnings, quality, diff, and versions");
  assert.equal(appJs.includes("chooseOutputDirectory"), true, "main app should expose explicit output directory selection");
  assert.equal(appJs.includes("buildExportFileName"), true, "main app should apply export naming strategy");
  assert.equal(appJs.includes("retryFailedQueueItems"), true, "main app should retry failed queued tasks");
  assert.equal(appJs.includes("showWorkbenchTab"), true, "main app should support narrow-screen workbench tabs");
  assert.equal(appJs.includes("setActiveWorkbenchTab"), true, "main app should keep a single active workbench view on desktop and mobile");
  assert.equal(appJs.includes("docx"), true, "main app should accept DOCX input");
  for (const format of ["xlsx", "epub", "pdf", "pptx"]) {
    assert.equal(appJs.includes(format), true, `main app should accept ${format.toUpperCase()} input`);
  }

  const workerJs = await fetchText(baseUrl, "/workers/convert-worker.js");
  assert.equal(workerJs.includes("postMessage"), true, "conversion worker should be served");
  for (const stage of ["read", "parse", "validate", "convert", "render", "package"]) {
    assert.equal(workerJs.includes(`stage: \"${stage}\"`), true, `conversion worker should emit ${stage} stage`);
  }

  console.log(`Browser smoke test passed: static app and browser self-test are available at ${baseUrl}/smoke-test.html.`);
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
