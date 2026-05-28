import { ConversionError } from "../conversion-error.js";

const REQUIRED_FIELDS = ["id", "taskCapabilities", "isAvailable", "recognize"];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateEngineShape(engine) {
  if (!isPlainObject(engine)) {
    throw new ConversionError("OCR engine must be an object.", {
      category: "validate",
      code: "OCR_ENGINE_INVALID",
      details: { reason: "not-an-object" },
    });
  }
  for (const field of REQUIRED_FIELDS) {
    if (engine[field] === undefined || engine[field] === null) {
      throw new ConversionError(`OCR engine missing required field: ${field}`, {
        category: "validate",
        code: "OCR_ENGINE_INVALID",
        details: { reason: "missing-field", field },
      });
    }
  }
  if (typeof engine.id !== "string" || engine.id.trim().length === 0) {
    throw new ConversionError("OCR engine id must be a non-empty string.", {
      category: "validate",
      code: "OCR_ENGINE_INVALID",
      details: { reason: "invalid-id" },
    });
  }
  if (!Array.isArray(engine.taskCapabilities) || engine.taskCapabilities.length === 0) {
    throw new ConversionError("OCR engine taskCapabilities must be a non-empty array.", {
      category: "validate",
      code: "OCR_ENGINE_INVALID",
      details: { reason: "invalid-task-capabilities" },
    });
  }
  if (typeof engine.isAvailable !== "function") {
    throw new ConversionError("OCR engine isAvailable must be a function.", {
      category: "validate",
      code: "OCR_ENGINE_INVALID",
      details: { reason: "invalid-isAvailable" },
    });
  }
  if (typeof engine.recognize !== "function") {
    throw new ConversionError("OCR engine recognize must be a function.", {
      category: "validate",
      code: "OCR_ENGINE_INVALID",
      details: { reason: "invalid-recognize" },
    });
  }
}

export class OCREngineRegistry {
  constructor() {
    this._engines = new Map();
    this._order = [];
    this._listeners = new Set();
  }

  register(engine) {
    validateEngineShape(engine);
    if (this._engines.has(engine.id)) {
      throw new ConversionError(`OCR engine already registered: ${engine.id}`, {
        category: "validate",
        code: "OCR_ENGINE_DUPLICATE",
        details: { engineId: engine.id },
      });
    }
    this._engines.set(engine.id, engine);
    this._order.push(engine.id);
    this._notify({ type: "register", engineId: engine.id });
    return engine;
  }

  unregister(id) {
    if (!this._engines.has(id)) return false;
    this._engines.delete(id);
    this._order = this._order.filter((entry) => entry !== id);
    this._notify({ type: "unregister", engineId: id });
    return true;
  }

  has(id) {
    return this._engines.has(id);
  }

  list() {
    return this._order.map((id) => this._engines.get(id)).filter(Boolean);
  }

  pickById(id) {
    return this._engines.get(id) || null;
  }

  pickForTask(task) {
    const candidates = this.list().filter((engine) => engine.taskCapabilities.includes(task));
    if (candidates.length === 0) return null;
    const available = candidates.find((engine) => {
      try {
        return engine.isAvailable() === true;
      } catch (error) {
        return false;
      }
    });
    if (available) return available;
    return candidates[candidates.length - 1];
  }

  onChange(callback) {
    if (typeof callback !== "function") return () => {};
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  reset() {
    this._engines.clear();
    this._order = [];
    this._notify({ type: "reset" });
  }

  _notify(event) {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (error) {
        // listener errors must not break the registry
      }
    }
  }
}

export const defaultOCRRegistry = new OCREngineRegistry();
