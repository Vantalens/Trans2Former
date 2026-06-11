# Trans2Former

> 로컬 우선의 다중 포맷 문서 변환 도구

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Русский](README.ru.md) | [العربية](README.ar.md)

Trans2Former는 데스크톱급 문서 변환 도구입니다. 14종의 입력 포맷과 11종의 출력 포맷을 지원하며, 모든 변환은 로컬 컴퓨터에서 완료됩니다. 파일을 업로드하지 않고, Office / LibreOffice / Pandoc에 의존하지 않으며, 매 변환마다 설명 가능한 품질 검증 보고서를 생성합니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-28%20scripts%20passing-brightgreen.svg)](#)
[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](#)

---

## 특징

- **로컬 우선**: 변환, OCR, 수식 렌더링이 모두 오프라인으로 실행되며, 문서 처리 단계에서는 네트워크 접속이 금지됩니다
- **검증 가능한 변환**: 규칙 기반 diff, SSIM 시각 비교, OCR 재판독의 3계층 검증을 수행하고, 결과를 품질 보고서에 통합 기록하여 워크벤치에서 시각적으로 확인할 수 있습니다
- **로컬 OCR**: PP-OCRv5(ONNX Runtime, WebGPU / WASM)를 내장하여 방향 보정, 기울기 보정, 적응형 노이즈 제거, 레이아웃 구조 인식과 품질 점수를 지원합니다
- **수식 렌더링**: 로컬 KaTeX로 `$...$` / `$$...$$`를 조판합니다
- **고성능**: Web Worker 병렬 파이프라인을 사용하며, 인위적인 파일 크기 상한을 두지 않습니다
- **제로 런타임 의존성**: 핵심 변환에 외부 오피스 소프트웨어가 전혀 필요하지 않습니다

---

## 지원 포맷

| 분류 | 입력(14종) | 출력(11종) |
| --- | --- | --- |
| 문서 | Markdown, HTML, TXT, DOCX, PDF, EPUB | Markdown, HTML, TXT, DOCX, PDF, EPUB |
| 데이터 | JSON, CSV, XML, XLSX | JSON, CSV, XML, XLSX |
| 프레젠테이션 | PPTX | PPTX |
| 이미지 | PNG(OCR 인식) | — |
| 실험적 | DOC(텍스트 추출만), OFD(초기 프리뷰) | — |

자주 사용하는 경로: Markdown ↔ HTML · DOCX → Markdown · PDF → Markdown · XLSX ↔ CSV · HTML → PDF

전체 변환 매트릭스는 [docs/CONVERSION_PATHS.md](docs/CONVERSION_PATHS.md)를 참고하시기 바랍니다.

---

## 빠른 시작

```bash
npm install   # 의존성 설치
npm start     # 시작 후 브라우저에서 http://localhost:3000 열기
npm test      # 테스트 스위트 실행(28개 스크립트)
```

데스크톱 앱(Tauri 2)과 릴리스 패키지:

```bash
npm run desktop:dev       # 데스크톱 개발 모드
npm run release:prepare   # 릴리스 패키지 생성
```

---

## 프로젝트 구조

```text
Trans2Former/
├── public/          # 프런트엔드 앱(순수 ESM, 빌드 단계 없음)
│   ├── core/        # 데이터 모델, 포맷 레지스트리, OCR, 검증
│   ├── formats/     # 포맷별 reader / writer
│   └── workers/     # Web Worker 변환 파이프라인
├── docs/            # 전체 문서
├── samples/         # 테스트 샘플
├── scripts/         # 빌드, vendor 및 테스트 스크립트
└── src-tauri/       # Tauri 데스크톱 셸
```

---

## 핵심 로컬 기능

확장 기능은 플러그인 메커니즘을 사용하지 않고 핵심 모듈에 직접 내장되어 있습니다. 모델 리소스는 git에 포함되지 않으며, vendor 스크립트가 고정된 출처에서 다운로드하여 SHA-256으로 검증하고([scripts/paddleocr-models.manifest.json](scripts/paddleocr-models.manifest.json)), 릴리스 패키지와 함께 배포되어 즉시 사용할 수 있습니다.

- **PP-OCRv5 로컬 OCR**: 이미지와 스캔 PDF에 대한 검출 + 인식 + 방향 분류를 수행하며, 기울기 보정, 노이즈 제거, 레이아웃 병합과 신뢰도 점수를 포함합니다
- **Tesseract.js 경량 OCR**: 선택형 엔진으로, 보안 센터에서 tessdata를 가져오면 바로 활성화됩니다
- **3계층 변환 검증**: 규칙 기반 diff + SSIM + OCR 재판독으로, 결과는 설명 가능하며 단계적 폴백이 가능합니다
- **KaTeX 수식 렌더링**: 네트워크 접속이 전혀 없습니다

OCR 런타임 준비:

```bash
npm install onnxruntime-web
npm run vendor:onnx
npm run vendor:paddle
```

브라우저 검증 기록은 [docs/PP_OCRV5_BROWSER_VERIFICATION.md](docs/PP_OCRV5_BROWSER_VERIFICATION.md)를 참고하시기 바랍니다.

---

## 데이터 보안

- 파일, 파일명, 변환 결과, 오류 로그를 업로드하지 않습니다
- 문서 처리 단계에서는 네트워크 접근이 금지됩니다
- 제3자 변환 API나 분석 SDK를 사용하지 않습니다

전체 정책은 [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md)를 참고하시기 바랍니다.

---

## 문서

| 항목 | 내용 |
| --- | --- |
| [docs/README.md](docs/README.md) | 문서 전체 색인 |
| [INSTALL.md](INSTALL.md) | 설치 가이드 |
| [CHANGELOG.md](CHANGELOG.md) | 버전 기록 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 기여 및 테스트 요구 사항 |
| [docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md) | 핵심 아키텍처 |
| [docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md) | 변환 라우팅 |
| [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) | 보안 정책 |

---

## 알려진 제한 사항

1. 일부 복잡한 스타일은 포맷 간 변환에서 완전히 보존되지 않을 수 있습니다
2. PPTX 애니메이션과 차트는 아직 지원되지 않습니다
3. OCR은 강한 이탤릭체와 장식 글꼴 인식에 한계가 있으며, DOC / OFD 입력은 실험적 기능입니다
4. ZIP64 초대형 압축 파일은 아직 지원되지 않습니다

---

## 기여

Issue와 Pull Request 제출을 환영합니다. 저장소 fork → 기능 브랜치 생성 → 변경 사항 커밋 → PR 제출 순서로 진행하시기 바랍니다. 개발 규칙과 테스트 요구 사항은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하시기 바랍니다.

---

## 라이선스

MIT입니다. 자세한 내용은 [LICENSE](LICENSE)를 참고하시기 바랍니다.

---

## 링크

- 저장소: https://github.com/Vantalens/Trans2Former
- 문제 보고: [Issues](https://github.com/Vantalens/Trans2Former/issues) · [Discussions](https://github.com/Vantalens/Trans2Former/discussions)
- 커뮤니티: https://linux.do/
