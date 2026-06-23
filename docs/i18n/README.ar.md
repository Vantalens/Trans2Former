# Trans2Former

> أداة تحويل مستندات متعددة الصيغ تعمل محليًا أولًا

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Français](README.fr.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md) | [Русский](README.ru.md) | [العربية](README.ar.md)

Trans2Former هي أداة تحويل مستندات على مستوى سطح المكتب: 14 صيغة إدخال و11 صيغة إخراج، وتتم جميع التحويلات على جهازك المحلي. لا تُرفع أي ملفات، ولا اعتماد على Office / LibreOffice / Pandoc، ويُنشأ تقرير فحص جودة قابل للتفسير لكل عملية تحويل.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-28%20scripts%20passing-brightgreen.svg)](#)
[![Version](https://img.shields.io/badge/version-2.3.0-blue.svg)](#)

---

## الميزات

- **محلي أولًا**: يُنفَّذ التحويل و OCR وعرض الصيغ الرياضية بالكامل دون اتصال، ويُحظر الاتصال بالشبكة أثناء مرحلة معالجة المستندات
- **تحويل قابل للتحقق**: ثلاث طبقات من التحقق — diff قائم على القواعد، ومقارنة بصرية بـ SSIM، وإعادة قراءة عبر OCR — تُكتب جميعها في تقرير جودة موحّد وتُعرض في منضدة العمل
- **OCR محلي**: مزوّد بـ PP-OCRv5 مدمجًا (ONNX Runtime، WebGPU / WASM)، مع دعم تصحيح الاتجاه، وتقويم الميل، وإزالة الضوضاء التكيفية، والتعرف على بنية التخطيط، وتقييم الجودة
- **عرض الصيغ الرياضية**: تنضيد محلي بواسطة KaTeX لـ `$...$` / `$$...$$`
- **أداء عالٍ**: خط معالجة متوازٍ عبر Web Worker، دون حد مصطنع لحجم الملفات
- **بدون تبعيات وقت التشغيل**: لا يحتاج التحويل الأساسي إلى أي برامج مكتبية خارجية

---

## الصيغ المدعومة

| الفئة | الإدخال (14 صيغة) | الإخراج (11 صيغة) |
| --- | --- | --- |
| المستندات | Markdown، HTML، TXT، DOCX، PDF، EPUB | Markdown، HTML، TXT، DOCX، PDF، EPUB |
| البيانات | JSON، CSV، XML، XLSX | JSON، CSV، XML، XLSX |
| العروض التقديمية | PPTX | PPTX |
| الصور | PNG (تعرّف عبر OCR) | — |
| تجريبي | DOC (استخراج النص فقط)، OFD (معاينة مبكرة) | — |

المسارات الشائعة: Markdown ↔ HTML · DOCX → Markdown · PDF → Markdown · XLSX ↔ CSV · HTML → PDF

لمصفوفة التحويل الكاملة، انظر [docs/CONVERSION_PATHS.md](docs/CONVERSION_PATHS.md).

---

## البدء السريع

```bash
npm install   # تثبيت التبعيات
npm start     # التشغيل، ثم افتح http://localhost:3000 في المتصفح
npm test      # تشغيل مجموعة الاختبارات (28 سكربتًا)
```

تطبيق سطح المكتب (Tauri 2) وحزم الإصدار:

```bash
npm run desktop:dev       # وضع تطوير سطح المكتب
npm run release:prepare   # إنشاء حزمة الإصدار
```

---

## بنية المشروع

```text
Trans2Former/
├── public/          # تطبيق الواجهة الأمامية (ESM خالص، دون خطوة بناء)
│   ├── core/        # نماذج البيانات، سجل الصيغ، OCR، التحقق
│   ├── formats/     # reader / writer لكل صيغة
│   └── workers/     # خط تحويل Web Worker
├── docs/            # الوثائق الكاملة
├── samples/         # عينات الاختبار
├── scripts/         # سكربتات البناء و vendor والاختبار
└── src-tauri/       # غلاف سطح المكتب Tauri
```

---

## القدرات المحلية الأساسية

القدرات المعزّزة مدمجة مباشرة في الوحدات الأساسية دون آلية إضافات؛ لا تُخزَّن موارد النماذج في git، بل تُنزَّل بواسطة سكربتات vendor من مصادر مثبّتة وتُفحص عبر SHA-256 ([scripts/paddleocr-models.manifest.json](scripts/paddleocr-models.manifest.json))، وتُوزَّع مع حزمة الإصدار جاهزة للاستخدام فورًا.

- **OCR محلي بـ PP-OCRv5**: كشف + تعرّف + تصنيف اتجاه للصور وملفات PDF الممسوحة ضوئيًا، مع تقويم الميل وإزالة الضوضاء ودمج التخطيط وتقييم درجة الثقة
- **OCR خفيف بـ Tesseract.js**: محرك اختياري، يُفعَّل باستيراد tessdata من مركز الأمان
- **تحقق ثلاثي الطبقات من التحويل**: diff قائم على القواعد + SSIM + إعادة قراءة OCR، بنتائج قابلة للتفسير وقابلة للتخفيض التدريجي
- **عرض رياضي بـ KaTeX**: دون أي اتصال بالشبكة

تجهيز بيئة تشغيل OCR:

```bash
npm install onnxruntime-web
npm run vendor:onnx
npm run vendor:paddle
```

لسجل التحقق على جانب المتصفح، انظر [docs/PP_OCRV5_BROWSER_VERIFICATION.md](docs/PP_OCRV5_BROWSER_VERIFICATION.md).

---

## أمان البيانات

- لا تُرفع الملفات ولا أسماء الملفات ولا نتائج التحويل ولا سجلات الأخطاء
- يُحظر الوصول إلى الشبكة أثناء مرحلة معالجة المستندات
- لا يجري الاتصال بأي واجهات API خارجية للتحويل أو حزم SDK للتحليلات

للاطلاع على السياسة الكاملة، انظر [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md).

---

## الوثائق

| المدخل | المحتوى |
| --- | --- |
| [docs/README.md](docs/README.md) | الفهرس العام للوثائق |
| [INSTALL.md](INSTALL.md) | دليل التثبيت |
| [CHANGELOG.md](CHANGELOG.md) | سجل الإصدارات |
| [CONTRIBUTING.md](CONTRIBUTING.md) | متطلبات المساهمة والاختبار |
| [docs/MULTI_MODEL_ARCHITECTURE.md](docs/MULTI_MODEL_ARCHITECTURE.md) | البنية الأساسية |
| [docs/CONVERSION_ROUTING.md](docs/CONVERSION_ROUTING.md) | توجيه التحويل |
| [docs/SECURITY_POLICY.md](docs/SECURITY_POLICY.md) | سياسة الأمان |

---

## القيود المعروفة

1. لا يمكن الحفاظ بشكل كامل على بعض الأنماط المعقدة أثناء التحويل بين الصيغ
2. لا تُدعم بعدُ الحركات والمخططات البيانية في PPTX
3. قدرة OCR محدودة في التعرف على النصوص شديدة الميل والخطوط الفنية؛ إدخال DOC / OFD تجريبي
4. لا تُدعم حاليًا أرشيفات ZIP64 فائقة الحجم

---

## المساهمة

نرحّب بتقديم Issue و Pull Request: انسخ المستودع (fork) → أنشئ فرع ميزة → أرسل تغييراتك → افتح PR. لقواعد التطوير ومتطلبات الاختبار، انظر [CONTRIBUTING.md](CONTRIBUTING.md).

---

## الترخيص

MIT، انظر [LICENSE](LICENSE) للتفاصيل.

---

## الروابط

- المستودع: https://github.com/Vantalens/Trans2Former
- الإبلاغ عن المشكلات: [Issues](https://github.com/Vantalens/Trans2Former/issues) · [Discussions](https://github.com/Vantalens/Trans2Former/discussions)
- المجتمع: https://linux.do/
