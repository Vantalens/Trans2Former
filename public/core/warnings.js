export const WARNING_SEVERITIES = Object.freeze(["info", "lossy", "unsupported", "security", "performance"]);

export function createWarning(severity, code, message, details = {}) {
  const normalizedSeverity = WARNING_SEVERITIES.includes(severity) ? severity : "info";
  return {
    severity: normalizedSeverity,
    code: String(code || "CONVERSION_NOTICE"),
    message: String(message || ""),
    details,
  };
}

export function withWarnings(metadata = {}, warnings = []) {
  const normalizedWarnings = warnings.filter(Boolean);
  if (normalizedWarnings.length === 0) {
    return metadata;
  }
  return {
    ...metadata,
    warnings: [...(Array.isArray(metadata.warnings) ? metadata.warnings : []), ...normalizedWarnings],
  };
}
