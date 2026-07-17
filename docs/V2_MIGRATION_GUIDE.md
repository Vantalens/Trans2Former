# Trans2Former v2 迁移指南

**版本**: v2.0.0-design  
**状态**: 🎯 设计阶段  
**最后更新**: 2026-06-23  
**适用范围**: 从 v1 单一 DocumentModel 迁移到 v2 多域模型

---

## 目录

1. [概述](#概述)
2. [迁移时间线](#迁移时间线)
3. [向下兼容性保证](#向下兼容性保证)
4. [迁移检查清单](#迁移检查清单)
5. [分阶段迁移策略](#分阶段迁移策略)
6. [API 变更对照](#api-变更对照)
7. [常见迁移场景](#常见迁移场景)
8. [故障排查](#故障排查)
9. [回滚策略](#回滚策略)

---

## 概述

Trans2Former v2 引入多域模型架构，解决 v1 单一 `DocumentModel` 的语义混淆问题。本指南帮助你从 v1 平滑迁移到 v2。

### 为什么需要迁移？

**v1 的局限**:
- 单一 `DocumentModel` 无法区分文档类型（语义文档 vs 表格 vs 幻灯片 vs 固定版式）
- XLSX 公式、合并单元格、工作表结构被强制降级
- XLSX → DocumentModel → XLSX 往返后丢失大量信息
- 扩展 PPTX、PDF 时语义污染严重

**v2 的优势**:
- 五个独立域模型，每个专注于一类文档语义
- 跨域转换显式 mapper，降级可见、可追溯
- 信息保真度大幅提升（XLSX 往返无损）
- 扩展性强，新增格式不污染现有模型

---

## 迁移时间线

### Phase 5: 设计阶段（当前，1 周）

**状态**: ✅ 已完成（2026-06-23）

**产出**:
- ✅ `MULTI_DOMAIN_MODEL_DESIGN.md` - 详细设计文档
- ✅ `V2_MULTI_DOMAIN_MODELS.md` - 用户参考手册
- ✅ `V2_MIGRATION_GUIDE.md` - 本迁移指南
- ✅ 文档体系更新（v1 归档，README 更新）

### Phase 6: 引入域模型（2 周）

**时间**: Phase 5 完成后启动

**任务**:
- 创建 TypeScript 接口定义
- 实现 JSON Schema 验证
- 添加 `schemaVersion` 识别逻辑
- 实现基础的 SemanticDoc（作为 v1 DocumentModel 的升级）
- 验证向下兼容性

**影响**: 无，v1 API 保持不变

### Phase 7: 重构 format registry（2 周）

**时间**: Phase 6 完成后

**任务**:
- 扩展 FormatRegistry 支持域模型
- 为每个格式声明所属域
- 实现 mapper 注册机制
- 添加路由决策逻辑

**影响**: 无，v1 路径作为 fallback 保持可用

### Phase 8: XLSX/CSV 路径迁移（3 周）

**时间**: Phase 7 完成后

**任务**:
- 实现 WorkbookModel
- 迁移 XLSX Reader/Writer
- 迁移 CSV Reader/Writer
- 实现 WorkbookToSemanticMapper
- 实现 SemanticToWorkbookMapper

**影响**: XLSX/CSV 转换质量提升，公式和格式保留

### Phase 9: PPTX 路径迁移（3 周）

**时间**: Phase 8 完成后

**任务**:
- 实现 SlideModel
- 迁移 PPTX Reader/Writer
- 实现 SlideToSemanticMapper
- 实现 SemanticToSlideMapper

**影响**: PPTX 转换质量提升，布局和动画保留

### Phase 10: PDF 路径迁移（3 周）

**时间**: Phase 9 完成后

**任务**:
- 实现 FixedLayoutModel
- 迁移 PDF Reader/Writer
- 实现 FixedToSemanticMapper
- 实现 SemanticToFixedMapper

**影响**: PDF 转换质量提升，坐标和版式保留

### Phase 11: 废弃 v1（1 周）

**时间**: Phase 10 完成后

**任务**:
- 标记 `DocumentModel` 为 deprecated
- 更新所有文档
- 发布 v3.0.0

**影响**: v1 API 标记为废弃，但仍可用（兼容层保留 6 个月）

### v4.0.0: 完全移除 v1（预计 2027 年中）

**任务**:
- 移除 DocumentModel 兼容层
- 移除 v1 路径

**影响**: v1 API 不再可用，必须迁移到 v2

---

## 向下兼容性保证

### 兼容性原则

v2 迁移遵循以下原则，确保现有代码不受影响：

1. **类型别名**: `DocumentModel` 作为 `SemanticDoc` 的别名保留
2. **Fallback 机制**: v1 路径在迁移期间始终可用
3. **Feature Flag**: 使用开关控制新模型启用，便于回滚
4. **渐进式迁移**: 逐条路径迁移，充分测试后再继续
5. **长期支持**: v1 兼容层至少保留 6 个月（一个大版本）

### 兼容性时间表

| 版本 | DocumentModel 状态 | v1 路径状态 | 说明 |
|------|-------------------|------------|------|
| v2.3.0 (当前) | ✅ 完全可用 | ✅ 默认路径 | v1 架构 |
| v3.0.0 (设计完成后) | ⚠️ Deprecated | ✅ Fallback | v2 架构，v1 兼容层 |
| v4.0.0 (预计 2027 年中) | ❌ 已移除 | ❌ 已移除 | 完全 v2 |

### 不破坏性变更

以下变更**不会**破坏现有代码：

- ✅ 新增域模型（SemanticDoc, WorkbookModel, SlideModel, FixedLayoutModel, AssetGraph）
- ✅ 新增 FormatRegistryV2（FormatRegistry 保留）
- ✅ 新增 mapper 机制
- ✅ 新增 `schemaVersion` 字段（向后兼容）
- ✅ 新增 `executedMappers` 字段到 QualityReport

### 破坏性变更（v4.0.0+）

以下变更在 v4.0.0 会破坏 v1 代码：

- ❌ 移除 `DocumentModel` 类型别名
- ❌ 移除 v1 路径 fallback
- ❌ 移除 `trans2former.document.v1` schema

**应对**: 在 v3.0.0 发布后的 6 个月内完成迁移

---

## 迁移检查清单

### 开发者检查清单

在迁移前，检查你的代码是否使用了以下 v1 API：

- [ ] 是否直接使用 `DocumentModel` 类型
- [ ] 是否依赖 `schemaVersion === "trans2former.document.v1"`
- [ ] 是否手动创建 DocumentModel 实例
- [ ] 是否解析 DocumentModel JSON
- [ ] 是否有自定义的 Reader/Writer 使用 DocumentModel

如果以上任何一项为"是"，建议在 Phase 6-10 完成后开始迁移。

### 项目检查清单

在正式迁移前，确保：

- [ ] 所有测试通过（v1 基线）
- [ ] 覆盖率达标（≥ 85%）
- [ ] 快照测试就绪
- [ ] 性能基准已记录
- [ ] 回滚计划就绪

---

## 分阶段迁移策略

### 第一步: 评估影响范围（Phase 6）

**任务**:
1. 运行代码搜索，找到所有使用 `DocumentModel` 的地方
2. 分析依赖关系，确定迁移顺序
3. 识别高风险模块

**命令**:
```bash
# 搜索 DocumentModel 使用
grep -r "DocumentModel" public/ src/ --include="*.js"

# 搜索 schemaVersion 检查
grep -r "trans2former.document.v1" public/ src/ --include="*.js"
```

**产出**:
- 迁移影响分析报告
- 高风险模块列表
- 迁移优先级排序

### 第二步: 引入 v2 模型（Phase 7）

**任务**:
1. 引入 TypeScript 接口定义（如果使用 TS）
2. 添加 JSON Schema 验证
3. 更新开发文档
4. 运行 v1 测试，确保兼容性

**验证**:
```bash
# 运行完整测试套件
npm test

# 验证覆盖率不下降
npm run coverage
```

**预期**: 所有测试通过，覆盖率不下降

### 第三步: 逐条路径迁移（Phase 8-10）

**优先级**:
1. P0: XLSX/CSV 路径（Phase 8）
2. P1: PPTX 路径（Phase 9）
3. P2: PDF 路径（Phase 10）
4. P3: 其他路径（按需）

**每条路径迁移流程**:
1. 实现新域模型
2. 迁移 Reader
3. 迁移 Writer
4. 实现 Mapper（如需跨域）
5. 运行测试套件
6. 对比快照（v1 vs v2）
7. 记录降级项
8. 更新文档

**验证清单**:
- [ ] 新模型定义完整
- [ ] Reader 输出正确
- [ ] Writer 输出正确
- [ ] Mapper 正确记录降级
- [ ] 快照对比通过或降级可解释
- [ ] 质量报告记录完整
- [ ] 所有测试通过
- [ ] 覆盖率不下降
- [ ] 性能不显著退化（±10%）
- [ ] 文档更新

### 第四步: 废弃 v1 API（Phase 11）

**任务**:
1. 标记 `DocumentModel` 为 `@deprecated`
2. 更新文档，添加迁移说明
3. 发布 v3.0.0

**示例**:
```typescript
/**
 * @deprecated Use SemanticDoc instead. Will be removed in v4.0.0
 */
type DocumentModel = SemanticDoc;
```

**通知**:
- 发布 Release Notes
- 更新 README 和 CHANGELOG
- 在社区渠道通知（如有）

---

## API 变更对照

### 类型别名

**v1**:
```typescript
interface DocumentModel {
  schemaVersion: "trans2former.document.v1";
  title: string;
  sourceFormat: string;
  blocks: Block[];
  assets: Asset[];
  metadata: Metadata;
}
```

**v2**:
```typescript
// SemanticDoc 替代 DocumentModel
interface SemanticDoc {
  schemaVersion: "trans2former.semantic-doc.v2";
  title: string;
  blocks: SemanticBlock[];
  assets: Asset[];
  metadata: {
    sourceFormat: string;
    conversion?: ConversionMetadata;
    qualityReport?: QualityReport;
    warnings?: Warning[];
  };
}

// 向下兼容
type DocumentModel = SemanticDoc;
```

### 格式注册

**v1**:
```javascript
// public/core/format-registry.js
const FormatRegistry = {
  registerReader(format, reader) { ... },
  registerWriter(format, writer) { ... },
  getReader(format) { ... },
  getWriter(format) { ... }
};
```

**v2**:
```javascript
// public/core/format-registry-v2.js
class FormatRegistryV2 {
  registerFormat(metadata) {
    // metadata: { format, domain, reader, writer }
  }
  
  registerMapper(fromDomain, toDomain, mapper) { ... }
  
  async convert(input, fromFormat, toFormat) {
    const fromDomain = this.getDomain(fromFormat);
    const toDomain = this.getDomain(toFormat);
    
    if (fromDomain === toDomain) {
      // 同域转换
      return this.convertSameDomain(input, fromFormat, toFormat);
    } else {
      // 跨域转换
      const mapper = this.getMapper(fromDomain, toDomain);
      return this.convertCrossDomain(input, fromFormat, toFormat, mapper);
    }
  }
}
```

### 转换流程

**v1**:
```javascript
// 单一流程
const model = await reader(input);  // DocumentModel
const output = await writer(model); // Uint8Array
```

**v2**:
```javascript
// 同域转换
const model = await reader(input);  // 域模型（如 SemanticDoc）
const output = await writer(model); // Uint8Array

// 跨域转换
const sourceModel = await reader(input);        // 源域模型（如 WorkbookModel）
const { targetModel, warnings } = await mapper(sourceModel); // 目标域模型（如 SemanticDoc）
const output = await writer(targetModel);       // Uint8Array
```

### 质量报告

**v1**:
```typescript
interface QualityReport {
  structureFidelity: "high" | "medium" | "low";
  tableFidelity: "full" | "tracked" | "basic" | "not-applicable";
  assetFidelity: "full" | "embedded" | "not-applicable";
  warningCount: number;
  warningsBySeverity: Record<string, number>;
  downgradeCount: number;
}
```

**v2** (新增字段):
```typescript
interface QualityReport {
  structureFidelity: "high" | "medium" | "low";
  tableFidelity: "full" | "tracked" | "basic" | "not-applicable";
  assetFidelity: "full" | "embedded" | "not-applicable";
  warningCount: number;
  warningsBySeverity: Record<string, number>;
  downgradeCount: number;
  executedMappers?: string[];  // 🆕 v2 新增
}
```

---

## 常见迁移场景

### 场景 1: 使用 DocumentModel 类型

**v1 代码**:
```typescript
function processDocument(doc: DocumentModel): void {
  console.log(doc.title);
  console.log(doc.blocks.length);
}
```

**迁移方案**:

**选项 A**: 保持不变（推荐，v3.0.0 前有效）
```typescript
// 不需要修改，DocumentModel 是 SemanticDoc 的别名
function processDocument(doc: DocumentModel): void {
  console.log(doc.title);
  console.log(doc.blocks.length);
}
```

**选项 B**: 迁移到 SemanticDoc（推荐，长期）
```typescript
function processDocument(doc: SemanticDoc): void {
  console.log(doc.title);
  console.log(doc.blocks.length);
}
```

### 场景 2: 检查 schemaVersion

**v1 代码**:
```javascript
if (model.schemaVersion === "trans2former.document.v1") {
  // 处理 v1 模型
}
```

**迁移方案**:
```javascript
// 支持 v1 和 v2
function getModelType(model) {
  if (model.schemaVersion === "trans2former.document.v1") {
    return "semantic"; // v1 DocumentModel 视为 SemanticDoc
  } else if (model.schemaVersion === "trans2former.semantic-doc.v2") {
    return "semantic";
  } else if (model.schemaVersion === "trans2former.workbook.v2") {
    return "workbook";
  } else if (model.schemaVersion === "trans2former.slide.v2") {
    return "slide";
  } else if (model.schemaVersion === "trans2former.fixed-layout.v2") {
    return "fixed-layout";
  } else {
    throw new Error(`Unknown schema version: ${model.schemaVersion}`);
  }
}
```

### 场景 3: 自定义 Reader

**v1 代码**:
```javascript
async function customMarkdownReader(input) {
  // 解析 Markdown
  const blocks = parseMarkdown(input);
  
  return {
    schemaVersion: "trans2former.document.v1",
    title: "Custom",
    sourceFormat: "md",
    blocks,
    assets: [],
    metadata: {}
  };
}
```

**迁移方案**:
```javascript
async function customMarkdownReader(input) {
  // 解析 Markdown
  const blocks = parseMarkdown(input);
  
  return {
    schemaVersion: "trans2former.semantic-doc.v2", // 更新 schema
    title: "Custom",
    blocks,
    assets: [],
    metadata: {
      sourceFormat: "md",
      warnings: []
    }
  };
}
```

### 场景 4: XLSX 转换

**v1 代码**:
```javascript
// XLSX → Markdown
const xlsxModel = await xlsxReader(xlsxData);  // DocumentModel
const markdown = await markdownWriter(xlsxModel);
```

**v2 迁移后**:
```javascript
// XLSX → Markdown（跨域转换）
const workbook = await xlsxReader(xlsxData);           // WorkbookModel
const semanticDoc = await workbookToSemanticMapper(workbook); // SemanticDoc
const markdown = await markdownWriter(semanticDoc.targetModel);

// 或使用统一接口（推荐）
const result = await registry.convert(xlsxData, "xlsx", "md");
console.log("执行的 mapper:", result.qualityReport.executedMappers);
// ["WorkbookToSemanticMapper"]
```

**优势**: 公式、合并单元格、工作表结构在 WorkbookModel 中保留，降级可追溯

---

## 故障排查

### 问题 1: 测试失败，提示 "Unknown schema version"

**原因**: 代码中硬编码了 `trans2former.document.v1` 检查

**解决**:
```javascript
// ❌ 错误
if (model.schemaVersion !== "trans2former.document.v1") {
  throw new Error("Unknown schema version");
}

// ✅ 正确
function isValidSchema(schema) {
  return schema === "trans2former.document.v1" 
    || schema?.startsWith("trans2former.");
}

if (!isValidSchema(model.schemaVersion)) {
  throw new Error("Unknown schema version");
}
```

### 问题 2: 快照测试失败

**原因**: v2 模型输出与 v1 略有不同（metadata 结构变化）

**解决**:
1. 检查差异是否符合预期
2. 如果是 metadata 字段顺序变化，更新快照
3. 如果是降级记录（executedMappers），记录为设计变更

```bash
# 对比差异
diff v1-output.json v2-output.json

# 更新快照（确认无误后）
npm run test:update-snapshots
```

### 问题 3: 性能退化

**原因**: 跨域转换引入额外的 mapper 步骤

**解决**:
1. 检查是否为跨域转换（executedMappers 不为空）
2. 评估性能退化是否可接受（预期 10-20%）
3. 如果性能退化超过 20%，优化 mapper 实现

```bash
# 运行性能基准测试
npm run benchmark

# 对比 v1 vs v2 性能
npm run benchmark:compare v1 v2
```

### 问题 4: 降级项过多

**原因**: 跨域转换必然有信息损失

**解决**:
1. 检查 qualityReport.executedMappers，确认转换路径
2. 评估降级是否符合预期（参考 MULTI_DOMAIN_MODEL_DESIGN.md）
3. 如果降级不可接受，考虑优化 mapper 或保持同域转换

```javascript
// 检查降级项
console.log("降级项:", result.qualityReport.downgradeCount);
console.log("警告:", result.warnings);

// 如果降级过多，考虑同域转换
// 例如: XLSX → CSV（同域，WorkbookModel）而不是 XLSX → Markdown（跨域）
```

---

## 回滚策略

### Feature Flag 控制

在迁移期间，使用 Feature Flag 控制 v2 模型启用：

```javascript
// 环境变量控制
const USE_V2_MODELS = process.env.ENABLE_V2_MODELS === "true";

async function convert(input, from, to) {
  if (USE_V2_MODELS && isV2Supported(from, to)) {
    try {
      return await convertV2(input, from, to);
    } catch (err) {
      console.warn("V2 conversion failed, fallback to V1", err);
      return await convertV1(input, from, to);
    }
  } else {
    return await convertV1(input, from, to);
  }
}
```

### A/B 测试

同时运行 v1 和 v2 路径，对比输出质量：

```javascript
async function convertWithABTest(input, from, to) {
  const [v1Result, v2Result] = await Promise.all([
    convertV1(input, from, to),
    convertV2(input, from, to)
  ]);
  
  // 对比输出
  const diff = compareOutputs(v1Result, v2Result);
  console.log("V1 vs V2 差异:", diff);
  
  // 记录指标
  logMetrics({
    v1Warnings: v1Result.qualityReport.warningCount,
    v2Warnings: v2Result.qualityReport.warningCount,
    v1Downgrades: v1Result.qualityReport.downgradeCount,
    v2Downgrades: v2Result.qualityReport.downgradeCount,
    diff
  });
  
  // 返回 v2 结果（或根据策略选择）
  return v2Result;
}
```

### 快速回滚

如果发现严重问题，快速回滚到 v1：

```bash
# 禁用 v2 模型
export ENABLE_V2_MODELS=false

# 或回滚到 v1 版本
git checkout v2.3.0  # 最后一个纯 v1 版本
npm install
npm test
```

### 回滚检查清单

在回滚前，确保：

- [ ] 记录回滚原因（Issue 或文档）
- [ ] 保存 v2 测试结果和日志
- [ ] 通知团队成员
- [ ] 运行 v1 测试套件
- [ ] 验证功能正常
- [ ] 制定修复计划

---

## 相关文档

- [MULTI_DOMAIN_MODEL_DESIGN.md](architecture/MULTI_DOMAIN_MODEL_DESIGN.md) - 详细设计文档
- [V2_MULTI_DOMAIN_MODELS.md](V2_MULTI_DOMAIN_MODELS.md) - 用户参考手册
- [v1-document-model.md](formats/v1-document-model.md) - v1 模型参考（已归档）
- [CONVERSION_POLICY.md](product/CONVERSION_POLICY.md) - 转换策略
- [IMPLEMENTATION_PLAN.md](development/IMPLEMENTATION_PLAN.md) - 实施计划

---

## 获取帮助

如果在迁移过程中遇到问题：

1. **查阅文档**: 优先查阅上述相关文档
2. **搜索 Issue**: 在 GitHub Issues 中搜索相似问题
3. **创建 Issue**: 如果是新问题，创建 Issue 并附上详细信息
4. **联系维护者**: 通过 GitHub Discussions 或邮件联系

---

**版本**: v2.0.0-design  
**状态**: 🎯 设计阶段  
**维护者**: Jack Yao  
**协作 AI**: Claude Code (Opus 4.8)  
**最后更新**: 2026-06-23
