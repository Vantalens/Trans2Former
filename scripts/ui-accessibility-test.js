import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

assert.match(html, /id="downloadOutputButton"[^>]*aria-disabled="true"[^>]*tabindex="-1"/);
assert.match(html, /id="dropZone"[^>]*role="button"[^>]*tabindex="0"[^>]*aria-describedby="fileMeta"/);
assert.match(html, /id="workbenchTabs"[^>]*role="tablist"/);
assert.match(html, /id="inputPreviewTab"[^>]*role="tab"[^>]*aria-selected="true"[^>]*aria-controls="inputPreviewPanel"/);
assert.match(html, /id="outputPreviewTab"[^>]*role="tab"[^>]*aria-selected="false"[^>]*aria-controls="outputPreviewPanel"[^>]*tabindex="-1"/);
assert.match(html, /id="inputPreviewPanel"[^>]*role="tabpanel"[^>]*aria-labelledby="inputPreviewTab"/);
assert.match(html, /id="outputPreviewPanel"[^>]*role="tabpanel"[^>]*aria-labelledby="outputPreviewTab"[^>]*hidden/);

assert.match(app, /dropZone\.addEventListener\("keydown"/);
assert.match(app, /fileInput\.click\(\)/);
assert.match(app, /button\.setAttribute\("aria-selected"/);
assert.match(app, /downloadOutputButton\.setAttribute\("aria-disabled", "true"\)/);
assert.match(app, /downloadOutputButton\.removeAttribute\("aria-disabled"\)/);
assert.match(app, /querySelectorAll\("\.auxiliary-actions\[open\], \.output-settings\[open\]"\)/);

assert.match(css, /\.mini-button\s*\{[^}]*min-height:\s*44px/s);
assert.match(css, /\.tab-button\s*\{[^}]*min-height:\s*44px/s);
assert.match(css, /\.toggle-label\s*\{[^}]*min-height:\s*44px/s);
assert.match(css, /\.toggle-label input\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px/s);
assert.match(css, /\.bottom-drawer-toggle\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s);
assert.match(css, /\.drawer-tab\s*\{[^}]*min-height:\s*44px/s);

console.log("UI accessibility test passed: upload keyboard access, ARIA tabs, disabled download state, details dismissal, and touch targets are covered.");
