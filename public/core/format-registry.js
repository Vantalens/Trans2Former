import { ConversionError } from "./conversion-error.js";
import { ensureDocumentAudit } from "./document-audit.js";

const FORMAT_ALIASES = {
  markdown: "md",
  mdown: "md",
  mkd: "md",
  htm: "html",
  text: "txt",
  plain: "txt",
  plaintext: "txt",
};

// 产品矩阵：哪些路径在 UI 上推荐用户使用，按"语义合理"维度筛选。
// 模型可达性由 RoutePlanner 单独计算，最终允许的路径是两者交集。
// P8-M1 阶段保留产品矩阵硬编码；P8-M3/M4 模型分家后逐步把可达路径从 Planner
// 自动派生，把"是否推荐"独立出来作为 capability flag。
const PRODUCT_MATRIX_BY_INPUT = {
  md: ["md", "html", "txt", "json", "csv", "xml", "docx", "xlsx", "pdf", "epub", "pptx"],
  html: ["md", "html", "txt", "json", "csv", "xml", "docx", "xlsx", "pdf", "epub", "pptx"],
  txt: ["md", "html", "txt", "json", "xml", "docx", "pdf", "epub"],
  json: ["md", "html", "txt", "json", "csv", "xml", "docx", "xlsx", "pdf", "epub", "pptx"],
  xml: ["md", "html", "txt", "json", "xml", "pdf"],
  csv: ["md", "csv", "xlsx", "html", "txt", "json", "xml", "pdf"],
  xlsx: ["md", "csv", "xlsx", "html", "txt", "json", "xml", "pdf"],
  doc: ["md", "html", "txt", "json", "xml", "docx", "pdf"],
  docx: ["md", "html", "txt", "json", "xml", "docx", "pdf"],
  epub: ["md", "html", "txt", "json", "xml", "docx", "pdf", "epub"],
  pdf: ["md", "html", "txt", "json", "xml", "docx", "pdf"],
  pptx: ["md", "html", "txt", "json", "xml", "pdf", "pptx"],
  png: ["html", "txt", "json", "pdf"],
  ofd: ["md", "html", "txt", "json", "xml", "pdf"],
};

export function normalizeFormat(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return FORMAT_ALIASES[normalized] || normalized;
}

// RoutePlanner 维护规范模型 + mapper 图。reader 声明 inputModels（自己产出哪些
// 模型），writer 声明 acceptModels（自己消费哪些模型），mapper 描述模型间的
// 单向转换。getReachableModels 从 reader 出发 BFS 走 mapper 到所有可达模型，
// canReachWriter 判断 writer 是否能消费其中一个。详见 docs/CONVERSION_ROUTING.md。
//
export class RoutePlanner {
  constructor() {
    this.mappers = []; // { from, to, lossLevel, forcedWarnings }
  }

  registerMapper({ from, to, lossLevel = "low", forcedWarnings = [] }) {
    if (!from || !to) return;
    this.mappers.push({
      from: String(from),
      to: String(to),
      lossLevel: String(lossLevel),
      forcedWarnings: forcedWarnings.map((w) => String(w)),
    });
  }

  getReachableModels(seedModels) {
    const reachable = new Set(seedModels);
    const queue = [...seedModels];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const mapper of this.mappers) {
        if (mapper.from === current && !reachable.has(mapper.to)) {
          reachable.add(mapper.to);
          queue.push(mapper.to);
        }
      }
    }
    return reachable;
  }

  // 计算 reader → writer 的路径温度：
  // - hot：同模型，无 mapper
  // - warm：一次 low-loss mapper
  // - cold：经过 medium/high-loss mapper 或多步链
  // 返回 null 表示模型上无法到达。
  getRouteTemperature(readerInputModels = [], writerAcceptModels = []) {
    const accepted = new Set(writerAcceptModels);
    if (readerInputModels.some((m) => accepted.has(m))) return "hot";
    let warmCandidate = false;
    for (const seed of readerInputModels) {
      for (const mapper of this.mappers) {
        if (mapper.from === seed && accepted.has(mapper.to)) {
          if (mapper.lossLevel === "low") return "warm";
          warmCandidate = true;
        }
      }
    }
    const reachable = this.getReachableModels(readerInputModels);
    if (writerAcceptModels.some((m) => reachable.has(m))) {
      return warmCandidate ? "cold" : "cold";
    }
    return null;
  }
}

// P8-M1：产品矩阵 + Planner 双跑。当前阶段所有 reader/writer 默认走 SemanticDoc，
// P8-M3/M4 拆出 WorkbookModel/SlideModel/FixedLayoutModel 后逐步迁移并打开
// canReachWriter 校验。
export function getAllowedOutputFormats(from) {
  return [...(PRODUCT_MATRIX_BY_INPUT[normalizeFormat(from)] || [])];
}

export class ConverterRegistry {
  constructor() {
    this.readers = new Map();
    this.writers = new Map();
    this.extensions = new Map();
    this.mimes = new Map();
    this.labels = new Map();
    this.notes = new Map();
    this.inputModelsByFormat = new Map();
    this.acceptModelsByFormat = new Map();
    this.planner = new RoutePlanner();
  }

