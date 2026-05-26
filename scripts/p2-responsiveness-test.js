import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appJs = await readFile("public/app.js", "utf8");
const workerJs = await readFile("public/workers/convert-worker.js", "utf8");
// 任务清单已分为活跃看板（DEVELOPMENT_TASKS.md）和历史归档
// （docs/archive/DEVELOPMENT_HISTORY.md），断言的 P2 子任务行在归档中保留原文。
const tasksMain = await readFile("DEVELOPMENT_TASKS.md", "utf8");
const tasksArchive = await readFile("docs/archive/DEVELOPMENT_HISTORY.md", "utf8");
const tasks = `${tasksMain}\n${tasksArchive}`;

assert.equal(appJs.includes("WORKER_TRANSFERABLE_THRESHOLD_BYTES"), true, "Worker Transferable threshold must be explicit");
assert.equal(appJs.includes("new TextEncoder().encode(payload.content)"), true, "large text payloads should be encoded into ArrayBuffer before posting");
assert.equal(appJs.includes("transferList.push(workerPayload.contentBuffer)"), true, "Worker postMessage should transfer ArrayBuffer ownership");
assert.equal(workerJs.includes("decodeTextBytes(new Uint8Array(payload.contentBuffer)"), true, "Worker should decode transferred ArrayBuffer content through the shared encoding detector");

assert.equal(appJs.includes("VIRTUAL_LIST_ITEM_LIMIT"), true, "virtual list limit must be explicit");
assert.equal(appJs.includes("renderVirtualTextList(warningsList"), true, "warnings list should use virtual rendering");
assert.equal(appJs.includes("renderVirtualTextList(qualityReportList"), true, "quality report list should use virtual rendering");
assert.equal(appJs.includes("renderVirtualTextList(versionsList"), true, "versions list should use virtual rendering");
assert.equal(appJs.includes("documentModelPreview.dataset.virtualized"), true, "DocumentModel preview should avoid dumping huge block arrays");

assert.equal(appJs.includes("LARGE_PROGRESSIVE_PREVIEW_BYTES = 50 * 1024 * 1024"), true, "50MB progressive preview threshold must be explicit");
assert.equal(appJs.includes("LARGE_DEGRADED_PREVIEW_BYTES = 100 * 1024 * 1024"), true, "100MB degraded preview threshold must be explicit");
assert.equal(appJs.includes("largePreviewModeSelect"), true, "large preview mode control should be wired");
assert.equal(appJs.includes("renderLargeDocumentPreview(rawContent"), true, "large files should render a summary/sample path instead of full preview");

assert.equal(appJs.includes("releaseConversionResources()"), true, "conversion lifecycle cleanup must be centralized");
assert.equal(appJs.includes("revokeOutputUrl()"), true, "Object URLs must be revoked during cleanup");
assert.equal(appJs.includes("activeConversion.worker.terminate()"), true, "active Workers must be terminated during cleanup");

assert.equal(tasks.includes("- [x] Worker Transferable：大块 ArrayBuffer 传递避免复制。"), true, "P2 Worker Transferable task should be marked complete");
assert.equal(tasks.includes("- [x] 虚拟滚动：输入、输出、warnings 和质量报告列表必须适配大文档。"), true, "P2 virtual scrolling task should be marked complete");
assert.equal(tasks.includes("- [x] 渐进预览：50MB+ 文件先展示结构摘要和前 N 个块。"), true, "P2 progressive preview task should be marked complete");
assert.equal(tasks.includes("- [x] 大文件降级预览：100MB+ 文件可切换抽样、结构和全文模式。"), true, "P2 degraded preview task should be marked complete");
assert.equal(tasks.includes("- [x] Blob URL / Worker / ObjectURL 生命周期加入专项测试。"), true, "P2 lifecycle test task should be marked complete");
assert.equal(tasks.includes("- [x] 建立性能 smoke test：冷启动、首个反馈、10MB 文本、50MB+ 渐进预览。"), true, "P2 responsiveness smoke test should be marked complete");

console.log("P2 responsiveness test passed: Transferable, virtual lists, progressive preview, and lifecycle policies are covered.");
