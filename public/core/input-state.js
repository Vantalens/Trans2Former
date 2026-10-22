export function isBinaryInputFormat(format, binaryFormats) {
  return binaryFormats.has(String(format || "").toLowerCase());
}

export function createReadableInputDisplay({
  rawContent,
  format,
  fileName,
  binaryFormats,
  toDocumentModel,
  getPlainText,
  model: suppliedModel = null,
}) {
  if (!isBinaryInputFormat(format, binaryFormats)) {
    return String(rawContent ?? "");
  }
  try {
    const model = suppliedModel || toDocumentModel(rawContent, format, fileName);
    const text = getPlainText(model).trim();
    if (text) {
      return text;
    }
    const assetCount = Array.isArray(model.assets) ? model.assets.length : 0;
    return `${String(format).toUpperCase()} 文件已读取。未抽取到正文文本${assetCount ? `，包含 ${assetCount} 个资源` : ""}。`;
  } catch (error) {
    return `${String(format).toUpperCase()} 文件已读取，但可读预览解析失败：${error.message}`;
  }
}

export function shouldUseLargeTextPreview({ format, contentLength, threshold, binaryFormats }) {
  return !isBinaryInputFormat(format, binaryFormats) && contentLength >= threshold;
}
