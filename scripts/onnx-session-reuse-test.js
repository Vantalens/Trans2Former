// ONNX Session 复用测试
// Issue #9: 验证 ONNX InferenceSession 缓存机制，避免多页 OCR 时重复创建/销毁 session

import { strict as assert } from "assert";
import { createOcrSession, disposeOcrSession, clearSessionCache, resetOnnxRuntimeCache } from "../public/core/ocr/paddle-ocr-runtime.js";

console.log("Testing ONNX session reuse (Issue #9)...");

// Mock ONNX Runtime namespace
const mockOrt = {
  InferenceSession: {
    create: async (data, options) => {
      // 返回一个 mock session 对象
      return {
        __mockSession: true,
        __modelSize: data.length,
        __providers: options?.executionProviders || [],
        release: async () => {
          // Mock release
        },
      };
    },
  },
};

// 测试 1: 验证 session 缓存机制
async function testSessionCaching() {
  resetOnnxRuntimeCache();
  const modelBuffer = new Uint8Array([1, 2, 3, 4, 5]); // Mock model
  const providers = ["wasm"];

  // 第一次创建，应该真正创建新 session
  const session1 = await createOcrSession({
    ort: mockOrt,
    modelBuffer,
    providers,
    cacheKey: "test-model-1",
  });

  assert.ok(session1, "第一次创建应该成功");
  assert.ok(session1.__mockSession, "应该返回 mock session");

  // 第二次创建相同 cacheKey，应该返回缓存的 session
  const session2 = await createOcrSession({
    ort: mockOrt,
    modelBuffer,
    providers,
    cacheKey: "test-model-1",
  });

  assert.strictEqual(session1, session2, "相同 cacheKey 应该返回相同的 session 实例");
  console.log("  ✅ Session 缓存机制工作正常");
}

// 测试 2: 验证不同 cacheKey 创建不同 session
async function testDifferentCacheKeys() {
  resetOnnxRuntimeCache();
  const modelBuffer1 = new Uint8Array([1, 2, 3]);
  const modelBuffer2 = new Uint8Array([4, 5, 6]);
  const providers = ["wasm"];

  const session1 = await createOcrSession({
    ort: mockOrt,
    modelBuffer: modelBuffer1,
    providers,
    cacheKey: "model-a",
  });

  const session2 = await createOcrSession({
    ort: mockOrt,
    modelBuffer: modelBuffer2,
    providers,
    cacheKey: "model-b",
  });

  assert.notStrictEqual(session1, session2, "不同 cacheKey 应该返回不同的 session");
  console.log("  ✅ 不同 cacheKey 创建不同 session");
}

// 测试 3: 验证无 cacheKey 时不缓存
async function testNoCaching() {
  resetOnnxRuntimeCache();
  const modelBuffer = new Uint8Array([1, 2, 3]);
  const providers = ["wasm"];

  const session1 = await createOcrSession({
    ort: mockOrt,
    modelBuffer,
    providers,
    // 不提供 cacheKey
  });

  const session2 = await createOcrSession({
    ort: mockOrt,
    modelBuffer,
    providers,
    // 不提供 cacheKey
  });

  assert.notStrictEqual(session1, session2, "无 cacheKey 时应该创建新 session");
  console.log("  ✅ 无 cacheKey 时不缓存");
}

// 测试 4: 验证 disposeOcrSession 不释放缓存的 session
async function testDisposeDoesNotReleaseCached() {
  resetOnnxRuntimeCache();
  const modelBuffer = new Uint8Array([1, 2, 3]);
  const providers = ["wasm"];
  const cacheKey = "test-cached";

  const session1 = await createOcrSession({
    ort: mockOrt,
    modelBuffer,
    providers,
    cacheKey,
  });

  // 调用 dispose 但传入 cacheKey（不应该释放）
  await disposeOcrSession(session1, cacheKey);

  // 再次获取，应该还是同一个 session
  const session2 = await createOcrSession({
    ort: mockOrt,
    modelBuffer,
    providers,
    cacheKey,
  });

  assert.strictEqual(session1, session2, "dispose 缓存的 session 后仍可复用");
  console.log("  ✅ disposeOcrSession 保留缓存的 session");
}

// 测试 5: 验证 clearSessionCache 清理所有缓存
async function testClearCache() {
  resetOnnxRuntimeCache();
  const modelBuffer = new Uint8Array([1, 2, 3]);
  const providers = ["wasm"];
  const cacheKey = "test-clear";

  const session1 = await createOcrSession({
    ort: mockOrt,
    modelBuffer,
    providers,
    cacheKey,
  });

  // 清理缓存
  await clearSessionCache();

  // 再次创建，应该是新 session
  const session2 = await createOcrSession({
    ort: mockOrt,
    modelBuffer,
    providers,
    cacheKey,
  });

  assert.notStrictEqual(session1, session2, "clearSessionCache 后应该创建新 session");
  console.log("  ✅ clearSessionCache 正确清理缓存");
}

// 测试 6: 模拟多页 OCR 场景
async function testMultiPageScenario() {
  resetOnnxRuntimeCache();
  const detModel = new Uint8Array([1, 2, 3]);
  const clsModel = new Uint8Array([4, 5, 6]);
  const recModel = new Uint8Array([7, 8, 9]);
  const providers = ["wasm"];
  const providersKey = providers.join(",");

  let createCount = 0;
  const trackingOrt = {
    InferenceSession: {
      create: async (data, options) => {
        createCount++;
        return {
          __mockSession: true,
          __id: createCount,
          release: async () => {},
        };
      },
    },
  };

  // 模拟处理 5 页
  for (let page = 0; page < 5; page++) {
    const detSession = await createOcrSession({
      ort: trackingOrt,
      modelBuffer: detModel,
      providers,
      cacheKey: `paddleocr-det-${providersKey}`,
    });
    const clsSession = await createOcrSession({
      ort: trackingOrt,
      modelBuffer: clsModel,
      providers,
      cacheKey: `paddleocr-cls-${providersKey}`,
    });
    const recSession = await createOcrSession({
      ort: trackingOrt,
      modelBuffer: recModel,
      providers,
      cacheKey: `paddleocr-rec-${providersKey}`,
    });

    // 模拟推理...

    await disposeOcrSession(detSession, `paddleocr-det-${providersKey}`);
    await disposeOcrSession(clsSession, `paddleocr-cls-${providersKey}`);
    await disposeOcrSession(recSession, `paddleocr-rec-${providersKey}`);
  }

  // 应该只创建 3 个 session（det/cls/rec 各一个），而不是 15 个
  assert.strictEqual(createCount, 3, `5页应该只创建3个 session，实际创建了 ${createCount} 个`);
  console.log("  ✅ 多页 OCR 场景：5页只创建3个 session（从15次降低到3次）");
}

// 运行测试
try {
  await testSessionCaching();
  await testDifferentCacheKeys();
  await testNoCaching();
  await testDisposeDoesNotReleaseCached();
  await testClearCache();
  await testMultiPageScenario();

  console.log("\n✅ ONNX session reuse test passed (Issue #9)");
  console.log("   - Session 缓存机制工作正常");
  console.log("   - 不同模型使用不同缓存");
  console.log("   - 缓存的 session 不会被意外释放");
  console.log("   - 多页 OCR 从 15 次 session 创建降低到 3 次");
  console.log("   - 预期性能提升：5页 OCR 减少 80% 的 session 创建开销");
  process.exit(0);
} catch (error) {
  console.error("\n❌ ONNX session reuse test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
