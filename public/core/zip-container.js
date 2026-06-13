import { ConversionError } from "./conversion-error.js";

const decoder = new TextDecoder("utf-8");
const MAX_ENTRY_COUNT = 10000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function readUint16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function reverseBits(value, length) {
  let output = 0;
  for (let index = 0; index < length; index += 1) {
    output = (output << 1) | (value & 1);
    value >>>= 1;
  }
  return output;
}

function buildHuffman(lengths) {
  const table = new Map();
  const maxBits = Math.max(...lengths, 0);
  const blCount = Array(maxBits + 1).fill(0);
  lengths.forEach((length) => {
    if (length > 0) blCount[length] += 1;
  });

  const nextCode = Array(maxBits + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits += 1) {
    code = (code + (blCount[bits - 1] || 0)) << 1;
    nextCode[bits] = code;
  }

  lengths.forEach((length, symbol) => {
    if (length === 0) return;
    const reversed = reverseBits(nextCode[length], length);
    table.set(`${length}:${reversed}`, symbol);
    nextCode[length] += 1;
  });

  return { table, maxBits };
}

class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.byteOffset = 0;
    this.bitBuffer = 0;
    this.bitLength = 0;
  }

  readBits(count) {
    while (this.bitLength < count) {
      if (this.byteOffset >= this.bytes.length) {
        throw new ConversionError("ZIP deflate stream ended unexpectedly", {
          category: "parse",
          code: "ZIP_DEFLATE_TRUNCATED",
          format: "zip",
        });
      }
      this.bitBuffer |= this.bytes[this.byteOffset] << this.bitLength;
      this.byteOffset += 1;
      this.bitLength += 8;
    }
    const value = this.bitBuffer & ((1 << count) - 1);
    this.bitBuffer >>>= count;
    this.bitLength -= count;
    return value;
  }

  alignByte() {
    this.bitBuffer = 0;
    this.bitLength = 0;
  }
}

function readSymbol(reader, huffman) {
  let code = 0;
  for (let length = 1; length <= huffman.maxBits; length += 1) {
    code |= reader.readBits(1) << (length - 1);
    const symbol = huffman.table.get(`${length}:${code}`);
    if (symbol !== undefined) return symbol;
  }
  throw new ConversionError("ZIP deflate Huffman code is invalid", {
    category: "parse",
    code: "ZIP_DEFLATE_HUFFMAN_ERROR",
    format: "zip",
  });
}

function assertDeflateOutputWithinDeclaredSize(output, expectedSize) {
  if (expectedSize > 0 && output.length > expectedSize) {
    throw new ConversionError("ZIP deflate output exceeded declared size", {
      category: "parse",
      code: "ZIP_DEFLATE_SIZE_ERROR",
      format: "zip",
      details: {
        declaredBytes: expectedSize,
        outputBytes: output.length,
      },
    });
  }
}

function copyDistance(output, distance, length, expectedSize) {
  if (!Number.isInteger(distance) || distance <= 0 || distance > output.length) {
    throw new ConversionError("ZIP deflate distance is invalid", {
      category: "parse",
      code: "ZIP_DEFLATE_DISTANCE_ERROR",
      format: "zip",
    });
  }
  for (let index = 0; index < length; index += 1) {
    output.push(output[output.length - distance]);
    assertDeflateOutputWithinDeclaredSize(output, expectedSize);
  }
}

function inflateHuffmanBlock(reader, output, literalTree, distanceTree, expectedSize) {
  while (true) {
    const symbol = readSymbol(reader, literalTree);
    if (symbol < 256) {
      output.push(symbol);
      assertDeflateOutputWithinDeclaredSize(output, expectedSize);
      continue;
    }
    if (symbol === 256) return;
    if (symbol < 257 || symbol > 285) {
      throw new ConversionError("ZIP deflate length symbol is invalid", {
        category: "parse",
        code: "ZIP_DEFLATE_LENGTH_ERROR",
        format: "zip",
      });
    }
    const lengthIndex = symbol - 257;
    const length = LENGTH_BASE[lengthIndex] + reader.readBits(LENGTH_EXTRA[lengthIndex]);
    const distanceSymbol = readSymbol(reader, distanceTree);
    if (distanceSymbol < 0 || distanceSymbol >= DIST_BASE.length || distanceSymbol >= DIST_EXTRA.length) {
      throw new ConversionError("ZIP deflate distance symbol is invalid", {
        category: "parse",
        code: "ZIP_DEFLATE_DISTANCE_ERROR",
        format: "zip",
      });
    }
    const distance = DIST_BASE[distanceSymbol] + reader.readBits(DIST_EXTRA[distanceSymbol]);
    copyDistance(output, distance, length, expectedSize);
  }
}

