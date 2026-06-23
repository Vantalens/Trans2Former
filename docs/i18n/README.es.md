# Trans2Former

> Herramienta de conversión de documentos multiformato con prioridad local

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Русский](README.ru.md) | [العربية](README.ar.md)

Trans2Former es una herramienta de escritorio para la conversión de documentos: 14 formatos de entrada, 11 formatos de salida, y todas las conversiones se realizan en la máquina local. No sube archivos, no depende de Office / LibreOffice / Pandoc, y genera un informe de verificación de calidad explicable para cada conversión.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-28%20scripts%20passing-brightgreen.svg)](#)
[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](#)

---

## Características

- **Prioridad local**: la conversión, el OCR y el renderizado de fórmulas se ejecutan completamente sin conexión; el acceso a la red está prohibido durante la fase de procesamiento de documentos
- **Conversión verificable**: tres capas de verificación — diff basado en reglas, comparación visual SSIM y relectura OCR — que se escriben de forma unificada en el informe de calidad y se visualizan en el área de trabajo
- **OCR local**: PP-OCRv5 integrado (ONNX Runtime, WebGPU / WASM), con corrección de orientación, enderezado de inclinación, eliminación de ruido adaptativa, reconocimiento de la estructura de página y puntuación de calidad
- **Renderizado de fórmulas**: composición local de `$...$` / `$$...$$` con KaTeX
- **Alto rendimiento**: pipeline paralelo con Web Worker, sin límite artificial de tamaño de archivo
- **Cero dependencias en tiempo de ejecución**: la conversión principal no requiere ningún software ofimático externo

---

## Formatos compatibles

| Categoría | Entrada (14 formatos) | Salida (11 formatos) |
| --- | --- | --- |
| Documentos | Markdown, HTML, TXT, DOCX, PDF, EPUB | Markdown, HTML, TXT, DOCX, PDF, EPUB |
| Datos | JSON, CSV, XML, XLSX | JSON, CSV, XML, XLSX |
| Presentaciones | PPTX | PPTX |
| Imágenes | PNG (reconocimiento OCR) | — |
| Experimental | DOC (solo extracción de texto), OFD (vista previa temprana) | — |

Rutas comunes: Markdown ↔ HTML · DOCX → Markdown · PDF → Markdown · XLSX ↔ CSV · HTML → PDF

La matriz de conversión completa está en [docs/CONVERSION_PATHS.md](docs/CONVERSION_PATHS.md).

---

## Inicio rápido

```bash
npm install   # instalar dependencias
npm start     # iniciar; abrir http://localhost:3000 en el navegador
npm test      # ejecutar la suite de pruebas (28 scripts)
```

Aplicación de escritorio (Tauri 2) y paquetes de lanzamiento:

```bash
npm run desktop:dev       # modo de desarrollo de escritorio
npm run release:prepare   # generar el paquete de lanzamiento
```

---

## Estructura del proyecto

```text
Trans2Former/
├── public/          # aplicación frontend (ESM puro, sin paso de compilación)
│   ├── core/        # modelos de datos, registro de formatos, OCR, verificación
│   ├── formats/     # readers / writers de cada formato
│   └── workers/     # pipeline de conversión con Web Worker
├── docs/            # documentación completa
├── samples/         # muestras de prueba
├── scripts/         # scripts de compilación, vendor y pruebas
└── src-tauri/       # shell de escritorio Tauri
```

---

## Capacidades locales principales

Las capacidades avanzadas están integradas directamente en los módulos principales, sin mecanismo de plugins; los recursos de modelos no se incluyen en git: el script vendor los descarga desde fuentes fijadas y los verifica con SHA-256 ([scripts/paddleocr-models.manifest.json](scripts/paddleocr-models.manifest.json)); se distribuyen con el paquete de lanzamiento y funcionan de inmediato.

- **OCR local PP-OCRv5**: detección + reconocimiento + clasificación de orientación para imágenes y PDF escaneados, con enderezado, eliminación de ruido, fusión de la estructura de página y puntuación de confianza
- **OCR ligero Tesseract.js**: motor opcional; se habilita importando tessdata en el centro de seguridad
- **Verificación de conversión en tres capas**: diff basado en reglas + SSIM + relectura OCR, con resultados explicables y degradación controlada
- **Renderizado matemático KaTeX**: sin conexión a la red

Preparación del entorno de ejecución de OCR:

```bash
npm install onnxruntime-web
npm run vendor:onnx
npm run vendor:paddle
```

El registro de verificación en navegador está en [docs/PP_OCRV5_BROWSER_VERIFICATION.md](docs/PP_OCRV5_BROWSER_VERIFICATION.md).

---

## Seguridad de los datos

- No se suben archivos, nombres de archivo, resultados de conversión ni registros de errores
- El acceso a la red está prohibido durante la fase de procesamiento de documentos
- No se integran API de conversión de terceros ni SDK de analítica

La política completa está en [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md).

---

## Documentación

| Entrada | Contenido |
| --- | --- |
| [docs/README.md](docs/README.md) | Índice general de la documentación |
| [INSTALL.md](INSTALL.md) | Guía de instalación |
| [CHANGELOG.md](CHANGELOG.md) | Historial de versiones |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Requisitos de contribución y pruebas |
| [docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md) | Arquitectura principal |
| [docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md) | Enrutamiento de conversiones |
| [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) | Política de seguridad |

---

## Limitaciones conocidas

1. Algunos estilos complejos no pueden conservarse por completo en las conversiones entre formatos
2. Las animaciones y los gráficos de PPTX aún no son compatibles
3. El OCR tiene un reconocimiento limitado de cursivas pronunciadas y texto artístico; las entradas DOC / OFD son experimentales
4. Todavía no se admiten archivos comprimidos extragrandes ZIP64

---

## Contribuir

Los Issues y Pull Requests son bienvenidos: haz un fork del repositorio → crea una rama de funcionalidad → confirma tus cambios → abre un PR. Las normas de desarrollo y los requisitos de pruebas están en [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Licencia

MIT; consulta [LICENSE](LICENSE) para más detalles.

---

## Enlaces

- Repositorio: https://github.com/Vantalens/Trans2Former
- Comentarios y problemas: [Issues](https://github.com/Vantalens/Trans2Former/issues) · [Discussions](https://github.com/Vantalens/Trans2Former/discussions)
- Comunidad: https://linux.do/
