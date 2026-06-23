// Issue #9 修复验证：OCR 扫描 PDF 多页转换时 ONNX session 复用测试
//
// 验证点：
// 1. paddle-ocr-engine.js 使用 cacheKey 复用 ONNX sessions
// 2. 多次调用 recognize 不会重复创建 session
// 3. session 缓存在 finally 块中不会被释放（保持复用）
//
// 由于真实 ONNX 推理需要 vendor 模型，本测试使用 mock 验证缓存逻辑。

import assert from "node:assert/strict";

console.log("Issue #9 修复验证：OCR session 复用测试");

// 测试 1: paddle-ocr-runtime session 缓存机制
console.log("\n测试 1: Session 缓存机制");

let createCount = 0;
let releaseCount = 0;

// Mock ONNX Runtime
const mockOrt = {
  InferenceSession: {
    async create(data, options) {
      createCount++;
      return {
        inputNames: ["input"],
        outputNames: ["output"],
        async release() {
          releaseCount++;
        },
      };
    },
  },
  Tensor: class {
    constructor(type, data, dims) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  },
};

// 导入 runtime 模块
const runtime = await import("../public/core/ocr/paddle-ocr-runtime.js");

// 重置缓存
runtime.resetOnnxRuntimeCache();
createCount = 0;
releaseCount = 0;

const modelBuffer = new Uint8Array([1, 2, 3, 4]);
const providers = ["wasm"];

// 第一次创建 session（无缓存）
const session1 = await runtime.createOcrSession({
  ort: mockOrt,
  modelBuffer,
  providers,
  cacheKey: "test-model-wasm",
});
assert.equal(createCount, 1, "第一次应该创建 session");

// 第二次创建 session（使用缓存）
const session2 = await runtime.createOcrSession({
  ort: mockOrt,
  modelBuffer,
  providers,
  cacheKey: "test-model-wasm",
});
assert.equal(createCount, 1, "第二次应该复用缓存的 session，不创建新的");
assert.strictEqual(session1, session2, "返回的应该是同一个 session 对象");

// 第三次创建不同的 session（不同 cacheKey）
const session3 = await runtime.createOcrSession({
  ort: mockOrt,
  modelBuffer,
  providers,
  cacheKey: "test-model-webgpu",
});
assert.equal(createCount, 2, "不同 cacheKey 应该创建新 session");
assert.notStrictEqual(session1, session3, "不同 cacheKey 的 session 应该是不同对象");

console.log("✅ Session 缓存机制正常");

// 测试 2: disposeOcrSession 保留缓存的 session
console.log("\n测试 2: disposeOcrSession 保留缓存");

releaseCount = 0;

// 尝试释放缓存中的 session（应该不释放）
await runtime.disposeOcrSession(session1, "test-model-wasm");
assert.equal(releaseCount, 0, "缓存中的 session 不应该被释放");

// 尝试释放不在缓存中的 session（应该释放）
const tempSession = await runtime.createOcrSession({
  ort: mockOrt,
  modelBuffer,
  providers,
  // 不提供 cacheKey，不会被缓存
});
await runtime.disposeOcrSession(tempSession, null);
assert.equal(releaseCount, 1, "非缓存 session 应该被释放");

console.log("✅ disposeOcrSession 正确保留缓存");

// 测试 3: clearSessionCache 清理所有缓存
console.log("\n测试 3: clearSessionCache 清理");

releaseCount = 0;
await runtime.clearSessionCache();
assert.ok(releaseCount >= 2, `应该释放所有缓存的 session，实际释放 ${releaseCount} 个`);

// 清理后再次创建应该重新创建
const prevCreateCount = createCount;
const session4 = await runtime.createOcrSession({
  ort: mockOrt,
  modelBuffer,
  providers,
  cacheKey: "test-model-wasm",
});
assert.equal(createCount, prevCreateCount + 1, "清理缓存后应该重新创建 session");

console.log("✅ clearSessionCache 正常工作");

// 测试 4: 验证 paddle-ocr-engine 使用 cacheKey
console.log("\n测试 4: paddle-ocr-engine 使用 cacheKey");

const engineModule = await import("../public/core/ocr/paddle-ocr-engine.js");

