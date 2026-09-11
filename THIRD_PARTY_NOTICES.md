# Third-Party Notices

Trans2Former makes use of the following open-source projects. We are grateful to the developers of these projects for their contributions to the open-source community.

---

## 1. PDF.js

**Project**: Mozilla PDF.js  
**Version**: 6.3.289  
**License**: Apache License 2.0  
**Copyright**: Copyright 2012 Mozilla Foundation  
**Repository**: https://github.com/mozilla/pdf.js

### Description
A Portable Document Format (PDF) viewer that is built with HTML5 and JavaScript. Used for client-side PDF rendering and parsing.

### Usage in Trans2Former
- PDF reading and rendering
- Text extraction from PDF documents
- PDF structure analysis
- Located in: `public/vendor/pdfjs/`

### License Text
```
Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

## 2. Tesseract.js

**Project**: Tesseract.js  
**Version**: 5.1.1  
**License**: Apache License 2.0  
**Copyright**: Copyright (c) 2019 Tesseract.js Contributors  
**Repository**: https://github.com/naptha/tesseract.js

### Description
Pure JavaScript OCR for more than 100 languages. A wrapper around the Tesseract OCR engine compiled to WebAssembly/JavaScript.

### Usage in Trans2Former
- Optical Character Recognition (OCR) for images and scanned PDFs
- Text extraction from images
- Multi-language text recognition
- Located in: `public/vendor/tesseract/`

### License Text
```
Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### Additional Component: Tesseract OCR Engine

**License**: Apache License 2.0  
**Copyright**: Copyright (c) Hewlett-Packard Company, Google Inc.  
**Repository**: https://github.com/tesseract-ocr/tesseract

The underlying Tesseract OCR engine is also licensed under Apache 2.0.

---

## 3. ONNX Runtime Web

**Project**: ONNX Runtime Web  
**Version**: 1.26.0  
**License**: MIT License  
**Copyright**: Copyright (c) Microsoft Corporation  
**Repository**: https://github.com/microsoft/onnxruntime

### Description
ONNX Runtime Web is a JavaScript library for running ONNX models in web browsers using WebAssembly.

### Usage in Trans2Former
- Machine learning model inference in the browser
- PaddleOCR model execution
- Deep learning-based OCR enhancement
- Located in: `public/vendor/onnxruntime/`

### License Text
```
MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 4. PaddleOCR Models

**Project**: PaddleOCR  
**Version**: PP-OCRv5  
**License**: Apache License 2.0  
**Copyright**: Copyright (c) 2020 PaddlePaddle Authors  
**Repository**: https://github.com/PaddlePaddle/PaddleOCR

### Description
PaddleOCR aims to create multilingual, awesome, leading, and practical OCR tools that help users train better models and apply them into practice.

### Usage in Trans2Former
- High-accuracy OCR with PP-OCRv5 models
- Text detection and recognition
- Multi-language support with pre-trained models
- Located in: `public/vendor/paddleocr/`

### License Text
```
Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### Model Attribution
The PaddleOCR models included with Trans2Former:
- **Text Detection Model**: PP-OCRv5 Detection
- **Text Recognition Model**: PP-OCRv5 Recognition (English & Chinese)
- **Trained by**: PaddlePaddle Team
- **License**: Apache 2.0

---

## 5. KaTeX

**Project**: KaTeX  
**Version**: 0.16.x  
**License**: MIT License  
**Copyright**: Copyright (c) 2013-2020 Khan Academy and other contributors  
**Repository**: https://github.com/KaTeX/KaTeX

### Description
The fastest math typesetting library for the web. Used for rendering LaTeX mathematical expressions in documents.

### Usage in Trans2Former
- LaTeX math formula rendering
- Mathematical notation in Markdown
- Equation display in PDF conversion
- Located in: `public/vendor/katex/`

