// 规则 diff：在两个 SemanticDoc model（原始 + writer→reader 回读）之间产生
// 字段级差异，输出 qualityReport.ruleDiff 标准结构。属 P9-C 三层检验的第一层。

import { getBlockKey, extractBlockFields, BLOCK_FIELDS_BY_TYPE } from "./block-fingerprint.js";

export const MAJOR_WEIGHT = 0.4;
export const MINOR_WEIGHT = 0.05;
export const STRUCTURAL_PENALTY = 0.5;

const MAJOR_FIELDS = new Set([
  "level",
  "ordered",
  "headers",
  "rows",
  "code",
  "language",
  "src",
  "assetId",
  "format",
]);

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function firstWords(text, count = 8) {
  if (typeof text !== "string") return "";
  return text.trim().split(/\s+/).slice(0, count).join(" ");
}

function blockSnippet(block) {
  if (!block) return "";
  if (typeof block.text === "string") return firstWords(block.text, 12);
  if (typeof block.code === "string") return firstWords(block.code, 12);
  if (Array.isArray(block.items) && block.items.length > 0) return firstWords(block.items[0], 12);
  if (typeof block.alt === "string") return firstWords(block.alt, 12);
  if (typeof block.assetId === "string") return block.assetId;
  if (typeof block.content === "string") return firstWords(block.content, 12);
  return block.type || "";
}

function isWhitespaceOrPunctOnlyDelta(beforeStr, afterStr) {
  if (typeof beforeStr !== "string" || typeof afterStr !== "string") return false;
  const normalize = (value) => value.replace(/[\s\p{P}]+/gu, "").toLowerCase();
  return normalize(beforeStr) === normalize(afterStr);
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!arraysEqual(left, right)) return false;
    } else if (left !== right) {
      return false;
    }
  }
  return true;
}

function classifyFieldSeverity(field, beforeValue, afterValue) {
  if (MAJOR_FIELDS.has(field)) {
    if (field === "headers" || field === "rows") {
      if (Array.isArray(beforeValue) && Array.isArray(afterValue) && beforeValue.length !== afterValue.length) {
        return "major";
      }
    }
    return "major";
  }
  if (field === "text") {
    if (isWhitespaceOrPunctOnlyDelta(beforeValue, afterValue)) return "minor";
    return "major";
  }
  if (typeof beforeValue === "string" && typeof afterValue === "string") {
    if (isWhitespaceOrPunctOnlyDelta(beforeValue, afterValue)) return "minor";
  }
  return "minor";
}

function diffBlockPair(before, after) {
  const fields = BLOCK_FIELDS_BY_TYPE[before?.type] || BLOCK_FIELDS_BY_TYPE[after?.type] || ["type"];
  const fieldsDiffered = [];
  for (const field of fields) {
    const beforeValue = extractBlockFields(before)[field];
    const afterValue = extractBlockFields(after)[field];
    let equal;
    if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
      equal = arraysEqual(beforeValue, afterValue);
    } else {
      equal = beforeValue === afterValue;
    }
    if (!equal) {
      fieldsDiffered.push({
        field,
        severity: classifyFieldSeverity(field, beforeValue, afterValue),
        before: beforeValue,
        after: afterValue,
      });
    }
  }
  return fieldsDiffered;
}

function buildAlignmentKey(block, index) {
  const fields = extractBlockFields(block);
  const head = firstWords(typeof block?.text === "string" ? block.text : (Array.isArray(block?.items) ? block.items[0] || "" : ""));
  return `${fields.type || "?"}|${head}|${index}`;
}

