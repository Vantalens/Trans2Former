# Trans2Former

> Local-first multi-format document conversion tool

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Русский](README.ru.md) | [العربية](README.ar.md)

Trans2Former is a desktop-grade document conversion tool: 14 input formats, 11 output formats, with all conversions performed entirely on your machine. It uploads no files, requires no Office / LibreOffice / Pandoc, and generates an explainable quality verification report for every conversion.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-28%20scripts%20passing-brightgreen.svg)](#)
[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](#)

---

## Features

- **Local-first**: conversion, OCR, and formula rendering all run offline; network access is blocked during document processing
- **Verifiable conversions**: three-layer validation — rule-based diff, SSIM visual comparison, and OCR read-back — written into a unified quality report and visualized in the workbench
- **Local OCR**: built-in PP-OCRv5 (ONNX Runtime, WebGPU / WASM) with orientation correction, deskewing, adaptive denoising, layout structure recognition, and quality scoring
- **Formula rendering**: local KaTeX typesetting for `$...$` / `$$...$$`
- **High performance**: parallel Web Worker pipeline with no artificial file size limit
- **Zero runtime dependencies**: core conversion requires no external office software

---

## Supported Formats

| Category | Input (14) | Output (11) |
| --- | --- | --- |
| Documents | Markdown, HTML, TXT, DOCX, PDF, EPUB | Markdown, HTML, TXT, DOCX, PDF, EPUB |
| Data | JSON, CSV, XML, XLSX | JSON, CSV, XML, XLSX |
| Presentations | PPTX | PPTX |
| Images | PNG (via OCR) | — |
| Experimental | DOC (text extraction only), OFD (early preview) | — |

Common paths: Markdown ↔ HTML · DOCX → Markdown · PDF → Markdown · XLSX ↔ CSV · HTML → PDF

See [docs/CONVERSION_PATHS.md](docs/CONVERSION_PATHS.md) for the full conversion matrix.

---

## Quick Start

```bash
npm install   # Install dependencies
npm start     # Start, then open http://localhost:3000 in your browser
npm test      # Run the test suite (28 scripts)
```

Desktop app (Tauri 2) and release packages:

```bash
npm run desktop:dev       # Desktop development mode
npm run release:prepare   # Build release packages
```

---

## Project Structure

```text
Trans2Former/
├── public/          # Frontend app (pure ESM, no build step)
│   ├── core/        # Data models, format registry, OCR, validation
│   ├── formats/     # Per-format readers / writers
│   └── workers/     # Web Worker conversion pipeline
├── docs/            # Full documentation
├── samples/         # Test samples
├── scripts/         # Build, vendor, and test scripts
└── src-tauri/       # Tauri desktop shell
```

---

## Core Local Capabilities

Enhanced capabilities are built directly into the core modules — no plugin mechanism. Model assets stay out of git; vendor scripts download them from pinned sources and verify them with SHA-256 ([scripts/paddleocr-models.manifest.json](scripts/paddleocr-models.manifest.json)). They ship with release packages and work out of the box.

- **PP-OCRv5 local OCR**: detection + recognition + orientation classification for images and scanned PDFs, with deskewing, denoising, layout merging, and confidence scoring
- **Tesseract.js lightweight OCR**: optional engine, enabled by importing tessdata in the Security Center
- **Three-layer conversion validation**: rule-based diff + SSIM + OCR read-back, with explainable results and graceful degradation
- **KaTeX math rendering**: zero network access

OCR runtime setup:

```bash
npm install onnxruntime-web
npm run vendor:onnx
npm run vendor:paddle
```

See [docs/PP_OCRV5_BROWSER_VERIFICATION.md](docs/PP_OCRV5_BROWSER_VERIFICATION.md) for the in-browser verification record.

---

## Data Security

- No uploads of files, file names, conversion results, or error logs
- Network access is blocked during document processing
- No third-party conversion APIs or analytics SDKs

See [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) for the full policy.

---

## Documentation

| Entry | Contents |
| --- | --- |
| [docs/README.md](docs/README.md) | Documentation index |
| [INSTALL.md](INSTALL.md) | Installation guide |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution and testing requirements |
| [docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md) | Core architecture |
| [docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md) | Conversion routing |
| [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) | Security policy |

---

## Known Limitations

1. Some complex styles cannot be fully preserved across format conversions
2. PPTX animations and charts are not yet supported
3. OCR has limited accuracy on heavily italicized or stylized text; DOC / OFD input is experimental
4. Oversized ZIP64 archives are not yet supported

---

## Contributing

Issues and Pull Requests are welcome: fork the repository → create a feature branch → commit your changes → open a PR. See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and testing requirements.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Links

- Repository: https://github.com/Vantalens/Trans2Former
- Feedback: [Issues](https://github.com/Vantalens/Trans2Former/issues) · [Discussions](https://github.com/Vantalens/Trans2Former/discussions)
- Community: https://linux.do/
