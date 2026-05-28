# Local Model Output Closure S1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **2026-05-28 修订声明**：S1 已于 2026-05-28 落地。其中「模型资源随正式安装包交付」「安装包内置、按需加载、可禁用」等方向描述已被同日 [../specs/2026-05-28-lightweight-default-bundle-direction.md](../specs/2026-05-28-lightweight-default-bundle-direction.md) 替换为「OCR 模型资源不进入默认安装包；首次启用时本地下载到 model-cache」。对应守门测试 `scripts/local-model-direction-test.js` 关键词已同步。本 plan 中文件改动清单与测试关键词作为历史快照保留，不再作为后续工作真值。

**Goal:** Establish the first development slice for local-model output closure by making the product matrix and direction docs testable truth surfaces before implementing Repair Engine or high-fidelity writers.

**Architecture:** Keep runtime conversion behavior unchanged in S1. Add focused Node test scripts that compare `docs/CONVERSION_PATHS.md` to `getAllowedOutputFormats()` and assert the approved local-model direction appears in active docs. Then update only docs and package test wiring until these gates pass.

**Tech Stack:** Browser ES modules, Node.js assertion scripts, existing `public/browser-transformer.js` registry exports, Markdown docs, `npm test`.

---

## File Map

| File | Responsibility in this change |
| --- | --- |
| `scripts/product-matrix-docs-test.js` | New test that parses `docs/CONVERSION_PATHS.md` and compares each documented row to `getAllowedOutputFormats()`. |
| `scripts/local-model-direction-test.js` | New test that guards the approved bundled local-model, auto-repair, and no-cloud direction across active docs. |
| `package.json` | Add both new test scripts to the main `npm test` chain. |
| `docs/CONVERSION_PATHS.md` | Sync documented rows with the current code matrix, including XML routes and an explicit XML input row. |
| `DEVELOPMENT_TASKS.md` | Replace the stale “不依赖 OCR/AI” wording with the approved no-cloud plus bundled local-model direction and add S1/S2 next-step language. |
| `docs/DESKTOP_APP_ARCHITECTURE.md` | Replace manual local-model install language with bundled, on-demand, disableable model resources. |
| `docs/DESKTOP_RELEASE_PLAN.md` | Replace manual model resource wording with bundled model manifest, checksum, size report, and offline smoke language. |
| `docs/RESOURCE_BUDGET.md` | Split lightweight core budget from model-enhanced desktop package budget. |
| `docs/PRODUCT_STRATEGY.md` | Make software-owned automatic repair and document-specialized local models explicit. |
| `docs/MULTI_MODEL_ARCHITECTURE.md` | Replace plugin/external-engine stale wording with core bundled local model and Repair Engine boundaries. |

## Task 1: Add Product Matrix Documentation Gate

**Files:**
- Create: `scripts/product-matrix-docs-test.js`
- Modify: `package.json`
- Modify: `docs/CONVERSION_PATHS.md`

- [ ] **Step 1: Write the failing product matrix docs test**

Create `scripts/product-matrix-docs-test.js`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getAllowedOutputFormats } from "../public/browser-transformer.js";

const docs = await readFile("docs/CONVERSION_PATHS.md", "utf8");

const inputNameToFormats = new Map([
  ["Markdown", ["md"]],
  ["HTML", ["html"]],
  ["TXT", ["txt"]],
  ["JSON", ["json"]],
  ["XML", ["xml"]],
  ["CSV", ["csv"]],
  ["XLSX", ["xlsx"]],
  ["DOC / DOCX", ["doc", "docx"]],
  ["EPUB", ["epub"]],
  ["PDF", ["pdf"]],
  ["PPTX", ["pptx"]],
  ["PNG", ["png"]],
  ["OFD", ["ofd"]],
]);

const outputNameToFormat = new Map([
  ["Markdown", "md"],
  ["HTML", "html"],
  ["TXT", "txt"],
  ["JSON", "json"],
  ["CSV", "csv"],
  ["XML", "xml"],
  ["DOCX", "docx"],
  ["XLSX", "xlsx"],
  ["PDF", "pdf"],
  ["EPUB", "epub"],
  ["PPTX", "pptx"],
]);

function parseMatrixRows(markdown) {
  const rows = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("| ")) continue;
    if (line.includes("---")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3 || cells[0] === "输入") continue;
    if (!inputNameToFormats.has(cells[0])) continue;
    const outputs = cells[1]
      .split("、")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => {
        assert.equal(outputNameToFormat.has(name), true, `Unknown documented output name: ${name}`);
        return outputNameToFormat.get(name);
      });
    for (const format of inputNameToFormats.get(cells[0])) {
      rows.set(format, outputs);
    }
  }
  return rows;
}

const documentedRows = parseMatrixRows(docs);
for (const format of inputNameToFormats.values()) {
  for (const alias of format) {
    assert.equal(documentedRows.has(alias), true, `docs/CONVERSION_PATHS.md must document ${alias}`);
  }
}

