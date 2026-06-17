import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { convertContent } from "../public/browser-transformer.js";

const appJs = await readFile("public/app.js", "utf8");
const workerJs = await readFile("public/workers/convert-worker.js", "utf8");

// 修复 issue #73: 添加真实的性能测试，而不仅仅是源码字符串检查

// 1. Transferable 机制检查
assert.equal(appJs.includes("WORKER_TRANSFERABLE_THRESHOLD_BYTES"), true, "Worker Transferable threshold must be explicit");
assert.equal(appJs.includes("new TextEncoder().encode(payload.content)"), true, "large text payloads should be encoded into ArrayBuffer before posting");
assert.equal(appJs.includes("transferList.push(workerPayload.contentBuffer)"), true, "Worker postMessage should transfer ArrayBuffer ownership");
assert.equal(workerJs.includes("decodeTextBytes(new Uint8Array(payload.contentBuffer)"), true, "Worker should decode transferred ArrayBuffer content");

// 2. 虚拟列表机制检查
assert.equal(appJs.includes("VIRTUAL_LIST_ITEM_LIMIT"), true, "virtual list limit must be explicit");
assert.equal(appJs.includes("renderVirtualTextList(warningsList"), true, "warnings list should use virtual rendering");
assert.equal(appJs.includes("renderVirtualTextList(qualityReportList"), true, "quality report list should use virtual rendering");
assert.equal(appJs.includes("renderVirtualTextList(versionsList"), true, "versions list should use virtual rendering");

// 3. 大文档降级机制检查
assert.equal(appJs.includes("LARGE_PROGRESSIVE_PREVIEW_BYTES = 50 * 1024 * 1024"), true, "50MB progressive preview threshold must be explicit");
assert.equal(appJs.includes("LARGE_DEGRADED_PREVIEW_BYTES = 100 * 1024 * 1024"), true, "100MB degraded preview threshold must be explicit");
assert.equal(appJs.includes("renderLargeDocumentPreview(rawContent"), true, "large files should render a summary/sample path");

// 4. 生命周期清理检查
assert.equal(appJs.includes("releaseConversionResources()"), true, "conversion lifecycle cleanup must be centralized");
assert.equal(appJs.includes("revokeOutputUrl()"), true, "Object URLs must be revoked during cleanup");
assert.equal(appJs.includes("activeConversion.worker.terminate()"), true, "active Workers must be terminated during cleanup");

// 5. 真实性能 smoke test: 10MB 文本转换
console.log("\n📋 运行真实性能测试: 10MB 文本转换");
const largeText = "# 性能测试\n\n" + "测试段落。".repeat(1000000); // ~10MB
const startTime = Date.now();
try {
  const result = convertContent({
    content: largeText,
    from: "md",
    to: "html",
    title: "performance-test",
  });
  const elapsed = Date.now() - startTime;
  assert.ok(result?.data, "10MB 文本转换应成功");
  assert.ok(elapsed < 5000, `10MB 文本转换应在 5 秒内完成（实际: ${elapsed}ms）`);
  console.log(`✅ 10MB 文本转换完成: ${elapsed}ms`);
} catch (error) {
  throw new Error(`10MB 文本转换失败: ${error.message}`);
}

console.log("\n✅ P2 responsiveness test passed: Transferable, virtual lists, progressive preview, lifecycle policies, and real performance verified.");
