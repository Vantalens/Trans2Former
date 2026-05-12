# SSIM 视觉对比实现计划

**版本**: v0.1.0  
**状态**: 框架准备，待实现  
**最后更新**: 2026-05-12

## 概述

SSIM (Structural Similarity Index) 视觉对比用于 PDF/PNG 输出的回归测试，确保格式转换的视觉保真度。

## 实现状态

### ✅ 已完成
- 创建 `scripts/visual-comparison-test.js` 框架
- 定义测试配置和接口
- 编写实现说明文档

### ⏳ 待实现
- SSIM 算法实现或库集成
- PDF 渲染为图像
- 基线图像生成
- 差异图像生成
- 测试报告生成

## 技术方案

### 方案 1: 使用现有库（推荐）

**优点**: 快速实现，稳定可靠  
**缺点**: 增加依赖

**推荐库**:
```json
{
  "sharp": "^0.33.0",        // 图像处理
  "pixelmatch": "^5.3.0",    // 像素对比
  "ssim.js": "^3.5.0",       // SSIM 算法
  "pdf-to-png": "^1.0.0"     // PDF 渲染
}
```

**实现步骤**:
1. 安装依赖: `npm install sharp pixelmatch ssim.js pdf-to-png`
2. 实现 `renderPDFToImage` 函数
3. 实现 `calculateSSIM` 函数
4. 实现 `runVisualComparisonTests` 函数
5. 生成基线图像
6. 集成到 `npm test`

### 方案 2: 自实现 SSIM 算法

**优点**: 无额外依赖  
**缺点**: 开发时间长，需要测试验证

**SSIM 公式**:
```
SSIM(x,y) = (2μ_x μ_y + C1)(2σ_xy + C2) / (μ_x² + μ_y² + C1)(σ_x² + σ_y² + C2)

其中:
- μ_x, μ_y: 图像 x 和 y 的局部均值
- σ_x², σ_y²: 图像 x 和 y 的局部方差
- σ_xy: 图像 x 和 y 的协方差
- C1, C2: 稳定常数
```

**实现步骤**:
1. 实现图像加载（使用 Canvas API 或 Buffer）
2. 实现滑动窗口处理
3. 实现均值、方差、协方差计算
4. 实现 SSIM 公式
5. 测试验证

## 测试用例设计

### 基础测试用例

```javascript
const testCases = [
  // Markdown 转换
  {
    name: "markdown-to-pdf-basic",
    input: "samples/md/chinese.md",
    format: "pdf",
    expectedSSIM: 0.95
  },
  {
    name: "markdown-to-pdf-table",
    input: "samples/md/complex-table.md",
    format: "pdf",
    expectedSSIM: 0.95
  },

  // HTML 转换
  {
    name: "html-to-pdf-formatted",
    input: "samples/html/complex-document.html",
    format: "pdf",
    expectedSSIM: 0.95
  },

  // DOCX 转换
  {
    name: "docx-to-pdf-basic",
    input: "samples/fixtures/sample.docx",
    format: "pdf",
    expectedSSIM: 0.90  // DOCX 可能有字体差异
  }
];
```

### 测试覆盖目标

- ✅ 基础文本转换
- ✅ 表格布局
- ✅ 列表格式
- ✅ 标题层级
- ✅ 中文字符
- ⏳ 图片嵌入
- ⏳ 复杂排版

## 基线管理

### 基线目录结构

```
tests/
├── visual-baselines/          # 基线图像
│   ├── markdown-to-pdf-basic.png
│   ├── markdown-to-pdf-table.png
│   ├── html-to-pdf-formatted.png
│   └── ...
├── visual-diffs/              # 差异图像（不提交）
│   ├── markdown-to-pdf-basic-diff.png
│   └── ...
└── visual-reports/            # 测试报告（不提交）
    └── visual-comparison-report.json
```

### 基线更新策略