export function diffSemanticDocs(original, readBack) {
  const originalBlocks = Array.isArray(original?.blocks) ? original.blocks : [];
  const readBackBlocks = Array.isArray(readBack?.blocks) ? readBack.blocks : [];

  const originalKeys = originalBlocks.map((block, index) => getBlockKey(block, index));
  const readBackKeys = readBackBlocks.map((block, index) => getBlockKey(block, index));

  const matchedOriginalIdx = new Set();
  const matchedReadBackIdx = new Set();
  const changedBlocks = [];

  for (let i = 0; i < originalBlocks.length; i += 1) {
    const j = readBackKeys.indexOf(originalKeys[i]);
    if (j >= 0 && !matchedReadBackIdx.has(j)) {
      matchedOriginalIdx.add(i);
      matchedReadBackIdx.add(j);
      const fieldsDiffered = diffBlockPair(originalBlocks[i], readBackBlocks[j]);
      if (fieldsDiffered.length > 0) {
        changedBlocks.push({
          id: originalKeys[i],
          type: originalBlocks[i]?.type || "",
          fieldsDiffered,
          severity: fieldsDiffered.some((entry) => entry.severity === "major") ? "major" : "minor",
        });
      }
    }
  }

  // LCS-lite 二次对齐：按 (type, firstWords) 启发匹配剩余块
  for (let i = 0; i < originalBlocks.length; i += 1) {
    if (matchedOriginalIdx.has(i)) continue;
    const heuristic = buildAlignmentKey(originalBlocks[i], i).split("|").slice(0, 2).join("|");
    for (let j = 0; j < readBackBlocks.length; j += 1) {
      if (matchedReadBackIdx.has(j)) continue;
      const candidate = buildAlignmentKey(readBackBlocks[j], j).split("|").slice(0, 2).join("|");
      if (candidate === heuristic) {
        matchedOriginalIdx.add(i);
        matchedReadBackIdx.add(j);
        const fieldsDiffered = diffBlockPair(originalBlocks[i], readBackBlocks[j]);
        if (fieldsDiffered.length > 0) {
          changedBlocks.push({
            id: originalKeys[i],
            type: originalBlocks[i]?.type || "",
            fieldsDiffered,
            severity: fieldsDiffered.some((entry) => entry.severity === "major") ? "major" : "minor",
          });
        }
        break;
      }
    }
  }

  const removedBlocks = [];
  for (let i = 0; i < originalBlocks.length; i += 1) {
    if (matchedOriginalIdx.has(i)) continue;
    removedBlocks.push({
      id: originalKeys[i],
      type: originalBlocks[i]?.type || "",
      snippet: blockSnippet(originalBlocks[i]),
    });
  }

  const addedBlocks = [];
  for (let j = 0; j < readBackBlocks.length; j += 1) {
    if (matchedReadBackIdx.has(j)) continue;
    addedBlocks.push({
      id: readBackKeys[j],
      type: readBackBlocks[j]?.type || "",
      snippet: blockSnippet(readBackBlocks[j]),
    });
  }

  const majorFieldCount = changedBlocks.reduce(
    (sum, entry) => sum + entry.fieldsDiffered.filter((field) => field.severity === "major").length,
    0,
  );
  const minorFieldCount = changedBlocks.reduce(
    (sum, entry) => sum + entry.fieldsDiffered.filter((field) => field.severity === "minor").length,
    0,
  );
  const structuralDelta = addedBlocks.length + removedBlocks.length;
  const denominator = Math.max(1, originalBlocks.length);
  const penalty = MAJOR_WEIGHT * majorFieldCount + MINOR_WEIGHT * minorFieldCount + STRUCTURAL_PENALTY * structuralDelta;
  const overallScore = clamp(1 - penalty / denominator, 0, 1);

  const identical = changedBlocks.length === 0 && addedBlocks.length === 0 && removedBlocks.length === 0;
  let fidelity;
  if (identical) {
    fidelity = "exact";
  } else if (structuralDelta / denominator > 0.3 || readBackBlocks.length === 0) {
    fidelity = "broken";
  } else if (majorFieldCount > 0) {
    fidelity = "major-drift";
  } else {
    fidelity = "minor-drift";
  }

  return {
    identical,
    blockCounts: {
      original: originalBlocks.length,
      readBack: readBackBlocks.length,
      delta: readBackBlocks.length - originalBlocks.length,
    },
    changedBlocks,
    addedBlocks,
    removedBlocks,
    fidelity,
    overallScore,
  };
}
