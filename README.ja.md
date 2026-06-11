# Trans2Former

> ローカルファーストのマルチフォーマット文書変換ツール

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Русский](README.ru.md) | [العربية](README.ar.md)

Trans2Former はデスクトップ向けの文書変換ツールです。14 種類の入力フォーマットと 11 種類の出力フォーマットに対応し、すべての変換はローカルマシン上で完結します。ファイルをアップロードせず、Office / LibreOffice / Pandoc に依存せず、変換のたびに説明可能な品質検証レポートを生成します。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-28%20scripts%20passing-brightgreen.svg)](#)
[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](#)

---

## 特長

- **ローカルファースト**：変換、OCR、数式レンダリングをすべてオフラインで実行し、ドキュメント処理段階ではネットワークアクセスを禁止します
- **検証可能な変換**：ルールベース diff、SSIM による視覚比較、OCR 読み戻しの三層検証を行い、結果を品質レポートに統合してワークベンチ上で可視化します
- **ローカル OCR**：PP-OCRv5（ONNX Runtime、WebGPU / WASM）を内蔵し、方向補正、傾き補正、適応的ノイズ除去、レイアウト構造認識、品質スコアリングに対応します
- **数式レンダリング**：ローカルの KaTeX で `$...$` / `$$...$$` を組版します
- **高パフォーマンス**：Web Worker による並列パイプラインを採用し、人為的なファイルサイズ上限を設けていません
- **ランタイム依存ゼロ**：コア変換に外部オフィスソフトウェアは一切不要です

---

## 対応フォーマット

| カテゴリ | 入力（14 種類） | 出力（11 種類） |
| --- | --- | --- |
| ドキュメント | Markdown、HTML、TXT、DOCX、PDF、EPUB | Markdown、HTML、TXT、DOCX、PDF、EPUB |
| データ | JSON、CSV、XML、XLSX | JSON、CSV、XML、XLSX |
| プレゼンテーション | PPTX | PPTX |
| 画像 | PNG（OCR 認識） | — |
| 実験的 | DOC（テキスト抽出のみ）、OFD（早期プレビュー） | — |

よく使われるパス：Markdown ↔ HTML · DOCX → Markdown · PDF → Markdown · XLSX ↔ CSV · HTML → PDF

完全な変換マトリクスは [docs/CONVERSION_PATHS.md](docs/CONVERSION_PATHS.md) をご覧ください。

---

## クイックスタート

```bash
npm install   # 依存関係をインストール
npm start     # 起動し、ブラウザで http://localhost:3000 を開く
npm test      # テストスイートを実行（28 個のスクリプト）
```

デスクトップアプリ（Tauri 2）とリリースパッケージ：

```bash
npm run desktop:dev       # デスクトップ開発モード
npm run release:prepare   # リリースパッケージを生成
```

---

## プロジェクト構成

```text
Trans2Former/
├── public/          # フロントエンドアプリ（純粋な ESM、ビルドステップなし）
│   ├── core/        # データモデル、フォーマットレジストリ、OCR、検証
│   ├── formats/     # 各フォーマットの reader / writer
│   └── workers/     # Web Worker 変換パイプライン
├── docs/            # 完全なドキュメント
├── samples/         # テストサンプル
├── scripts/         # ビルド、vendor、テストスクリプト
└── src-tauri/       # Tauri デスクトップシェル
```

---

## コアのローカル機能

拡張機能はプラグイン機構を介さず、コアモジュールに直接組み込まれています。モデルリソースは git には含めず、vendor スクリプトが固定された取得元からダウンロードして SHA-256 で検証し（[scripts/paddleocr-models.manifest.json](scripts/paddleocr-models.manifest.json)）、リリースパッケージに同梱されるため、そのまますぐに利用できます。

- **PP-OCRv5 ローカル OCR**：画像およびスキャン PDF に対する検出 + 認識 + 方向分類。傾き補正、ノイズ除去、レイアウト統合、信頼度スコアリングを含みます
- **Tesseract.js 軽量 OCR**：オプションのエンジンで、セキュリティセンターで tessdata をインポートすると有効になります
- **三層変換検証**：ルールベース diff + SSIM + OCR 読み戻し。結果は説明可能で、段階的なフォールバックが可能です
- **KaTeX 数式レンダリング**：ネットワークアクセスゼロ

OCR ランタイムの準備：

```bash
npm install onnxruntime-web
npm run vendor:onnx
npm run vendor:paddle
```

ブラウザ側の検証記録は [docs/PP_OCRV5_BROWSER_VERIFICATION.md](docs/PP_OCRV5_BROWSER_VERIFICATION.md) をご覧ください。

---

## データセキュリティ

- ファイル、ファイル名、変換結果、エラーログをアップロードしません
- ドキュメント処理段階ではネットワークアクセスを禁止します
- サードパーティの変換 API やアナリティクス SDK を利用しません

完全なポリシーは [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) をご覧ください。

---

## ドキュメント

| エントリ | 内容 |
| --- | --- |
| [docs/README.md](docs/README.md) | ドキュメント総合インデックス |
| [INSTALL.md](INSTALL.md) | インストールガイド |
| [CHANGELOG.md](CHANGELOG.md) | 変更履歴 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | コントリビューションとテスト要件 |
| [docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md) | コアアーキテクチャ |
| [docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md) | 変換ルーティング |
| [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) | セキュリティポリシー |

---

## 既知の制限

1. 一部の複雑なスタイルは、フォーマット間の変換で完全には保持できません
2. PPTX のアニメーションとグラフには未対応です
3. OCR は強い斜体や装飾文字の認識に限界があります。DOC / OFD 入力は実験的です
4. ZIP64 の超大容量アーカイブには現時点で未対応です

---

## コントリビューション

Issue と Pull Request を歓迎します。リポジトリを fork → フィーチャーブランチを作成 → 変更をコミット → PR を作成、という流れです。開発規約とテスト要件は [CONTRIBUTING.md](CONTRIBUTING.md) をご覧ください。

---

## ライセンス

MIT です。詳細は [LICENSE](LICENSE) をご覧ください。

---

## リンク

- リポジトリ：https://github.com/Vantalens/Trans2Former
- フィードバック：[Issues](https://github.com/Vantalens/Trans2Former/issues) · [Discussions](https://github.com/Vantalens/Trans2Former/discussions)
- コミュニティ：https://linux.do/
