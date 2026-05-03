import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_FILES = [
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/src/main.rs",
  "src-tauri/tauri.conf.json",
  "src-tauri/capabilities/default.json",
];

for (const file of REQUIRED_FILES) {
  await access(path.resolve(file));
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(packageJson.scripts["desktop:check"], "node scripts/desktop-shell-test.js");
assert.equal(packageJson.scripts["desktop:dev"], "npm exec @tauri-apps/cli -- dev");
assert.equal(packageJson.scripts["desktop:build"], "npm exec @tauri-apps/cli -- build");

const tauriConfig = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
assert.equal(tauriConfig.productName, "Trans2Former");
assert.equal(tauriConfig.identifier, "com.vantalens.trans2former");
assert.equal(tauriConfig.build.frontendDist, "../public");
assert.equal(tauriConfig.app.security.csp.includes("connect-src 'self'"), true);
assert.equal(tauriConfig.app.windows[0].title, "Trans2Former Desktop");

const capability = JSON.parse(await readFile("src-tauri/capabilities/default.json", "utf8"));
assert.equal(capability.identifier, "default");
assert.deepEqual(capability.windows, ["main"]);
assert.equal(capability.permissions.includes("core:default"), true);
assert.equal(capability.permissions.includes("dialog:allow-open"), true);
assert.equal(capability.permissions.includes("dialog:allow-save"), true);
assert.equal(capability.permissions.includes("fs:read-files"), true);
assert.equal(capability.permissions.includes("fs:write-files"), true);
assert.equal(capability.permissions.some((permission) => String(permission).includes("read-dirs")), false);
assert.equal(capability.permissions.some((permission) => String(permission).includes("shell:allow-open")), false);
assert.equal(capability.permissions.some((permission) => String(permission).includes("http:")), false);

const mainRs = await readFile("src-tauri/src/main.rs", "utf8");
assert.equal(mainRs.includes("Trans2Former local-only desktop shell"), true);
assert.equal(mainRs.includes("tauri::Builder::default()"), true);

console.log("Desktop shell test passed: Tauri scaffold and minimum permission boundary are present.");
