# Trans2Former

> Outil de conversion de documents multi-formats, priorité au local

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Русский](README.ru.md) | [العربية](README.ar.md)

Trans2Former est un outil de bureau pour la conversion de documents : 14 formats d'entrée, 11 formats de sortie, toutes les conversions s'effectuent en local. Aucun téléversement de fichiers, aucune dépendance à Office / LibreOffice / Pandoc, et chaque conversion génère un rapport de contrôle qualité explicable.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-28%20scripts%20passing-brightgreen.svg)](#)
[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](#)

---

## Caractéristiques

- **Priorité au local** : conversion, OCR et rendu de formules s'exécutent entièrement hors ligne ; tout accès réseau est interdit pendant la phase de traitement des documents
- **Conversions vérifiables** : trois niveaux de validation — diff par règles, comparaison visuelle SSIM, relecture OCR — consignés dans un rapport qualité unifié et visibles dans l'espace de travail
- **OCR local** : PP-OCRv5 intégré (ONNX Runtime, WebGPU / WASM), avec correction d'orientation, redressement d'inclinaison, débruitage adaptatif, reconnaissance de la structure de mise en page et score de qualité
- **Rendu de formules** : composition locale avec KaTeX pour `$...$` / `$$...$$`
- **Hautes performances** : pipeline parallèle en Web Worker, sans limite artificielle de taille de fichier
- **Zéro dépendance d'exécution** : la conversion de base ne nécessite aucun logiciel bureautique externe

---

## Formats pris en charge

| Catégorie | Entrée (14 formats) | Sortie (11 formats) |
| --- | --- | --- |
| Documents | Markdown, HTML, TXT, DOCX, PDF, EPUB | Markdown, HTML, TXT, DOCX, PDF, EPUB |
| Données | JSON, CSV, XML, XLSX | JSON, CSV, XML, XLSX |
| Présentations | PPTX | PPTX |
| Images | PNG (reconnaissance OCR) | — |
| Expérimental | DOC (extraction de texte uniquement), OFD (aperçu préliminaire) | — |

Chemins courants : Markdown ↔ HTML · DOCX → Markdown · PDF → Markdown · XLSX ↔ CSV · HTML → PDF

Matrice complète des conversions : [docs/CONVERSION_PATHS.md](docs/CONVERSION_PATHS.md).

---

## Démarrage rapide

```bash
npm install   # Installer les dépendances
npm start     # Démarrer, puis ouvrir http://localhost:3000 dans le navigateur
npm test      # Exécuter la suite de tests (28 scripts)
```

Application de bureau (Tauri 2) et paquets de publication :

```bash
npm run desktop:dev       # Mode développement bureau
npm run release:prepare   # Générer les paquets de publication
```

---

## Structure du projet

```text
Trans2Former/
├── public/          # Application front-end (ESM pur, sans étape de build)
│   ├── core/        # Modèles de données, registre des formats, OCR, validation
│   ├── formats/     # reader / writer pour chaque format
│   └── workers/     # Pipeline de conversion en Web Worker
├── docs/            # Documentation complète
├── samples/         # Échantillons de test
├── scripts/         # Scripts de build, vendor et tests
└── src-tauri/       # Shell de bureau Tauri
```

---

## Capacités locales de base

Les capacités avancées sont intégrées directement dans les modules de base, sans mécanisme de plugins ; les ressources de modèles ne sont pas versionnées dans git : elles sont téléchargées par les scripts vendor depuis des sources épinglées et vérifiées par SHA-256 ([scripts/paddleocr-models.manifest.json](scripts/paddleocr-models.manifest.json)), distribuées avec les paquets de publication et utilisables dès l'installation.

- **OCR local PP-OCRv5** : détection + reconnaissance + classification d'orientation pour les images et les PDF numérisés, avec redressement, débruitage, fusion de mise en page et score de confiance
- **OCR léger Tesseract.js** : moteur optionnel, activable en important les tessdata dans le centre de sécurité
- **Validation de conversion à trois niveaux** : diff par règles + SSIM + relecture OCR, résultats explicables avec repli possible
- **Rendu mathématique KaTeX** : zéro accès réseau

Préparation de l'environnement d'exécution OCR :

```bash
npm install onnxruntime-web
npm run vendor:onnx
npm run vendor:paddle
```

Journal de vérification côté navigateur : [docs/PP_OCRV5_BROWSER_VERIFICATION.md](docs/PP_OCRV5_BROWSER_VERIFICATION.md).

---

## Sécurité des données

- Aucun téléversement de fichiers, de noms de fichiers, de résultats de conversion ni de journaux d'erreurs
- Accès réseau interdit pendant la phase de traitement des documents
- Aucune API de conversion tierce ni SDK d'analyse

Politique complète : [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md).

---

## Documentation

| Entrée | Contenu |
| --- | --- |
| [docs/README.md](docs/README.md) | Index général de la documentation |
| [INSTALL.md](INSTALL.md) | Guide d'installation |
| [CHANGELOG.md](CHANGELOG.md) | Historique des versions |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Exigences de contribution et de tests |
| [docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md) | Architecture de base |
| [docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md) | Routage des conversions |
| [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) | Politique de sécurité |

---

## Limitations connues

1. Certains styles complexes ne peuvent pas être entièrement préservés lors des conversions entre formats
2. Les animations et les graphiques PPTX ne sont pas encore pris en charge
3. La reconnaissance OCR des italiques prononcés et des polices artistiques est limitée ; les entrées DOC / OFD sont expérimentales
4. Les archives compressées ZIP64 de très grande taille ne sont pas encore prises en charge

---

## Contribution

Les Issues et les Pull Requests sont les bienvenues : forkez le dépôt → créez une branche de fonctionnalité → validez vos modifications → ouvrez une PR. Normes de développement et exigences de tests : [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Licence

MIT, voir [LICENSE](LICENSE).

---

## Liens

- Dépôt : https://github.com/Vantalens/Trans2Former
- Signalement de problèmes : [Issues](https://github.com/Vantalens/Trans2Former/issues) · [Discussions](https://github.com/Vantalens/Trans2Former/discussions)
- Communauté : https://linux.do/
