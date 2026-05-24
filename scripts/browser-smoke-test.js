import assert from "node:assert/strict";
import net from "node:net";

import { startWebServer } from "../src/web-server.js";

const FETCH_SAFE_PORT_START = 49152;
const FETCH_SAFE_PORT_END = 49232;

async function isPortAvailable(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findFetchSafePort() {
  for (let port = FETCH_SAFE_PORT_START; port <= FETCH_SAFE_PORT_END; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error("No fetch-safe local port is available for browser smoke test");
}

async function fetchText(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  assert.equal(response.ok, true, `${pathname} should return HTTP ${response.status}`);
  return response.text();
}

const { server, port } = await startWebServer(await findFetchSafePort());
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
  assert.equal(indexHtml.includes("id=\"pluginManagerButton\""), false, "workbench should not expose plugin manager entry after core integration");
  assert.equal(indexHtml.includes("id=\"securityCenterButton\""), true, "P0 workbench should expose security center entry");
  assert.equal(indexHtml.includes("id=\"pluginDownloadPanel\""), false, "workbench should not expose plugin download entry");
  assert.equal(indexHtml.includes("id=\"importPluginInput\""), false, "workbench should not expose local plugin import");
  assert.equal(indexHtml.includes("class=\"bottom-drawer\""), true, "workbench should host quality and version reports in a collapsible bottom drawer");
  assert.equal(indexHtml.includes("<details id=\"fileQueuePanel\""), true, "modern workbench should keep file queue collapsed by default");
  assert.equal(indexHtml.includes("<details id=\"fileQueuePanel\" class=\"queue-panel\" aria-label=\"文件队列\" hidden>"), true, "primary UI should hide batch queue from the default user path");
  assert.equal(indexHtml.includes("<details id=\"bottomReportPanel\""), true, "modern workbench should expose reports via the bottom drawer");
  assert.equal(indexHtml.includes("<details id=\"bottomReportPanel\" class=\"bottom-drawer\""), true, "bottom drawer is the host for quality and version reports");
  assert.equal(/<details id="bottomReportPanel"[^>]*\sopen[\s>]/.test(indexHtml), false, "drawer should be collapsed by default to keep the primary flow uncluttered");
  assert.equal(indexHtml.includes("workspace-primary"), true, "modern workbench should expose a focused primary workflow");
  assert.equal(indexHtml.includes("class=\"auxiliary-actions\""), true, "modern workbench should group secondary actions away from the primary command path");
  assert.equal(indexHtml.includes("class=\"auxiliary-actions\" hidden"), false, "secondary actions should be reachable from the default workbench");
  assert.equal(indexHtml.includes("class=\"output-settings\""), true, "modern workbench should keep export settings behind disclosure");
  assert.equal(indexHtml.includes("class=\"viewer-grid single-view\""), true, "modern workbench should show one right-side work view at a time");
  assert.equal(indexHtml.includes("class=\"topbar-progress\""), true, "progress should be embedded in the topbar instead of a separate row");
  assert.equal(indexHtml.includes("data-drawer-tab=\"drawerPluginsGroup\""), false, "drawer should not expose plugin groups after core integration");

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
  assert.equal(transformerJs.includes("writeJpeg"), false, "browser transformer must not register placeholder JPEG output");
  assert.equal(transformerJs.includes("writePng"), false, "browser transformer must not register placeholder PNG output");

  const registryJs = await fetchText(baseUrl, "/core/format-registry.js");
  assert.equal(registryJs.includes("getAllowedOutputFormats"), true, "format registry should expose the conversion path matrix");
  assert.equal(registryJs.includes('docx: ["md", "html", "txt", "json", "docx", "pdf"]'), true, "DOCX should not expose PPTX as an output path");
  assert.equal(registryJs.includes('png: ["html", "txt", "json", "pdf"]'), true, "PNG should stay input-only apart from readable/document outputs");

  const appJs = await fetchText(baseUrl, "/app.js");
  const stylesCss = await fetchText(baseUrl, "/styles.css");
  const fileQueueJs = await fetchText(baseUrl, "/core/file-queue-ui.js");
  const pdfFormatJs = await fetchText(baseUrl, "/formats/pdf.js");
  const pdfJsVendor = await fetchText(baseUrl, "/vendor/pdfjs/pdf.min.mjs");
  assert.equal(appJs.includes("renderErrorDetails"), true, "main app should render structured conversion errors");
  assert.equal(appJs.includes("sanitizeErrorDiagnostics"), true, "main app should sanitize copied diagnostics");
  assert.equal(appJs.includes("updateConversionProgress"), true, "main app should update staged conversion progress");
  assert.equal(appJs.includes("resetGeneratedOutput"), true, "main app should centralize generated output cleanup");
  assert.equal(appJs.includes("resetGeneratedOutput(\"已取消，未保留输出\")"), true, "cancel action should clear stale output and download URLs");
  assert.equal(appJs.includes("showWorkbenchTab(\"outputPreviewPanel\")"), true, "successful conversion should switch to the output view");
  assert.equal(appJs.includes("sourcePane?.classList.toggle(\"is-binary-input\", binary)"), true, "binary inputs should use compact source-pane layout");
  assert.equal(appJs.includes("requestIdleCallback"), true, "preview rendering should be scheduled through idle callback when available");
  assert.equal(appJs.includes("readFileAsTextChunked"), true, "large text files should enter through chunked reading");
  assert.equal(appJs.includes("LARGE_FILE_PREVIEW_BYTES"), true, "large file preview policy should be explicit");
  assert.equal(appJs.includes("WORKER_TRANSFERABLE_THRESHOLD_BYTES"), true, "P2 should define when large payloads move to Worker Transferable");
  assert.equal(appJs.includes("buildWorkerPayload"), true, "P2 should prepare Worker payloads for transferable ArrayBuffer delivery");
  assert.equal(appJs.includes("worker.postMessage({ id, payload: workerPayload }, transferList)"), true, "P2 should transfer ArrayBuffer ownership to the Worker");
  assert.equal(appJs.includes("VIRTUAL_LIST_ITEM_LIMIT"), true, "P2 should virtualize long report and version lists");
  assert.equal(appJs.includes("renderVirtualTextList"), true, "P2 should centralize virtual list rendering");
  assert.equal(appJs.includes("LARGE_PROGRESSIVE_PREVIEW_BYTES"), true, "P2 should define a 50MB+ progressive preview threshold");
  assert.equal(appJs.includes("LARGE_DEGRADED_PREVIEW_BYTES"), true, "P2 should define a 100MB+ degraded preview threshold");
  assert.equal(appJs.includes("renderLargeDocumentPreview"), true, "P2 should render large-file summary/sample previews without full parse");
  assert.equal(appJs.includes("releaseConversionResources"), true, "P2 should centralize Worker and ObjectURL lifecycle cleanup");
  assert.equal(appJs.includes("BINARY_INPUT_FORMATS"), true, "binary formats should avoid text decoding");
  assert.equal(appJs.includes("getAllowedOutputFormats"), true, "main app should filter output formats by supported conversion paths");
  assert.equal(appJs.includes("currentInputContent"), true, "binary uploads should keep raw conversion payload separate from editor display text");
  assert.equal(appJs.includes("getActiveInputContent"), true, "conversion and preview should read the active raw payload, not textarea display text");
  assert.equal(appJs.includes("fitInputEditorHeight"), true, "short source text should not leave a full-height empty editor area");
  assert.equal(appJs.includes("createReadableInputDisplay"), true, "binary uploads should render extracted readable text instead of base64 data URLs");
  assert.equal(appJs.includes("inputContent.readOnly = binary"), true, "binary upload previews should be read-only to avoid editing extracted display text as raw binary");
  assert.equal(appJs.includes("registerQueuedFileState"), true, "main app should delegate queued file state to a reusable module");
  assert.equal(fileQueueJs.includes("createQueueItem"), true, "file queue module should track queued files as reusable workbench state");
  assert.equal(appJs.includes("renderDocumentModelPanel"), true, "main app should render DocumentModel inspection");
  assert.equal(appJs.includes("renderBottomReports"), true, "main app should render warnings, quality, diff, and versions");
  assert.equal(appJs.includes("chooseOutputDirectory"), true, "main app should expose explicit output directory selection");
  assert.equal(appJs.includes("buildExportFileName"), true, "main app should apply export naming strategy");
  assert.equal(appJs.includes("retryFailedQueueItems"), true, "main app should retry failed queued tasks");
  assert.equal(appJs.includes("showWorkbenchTab"), true, "main app should support narrow-screen workbench tabs");
  assert.equal(appJs.includes("setActiveWorkbenchTab"), true, "main app should keep a single active workbench view on desktop and mobile");
  assert.equal(appJs.includes("TRUSTED_PLUGIN_CATALOG"), false, "main app should not load a plugin catalog after core integration");
  assert.equal(appJs.includes("createPluginWorkbenchUi"), false, "main app should not load plugin UI lifecycle after core integration");
  assert.equal(pdfFormatJs.includes("pdfjs-dist/legacy/build/pdf.mjs"), true, "PDF input should use a local PDF.js engine under Node/test runtime");
  assert.equal(pdfFormatJs.includes("/vendor/pdfjs/pdf.min.mjs"), true, "PDF input should use the vendored PDF.js engine in browsers");
  assert.equal(pdfFormatJs.includes("PDFJS_TEXT_START"), true, "PDF.js extraction should feed structured text into the existing conversion pipeline");
  assert.equal(pdfJsVendor.includes("getDocument"), true, "vendored PDF.js runtime should be served locally");
  assert.equal(stylesCss.includes(".source-pane.is-binary-input"), true, "binary input mode should have an explicit layout rule");
  assert.equal(stylesCss.includes("grid-template-rows: auto minmax(0, 1fr) auto;"), false, "app shell should not force the workspace row to occupy the whole viewport");
  assert.equal(/(^|\n)\s{2}height:\s*100vh;/.test(stylesCss), false, "app shell should not lock the workbench to a viewport-height canvas");
  assert.equal(stylesCss.includes("align-content: start;"), true, "workspace grid content should stay pinned to the top instead of stretching empty rows");
  assert.equal(stylesCss.includes("min-height: 620px;"), false, "result pane should not reserve a large empty preview area on short documents");
  assert.equal(stylesCss.includes("grid-template-rows: auto auto auto;"), true, "short document panels should use content-sized rows instead of a forced 1fr canvas");
  assert.equal(stylesCss.includes(".source-pane {\n  align-self: start;"), true, "source pane should size to its editor content instead of stretching to the full workspace height");
  assert.equal(stylesCss.includes("grid-template-rows: auto auto auto minmax(0, 1fr);"), false, "source pane must not stretch the input editor as a 1fr row");
  assert.equal(stylesCss.includes(".pdf-frame {\n  display: none;\n  width: 100%;\n  height: 100%;"), true, "PDF result preview should fill the result panel instead of using the iframe default size");
  assert.equal(appJs.includes("docx"), true, "main app should accept DOCX input");
  for (const format of ["doc", "xlsx", "epub", "pdf", "pptx"]) {
    assert.equal(appJs.includes(format), true, `main app should accept ${format.toUpperCase()} input`);
  }

  const workerJs = await fetchText(baseUrl, "/workers/convert-worker.js");
  assert.equal(workerJs.includes("postMessage"), true, "conversion worker should be served");
  assert.equal(workerJs.includes("normalizeWorkerPayload"), true, "conversion worker should decode transferable ArrayBuffer payloads");
  assert.equal(workerJs.includes("contentBuffer"), true, "conversion worker should accept transferred content buffers");
  assert.equal(workerJs.includes("trustEncoding: true"), true, "conversion worker should trust explicitly encoded transferable text");
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
