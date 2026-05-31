// SSIM 视觉对比核心：纯函数，零依赖，操作灰度像素缓冲。P9-C 三层检验的第二层
// （视觉回环）用它对比输入页与输出页的结构相似度。Node / 浏览器均可运行。

export const SSIM_C1 = (0.01 * 255) ** 2; // 6.5025
export const SSIM_C2 = (0.03 * 255) ** 2; // 58.5225
export const DEFAULT_WINDOW_SIZE = 8;
export const DEFAULT_TARGET_WIDTH = 256;

function toClampedArray(value) {
  if (value instanceof Uint8ClampedArray) return value;
  if (value instanceof Uint8Array || Array.isArray(value)) return Uint8ClampedArray.from(value);
  throw new TypeError("ssim: pixel buffer must be Uint8ClampedArray / Uint8Array / number[].");
}

// RGBA Uint8 buffer (length w*h*4) → 灰度 Uint8ClampedArray (length w*h)。
export function rgbaToGrayscale(rgba) {
  const buffer = toClampedArray(rgba);
  const pixelCount = Math.floor(buffer.length / 4);
  const gray = new Uint8ClampedArray(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const o = i * 4;
    gray[i] = Math.round(0.299 * buffer[o] + 0.587 * buffer[o + 1] + 0.114 * buffer[o + 2]);
  }
  return gray;
}

// box 平均重采样：把 srcW×srcH 灰度图缩放到 dstW×dstH。
export function resampleGrayscale(gray, srcW, srcH, dstW, dstH) {
  const source = toClampedArray(gray);
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    throw new RangeError("ssim: resample dimensions must be positive.");
  }
  if (srcW === dstW && srcH === dstH) return source;
  const out = new Uint8ClampedArray(dstW * dstH);
  for (let dy = 0; dy < dstH; dy += 1) {
    const sy0 = Math.floor((dy * srcH) / dstH);
    const sy1 = Math.max(sy0 + 1, Math.floor(((dy + 1) * srcH) / dstH));
    for (let dx = 0; dx < dstW; dx += 1) {
      const sx0 = Math.floor((dx * srcW) / dstW);
      const sx1 = Math.max(sx0 + 1, Math.floor(((dx + 1) * srcW) / dstW));
      let sum = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1 && sy < srcH; sy += 1) {
        for (let sx = sx0; sx < sx1 && sx < srcW; sx += 1) {
          sum += source[sy * srcW + sx];
          count += 1;
        }
      }
      out[dy * dstW + dx] = count > 0 ? Math.round(sum / count) : 0;
    }
  }
  return out;
}

// 非重叠窗口均值 SSIM。grayA / grayB 必须同尺寸 width×height。
export function computeSSIM(grayA, grayB, width, height, options = {}) {
  const a = toClampedArray(grayA);
  const b = toClampedArray(grayB);
  if (a.length !== width * height || b.length !== width * height) {
    throw new RangeError("ssim: grayscale buffers must match width*height.");
  }
  const windowSize = Math.max(2, Math.floor(options.windowSize || DEFAULT_WINDOW_SIZE));
  const c1 = typeof options.c1 === "number" ? options.c1 : SSIM_C1;
  const c2 = typeof options.c2 === "number" ? options.c2 : SSIM_C2;

  let ssimSum = 0;
  let windowCount = 0;

  for (let wy = 0; wy + windowSize <= height; wy += windowSize) {
    for (let wx = 0; wx + windowSize <= width; wx += windowSize) {
      let sumA = 0;
      let sumB = 0;
      let sumAA = 0;
      let sumBB = 0;
      let sumAB = 0;
      const n = windowSize * windowSize;
      for (let y = 0; y < windowSize; y += 1) {
        const row = (wy + y) * width + wx;
        for (let x = 0; x < windowSize; x += 1) {
          const va = a[row + x];
          const vb = b[row + x];
          sumA += va;
          sumB += vb;
          sumAA += va * va;
          sumBB += vb * vb;
          sumAB += va * vb;
        }
      }
      const meanA = sumA / n;
      const meanB = sumB / n;
      const varA = sumAA / n - meanA * meanA;
      const varB = sumBB / n - meanB * meanB;
      const covAB = sumAB / n - meanA * meanB;
      const numerator = (2 * meanA * meanB + c1) * (2 * covAB + c2);
      const denominator = (meanA * meanA + meanB * meanB + c1) * (varA + varB + c2);
      ssimSum += denominator === 0 ? 1 : numerator / denominator;
      windowCount += 1;
    }
  }

  const score = windowCount > 0 ? ssimSum / windowCount : 1;
  return { score, windowCount, windowSize, width, height };
}

// 端到端：两张 { pixels: RGBA, width, height } → 归一到公共网格后算 SSIM。
export function compareImages(imageA, imageB, options = {}) {
  if (!imageA || !imageB || !imageA.pixels || !imageB.pixels) {
    throw new TypeError("ssim: compareImages requires { pixels, width, height } for both images.");
  }
  const targetWidth = Math.max(8, Math.floor(options.targetWidth || DEFAULT_TARGET_WIDTH));
  const aspect = imageA.height > 0 && imageA.width > 0 ? imageA.height / imageA.width : 1;
  const dstW = Math.min(targetWidth, Math.max(imageA.width, imageB.width));
  const dstH = Math.max(8, Math.round(dstW * aspect));

  const grayA = resampleGrayscale(rgbaToGrayscale(imageA.pixels), imageA.width, imageA.height, dstW, dstH);
  const grayB = resampleGrayscale(rgbaToGrayscale(imageB.pixels), imageB.width, imageB.height, dstW, dstH);

  const result = computeSSIM(grayA, grayB, dstW, dstH, options);
  return {
    score: result.score,
    width: dstW,
    height: dstH,
    windowCount: result.windowCount,
    windowSize: result.windowSize,
    dimensionsMatched: imageA.width === imageB.width && imageA.height === imageB.height,
  };
}
