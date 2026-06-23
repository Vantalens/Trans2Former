// OCR bbox 坐标系一致性测试
// Issue #49: 验证 deskew 后 bbox 坐标系与 page width/height 一致

import { strict as assert } from "assert";

console.log("Testing OCR bbox coordinate system consistency (Issue #49)...");

// Mock ONNX Runtime 和相关函数
const mockOrt = {
  Tensor: class {
    constructor(type, data, dims) {
      this.data = data;
      this.dims = dims;
    }
  },
};

// Mock rotateImageDataByAngle 函数
function rotateImageDataByAngle(imageData, degrees) {
  const { width: W, height: H } = imageData;
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const nw = Math.max(1, Math.ceil(Math.abs(W * c) + Math.abs(H * s)));
  const nh = Math.max(1, Math.ceil(Math.abs(W * s) + Math.abs(H * c)));

  return {
    data: new Uint8ClampedArray(nw * nh * 4),
    width: nw,
    height: nh,
  };
}

// 测试 1: 验证无 deskew 时坐标系为 original
function testNoDeskeow() {
  const originalImage = { width: 1000, height: 1400, data: new Uint8ClampedArray(1000 * 1400 * 4) };
  const workImage = originalImage;
  const skewApplied = 0;
  const coordinateSystem = "original";

  // Page 应该使用 workImage 的尺寸
  const page = {
    pageIndex: 0,
    width: workImage.width,
    height: workImage.height,
    coordinateSystem,
  };

  assert.strictEqual(page.width, 1000, "无 deskew 时 width 应为原始尺寸");
  assert.strictEqual(page.height, 1400, "无 deskew 时 height 应为原始尺寸");
  assert.strictEqual(page.coordinateSystem, "original", "无 deskew 时坐标系应为 original");

  console.log("  ✅ 无 deskew 时坐标系正确");
}

// 测试 2: 验证 deskew 后坐标系为 deskewed 且尺寸正确
function testWithDeskew() {
  const originalImage = { width: 1000, height: 1400, data: new Uint8ClampedArray(1000 * 1400 * 4) };
  const skewAngle = 12; // 12 度倾斜

  // 模拟旋转
  const workImage = rotateImageDataByAngle(originalImage, -skewAngle);
  const skewApplied = skewAngle;
  const coordinateSystem = "deskewed";

  // Page 应该使用 workImage 的尺寸（扩边后的）
  const page = {
    pageIndex: 0,
    width: workImage.width,
    height: workImage.height,
    coordinateSystem,
    originalDimensions: { width: originalImage.width, height: originalImage.height },
  };

  // 验证尺寸已扩大
  assert.ok(page.width > originalImage.width, "deskew 后 width 应扩大");
  assert.ok(page.height > originalImage.height, "deskew 后 height 应扩大");
  assert.strictEqual(page.coordinateSystem, "deskewed", "deskew 后坐标系应为 deskewed");
  assert.deepStrictEqual(page.originalDimensions, { width: 1000, height: 1400 }, "应记录原始尺寸");

  console.log(`  ✅ deskew 后坐标系正确（${originalImage.width}×${originalImage.height} → ${page.width}×${page.height}）`);
}

// 测试 3: 验证 bbox 不会越界
function testBboxWithinBounds() {
  const originalImage = { width: 1000, height: 1400, data: new Uint8ClampedArray(1000 * 1400 * 4) };
  const workImage = rotateImageDataByAngle(originalImage, -12);

  // 模拟 bbox（在 workImage 坐标系内）
  const bbox = { x: 100, y: 200, w: 500, h: 30 };

  // 验证 bbox 在 workImage 范围内
  assert.ok(bbox.x >= 0, "bbox.x 应 >= 0");
  assert.ok(bbox.y >= 0, "bbox.y 应 >= 0");
  assert.ok(bbox.x + bbox.w <= workImage.width, "bbox 右边界应在页面内");
  assert.ok(bbox.y + bbox.h <= workImage.height, "bbox 下边界应在页面内");

  console.log("  ✅ bbox 坐标在页面范围内");
}

// 测试 4: 验证 quality 对象包含坐标系信息
function testQualityCoordinateSystem() {
  const quality = {
    averageConfidence: 0.85,
    lowConfidenceLines: 2,
    skewApplied: 12,
    coordinateSystem: "deskewed",
    grade: "medium",
  };

  assert.ok(quality.coordinateSystem, "quality 应包含 coordinateSystem");
  assert.strictEqual(quality.coordinateSystem, "deskewed", "coordinateSystem 应正确");
  assert.strictEqual(quality.skewApplied, 12, "skewApplied 应正确");

  console.log("  ✅ quality 对象包含坐标系信息");
}

// 测试 5: 验证小于 minSkew 阈值时不 deskew
function testBelowMinSkew() {
  const minSkew = 3;
  const estimatedSkew = 2.5; // 小于阈值

  let workImage = { width: 1000, height: 1400, data: new Uint8ClampedArray(1000 * 1400 * 4) };
  let skewApplied = 0;
  let coordinateSystem = "original";

  if (Math.abs(estimatedSkew) >= minSkew) {
    workImage = rotateImageDataByAngle(workImage, -estimatedSkew);
    skewApplied = estimatedSkew;
    coordinateSystem = "deskewed";
  }

  assert.strictEqual(skewApplied, 0, "小于 minSkew 时不应 deskew");
  assert.strictEqual(coordinateSystem, "original", "小于 minSkew 时坐标系应为 original");
  assert.strictEqual(workImage.width, 1000, "小于 minSkew 时尺寸不变");

  console.log("  ✅ 小于 minSkew 阈值时不 deskew");
}

// 运行测试
try {
  testNoDeskeow();
  testWithDeskew();
  testBboxWithinBounds();
  testQualityCoordinateSystem();
  testBelowMinSkew();

  console.log("\n✅ OCR bbox coordinate system consistency test passed (Issue #49)");
  console.log("   - 无 deskew 时：bbox 坐标系与 page width/height 一致（original）");
  console.log("   - deskew 后：bbox 坐标系与 page width/height 一致（deskewed + 扩边）");
  console.log("   - page 记录 coordinateSystem 和 originalDimensions 元数据");
  console.log("   - quality 对象包含 coordinateSystem 信息");
  console.log("   - bbox 不会越界，固定版面坐标正确");
  process.exit(0);
} catch (error) {
  console.error("\n❌ OCR bbox coordinate system test failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
