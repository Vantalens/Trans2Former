# Trans2Former

> Local-First-Werkzeug zur Konvertierung von Dokumenten in mehreren Formaten

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Русский](README.ru.md) | [العربية](README.ar.md)

Trans2Former ist ein Desktop-Werkzeug zur Dokumentkonvertierung: 14 Eingabeformate, 11 Ausgabeformate, sämtliche Konvertierungen erfolgen vollständig auf dem lokalen Rechner. Keine Datei-Uploads, keine Abhängigkeit von Office / LibreOffice / Pandoc, und für jede Konvertierung wird ein nachvollziehbarer Qualitätsprüfbericht erzeugt.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-28%20scripts%20passing-brightgreen.svg)](#)
[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](#)

---

## Funktionen

- **Local-First**: Konvertierung, OCR und Formelrendering laufen vollständig offline; während der Dokumentverarbeitung ist der Netzwerkzugriff untersagt
- **Überprüfbare Konvertierung**: Dreistufige Validierung aus Regel-Diff, SSIM-Bildvergleich und OCR-Rücklesung, einheitlich im Qualitätsbericht erfasst und im Arbeitsbereich sichtbar
- **Lokale OCR**: Integriertes PP-OCRv5 (ONNX Runtime, WebGPU / WASM) mit Ausrichtungskorrektur, Schräglagenkorrektur, adaptiver Rauschunterdrückung, Layout-Strukturerkennung und Qualitätsbewertung
- **Formelrendering**: Lokaler KaTeX-Satz von `$...$` / `$$...$$`
- **Hohe Leistung**: Parallele Web-Worker-Pipeline, keine künstliche Obergrenze für Dateigrößen
- **Keine Laufzeitabhängigkeiten**: Die Kernkonvertierung benötigt keinerlei externe Office-Software

---

## Unterstützte Formate

| Kategorie | Eingabe (14 Formate) | Ausgabe (11 Formate) |
| --- | --- | --- |
| Dokumente | Markdown, HTML, TXT, DOCX, PDF, EPUB | Markdown, HTML, TXT, DOCX, PDF, EPUB |
| Daten | JSON, CSV, XML, XLSX | JSON, CSV, XML, XLSX |
| Präsentationen | PPTX | PPTX |
| Bilder | PNG (OCR-Erkennung) | — |
| Experimentell | DOC (nur Textextraktion), OFD (frühe Vorschau) | — |

Häufige Pfade: Markdown ↔ HTML · DOCX → Markdown · PDF → Markdown · XLSX ↔ CSV · HTML → PDF

Die vollständige Konvertierungsmatrix finden Sie unter [docs/CONVERSION_PATHS.md](docs/CONVERSION_PATHS.md).

---

## Schnellstart

```bash
npm install   # Abhängigkeiten installieren
npm start     # Starten, im Browser http://localhost:3000 öffnen
npm test      # Testsuite ausführen (28 Skripte)
```

Desktop-Anwendung (Tauri 2) und Release-Pakete:

```bash
npm run desktop:dev       # Desktop-Entwicklungsmodus
npm run release:prepare   # Release-Pakete erzeugen
```

---

## Projektstruktur

```text
Trans2Former/
├── public/          # Frontend-Anwendung (reines ESM, kein Build-Schritt)
│   ├── core/        # Datenmodelle, Formatregistrierung, OCR, Validierung
│   ├── formats/     # Reader / Writer für die einzelnen Formate
│   └── workers/     # Web-Worker-Konvertierungspipeline
├── docs/            # Vollständige Dokumentation
├── samples/         # Testbeispiele
├── scripts/         # Build-, Vendor- und Testskripte
└── src-tauri/       # Tauri-Desktop-Hülle
```

---

## Lokale Kernfunktionen

Erweiterte Fähigkeiten sind direkt in die Kernmodule integriert, ohne Plugin-Mechanismus. Modellressourcen werden nicht in Git eingecheckt, sondern per Vendor-Skript aus festgelegten Quellen heruntergeladen und per SHA-256 verifiziert ([scripts/paddleocr-models.manifest.json](scripts/paddleocr-models.manifest.json)); sie werden mit den Release-Paketen ausgeliefert und sind sofort einsatzbereit.

- **Lokale PP-OCRv5-OCR**: Detektion + Texterkennung + Ausrichtungsklassifikation für Bilder und gescannte PDFs, einschließlich Schräglagenkorrektur, Rauschunterdrückung, Layout-Zusammenführung und Konfidenzbewertung
- **Leichtgewichtige Tesseract.js-OCR**: Optionale Engine, aktivierbar durch Import von tessdata im Sicherheitscenter
- **Dreistufige Konvertierungsvalidierung**: Regel-Diff + SSIM + OCR-Rücklesung, Ergebnisse nachvollziehbar und degradierbar
- **KaTeX-Mathematikrendering**: Ohne jeden Netzwerkzugriff

Vorbereitung der OCR-Laufzeitumgebung:

```bash
npm install onnxruntime-web
npm run vendor:onnx
npm run vendor:paddle
```

Das browserseitige Verifizierungsprotokoll finden Sie unter [docs/PP_OCRV5_BROWSER_VERIFICATION.md](docs/PP_OCRV5_BROWSER_VERIFICATION.md).

---

## Datensicherheit

- Keine Übertragung von Dateien, Dateinamen, Konvertierungsergebnissen oder Fehlerprotokollen
- Netzwerkzugriff während der Dokumentverarbeitung untersagt
- Keine Anbindung an Drittanbieter-Konvertierungs-APIs oder Analyse-SDKs

Die vollständige Richtlinie finden Sie unter [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md).

---

## Dokumentation

| Einstieg | Inhalt |
| --- | --- |
| [docs/README.md](docs/README.md) | Gesamtindex der Dokumentation |
| [INSTALL.md](INSTALL.md) | Installationsanleitung |
| [CHANGELOG.md](CHANGELOG.md) | Versionshistorie |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Beitrags- und Testanforderungen |
| [docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md) | Kernarchitektur |
| [docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md) | Konvertierungsrouting |
| [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) | Sicherheitsrichtlinie |

---

## Bekannte Einschränkungen

1. Einige komplexe Formatierungen lassen sich bei der formatübergreifenden Konvertierung nicht vollständig erhalten
2. PPTX-Animationen und -Diagramme werden noch nicht unterstützt
3. OCR erkennt stark kursive Schrift und Schmuckschriften nur eingeschränkt; DOC-/OFD-Eingabe ist experimentell
4. ZIP64-Großarchive werden derzeit nicht unterstützt

---

## Mitwirken

Issues und Pull Requests sind willkommen: Repository forken → Feature-Branch erstellen → Änderungen committen → PR eröffnen. Entwicklungsrichtlinien und Testanforderungen finden Sie in [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Lizenz

MIT, Details siehe [LICENSE](LICENSE).

---

## Links

- Repository: https://github.com/Vantalens/Trans2Former
- Feedback: [Issues](https://github.com/Vantalens/Trans2Former/issues) · [Discussions](https://github.com/Vantalens/Trans2Former/discussions)
- Community: https://linux.do/
