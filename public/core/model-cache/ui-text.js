import { MODEL_TASKS } from "./manifest.js";

export const FIRST_ENABLE_HINTS = Object.freeze({
  "ocr-text": "首次启用文字 OCR 时会从本地导入识别模型资源到 model-cache，下载完成后所有识别全部在本机执行。",
  "ocr-layout": "首次启用版面分析时需要本地导入对应模型资源；resource 路径与体积会在确认前展示。",
  "ocr-table": "首次启用表格恢复时需要本地导入表格识别模型；完成 checksum 校验后才会激活该路径。",
  "quality-reviewer": "首次启用质量审核模型时本地导入模型资源，所有审核动作仅生成结构化 RepairAction，不直接替换文件字节。",
});

export const OFFLINE_FALLBACK_HINTS = Object.freeze({
  "ocr-text": "离线或模型缺失时，文字 OCR 路径不可用；基础文本提取保留，结果会附带 OCR_UNAVAILABLE warning。",
  "ocr-layout": "离线或模型缺失时，版面恢复退化为坐标启发式，输出会标注 LAYOUT_DEGRADED。",
  "ocr-table": "离线或模型缺失时，表格恢复跳过模型增强，仅保留确定性 reader 结果。",
  "quality-reviewer": "离线或模型缺失时，Repair Engine 仅运行规则驱动 validator，模型审核结果留空。",
});

export const CLEAR_CACHE_HINTS = Object.freeze({
  "ocr-text": "清理后下次启用 OCR 时需要重新导入模型资源。已生成的转换结果不受影响。",
  "ocr-layout": "清理版面模型不会影响已完成的转换；后续版面恢复将退回坐标启发式。",
  "ocr-table": "清理表格模型后再次启用时需要重新导入资源；不影响历史输出。",
  "quality-reviewer": "清理质量审核模型后，Repair Engine 仅保留规则驱动 validator；下次启用前不再有模型审核证据。",
});

const STATUS_LABELS = Object.freeze({
  "not-downloaded": "未启用",
  "importing": "导入中",
  "verifying": "校验中",
  "available": "已就绪",
  "degraded": "降级",
  "disabled": "已禁用",
});

const TASK_LABELS = Object.freeze({
  "ocr-text": "文字 OCR",
  "ocr-layout": "版面分析",
  "ocr-table": "表格恢复",
  "quality-reviewer": "质量审核",
});

export function getFirstEnableHint(task) {
  return FIRST_ENABLE_HINTS[task] || "首次启用时本地导入模型资源到 model-cache，下载完成后在本机执行。";
}

export function getOfflineFallbackHint(task) {
  return OFFLINE_FALLBACK_HINTS[task] || "离线或模型缺失时，对应能力按 fallback 策略降级或跳过。";
}

export function getClearCacheHint(task) {
  return CLEAR_CACHE_HINTS[task] || "清理后下次启用时需要重新导入模型资源。";
}

export function getStatusLabel(status) {
  return STATUS_LABELS[status] || status || "未知";
}

export function getTaskLabel(task) {
  return TASK_LABELS[task] || task || "未命名任务";
}

export function listKnownTaskLabels() {
  return MODEL_TASKS.map((task) => ({ task, label: getTaskLabel(task) }));
}
