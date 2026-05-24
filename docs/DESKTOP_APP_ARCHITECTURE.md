# Desktop App Architecture

版本：v0.2.0
状态：生效
最后更新：2026-05-03

## 目标形态

Trans2Former Desktop 采用：

```text
Tauri desktop shell
+ Web-GUI frontend
+ TypeScript conversion core
+ Web Worker / WASM
+ core local enhancement modules
```

当前浏览器 Web 应用继续作为 GUI 和转换核心验证底座。桌面化不是推翻现有实现，而是把现有 Web-GUI 放入 Tauri 壳，并补齐文件系统、版本历史和桌面权限隔离。

## 选择判断

Tauri + Web-GUI 是当前最合理的桌面路线。

理由：

- 低占用：Tauri 复用系统 WebView，避免 Electron 自带 Chromium 带来的基础内存和包体积压力。
- 高体验上限：Web-GUI 更适合做现代工作台、分栏编辑、实时预览、虚拟滚动、质量报告和 diff。
- 本地安全：Tauri 的能力边界更适合做最小文件系统权限和显式目录授权。
- 技术连续性：当前浏览器转换核心、Worker、DocumentModel、前端工作台和测试可以继续复用。
- 核心模块友好：重格式、高保真渲染器、本地 OCR/OFD 可以本地按需加载，不必进入首屏启动路径。

主要风险：

- WebView 差异：Windows WebView2、macOS WKWebView、Linux WebKitGTK 的能力和性能存在差异，需要平台 smoke test。
- 大文件压力：WebView 仍可能被主线程、DOM、Blob URL、Canvas 和内存复制拖慢，必须依赖 Worker、Transferable、虚拟滚动和渐进预览。
- Tauri 权限复杂度：一旦权限配置过宽，会破坏“绝对安全”的产品底线。
- 核心重能力隔离难度：处理阶段禁联网、权限边界和崩溃隔离必须进入自动化测试。

结论：路线合理，但不能只“套壳”。Tauri 只解决桌面承载和权限入口，真正的现代桌面体验来自 GUI 信息架构、异步任务系统、低内存管线、版本控制、质量报告和核心本地处理隔离。

## 桌面体验标准

目标不是“网页装进桌面壳”，而是成熟现代 PC 桌面软件体验：

- 启动快：冷启动目标 < 2s，首次可操作不被重能力扫描和格式索引阻塞。
- 操作顺：拖拽文件、选择输出、转换、编辑、预览、导出都必须有明确反馈。
- 不打断：大文件解析、预览和导出全部异步，主界面不冻结。
- 可恢复：转换失败、重能力失败、预览失败时，用户的输入、编辑和输出状态不丢。
- 信息密度合理：主界面服务操作，不堆说明文案；复杂解释放入 warnings、quality report 和详情面板。
- 安全可见：local-only、no-upload、核心本地处理、历史保存状态在关键位置可见。
- 资源可控：默认核心轻，重格式和模型本地按需加载，可禁用、清理、回滚。
- 数据可控：版本历史默认只在会话内；持久保存必须 opt-in，并提供清除入口。

## GUI 边界

用户端必须是工具，不是项目说明页。

- 首屏只服务用户任务：上传、选择格式、编辑、预览、转换、下载。
- 不在主界面堆产品定位、路线图、安全长说明或开发术语。
- 本地优先和安全底线只用短状态表达，不占用工作区。
- 桌面端使用左右工作区：左侧输入/编辑，右侧预览/输出。
- 中小屏自动收敛为单列或 tabs，避免固定三栏导致拥挤。
- 预览和输出必须独立滚动，长文档不挤压工具栏。
- 禁止让按钮、选择框、长单词或状态文本在小屏溢出。

必备区域：

- 顶部工具栏：品牌、输入格式、输出格式、转换、取消、下载、状态。
- 输入区：上传入口、文件名、简短能力提示、编辑器、字数/行数。
- 预览区：标准化内容查看。
- 输出区：文本输出、PDF 预览、错误详情和脱敏诊断。
- 底部面板：warnings、QualityReport、diff、versions。

## 主模块

| 模块 | 职责 |
| --- | --- |
| FileQueue | 文件拖拽、批量队列、任务状态、失败重试 |
| ConversionPanel | 输入/输出格式、profile、质量选项和导出配置 |
| InputPreview | 原始输入预览、分片读取、降级预览 |
| DocumentModelView | block tree、source span、warnings 和资产引用 |
| OutputEditor | 输出文本/结构编辑、大文本输入、warnings resolved 状态 |
| OutputPreview | HTML/PDF/image/Markdown 预览和实时刷新 |
| WarningsPanel | block-level warnings、格式降级、性能和安全提示 |
| QualityReportPanel | 结构保真、视觉保真、资源保真、可读性和 chunked 等价 |
| VersionHistory | session undo/redo、checkpoint、diff、持久历史 opt-in |
| SecurityCenter | local-only 状态、权限、缓存、历史和清除入口 |