function fixedHuffmanTrees() {
  const literalLengths = Array(288).fill(0);
  for (let index = 0; index <= 143; index += 1) literalLengths[index] = 8;
  for (let index = 144; index <= 255; index += 1) literalLengths[index] = 9;
  for (let index = 256; index <= 279; index += 1) literalLengths[index] = 7;
  for (let index = 280; index <= 287; index += 1) literalLengths[index] = 8;
  return {
    literalTree: buildHuffman(literalLengths),
    distanceTree: buildHuffman(Array(32).fill(5)),
  };
}

function dynamicHuffmanTrees(reader) {
  const hlit = reader.readBits(5) + 257;
  const hdist = reader.readBits(5) + 1;
  const hclen = reader.readBits(4) + 4;
  const codeLengthLengths = Array(19).fill(0);
  for (let index = 0; index < hclen; index += 1) {
    codeLengthLengths[CODE_LENGTH_ORDER[index]] = reader.readBits(3);
  }
  const codeLengthTree = buildHuffman(codeLengthLengths);
  const lengths = [];
  while (lengths.length < hlit + hdist) {
    const symbol = readSymbol(reader, codeLengthTree);
    if (symbol <= 15) {
      lengths.push(symbol);
    } else if (symbol === 16) {
      const repeat = reader.readBits(2) + 3;
      const previous = lengths.at(-1) || 0;
      for (let index = 0; index < repeat; index += 1) lengths.push(previous);
    } else if (symbol === 17) {
      const repeat = reader.readBits(3) + 3;
      for (let index = 0; index < repeat; index += 1) lengths.push(0);
    } else if (symbol === 18) {
      const repeat = reader.readBits(7) + 11;
      for (let index = 0; index < repeat; index += 1) lengths.push(0);
    }
  }
  return {
    literalTree: buildHuffman(lengths.slice(0, hlit)),
    distanceTree: buildHuffman(lengths.slice(hlit, hlit + hdist)),
  };
}

function inflateDeflateRaw(bytes, expectedSize) {
  const reader = new BitReader(bytes);
  const output = [];
  let isFinal = false;
  while (!isFinal) {
    isFinal = reader.readBits(1) === 1;
    const blockType = reader.readBits(2);
    if (blockType === 0) {
      reader.alignByte();
      const len = reader.readBits(16);
      const nlen = reader.readBits(16);
      if (((len ^ 0xffff) & 0xffff) !== nlen) {
        throw new ConversionError("ZIP deflate stored block length check failed", {
          category: "parse",
          code: "ZIP_DEFLATE_STORED_LENGTH_ERROR",
          format: "zip",
        });
      }
      for (let index = 0; index < len; index += 1) {
        output.push(reader.readBits(8));
        assertDeflateOutputWithinDeclaredSize(output, expectedSize);
      }
    } else if (blockType === 1) {
      const { literalTree, distanceTree } = fixedHuffmanTrees();
      inflateHuffmanBlock(reader, output, literalTree, distanceTree, expectedSize);
    } else if (blockType === 2) {
      const { literalTree, distanceTree } = dynamicHuffmanTrees(reader);
      inflateHuffmanBlock(reader, output, literalTree, distanceTree, expectedSize);
    } else {
      throw new ConversionError("ZIP deflate reserved block type is invalid", {
        category: "parse",
        code: "ZIP_DEFLATE_BLOCK_TYPE_ERROR",
        format: "zip",
      });
    }
    assertDeflateOutputWithinDeclaredSize(output, expectedSize);
  }
  if (expectedSize > 0 && output.length !== expectedSize) {
    throw new ConversionError("ZIP deflate output size does not match header", {
      category: "parse",
      code: "ZIP_DEFLATE_SIZE_ERROR",
      format: "zip",
    });
  }
  return new Uint8Array(output);
}

function normalizeEntryPath(name) {
  const normalized = String(name || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || normalized.split("/").some((part) => part === "..")) {
    throw new ConversionError(`ZIP entry path is unsafe: ${normalized}`, {
      category: "parse",
      code: "ZIP_UNSAFE_ENTRY_PATH",
      format: "zip",
    });
  }
  return normalized;
}

