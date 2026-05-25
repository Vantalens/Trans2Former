# Trans2Former v2.1.0

本地优先的多格式文档转换器，继续强化本地安全保障与文档输出质量。

## 新增

- **安全中心外部请求监控**：新增对外部网络请求的实时监控能力，支持「关闭/审计/拦截」三档策略，提升本地优先的安全保障。

## 改进

- 增强文档格式处理逻辑，提升 PDF 输出质量与稳定性。
- 移除底部抽屉面板，简化界面布局。

## 重构

- 重构测试用例组织结构，移除已废弃的 plugin patch 功能。

## 升级指南

从 v2.0.0 升级：直接覆盖部署即可，无破坏性 API 变更。

## 校验信息

- 包名：`trans2former-2.1.0.zip`
- SHA-256：`e7dbd9fb336c193f4590e090df4cb5966b642f2ee9717666cc49693014f03425`

## 全部测试通过

`npm test` 全套通过：smoke / snapshot / capability audit / conversion quality / format integrity / worker payload / browser smoke / workbench queue / desktop shell / local security / resource budget / responsiveness / P4-P7 / release readiness。
