import {
  assertPluginModeAllows,
  getPluginModePolicy,
  validatePluginManifest,
  verifyPluginIntegrity,
} from "./plugin-policy.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getReleaseUrl(manifest) {
  return manifest.releaseUrl || manifest.distribution?.releaseUrl || "";
}

export function createPluginRecord(manifest, { integrityVerified = false, source = "local-import" } = {}) {
  const validation = validatePluginManifest(manifest);
  if (!validation.ok) {
    throw new Error(`Invalid plugin manifest: ${validation.errors.join("; ")}`);
  }
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    kind: manifest.kind,
    status: integrityVerified ? "installed" : "blocked",
    enabled: false,
    source,
    releaseUrl: getReleaseUrl(manifest),
    manifest: clone(manifest),
    integrityVerified,
    capabilities: discoverPluginCapabilities({ manifest }),
    rollback: [{ version: manifest.version, manifest: clone(manifest) }],
    lastError: "",
  };
}

export function openPluginRelease(manifest, { openExternal = globalThis.open, documentContext = null } = {}) {
  const policy = getPluginModePolicy("install");
  assertPluginModeAllows(manifest, "install", "install-network");
  const releaseUrl = getReleaseUrl(manifest);
  if (!releaseUrl) {
    throw new Error("Plugin releaseUrl is required");
  }
  if (typeof openExternal === "function") {
    openExternal(releaseUrl, "_blank", "noopener,noreferrer");
  }
  return {
    mode: "install",
    canAccessDocuments: policy.canAccessDocuments,
    canUseNetwork: policy.canUseNetwork,
    documentFieldsRead: documentContext ? [] : [],
    releaseUrl,
  };
}

export async function importLocalPluginPackage({ manifest, bytes }) {
  const validation = validatePluginManifest(manifest);
  if (!validation.ok) {
    throw new Error(`Plugin manifest rejected: ${validation.errors.join("; ")}`);
  }
  if (!await verifyPluginIntegrity(manifest, bytes)) {
    throw new Error("Plugin integrity check failed");
  }
  return createPluginRecord(manifest, { integrityVerified: true });
}

export function setPluginEnabled(record, enabled) {
  if (enabled && !record.integrityVerified) {
    throw new Error("Plugin cannot be enabled until integrity is verified");
  }
  return {
    ...record,
    enabled: Boolean(enabled),
    status: enabled ? "enabled" : "disabled",
  };
}

export function uninstallPlugin(record) {
  return {
    ...record,
    enabled: false,
    status: "uninstalled",
  };
}

export function rollbackPlugin(record) {
  const previous = record.rollback?.[0];
  if (!previous) {
    throw new Error("No rollback version is available");
  }
  return createPluginRecord(previous.manifest, {
    integrityVerified: record.integrityVerified,
    source: record.source,
  });
}

export function discoverPluginCapabilities(record) {
  const manifest = record.manifest || record;
  const policy = getPluginModePolicy("processing");
  return (manifest.formats || []).map((format) => ({
    pluginId: manifest.id,
    pluginName: manifest.name,
    format: format.format,
    canRead: Boolean(format.canRead),
    canWrite: Boolean(format.canWrite),
    kind: manifest.kind,
    mode: manifest.security?.processingMode || "local-only-no-network",
    permissions: (manifest.permissions || []).filter((permission) => policy.allowedPermissions.includes(permission)),
    resources: manifest.resources || {},
    fallback: manifest.fallback || null,
  }));
}

function createBlockedNetwork() {
  return {
    request() {
      const error = new Error("Plugin processing mode forbids network access");
      error.code = "PLUGIN_NETWORK_BLOCKED";
      throw error;
    },
  };
}

export async function runPluginProcessingTask(record, { input, execute }) {
  if (!record.enabled) {
    return {
      ok: false,
      error: { code: "PLUGIN_DISABLED", message: "Plugin is disabled." },
      fallback: record.manifest?.fallback || null,
      outputPreserved: true,
    };
  }
  try {
    assertPluginModeAllows(record.manifest, "processing", "process-document");
    const output = await execute({
      input,
      network: createBlockedNetwork(),
      capabilities: discoverPluginCapabilities(record),
    });
    return { ok: true, output };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error.code === "PLUGIN_NETWORK_BLOCKED" ? "PLUGIN_NETWORK_BLOCKED" : "PLUGIN_CRASH_ISOLATED",
        message: error.message,
      },
      fallback: record.manifest?.fallback || null,
      outputPreserved: true,
    };
  }
}
