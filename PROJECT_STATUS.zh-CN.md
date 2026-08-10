# 项目状态

## 当前阶段

Feature Development - Scope Reopened（功能开发阶段，范围已重新开放）

## 当前里程碑

Milestone 6.2：Translation Library and Material Import / Export - implementation complete / user acceptance pending

## 当前发布范围

当前版本范围包括 Milestone 1-5 基线和已批准的 Milestone 6 工作线。Translation Practice 仍是 M6 的主要新增学习工作流。M6.0 Open Teaching Interchange 是已经验收的横向基础设施。M6.1 Translation Domain and Persistence Foundation 已验收。M6.2 现在提供面向用户的 Translation Library 工作区、文件夹/文档/条目管理、仅原文与双语批量导入、可移植 Translation Document JSON 导入导出，以及后续 Translation 工作流所需的导入安全边界。M6 保持本地优先，不要求内置 AI API、付费推理或网络连接。

## Feature Complete 状态

旧范围下曾达到候选评审；当前范围已重新开放，因此不再属于功能完整状态。

Milestone 1 作为基础基线已完成。Milestone 2-5 的首版实现已落地，但完整验收待完成。旧边界下曾达到 Feature Complete Candidate 的事实作为历史证据保留。M6.0 和 M6.1 已通过用户验收。M6.2 已完成实现并等待用户验收；M6.3-M6.7 和 Translation Practice 练习 session 仍未实现。所有 Milestone 6 工作实现并验收后，必须重新执行全产品 Feature Complete Review。

## Feature Freeze 状态

尚未进入。

只有在 Milestone 6 完成实现与验收、重新开放的范围通过新一轮 Feature Complete Review、Deferred Features 与当前版本分离，并且用户明确接受扩展后的产品边界后，才可以进入 Feature Freeze。

## 当前发布阻断项

- 尚未完成项目级完整人工验收。
- M6.2 的 Translation Library、导入导出和导入安全边界需要用户验收。
- Translation Practice 是当前版本必要工作，但 M6.3-M6.7 尚未开始。
- 数据迁移、备份往返、答题进度恢复和破坏性工作流尚未获得正式端到端验证。
- 仓库保持 private 时，公开 Pages 部署继续暂缓。
- 尚不存在 Release Candidate，也尚未完成最终干净环境验证。

## Hardening 进度

尚未开始。

Product Hardening 是 Milestone 7，只能在全部 Milestone 6 工作通过评审并明确进入 Feature Freeze 后开始。

## 验证状态

- 31 项 core/interchange/translation/import 自动测试通过，覆盖稳定 Translation 持久化、顺序、source-only 与 reference 材料、孤儿防护、显式 cascade 删除、非客观 Learner Response 兼容、finalized evidence 保护、备份兼容、公开示例校验、批量导入解析、格式错误行拒绝、JSON 导入文件夹重新分配、重复 ID 冲突处理，以及导出/导入往返对公开 schema 的校验。
- CI workflow 已存在。
- 本地浏览器 smoke test 完整走过 M6.2 验收旅程：文件夹/文档/条目 CRUD、仅原文与双语批量导入（含格式错误行拒绝）、可移植 JSON 导入（含文件夹重新分配和重复 ID 冲突副本导入）、导出、刷新后持久化、文件夹级联删除、完整备份覆盖，以及中英文标签一致性，控制台无错误。此前的 smoke test 也完成过一次合成 Objective Quiz，并验证 finalized evidence 提示、双语结果/历史导出控件、桌面布局和 390px 响应式布局；控制台无错误。
- 浏览器测试工具确认了导出下载会正确触发（文件名和事件正确），但未捕获下载文件的实际落盘内容，因此人工检查下载文件内容仍属于用户验收。
- 完整 v1 用户旅程的人工验收尚未完成。
- 尚未执行干净 clone 验证。
- GitHub Pages 部署为仅手动触发，并继续暂缓。
- M6.0 和 M6.1 已验收。M6.2 Translation Library、导入导出和导入安全行为已有自动化测试和 smoke test 覆盖；正式用户验收仍是独立且待完成的事项。

## 已知风险

- 由于仓库保持 private 且 Pages 部署暂缓，GitHub Pages 目前不能视为可用交付方式。
- ES module 应用不支持通过浏览器 `file://` 直接打开；用户必须使用本地静态服务器或 `start-local.bat`。
- 当前功能面已经较大，但人工 QA 证据还不足。
- Finalized Learner Response 使用浏览器本地存储且不被 history 静默截断；长期积累的大型 evidence 集合最终可能遇到浏览器容量限制。
- Translation Library 管理 UI 现已存在，但 Translation Practice 练习 session、学习者标记和 rich correction 仍是后续 M6 子里程碑尚未设计的 UX 边界。
- Translation Practice 练习 session、复盘和 remediation 在 M6.2 材料管理范围之外，仍需详细设计与验收标准。

## 未知或未验证事项

- 使用接近真实规模的本地数据进行完整备份导出和导入往返。
- 旧版单试卷数据在代表性旧 localStorage 状态下的迁移行为。
- 刷新和重启浏览器后的答题进度恢复。
- 删除试卷、清空历史、导入备份覆盖等破坏性工作流。
- PWA 安装、离线行为和缓存升级在主要浏览器中的表现。
- 代表性设备上的可访问性和响应式行为。
- 干净环境重新 clone 并运行项目。
- 人工检查下载的 Learner Response JSON，并在真实浏览器中完成包含 learner evidence 的备份/恢复往返。
- 在真实浏览器中完成包含 Translation Folder、Document 和 Item 数据的备份/恢复往返。
- 在真实浏览器中人工检查下载的 Translation Document JSON 文件的实际内容（自动化 smoke test 只验证了下载触发和文件名，未验证落盘字节）。

## Deferred Features

- AI 辅助生成题目。
- 桌面应用封装。
- 云同步与用户账户。
- 分享、协作和应用内教师账号/管理工作流。
- 主观题批改。
- 公开 GitHub Pages 部署和最终 GitHub Release。

## 下一步工程目标

完成 M6.2 用户验收。验收后也必须等待新的 prompt 才能开始 M6.3；全部 Milestone 6 验收 gate 完成前，不开始 Product Hardening 或 Feature Freeze 工作。

## 仓库状态

- 默认分支：`main`
- 远程：`origin`
- M6.2 开始前已验证的基线：`33aad75 Align M6.1 learner response schema`
- 当前文档修订：即包含本状态文件的 commit；其不可变标识以 Git 历史为准
- 同步目标：经过验证的 M6.2 feature work 位于 `milestone/6.2-translation-library` 分支，将通过 Pull Request 合并到 `main`
- private 仓库状态：基于当前项目策略和 Pages 暂缓决定，按 private 处理
- Pull Request 状态：正在为 `milestone/6.2-translation-library` 创建 Pull Request，供独立评审后合并
