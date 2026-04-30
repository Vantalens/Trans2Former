import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const BUDGETS = [
  { path: "public/core", maxBytes: 256 * 1024 },
  { path: "public/formats", maxBytes: 512 * 1024 },
  { path: "public/workers", maxBytes: 128 * 1024 },
  { path: "scripts", maxBytes: 512 * 1024 },
  { path: "public", maxBytes: 2 * 1024 * 1024 },
];

const FORBIDDEN_DEPENDENCIES = [
  "pdfjs-dist",
  "tesseract.js",
  "mammoth",
  "docx",
  "pptxgenjs",
  "xlsx",
  "jszip",
  "onnxruntime-web",
  "@tensorflow/tfjs",
  "openai",
  "axios",
];

const FORBIDDEN_CORE_IMPORTS = [
  "pdfjs-dist",
  "tesseract.js",
  "mammoth",
  "pptxgenjs",
  "xlsx",
  "onnxruntime",
  "@tensorflow",
  "https://",
  "http://",
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasForbiddenPackageImport(content, packageName) {
  const escaped = escapeRegExp(packageName);
  const importPattern = new RegExp(`\\bfrom\\s+["']${escaped}(?:\\/[^"']*)?["']|\\bimport\\s*\\(\\s*["']${escaped}(?:\\/[^"']*)?["']\\s*\\)|\\brequire\\s*\\(\\s*["']${escaped}(?:\\/[^"']*)?["']\\s*\\)`);
  return importPattern.test(content);
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function directorySize(directory) {
  const files = await listFiles(directory);
  let total = 0;
  for (const file of files) {
    total += (await stat(file)).size;
  }
  return total;
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function assertDirectoryBudgets() {
  for (const budget of BUDGETS) {
    const bytes = await directorySize(path.resolve(budget.path));
    assert.equal(
      bytes <= budget.maxBytes,
      true,
      `${budget.path} is ${formatSize(bytes)}, budget is ${formatSize(budget.maxBytes)}`
    );
  }
}

async function assertDefaultDependenciesStaySmall() {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const dependencies = Object.keys(packageJson.dependencies || {});
  assert.equal(dependencies.length <= 5, true, `default dependency count is ${dependencies.length}, budget is 5`);
  for (const dependency of dependencies) {
    assert.equal(
      FORBIDDEN_DEPENDENCIES.includes(dependency),
      false,
      `${dependency} must be optional or lazy-loaded, not a default dependency`
    );
  }
}

async function assertCoreHasNoHeavyImports() {
  const files = [
    ...await listFiles(path.resolve("public/core")),
    ...await listFiles(path.resolve("public/formats")),
    path.resolve("public/browser-transformer.js"),
  ].filter((file) => /\.(js|json)$/i.test(file));

  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const forbidden of FORBIDDEN_CORE_IMPORTS) {
      if (forbidden === "https://" || forbidden === "http://") {
        assert.equal(
          content.includes(forbidden),
          false,
          `${path.relative(process.cwd(), file)} must not reference ${forbidden} in the default core path`
        );
        continue;
      }
      assert.equal(
        hasForbiddenPackageImport(content, forbidden),
        false,
        `${path.relative(process.cwd(), file)} must not import ${forbidden} in the default core path`
      );
    }
  }
}

async function assertBudgetPolicyDocumented() {
  const policy = await readFile("docs/RESOURCE_BUDGET.md", "utf8");
  for (const expected of ["core", "format-basic", "format-plugin", "optional-plugin", "N * N", "按需下载", "免下载", "manifest", "云端文档处理"]) {
    assert.equal(policy.includes(expected), true, `resource budget doc should mention ${expected}`);
  }
}

await assertDirectoryBudgets();
await assertDefaultDependenciesStaySmall();
await assertCoreHasNoHeavyImports();
await assertBudgetPolicyDocumented();

console.log("Resource budget test passed: default core remains small and heavy capabilities stay out of the main path.");