// 检查 paddle-ocr-engine.js 是否在 createOcrSession 调用中传递了 cacheKey
const engineSource = await import("node:fs").then((fs) =>
  fs.promises.readFile("public/core/ocr/paddle-ocr-engine.js", "utf8")
);

const cacheKeyPattern = /createOcrSession\s*\(\s*\{[^}]*cacheKey\s*:/g;
const matches = engineSource.match(cacheKeyPattern);
assert.ok(matches && matches.length >= 3, "paddle-ocr-engine 应该为 det/cls/rec 三个模型传递 cacheKey");

// 验证 cacheKey 包含 providers 信息（确保不同 provider 不会混用 session）
const cacheKeyWithProvidersPattern = /cacheKey\s*:\s*`paddleocr-(?:det|cls|rec)-\$\{providersKey\}`/g;
const providerMatches = engineSource.match(cacheKeyWithProvidersPattern);
assert.ok(providerMatches && providerMatches.length >= 3, "cacheKey 应该包含 providers 信息");

console.log(`✅ paddle-ocr-engine 正确使用 cacheKey（找到 ${matches.length} 处）`);

// 测试 5: 验证 finally 块不释放缓存
console.log("\n测试 5: 验证 finally 块保留缓存");

const finallyPattern = /finally\s*\{[^}]*disposeOcrSession/g;
const finallyMatches = engineSource.match(finallyPattern);
assert.ok(finallyMatches, "finally 块应该调用 disposeOcrSession");

// 验证 disposeOcrSession 传递了 cacheKey（这样才能保留缓存）
const disposeWithKeyPattern = /disposeOcrSession\s*\([^,]+,\s*`paddleocr-/g;
const disposeMatches = engineSource.match(disposeWithKeyPattern);
assert.ok(disposeMatches && disposeMatches.length >= 2, "disposeOcrSession 应该传递 cacheKey 以保留缓存");

console.log("✅ finally 块正确传递 cacheKey，不会释放缓存");

// 测试 6: 多次调用场景模拟
console.log("\n测试 6: 模拟多页 PDF 场景");

runtime.resetOnnxRuntimeCache();
createCount = 0;
releaseCount = 0;

// 模拟扫描 5 页 PDF，每页调用 recognize
for (let page = 0; page < 5; page++) {
  // 模拟 det session
  const detSession = await runtime.createOcrSession({
    ort: mockOrt,
    modelBuffer,
    providers,
    cacheKey: "paddleocr-det-wasm",
  });

  // 模拟 cls session
  const clsSession = await runtime.createOcrSession({
    ort: mockOrt,
    modelBuffer,
    providers,
    cacheKey: "paddleocr-cls-wasm",
  });

  // 模拟 rec session
  const recSession = await runtime.createOcrSession({
    ort: mockOrt,
    modelBuffer,
    providers,
    cacheKey: "paddleocr-rec-wasm",
  });

  // 模拟 finally 块的释放调用（传递 cacheKey）
  await runtime.disposeOcrSession(detSession, "paddleocr-det-wasm");
  await runtime.disposeOcrSession(clsSession, "paddleocr-cls-wasm");
  await runtime.disposeOcrSession(recSession, "paddleocr-rec-wasm");
}

assert.equal(createCount, 3, "5 页应该只创建 3 个 session（det/cls/rec 各一个）");
assert.equal(releaseCount, 0, "缓存的 session 不应该被释放");

console.log("✅ 多页场景正确复用 session");

// 清理
await runtime.clearSessionCache();

console.log("\n========================================");
console.log("✅ Issue #9 修复验证通过");
console.log("========================================");
console.log("\n修复总结:");
console.log("1. ✅ paddle-ocr-runtime 实现了 session 缓存机制");
console.log("2. ✅ paddle-ocr-engine 为 det/cls/rec 传递 cacheKey");
console.log("3. ✅ disposeOcrSession 保留缓存中的 session");
console.log("4. ✅ 多页 PDF 扫描时 session 正确复用");
console.log("\n性能提升:");
console.log("- 修复前: 5 页 = 15 次 session 创建");
console.log("- 修复后: 5 页 = 3 次 session 创建（首次）");
console.log("- 性能提升: ~5x（session 创建开销）");
