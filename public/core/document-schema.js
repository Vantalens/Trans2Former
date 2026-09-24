import { ConversionError } from "./conversion-error.js";

const VALID_BLOCK_TYPES = new Set(["heading", "paragraph", "list", "code", "table", "quote", "image", "asset", "raw"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateWarnings(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be warning[]`);
    return;
  }
  value.forEach((warning, index) => {
    if (!isObject(warning)) {
      errors.push(`${path}[${index}] must be an object`);
      return;
    }
    for (const key of ["severity", "code", "message"]) {
      if (typeof warning[key] !== "string") errors.push(`${path}[${index}].${key} must be a string`);
    }
    if (!isObject(warning.details)) errors.push(`${path}[${index}].details must be an object`);
  });
}

function validateSourceSpan(value, path, errors) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const key of ["startLine", "endLine", "startOffset", "endOffset"]) {
    if (value[key] !== null && !Number.isInteger(value[key])) errors.push(`${path}.${key} must be integer or null`);
  }
}

export function validateDocumentModel(model) {
  const errors = [];
  if (!isObject(model)) {
    return { ok: false, errors: ["model must be an object"] };
  }
  if (model.schemaVersion !== "trans2former.document.v1") {
    errors.push("schemaVersion must be trans2former.document.v1");
  }
  if (typeof model.title !== "string") {
    errors.push("title must be a string");
  }
  if (typeof model.sourceFormat !== "string") {
    errors.push("sourceFormat must be a string");
  }
  if (!Array.isArray(model.blocks)) {
    errors.push("blocks must be an array");
  }
  if (!Array.isArray(model.assets)) {
    errors.push("assets must be an array");
  }
  if (!isObject(model.metadata)) {
    errors.push("metadata must be an object");
  }

  if (Array.isArray(model.blocks)) {
    model.blocks.forEach((block, index) => {
      if (!isObject(block)) {
        errors.push(`blocks[${index}] must be an object`);
        return;
      }
      if (!VALID_BLOCK_TYPES.has(block.type)) {
        errors.push(`blocks[${index}].type is invalid: ${block.type}`);
        return;
      }
      if (typeof block.id !== "string") errors.push(`blocks[${index}].id must be a string`);
      validateSourceSpan(block.sourceSpan, `blocks[${index}].sourceSpan`, errors);
      validateWarnings(block.warnings, `blocks[${index}].warnings`, errors);
      if (block.type === "heading") {
        if (!Number.isInteger(block.level) || block.level < 1 || block.level > 6) errors.push(`blocks[${index}].level must be 1-6`);
        if (typeof block.text !== "string") errors.push(`blocks[${index}].text must be a string`);
      }
      if (["paragraph", "quote"].includes(block.type) && typeof block.text !== "string") {
        errors.push(`blocks[${index}].text must be a string`);
      }
      if (["paragraph", "heading"].includes(block.type) && block.paragraphFormat !== undefined) {
        const format = block.paragraphFormat;
        const allowedAlignments = new Set(["left", "center", "right", "justify"]);
        const numericKeys = ["indentLeft", "indentRight", "firstLineIndent", "hangingIndent", "spacingBefore", "spacingAfter", "lineSpacing"];
        if (!isObject(format)) errors.push(`blocks[${index}].paragraphFormat must be an object`);
        else {
          if (format.alignment !== undefined && !allowedAlignments.has(format.alignment)) errors.push(`blocks[${index}].paragraphFormat.alignment is invalid`);
          for (const key of numericKeys) {
            if (format[key] !== undefined && !Number.isSafeInteger(format[key])) errors.push(`blocks[${index}].paragraphFormat.${key} must be an integer`);
          }
          for (const key of ["spacingBefore", "spacingAfter", "lineSpacing"]) {
            if (format[key] !== undefined && format[key] < 0) errors.push(`blocks[${index}].paragraphFormat.${key} must be non-negative`);
          }
          if (format.tabStops !== undefined && (!Array.isArray(format.tabStops) || format.tabStops.some((tab) => !isObject(tab) || !Number.isSafeInteger(tab.position) || tab.position <= 0))) {
            errors.push(`blocks[${index}].paragraphFormat.tabStops must contain positive positions`);
          }
          if (Array.isArray(format.tabStops)) format.tabStops.forEach((tab, tabIndex) => {
            if (!isObject(tab)) return;
            if (tab.alignment !== undefined && !["clear", "left", "center", "right", "decimal", "bar", "num"].includes(tab.alignment)) {
              errors.push(`blocks[${index}].paragraphFormat.tabStops[${tabIndex}].alignment is invalid`);
            }
            if (tab.leader !== undefined && !["none", "dot", "hyphen", "underscore", "heavy", "middleDot"].includes(tab.leader)) {
              errors.push(`blocks[${index}].paragraphFormat.tabStops[${tabIndex}].leader is invalid`);
            }
          });
        }
      }
      if (block.type === "list") {
        if (typeof block.ordered !== "boolean") errors.push(`blocks[${index}].ordered must be a boolean`);
        if (!Array.isArray(block.items) || block.items.some((item) => typeof item !== "string")) errors.push(`blocks[${index}].items must be string[]`);
        if (block.itemMeta !== undefined && (!Array.isArray(block.itemMeta) || block.itemMeta.some((item) => !isObject(item)))) errors.push(`blocks[${index}].itemMeta must be object[]`);
      }
      if (block.type === "code") {
        if (typeof block.code !== "string") errors.push(`blocks[${index}].code must be a string`);
        if (typeof block.language !== "string") errors.push(`blocks[${index}].language must be a string`);
      }
      if (block.type === "table") {
        if (!Array.isArray(block.headers) || block.headers.some((item) => typeof item !== "string")) errors.push(`blocks[${index}].headers must be string[]`);
        if (!Array.isArray(block.rows) || block.rows.some((row) => !Array.isArray(row) || row.some((cell) => typeof cell !== "string"))) errors.push(`blocks[${index}].rows must be string[][]`);
        if (block.alignments !== undefined && (!Array.isArray(block.alignments) || block.alignments.some((alignment) => typeof alignment !== "string"))) errors.push(`blocks[${index}].alignments must be string[]`);
        if (block.columnWidths !== undefined && (!Array.isArray(block.columnWidths) || block.columnWidths.some((width) => !Number.isSafeInteger(width) || width <= 0))) errors.push(`blocks[${index}].columnWidths must contain positive integers`);
        if (block.cellSpans !== undefined && (!Array.isArray(block.cellSpans) || block.cellSpans.some((row) => !Array.isArray(row) || row.some((cell) => !isObject(cell) || (cell.columnSpan !== undefined && (!Number.isSafeInteger(cell.columnSpan) || cell.columnSpan < 1)) || (cell.verticalMerge !== undefined && !["restart", "continue"].includes(cell.verticalMerge)))))) {
          errors.push(`blocks[${index}].cellSpans must contain valid cell span metadata`);
        }
      }
      if (block.type === "image") {
        if (typeof block.src !== "string") errors.push(`blocks[${index}].src must be a string`);
        if (typeof block.alt !== "string") errors.push(`blocks[${index}].alt must be a string`);
      }
      if (block.type === "asset" && typeof block.assetId !== "string") {
        errors.push(`blocks[${index}].assetId must be a string`);
      }
      if (block.type === "raw") {
        if (typeof block.format !== "string") errors.push(`blocks[${index}].format must be a string`);
        if (typeof block.content !== "string") errors.push(`blocks[${index}].content must be a string`);
      }
    });
  }

  if (Array.isArray(model.assets)) {
    model.assets.forEach((asset, index) => {
      if (!isObject(asset)) {
        errors.push(`assets[${index}] must be an object`);
        return;
      }
      for (const key of ["id", "name", "mime", "data", "role"]) {
        if (typeof asset[key] !== "string") errors.push(`assets[${index}].${key} must be a string`);
      }
      if (typeof asset.size !== "number") errors.push(`assets[${index}].size must be a number`);
      if (!isObject(asset.provenance)) errors.push(`assets[${index}].provenance must be an object`);
    });
  }

  if (isObject(model.metadata)) {
    if (model.metadata.warnings !== undefined) validateWarnings(model.metadata.warnings, "metadata.warnings", errors);
    if (model.metadata.conversion !== undefined && !isObject(model.metadata.conversion)) errors.push("metadata.conversion must be an object");
  if (model.metadata.qualityReport !== undefined && !isObject(model.metadata.qualityReport)) errors.push("metadata.qualityReport must be an object");
  if (isObject(model.metadata.qualityReport) && model.metadata.qualityReport.layoutFidelity !== undefined
    && !["high", "medium", "low", "not-applicable"].includes(model.metadata.qualityReport.layoutFidelity)) {
    errors.push("metadata.qualityReport.layoutFidelity is invalid");
  }
  }

  return { ok: errors.length === 0, errors };
}

export function assertValidDocumentModel(model) {
  const result = validateDocumentModel(model);
  if (!result.ok) {
    throw new ConversionError(`DocumentModel schema validation failed: ${result.errors.join("; ")}`, {
      category: "validate",
      code: "DOCUMENT_MODEL_SCHEMA_ERROR",
      details: { errors: result.errors },
    });
  }
  return model;
}
