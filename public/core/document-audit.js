function stableHash(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(8, "0").slice(0, 8);
}

function normalizeNewlines(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function createSourceContext(source) {
  const normalized = normalizeNewlines(source);
  const lineStarts = [0];
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }
  return { normalized, lineStarts };
}

// Issue #123: blockSearchText 生成的搜索文本与 markdown 源语法不匹配
// - list: items.join('\n') 不含 '- ' 标记，多项列表永不匹配源文本
// - table: headers.join(' ') 不含管道符，永不匹配 markdown 表格源
// 导致 table 块 sourceSpan 恒为 null，list 块 endOffset 基于 firstLine 回退推算
// 影响: 无实际消费方（唯一依赖是 smoke-test.js:936 的类型断言）
// 状态: 已知限制，纳入 Phase 6 roadmap，多域模型重构时修复
function blockSearchText(block) {
  if (block.type === "heading" || block.type === "paragraph" || block.type === "quote") return block.text ?? "";
  if (block.type === "code") return block.code ?? "";
  if (block.type === "list") return (block.items ?? []).join("\n");
  if (block.type === "table") return [(block.headers ?? []).join(" "), ...(block.rows ?? []).map((r) => (r ?? []).join(" "))].join("\n");
  if (block.type === "image") return block.alt || block.title || block.src || "";
  if (block.type === "asset") return block.alt || block.title || block.assetId || "";
  if (block.type === "raw") return (block.content ?? "").slice(0, 80);
  return "";
}

function lineForOffset(lineStarts, offset) {
  if (offset < 0) return null;
  let low = 0;
  let high = lineStarts.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (lineStarts[mid] <= offset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function inferSourceSpan(sourceContext, block, cursor) {
  const { normalized: normalizedSource, lineStarts } = sourceContext;
  const needle = normalizeNewlines(blockSearchText(block)).trim();
  if (!needle) {
    return {
      startLine: null,
      endLine: null,
      startOffset: null,
      endOffset: null,
    };
  }
  const firstLine = needle.split("\n").find(Boolean) || needle;
  let startOffset = normalizedSource.indexOf(needle, cursor.offset);
  if (startOffset < 0) {
    startOffset = normalizedSource.indexOf(firstLine, cursor.offset);
  }
  if (startOffset < 0 && cursor.offset === 0) {
    startOffset = normalizedSource.indexOf(firstLine);
  }
  if (startOffset < 0) {
    return {
      startLine: null,
      endLine: null,
      startOffset: null,
      endOffset: null,
    };
  }
  const endOffset = startOffset + Math.max(firstLine.length, needle.length);
  cursor.offset = endOffset;
  return {
    startLine: lineForOffset(lineStarts, startOffset),
    endLine: lineForOffset(lineStarts, endOffset),
    startOffset,
    endOffset,
  };
}

function normalizeWarning(warning) {
  return {
    severity: warning?.severity || "info",
    code: String(warning?.code || "CONVERSION_NOTICE"),
    message: String(warning?.message || ""),
    details: warning?.details || {},
  };
}

function warningSummary(warnings) {
  return warnings.reduce((summary, warning) => {
    summary[warning.severity] = (summary[warning.severity] || 0) + 1;
    return summary;
  }, {});
}

export function ensureDocumentAudit(model, {
  content = "",
  reader = model?.sourceFormat || "",
  writer = "",
  targetFormat = "",
  fileName = "",
  options = {},
} = {}) {
  const cursor = { offset: 0 };
  const sourceContext = createSourceContext(content);
  const metadataWarnings = Array.isArray(model.metadata?.warnings) ? model.metadata.warnings.map(normalizeWarning) : [];
  const layoutSourceFormat = reader || model.sourceFormat || "";
  const sourceHasPageLayout = ["pdf", "docx", "pptx", "ofd", "png"].includes(layoutSourceFormat);
  if (sourceHasPageLayout && targetFormat && !["docx", "pdf", "html"].includes(targetFormat)) {
    metadataWarnings.push({
      severity: "lossy",
      code: "LAYOUT_NOT_SUPPORTED_BY_TARGET",
      message: `${targetFormat} cannot represent the source document's page layout; only text and supported structure are exported.`,
      details: { sourceFormat: layoutSourceFormat, targetFormat },
    });
  }
  const blocks = (model.blocks || []).map((block, index) => {
    const blockWarnings = Array.isArray(block.warnings) ? block.warnings.map(normalizeWarning) : [];
    const identityPayload = JSON.stringify({
      type: block.type,
      text: block.text,
      items: block.items,
      code: block.code,
      headers: block.headers,
      rows: block.rows,
      src: block.src,
      assetId: block.assetId,
      format: block.format,
      content: block.content,
    });
    return {
      ...block,
      id: block.id || `block-${index + 1}-${stableHash(identityPayload)}`,
      sourceSpan: block.sourceSpan || inferSourceSpan(sourceContext, block, cursor),
      warnings: blockWarnings,
    };
  });

  const blockWarnings = blocks.flatMap((block) => block.warnings || []);
  const warnings = [...metadataWarnings, ...blockWarnings]
    .filter((warning, index, all) => all.findIndex((candidate) => candidate.code === warning.code && candidate.message === warning.message) === index);
  const carriesPageLayout = sourceHasPageLayout;
  const hasLayoutLoss = warnings.some((warning) =>
    ["PDF_LAYOUT_HEURISTIC", "DOCX_TABLE_MERGE_APPROXIMATED", "DOCX_NESTED_TABLE_FLATTENED", "PDF_DOCX_LAYOUT_APPROXIMATED", "DOCX_PDF_LAYOUT_APPROXIMATED"].includes(warning.code)
    || (warning.severity === "lossy" && /layout|position|alignment|column|分页|版面|定位|对齐|列宽|合并单元格/i.test(warning.message))
  );

  const assets = (model.assets || []).map((asset) => ({
    ...asset,
    provenance: asset.provenance || {
      sourceFormat: model.sourceFormat || reader || "",
      fileName: fileName || asset.name || "",
      sourceSpan: null,
      role: asset.role || "attachment",
    },
  }));

  const { warnings: _previousWarnings, ...metadataBase } = model.metadata || {};
  const metadata = {
    ...metadataBase,
    conversion: {
      ...(model.metadata?.conversion || {}),
      reader: reader || model.sourceFormat || "",
      writer,
      targetFormat,
      schemaVersion: model.schemaVersion,
      options,
    },
    qualityReport: {
      structureFidelity: warnings.some((warning) => warning.severity === "lossy") ? "medium" : "high",
      tableFidelity: blocks.some((block) => block.type === "table") ? "tracked" : "not-applicable",
      assetFidelity: assets.length > 0 ? "tracked" : "not-applicable",
      // Reader/writer warnings are risk indicators, not proof that output text matches input.
      textFidelity: "unverified",
      layoutFidelity: !carriesPageLayout ? "not-applicable" : hasLayoutLoss ? "low" : "medium",
      warningCount: warnings.length,
      warningsBySeverity: warningSummary(warnings),
      downgradeCount: warnings.filter((warning) => ["lossy", "unsupported"].includes(warning.severity)).length,
    },
    // Keep the audit envelope shape stable even when no warnings exist. This
    // makes the result explicit and avoids consumers inferring audit state from
    // a property that may disappear (issue #189).
    warnings,
  };
  return {
    ...model,
    blocks,
    assets,
    metadata,
  };
}
