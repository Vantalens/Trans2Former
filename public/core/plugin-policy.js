const ALLOWED_KINDS = new Set(["format-plugin", "optional-plugin", "local-model-plugin"]);
const ALLOWED_PERMISSIONS = new Set([
  "install-network",
  "cache-plugin",
  "process-document",
  "read-assets",
  "write-output",
]);
const INSTALL_ALLOWED = new Set(["install-network", "cache-plugin"]);
const PROCESSING_ALLOWED = new Set(["process-document", "read-assets", "write-output"]);
const RESOURCE_LIMITS = {
  "format-plugin": { downloadBytes: 10_000_000, maxRuntimeMemoryMb: 1024 },
  "optional-plugin": { downloadBytes: 50_000_000, maxRuntimeMemoryMb: 2048 },
  "local-model-plugin": { downloadBytes: 500_000_000, maxRuntimeMemoryMb: 4096 },
};

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(String(value || ""));
}

function normalizeManifest(manifest) {
  return {
    ...manifest,
    permissions: Array.isArray(manifest?.permissions) ? manifest.permissions : [],
    formats: Array.isArray(manifest?.formats) ? manifest.formats : [],
    resources: manifest?.resources || {},
    security: manifest?.security || {},
    install: manifest?.install || {},
  };
}

export function classifyPluginResourceTier(manifest) {
  return ALLOWED_KINDS.has(manifest?.kind) ? manifest.kind : "optional-plugin";
}

export function validatePluginManifest(input) {
  const manifest = normalizeManifest(input);
  const errors = [];

  if (manifest.schemaVersion !== "trans2former.plugin.v1") errors.push("schemaVersion must be trans2former.plugin.v1");
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(String(manifest.id || ""))) errors.push("id must be kebab-case and 3-64 chars");
  if (!manifest.name || typeof manifest.name !== "string") errors.push("name must be a string");
  if (!isSemver(manifest.version)) errors.push("version must be semver");
  if (!ALLOWED_KINDS.has(manifest.kind)) errors.push("kind must be format-plugin, optional-plugin, or local-model-plugin");
  if (!manifest.entry || typeof manifest.entry !== "string") errors.push("entry must be a string");

  if (manifest.formats.length === 0) {
    errors.push("formats must declare at least one format capability");
  }
  manifest.formats.forEach((format, index) => {
    if (!isObject(format)) {
      errors.push(`formats[${index}] must be an object`);
      return;
    }
    if (!/^[a-z0-9][a-z0-9+-]*$/.test(String(format.format || ""))) errors.push(`formats[${index}].format is invalid`);
    if (typeof format.canRead !== "boolean") errors.push(`formats[${index}].canRead must be boolean`);
    if (typeof format.canWrite !== "boolean") errors.push(`formats[${index}].canWrite must be boolean`);
  });

  for (const permission of manifest.permissions) {
    if (!ALLOWED_PERMISSIONS.has(permission)) {
      errors.push(`permission is not allowed: ${permission}`);
    }
  }

  if (manifest.permissions.includes("remote-api")) {
    errors.push("remote-api is never allowed");
  }
  if (manifest.security.installMode !== "network-only-no-documents") {
    errors.push("security.installMode must be network-only-no-documents");
  }
  if (manifest.security.processingMode !== "local-only-no-network") {
    errors.push("security.processingMode must be local-only-no-network");
  }

  const tier = classifyPluginResourceTier(manifest);
  const limits = RESOURCE_LIMITS[tier];
  const downloadBytes = Number(manifest.resources.downloadBytes);
  const maxRuntimeMemoryMb = Number(manifest.resources.maxRuntimeMemoryMb);
  if (!Number.isFinite(downloadBytes) || downloadBytes < 0) errors.push("resources.downloadBytes must be a non-negative number");
  if (!Number.isFinite(maxRuntimeMemoryMb) || maxRuntimeMemoryMb < 0) errors.push("resources.maxRuntimeMemoryMb must be a non-negative number");
  if (downloadBytes > limits.downloadBytes) errors.push(`${tier} downloadBytes exceeds budget`);
  if (maxRuntimeMemoryMb > limits.maxRuntimeMemoryMb) errors.push(`${tier} maxRuntimeMemoryMb exceeds budget`);

  if (!/^[a-f0-9]{64}$/i.test(String(manifest.integrity?.sha256 || ""))) {
    errors.push("integrity.sha256 must be a 64 char hex sha256");
  }
  if (!manifest.fallback?.code || !manifest.fallback?.message) {
    errors.push("fallback.code and fallback.message are required");
  }
  if (manifest.kind === "local-model-plugin") {
    if (manifest.install.manual !== true) errors.push("local-model-plugin must be manually installed");
    if (manifest.install.removable !== true) errors.push("local-model-plugin must be removable");
    if (manifest.permissions.includes("install-network")) errors.push("local-model-plugin must not require install-network by default");
  }

  return {
    ok: errors.length === 0,
    errors,
    manifest,
  };
}

export function assertPluginModeAllows(manifest, mode, permission) {
  const result = validatePluginManifest(manifest);
  if (!result.ok) {
    throw new Error(`Invalid plugin manifest: ${result.errors.join("; ")}`);
  }
  const allowed = mode === "install" ? INSTALL_ALLOWED : PROCESSING_ALLOWED;
  if (!allowed.has(permission)) {
    throw new Error(`${mode} mode forbids ${permission}`);
  }
  if (!manifest.permissions.includes(permission)) {
    throw new Error(`Plugin does not declare ${permission}`);
  }
  return true;
}

export async function computeSha256Hex(bytes) {
  const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset || 0, (bytes.byteOffset || 0) + bytes.byteLength);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyPluginIntegrity(manifest, bytes) {
  const expected = String(manifest?.integrity?.sha256 || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    return false;
  }
  return (await computeSha256Hex(bytes)) === expected;
}

export function getPluginModePolicy(mode) {
  if (mode === "install") {
    return {
      mode,
      allowedPermissions: [...INSTALL_ALLOWED],
      canAccessDocuments: false,
      canUseNetwork: true,
    };
  }
  if (mode === "processing") {
    return {
      mode,
      allowedPermissions: [...PROCESSING_ALLOWED],
      canAccessDocuments: true,
      canUseNetwork: false,
    };
  }
  throw new Error(`Unknown plugin mode: ${mode}`);
}
