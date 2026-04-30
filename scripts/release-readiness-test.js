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
  "scripts/prepare-release.js",
];

for (const file of REQUIRED_FILES) {
  await access(path.resolve(file));
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(packageJson.scripts["release:prepare"], "node scripts/prepare-release.js");

const releasePrep = await readFile("docs/RELEASE_PREP.md", "utf8");
for (const requiredText of [
  "local-only",
  "npm test",
  "GitHub release",
  "release/",
  "Trans2Former",
]) {
  assert.equal(releasePrep.includes(requiredText), true, `release prep should mention ${requiredText}`);
}

const script = await readFile("scripts/prepare-release.js", "utf8");
assert.equal(script.includes("const releaseRoot = path.join(ROOT, \"release\")"), true);
assert.equal(script.includes("npm test"), true);

const gitignore = await readFile(".gitignore", "utf8");
assert.equal(gitignore.includes("/release/"), true, "local release directory should stay out of git");

console.log("Release readiness test passed: release docs, script, and git hygiene are prepared.");
