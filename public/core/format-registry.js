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

export function normalizeFormat(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return FORMAT_ALIASES[normalized] || normalized;
}

export class ConverterRegistry {
  constructor() {
    this.readers = new Map();
    this.writers = new Map();
    this.extensions = new Map();
    this.mimes = new Map();
    this.labels = new Map();
    this.notes = new Map();
  }

  registerFormat(format, { read, write, extension = format, mime = "text/plain;charset=utf-8", label = format, note = "" }) {
    const normalized = normalizeFormat(format);
    if (typeof read === "function") {
      this.readers.set(normalized, read);
    }
    if (typeof write === "function") {
      this.writers.set(normalized, write);
    }
    this.extensions.set(normalized, extension);
    this.mimes.set(normalized, mime);
    this.labels.set(normalized, label);
    this.notes.set(normalized, note);
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
    const model = this.read({ content, from, title, fileName });
    return this.write({ model, to, title, options });
  }
}
