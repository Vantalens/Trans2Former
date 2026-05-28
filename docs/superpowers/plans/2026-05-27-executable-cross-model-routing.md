# Executable Cross-Model Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cross-model routing truthful and executable for the stable workbook/semantic paths while downgrading unsupported fidelity claims for PPTX, PDF, OFD, and PNG paths.

**Architecture:** Keep `DocumentModel` as a temporary compatibility carrier for semantic fields plus optional domain payloads. Extend capability declarations with actual produced/accepted/primary models and route class, then execute registered mapper functions only for the approved first-wave routes. Product matrix exposure remains separate from technical route availability.

**Tech Stack:** Browser ES modules, Node.js assertion-based test scripts, existing `ConverterRegistry`, canonical model modules, and `npm test`.

---

## File Map

| File | Responsibility in this change |
| --- | --- |
| `public/core/format-registry.js` | Store truthful capability metadata, plan executable routes, apply mapper results, record executed route metadata. |
| `public/browser-transformer.js` | Register real mapper functions and corrected per-format produced/accepted capabilities. |
| `public/core/models/mappers.js` | Supply pure mapper functions already present; adjust only narrowly if parity tests require context options. |
| `scripts/conversion-capability-audit-test.js` | Assert true capability declarations, route classification, executed mapper metadata, and restricted misleading claims. |
| `scripts/conversion-quality-test.js` | Protect user-visible output content on first-wave mapper paths. |
| `docs/CONVERSION_ROUTING.md` | Describe executable routing and restricted/generative classes after behavior lands. |
| `docs/CONVERSION_PATHS.md` | Align user-facing recommended outputs and caveats with real execution evidence. |
| `DEVELOPMENT_TASKS.md` | Track P8-B status after implementation verification. |

### Task 1: Establish Capability Truth Tests

**Files:**
- Modify: `scripts/conversion-capability-audit-test.js`
- Modify: `public/browser-transformer.js`
- Modify: `public/core/format-registry.js`

- [ ] **Step 1: Write failing assertions for truthful capability metadata**

Add assertions that require canonical capability fields while permitting compatibility aliases:

```js
assert.deepEqual(capabilityByFormat.get("xlsx").producesModels, ["WorkbookModel", "SemanticDoc"]);
assert.equal(capabilityByFormat.get("xlsx").primaryModel, "WorkbookModel");
assert.deepEqual(capabilityByFormat.get("xlsx").acceptsModels, ["WorkbookModel", "SemanticDoc"]);
assert.equal(capabilityByFormat.get("pptx").writerMode, "generated");
assert.equal(capabilityByFormat.get("ofd").readerMaturity, "placeholder");
```

Also replace any assertion treating `pptx -> pptx` as a hot fidelity-preserving path:

```js
assert.notEqual(getRouteTemperature("pptx", "pptx"), "hot");
```

- [ ] **Step 2: Run the focused test and confirm it fails for missing metadata**

Run:

```powershell
node scripts/conversion-capability-audit-test.js
```

Expected: failure stating `producesModels`, `primaryModel`, or corrected PPTX/OFD classification is absent or differs.

- [ ] **Step 3: Extend registry capability storage with canonical names and compatibility aliases**

Change `registerFormat()` to accept and store:

```js
producesModels = inputModels,
acceptsModels = outputModels,
primaryModel = producesModels[0] || "",
writerMode = "native",
readerMaturity = "native",
```

Initialize the corresponding maps in `ConverterRegistry`:

```js
this.producesModelsByFormat = new Map();
this.acceptsModelsByFormat = new Map();
this.primaryModelByFormat = new Map();
this.writerModeByFormat = new Map();
this.readerMaturityByFormat = new Map();
```

Return these properties from `getCapabilities()` while retaining existing `inputModels` and `outputModels` fields for one compatibility cycle:

```js
producesModels: this.producesModelsByFormat.get(format) || [],
acceptsModels: this.acceptsModelsByFormat.get(format) || [],
primaryModel: this.primaryModelByFormat.get(format) || "",
writerMode: this.writerModeByFormat.get(format) || "native",
readerMaturity: this.readerMaturityByFormat.get(format) || "native",
inputModels: this.producesModelsByFormat.get(format) || [],
outputModels: this.acceptsModelsByFormat.get(format) || [],
```

- [ ] **Step 4: Correct format declarations to match real writer behavior**

Use declarations with these intended facts:

