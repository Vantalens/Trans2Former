# Trans2Former 文档整理方案

## 当前问题

根目录有 **40 个 markdown 文件**，包括：
- 核心开发文档
- 多语言 README
- 临时报告和修复记录
- 发布说明
- 检查清单

**问题**：文档过多，难以找到关键信息

## 整理方案

### 目标结构

```
Trans2Former/
├── README.md                    # 主 README（保留）
├── CHANGELOG.md                 # 变更日志（保留）
├── CONTRIBUTING.md              # 贡献指南（保留）
├── CLAUDE.md                    # AI 协作入口（保留）
├── LICENSE                      # 开源协议（保留）
│
├── docs/                        # 📁 所有文档
│   ├── README.md                # 文档索引
│   │
│   ├── development/             # 📁 开发文档
│   │   ├── PRD.md               # 产品需求
│   │   ├── TECH_STACK.md        # 技术栈
│   │   ├── IMPLEMENTATION_PLAN.md
│   │   ├── TEST_PLAN.md
│   │   ├── AGENT_RULES.md
│   │   ├── progress.md
│   │   ├── lessons.md
│   │   ├── INSTALL.md
│   │   ├── TESTING_GUIDE.md
│   │   └── DEVELOPMENT_TASKS.md
│   │
│   ├── release/                 # 📁 发布相关
│   │   ├── RELEASE_GUIDE.md
│   │   ├── v2.0.0.md
│   │   ├── v2.1.0.md
│   │   └── v2.3.0.md
│   │
│   ├── checklists/              # 📁 检查清单
│   │   ├── ACCEPTANCE_CHECKLIST.md
│   │   └── COMMIT_CHECKLIST.md
│   │
│   ├── reports/                 # 📁 项目报告
│   │   ├── PROJECT_ORGANIZATION_REPORT.md
│   │   └── P1_BRANCH_COVERAGE_PLAN.md
│   │
│   ├── setup/                   # 📁 设置脚本说明
│   │   └── setup-labels.md
│   │
│   └── i18n/                    # 📁 多语言文档
│       ├── README.ar.md
│       ├── README.de.md
│       ├── README.en.md
│       ├── README.es.md
│       ├── README.fr.md
│       ├── README.ja.md
│       ├── README.ko.md
│       ├── README.pt-BR.md
│       └── README.ru.md
│
└── .archived/                   # 📁 归档文档（已在 .gitignore）
    ├── AUDIT_REPORT.md
    ├── FINAL_FIX_*.md
    ├── FIX_*.md
    ├── PDF_*.md
    └── PROJECT_FEEDBACK_*.md
```

### 根目录保留文件（5 个）

**必须保留在根目录**：
1. `README.md` - 项目入口，必须在根目录
2. `CHANGELOG.md` - 变更日志，标准位置
3. `CONTRIBUTING.md` - 贡献指南，标准位置
4. `CLAUDE.md` - AI 协作入口，必须在根目录
5. `LICENSE` - 开源协议，标准位置

### 移动规则

#### development/ - 开发文档（10 个）
```
PRD.md
TECH_STACK.md
IMPLEMENTATION_PLAN.md
TEST_PLAN.md
AGENT_RULES.md
progress.md
lessons.md
INSTALL.md
TESTING_GUIDE.md
DEVELOPMENT_TASKS.md
```

#### release/ - 发布文档（4 个）
```
RELEASE_GUIDE.md
RELEASE_NOTES_v2.0.0.md → v2.0.0.md
RELEASE_NOTES_v2.1.0.md → v2.1.0.md
RELEASE_NOTES_v2.3.0.md → v2.3.0.md
```

#### checklists/ - 检查清单（2 个）
```
ACCEPTANCE_CHECKLIST.md
COMMIT_CHECKLIST.md
```

#### reports/ - 项目报告（2 个）
```
PROJECT_ORGANIZATION_REPORT.md
P1_BRANCH_COVERAGE_PLAN.md
```

#### setup/ - 设置说明（1 个）
```
setup-labels.md
```

#### i18n/ - 多语言（9 个）
```
README.ar.md
README.de.md
README.en.md
README.es.md
README.fr.md
README.ja.md
README.ko.md
README.pt-BR.md
README.ru.md
```

#### .archived/ - 归档（7 个）
```
AUDIT_REPORT.md
FINAL_FIX_REPORT.md
FINAL_FIX_SUMMARY.md
FIX_ITERATION_3.md
FIX_STATUS_REPORT.md
PDF_BLANK_FIX_SUMMARY.md
PDF_PREVIEW_BLANK_ISSUE.md
PROJECT_FEEDBACK_2026-06-21.md
```

### 整理后效果

**根目录**：5 个文件（清爽）
**docs/**：35 个文件（分类清晰）
- development/: 10 个
- release/: 4 个
- checklists/: 2 个
- reports/: 2 个
- setup/: 1 个
- i18n/: 9 个
- README.md: 1 个（索引）

### 文档索引 (docs/README.md)

创建一个清晰的索引文档，包含：
- 快速导航
- 文档分类说明
- 推荐阅读顺序

## 执行步骤

1. ✅ 创建目录结构
2. 移动文件到对应目录
3. 创建 docs/README.md 索引
4. 更新 .gitignore（归档目录）
5. 更新 CLAUDE.md（文档路径）
6. 提交变更

## 优点

1. **清晰的结构**：按类型分类，易于查找
2. **干净的根目录**：只保留必要文件
3. **更好的维护性**：新文档有明确的归属
4. **符合惯例**：docs/ 是标准的文档目录
5. **易于导航**：docs/README.md 作为索引

## 风险

1. **链接失效**：移动文件后，现有链接可能失效
   - **缓解**：搜索并更新所有相对路径

2. **用户习惯**：用户可能习惯在根目录找文档
   - **缓解**：在主 README 中添加文档链接

---

**创建日期**: 2026-06-23  
**执行者**: Claude Opus 4.8
