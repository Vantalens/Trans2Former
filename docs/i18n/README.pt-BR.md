# Trans2Former

> Ferramenta de conversão de documentos multiformato com prioridade local

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Русский](README.ru.md) | [العربية](README.ar.md)

O Trans2Former é uma ferramenta de conversão de documentos para desktop: 14 formatos de entrada, 11 formatos de saída, com todas as conversões realizadas localmente. Não envia arquivos, não depende de Office / LibreOffice / Pandoc e gera um relatório de verificação de qualidade explicável para cada conversão.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-28%20scripts%20passing-brightgreen.svg)](#)
[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](#)

---

## Recursos

- **Prioridade local**: conversão, OCR e renderização de fórmulas executados totalmente offline; o acesso à rede é proibido durante a fase de processamento de documentos
- **Conversão verificável**: três camadas de validação — diff baseado em regras, comparação visual SSIM e releitura por OCR — gravadas em um relatório de qualidade unificado e visíveis na bancada de trabalho
- **OCR local**: PP-OCRv5 integrado (ONNX Runtime, WebGPU / WASM), com correção de orientação, correção de inclinação, remoção adaptativa de ruído, reconhecimento da estrutura de layout e pontuação de qualidade
- **Renderização de fórmulas**: composição local com KaTeX para `$...$` / `$$...$$`
- **Alto desempenho**: pipeline paralelo com Web Worker, sem limite artificial de tamanho de arquivo
- **Zero dependências em tempo de execução**: a conversão principal não requer nenhum software de escritório externo

---

## Formatos suportados

| Categoria | Entrada (14 tipos) | Saída (11 tipos) |
| --- | --- | --- |
| Documentos | Markdown, HTML, TXT, DOCX, PDF, EPUB | Markdown, HTML, TXT, DOCX, PDF, EPUB |
| Dados | JSON, CSV, XML, XLSX | JSON, CSV, XML, XLSX |
| Apresentações | PPTX | PPTX |
| Imagens | PNG (reconhecimento OCR) | — |
| Experimental | DOC (apenas extração de texto), OFD (prévia inicial) | — |

Caminhos comuns: Markdown ↔ HTML · DOCX → Markdown · PDF → Markdown · XLSX ↔ CSV · HTML → PDF

A matriz completa de conversão está em [docs/CONVERSION_PATHS.md](docs/CONVERSION_PATHS.md).

---

## Início rápido

```bash
npm install   # Instalar dependências
npm start     # Iniciar e abrir http://localhost:3000 no navegador
npm test      # Executar a suíte de testes (28 scripts)
```

Aplicativo desktop (Tauri 2) e pacotes de lançamento:

```bash
npm run desktop:dev       # Modo de desenvolvimento desktop
npm run release:prepare   # Gerar pacotes de lançamento
```

---

## Estrutura do projeto

```text
Trans2Former/
├── public/          # Aplicação front-end (ESM puro, sem etapa de build)
│   ├── core/        # Modelos de dados, registro de formatos, OCR, validação
│   ├── formats/     # Readers / writers de cada formato
│   └── workers/     # Pipeline de conversão com Web Worker
├── docs/            # Documentação completa
├── samples/         # Amostras de teste
├── scripts/         # Scripts de build, vendor e testes
└── src-tauri/       # Shell desktop Tauri
```

---

## Capacidades locais principais

Os recursos avançados são integrados diretamente nos módulos principais, sem mecanismo de plugins; os recursos de modelo não entram no git — são baixados por scripts de vendor a partir de fontes fixadas e verificados via SHA-256 ([scripts/paddleocr-models.manifest.json](scripts/paddleocr-models.manifest.json)), distribuídos com os pacotes de lançamento e prontos para uso.

- **OCR local PP-OCRv5**: detecção + reconhecimento + classificação de orientação para imagens e PDFs digitalizados, com correção de inclinação, remoção de ruído, mesclagem de layout e pontuação de confiança
- **OCR leve Tesseract.js**: motor opcional, ativado ao importar tessdata na central de segurança
- **Validação de conversão em três camadas**: diff baseado em regras + SSIM + releitura por OCR, com resultados explicáveis e degradação controlada
- **Renderização matemática KaTeX**: zero acesso à rede

Preparação do runtime de OCR:

```bash
npm install onnxruntime-web
npm run vendor:onnx
npm run vendor:paddle
```

O registro de verificação no navegador está em [docs/PP_OCRV5_BROWSER_VERIFICATION.md](docs/PP_OCRV5_BROWSER_VERIFICATION.md).

---

## Segurança de dados

- Não envia arquivos, nomes de arquivo, resultados de conversão nem logs de erro
- O acesso à rede é proibido durante a fase de processamento de documentos
- Não integra APIs de conversão de terceiros nem SDKs de análise

A política completa está em [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md).

---

## Documentação

| Entrada | Conteúdo |
| --- | --- |
| [docs/README.md](docs/README.md) | Índice geral da documentação |
| [INSTALL.md](INSTALL.md) | Guia de instalação |
| [CHANGELOG.md](CHANGELOG.md) | Histórico de versões |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Requisitos de contribuição e testes |
| [docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md) | Arquitetura principal |
| [docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md) | Roteamento de conversão |
| [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) | Política de segurança |

---

## Limitações conhecidas

1. Alguns estilos complexos não podem ser totalmente preservados em conversões entre formatos
2. Animações e gráficos de PPTX ainda não são suportados
3. O OCR tem reconhecimento limitado de itálico muito inclinado e texto artístico; as entradas DOC / OFD são experimentais
4. Arquivos compactados muito grandes (ZIP64) ainda não são suportados

---

## Contribuição

Issues e Pull Requests são bem-vindos: faça um fork do repositório → crie um branch de feature → envie suas alterações → abra um PR. As normas de desenvolvimento e os requisitos de teste estão em [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Licença

MIT — consulte [LICENSE](LICENSE).

---

## Links

- Repositório: https://github.com/Vantalens/Trans2Former
- Feedback: [Issues](https://github.com/Vantalens/Trans2Former/issues) · [Discussions](https://github.com/Vantalens/Trans2Former/discussions)
- Comunidade: https://linux.do/