## 安全模式

| 场景 | 是否允许联网 | 是否允许接触用户文档 |
| --- | ---: | ---: |
| 文档转换 / 编辑 / 导出 | 不可以 | 可以 |
| 本地模型运行 | 不可以 | 可以 |
| 版本历史保存 | 不联网 | 用户显式 opt-in |

实现要求：

- Tauri 权限必须最小化，只访问用户明确选择的文件和输出目录。
- 不提供插件安装、插件下载、插件导入或插件更新入口。
- 处理阶段必须拦截联网能力。
- 诊断复制必须脱敏，不能默认包含文档正文、文件名、签章信息或 stack。

## 版本控制策略

| 能力 | 默认行为 |
| --- | --- |
| Undo / Redo | 当前会话开启 |
| Checkpoint | 当前会话开启 |
| 关闭后保留历史 | 默认关闭 |
| 7 天本地版本历史 | 用户显式开启 |
| 项目文件保存 | 用户手动保存 |
| 云同步 | 不做 |

版本控制保存的是用户内容，因此持久化历史必须显式 opt-in，并提供清除入口。

## 性能目标

| 项目 | 目标 |
| --- | --- |
| 冷启动 | < 2s |
| 空闲内存 | 80-150MB |
| 小文件开始反馈 | < 500ms |
| 10MB 文本转换 | 不阻塞 UI |
| 50MB+ 文件 | Worker + 渐进预览 |
| 100MB+ 文件 | 分块 / 降级预览 |
| 重格式 | 核心本地按需加载 |
| 本地模型 | 手动安装、手动启用 |

## 当前实现

- 已建立 Tauri v2 scaffold：`src-tauri/tauri.conf.json`、`src-tauri/capabilities/default.json`、Rust entrypoint 和 `npm run desktop:check`。
- 已声明最小权限边界：主窗口、打开/保存对话框、文件读写能力；不开放 shell、HTTP 或目录级扫描权限。
- Web-GUI 已建立 P0 工作台骨架：文件队列、任务状态、批量选择、失败重试、输出目录提示、导出命名策略。
- 主工作区已升级为 Input / DocumentModel / Output 三栏，窄屏使用 tabs。
- 底部已建立 Warnings、Quality Report、Diff 和 Versions 面板。
- 顶部已建立 Security Center 入口。
- OutputEditor 已落地文本输出编辑、实时预览、undo / redo、checkpoint、version diff、warnings resolved 和本地历史 opt-in。
- P2 响应核心已落地：Worker Transferable、虚拟列表、渐进/降级预览、取消清理和专项测试。
- 核心本地处理边界已落地：processing no-network、安全入口、能力说明和崩溃 fallback。

## 当前不足

- `public/app.js` 已经承担过多职责，P4 必须拆分工作台状态、预览、队列和历史持久化模块。
- 当前文件队列仍是交互骨架，批量转换调度、队列持久化和桌面原生保存仍需后续增强。
- Asset lazy-load 尚未落地，图片、字体、附件仍需按预览/导出需要加载。
- 核心重能力仍需补 Worker/WASM 执行容器和资源限制。
- DOCX/PDF 输出仍需继续增强高保真；PNG/JPEG 文档图片输出在真实视觉渲染器完成前不暴露给用户。
- OFD 已进入核心 L0 路线，页面树、DocumentModel 提取、本地渲染和视觉回归仍待推进。
- `release/trans2former-2.0.0/` 当前是 Web-GUI core preview release 包，不是 Tauri 桌面安装包。

## 下一阶段架构方向

1. P4：先拆分前端工作台模块，并建立重格式 capability note、公开样例和质量回归。
2. P5：实现核心重能力执行容器，验证 no-network processing、崩溃隔离、资源预算和回滚。
3. P6：以样例驱动推进 OFD、高保真 DOCX/PDF、本地 OCR/layout/table 核心增强。
4. P7：补 Tauri 安装包、签名、自动更新、平台 smoke 和桌面权限体验。

## 技术边界

- 不使用 Electron。
- 不新增服务端转换 API。
- 不接入云端 OCR、云端 AI、云端转写或第三方转换 API。
- 不把 OFD、高保真渲染器、本地 OCR 或本地模型塞进首屏启动路径。
- 不绕过 `DocumentModel` 做格式私有直连。
