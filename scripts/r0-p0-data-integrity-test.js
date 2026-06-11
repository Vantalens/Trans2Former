#!/usr/bin/env node
import assert from "node:assert/strict";

import { decodeTextBytes } from "../public/core/text-decoding.js";

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

console.log("R0 P0 data integrity test passed.");