```js
// CSV currently writes semantic table blocks.
producesModels: ["WorkbookModel", "SemanticDoc"],
primaryModel: "WorkbookModel",
acceptsModels: ["SemanticDoc"],

// XLSX preserves workbook payload and supports semantic fallback.
producesModels: ["WorkbookModel", "SemanticDoc"],
primaryModel: "WorkbookModel",
acceptsModels: ["WorkbookModel", "SemanticDoc"],

// PPTX output is currently generated from semantic text, not SlideModel write-back.
producesModels: ["SlideModel", "SemanticDoc"],
primaryModel: "SlideModel",
acceptsModels: ["SemanticDoc"],
writerMode: "generated",

// PDF has a real FixedLayout fast path and a SemanticDoc fallback.
producesModels: ["FixedLayoutModel", "SemanticDoc"],
primaryModel: "FixedLayoutModel",
acceptsModels: ["FixedLayoutModel", "SemanticDoc"],

// OFD is input-only with placeholder fixed-layout coverage.
producesModels: ["SemanticDoc"],
primaryModel: "SemanticDoc",
readerMaturity: "placeholder",
```

- [ ] **Step 5: Run the focused test and confirm corrected metadata passes**

Run:

```powershell
node scripts/conversion-capability-audit-test.js
```

Expected: capability declarations pass; executable mapper assertions added in later tasks may still be absent, not failing.

### Task 2: Add Executable Mapper Registration and Route Metadata

**Files:**
- Modify: `scripts/conversion-capability-audit-test.js`
- Modify: `public/core/format-registry.js`
- Modify: `public/browser-transformer.js`

- [ ] **Step 1: Write failing tests for executed mapper evidence**

For first-wave paths, assert that mapper execution is recorded and that hot/direct paths execute none:

```js
const markdownXlsx = toConversionDocumentModel("| a |\n| --- |\n| 1 |", "md", "xlsx", "table.md");
assert.deepEqual(markdownXlsx.metadata.conversion.executedMappers, ["semanticToWorkbook"]);
assert.equal(markdownXlsx.workbook.sheets.length, 1);

const csvMarkdown = toConversionDocumentModel("a,b\n1,2\n", "csv", "md", "table.csv");
assert.deepEqual(csvMarkdown.metadata.conversion.executedMappers, ["workbookToSemantic"]);
assert.equal(csvMarkdown.metadata.warnings.some((warning) => warning.code === "MODEL_STYLE_DROPPED"), true);

const xlsxSelf = toConversionDocumentModel(sourceByFormat.xlsx, "xlsx", "xlsx", "book.xlsx");
assert.deepEqual(xlsxSelf.metadata.conversion.executedMappers, []);

const xlsxCsv = toConversionDocumentModel(sourceByFormat.xlsx, "xlsx", "csv", "book.xlsx");
assert.deepEqual(xlsxCsv.metadata.conversion.executedMappers, ["workbookToSemantic"]);
```

- [ ] **Step 2: Run the focused test and confirm it fails because no mapper executes**

Run:

```powershell
node scripts/conversion-capability-audit-test.js
```

Expected: failure because `executedMappers` is missing or empty for `md -> xlsx` / `csv -> md`.

- [ ] **Step 3: Store mapper functions in `RoutePlanner`**

Update registration so mapper descriptors retain a function and stable name:

```js
registerMapper({ name, from, to, fn, lossLevel = "low", forcedWarnings = [] }) {
  if (!from || !to || typeof fn !== "function") return;
  this.mappers.push({
    name: String(name || `${from}To${to}`),
    from: String(from),
    to: String(to),
    fn,
    lossLevel: String(lossLevel),
    forcedWarnings: forcedWarnings.map((warning) => String(warning)),
  });
}
```

- [ ] **Step 4: Register the approved real functions**

Import the existing pure functions and register only executable first-wave links initially:

```js
import { semanticToWorkbook, workbookToSemantic } from "./core/models/mappers.js";

registry.registerMapper({
  name: "workbookToSemantic",
  from: "WorkbookModel",
  to: "SemanticDoc",
  fn: workbookToSemantic,
  lossLevel: "low",
  forcedWarnings: ["MODEL_STYLE_DROPPED", "MODEL_FORMULA_AS_VALUE"],
});
registry.registerMapper({
  name: "semanticToWorkbook",
  from: "SemanticDoc",
  to: "WorkbookModel",
  fn: semanticToWorkbook,
  lossLevel: "low",
  forcedWarnings: ["MODEL_NO_FORMULA_INFO"],
});
```

