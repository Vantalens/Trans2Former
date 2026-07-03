import { createQueueItem } from "./workbench-state.js";

export function formatFileSize(bytes) {
  if (!bytes) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function renderFileQueue({ listElement, fileQueue, activeQueueItemId, onActivate }) {
  if (!listElement) {
    return;
  }
  if (!fileQueue.length) {
    listElement.innerHTML = '<div class="queue-empty">暂无队列文件</div>';
    return;
  }

  // 性能优化：增量更新而非全量重建 DOM（issue #199, code review P2 #6）
  const existingItems = new Map();
  for (const child of listElement.children) {
    const queueId = child.dataset?.queueId;
    if (queueId) {
      existingItems.set(queueId, child);
    }
  }

  const fragment = document.createDocumentFragment();
  const updatedItems = new Set();

  fileQueue.forEach((item) => {
    let row = existingItems.get(item.id);
    const isActive = item.id === activeQueueItemId;

    if (row) {
      // 更新现有节点（仅更新变化的部分）
      updatedItems.add(item.id);

      // 更新 active 状态
      if (isActive && !row.classList.contains("is-active")) {
        row.classList.add("is-active");
      } else if (!isActive && row.classList.contains("is-active")) {
        row.classList.remove("is-active");
      }

      // 更新状态（状态变化频繁）
      const statusSpan = row.querySelector(".queue-status");
      if (statusSpan && statusSpan.textContent !== item.status) {
        statusSpan.textContent = item.status;
        statusSpan.dataset.status = item.status;
      }

      // 更新选中状态
      const checkSpan = row.querySelector(".queue-check");
      if (checkSpan) {
        const expectedCheck = item.selected ? "✓" : "";
        if (checkSpan.textContent !== expectedCheck) {
          checkSpan.textContent = expectedCheck;
        }
      }

      fragment.appendChild(row);
    } else {
      // 创建新节点
      row = document.createElement("button");
      row.type = "button";
      row.className = `queue-item${isActive ? " is-active" : ""}`;
      row.dataset.queueId = item.id;

      const check = document.createElement("span");
      check.className = "queue-check";
      check.textContent = item.selected ? "✓" : "";

      const name = document.createElement("span");
      name.className = "queue-name";
      name.textContent = item.name;

      const meta = document.createElement("span");
      meta.className = "queue-meta";
      meta.textContent = `${item.format || "?"} · ${formatFileSize(item.size)}`;

      const status = document.createElement("span");
      status.className = "queue-status";
      status.dataset.status = item.status;
      status.textContent = item.status;

      row.append(check, name, meta, status);
      row.addEventListener("click", () => onActivate?.(item.id));
      fragment.appendChild(row);
    }
  });

  // 移除不再存在的节点
  for (const [queueId, element] of existingItems) {
    if (!updatedItems.has(queueId)) {
      element.remove();
    }
  }

  // 一次性更新 DOM
  listElement.replaceChildren(...fragment.childNodes);
}

export function registerQueuedFileState(fileQueue, activeQueueItemId, file, detectedFormat) {
  const existing = fileQueue.find((item) => item.name === file.name && item.size === file.size);
  if (existing) {
    existing.selected = true;
    existing.format = detectedFormat || existing.format;
    return {
      fileQueue,
      activeQueueItemId: existing.id,
      item: existing,
    };
  }

  const item = createQueueItem(file, detectedFormat);
  return {
    fileQueue: [...fileQueue, item],
    activeQueueItemId: item.id,
    item,
  };
}

export function selectAllQueueItemsState(fileQueue) {
  const shouldSelect = fileQueue.some((item) => !item.selected);
  return fileQueue.map((item) => ({ ...item, selected: shouldSelect }));
}

export function retryFailedQueueItemsState(fileQueue) {
  let retries = 0;
  const nextQueue = fileQueue.map((item) => {
    if (item.status !== "failed") {
      return item;
    }
    retries += 1;
    return { ...item, selected: true, status: "queued", error: "" };
  });
  return { fileQueue: nextQueue, retries };
}
