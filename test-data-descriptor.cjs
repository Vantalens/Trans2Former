// Test script to demonstrate data descriptor handling
const fs = require('fs');
const zlib = require('zlib');

// Create a simple ZIP with data descriptor (bit 3 set)
function createZipWithDataDescriptor() {
  const fileName = 'test.txt';
  const fileContent = 'Hello, data descriptor!';
  const fileNameBytes = Buffer.from(fileName, 'utf-8');
  const fileData = Buffer.from(fileContent, 'utf-8');
  const compressed = zlib.deflateRawSync(fileData);
  
  const crc32 = zlib.crc32(fileData);
  
  // Local file header
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);  // signature
  localHeader.writeUInt16LE(20, 4);           // version needed
  localHeader.writeUInt16LE(0x08, 6);         // flags: bit 3 = data descriptor
  localHeader.writeUInt16LE(8, 8);            // compression method: deflate
  localHeader.writeUInt16LE(0, 10);           // mod time
  localHeader.writeUInt16LE(0, 12);           // mod date
  localHeader.writeUInt32LE(0, 14);           // crc32 = 0 (in descriptor)
  localHeader.writeUInt32LE(0, 18);           // compressed size = 0 (in descriptor)
  localHeader.writeUInt32LE(0, 22);           // uncompressed size = 0 (in descriptor)
  localHeader.writeUInt16LE(fileNameBytes.length, 26);
  localHeader.writeUInt16LE(0, 28);           // extra field length
  
  // Data descriptor (without optional signature)
  const dataDescriptor = Buffer.alloc(12);
  dataDescriptor.writeUInt32LE(crc32, 0);
  dataDescriptor.writeUInt32LE(compressed.length, 4);
  dataDescriptor.writeUInt32LE(fileData.length, 8);
  
  // Central directory header
  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x08, 8);        // flags: bit 3
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(crc32, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(fileData.length, 24);
  centralHeader.writeUInt16LE(fileNameBytes.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(0, 42);
  
  const centralDirOffset = localHeader.length + fileNameBytes.length + compressed.length + dataDescriptor.length;
  
  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralHeader.length + fileNameBytes.length, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);
  
  return Buffer.concat([
    localHeader,
    fileNameBytes,
    compressed,
    dataDescriptor,
    centralHeader,
    fileNameBytes,
    eocd
  ]);
}

const zipData = createZipWithDataDescriptor();
fs.writeFileSync('test-data-descriptor.zip', zipData);
console.log('Created test ZIP with data descriptor:', zipData.length, 'bytes');
console.log('Compressed size:', zlib.deflateRawSync(Buffer.from('Hello, data descriptor!')).length);