Keep Slide/FixedLayout edges unavailable for automatic execution until their rollout task and fixtures exist; they may be represented as deferred capability notes, not runnable mapper descriptors.

- [ ] **Step 5: Execute routed workbook/semantic payloads in conversion preparation**

Introduce small helpers in `format-registry.js` that use existing carrier fields:

```js
function getPayload(model, type) {
  if (type === "SemanticDoc") return model;
  if (type === "WorkbookModel") return model.workbook;
  if (type === "SlideModel") return model.slides;
  if (type === "FixedLayoutModel") return model.fixedLayout;
  return null;
}

function attachPayload(carrier, type, payload) {
  if (type === "WorkbookModel") return { ...carrier, workbook: payload };
  if (type === "SlideModel") return { ...carrier, slides: payload };
  if (type === "FixedLayoutModel") return { ...carrier, fixedLayout: payload };
  if (type === "SemanticDoc") {
    return { ...carrier, ...payload, metadata: carrier.metadata, workbook: carrier.workbook, slides: carrier.slides, fixedLayout: carrier.fixedLayout };
  }
  return carrier;
}
```

Apply only the route mappers selected from `primaryModel` to the writer's first reachable preferred payload. For example, `md -> xlsx` must choose executable `SemanticDoc -> WorkbookModel` because XLSX lists `WorkbookModel` before its semantic fallback. Invoke `mapper.fn(payload, { title, sourceFormat: fromFormat })`, then record:

```js
conversion: {
  routeClass,
  routeTemperature: route.temperature,
  routeModels: route.models,
  executedMappers: route.mappers.map((mapper) => mapper.name),
}
```

- [ ] **Step 6: Run the focused route test**

Run:

```powershell
node scripts/conversion-capability-audit-test.js
```

Expected: PASS, with `semanticToWorkbook` and `workbookToSemantic` explicitly recorded only for corresponding executed routes.

### Task 3: Protect Table-Chain Output Quality

**Files:**
- Modify: `scripts/conversion-quality-test.js`
- Modify: `scripts/smoke-test.js`
- Modify only if required by red tests: `public/core/models/mappers.js`

- [ ] **Step 1: Add failing quality coverage for actual mapper outputs**

Add a quality target for Markdown table to XLSX route metadata/output extraction and tighten CSV/XLSX semantic output checks:

```js
{
  name: "CSV -> MD through WorkbookModel mapper",
  inputPath: "samples/csv/unicode.csv",
  from: "csv",
  to: "md",
  keywords: ["| 名称 | 说明 |", "苹果", "中文单元格", "香蕉"],
  expectedTemperature: "warm",
  expectedMapper: "workbookToSemantic",
}
```

In the loop, use `toConversionDocumentModel()` and assert:

```js
if (target.expectedMapper) {
  const routed = toConversionDocumentModel(raw, target.from, target.to, fileName, fileName);
  assert.equal(routed.metadata.conversion.executedMappers.includes(target.expectedMapper), true);
}
```

Add a smoke assertion that `md -> xlsx` yields an XLSX whose shared strings include table cell content after `semanticToWorkbook`.

- [ ] **Step 2: Run quality and smoke tests to expose any regression**

Run:

```powershell
node scripts/conversion-quality-test.js
node scripts/smoke-test.js
```

Expected: any change in visible CSV-to-Markdown formatting or XLSX cell output fails before mapper adjustments are made.

- [ ] **Step 3: Make the minimal mapper parity adjustment if tests require it**

If a CSV single-sheet conversion introduces an unwanted sheet heading, add a route option rather than a writer special case:

```js
export function workbookToSemantic(workbook, { title = "workbook", sourceFormat = "", includeSheetHeadings = true } = {}) {
  const blocks = [];
  for (const sheet of workbook?.sheets || []) {
    if (includeSheetHeadings && sheet.name) blocks.push(createHeading(2, sheet.name));
    if (Array.isArray(sheet.headers) && sheet.headers.length > 0) {
      blocks.push(createTable(sheet.headers, sheet.rows || []));
    }
  }
  return createDocumentModel({ title, sourceFormat, blocks });
}
```

Pass `includeSheetHeadings: fromFormat !== "csv"` while applying `workbookToSemantic`.

- [ ] **Step 4: Re-run focused tests**

Run:

```powershell
node scripts/conversion-capability-audit-test.js
node scripts/conversion-quality-test.js
node scripts/smoke-test.js
```

Expected: PASS with existing visible CSV table content preserved and mapper execution proven.

### Task 4: Restrict Misleading High-Risk Route Claims

