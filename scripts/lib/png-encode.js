// 最小 PNG 编码器（Node 端，仅用于生成测试样例，不进入 public/ 运行时）。
// 用 node:zlib deflate 压缩，输出真实可读的 RGBA PNG。支持生成大尺寸图（>3MB）。

import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

// pixelFn(x, y) -> [r, g, b, a] (0-255). 生成 width×height RGBA PNG Buffer。
export function encodePng(width, height, pixelFn) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type none
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelFn(x, y);
      const offset = y * (stride + 1) + 1 + x * 4;
      raw[offset] = r & 0xff;
      raw[offset + 1] = g & 0xff;
      raw[offset + 2] = b & 0xff;
      raw[offset + 3] = a & 0xff;
    }
  }
  const idatData = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 生成一张确定性的彩色棋盘 + 渐变图，便于视觉/OCR 占位测试。
export function buildPatternPng(width, height) {
  return encodePng(width, height, (x, y) => {
    const checker = ((x >> 4) + (y >> 4)) % 2 === 0;
    const r = Math.floor((x / width) * 255);
    const g = Math.floor((y / height) * 255);
    const b = checker ? 200 : 60;
    return [r, g, b, 255];
  });
}
