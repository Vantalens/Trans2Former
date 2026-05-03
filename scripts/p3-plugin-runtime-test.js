import assert from "node:assert/strict";

import {
  createPluginRecord,
  discoverPluginCapabilities,
  importLocalPluginPackage,
  openPluginRelease,
  rollbackPlugin,
  runPluginProcessingTask,
  setPluginEnabled,
  uninstallPlugin,
} from "../public/core/plugin-runtime.js";
import { computeSha256Hex } from "../public/core/plugin-policy.js";

const pluginBytes = new TextEncoder().encode("export default { transform() {} };");
const pluginHash = await computeSha256Hex(pluginBytes);
const manifest = {
  schemaVersion: "trans2former.plugin.v1",
  id: "ofd-local-reader",
  name: "OFD Local Reader",
  version: "0.2.0",
  kind: "format-plugin",
  entry: "plugins/ofd-local-reader/index.js",
  releaseUrl: "https://github.com/Vantalens/trans2former-ofd-plugin/releases/tag/v0.2.0",
  formats: [{ format: "ofd", canRead: true, canWrite: false }],
  permissions: ["install-network", "cache-plugin", "process-document", "read-assets", "write-output"],
  resources: {
    downloadBytes: 4_000_000,
    maxRuntimeMemoryMb: 768,
  },
  integrity: { sha256: pluginHash },
  security: {
    installMode: "network-only-no-documents",
    processingMode: "local-only-no-network",
  },
  fallback: {
    code: "OFD_PLUGIN_UNAVAILABLE",
    message: "OFD plugin failed; keep the input document unchanged and show this fallback.",
  },
  updates: {
    latestVersion: "0.3.0",
    releaseNotes: "Improves page tree extraction.",
    permissions: ["process-document", "read-assets", "write-output"],
    resources: { downloadBytes: 4_500_000, maxRuntimeMemoryMb: 768 },
  },
};

testInstallModeDoesNotTouchDocuments();
await testImportLocalPackage();
testLifecycleControls();
await testProcessingNoNetworkAndCrashFallback();

function testInstallModeDoesNotTouchDocuments() {
  const opened = [];
  const result = openPluginRelease(manifest, {
    openExternal(url) {
      opened.push(url);
    },
    documentContext: {
      fileName: "secret.ofd",
      content: "must not be read",
    },
  });

  assert.equal(result.mode, "install");
  assert.equal(result.canAccessDocuments, false);
  assert.deepEqual(result.documentFieldsRead, []);
  assert.deepEqual(opened, [manifest.releaseUrl]);
}

async function testImportLocalPackage() {
  const record = await importLocalPluginPackage({ manifest, bytes: pluginBytes });
  assert.equal(record.status, "installed");
  assert.equal(record.enabled, false);
  assert.equal(record.integrityVerified, true);
  assert.equal(record.rollback.length, 1);
  assert.equal(record.capabilities[0].format, "ofd");

  await assert.rejects(
    () => importLocalPluginPackage({
      manifest: { ...manifest, integrity: { sha256: "0".repeat(64) } },
      bytes: pluginBytes,
    }),
    /integrity check failed/
  );
}

function testLifecycleControls() {
  const installed = createPluginRecord(manifest, { integrityVerified: true });
  const enabled = setPluginEnabled(installed, true);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.status, "enabled");
  assert.equal(discoverPluginCapabilities(enabled).some((item) => item.format === "ofd" && item.mode === "local-only-no-network"), true);

  const disabled = setPluginEnabled(enabled, false);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.status, "disabled");

  const updated = {
    ...enabled,
    version: "0.3.0",
    rollback: [{ version: "0.2.0", manifest }],
  };
  assert.equal(rollbackPlugin(updated).version, "0.2.0");
  assert.equal(uninstallPlugin(enabled).status, "uninstalled");
}

async function testProcessingNoNetworkAndCrashFallback() {
  const plugin = setPluginEnabled(createPluginRecord(manifest, { integrityVerified: true }), true);
  const networkResult = await runPluginProcessingTask(plugin, {
    input: "document content",
    execute({ network }) {
      return network.request("https://example.com/forbidden");
    },
  });
  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error.code, "PLUGIN_NETWORK_BLOCKED");
  assert.equal(networkResult.fallback.code, "OFD_PLUGIN_UNAVAILABLE");

  const crashResult = await runPluginProcessingTask(plugin, {
    input: "document content",
    execute() {
      throw new Error("parser crashed");
    },
  });
  assert.equal(crashResult.ok, false);
  assert.equal(crashResult.error.code, "PLUGIN_CRASH_ISOLATED");
  assert.equal(crashResult.outputPreserved, true);
}

console.log("P3 plugin runtime test passed: install isolation, local import, lifecycle, no-network processing, and crash fallback are covered.");
