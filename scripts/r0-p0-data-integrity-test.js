#!/usr/bin/env node
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";

import { ConversionError } from "../public/core/conversion-error.js";
import { decodeTextBytes } from "../public/core/text-decoding.js";
import { readZipEntries } from "../public/core/zip-container.js";

const encoder = new TextEncoder();

function assertUtf8TextPreserved(text, fileName) {
  const decoded = decodeTextBytes(encoder.encode(text), { fileName, mime: "text/plain" });
  assert.equal(decoded.encoding, "utf-8", `${fileName} should prefer valid UTF-8 over legacy fallbacks`);
  assert.equal(decoded.text, text, `${fileName} should preserve valid UTF-8 text exactly`);
  assert.equal(decoded.hadReplacement, false, `${fileName} should not contain replacement characters`);
}

assertUtf8TextPreserved("Resume with one accented char: cafe\u0301", "accented-combining.txt");
assertUtf8TextPreserved("Resume with one accented char: café", "accented-precomposed.txt");
assertUtf8TextPreserved("Le café est très agréable.", "french.txt");
assertUtf8TextPreserved("smörgåsbord på fjäll", "swedish.txt");

function uint16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function reverseBits(value, length) {
  let output = 0;
  for (let index = 0; index < length; index += 1) {
    output = (output << 1) | (value & 1);
    value >>>= 1;
  }
  return output;
}

function fixedHuffmanCodes(lengths) {
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

  return lengths.map((length) => {
    if (length === 0) return null;
    const encoded = { bits: reverseBits(nextCode[length], length), length };
    nextCode[length] += 1;
    return encoded;
  });
}

function fixedLiteralCodes() {
  const literalLengths = Array(288).fill(0);
  for (let index = 0; index <= 143; index += 1) literalLengths[index] = 8;
  for (let index = 144; index <= 255; index += 1) literalLengths[index] = 9;
  for (let index = 256; index <= 279; index += 1) literalLengths[index] = 7;
  for (let index = 280; index <= 287; index += 1) literalLengths[index] = 8;
  return fixedHuffmanCodes(literalLengths);
}

function pushBits(bits, value, length) {
  for (let index = 0; index < length; index += 1) {
    bits.push((value >>> index) & 1);
  }
}

function bytesFromBits(bits) {
  const output = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((bit, index) => {
    output[index >>> 3] |= bit << (index & 7);
  });
  return output;
}

function createDeflateWithInvalidDistanceSymbol() {
  const literalCodes = fixedLiteralCodes();
  const distanceCodes = fixedHuffmanCodes(Array(32).fill(5));
  const bits = [];
  pushBits(bits, 1, 1);
  pushBits(bits, 0b01, 2);
  for (const symbol of [65, 257]) {
    pushBits(bits, literalCodes[symbol].bits, literalCodes[symbol].length);
  }
  pushBits(bits, distanceCodes[30].bits, distanceCodes[30].length);
  pushBits(bits, literalCodes[256].bits, literalCodes[256].length);
  return bytesFromBits(bits);
}

function createDeflateThatExceedsDeclaredSizeInOneHuffmanBlock() {
  const literalCodes = fixedLiteralCodes();
  const distanceCodes = fixedHuffmanCodes(Array(32).fill(5));
  const bits = [];
  pushBits(bits, 1, 1);
  pushBits(bits, 0b01, 2);
  pushBits(bits, literalCodes[65].bits, literalCodes[65].length);
  pushBits(bits, literalCodes[285].bits, literalCodes[285].length);
  pushBits(bits, distanceCodes[0].bits, distanceCodes[0].length);
  pushBits(bits, literalCodes[256].bits, literalCodes[256].length);
  return bytesFromBits(bits);
}

function createZipWithRawDeflate(name, compressedData, uncompressedSize) {
  const nameBytes = encoder.encode(name);
  const localHeader = new Uint8Array([
    ...uint32(0x04034b50),
    ...uint16(20),
    ...uint16(0),
    ...uint16(8),
    ...uint16(0),
    ...uint16(0),
    ...uint32(0),
    ...uint32(compressedData.length),
    ...uint32(uncompressedSize),
    ...uint16(nameBytes.length),
    ...uint16(0),
  ]);
  return concatBytes([localHeader, nameBytes, compressedData]);
}

assert.throws(
  () => readZipEntries(createZipWithRawDeflate("word/document.xml", createDeflateWithInvalidDistanceSymbol(), 4)),
  (error) => error instanceof ConversionError && error.code === "ZIP_DEFLATE_DISTANCE_ERROR",
  "invalid DEFLATE distance symbols 30/31 must fail closed"
);

assert.throws(
  () => readZipEntries(createZipWithRawDeflate("word/oversized-block.bin", createDeflateThatExceedsDeclaredSizeInOneHuffmanBlock(), 16)),
  (error) => error instanceof ConversionError
    && error.code === "ZIP_DEFLATE_SIZE_ERROR"
    && error.details?.declaredBytes === 16
    && error.details?.outputBytes === 17,
  "DEFLATE output must be checked while a Huffman block is being decoded"
);

const compressedZeros = new Uint8Array(deflateRawSync(Buffer.alloc(1024 * 1024)));
assert.throws(
  () => readZipEntries(createZipWithRawDeflate("word/bomb.bin", compressedZeros, 0)),
  (error) => error instanceof ConversionError && error.code === "ZIP_COMPRESSION_RATIO_LIMIT",
  "unknown-size deflated entries must not bypass compression-ratio limits"
);

console.log("R0 P0 data integrity test passed.");