for (const format of documentedRows.keys()) {
  assert.deepEqual(
    documentedRows.get(format),
    getAllowedOutputFormats(format),
    `docs/CONVERSION_PATHS.md output row for ${format} must match getAllowedOutputFormats(${format})`
  );
}

console.log("Product matrix docs test passed: CONVERSION_PATHS matches the registry product matrix.");
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run:

```powershell
node scripts/product-matrix-docs-test.js
```

Expected: FAIL because `docs/CONVERSION_PATHS.md` lacks the `XML` input row and omits several current `-> XML` outputs.

- [ ] **Step 3: Add the test to `package.json`**

Update the `test` script so it includes:

```json
"node scripts/product-matrix-docs-test.js"
```

Place it after `node scripts/conversion-capability-audit-test.js` so the code matrix and documented matrix fail close together.

- [ ] **Step 4: Sync `docs/CONVERSION_PATHS.md` with the current registry**

Update the matrix rows to match:

```text
Markdown: Markdown、HTML、TXT、JSON、CSV、XML、DOCX、XLSX、PDF、EPUB、PPTX
HTML: Markdown、HTML、TXT、JSON、CSV、XML、DOCX、XLSX、PDF、EPUB、PPTX
TXT: Markdown、HTML、TXT、JSON、XML、DOCX、PDF、EPUB
JSON: Markdown、HTML、TXT、JSON、CSV、XML、DOCX、XLSX、PDF、EPUB、PPTX
XML: Markdown、HTML、TXT、JSON、XML、PDF
CSV: Markdown、CSV、XLSX、HTML、TXT、JSON、XML、PDF
XLSX: Markdown、CSV、XLSX、HTML、TXT、JSON、XML、PDF
DOC / DOCX: Markdown、HTML、TXT、JSON、XML、DOCX、PDF
EPUB: Markdown、HTML、TXT、JSON、XML、DOCX、PDF、EPUB
PDF: Markdown、HTML、TXT、JSON、XML、DOCX、PDF
PPTX: Markdown、HTML、TXT、JSON、XML、PDF、PPTX
PNG: HTML、TXT、JSON、PDF
OFD: Markdown、HTML、TXT、JSON、XML、PDF
```

Keep caveats truthful: PNG remains input-only for now, OFD remains L0/restricted for high-fidelity output, and PPTX write-back remains generated.

- [ ] **Step 5: Run the new test and confirm it passes**

Run:

```powershell
node scripts/product-matrix-docs-test.js
```

Expected: PASS with `Product matrix docs test passed`.

- [ ] **Step 6: Commit the matrix gate**

Run:

```powershell
git add package.json scripts/product-matrix-docs-test.js docs/CONVERSION_PATHS.md
git commit -m "test: gate product matrix docs against registry"
```

## Task 2: Add Local Model Direction Documentation Gate

**Files:**
- Create: `scripts/local-model-direction-test.js`
- Modify: `package.json`
- Modify: `DEVELOPMENT_TASKS.md`
- Modify: `docs/DESKTOP_APP_ARCHITECTURE.md`
- Modify: `docs/DESKTOP_RELEASE_PLAN.md`
- Modify: `docs/RESOURCE_BUDGET.md`
- Modify: `docs/PRODUCT_STRATEGY.md`
- Modify: `docs/MULTI_MODEL_ARCHITECTURE.md`

- [ ] **Step 1: Write the failing local-model direction test**

Create `scripts/local-model-direction-test.js`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  tasks: await readFile("DEVELOPMENT_TASKS.md", "utf8"),
  desktop: await readFile("docs/DESKTOP_APP_ARCHITECTURE.md", "utf8"),
  release: await readFile("docs/DESKTOP_RELEASE_PLAN.md", "utf8"),
  budget: await readFile("docs/RESOURCE_BUDGET.md", "utf8"),
  strategy: await readFile("docs/PRODUCT_STRATEGY.md", "utf8"),
  multiModel: await readFile("docs/MULTI_MODEL_ARCHITECTURE.md", "utf8"),
};

function assertIncludes(fileKey, expected) {
  assert.equal(
    files[fileKey].includes(expected),
    true,
    `${fileKey} should mention: ${expected}`
  );
}

function assertExcludes(fileKey, forbidden) {
  assert.equal(
    files[fileKey].includes(forbidden),
    false,
    `${fileKey} should no longer mention stale wording: ${forbidden}`
  );
}

assertIncludes("tasks", "不依赖 Office、LibreOffice、Pandoc、云端转换或云端 OCR/AI");
assertIncludes("tasks", "内置本地专用模型");
assertIncludes("tasks", "Repair Engine");
assertExcludes("tasks", "不依赖 Office、LibreOffice、Pandoc、云端转换或 OCR/AI");

assertIncludes("desktop", "安装包内置、按需加载、可禁用");
assertIncludes("desktop", "Repair Engine");
assertExcludes("desktop", "手动安装、手动启用");

