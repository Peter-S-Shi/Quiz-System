# 项目状态

## 当前阶段

Feature Development - Scope Reopened（功能开发阶段，范围已重新开放）

## 当前里程碑

Milestone 6：Translation Practice（已规划；等待具体实现 prompt）

## 当前发布范围

当前版本范围包括已实现的 Milestone 1-5 基线，以及已批准但尚未实现的 Milestone 6 Translation Practice 工作区。Translation Practice 的宏观范围包括“文件夹 → 文档”组织、批量导入源文或双语材料、导出、独立书面翻译、难点标记、轻量词汇移交边界和练习后批量复盘。它保持多语言与本地优先，第一版不依赖 AI 判分或付费模型 API。

## Feature Complete 状态

旧范围下曾达到候选评审；当前范围已重新开放，因此不再属于功能完整状态。

Milestone 1 作为基础基线已完成。Milestone 2-5 的首版实现已落地，但完整验收待完成。旧边界下曾达到 Feature Complete Candidate 的事实作为历史证据保留。此后 Translation Practice 被批准为当前版本必要工作，因此必须在 Milestone 6 实现并验收后重新执行 Feature Complete Review。

## Feature Freeze 状态

尚未进入。

只有在 Milestone 6 完成实现与验收、重新开放的范围通过新一轮 Feature Complete Review、Deferred Features 与当前版本分离，并且用户明确接受扩展后的产品边界后，才可以进入 Feature Freeze。

## 当前发布阻断项

- 尚未完成项目级完整人工验收。
- Translation Practice 是当前版本的必要工作，但尚未完成详细实现设计、开发或验收。
- 数据迁移、备份往返、答题进度恢复和破坏性工作流尚未获得正式端到端验证。
- 仓库保持 private 时，公开 Pages 部署继续暂缓。
- 尚不存在 Release Candidate，也尚未完成最终干净环境验证。

## Hardening 进度

尚未开始。

Product Hardening 现顺延为 Milestone 7，只能在 Milestone 6 Translation Practice 通过 Feature Complete Review 且明确进入 Feature Freeze 后开始。

## 验证状态

- 自动化核心测试已经存在，并在最近的本地检查中通过。
- CI workflow 已存在。
- 完整 v1 用户旅程的人工验收尚未完成。
- 尚未执行干净 clone 验证。
- GitHub Pages 部署为仅手动触发，并继续暂缓。
- Translation Practice 尚不存在实现或行为验证。

## 已知风险

- 由于仓库保持 private 且 Pages 部署暂缓，GitHub Pages 目前不能视为可用交付方式。
- ES module 应用不支持通过浏览器 `file://` 直接打开；用户必须使用本地静态服务器或 `start-local.bat`。
- 当前功能面已经较大，但人工 QA 证据还不足。
- Translation Practice 将引入新的文档组织、导入导出、持久化、复盘和多语言 UX 边界，仍需详细设计与验收标准。

## 未知或未验证事项

- 使用接近真实规模的本地数据进行完整备份导出和导入往返。
- 旧版单试卷数据在代表性旧 localStorage 状态下的迁移行为。
- 刷新和重启浏览器后的答题进度恢复。
- 删除试卷、清空历史、导入备份覆盖等破坏性工作流。
- PWA 安装、离线行为和缓存升级在主要浏览器中的表现。
- 代表性设备上的可访问性和响应式行为。
- 干净环境重新 clone 并运行项目。
- Milestone 6 的详细数据模型、迁移策略、交互设计和验收检查；这些内容等待专用实现 prompt。

## Deferred Features

- AI 辅助生成题目。
- 桌面应用封装。
- 云同步与用户账户。
- 分享、协作和教师工作流。
- 主观题批改。
- 公开 GitHub Pages 部署和最终 GitHub Release。

## 下一步工程目标

等待并评估专用 Milestone 6 prompt，然后在已批准宏观范围内设计和实现 Translation Practice。在 Milestone 6 验收前，不开始 Product Hardening 或 Feature Freeze 工作。

## 仓库状态

- 默认分支：`main`
- 远程：`origin`
- 本次文档修订前已验证的基线：`05cd288 Add manual QA baseline`
- 当前文档修订：即包含本状态文件的 commit；其不可变标识以 Git 历史为准
- 同步目标：经过验证的文档工作合并到 `main`，并确保 `main` 与 `origin/main` 一致
- private 仓库状态：基于当前项目策略和 Pages 暂缓决定，按 private 处理
- Pull Request 状态：本次仅文档的分支流程不要求 PR
