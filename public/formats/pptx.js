import { createAssetReference, createDocumentModel, createHeading, createParagraph, createTable } from "../core/document-model.js";
import { createSlideModel } from "../core/models/slide-model.js";
import { createAssetStore } from "../core/asset-store.js";
import { bytesToDataUrl } from "../core/binary-utils.js";
import { readZipEntries } from "../core/zip-container.js";
import { writeStoredZip } from "../core/zip-writer.js";
import { getPlainText } from "../core/document-model.js";
import { extractTextTags, getAttr, parseRelationships, resolvePartPath } from "./ooxml-utils.js";
import { escapeXmlText, stripMarkdownInlineSyntax } from "./text-utils.js";

function bytesToBase64(bytes) {
  // 优先使用 Buffer (Node.js)，比 btoa 快 100 倍
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  // 浏览器环境使用 btoa，分块处理避免 O(n²)
  if (typeof btoa === "function") {
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 8192) {
      chunks.push(String.fromCharCode(...bytes.slice(i, i + 8192)));
    }
    return btoa(chunks.join(""));
  }
  return "";
}

function mimeFromPath(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

function parseTables(xml) {
  const tables = [];
  for (const tableMatch of String(xml || "").matchAll(/<a:tbl\b[\s\S]*?<\/a:tbl>/g)) {
    const rows = [...tableMatch[0].matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)]
      .map((rowMatch) => [...rowMatch[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)].map((cellMatch) => extractTextTags(cellMatch[0], "a:t").trim()))
      .filter((row) => row.length > 0);
    const headers = rows.shift() || [];
    if (headers.length > 0) tables.push(createTable(headers, rows));
  }
  return tables;
}

function parsePictures(xml, relationships, zip, assetStore) {
  const blocks = [];
  for (const picMatch of String(xml || "").matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)) {
    const imageId = getAttr(picMatch[0].match(/<a:blip\b[^>]*\/?>/)?.[0] || "", "r:embed");
    const relationship = relationships.get(imageId);
    const target = relationship?.resolvedTarget || resolvePartPath("ppt/slides/slide1.xml", relationship?.target || "");
    const bytes = target ? zip.getBytes(target) : null;
    if (!bytes) continue;
    const mime = mimeFromPath(target);
    const cNvPr = picMatch[0].match(/<p:cNvPr\b[^>]*\/?>/)?.[0] || "";
    const alt = getAttr(cNvPr, "descr") || getAttr(cNvPr, "name") || target.split("/").pop() || imageId;
    const asset = assetStore.add({
      name: target.split("/").pop() || imageId,
      mime,
      data: `data:${mime};base64,${bytesToBase64(bytes)}`,
      size: bytes.length,
      role: "image",
    });
    blocks.push(createAssetReference(asset.id, { alt, title: asset.name }));
  }
  return blocks;
}

function parseSlide(xml, index, relationships, zip, assetStore) {
  const shapes = [...String(xml || "").matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)];
  const texts = shapes.map((shape) => extractTextTags(shape[0], "a:t").trim()).filter(Boolean);
  const blocks = [];
  if (texts.length > 0) {
    blocks.push(createHeading(2, `Slide ${index}: ${texts[0]}`));
    texts.slice(1).forEach((text) => blocks.push(createParagraph(text)));
  }
  blocks.push(...parsePictures(xml, relationships, zip, assetStore));
  blocks.push(...parseTables(xml));
  return { blocks, texts };
}

export function readPptx({ content, title = "presentation", fileName = "", format = "pptx" }) {
  const zip = readZipEntries(content);
  const rels = parseRelationships(zip.getText("ppt/_rels/presentation.xml.rels"), "ppt/presentation.xml");
  const assetStore = createAssetStore();
  const slideTargets = [...rels.values()]
    .filter((relationship) => relationship.type.includes("/slide") || relationship.type === "slide")
    .map((relationship) => relationship.resolvedTarget)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const blocks = [];
  const slideRecords = [];
  let notesSlideCount = 0;
  let masterReferenceCount = 0;
  slideTargets.forEach((target, index) => {
    const slideRels = parseRelationships(zip.getText(`${target.split("/").slice(0, -1).join("/")}/_rels/${target.split("/").pop()}.rels`), target);
    const slideXml = zip.getText(target);
    const parsed = parseSlide(slideXml, index + 1, slideRels, zip, assetStore);
    blocks.push(...parsed.blocks);
    let notes = "";
    for (const relationship of slideRels.values()) {
      if (relationship.type.endsWith("/notesSlide") || relationship.type === "notesSlide") {
        notesSlideCount += 1;
        const notesText = extractTextTags(zip.getText(relationship.resolvedTarget), "a:t").trim();
        if (notesText) {
          blocks.push(createParagraph(`Speaker notes: ${notesText}`));
          notes = notesText;
        }
      }
      if (relationship.type.endsWith("/slideMaster") || relationship.type === "slideMaster") {
        masterReferenceCount += 1;
      }
    }
    slideRecords.push({
      pageNumber: index + 1,
      title: parsed.texts[0] || "",
      shapes: parsed.texts.map((text) => ({ type: "text", text })),
      notes,
    });
  });
  const model = createDocumentModel({
    title,
    sourceFormat: format,
    blocks,
    assets: assetStore.toJSON(),
    metadata: {
      ooxml: {
        container: "zip",
        presentationPart: "ppt/presentation.xml",
        slideCount: slideTargets.length,
        notesSlideCount,
        masterReferenceCount,
        compressionMethods: zip.methods(),
        entryCount: zip.list().length,
        fileName,
      },
    },
  });
  // P8-M3：在顶层挂 SlideModel，让 mapper / writer 直接消费 slide-level 结构。
  model.slides = createSlideModel({
    slides: slideRecords,
  });
  return model;
}

