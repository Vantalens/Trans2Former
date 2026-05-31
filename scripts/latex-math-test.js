import assert from "node:assert/strict";

import {
  convertContent,
} from "../public/browser-transformer.js";
import { parseInlineMarkdown } from "../public/formats/inline-tokens.js";
import {
  inlinesToHtml,
  inlinesToMarkdown,
  inlinesToPlainText,
  createInlineMath,
} from "../public/core/models/semantic-inlines.js";

const BACKSLASH = String.fromCharCode(92);
const frac = `${BACKSLASH}frac{a}{b}`;       // \frac{a}{b}
const sum = `${BACKSLASH}sum_{i=1}^{n}`;     // \sum_{i=1}^{n}

// 1. Inline $...$ recognized; backslash + underscore preserved verbatim
{
  const toks = parseInlineMarkdown(`pre $x^2 + y_0$ post`);
  const math = toks.find((t) => t.type === "math");
  assert.ok(math, "inline $...$ should produce a math token");
  assert.equal(math.display, false);
  assert.equal(math.value, "x^2 + y_0");
}

// 2. Display $$...$$ preserves backslashes (no markdown escaping eats \frac / \sum)
{
  const toks = parseInlineMarkdown(`$$${frac} = ${sum} c_i$$`);
  const math = toks.find((t) => t.type === "math");
  assert.ok(math, "display $$...$$ should produce a math token");
  assert.equal(math.display, true);
  assert.equal(math.value.charCodeAt(0), 92, "value must start with a literal backslash");
  assert.ok(math.value.includes(frac), "\\frac must be preserved verbatim");
  assert.ok(math.value.includes(sum), "\\sum must be preserved verbatim");
}

// 3. Currency is NOT treated as math (heuristic: no inner-edge whitespace)
{
  const toks = parseInlineMarkdown("pay $5 and $10 today");
  assert.equal(toks.some((t) => t.type === "math"), false, "currency $5 / $10 must not become math");
}

// 4. HTML output emits a katex-targetable span carrying raw tex in data-tex
{
  const html = inlinesToHtml(parseInlineMarkdown(`$${frac}$`));
  assert.ok(html.includes('class="t2f-math"'), "math should render a .t2f-math span");
  assert.ok(html.includes('data-display="false"'));
  assert.ok(html.includes(`data-tex="${frac}"`), "data-tex must carry the raw tex (backslash preserved)");
}

// 5. Markdown round-trip preserves $...$ and $$...$$ verbatim
{
  const md = `inline $x^2$ and block:\n\n$$${frac}$$\n`;
  const toks = parseInlineMarkdown(`inline $x^2$ and block: $$${frac}$$`);
  const rendered = inlinesToMarkdown(toks);
  assert.ok(rendered.includes("$x^2$"), "inline math round-trips");
  assert.ok(rendered.includes(`$$${frac}$$`), "display math round-trips with backslash");

  const result = convertContent({ content: md, from: "md", to: "md", options: { repair: false } });
  assert.ok(result.data.includes("$x^2$"));
  assert.ok(result.data.includes(`$$${frac}$$`));
}

// 6. Plain text keeps delimited tex; createInlineMath factory shape
{
  const node = createInlineMath("E=mc^2", false);
  assert.deepEqual(node, { type: "math", value: "E=mc^2", display: false });
  assert.equal(inlinesToPlainText([node]), "$E=mc^2$");
  assert.equal(inlinesToPlainText([createInlineMath("x", true)]), "$$x$$");
}

// 7. End-to-end md -> html conversion emits math spans (not <em> from underscores)
{
  const result = convertContent({ content: `$$a_b + ${frac}$$`, from: "md", to: "html", options: { repair: false } });
  assert.ok(result.data.includes("t2f-math"), "html conversion should contain a math span");
  assert.ok(!result.data.includes("<em>b"), "underscore inside math must not become <em>");
}

console.log("LaTeX math test passed: inline/display tokenization (backslash + underscore preserved), currency exclusion, katex-targetable html span, markdown round-trip, plain-text + factory verified.");