**Files:**
- Modify: `scripts/conversion-capability-audit-test.js`
- Modify: `public/core/format-registry.js`
- Modify: `public/browser-transformer.js`
- Modify: `docs/CONVERSION_PATHS.md`
- Modify: `docs/CONVERSION_ROUTING.md`

- [ ] **Step 1: Write failing route classification assertions**

Add product-level assertions for paths whose current implementation cannot support fidelity claims:

```js
assert.equal(getRouteDetails("pptx", "pptx").routeClass, "generated");
assert.equal(getRouteDetails("ofd", "pdf").routeClass, "restricted");
```

Expose a format-level `getRouteDetails(from, to)` API from `browser-transformer.js` if it does not yet exist. Do not assert data-dependent `pdf -> pdf` fidelity through this API: whether PDF output takes the FixedLayout fast path must be recorded on the concrete converted model after reading its payload.

- [ ] **Step 2: Run test to confirm classifications are not yet represented**

Run:

```powershell
node scripts/conversion-capability-audit-test.js
```

Expected: FAIL because route class/details API or restricted classifications do not yet exist.

- [ ] **Step 3: Implement explicit route class overrides without expanding allowed outputs**

Define narrow overrides in the registry:

```js
const ROUTE_CLASS_OVERRIDES = {
  "pptx->pptx": "generated",
  "md->pptx": "generated",
  "html->pptx": "generated",
  "json->pptx": "generated",
  "ofd->pdf": "restricted",
};
```

Return these in conversion metadata and add `PATH_NOT_RECOMMENDED` only when a currently exposed path is classified as `generated` or `restricted`. Do not add any path to `PRODUCT_MATRIX_BY_INPUT`.

For a real PDF conversion model, assert execution-dependent output metadata separately:

```js
const pdfModel = toConversionDocumentModel(pdfWithLayoutFixture, "pdf", "pdf", "layout.pdf");
assert.equal(pdfModel.fixedLayout.pages.length > 0, true);
assert.equal(pdfModel.metadata.conversion.routeTemperature, "hot");
```

- [ ] **Step 4: Update route documentation to match executed behavior**

Document:

- P8-A is the completed warning/visibility baseline.
- P8-B executes only verified mapper paths first.
- PPTX output is currently generated rather than fidelity-preserving.
- OFD/PDF/PNG advanced fidelity paths require later local-core capability and evidence.

- [ ] **Step 5: Run capability audit again**

Run:

```powershell
node scripts/conversion-capability-audit-test.js
```

Expected: PASS with high-risk routes accurately classified and product exposure unchanged.

### Task 5: Full Verification and Task Status Update

**Files:**
- Modify: `DEVELOPMENT_TASKS.md`

- [ ] **Step 1: Run focused and full regression verification**

Run:

```powershell
node scripts/conversion-capability-audit-test.js
node scripts/conversion-quality-test.js
node scripts/smoke-test.js
npm test
git diff --check
```

Expected: all commands exit `0`; route and output checks pass without whitespace errors.

- [ ] **Step 2: Update the project status using only verified claims**

After Step 1 passes, update `DEVELOPMENT_TASKS.md` so P8-B records only shipped behaviors:

```markdown
| P8-B 执行型 mapper 与路径校准 | 已完成（2026-05-27） | Workbook/Semantic 首批执行链完成；PPTX/OFD 高风险路径已按证据分级 |
```

If Slide/FixedLayout execution remains deferred, retain it as a follow-up rather than marking the broader high-fidelity work complete.

- [ ] **Step 3: Run documentation/status sanity check**

Run:

```powershell
Select-String -Path DEVELOPMENT_TASKS.md,docs\CONVERSION_ROUTING.md,docs\CONVERSION_PATHS.md -Pattern 'P8-B|executedMappers|generated|restricted|pptx|ofd'
git diff --check
```

Expected: references to the implemented classification and execution evidence are present; no whitespace failures.

## Plan Self-Review

- Spec coverage: Tasks 1-2 cover truthful capability and mapper execution; Task 3 protects stable table paths; Task 4 handles restricted/generated risk boundaries; Task 5 closes verification and status reporting.
- Scope boundary: Slide/FixedLayout mapper execution, OCR, OFD page parsing, and PPTX multi-page fidelity writing remain excluded until fixture evidence and writer support exist.
- Naming consistency: `producesModels`, `acceptsModels`, `primaryModel`, `writerMode`, `readerMaturity`, `routeClass`, `executedMappers`, and `getRouteDetails()` are consistently used throughout the plan.
