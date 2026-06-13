import assert from "node:assert/strict";
import {
  formatFileSize,
  registerQueuedFileState,
  retryFailedQueueItemsState,
  selectAllQueueItemsState,
} from "../public/core/file-queue-ui.js";
import { writeBlobToDirectory } from "../public/core/output-directory.js";

const firstFile = { name: "example.md", size: 2048 };
const secondFile = { name: "broken.txt", size: 16 };

assert.equal(formatFileSize(0), "0 B");
assert.equal(formatFileSize(2048), "2.0 KB");

let state = registerQueuedFileState([], "", firstFile, "md");
assert.equal(state.fileQueue.length, 1);
assert.equal(state.activeQueueItemId, state.item.id);
assert.equal(state.item.format, "md");

state = registerQueuedFileState(state.fileQueue, state.activeQueueItemId, firstFile, "txt");
assert.equal(state.fileQueue.length, 1);
assert.equal(state.item.format, "txt");

const selected = selectAllQueueItemsState(state.fileQueue);
assert.equal(selected[0].selected, false);

const failedQueue = [
  { ...state.item, selected: false, status: "complete" },
  { ...registerQueuedFileState([], "", secondFile, "txt").item, selected: false, status: "failed", error: "boom" },
];
const retried = retryFailedQueueItemsState(failedQueue);
assert.equal(retried.retries, 1);
assert.equal(retried.fileQueue[0].status, "complete");
assert.equal(retried.fileQueue[1].status, "queued");
assert.equal(retried.fileQueue[1].selected, true);
assert.equal(retried.fileQueue[1].error, "");

const writes = [];
const directoryHandle = {
  name: "Exports",
  async queryPermission(options) {
    assert.deepEqual(options, { mode: "readwrite" });
    return "granted";
  },
  async getFileHandle(fileName, options) {
    assert.equal(fileName, "browser-smoke.html");
    assert.deepEqual(options, { create: true });
    return {
      async createWritable() {
        return {
          async write(blob) {
            writes.push(await blob.text());
          },
          async close() {
            writes.push("closed");
          },
        };
      },
    };
  },
};
assert.equal(await writeBlobToDirectory(directoryHandle, "browser-smoke.html", new Blob(["<main>ok</main>"], { type: "text/html" })), true);
assert.deepEqual(writes, ["<main>ok</main>", "closed"]);

console.log("workbench queue tests passed");
