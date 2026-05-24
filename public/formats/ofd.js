import { createDocumentModel, createParagraph } from "../core/document-model.js";
import { createFixedLayoutModel } from "../core/models/fixed-layout.js";
import { createWarning, withWarnings } from "../core/warnings.js";
import { readZipEntries } from "../core/zip-container.js";

function extractTag(xml, localName) {
  const pattern = new RegExp(`<[^:>/]*:?${localName}\\b[^>]*>([\\s\\S]*?)<\\/[^:>]*:?${localName}>`, "i");
  return String(xml || "").match(pattern)?.[1]?.trim() || "";
}

function extractOfdXml(content) {
  const source = String(content || "");
  if (!source.startsWith("data:")) {
    return { xml: source, container: "xml", entryCount: 0 };
  }
  const zip = readZipEntries(source);
  const rootEntry = ["OFD.xml", "ofd.xml"].find((entry) => zip.has(entry))
    || zip.list().find((entry) => entry.toLowerCase().endsWith(".xml"));
  return {
    xml: rootEntry ? zip.getText(rootEntry) : "",
    container: "zip",
    rootEntry: rootEntry || "",
    entryCount: zip.list().length,
  };
}

export function readOfdL0({ content, title = "document", fileName = "", format = "ofd" }) {
  const extracted = extractOfdXml(content);
  const xml = extracted.xml;
  const docId = extractTag(xml, "DocID");
  const ofdTitle = extractTag(xml, "Title") || title;
  const docRoot = extractTag(xml, "DocRoot");
  const warnings = [
    createWarning("unsupported", "OFD_L1_CORE_LIMITED", "OFD L1 page tree, text objects, image objects, and attachments are not yet fully implemented in the core reader."),
    createWarning("unsupported", "OFD_RENDER_CORE_LIMITED", "OFD rendering to PDF requires the core OFD renderer milestone and visual regression coverage."),
  ];

  const model = createDocumentModel({
    title: ofdTitle,
    sourceFormat: format,
    blocks: [
      createParagraph(`OFD container registered: ${ofdTitle}`),
      createParagraph(`Document root: ${docRoot || "(not declared)"}`),
    ],
    metadata: withWarnings({
      ofd: {
        level: "L0",
        container: extracted.container,
        rootEntry: extracted.rootEntry || "",
        entryCount: extracted.entryCount || 0,
        docId,
        docRoot,
        fileName,
        localOnly: true,
      },
    }, warnings),
  });
  // OFD L0 阶段先挂空 FixedLayoutModel 占位，让 capability 视图能识别模型存在但 pages 为空。
  model.fixedLayout = createFixedLayoutModel({
    pages: [],
    metadata: { level: "L0", coreIntegrated: true },
  });
  return model;
}
