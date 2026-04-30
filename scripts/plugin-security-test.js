import assert from "node:assert/strict";

import {
  assertPluginModeAllows,
  classifyPluginResourceTier,
  computeSha256Hex,
  validatePluginManifest,
  verifyPluginIntegrity,
} from "../public/core/plugin-policy.js";

const pluginBytes = new TextEncoder().encode("export default {};");
const pluginHash = await computeSha256Hex(pluginBytes);

const manifest = {
  schemaVersion: "trans2former.plugin.v1",
  id: "format-docx-input",
  name: "DOCX Input",
  version: "0.1.0",
  kind: "format-plugin",
  entry: "plugins/format-docx-input/index.js",
  formats: [{ format: "docx", canRead: true, canWrite: false }],
  permissions: ["install-network", "cache-plugin", "process-document", "read-assets", "write-output"],
  resources: {
    downloadBytes: 2_000_000,
    maxRuntimeMemoryMb: 512,
  },
  integrity: {
    sha256: pluginHash,
  },
  security: {
    installMode: "network-only-no-documents",
    processingMode: "local-only-no-network",
  },
  fallback: {
    code: "DOCX_PLUGIN_UNAVAILABLE",
    message: "DOCX plugin is unavailable; keep the document local and report an explicit fallback.",
  },
};

testValidManifest();
await testIntegrity();
testModeIsolation();
testNoNetworkProcessing();
testResourceTiers();
testLocalModelRules();

function testValidManifest() {
  const result = validatePluginManifest(manifest);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.manifest.id, "format-docx-input");
}

async function testIntegrity() {
  assert.equal(await verifyPluginIntegrity(manifest, pluginBytes), true);
  assert.equal(await verifyPluginIntegrity({
    ...manifest,
    integrity: { sha256: "0".repeat(64) },
  }, pluginBytes), false);
}

function testModeIsolation() {
  assert.doesNotThrow(() => assertPluginModeAllows(manifest, "install", "install-network"));
  assert.throws(() => assertPluginModeAllows(manifest, "install", "process-document"), /forbids process-document/);
  assert.doesNotThrow(() => assertPluginModeAllows(manifest, "processing", "process-document"));
  assert.throws(() => assertPluginModeAllows(manifest, "processing", "install-network"), /forbids install-network/);
}

function testNoNetworkProcessing() {
  const invalid = {
    ...manifest,
    security: { ...manifest.security, processingMode: "remote-network" },
  };
  const result = validatePluginManifest(invalid);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.includes("processingMode")), true);

  const remoteApi = {
    ...manifest,
    permissions: [...manifest.permissions, "remote-api"],
  };
  const remoteResult = validatePluginManifest(remoteApi);
  assert.equal(remoteResult.ok, false);
  assert.equal(remoteResult.errors.some((error) => error.includes("remote-api")), true);
}

function testResourceTiers() {
  assert.equal(classifyPluginResourceTier(manifest), "format-plugin");
  assert.equal(validatePluginManifest({
    ...manifest,
    resources: { downloadBytes: 15_000_000, maxRuntimeMemoryMb: 512 },
  }).ok, false);
}

function testLocalModelRules() {
  const modelPlugin = {
    ...manifest,
    id: "local-ocr-model",
    kind: "local-model-plugin",
    permissions: ["process-document", "read-assets", "write-output"],
    resources: {
      downloadBytes: 120_000_000,
      maxRuntimeMemoryMb: 2048,
    },
    install: {
      manual: true,
      removable: true,
    },
  };
  assert.equal(validatePluginManifest(modelPlugin).ok, true);
  assert.equal(classifyPluginResourceTier(modelPlugin), "local-model-plugin");

  const invalidModelPlugin = {
    ...modelPlugin,
    install: { manual: false, removable: true },
  };
  assert.equal(validatePluginManifest(invalidModelPlugin).ok, false);
}

console.log("Plugin security test passed: manifest, permissions, isolation, integrity, and resource policy are enforced.");
