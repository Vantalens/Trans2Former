# Phase 3: 测试覆盖率提升计划

**目标**: 从 80.94% → 85%+ 语句覆盖率，71.93% → 75%+ 分支覆盖率

**预计用时**: 4-5天

---

## 1. 当前状态分析

### 1.1 整体覆盖率
- **语句覆盖率**: 80.94% (12857/15883) - 缺口 3026 行
- **分支覆盖率**: 71.93% (3227/4486) - 缺口 1259 个分支
- **函数覆盖率**: 85.45% (658/770) - 缺口 112 个函数
- **已有测试**: 42 个测试文件

### 1.2 低覆盖率模块清单（按优先级）

**P0 - 关键低覆盖模块（严重影响可靠性）**:
1. **pdf-rasterizer-browser.js**: 6.61% (9/136) - OCR 关键路径
2. **indexeddb-storage.js**: 16.57% (30/181) - 缓存存储
3. **router.js**: 19.9% (40/201) - 路由系统
4. **landing-view.js**: 28.67% (76/265) - 入口页面

**P1 - 核心模块未达标（需提升）**:
5. **workbench-state.js**: 40.42% (19/47) - 工作台状态
6. **tesseract-runtime.js**: 49.01% (149/304) - Tesseract 运行时
7. **repair-handlers.js**: 54.33% (69/127) - 修复处理器
8. **convert-worker.js**: 54.54% (36/66) - 转换 Worker
9. **file-queue-ui.js**: 56.17% (50/89) - 队列 UI
10. **paddle-ocr-runtime.js**: 60% (57/95) - PaddleOCR 运行时
11. **paddle-ocr-engine.js**: 59.77% (107/179) - PaddleOCR 引擎
12. **pdf.js**: 64.18% (647/1008) - PDF 读取器（最大文件）
13. **ocr-engine.js**: 65.95% (93/141) - OCR 引擎
14. **output-directory.js**: 66.66% (24/36) - 输出目录
15. **text-utils.js**: 66.1% (39/59) - 文本工具

**P2 - 接近达标但仍需改进**:
16. **pdf-output.js**: 69.26% (516/745) - PDF 输出（第二大文件）
17. **scan-pdf-stage.js**: 75.43% (175/232) - 扫描 PDF 阶段
18. **ocr-stage.js**: 70.83% (34/48) - OCR 阶段
19. **binary-text-extraction.js**: 75.4% (138/183) - 二进制文本提取
20. **zip-container.js**: 76.09% (331/435) - ZIP 容器

### 1.3 分支覆盖率缺口大的模块

- **paddle-ocr-runtime.js**: 23.52% 分支覆盖率
- **convert-worker.js**: 28.57% 分支覆盖率
- **input-state.js**: 33.33% 分支覆盖率
- **output-directory.js**: 37.5% 分支覆盖率
- **scan-pdf-stage.js**: 37.25% 分支覆盖率
- **ocr-to-fixed-layout.js**: 43.75% 分支覆盖率
- **chunking.js**: 43.47% 分支覆盖率

---

## 2. 优先级策略

### 策略原则
1. **核心路径优先**: OCR、转换管道、格式读写
2. **风险高的模块优先**: 错误处理、边界条件
3. **覆盖率提升性价比**: 优先测试未覆盖行数多的模块
4. **P0/P1 先解决**: 先把低于 60% 的模块提升到 70%+

### 实施顺序
```
阶段 1 (1.5天): P0 模块 → 70%+
  - pdf-rasterizer-browser.js (6.61% → 70%)
  - indexeddb-storage.js (16.57% → 70%)
  - router.js (19.9% → 70%)
  - landing-view.js (28.67% → 70%)

阶段 2 (1.5天): P1 核心模块 → 75%+
  - tesseract-runtime.js (49% → 75%)
  - paddle-ocr-runtime.js (60% → 75%)
  - paddle-ocr-engine.js (59.77% → 75%)
  - repair-handlers.js (54.33% → 75%)
  - convert-worker.js (54.54% → 75%)

阶段 3 (1天): P1 小模块 → 80%+
  - workbench-state.js (40.42% → 80%)
  - file-queue-ui.js (56.17% → 80%)
  - output-directory.js (66.66% → 80%)
  - text-utils.js (66.1% → 80%)
  - ocr-engine.js (65.95% → 80%)

阶段 4 (1天): P2 大文件增量提升
  - pdf.js (64.18% → 70%) - 选择性测试关键路径
  - pdf-output.js (69.26% → 75%) - 选择性测试关键路径
  - scan-pdf-stage.js (75.43% → 80%)
```

---

## 3. 测试编写方法

### 3.1 现有测试基础设施

**测试工具链**:
- 纯 Node.js 断言（assert.strict）
- 无测试框架（直接运行脚本）
- c8 覆盖率工具
- 手工 mock 和 fixture

