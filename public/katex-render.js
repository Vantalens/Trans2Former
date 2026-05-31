// LaTeX 渲染：把 inline 渲染器产出的 `<span class="t2f-math" data-tex="..." data-display="...">`
// 用 KaTeX 排版。KaTeX 经 <script src="/vendor/katex/katex.min.js"> 以全局 `katex` 提供
// （同源 vendor，不联网）。未加载到 katex 时静默保留兜底文本（`$...$`）。

export function renderMathIn(root) {
  const katex = globalThis.katex;
  if (!katex || !root || typeof root.querySelectorAll !== "function") return;
  const nodes = root.querySelectorAll(".t2f-math");
  for (const el of nodes) {
    if (el.dataset.rendered === "1") continue;
    const tex = el.dataset.tex || "";
    try {
      katex.render(tex, el, {
        displayMode: el.dataset.display === "true",
        throwOnError: false,
        output: "html",
      });
      el.dataset.rendered = "1";
    } catch (error) {
      // 渲染失败保留 span 内的兜底文本（`$tex$`），不影响其余内容。
    }
  }
}
