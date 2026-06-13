import assert from "node:assert/strict";

import {
  computeSSIM,
  compareImages,
  rgbaToGrayscale,
  resampleGrayscale,
  runSsimLayer,
  runVerificationStageAsync,
  defaultPageImageSource,
  setPageImageSource,
  resetPageImageSource,
  RASTERIZABLE_FORMATS,
  SSIM_VISUAL_DRIFT,
  VERIFICATION_IMAGE_SOURCE_UNAVAILABLE,
  convertContentAsync,
} from "../public/browser-transformer.js";

function solidImage(value, width = 32, height = 32) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = value;
    pixels[i * 4 + 1] = value;
    pixels[i * 4 + 2] = value;
    pixels[i * 4 + 3] = 255;
  }
  return { pixels, width, height };
}

function gradientImage(width = 32, height = 32, offset = 0) {
  // 平滑水平渐变（低频），重采样到不同网格仍稳定。
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = Math.min(255, Math.round((x / Math.max(1, width - 1)) * 255) + offset);
      const o = (y * width + x) * 4;
      pixels[o] = v;
      pixels[o + 1] = v;
      pixels[o + 2] = v;
      pixels[o + 3] = 255;
    }
  }
  return { pixels, width, height };
}

// 1. rgbaToGrayscale length + luminance
{
  const gray = rgbaToGrayscale(solidImage(120, 4, 4).pixels);
  assert.equal(gray.length, 16);
  assert.equal(gray[0], 120);
}

// 2. computeSSIM identical buffers -> 1
{
  const gray = rgbaToGrayscale(gradientImage(16, 16).pixels);
  const result = computeSSIM(gray, gray, 16, 16, { windowSize: 8 });
  assert.ok(result.score > 0.999, `identical SSIM should be ~1, got ${result.score}`);
}

// 3. compareImages identical -> ~1, black vs white -> near 0
{
  const black = solidImage(0);
  const white = solidImage(255);
  assert.ok(compareImages(black, black).score > 0.999);
  assert.ok(compareImages(black, white).score < 0.05, "black vs white should be near zero");
}

// 4. compareImages monotonic: closer image scores higher than further
{
  const base = gradientImage(32, 32, 0);
  const near = gradientImage(32, 32, 8);
  const far = solidImage(0, 32, 32);
  const nearScore = compareImages(base, near, { targetWidth: 32 }).score;
  const farScore = compareImages(base, far, { targetWidth: 32 }).score;
  assert.ok(nearScore > farScore, `near (${nearScore}) should beat far (${farScore})`);
  assert.ok(nearScore < 1, "a perturbed image should be below 1");
}

// 5. resampleGrayscale resizes to requested grid + same-size passthrough
{
  const gray = rgbaToGrayscale(gradientImage(16, 16).pixels);
  const down = resampleGrayscale(gray, 16, 16, 8, 8);
  assert.equal(down.length, 64);
  const same = resampleGrayscale(gray, 16, 16, 16, 16);
  assert.equal(same.length, 256);
}

// 6. compareImages handles mismatched dimensions by normalizing to a common grid
{
  const big = gradientImage(64, 64);
  const small = gradientImage(16, 16);
  const cmp = compareImages(big, small, { targetWidth: 32 });
  assert.equal(cmp.dimensionsMatched, false);
  assert.ok(cmp.score > 0.5, "same gradient at different sizes should still be fairly similar");
}

// 7. runSsimLayer with stub image source -> eligible, score, passed
{
  setPageImageSource({ getPageImage: async ({ format }) => (format === "pdf" ? solidImage(100) : solidImage(104)) });
  const layer = await runSsimLayer({ ctx: { from: "png", to: "pdf", content: "<png>", options: {} }, output: { data: "<pdf>" } });
  assert.equal(layer.eligible, true);
  assert.equal(typeof layer.ssim.score, "number");
  assert.equal(layer.ssim.sourceFormat, "png");
  assert.equal(layer.ssim.outputFormat, "pdf");
  resetPageImageSource();
}