**测试模式**:
```javascript
// 单元测试模式
import { strict as assert } from "assert";
import { functionToTest } from "../public/module.js";

console.log("Testing feature...");

function testCase1() {
  const result = functionToTest(input);
  assert.strictEqual(result, expected, "message");
  console.log("  ✅ Test case 1");
}

try {
  testCase1();
  testCase2();
  console.log("\n✅ All tests passed");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Test failed:", error.message);
  process.exit(1);
}
```

**Mock 模式**:
```javascript
// Mock 浏览器 API
globalThis.crypto = { getRandomValues: (arr) => arr.fill(0) };
globalThis.document = { createElement: () => ({}) };

// Mock Worker
const mockWorker = {
  postMessage: (msg) => { /* 处理消息 */ },
  addEventListener: (event, handler) => { /* 注册处理器 */ },
};
```

### 3.2 针对低覆盖率模块的策略

**UI 模块（router.js, landing-view.js, workbench-state.js）**:
- Mock DOM API
- 测试状态转换
- 测试事件处理

**Runtime 模块（tesseract-runtime.js, paddle-ocr-runtime.js）**:
- Mock ONNX Runtime / Tesseract.js
- 测试模型加载路径
- 测试错误降级

**Storage 模块（indexeddb-storage.js）**:
- Mock IndexedDB API
- 测试 CRUD 操作
- 测试配额处理

**Worker 模块（convert-worker.js）**:
- Mock Worker API
- 测试消息传递
- 测试错误传播

**大文件（pdf.js, pdf-output.js）**:
- 选择性测试：只测试未覆盖的关键路径
- 集成测试：端到端场景
- 边界条件：空文档、大文档、损坏文档

---

## 4. 预期成果

### 4.1 覆盖率目标

- **语句覆盖率**: 80.94% → **85.5%+** (+4.56%, 约 720 行)
- **分支覆盖率**: 71.93% → **76%+** (+4.07%, 约 180 个分支)
- **函数覆盖率**: 85.45% → **88%+** (+2.55%, 约 20 个函数)

### 4.2 测试文件增加

- **新增测试**: 约 15-20 个测试文件
- **测试总数**: 从 42 个 → 60+ 个

### 4.3 质量提升

- ✅ 所有 P0 模块覆盖率 ≥ 70%
- ✅ 所有 P1 模块覆盖率 ≥ 75%
- ✅ 核心路径（OCR、转换、格式）覆盖率 ≥ 80%
- ✅ 错误处理路径覆盖率显著提升
- ✅ 分支覆盖率缺口从 8.05% 降至 4%

---

## 5. 风险与挑战

### 5.1 技术挑战

1. **浏览器 API Mock 复杂度高**:
   - IndexedDB, Worker, Canvas 等需要完整 mock
   - 解决方案：使用 jsdom 或简化 mock

2. **大文件测试成本高**:
   - pdf.js (1008 行), pdf-output.js (745 行)
   - 解决方案：选择性测试，只覆盖关键路径

3. **异步测试复杂**:
   - OCR、Worker、Storage 都是异步
   - 解决方案：使用 async/await 模式

### 5.2 时间风险

- **预算**: 4-5 天
- **实际可能**: 5-6 天（如果遇到复杂 mock）
- **缓解**: 优先 P0/P1，P2 可选

---

## 6. 执行检查点

### Day 1 检查点
- ✅ 完成 pdf-rasterizer-browser.js 测试
- ✅ 完成 indexeddb-storage.js 测试
- ✅ 语句覆盖率 → 82%+

### Day 2 检查点
- ✅ 完成 router.js, landing-view.js 测试
- ✅ 完成 tesseract-runtime.js 测试
- ✅ 语句覆盖率 → 83%+

### Day 3 检查点
- ✅ 完成 paddle-ocr-runtime/engine 测试
- ✅ 完成 repair-handlers, convert-worker 测试
- ✅ 语句覆盖率 → 84%+

### Day 4 检查点
- ✅ 完成所有 P1 小模块测试
- ✅ 语句覆盖率 → 85%+
- ✅ 分支覆盖率 → 75%+

### Day 5 （缓冲）
- ✅ P2 大文件增量提升
- ✅ 补充边界条件测试
- ✅ 最终验收：85.5%+ 语句，76%+ 分支

---

## 7. 成功标准

- ✅ 语句覆盖率 ≥ 85%
- ✅ 分支覆盖率 ≥ 75%
- ✅ 所有 P0 模块 ≥ 70%
- ✅ 所有 P1 模块 ≥ 75%
- ✅ 所有测试通过
- ✅ npm run coverage 显示达标

---

**创建时间**: 2026-06-23  
**预计完成**: 2026-06-28  
**负责人**: Claude Code + Jack Yao
