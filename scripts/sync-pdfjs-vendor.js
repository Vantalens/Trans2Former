import { copyFile, cp, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const source = path.join(ROOT, "node_modules", "pdfjs-dist", "build", "pdf.min.mjs");
const cmapSource = path.join(ROOT, "node_modules", "pdfjs-dist", "cmaps");
const targetDir = path.join(ROOT, "public", "vendor", "pdfjs");
const target = path.join(targetDir, "pdf.min.mjs");

await mkdir(targetDir, { recursive: true });
await copyFile(source, target);
await cp(cmapSource, path.join(targetDir, "cmaps"), { recursive: true });

console.log("PDF.js vendor synced to public/vendor/pdfjs/");
