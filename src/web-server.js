import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
const DEFAULT_HOST = "127.0.0.1";
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

function hasFileExtension(pathname = "") {
  const lastSegment = String(pathname || "").split("/").pop() || "";
  return /\.[a-z0-9][a-z0-9_-]*$/i.test(lastSegment);
}

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
  });

  app.use(express.static(publicDir));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode: "browser-first" });
  });

  app.get("*", async (req, res, next) => {
    if (hasFileExtension(req.path)) {
      res.status(404).type("text").send("Not found");
      return;
    }
    const indexPath = path.join(publicDir, "index.html");
    try {
      const html = await fs.readFile(indexPath, "utf8");
      res.type("html").send(html);
    } catch (error) {
      next(error);
    }
  });

  return app;
}

export async function startWebServer(port = Number(process.env.PORT || 3000), host = process.env.HOST || DEFAULT_HOST) {
  const serverStartTime = Date.now();
  const app = createApp();

  return await new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const elapsed = Date.now() - serverStartTime;
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      console.log(`[STARTUP] Web server listening: ${elapsed}ms`);
      resolve({ app, server, port: actualPort });
    });

    server.on("error", reject);
  });
}

if (isMainModule) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || DEFAULT_HOST;

  startWebServer(port, host)
    .then(({ port: actualPort }) => {
      const displayHost = host === DEFAULT_HOST ? "localhost" : host;
      process.stdout.write(`Trans2Former web server running at http://${displayHost}:${actualPort}\n`);
    })
    .catch((error) => {
      process.stderr.write(`Failed to start web server: ${error.message}\n`);
      process.exit(1);
    });
}