function validateCentralDirectory(bytes, offset, entries) {
  if (offset + 4 > bytes.length || readUint32(bytes, offset) !== 0x02014b50) {
    return false;
  }
  const centralNames = new Set();
  let cursor = offset;
  while (cursor + 46 <= bytes.length) {
    const signature = readUint32(bytes, cursor);
    if (signature === 0x06054b50) break;
    if (signature !== 0x02014b50) {
      throw new ConversionError("ZIP central directory header is invalid", {
        category: "parse",
        code: "ZIP_CENTRAL_DIRECTORY_ERROR",
        format: "zip",
      });
    }
    const fileNameLength = readUint16(bytes, cursor + 28);
    const extraLength = readUint16(bytes, cursor + 30);
    const commentLength = readUint16(bytes, cursor + 32);
    const nameStart = cursor + 46;
    const name = normalizeEntryPath(decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength)));
    centralNames.add(name);
    cursor = nameStart + fileNameLength + extraLength + commentLength;
  }

  if (centralNames.size !== entries.size || [...centralNames].some((name) => !entries.has(name))) {
    throw new ConversionError("ZIP central directory does not match local entries", {
      category: "parse",
      code: "ZIP_CENTRAL_DIRECTORY_MISMATCH",
      format: "zip",
    });
  }
  return true;
}

function base64ToBytes(base64) {
  if (typeof atob === "function") {
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  throw new ConversionError("当前环境不支持 base64 解码", {
    category: "parse",
    code: "ZIP_BASE64_UNSUPPORTED",
    format: "zip",
  });
}

export function coerceZipBytes(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  const text = String(content ?? "");
  const dataUrlMatch = text.match(/^data:[^;]+;base64,(.+)$/);
  if (dataUrlMatch) {
    return base64ToBytes(dataUrlMatch[1]);
  }
  return base64ToBytes(text);
}

export function readZipEntries(content) {
  const bytes = coerceZipBytes(content);
  const entries = new Map();
  let offset = 0;
  let totalUncompressedBytes = 0;

  while (offset + 30 <= bytes.length) {
    const signature = readUint32(bytes, offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break;
    }
    if (signature !== 0x04034b50) {
      throw new ConversionError(`ZIP local header 无效: offset ${offset}`, {
        category: "parse",
        code: "ZIP_LOCAL_HEADER_ERROR",
        format: "zip",
      });
    }

    const flags = readUint16(bytes, offset + 6);
    const method = readUint16(bytes, offset + 8);
    const compressedSize = readUint32(bytes, offset + 18);
    const uncompressedSize = readUint32(bytes, offset + 22);
    const fileNameLength = readUint16(bytes, offset + 26);
    const extraLength = readUint16(bytes, offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = normalizeEntryPath(decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength)));

    if ((flags & 0x08) !== 0) {
      throw new ConversionError("ZIP data descriptor 暂未支持；请使用标准 OOXML 包或后续核心增强路径", {
        category: "parse",
        code: "ZIP_DATA_DESCRIPTOR_UNSUPPORTED",
        format: "zip",
      });
    }
    if (method !== 0 && method !== 8) {
      throw new ConversionError(`ZIP compression method ${method} 暂未支持`, {
        category: "parse",
        code: "ZIP_COMPRESSION_UNSUPPORTED",
        format: "zip",
      });
    }
    if (entries.size >= MAX_ENTRY_COUNT) {
      throw new ConversionError("ZIP entry count exceeds the local processing budget", {
        category: "parse",
        code: "ZIP_ENTRY_COUNT_LIMIT",
        format: "zip",
      });
    }
    if (method === 8 && compressedSize > 0 && uncompressedSize === 0) {
      throw new ConversionError("ZIP compression ratio cannot be verified for unknown-size deflated entries", {
        category: "parse",
        code: "ZIP_COMPRESSION_RATIO_LIMIT",
        format: "zip",
      });
    }
    if (uncompressedSize > 0 && compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
      throw new ConversionError("ZIP compression ratio exceeds the local processing budget", {
        category: "parse",
        code: "ZIP_COMPRESSION_RATIO_LIMIT",
        format: "zip",
      });
    }
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ConversionError("ZIP uncompressed size exceeds the local processing budget", {
        category: "parse",
        code: "ZIP_UNCOMPRESSED_SIZE_LIMIT",
        format: "zip",
      });
    }

    const compressedData = bytes.slice(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateDeflateRaw(compressedData, uncompressedSize) : compressedData;
    entries.set(name, {
      name,
      method,
      compressedSize,
      uncompressedSize,
      data,
    });
    offset = dataStart + compressedSize;
  }

  const hasCentralDirectory = validateCentralDirectory(bytes, offset, entries);

  return {
    entries,
    list() {
      return [...entries.keys()];
    },
    methods() {
      return [...new Set([...entries.values()].map((entry) => entry.method))].sort((a, b) => a - b);
    },
    hasCentralDirectory() {
      return hasCentralDirectory;
    },
    has(name) {
      return entries.has(name);
    },
    getBytes(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      return entry.data;
    },
    getText(name) {
      const entry = entries.get(name);
      if (!entry) return "";
      return decoder.decode(entry.data);
    },
  };
}
