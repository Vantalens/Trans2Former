export function createQueueItem(file, detectedFormat = "") {
  const name = file?.name || "untitled";
  const size = Number(file?.size || 0);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    size,
    format: detectedFormat,
    selected: true,
    status: "queued",
    attempts: 0,
    error: "",
    file: file, // 保留File对象引用以便后续处理
  };
}

export function buildExportFileName({ pattern = "{name}.{ext}", baseName = "document", extension = "txt" } = {}) {
  const safeName = String(baseName || "document")
    .replace(/\.[^.]+$/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .trim() || "document";
  const safeExt = String(extension || "txt").replace(/^\.+/g, "") || "txt";
  const safeDate = new Date().toISOString().slice(0, 10);
  const rendered = String(pattern || "{name}.{ext}")
    .replaceAll("{name}", safeName)
    .replaceAll("{ext}", safeExt)
    .replaceAll("{date}", safeDate);
  return rendered.includes(".") ? rendered : `${rendered}.${safeExt}`;
}

export function summarizeQualityReport(model) {
  const report = model?.metadata?.qualityReport || {};
  return {
    warningCount: Number(report.warningCount || model?.metadata?.warnings?.length || 0),
    structureFidelity: report.structureFidelity || "unknown",
    assetFidelity: report.assetFidelity || "unknown",
    textFidelity: report.textFidelity || "unknown",
  };
}
