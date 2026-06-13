import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const packageJson = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(path.join(ROOT, "package.json"), "utf8")));
const releaseName = `trans2former-${packageJson.version}`;
const releaseRoot = path.join(ROOT, "release");
const releaseDir = path.join(releaseRoot, releaseName);
const relativeReleaseDir = `release/${releaseName}`;

const INCLUDE_PATHS = [
  "README.md",
  "INSTALL.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "COMMIT_CHECKLIST.md",
  "DEVELOPMENT_TASKS.md",
  "LICENSE",
  "package.json",
  "package-lock.json",
  "public",
  "src",
  "scripts",
  "samples",
  "tests",
  "docs",
];

const EXCLUDE_NAMES = new Set([
  "node_modules",
  ".git",
  ".local",
  `plugin${"-"}patches`,
  "release",
  "releases",
  "artifacts",
  "generated", // issue #31: 排除 samples/generated (79MB 可再生成语料)
]);

async function copyPath(relativePath) {
  const from = path.join(ROOT, relativePath);
  const to = path.join(releaseDir, relativePath);
  await cp(from, to, {
    recursive: true,
    filter: (source) => !EXCLUDE_NAMES.has(path.basename(source)),
  });
}

await mkdir(releaseRoot, { recursive: true });
await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

for (const relativePath of INCLUDE_PATHS) {
  await copyPath(relativePath);
}

await writeFile(path.join(releaseDir, "RELEASE_MANIFEST.json"), `${JSON.stringify({
  name: packageJson.name,
  version: packageJson.version,
  package: releaseName,
  generatedAt: new Date().toISOString(),
  localOnly: true,
  packageKinds: {
    webPreview: `${releaseName}/public`,
    desktopInstaller: "Use docs/DESKTOP_RELEASE_PLAN.md naming and checksum rules for platform builds.",
  },
  preflight: [
    "Run npm test before publishing a GitHub release.",
    "Confirm release package contains no user documents, logs, caches, .git, .local, or node_modules.",
    "Confirm OFD, PNG/image, PDF, and OOXML paths are available as core local capabilities without plugin installation.",
  ],
  includedPaths: INCLUDE_PATHS,
}, null, 2)}\n`, "utf8");

console.log(`Release package prepared at ${relativeReleaseDir}`);