function slideTextBlocks(model) {
  const text = getPlainText(model);
  const lines = stripMarkdownInlineSyntax(text).split(/\n+/).filter(Boolean);
  return lines.length > 0 ? lines : [model.title || "Document"];
}

function slideXml(model, title) {
  const NS = "http" + "://schemas.openxmlformats.org";
  const lines = slideTextBlocks(model).slice(0, 10);
  const body = lines.map((line, index) => [
    "        <a:p>",
    `          <a:r><a:rPr lang="zh-CN" sz="${index === 0 ? 2800 : 1800}"/><a:t>${escapeXmlText(line)}</a:t></a:r>`,
    "        </a:p>",
  ].join("\n")).join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${NS}/drawingml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships" xmlns:p="${NS}/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="${escapeXmlText(title)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr/>
      <p:txBody>
        <a:bodyPr/>
        <a:lstStyle/>
${body}
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function generateThemeXml(NS) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="${NS}/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
      <a:lt2><a:srgbClr val="EBEBEB"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hyperlink><a:srgbClr val="0563C1"/></a:hyperlink>
      <a:folHyperlink><a:srgbClr val="954F72"/></a:folHyperlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont><a:latin typeface="Calibri"/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"/></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
</a:theme>`;
}

function generateSlideMasterXml(NS) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="${NS}/drawingml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships" xmlns:p="${NS}/presentationml/2006/main">
  <p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
  </p:spTree></p:cSld>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId2"/></p:sldLayoutIdLst>
  <p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldMaster>`;
}

function generateSlideLayoutXml(NS) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="${NS}/drawingml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships" xmlns:p="${NS}/presentationml/2006/main" type="blank">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;
}

export function writePptx({ model, title = model.title }) {
  const NS = "http" + "://schemas.openxmlformats.org";
  const DC_NS = "http" + "://purl.org/dc/elements/1.1/";
  const EP_NS = "http" + "://schemas.openxmlformats.org/officeDocument/2006/extended-properties";
  const zipBytes = writeStoredZip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="${NS}/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="${NS}/package/2006/relationships">
  <Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="${NS}/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="${NS}/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    {
      name: "ppt/_rels/presentation.xml.rels",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="${NS}/package/2006/relationships">
  <Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="${NS}/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId3" Type="${NS}/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`,
    },
    {
      name: "ppt/presentation.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${NS}/drawingml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships" xmlns:p="${NS}/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId2"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`,
    },
    {
      name: "docProps/core.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="${NS}/package/2006/metadata/core-properties" xmlns:dc="${DC_NS}"><dc:title>${escapeXmlText(title)}</dc:title></cp:coreProperties>`,
    },
    {
      name: "docProps/app.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="${EP_NS}"><Application>Trans2Former</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>1</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides></Properties>`,
    },
    { name: "ppt/slides/slide1.xml", data: slideXml(model, title) },
    { name: "ppt/slides/_rels/slide1.xml.rels", data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>` },
    { name: "ppt/theme/theme1.xml", data: generateThemeXml(NS) },
    { name: "ppt/slideMasters/slideMaster1.xml", data: generateSlideMasterXml(NS) },
    { name: "ppt/slideLayouts/slideLayout1.xml", data: generateSlideLayoutXml(NS) },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${NS}/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>` },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/><Relationship Id="rId2" Type="${NS}/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>` },
  ]);
  return {
    type: "binary",
    format: "pptx",
    data: bytesToDataUrl(zipBytes, "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
}
