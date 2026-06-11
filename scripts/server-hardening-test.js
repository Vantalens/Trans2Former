#!/usr/bin/env node
import assert from "node:assert/strict";
import net from "node:net";

import { startWebServer } from "../src/web-server.js";

const PORT_START = 49233;
const PORT_END = 49300;

async function isPortAvailable(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findPort() {
  for (let port = PORT_START; port <= PORT_END; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error("No local port available for server hardening test");
}

const { server, port } = await startWebServer(await findPort());
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const address = server.address();
  assert.equal(typeof address, "object", "server address should expose host metadata");
  assert.equal(address.address, "127.0.0.1", "server should bind to loopback by default");

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.ok, true, "/api/health should remain available");
  assert.equal(health.headers.get("x-powered-by"), null, "Express x-powered-by header must be disabled");
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.equal(health.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(health.headers.get("cross-origin-embedder-policy"), "require-corp");
  const csp = health.headers.get("content-security-policy") || "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src [^;]*'wasm-unsafe-eval'/, "CSP must allow WebAssembly compilation for the local OCR pipeline");
  assert.match(csp, /frame-src [^;]*blob:/, "CSP must allow blob: iframes for the PDF/HTML preview");

  assert.equal(server.requestTimeout, 120000, "server must set an explicit request timeout");
  assert.equal(server.headersTimeout, 30000, "server must set an explicit headers timeout");

  const index = await fetch(`${baseUrl}/`);
  assert.equal(index.ok, true, "root should serve the app shell");
  assert.equal((await index.text()).includes("id=\"fileInput\""), true);

  const navFallback = await fetch(`${baseUrl}/workbench`);
  assert.equal(navFallback.ok, true, "extensionless navigation paths should serve the app shell");
  assert.equal((await navFallback.text()).includes("id=\"fileInput\""), true);

  for (const path of [
    "/vendor/paddleocr/missing.onnx",
    "/vendor/onnxruntime/missing.wasm",
    "/missing.js",
    "/missing.css",
  ]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404, `${path} should return a real 404 instead of index.html`);
    assert.equal(response.headers.get("content-type")?.includes("text/html"), false, `${path} must not return the app shell as HTML`);
  }

  console.log("Server hardening test passed: loopback binding, security headers, timeouts, and static 404 behavior verified.");
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