assertIncludes("release", "内置模型 manifest");
assertIncludes("release", "模型资源随正式安装包交付");
assertIncludes("release", "离线修复 smoke");
assertExcludes("release", "本地模型资源必须手动安装");

assertIncludes("budget", "轻量核心预算");
assertIncludes("budget", "模型增强桌面包预算");
assertIncludes("budget", "模型资源随安装包交付");

assertIncludes("strategy", "软件自动修复");
assertIncludes("strategy", "文档图像、文字、版面和表格专用本地模型");

assertIncludes("multiModel", "Repair Engine");
assertIncludes("multiModel", "核心本地内置模型");
assertExcludes("multiModel", "external engine 一律插件化");

console.log("Local model direction test passed: active docs match bundled local-model auto-repair direction.");
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run:

```powershell
node scripts/local-model-direction-test.js
```

Expected: FAIL on stale manual-install or no-OCR/AI wording.

- [ ] **Step 3: Add the test to `package.json`**

Update the `test` script so it includes:

```json
"node scripts/local-model-direction-test.js"
```

Place it near `node scripts/local-security-test.js` and `node scripts/resource-budget-test.js`.

- [ ] **Step 4: Update active docs without claiming unfinished runtime capability**

Make these wording changes:

```text
DEVELOPMENT_TASKS.md:
- Replace stale no-OCR/AI wording with no-cloud OCR/AI plus bundled local specialist model direction.
- Add S1/S2 next steps for matrix truth and Repair Engine contract.

docs/DESKTOP_APP_ARCHITECTURE.md:
- Change local model row to “安装包内置、按需加载、可禁用”.
- Add Repair Engine as an automatic repair boundary, not a user manual repair flow.

docs/DESKTOP_RELEASE_PLAN.md:
- Replace manual model install with bundled model resources, manifest, checksum, size report, and offline repair smoke.

docs/RESOURCE_BUDGET.md:
- Split current light core budgets from future model-enhanced desktop package budgets.
- State model resources ship with the installer but are not part of first-screen startup path.

docs/PRODUCT_STRATEGY.md:
- Add software automatic repair and document-specialized local model wording.

docs/MULTI_MODEL_ARCHITECTURE.md:
- Replace stale pluginized external engine sentence with core bundled local-model and Repair Engine boundaries.
```

- [ ] **Step 5: Run the focused direction test and confirm it passes**

Run:

```powershell
node scripts/local-model-direction-test.js
```

Expected: PASS with `Local model direction test passed`.

- [ ] **Step 6: Commit the direction gate**

Run:

```powershell
git add package.json scripts/local-model-direction-test.js DEVELOPMENT_TASKS.md docs/DESKTOP_APP_ARCHITECTURE.md docs/DESKTOP_RELEASE_PLAN.md docs/RESOURCE_BUDGET.md docs/PRODUCT_STRATEGY.md docs/MULTI_MODEL_ARCHITECTURE.md
git commit -m "docs: align local model auto-repair direction"
```

## Task 3: Run S1 Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run focused S1 tests**

Run:

```powershell
node scripts/product-matrix-docs-test.js
node scripts/local-model-direction-test.js
node scripts/conversion-capability-audit-test.js
node scripts/local-security-test.js
node scripts/resource-budget-test.js
```

Expected: all commands pass.

- [ ] **Step 2: Run full project test**

Run:

```powershell
npm test
```

Expected: PASS. The final output should include the existing smoke, capability, security, budget, and release readiness pass messages plus the two new S1 gates.

- [ ] **Step 3: Run release preparation and whitespace checks**

Run:

```powershell
npm run release:prepare
git diff --check
git check-ignore -v release\trans2former-2.2.0\RELEASE_MANIFEST.json
```

Expected:

- `npm run release:prepare` succeeds.
- `git diff --check` produces no output.
- `git check-ignore` reports that the release manifest is ignored.

- [ ] **Step 4: Update `DEVELOPMENT_TASKS.md` completion note if verification passes**

Add a recent validation note that S1 matrix and local-model direction gates are in place, without marking Repair Engine, bundled runtime, PNG output, OFD output, PDF high-fidelity recovery, or PPTX high-fidelity recovery as complete.

- [ ] **Step 5: Commit final task status if changed**

Run:

```powershell
git add DEVELOPMENT_TASKS.md
git commit -m "docs: record local model closure s1 validation"
```

Only run this commit if Step 4 changed `DEVELOPMENT_TASKS.md` after the Task 2 commit.

## Self-Review

- Spec coverage: this plan covers S1 from the approved design: matrix truth, stale doc conflict removal, bundled local-model direction, and explicit non-claiming of unfinished runtime capability. Repair Engine, model runtime, PNG/OFD writers, PDF recovery, and PPTX high-fidelity work are intentionally deferred to later plans.
- Placeholder scan: this plan contains no `TBD`, `TODO`, or unspecified test/write steps.
- Type consistency: test names and file names are consistent across tasks: `product-matrix-docs-test.js`, `local-model-direction-test.js`, `getAllowedOutputFormats()`, and active docs listed in the S1 spec.
