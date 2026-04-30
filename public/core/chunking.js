import { createDocumentModel } from "./document-model.js";
import { ensureDocumentAudit } from "./document-audit.js";

function normalizeBlockForComparison(block) {
  const comparable = { type: block.type };
  for (const key of ["level", "text", "ordered", "items", "code", "language", "headers", "rows", "alignments", "src", "alt", "title", "assetId", "format", "content"]) {
    if (Object.hasOwn(block, key)) {
      comparable[key] = block[key];
    }
  }
  return comparable;
}

export function chunkTextByLines(content, { maxLines = 120 } = {}) {
  const lines = String(content ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const chunks = [];
  for (let index = 0; index < lines.length; index += maxLines) {
    const chunkLines = lines.slice(index, index + maxLines);
    chunks.push({
      index: chunks.length,
      startLine: index + 1,
      endLine: index + chunkLines.length,
      content: chunkLines.join("\n"),
    });
  }
  return chunks;
}

export function mergePartialDocumentModels(partials, {
  title = "merged-document",
  sourceFormat = partials[0]?.sourceFormat || "",
  originalContent = "",
} = {}) {
  const blocks = [];
  const assets = [];
  const warnings = [];

  partials.forEach((partial, partialIndex) => {
    blocks.push(...(partial.blocks || []).map((block) => ({
      ...block,
      chunk: {
        index: partialIndex,
        title: partial.title,
      },
    })));
    assets.push(...(partial.assets || []));
    warnings.push(...(Array.isArray(partial.metadata?.warnings) ? partial.metadata.warnings : []));
  });

  return ensureDocumentAudit(createDocumentModel({
    title,
    sourceFormat,
    blocks,
    assets,
    metadata: {
      warnings,
      chunking: {
        strategy: "line",
        partialCount: partials.length,
      },
    },
  }), {
    content: originalContent,
    reader: sourceFormat,
  });
}

export function compareDocumentModelsForEquivalence(left, right) {
  const differences = [];
  const leftBlocks = (left.blocks || []).map(normalizeBlockForComparison);
  const rightBlocks = (right.blocks || []).map(normalizeBlockForComparison);
  if (JSON.stringify(leftBlocks) !== JSON.stringify(rightBlocks)) {
    differences.push("blocks");
  }
  if ((left.assets || []).length !== (right.assets || []).length) {
    differences.push("assets");
  }
  const leftWarnings = (left.metadata?.warnings || []).map((warning) => `${warning.severity}:${warning.code}`).sort();
  const rightWarnings = (right.metadata?.warnings || []).map((warning) => `${warning.severity}:${warning.code}`).sort();
  if (JSON.stringify(leftWarnings) !== JSON.stringify(rightWarnings)) {
    differences.push("warnings");
  }
  return {
    ok: differences.length === 0,
    differences,
  };
}
