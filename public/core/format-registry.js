import { ConversionError } from "./conversion-error.js";
import { ensureDocumentAudit } from "./document-audit.js";
import { defaultRepairEngine } from "./repair-engine.js";
import { runVerificationStage, runVerificationStageAsync } from "./verification/verification-stage.js";
import { createWarning, withWarnings } from "./warnings.js";

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
// RoutePlanner 为产品允许的路径计算温度和强制降级提示；技术可达性不自动
// 扩大用户可选矩阵，避免展示质量尚未达到产品标准的输出。
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

const ROUTE_CLASS_OVERRIDES = {
  "md->pptx": "generated",
  "html->pptx": "generated",
  "json->pptx": "generated",
  "pptx->pptx": "generated",
  // OFD reader 是 L0 占位（仅容器元信息，正文不提取），全部出路标 restricted，
  // 转换前注入 PATH_NOT_RECOMMENDED、landing 徽章显示「受限」（issue #97）。
  "ofd->md": "restricted",
  "ofd->html": "restricted",
  "ofd->txt": "restricted",
  "ofd->json": "restricted",
  "ofd->xml": "restricted",
  "ofd->pdf": "restricted",
};

export function normalizeFormat(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return FORMAT_ALIASES[normalized] || normalized;
}

function repairStatusFromDecision(autoRepair) {
  if (!autoRepair?.attempted) return "not-attempted";
  if (["verified", "degraded", "failed-quality-gate"].includes(autoRepair.finalDecision)) {
    return autoRepair.finalDecision;
  }
  return "pending";
}

// RoutePlanner 维护规范模型 + mapper 图。reader 声明 inputModels（自己产出哪些
// 模型），writer 声明 acceptModels（自己消费哪些模型），mapper 描述模型间的
// 单向转换。getRoute 返回 reader 到 writer 的可执行模型路线和温度。
// 详见 docs/CONVERSION_ROUTING.md。
//
export class RoutePlanner {
  constructor() {
    this.mappers = []; // { name, from, to, fn, lossLevel, forcedWarnings }
  }

  registerMapper({ name, from, to, fn, lossLevel = "low", forcedWarnings = [] }) {
    if (!from || !to) return;
    this.mappers.push({
      name: String(name || `${from}To${to}`),
      from: String(from),
      to: String(to),
      fn: typeof fn === "function" ? fn : null,
      lossLevel: String(lossLevel),
      forcedWarnings: forcedWarnings.map((w) => String(w)),
    });
  }

  // 计算 reader → writer 的路径温度：
  // - hot：同模型，无 mapper
  // - warm：一次 low-loss mapper
  // - cold：经过 medium/high-loss mapper 或多步链
  // 返回 null 表示模型上无法到达。
  getRoute(readerInputModels = [], writerAcceptModels = []) {
    // issue #113 修复：先检查所有 acceptsModels 的直达 hot 路径，
    // 再按 acceptsModels 顺序进行 BFS，但优先选择有可执行 fn 的路径。

    let bestRoute = null;
    let bestRouteHasExecutableFn = false;
    let bestRouteIsHot = false;

    for (const acceptedModel of writerAcceptModels) {
      // 检查直达 hot 路径
      const directModel = readerInputModels.find((model) => model === acceptedModel);
      if (directModel) {
        const route = { temperature: "hot", models: [directModel], mappers: [] };
        // Hot 路径优先，但如果已有可执行的 warm/cold 路径到首选模型，保持首选模型优先
        if (!bestRoute || !bestRouteHasExecutableFn) {
          return route;
        }
        // 如果已有可执行路径到首选模型，但这是 hot 路径，比较是否应该切换
        if (!bestRouteIsHot) {
          bestRoute = route;
          bestRouteIsHot = true;
        }
      }

      // BFS 查找 mapper 路径
      const visited = new Set(readerInputModels);
      const queue = readerInputModels.map((model) => ({ model, models: [model], mappers: [] }));
      while (queue.length > 0) {
        const current = queue.shift();
        for (const mapper of this.mappers) {
          if (mapper.from !== current.model || visited.has(mapper.to)) continue;
          const route = {
            model: mapper.to,
            models: [...current.models, mapper.to],
            mappers: [...current.mappers, mapper],
          };
          if (mapper.to === acceptedModel) {
            const warm = route.mappers.length === 1 && route.mappers[0].lossLevel === "low";
            const fullRoute = {
              temperature: warm ? "warm" : "cold",
              models: route.models,
              mappers: route.mappers,
            };
            const hasExecutableFn = route.mappers.every(m => typeof m.fn === "function");

            // 更新最佳路径的条件：
            // 1. 还没有路径
            // 2. 新路径有可执行 fn 而旧路径没有
            // 3. 都有可执行 fn，但旧路径不是到首选模型（这是第一次遇到的可执行路径）
            if (!bestRoute) {
              bestRoute = fullRoute;
              bestRouteHasExecutableFn = hasExecutableFn;
            } else if (hasExecutableFn && !bestRouteHasExecutableFn) {
              // 新路径可执行，旧路径不可执行，切换到可执行路径
              bestRoute = fullRoute;
              bestRouteHasExecutableFn = true;
              bestRouteIsHot = false;
            } else if (bestRouteHasExecutableFn && hasExecutableFn) {
              // 都可执行，已经是第一个找到的可执行路径，保持不变
            } else if (!bestRouteHasExecutableFn && !hasExecutableFn) {
              // 都不可执行，保持第一个找到的路径
            }

            // 如果找到可执行路径，立即返回（按 acceptsModels 顺序，第一个可执行路径即为最优）
            if (hasExecutableFn) {
              return bestRoute;
            }
            break; // 找到当前 acceptedModel 的路径，跳出 BFS
          }
          visited.add(mapper.to);
          queue.push(route);
        }
      }

      // 如果已找到可执行路径或 hot 路径，不再继续查找后续 acceptedModels
      if (bestRouteHasExecutableFn || bestRouteIsHot) {
        return bestRoute;
      }
    }

    return bestRoute;
  }

