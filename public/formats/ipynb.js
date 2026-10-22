import { ConversionError } from "../core/conversion-error.js";
import { createCodeBlock, createDocumentModel, createParagraph } from "../core/document-model.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { readMarkdown, writeMarkdown } from "./markdown.js";

// Jupyter Notebook（nbformat 4.x）：本质是 JSON。markdown cell 走 Markdown reader
// 进入 DocumentModel，code cell 映射为 code block，文本类输出（stream/error）
// 附带为 language="output" 的 code block。写出时重建合法 nbformat 4.5 结构。

function normalizeSource(source) {
  if (Array.isArray(source)) return source.join("");
  return String(source ?? "");
}

function outputText(output) {
  if (!output || typeof output !== "object") return "";
  if (output.output_type === "stream") return normalizeSource(output.text);
  if (output.output_type === "error") {
    const trace = Array.isArray(output.traceback) ? output.traceback.join("\n") : "";
    return [output.ename, output.evalue, trace].filter(Boolean).join("\n");
  }
  if (output.output_type === "execute_result" || output.output_type === "display_data") {
    const plain = output.data?.["text/plain"];
    if (plain !== undefined) return normalizeSource(plain);
  }
  return "";
}

// 剥离 Jupyter 输出里常见的 ANSI 颜色转义，避免控制字符进入正文。
function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, "");
}

export function readIpynb({ content, title = "document", format = "ipynb" }) {
  let notebook;
  try {
    notebook = JSON.parse(String(content ?? ""));
  } catch (error) {
    throw new ConversionError("IPYNB 解析失败：输入不是有效的 JSON 文档", {
      category: "parse",
      code: "IPYNB_PARSE_ERROR",
      format,
      cause: error,
    });
  }
  if (!notebook || typeof notebook !== "object" || !Array.isArray(notebook.cells)) {
    throw new ConversionError("IPYNB 解析失败：缺少 cells 数组，不是合法的 notebook 文档", {
      category: "parse",
      code: "IPYNB_SCHEMA_ERROR",
      format,
    });
  }
  const nbformat = Number(notebook.nbformat) || 4;
  if (nbformat < 4) {
    throw new ConversionError(`IPYNB 解析失败：nbformat ${notebook.nbformat} 过旧，仅支持 4.x`, {
      category: "parse",
      code: "IPYNB_VERSION_UNSUPPORTED",
      format,
    });
  }

  const warnings = [];
  const language = notebook.metadata?.language_info?.name
    || notebook.metadata?.kernelspec?.language
    || "python";
  const blocks = [];
  let includedOutputs = 0;
  let droppedCells = 0;

  for (const cell of notebook.cells) {
    const source = normalizeSource(cell?.source);
    if (cell?.cell_type === "markdown") {
      const parsed = readMarkdown({ content: source, title, format: "md" });
      blocks.push(...parsed.blocks);
      continue;
    }
    if (cell?.cell_type === "code") {
      if (source.trim() !== "") {
        blocks.push(createCodeBlock(source.replace(/\n$/, ""), language));
      }
      const outputs = (Array.isArray(cell.outputs) ? cell.outputs : [])
        .map((output) => stripAnsi(outputText(output)).trimEnd())
        .filter((text) => text.trim() !== "");
      if (outputs.length > 0) {
        blocks.push(createCodeBlock(outputs.join("\n\n"), "output"));
        includedOutputs += outputs.length;
      }
      continue;
    }
    if (cell?.cell_type === "raw") {
      if (source.trim() !== "") blocks.push(createParagraph(source));
      continue;
    }
    droppedCells += 1;
  }

  if (includedOutputs > 0) {
    warnings.push(createWarning(
      "info",
      "IPYNB_OUTPUTS_INCLUDED",
      `已附带 ${includedOutputs} 段代码单元格文本输出（language="output" 代码块）。`,
      { outputCount: includedOutputs },
    ));
  }
  if (droppedCells > 0) {
    warnings.push(createWarning(
      "lossy",
      "IPYNB_UNKNOWN_CELLS_DROPPED",
      `${droppedCells} 个未知类型单元格未导入。`,
      { droppedCells },
    ));
  }
  if (blocks.length === 0) blocks.push(createParagraph("(empty notebook)"));

  return createDocumentModel({
    title,
    sourceFormat: format,
    blocks,
    metadata: withWarnings({
      ipynb: {
        nbformat,
        nbformatMinor: Number(notebook.nbformat_minor) || 0,
        language,
        cellCount: notebook.cells.length,
      },
    }, warnings),
  });
}

function sourceLines(text) {
  const lines = String(text).split("\n");
  return lines.map((line, index) => (index < lines.length - 1 ? `${line}\n` : line));
}

export function writeIpynb({ model, title = model.title }) {
  const cells = [];
  for (const block of model.blocks || []) {
    if (block.type === "code" && block.language !== "output") {
      cells.push({
        cell_type: "code",
        execution_count: null,
        id: undefined,
        metadata: {},
        outputs: [],
        source: sourceLines(block.code),
      });
      continue;
    }
    if (block.type === "code" && block.language === "output") {
      // 上一轮导入的输出块：写回为 markdown 引用，避免伪造执行结果
      cells.push({
        cell_type: "markdown",
        metadata: {},
        source: sourceLines(`\`\`\`text\n${block.code}\n\`\`\``),
      });
      continue;
    }
    if (block.type === "image" || block.type === "asset") {
      cells.push({
        cell_type: "markdown",
        metadata: {},
        source: sourceLines(`![${block.alt || block.title || "image"}](${block.src || block.assetId || ""})`),
      });
      continue;
    }
    if (block.type === "raw") continue;
    const markdown = writeMarkdown({
      model: createDocumentModel({ title, sourceFormat: model.sourceFormat, blocks: [block] }),
    }).data.trim();
    if (markdown === "") continue;
    cells.push({
      cell_type: "markdown",
      metadata: {},
      source: sourceLines(markdown),
    });
  }

  // JSON.stringify 默认丢弃 undefined；上面 code cell 的 id: undefined 仅为占位说明
  for (const cell of cells) delete cell.id;

  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python" },
      title: String(title || "document"),
    },
    cells,
  };
  return {
    type: "text",
    format: "ipynb",
    data: `${JSON.stringify(notebook, null, 2)}\n`,
    mime: "application/x-ipynb+json;charset=utf-8",
  };
}
