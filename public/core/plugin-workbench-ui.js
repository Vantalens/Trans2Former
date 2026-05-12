import {
  discoverPluginCapabilities,
  importLocalPluginPackage,
  openPluginRelease,
  rollbackPlugin,
  setPluginEnabled,
  uninstallPlugin,
} from "./plugin-runtime.js";

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function permissionText(permissions = []) {
  return permissions.join(", ") || "none";
}

function resourceText(resources = {}) {
  return `${formatFileSize(Number(resources.downloadBytes || 0))} / ${Number(resources.maxRuntimeMemoryMb || 0)} MB`;
}

function pluginRow({ title, subtitle, meta, actions = "" }) {
  const row = document.createElement("div");
  row.className = "plugin-row";
  row.innerHTML = `
    <div>
      <strong>${title}</strong>
      <span>${subtitle}</span>
      <small>${meta}</small>
    </div>
    ${actions}
  `;
  return row;
}

function parsePluginImportPackage(text) {
  const parsed = JSON.parse(text);
  if (parsed.packageType === "trans2former.plugin.patch.v1") {
    return {
      manifest: parsed.manifest,
      bytes: new TextEncoder().encode(String(parsed.entrySource || "")),
    };
  }
  return {
    manifest: parsed,
    bytes: new TextEncoder().encode(text),
  };
}

async function fetchPluginImportPackage(manifest) {
  const releaseUrl = String(manifest?.releaseUrl || "");
  const localPatch = manifest?.distribution?.packageType === "trans2former.plugin.patch.v1"
    && manifest?.distribution?.offlineInstall === true
    && releaseUrl.startsWith("/plugin-patches/");
  if (!localPatch) {
    return null;
  }
  const response = await fetch(releaseUrl);
  if (!response.ok) {
    throw new Error(`插件补丁包读取失败: ${response.status}`);
  }
  return parsePluginImportPackage(await response.text());
}

