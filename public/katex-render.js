// LaTeX 渲染：把 inline 渲染器产出的 `<span class="t2f-math" data-tex="..." data-display="...">`
// 用 KaTeX 排版。KaTeX 按需懒加载（同源 vendor，不联网）：页面不再预载
// katex.min.css / katex.min.js，首次遇到 .t2f-math 节点时才动态注入，
// 加载完成后渲染全部节点；未加载成功时静默保留兜底文本（`$...$`）。

const KATEX_CSS_HREF = "/vendor/katex/katex.min.css";
const KATEX_JS_SRC = "/vendor/katex/katex.min.js";

let katexLoadPromise = null;

function ensureKatexLoaded() {
  if (globalThis.katex) return Promise.resolve(globalThis.katex);
  if (!katexLoadPromise) {
    katexLoadPromise = new Promise((resolve, reject) => {
      if (!document.querySelector(`link[href="${KATEX_CSS_HREF}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = KATEX_CSS_HREF;
        document.head.appendChild(link);
      }
      const script = document.createElement("script");
      script.src = KATEX_JS_SRC;
      script.onload = () => resolve(globalThis.katex);
      script.onerror = () => {
        // 允许下次重试；本轮调用方静默保留兜底文本
        katexLoadPromise = null;
        reject(new Error("KaTeX vendor load failed"));
      };
      document.head.appendChild(script);
    });
  }
  return katexLoadPromise;
}

function renderWithKatex(katex, root) {
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

export function renderMathIn(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  // 无数学节点：直接返回，不触发任何加载
  if (!root.querySelector(".t2f-math")) return;
  const katex = globalThis.katex;
  if (katex) {
    renderWithKatex(katex, root);
    return;
  }
  if (typeof document === "undefined") return;
  // 首次发现数学节点：懒加载 KaTeX（单例 Promise 防重复注入），完成后渲染
  ensureKatexLoaded()
    .then((loaded) => renderWithKatex(loaded, root))
    .catch(() => {
      // 加载失败保留 `$...$` 兜底文本
    });
}