1. **首次生成**: `npm run visual:baseline`
2. **验证基线**: 人工检查生成的图像
3. **提交基线**: 将基线图像提交到 git
4. **更新基线**: 当输出格式有意改进时，重新生成并提交

## 平台差异处理

### 字体渲染差异

不同操作系统的字体渲染可能有差异：

- **Windows**: ClearType
- **macOS**: Quartz
- **Linux**: FreeType

**解决方案**:
1. 使用嵌入字体（推荐）
2. 提高 SSIM 阈值容差
3. 为每个平台维护独立基线

### PDF 渲染差异

PDF 渲染引擎可能有差异：

- **pdf.js**: 浏览器端
- **pdf-to-png**: Node.js 端
- **Puppeteer**: Chromium 渲染

**解决方案**:
1. 统一使用 pdf.js 渲染
2. 固定渲染参数（DPI、缩放比例）
3. 只对比第一页

## 性能考虑

### 优化策略

1. **并行处理**: 使用 Worker 并行渲染多个 PDF
2. **缓存基线**: 基线图像只加载一次
3. **增量测试**: 只测试修改的转换路径
4. **快速模式**: 降低图像分辨率

### 资源限制

- **单个图像**: < 5MB
- **总基线大小**: < 50MB
- **测试时间**: < 2 分钟

## 集成到 CI/CD

### GitHub Actions 配置

```yaml
- name: Visual Comparison Tests
  run: |
    npm run visual:test
    if [ $? -ne 0 ]; then
      echo "Visual comparison failed"
      npm run visual:report
      exit 1
    fi

- name: Upload Visual Diffs
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: visual-diffs
    path: tests/visual-diffs/
```

### 失败处理

1. **自动失败**: SSIM < 阈值
2. **生成报告**: 包含差异图像和 SSIM 值
3. **上传 Artifact**: 供开发者下载查看
4. **通知开发者**: 通过 PR 评论

## 使用指南

### 开发者工作流

```bash
# 1. 修改转换代码
vim public/formats/pdf.js

# 2. 运行视觉对比测试
npm run visual:test

# 3. 如果失败，查看差异
open tests/visual-diffs/

# 4. 如果是预期的改进，更新基线
npm run visual:baseline

# 5. 提交代码和新基线
git add tests/visual-baselines/
git commit -m "feat: improve PDF output quality"
```

### 命令说明

```bash
# 生成基线图像
npm run visual:baseline

# 运行视觉对比测试
npm run visual:test

# 生成详细报告
npm run visual:report

# 清理差异图像
npm run visual:clean
```

## 未来增强

### 短期（1-2 周）
- [ ] 实现基础 SSIM 算法
- [ ] 集成 PDF 渲染
- [ ] 生成 5-10 个基线图像
- [ ] 集成到 `npm test`

### 中期（1-2 月）
- [ ] 支持多页 PDF 对比
- [ ] 支持区域对比（只对比内容区域）
- [ ] 生成 HTML 可视化报告
- [ ] 支持阈值配置

### 长期（3-6 月）
- [ ] 支持视频对比（动画效果）
- [ ] 支持交互式差异查看器
- [ ] 机器学习辅助判断
- [ ] 自动基线更新建议

## 参考资料

### 学术论文
- Wang, Z., et al. (2004). "Image quality assessment: from error visibility to structural similarity." IEEE TIP.

### 开源实现
- [ssim.js](https://github.com/obartra/ssim) - JavaScript SSIM 实现
- [pixelmatch](https://github.com/mapbox/pixelmatch) - 像素级图像对比
- [sharp](https://github.com/lovell/sharp) - 高性能图像处理

### 相关工具
- [Percy](https://percy.io/) - 视觉回归测试服务
- [Chromatic](https://www.chromatic.com/) - Storybook 视觉测试
- [BackstopJS](https://github.com/garris/BackstopJS) - 视觉回归测试框架

---

**状态**: 📝 **框架准备完成**  
**下一步**: 实现 SSIM 算法或集成现有库  
**预计时间**: 1-2 周  
**优先级**: P2（质量增强）
