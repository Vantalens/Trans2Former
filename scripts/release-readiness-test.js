import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_FILES = [
  "README.md",
  "INSTALL.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "COMMIT_CHECKLIST.md",
  "LICENSE",
  "package.json",
  "docs/RELEASE_PREP.md",
  "docs/DESKTOP_RELEASE_PLAN.md",
  "scripts/sync-pdfjs-vendor.js",
  "scripts/prepare-release.js",
  "public/vendor/pdfjs/pdf.min.mjs",
  "public/plugin-patches/ofd-local-reader-0.2.0.t2f-plugin.json",
  "public/plugin-patches/local-ocr-basic-0.1.0.t2f-plugin.json",
];

for (const file of REQUIRED_FILES) {
  await access(path.resolve(file));
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(packageJson.scripts["vendor:pdfjs"], "node scripts/sync-pdfjs-vendor.js");
assert.equal(packageJson.scripts["release:prepare"], "node scripts/sync-pdfjs-vendor.js && node scripts/prepare-release.js");

const releasePrep = await readFile("docs/RELEASE_PREP.md", "utf8");
for (const requiredText of [
  "local-only",
  "npm test",
  "GitHub release",
  "release/",
  "Trans2Former",
  "plugin-patches",
]) {
  assert.equal(releasePrep.includes(requiredText), true, `release prep should mention ${requiredText}`);
}

const script = await readFile("scripts/prepare-release.js", "utf8");
assert.equal(script.includes("const releaseRoot = path.join(ROOT, \"release\")"), true);
assert.equal(script.includes("npm test"), true);
assert.equal(script.includes("pluginPatchAssets"), true);

const vendorScript = await readFile("scripts/sync-pdfjs-vendor.js", "utf8");
assert.equal(vendorScript.includes("pdfjs-dist"), true);
assert.equal(vendorScript.includes("public"), true);

const gitignore = await readFile(".gitignore", "utf8");
assert.equal(gitignore.includes("/release/"), true, "local release directory should stay out of git");

console.log("Release readiness test passed: release docs, script, and git hygiene are prepared.");
