// WorkbookModel：工作簿规范模型，承载 sheet / cell / merge / formula cache /
// style hint 等表格语义。CSV / XLSX reader 在产出 SemanticDoc 的同时在 model
// 顶层挂 model.workbook，让需要表格细节（公式缓存、合并单元格、列宽）的
// writer 直接消费，不必从 SemanticDoc.table 反推。
//
// 详见 docs/MULTI_MODEL_ARCHITECTURE.md。

export function createWorkbookModel({
  sheets = [],
  definedNames = [],
  metadata = {},
} = {}) {
  return {
    schemaVersion: "trans2former.workbook.v1",
    sheets: sheets.map((sheet) => createSheet(sheet)),
    definedNames: definedNames.map((entry) => ({
      name: String(entry?.name ?? ""),
      ref: String(entry?.ref ?? ""),
    })),
    metadata: { ...metadata },
  };
}

export function createSheet({
  name = "",
  headers = [],
  rows = [],
  cells = [],
  merges = [],
  columns = [],
  formulas = [],
} = {}) {
  return {
    name: String(name || ""),
    headers: headers.map((value) => String(value ?? "")),
    rows: rows.map((row) => row.map((cell) => String(cell ?? ""))),
    cells: cells.map((cell) => createCell(cell)),
    merges: merges.map((merge) => ({
      from: String(merge?.from ?? ""),
      to: String(merge?.to ?? ""),
    })),
    columns: columns.map((column) => ({
      index: Number(column?.index ?? 0) || 0,
      widthPx: column?.widthPx === undefined ? null : Number(column.widthPx),
      style: String(column?.style ?? ""),
    })),
    formulas: formulas.map((formula) => ({
      ref: String(formula?.ref ?? ""),
      expression: String(formula?.expression ?? ""),
      cachedValue: String(formula?.cachedValue ?? ""),
    })),
  };
}

export function createCell({
  ref = "",
  value = "",
  formula = "",
  style = "",
  type = "string",
} = {}) {
  return {
    ref: String(ref || ""),
    value: String(value ?? ""),
    formula: String(formula || ""),
    style: String(style || ""),
    type: String(type || "string"),
  };
}

export function getWorkbookSummary(workbook) {
  if (!workbook || !Array.isArray(workbook.sheets)) {
    return { sheetCount: 0, formulaCellCount: 0, mergedRangeCount: 0 };
  }
  return {
    sheetCount: workbook.sheets.length,
    formulaCellCount: workbook.sheets.reduce(
      (sum, sheet) => sum + sheet.formulas.length,
      0
    ),
    mergedRangeCount: workbook.sheets.reduce(
      (sum, sheet) => sum + sheet.merges.length,
      0
    ),
  };
}
