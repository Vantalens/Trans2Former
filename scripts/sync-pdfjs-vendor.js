import { copyFile, cp, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const buildDir = path.join(ROOT, "node_modules", "pdfjs-dist", "build");
const cmapSource = path.join(ROOT, "node_modules", "pdfjs-dist", "cmaps");
const standardFontsSource = path.join(ROOT, "node_modules", "pdfjs-dist", "standard_fonts");
const targetDir = path.join(ROOT, "public", "vendor", "pdfjs");

await mkdir(targetDir, { recursive: true });
await copyFile(path.join(buildDir, "pdf.min.mjs"), path.join(targetDir, "pdf.min.mjs"));
await copyFile(path.join(buildDir, "pdf.worker.min.mjs"), path.join(targetDir, "pdf.worker.min.mjs"));
await cp(cmapSource, path.join(targetDir, "cmaps"), { recursive: true });
await cp(standardFontsSource, path.join(targetDir, "standard_fonts"), { recursive: true });

console.log("PDF.js vendor synced to public/vendor/pdfjs/ (main + worker + cmaps + standard_fonts)");