  registerFormat(format, {
    read,
    write,
    extension = format,
    mime = "text/plain;charset=utf-8",
    label = format,
    note = "",
    qualityGrade = "basic",
    warnings = [],
    resourceBudget = {},
    degradation = "",
    inputModels = ["SemanticDoc"],
    outputModels = ["SemanticDoc"],
  }) {
    const normalized = normalizeFormat(format);
    if (typeof read === "function") {
      this.readers.set(normalized, read);
      this.inputModelsByFormat.set(normalized, inputModels.map((m) => String(m)));
    }
    if (typeof write === "function") {
      this.writers.set(normalized, write);
      this.acceptModelsByFormat.set(normalized, outputModels.map((m) => String(m)));
    }
    this.extensions.set(normalized, extension);
    this.mimes.set(normalized, mime);
    this.labels.set(normalized, label);
    this.notes.set(normalized, note);
    this.capabilityDetails ??= new Map();
    this.capabilityDetails.set(normalized, {
      qualityGrade,
      warnings: warnings.map((warning) => String(warning)),
      resourceBudget: {
        maxInputBytes: Number(resourceBudget.maxInputBytes) || 10 * 1024 * 1024,
        maxRuntimeMemoryMb: Number(resourceBudget.maxRuntimeMemoryMb) || 256,
      },
      degradation: String(degradation || note || "No degradation note yet."),
    });
  }

  registerMapper(mapper) {
    this.planner.registerMapper(mapper);
  }

  getRouteTemperature(from, to) {
    const fromFormat = normalizeFormat(from);
    const toFormat = normalizeFormat(to);
    const fromModels = this.inputModelsByFormat.get(fromFormat);
    const toModels = this.acceptModelsByFormat.get(toFormat);
    if (!fromModels || !toModels) return null;
    return this.planner.getRouteTemperature(fromModels, toModels);
  }

  isModelReachable(from, to) {
    return this.getRouteTemperature(from, to) !== null;
  }

  listFormats() {
    return {
      input: [...this.readers.keys()],
      output: [...this.writers.keys()],
    };
  }

  canRead(format) {
    return this.readers.has(normalizeFormat(format));
  }

  canWrite(format) {
    return this.writers.has(normalizeFormat(format));
  }

  getOutputExtension(format) {
    return this.extensions.get(normalizeFormat(format)) || "out";
  }

  getCapabilities() {
    const formats = new Set([...this.readers.keys(), ...this.writers.keys()]);
    return [...formats].map((format) => ({
      format,
      label: this.labels.get(format) || format,
      canRead: this.canRead(format),
      canWrite: this.canWrite(format),
      extension: this.getOutputExtension(format),
      mime: this.mimes.get(format) || "application/octet-stream",
      note: this.notes.get(format) || "",
      inputModels: this.inputModelsByFormat.get(format) || [],
      outputModels: this.acceptModelsByFormat.get(format) || [],
      ...(this.capabilityDetails?.get(format) || {}),
    }));
  }

  read({ content, from, title = "document", fileName = "" }) {
    const fromFormat = normalizeFormat(from);
    const reader = this.readers.get(fromFormat);
    if (!reader) {
      throw new ConversionError(`输入格式不支持: ${fromFormat || "(empty)"}`, {
        category: "convert",
        code: "UNSUPPORTED_INPUT_FORMAT",
        format: fromFormat,
      });
    }
    const model = reader({ content, title, fileName, format: fromFormat });
    return ensureDocumentAudit(model, {
      content,
      reader: fromFormat,
      fileName,
    });
  }

  write({ model, to, title = model?.title || "document", options = {} }) {
    const toFormat = normalizeFormat(to);
    const writer = this.writers.get(toFormat);
    if (!writer) {
      throw new ConversionError(`输出格式不支持: ${toFormat || "(empty)"}`, {
        category: "convert",
        code: "UNSUPPORTED_OUTPUT_FORMAT",
        format: toFormat,
      });
    }
    const auditedModel = ensureDocumentAudit(model, {
      writer: toFormat,
      targetFormat: toFormat,
    });
    return writer({ model: auditedModel, title, format: toFormat, options });
  }

  convert({ content, from, to, title = "document", fileName = "", options = {} }) {
    const fromFormat = normalizeFormat(from);
    const toFormat = normalizeFormat(to);
    if (!this.writers.has(toFormat)) {
      throw new ConversionError(`输出格式不支持: ${toFormat || "(empty)"}`, {
        category: "convert",
        code: "UNSUPPORTED_OUTPUT_FORMAT",
        format: toFormat,
      });
    }
    if (!getAllowedOutputFormats(fromFormat).includes(toFormat)) {
      throw new ConversionError(`不支持此转换路径: ${fromFormat || "(empty)"} -> ${toFormat || "(empty)"}`, {
        category: "convert",
        code: "UNSUPPORTED_CONVERSION_PATH",
        format: `${fromFormat}->${toFormat}`,
      });
    }
    const model = this.read({ content, from, title, fileName });
    return this.write({ model, to, title, options });
  }
}
