import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

async function pathExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function isGitWorkTree() {
  try {
    return execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" }).trim() === "true";
  } catch {
    return false;
  }
}

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
  "core local capabilities",
]) {
  assert.equal(releasePrep.includes(requiredText), true, `release prep should mention ${requiredText}`);
}

const script = await readFile("scripts/prepare-release.js", "utf8");
assert.equal(script.includes("const releaseRoot = path.join(ROOT, \"release\")"), true);
assert.equal(script.includes("npm test"), true);
assert.equal(script.includes("pluginPatchAssets"), false);
assert.equal(script.includes("plugin-patches"), false);

const vendorScript = await readFile("scripts/sync-pdfjs-vendor.js", "utf8");
assert.equal(vendorScript.includes("pdfjs-dist"), true);
assert.equal(vendorScript.includes("public"), true);

const gitignore = await readFile(".gitignore", "utf8");
assert.equal(gitignore.includes("/release/"), true, "local release directory should stay out of git");
assert.equal(gitignore.includes(".claude/settings.local.json"), true, "local Claude/Codex settings should stay out of git");
assert.equal(await pathExists(".claude/settings.local.json"), false, "local Claude/Codex settings file must not be present in the release tree");

if (isGitWorkTree()) {
  const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split(/\r?\n/);
  const deletedFiles = execFileSync("git", ["ls-files", "--deleted"], { encoding: "utf8" }).split(/\r?\n/);
  assert.equal(
    trackedFiles.includes(".claude/settings.local.json") && !deletedFiles.includes(".claude/settings.local.json"),
    false,
    "local Claude/Codex settings must not be tracked in the committed tree",
  );
}

const releaseGuide = await readFile("RELEASE_GUIDE.md", "utf8");
assert.equal(releaseGuide.includes("Compress-Archive"), true, "release guide should include Windows PowerShell zip command");
assert.equal(releaseGuide.includes("Get-FileHash"), true, "release guide should include Windows PowerShell checksum command");
assert.equal(releaseGuide.includes("plugin-patches"), false);

console.log("Release readiness test passed: release docs, script, and git hygiene are prepared.");
