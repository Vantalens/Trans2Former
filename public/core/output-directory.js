export async function hasDirectoryWritePermission(directoryHandle) {
  if (!directoryHandle) {
    return false;
  }
  const options = { mode: "readwrite" };
  if (typeof directoryHandle.queryPermission === "function") {
    const current = await directoryHandle.queryPermission(options);
    if (current === "granted") {
      return true;
    }
  }
  if (typeof directoryHandle.requestPermission === "function") {
    return await directoryHandle.requestPermission(options) === "granted";
  }
  return true;
}

export async function writeBlobToDirectory(directoryHandle, fileName, blob) {
  if (!directoryHandle) {
    return false;
  }
  if (!blob || !fileName) {
    throw new Error("当前没有可写入的输出文件");
  }
  if (!await hasDirectoryWritePermission(directoryHandle)) {
    throw new Error("没有输出目录写入权限");
  }
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
  return true;
}