### License Text
```
MIT License

Copyright (c) 2013-2020 Khan Academy and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 6. Node.js Dependencies

### 6.1 Express

**Project**: Express  
**Version**: 5.2.1  
**License**: MIT License  
**Copyright**: Copyright (c) 2009-2014 TJ Holowaychuk <tj@vision-media.ca>, Copyright (c) 2013-2014 Roman Shtylman <shtylman+expressjs@gmail.com>, Copyright (c) 2014-2015 Douglas Christopher Wilson <doug@somethingdoug.com>  
**Repository**: https://github.com/expressjs/express

#### Description
Fast, unopinionated, minimalist web framework for Node.js. Used for the local development server.

#### Usage in Trans2Former
- Local web server (`src/web-server.js`)
- Static file serving
- API endpoints for server-side conversions
- Development environment

---

### 6.2 Puppeteer

**Project**: Puppeteer  
**Version**: 25.1.0  
**License**: Apache License 2.0  
**Copyright**: Copyright 2017 Google Inc.  
**Repository**: https://github.com/puppeteer/puppeteer

#### Description
Headless Chrome Node.js API. Used for server-side HTML to PDF conversion.

#### Usage in Trans2Former
- Server-side HTML to PDF conversion
- High-quality PDF generation
- Print-to-PDF functionality
- Screenshot capabilities

---

### 6.3 ONNX Runtime Node

**Project**: ONNX Runtime Node  
**Version**: Optional test dependency (not installed by default)  
**License**: MIT License  
**Copyright**: Copyright (c) Microsoft Corporation  
**Repository**: https://github.com/microsoft/onnxruntime

#### Description
ONNX Runtime Node.js binding for running ONNX models on Node.js with native performance.

#### Usage in Trans2Former
- Optional real-model OCR integration tests
- Local model inference diagnostics
- Not part of the default runtime or desktop bundle

---

### 6.4 pngjs

**Project**: pngjs  
**Version**: 7.0.0  
**License**: MIT License  
**Copyright**: Copyright (c) 2015 Luke Page & Original Contributors  
**Repository**: https://github.com/lukeapage/pngjs

#### Description
Simple PNG encoder/decoder for Node.js with no native dependencies.

#### Usage in Trans2Former
- PNG image processing in tests
- Image format validation
- SSIM (Structural Similarity Index) calculations
- Development and testing only

---

### 6.5 c8

**Project**: c8  
**Version**: 12.0.0  
**License**: ISC License  
**Copyright**: Copyright (c) 2019, Contributors  
**Repository**: https://github.com/bcoe/c8

#### Description
Output coverage reports using Node.js built-in coverage.

#### Usage in Trans2Former
- Code coverage reporting
- Test coverage analysis
- Development and testing only

#### License Text
```
ISC License

Copyright (c) 2019, Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

## 7. Font Licenses

### 7.1 Liberation Fonts (PDF.js Standard Fonts)

**License**: SIL Open Font License 1.1  
**Copyright**: Copyright (c) 2007 Red Hat, Inc.  
**Location**: `public/vendor/pdfjs/standard_fonts/`

#### Description
Liberation fonts are metrically compatible with Arial, Times New Roman, and Courier New. Used by PDF.js for standard PDF font rendering.

#### License Text
```
SIL OPEN FONT LICENSE Version 1.1

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license.

This license becomes null and void if any of the above conditions are
not met.

THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OF THE FONT SOFTWARE OR THE INABILITY TO USE THE
FONT SOFTWARE OR FROM OTHER DEALINGS IN THE FONT SOFTWARE.
```

---

### 7.2 Foxit Fonts (PDF.js Standard Fonts)

**License**: Proprietary (Redistributable)  
**Copyright**: Copyright Foxit Software  
**Location**: `public/vendor/pdfjs/standard_fonts/`

#### Description
Foxit fonts are distributed with PDF.js for PDF rendering. These fonts are redistributable as part of PDF.js under the terms granted by Foxit Software.

---

### 7.3 Adobe CMap Resources (PDF.js CMaps)

**License**: BSD-style License  
**Copyright**: Copyright 1990-2009 Adobe Systems Incorporated  
**Location**: `public/vendor/pdfjs/cmaps/`

#### Description
Character mapping files for CJK (Chinese, Japanese, Korean) font support in PDF rendering.