export function createPluginWorkbenchUi({
  catalog,
  elements,
  storageKey = "trans2former.plugins.state",
  setStatus,
  getDocumentContext,
  openExternal,
  storage = window.localStorage,
}) {
  let installedPlugins = readState();

  function readState() {
    if (!storage) return [];
    try {
      const parsed = JSON.parse(storage.getItem(storageKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeState() {
    if (!storage) return;
    try {
      storage.setItem(storageKey, JSON.stringify(installedPlugins));
    } catch {
      setStatus("插件状态保存失败，浏览器可能禁用了本地存储", "info");
    }
  }

  function findPlugin(id) {
    return installedPlugins.find((plugin) => plugin.id === id) || null;
  }

  function upsert(record) {
    installedPlugins = [...installedPlugins.filter((plugin) => plugin.id !== record.id), record];
    writeState();
    render();
  }

  function renderDownloadCenter() {
    elements.downloadList?.replaceChildren(...catalog.map((manifest) => {
      const formats = manifest.formats.map((item) => `${item.format}${item.canRead ? " read" : ""}${item.canWrite ? " write" : ""}`).join(", ");
      return pluginRow({
        title: manifest.name,
        subtitle: `${manifest.version} · ${manifest.kind} · ${formats}`,
        meta: `权限：${permissionText(manifest.permissions)} · 预算：${resourceText(manifest.resources)} · ${manifest.security.installMode}`,
        actions: `<button class="mini-button" type="button" data-plugin-download="${manifest.id}">补丁包</button>`,
      });
    }));
  }

  function renderInstalled() {
    if (!elements.installedList) return;
    if (!installedPlugins.length) {
      elements.installedList.textContent = "尚未导入本地插件包";
      return;
    }
    elements.installedList.replaceChildren(...installedPlugins.map((plugin) => pluginRow({
      title: plugin.name,
      subtitle: `${plugin.version} · ${plugin.status} · ${plugin.integrityVerified ? "hash verified" : "hash pending"}`,
      meta: `${plugin.manifest.security.processingMode} · ${resourceText(plugin.manifest.resources)}`,
      actions: `<div class="plugin-actions">
        <button class="mini-button" type="button" data-plugin-toggle="${plugin.id}">${plugin.enabled ? "禁用" : "启用"}</button>
        <button class="mini-button" type="button" data-plugin-rollback="${plugin.id}">回滚</button>
        <button class="mini-button" type="button" data-plugin-uninstall="${plugin.id}">卸载</button>
      </div>`,
    })));
  }

  function renderUpdates() {
    if (!elements.updateList) return;
    const rows = installedPlugins
      .filter((plugin) => plugin.manifest.updates?.latestVersion && plugin.manifest.updates.latestVersion !== plugin.version)
      .map((plugin) => {
        const update = plugin.manifest.updates;
        return pluginRow({
          title: plugin.name,
          subtitle: `${plugin.version} -> ${update.latestVersion}`,
          meta: `${update.releaseNotes || "No release notes"} · 权限变化：${permissionText(update.permissions || [])} · 预算变化：${resourceText(update.resources || {})}`,
          actions: `<button class="mini-button" type="button" data-plugin-download="${plugin.id}">查看 Release</button>`,
        });
      });
    elements.updateList.replaceChildren(...(rows.length ? rows : [document.createTextNode("暂无可更新插件")]));
  }

  function renderCapabilities() {
    if (!elements.capabilityList || !elements.securitySummary) return;
    const capabilities = installedPlugins.flatMap((plugin) => discoverPluginCapabilities(plugin));
    elements.capabilityList.textContent = capabilities.length
      ? capabilities.map((item) => `${item.pluginName} · ${item.format} · read:${item.canRead} write:${item.canWrite} · ${item.mode} · fallback:${item.fallback?.code || "none"}`).join("\n")
      : "尚无插件能力";
    elements.securitySummary.textContent = [
      "install mode: network allowed, documents blocked",
      "processing mode: documents allowed, network blocked",
      `enabled plugins: ${installedPlugins.filter((plugin) => plugin.enabled).length}`,
      `installed plugins: ${installedPlugins.filter((plugin) => plugin.status !== "uninstalled").length}`,
    ].join("\n");
  }

  function render() {
    renderDownloadCenter();
    renderInstalled();
    renderUpdates();
    renderCapabilities();
  }

  async function importPluginFromFile(file) {
    const text = await file.text();
    const record = await importLocalPluginPackage(parsePluginImportPackage(text));
    const enabledRecord = setPluginEnabled(record, true);
    upsert(enabledRecord);
    setStatus(`插件已导入、校验并启用：${enabledRecord.name}`, "success");
  }

  async function importPluginFromCatalog(manifest) {
    const pluginPackage = await fetchPluginImportPackage(manifest);
    if (!pluginPackage) {
      openPluginRelease(manifest, { openExternal, documentContext: getDocumentContext() });
      setStatus("已打开插件 Release；安装模式不会读取当前文档", "success");
      return;
    }
    const record = await importLocalPluginPackage(pluginPackage);
    const enabledRecord = setPluginEnabled(record, true);
    upsert(enabledRecord);
    setStatus(`插件补丁包已导入、校验并启用：${enabledRecord.name}`, "success");
  }

  function handlePanelClick(event) {
    const download = event.target.closest("[data-plugin-download]");
    const toggle = event.target.closest("[data-plugin-toggle]");
    const rollback = event.target.closest("[data-plugin-rollback]");
    const uninstall = event.target.closest("[data-plugin-uninstall]");
    if (download) {
      const manifest = catalog.find((item) => item.id === download.dataset.pluginDownload) || findPlugin(download.dataset.pluginDownload)?.manifest;
      importPluginFromCatalog(manifest).catch((error) => setStatus(error.message, "error"));
    } else if (toggle && findPlugin(toggle.dataset.pluginToggle)) {
      const plugin = findPlugin(toggle.dataset.pluginToggle);
      upsert(setPluginEnabled(plugin, !plugin.enabled));
      setStatus(`${plugin.name} 已${plugin.enabled ? "禁用" : "启用"}`, "success");
    } else if (rollback && findPlugin(rollback.dataset.pluginRollback)) {
      const plugin = findPlugin(rollback.dataset.pluginRollback);
      upsert(rollbackPlugin(plugin));
      setStatus(`${plugin.name} 已回滚到上一可用版本`, "success");
    } else if (uninstall && findPlugin(uninstall.dataset.pluginUninstall)) {
      const plugin = findPlugin(uninstall.dataset.pluginUninstall);
      upsert(uninstallPlugin(plugin));
      setStatus(`${plugin.name} 已卸载`, "info");
    }
  }

  return { render, importPluginFromFile, handlePanelClick, importPluginFromCatalog };
}