// 8. runSsimLayer drift below threshold -> SSIM_VISUAL_DRIFT warning
{
  setPageImageSource({ getPageImage: async ({ format }) => (format === "pdf" ? solidImage(0) : solidImage(255)) });
  const layer = await runSsimLayer({ ctx: { from: "png", to: "pdf", content: "<png>", options: { verification: { ssimThreshold: 0.9 } } }, output: { data: "<pdf>" } });
  assert.equal(layer.eligible, true);
  assert.equal(layer.ssim.passed, false);
  assert.equal(layer.warnings.length, 1);
  assert.equal(layer.warnings[0].code, SSIM_VISUAL_DRIFT);
  resetPageImageSource();
}

// 9. runSsimLayer not eligible for non-rasterizable path
{
  const layer = await runSsimLayer({ ctx: { from: "md", to: "pdf", content: "# Hi", options: {} }, output: { data: "<pdf>" } });
  assert.equal(layer.eligible, false);
  assert.equal(layer.reason, "source-not-rasterizable");
  assert.equal(layer.ssim, null);
  assert.equal(RASTERIZABLE_FORMATS.has("md"), false);
  assert.equal(RASTERIZABLE_FORMATS.has("pdf"), true);
}

// 10. defaultPageImageSource throws image-source-unavailable in Node (no DOM)
{
  resetPageImageSource();
  await assert.rejects(
    () => defaultPageImageSource.getPageImage({ format: "pdf", content: "<pdf>" }),
    (err) => err.code === VERIFICATION_IMAGE_SOURCE_UNAVAILABLE,
    "Node default image source must report unavailable",
  );
  // and runSsimLayer surfaces that as eligible:false without throwing
  const layer = await runSsimLayer({ ctx: { from: "png", to: "pdf", content: "<png>", options: {} }, output: { data: "<pdf>" } });
  assert.equal(layer.eligible, false);
  assert.equal(layer.reason, "image-source-unavailable");
}

// 11. runVerificationStageAsync merges rule-diff base + ssim layer
{
  setPageImageSource({ getPageImage: async ({ format }) => (format === "pdf" ? solidImage(100) : solidImage(100)) });
  const env = await runVerificationStageAsync({
    model: { blocks: [] },
    output: { data: "<pdf>" },
    ctx: { from: "png", to: "pdf", content: "<png>", read: () => ({ blocks: [] }), options: {} },
  });
  assert.ok(env.layers.includes("ssim"));
  // png is not text-canonical so rule-diff is skipped
  assert.ok(env.skipped.some((s) => s.layer === "rule-diff"));
  assert.equal(env.eligible, true);
  assert.equal(env.reason, "completed");
  assert.notEqual(env.ssim, null);
  resetPageImageSource();
}

// 12. End-to-end convertContentAsync: sync ssim stays null on text path; pdf->pdf populates ssim via stub
{
  // text path (md->md): ssim must be null, rule-diff present
  resetPageImageSource();
  const textResult = await convertContentAsync({ content: "# Title\n\nBody", from: "md", to: "md", title: "e2e" });
  assert.equal(textResult.quality.qualityReport.ssim, null);
  assert.equal(textResult.quality.qualityReport.ruleDiff.identical, true);

  // visual path (png->pdf) with stub image source: ssim populated
  setPageImageSource({ getPageImage: async ({ format }) => (format === "pdf" ? solidImage(120) : solidImage(125)) });
  const visualResult = await convertContentAsync({
    content: "data:image/png;base64,AAAA",
    from: "png",
    to: "pdf",
    title: "e2e-visual",
    options: { ocr: { enabled: false } },
  });
  assert.notEqual(visualResult.quality.qualityReport.ssim, null);
  assert.equal(visualResult.quality.qualityReport.ssim.sourceFormat, "png");
  assert.ok(visualResult.quality.qualityReport.verification.layers.includes("ssim"));
  resetPageImageSource();
}

console.log("SSIM verification test passed: ssim core (grayscale/resample/computeSSIM/compareImages), ssim layer gating/drift/unavailable, async envelope merge, end-to-end null-on-text + populated-on-visual covered.");