#### License Text
```
Copyright 1990-2009 Adobe Systems Incorporated.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

Redistributions of source code must retain the above copyright notice,
this list of conditions and the following disclaimer.

Redistributions in binary form must reproduce the above copyright notice,
this list of conditions and the following disclaimer in the documentation
and/or other materials provided with the distribution.

Neither the name of Adobe Systems Incorporated nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## 8. WebAssembly Components

Several of the above projects include WebAssembly (WASM) modules compiled from C/C++ source code:

- **Tesseract.js**: Includes `tesseract-core.wasm` compiled from Tesseract OCR engine
- **ONNX Runtime Web**: Includes `ort-wasm.wasm` and `ort-wasm-simd.wasm`
- **PDF.js**: May include WASM modules for performance optimization

These WASM modules inherit the licenses of their source projects as documented above.

---

## 9. Language Models and Training Data

### 9.1 Tesseract Language Models

**License**: Apache License 2.0  
**Copyright**: Copyright (c) Tesseract OCR Contributors  
**Repository**: https://github.com/tesseract-ocr/tessdata

Trans2Former includes or downloads Tesseract trained language data files for OCR. These are licensed under Apache 2.0.

### 9.2 PaddleOCR Pre-trained Models

**License**: Apache License 2.0  
**Copyright**: Copyright (c) 2020 PaddlePaddle Authors  
**Repository**: https://github.com/PaddlePaddle/PaddleOCR

The PP-OCRv5 models are pre-trained by the PaddlePaddle team and licensed under Apache 2.0. Model weights are included with Trans2Former for offline OCR capabilities.

---

## 10. Build Tools and Development Dependencies

The following tools are used during development and testing but are not distributed with Trans2Former:

- **Node.js**: MIT License
- **npm**: Artistic License 2.0
- Various npm development dependencies (see `package.json` for complete list)

These are not included in the distribution and do not affect end-users.

---

## 11. Standards and Specifications

Trans2Former implements the following open standards and specifications:

- **Markdown**: CommonMark specification (public domain)
- **HTML5**: W3C Standard (royalty-free)
- **CSS3**: W3C Standard (royalty-free)
- **PDF**: ISO 32000 (publicly available specification)
- **Office Open XML**: ISO/IEC 29500 (ECMA-376)
- **ONNX**: Open Neural Network Exchange (Apache 2.0)

---

## 12. Summary of Licenses

| Component | License | Type |
|-----------|---------|------|
| PDF.js | Apache 2.0 | Permissive |
| Tesseract.js | Apache 2.0 | Permissive |
| ONNX Runtime | MIT | Permissive |
| PaddleOCR | Apache 2.0 | Permissive |
| KaTeX | MIT | Permissive |
| Express | MIT | Permissive |
| Puppeteer | Apache 2.0 | Permissive |
| Liberation Fonts | SIL OFL 1.1 | Permissive |
| Adobe CMaps | BSD-style | Permissive |
| c8 | ISC | Permissive |
| pngjs | MIT | Permissive |

All third-party licenses are compatible with Trans2Former's MIT license and allow for commercial use, modification, and redistribution.

---

## 13. Verification and Updates

This notice was last updated: **2026-06-23**

To verify the current versions and licenses of dependencies:

```bash
# Check npm dependencies
npm list --depth=0

# View vendor directory contents
ls -la public/vendor/

# Check for license files
find public/vendor -name "LICENSE*" -o -name "NOTICE*"
```

For the most up-to-date license information, please refer to each project's repository linked above.

---

## 14. Contact and Attribution

**Trans2Former Project**  
License: MIT License  
Repository: https://github.com/Vantalens/Trans2Former

If you have questions about licensing or attribution, please open an issue on our GitHub repository.

---

## 15. Acknowledgments

We extend our gratitude to:

- **Mozilla Foundation** for PDF.js
- **Tesseract.js Contributors** for making OCR accessible in the browser
- **Microsoft** for ONNX Runtime
- **PaddlePaddle Team** for PaddleOCR and pre-trained models
- **Khan Academy** for KaTeX
- All open-source contributors whose work makes Trans2Former possible

Without the open-source community's dedication to creating and maintaining these projects, Trans2Former would not exist.

---

**Last Updated**: 2026-06-23  
**Document Version**: 1.0.0  
**Trans2Former Version**: 2.3.0