  getRouteTemperature(readerInputModels = [], writerAcceptModels = []) {
    return this.getRoute(readerInputModels, writerAcceptModels)?.temperature || null;
  }
}

// P8-M1：产品矩阵 + Planner 双跑。reader/writer 声明规范模型，RoutePlanner
// 用 mapper 图计算真实 route 温度。
export function getAllowedOutputFormats(from) {
  const matrix = PRODUCT_MATRIX_BY_INPUT[normalizeFormat(from)];
  return matrix ? [...matrix] : [];
}

export function getKnownInputFormats() {
  return Object.keys(PRODUCT_MATRIX_BY_INPUT);
}

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
    return {
      ...carrier,
      ...payload,
      metadata: carrier.metadata,
      workbook: carrier.workbook,
      slides: carrier.slides,
      fixedLayout: carrier.fixedLayout,
    };
  }
  return carrier;
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
    this.producesModelsByFormat = new Map();
    this.primaryModelByFormat = new Map();
    this.writerModeByFormat = new Map();
    this.readerMaturityByFormat = new Map();
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
    producesModels = inputModels,
    acceptsModels = outputModels,
    primaryModel = producesModels[0] || "",
    writerMode = "native",
    readerMaturity = "native",
  }) {
    const normalized = normalizeFormat(format);
    const normalizedProducesModels = producesModels.map((model) => String(model));
    const normalizedAcceptsModels = acceptsModels.map((model) => String(model));
    if (typeof read === "function") {
      this.readers.set(normalized, read);
      this.inputModelsByFormat.set(normalized, normalizedProducesModels);
      this.producesModelsByFormat.set(normalized, normalizedProducesModels);
      this.primaryModelByFormat.set(normalized, String(primaryModel));
      this.readerMaturityByFormat.set(normalized, String(readerMaturity));
    }
    if (typeof write === "function") {
      this.writers.set(normalized, write);
      this.acceptModelsByFormat.set(normalized, normalizedAcceptsModels);
      this.writerModeByFormat.set(normalized, String(writerMode));
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
    return this.getRouteDetails(from, to)?.temperature || null;
  }

  getRoute(from, to) {
    const fromFormat = normalizeFormat(from);
    const fromModels = this.primaryModelByFormat.has(fromFormat)
      ? [this.primaryModelByFormat.get(fromFormat)]
      : this.inputModelsByFormat.get(fromFormat);
    const toModels = this.acceptModelsByFormat.get(normalizeFormat(to));
    if (!fromModels || !toModels) return null;
    return this.planner.getRoute(fromModels, toModels);
  }

  getRouteDetails(from, to) {
    const fromFormat = normalizeFormat(from);
    const toFormat = normalizeFormat(to);
    const route = this.getRoute(fromFormat, toFormat);
    if (!route) return null;
    const routeClass = ROUTE_CLASS_OVERRIDES[`${fromFormat}->${toFormat}`]
      || (route.mappers.length > 0 ? "degraded" : "recommended");
    const temperature = routeClass === "generated" && route.temperature === "hot"
      ? "cold"
      : route.temperature;
    return { ...route, routeClass, temperature };
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
      producesModels: this.producesModelsByFormat.get(format) || [],
      acceptsModels: this.acceptModelsByFormat.get(format) || [],
      primaryModel: this.primaryModelByFormat.get(format) || "",
      writerMode: this.writerModeByFormat.get(format) || "native",
      readerMaturity: this.readerMaturityByFormat.get(format) || "native",
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

  prepareConversionModel({ content, from, to, title = "document", fileName = "", options = {} }) {
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

    const model = this.read({ content, from: fromFormat, title, fileName });
    const route = this.getRouteDetails(fromFormat, toFormat);
    let mappedModel = model;
    let routeExecutionActive = true;
    const executedMappers = [];
    for (const mapper of route?.mappers || []) {
      if (!routeExecutionActive || typeof mapper.fn !== "function") {
        routeExecutionActive = false;
        continue;
      }
      const payload = getPayload(mappedModel, mapper.from);
      if (!payload) {
        routeExecutionActive = false;
        continue;
      }
      const mappedPayload = mapper.fn(payload, {
        title,
        sourceFormat: fromFormat,
        defaultSheetName: title,
        includeSheetHeadings: fromFormat !== "csv",
      });
      mappedModel = attachPayload(mappedModel, mapper.to, mappedPayload);
      executedMappers.push(mapper);
    }
    const routeWarnings = [...new Set(executedMappers.flatMap((mapper) => mapper.forcedWarnings))]
      .map((code) => createWarning(
        "lossy",
        code,
        `转换路径 ${fromFormat} -> ${toFormat} 会经过 ${route.temperature} 级模型降级: ${code}.`,
        { from: fromFormat, to: toFormat, routeTemperature: route.temperature }
      ));
    const routeClassWarnings = ["generated", "restricted"].includes(route?.routeClass)
      ? [createWarning(
        "unsupported",
        "PATH_NOT_RECOMMENDED",
        `转换路径 ${fromFormat} -> ${toFormat} 属于 ${route.routeClass} 路径，输出不代表保真互转。`,
        { from: fromFormat, to: toFormat, routeClass: route.routeClass }
      )]
      : [];
    const routedModel = {
      ...mappedModel,
      metadata: withWarnings({
        ...(mappedModel.metadata || {}),
        conversion: {
          ...(mappedModel.metadata?.conversion || {}),
          routeTemperature: route?.temperature || "unknown",
          routeModels: route?.models || [],
          routeClass: route?.routeClass || "recommended",
          executedMappers: executedMappers.map((mapper) => mapper.name),
        },
      }, [...routeWarnings, ...routeClassWarnings]),
    };
    return ensureDocumentAudit(routedModel, {
      content,
      reader: fromFormat,
      writer: toFormat,
      targetFormat: toFormat,
      fileName,
      options,
    });
  }

  _buildRepairCtx({ content, fromFormat, toFormat, title, fileName, options }) {
    return {
      content,
      from: fromFormat,
      to: toFormat,
      title,
      fileName,
      options,
      read: ({ content: readContent, from: readFrom, title: readTitle = "round-trip" }) =>
        this.read({ content: readContent, from: readFrom, title: readTitle }),
      write: ({ model: writeModel, to: writeTo, title: writeTitle, options: writeOptions }) =>
        this.write({ model: writeModel, to: writeTo, title: writeTitle, options: writeOptions }),
      prepareConversionModel: (args) => this.prepareConversionModel(args),
      getAllowedOutputFormats,
      getRouteDetails: (fromArg, toArg) => this.getRouteDetails(fromArg, toArg),
    };
  }

  // 跑 Repair Engine cycle，返回 { earlyReturn } 或 { cycle, effectiveTo, auditedModel }。
  _runRepairCycle({ model, output, ctx, content, fromFormat, toFormat, fileName, options }) {
    let cycle;
    try {
      cycle = defaultRepairEngine.runCycle({ model, output, ctx });
    } catch (error) {
      const repairWarning = createWarning(
        "info",
        "REPAIR_CYCLE_FAILED",
        `Repair cycle skipped due to internal error: ${error?.code || error?.message || "unknown"}.`,
        { cause: error?.code || "unknown" },
      );
      const audited = ensureDocumentAudit({
        ...model,
        metadata: withWarnings(model.metadata || {}, [repairWarning]),
      }, {
        content,
        reader: fromFormat,
        writer: toFormat,
        targetFormat: toFormat,
        fileName,
        options,
      });
      return {
        earlyReturn: {
          ...output,
          quality: {
            qualityReport: audited.metadata?.qualityReport || null,
            modelReview: null,
            autoRepair: { attempted: false, error: error?.code || "unknown", finalDecision: "failed-quality-gate" },
            conversion: audited.metadata?.conversion || null,
          },
        },
      };
    }
    const effectiveTo = cycle.autoRepair?.fallbackUsed ? (cycle.autoRepair.fallbackTo || toFormat) : toFormat;
    // Repair Engine 写自己的 modelReview，但要保留上游 OCR stage 记下的 ocr / ocrQuality
    // 子对象（否则识别质量数据会被覆盖丢失，UI 无法展示）。
    const priorReview = cycle.model.metadata?.modelReview || {};
    const mergedModelReview = {
      ...cycle.modelReview,
      ...(priorReview.ocr ? { ocr: priorReview.ocr } : {}),
      ...(priorReview.ocrQuality ? { ocrQuality: priorReview.ocrQuality } : {}),
    };
    const auditedModel = ensureDocumentAudit({
      ...cycle.model,
      metadata: {
        ...(cycle.model.metadata || {}),
        autoRepair: cycle.autoRepair,
        modelReview: mergedModelReview,
      },
    }, {
      content,
      reader: fromFormat,
      writer: effectiveTo,
      targetFormat: effectiveTo,
      fileName,
      options,
    });
    return { cycle, effectiveTo, auditedModel };
  }

  // 给定 Repair cycle 结果 + verification envelope，组装最终 quality 返回值。
  _assembleQuality({ cycle, effectiveTo, auditedModel, verification, content, fromFormat, fileName, options }) {
    const finalModel = verification.warnings.length > 0
      ? ensureDocumentAudit({
        ...auditedModel,
        metadata: withWarnings(auditedModel.metadata || {}, verification.warnings),
      }, {
        content,
        reader: fromFormat,
        writer: effectiveTo,
        targetFormat: effectiveTo,
        fileName,
        options,
      })
      : auditedModel;

    const baseQualityReport = finalModel.metadata?.qualityReport || {};
    const qualityReport = {
      ...baseQualityReport,
      repairStatus: repairStatusFromDecision(cycle.autoRepair),
      finalDecision: cycle.autoRepair?.finalDecision || "pending",
      ruleDiff: verification.ruleDiff,
      ssim: verification.ssim ?? null,
      ocrReadback: verification.ocrReadback ?? null,
      verification: {
        eligible: verification.eligible,
        reason: verification.reason,
        layers: verification.layers,
        skipped: verification.skipped,
        runtimeMs: verification.runtimeMs,
      },
    };
    return {
      ...cycle.output,
      quality: {
        qualityReport,
        modelReview: finalModel.metadata?.modelReview || null,
        autoRepair: finalModel.metadata?.autoRepair || null,
        conversion: finalModel.metadata?.conversion || null,
      },
    };
  }

  // 同步路径：Repair cycle + 同步验证阶段（仅 rule-diff 层）。
  _wrapWithRepairCycle({ model, output, ctx, content, fromFormat, toFormat, fileName, options }) {
    const cycleResult = this._runRepairCycle({ model, output, ctx, content, fromFormat, toFormat, fileName, options });
    if (cycleResult.earlyReturn) return cycleResult.earlyReturn;
    const { cycle, effectiveTo, auditedModel } = cycleResult;
    const verification = runVerificationStage({ model: auditedModel, output: cycle.output, ctx });
    return this._assembleQuality({ cycle, effectiveTo, auditedModel, verification, content, fromFormat, fileName, options });
  }

  // 异步路径：Repair cycle + 异步验证阶段（rule-diff + SSIM 视觉回环）。
  async _wrapWithRepairCycleAsync({ model, output, ctx, content, fromFormat, toFormat, fileName, options }) {
    const cycleResult = this._runRepairCycle({ model, output, ctx, content, fromFormat, toFormat, fileName, options });
    if (cycleResult.earlyReturn) return cycleResult.earlyReturn;
    const { cycle, effectiveTo, auditedModel } = cycleResult;
    const verification = await runVerificationStageAsync({ model: auditedModel, output: cycle.output, ctx });
    return this._assembleQuality({ cycle, effectiveTo, auditedModel, verification, content, fromFormat, fileName, options });
  }

  // writer 阶段的损失（output.warnings）并回 model.metadata，否则 qualityReport
  // 由写出前的 model 计算，writer 登记的 lossy 损失永远进不了报告（issue #114）。
  _mergeWriterWarnings({ model, output, content, fromFormat, toFormat, fileName, options }) {
    if (!Array.isArray(output?.warnings) || output.warnings.length === 0) return model;
    return ensureDocumentAudit({
      ...model,
      metadata: withWarnings(model.metadata || {}, output.warnings),
    }, { content, reader: fromFormat, writer: toFormat, targetFormat: toFormat, fileName, options });
  }

  // 修复 issue #115: 检查输入是否超过资源预算
  _checkResourceBudget(c, f) {
    const m = this.getCapabilities(f)?.resourceBudget?.maxInputBytes;
    if (!m) return;
    const s = typeof c === "string" ? new Blob([c]).size : (c?.byteLength || c?.size || 0);
    if (s > m) {
      const aMB = (s / 1048576).toFixed(1);
      const lMB = (m / 1048576).toFixed(1);
      throw new ConversionError(`输入文件大小 ${aMB} MB 超过格式 ${f} 的限制 ${lMB} MB`, {
        category: "convert",
        code: "INPUT_BUDGET_EXCEEDED",
        format: f,
        details: { inputBytes: s, maxInputBytes: m, inputMB: aMB, limitMB: lMB }
      });
    }
  }

  convert({ content, from, to, title = "document", fileName = "", options = {} }) {
    const fromFormat = normalizeFormat(from);
    const toFormat = normalizeFormat(to);
    this._checkResourceBudget(content, fromFormat);
    const model = this.prepareConversionModel({ content, from, to, title, fileName, options });
    const output = this.write({ model, to, title, options });
    if (options?.repair === false) {
      return output;
    }
    const ctx = this._buildRepairCtx({ content, fromFormat, toFormat, title, fileName, options });
    const qualityModel = this._mergeWriterWarnings({ model, output, content, fromFormat, toFormat, fileName, options });
    return this._wrapWithRepairCycle({ model: qualityModel, output, ctx, content, fromFormat, toFormat, fileName, options });
  }

  async convertAsync({ content, from, to, title = "document", fileName = "", options = {} }) {
    const fromFormat = normalizeFormat(from);
    const toFormat = normalizeFormat(to);
    const signal = options?.signal;
    this._checkResourceBudget(content, fromFormat);

    // 检查初始取消状态
    if (signal?.aborted) {
      throw new Error("转换已取消");
    }

    let model = this.prepareConversionModel({ content, from, to, title, fileName, options });

    if (options?.ocr?.enabled !== false && fromFormat === "png") {
      if (signal?.aborted) throw new Error("转换已取消");
      const stage = await import("./ocr/ocr-stage.js");
      model = await stage.runOCRStage(model, {
        options,
        from: fromFormat,
        to: toFormat,
        signal,
      });
    } else if (options?.ocr?.enabled !== false && fromFormat === "pdf") {
      if (signal?.aborted) throw new Error("转换已取消");
      const { isScannedPdf } = await import("./ocr/pdf-rasterizer.js");
      const detection = await isScannedPdf(content, options?.ocr || {});
      if (detection.scanned) {
        if (signal?.aborted) throw new Error("转换已取消");
        const stage = await import("./ocr/scan-pdf-stage.js");
        model = await stage.runScannedPdfOCRStage(model, {
          content,
          options,
          from: fromFormat,
          to: toFormat,
          signal,
        });
      }
    }

    if (signal?.aborted) throw new Error("转换已取消");
    const output = this.write({ model, to, title, options });
    if (options?.repair === false) {
      return output;
    }
    const ctx = this._buildRepairCtx({ content, fromFormat, toFormat, title, fileName, options });
    const qualityModel = this._mergeWriterWarnings({ model, output, content, fromFormat, toFormat, fileName, options });
    return this._wrapWithRepairCycleAsync({ model: qualityModel, output, ctx, content, fromFormat, toFormat, fileName, options });
  }
}
