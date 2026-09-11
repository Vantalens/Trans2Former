import assert from "node:assert/strict";

import {
  clearWorkspaceSnapshot,
  readWorkspaceSnapshot,
  saveWorkspaceSnapshot,
  WORKSPACE_STORAGE_CONSTANTS,
} from "../public/core/workspace-storage.js";

const values = new Map();
globalThis.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); },
};

const snapshot = {
  fileName: "notes.md",
  fromFormat: "md",
  toFormat: "html",
  content: "# 本地草稿\n\n刷新后仍可恢复。",
  savedAt: 1700000000000,
};

assert.equal(await saveWorkspaceSnapshot(snapshot), true, "localStorage fallback should save a workspace snapshot");
assert.deepEqual(await readWorkspaceSnapshot(), { schemaVersion: 1, ...snapshot }, "saved workspace should be restored unchanged");
assert.equal(WORKSPACE_STORAGE_CONSTANTS.FALLBACK_KEY, "trans2former.workspace.snapshot");

await clearWorkspaceSnapshot();
assert.equal(await readWorkspaceSnapshot(), null, "clearing workspace should remove the fallback snapshot");
assert.equal(await saveWorkspaceSnapshot({ fileName: "invalid.md" }), false, "invalid snapshots should be rejected");

console.log("Workspace storage tests passed: fallback save, restore, validation, and clear are covered.");
