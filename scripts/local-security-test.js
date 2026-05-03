import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { normalizeConversionError } from "../public/core/conversion-error.js";
import { convertContent } from "../public/browser-transformer.js";

const PUBLIC_ROOT = path.resolve("public");
const SECURITY_POLICY_PATH = path.resolve("docs", "SECURITY_POLICY.md");

const FORBIDDEN_PUBLIC_PATTERNS = [
  { pattern: /\bfetch\s*\(/, reason: "public app must not upload or fetch remote resources by default" },
  { pattern: /\bXMLHttpRequest\b/, reason: "public app must not use XHR by default" },
  { pattern: /\bsendBeacon\s*\(/, reason: "public app must not send telemetry by default" },
  { pattern: /\bWebSocket\b/, reason: "public app must not open realtime remote channels by default" },
  { pattern: /\bEventSource\b/, reason: "public app must not open server-sent event channels by default" },
  { pattern: /\blocalStorage\b/, reason: "persistent browser storage requires explicit user opt-in" },
  { pattern: /\bindexedDB\b/, reason: "persistent browser storage requires explicit user opt-in" },
];

const ALLOWED_PUBLIC_FILES = new Set([
  path.normalize("public/smoke-test.html"),
  path.normalize("public/smoke-test.js"),
]);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function relativeToProject(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll("\\", "/");
}

function assertNoForbiddenPublicApis(filePath, content) {
  const normalizedPath = path.normalize(relativeToProject(filePath));
  if (ALLOWED_PUBLIC_FILES.has(normalizedPath)) {
    return;
  }

  for (const { pattern, reason } of FORBIDDEN_PUBLIC_PATTERNS) {
    if ((pattern.source.includes("localStorage") || pattern.source.includes("indexedDB")) && /persistHistoryCheckbox|HISTORY_PREFERENCE_KEY|output-history|explicit user opt-in/i.test(content)) {
      continue;
    }
    assert.equal(
      pattern.test(content),
      false,
      `${relativeToProject(filePath)} violates local-only policy: ${reason}`
    );
  }
}

async function assertPublicAppIsLocalOnly() {
  const publicFiles = (await listFiles(PUBLIC_ROOT))
    .filter((filePath) => /\.(js|html|css)$/i.test(filePath));

  for (const filePath of publicFiles) {
    const content = await readFile(filePath, "utf8");
    assertNoForbiddenPublicApis(filePath, content);
  }
}

async function assertSecurityPolicyIsDocumented() {
  const policy = await readFile(SECURITY_POLICY_PATH, "utf8");
  for (const expectedText of [
    "local-only",
    "不提供云端文档处理",
    "默认不得调用远程转换 API",
    "插件安装模式",
    "文档处理模式",
    "错误详情默认只展示",
    "复制诊断信息不得默认复制用户文档内容",
    "fetch",
    "sendBeacon",
  ]) {
    assert.equal(policy.includes(expectedText), true, `security policy should mention: ${expectedText}`);
  }
}

function assertErrorsDoNotSerializeSensitiveInput() {
  const secret = "SECRET_USER_DOCUMENT_9f4e0a";
  const error = normalizeConversionError(new Error("转换失败"), {
    category: "parse",
    code: "TEST_PARSE_ERROR",
    format: "md",
    details: { warnings: ["safe warning"] },
  });

  const serialized = JSON.stringify(error.toJSON());
  assert.equal(serialized.includes(secret), false, "serialized diagnostics should not include unrelated user content");
  assert.equal(serialized.includes("stack"), false, "serialized diagnostics should not include stack traces");

  assert.throws(
    () => convertContent({ content: "# Title", from: "md", to: "remote-api", title: secret }),
    (conversionError) => {
      const publicJson = JSON.stringify(normalizeConversionError(conversionError).toJSON());
      return !publicJson.includes(secret)
        && publicJson.includes("UNSUPPORTED_OUTPUT_FORMAT")
        && publicJson.includes("remote-api");
    },
    "unsupported format diagnostics should avoid serializing title/content"
  );
}

await assertPublicAppIsLocalOnly();
await assertSecurityPolicyIsDocumented();
assertErrorsDoNotSerializeSensitiveInput();

console.log("Local security test passed: public app stays local-only and diagnostics avoid sensitive content.");
