# 项目状态

## 当前阶段

Feature Development - Scope Reopened（功能开发阶段，范围已重新开放）

## 当前里程碑

Milestone 6.0：Open Teaching Interchange Foundation - implementation complete / user acceptance pending

## 当前发布范围

当前版本范围包括 Milestone 1-5 基线和已批准的 Milestone 6 工作线。Translation Practice 仍是 M6 的主要新增学习工作流。M6.0 Open Teaching Interchange 是横向基础设施：它服务现有 Objective Quiz，并将由 Translation Practice 作为第一个完整 rich-response consumer。M6 保持本地优先，不要求内置 AI API、付费推理或网络连接。

## Feature Complete 状态

旧范围下曾达到候选评审；当前范围已重新开放，因此不再属于功能完整状态。

Milestone 1 作为基础基线已完成。Milestone 2-5 的首版实现已落地，但完整验收待完成。旧边界下曾达到 Feature Complete Candidate 的事实作为历史证据保留。M6.0 已完成实现但尚未获得用户验收；M6.1-M6.7 和 Translation Practice 仍未实现。所有 Milestone 6 工作实现并验收后，必须重新执行全产品 Feature Complete Review。

## Feature Freeze 状态

尚未进入。

只有在 Milestone 6 完成实现与验收、重新开放的范围通过新一轮 Feature Complete Review、Deferred Features 与当前版本分离，并且用户明确接受扩展后的产品边界后，才可以进入 Feature Freeze。

## 当前发布阻断项

- 尚未完成项目级完整人工验收。
- M6.0 需要依据新增 manual QA delta 完成用户验收。
- Translation Practice 是当前版本必要工作，但 M6.1-M6.7 尚未开始。
- 数据迁移、备份往返、答题进度恢复和破坏性工作流尚未获得正式端到端验证。
- 仓库保持 private 时，公开 Pages 部署继续暂缓。
- 尚不存在 Release Candidate，也尚未完成最终干净环境验证。

## Hardening 进度

尚未开始。

Product Hardening 是 Milestone 7，只能在全部 Milestone 6 工作通过评审并明确进入 Feature Freeze 后开始。

## 验证状态

- 15 项 core/interchange 自动测试通过，覆盖受保护 learner evidence、Teacher Review 拒绝边界、不受 history 上限影响的 response 集合、provenance、备份兼容和公开示例校验。
- CI workflow 已存在。
- 本地浏览器 smoke test 完成了一次合成 Objective Quiz，并验证 finalized evidence 提示、双语结果/历史导出控件、桌面布局和 390px 响应式布局；控制台无错误。
- 浏览器测试工具未捕获程序化下载事件，因此导出文件实际落盘和人工内容检查仍属于用户验收。
- 完整 v1 用户旅程的人工验收尚未完成。
- 尚未执行干净 clone 验证。
- GitHub Pages 部署为仅手动触发，并继续暂缓。
- M6.0 已有实现；Translation Practice 尚不存在实现或行为验证。

## 已知风险

- 由于仓库保持 private 且 Pages 部署暂缓，GitHub Pages 目前不能视为可用交付方式。
- ES module 应用不支持通过浏览器 `file://` 直接打开；用户必须使用本地静态服务器或 `start-local.bat`。
- 当前功能面已经较大，但人工 QA 证据还不足。
- Finalized Learner Response 使用浏览器本地存储且不被 history 静默截断；长期积累的大型 evidence 集合最终可能遇到浏览器容量限制。
- Translation Practice 将引入新的文档组织、导入导出、持久化、复盘和多语言 UX 边界，仍需详细设计与验收标准。

## 未知或未验证事项

- 使用接近真实规模的本地数据进行完整备份导出和导入往返。
- 旧版单试卷数据在代表性旧 localStorage 状态下的迁移行为。
- 刷新和重启浏览器后的答题进度恢复。
- 删除试卷、清空历史、导入备份覆盖等破坏性工作流。
- PWA 安装、离线行为和缓存升级在主要浏览器中的表现。
- 代表性设备上的可访问性和响应式行为。
- 干净环境重新 clone 并运行项目。
- 人工检查下载的 Learner Response JSON，并在真实浏览器中完成包含 learner evidence 的备份/恢复往返。
- M6.1 Translation domain model 和持久化设计；这些内容等待 M6.0 验收后的新 prompt。

## Deferred Features

- AI 辅助生成题目。
- 桌面应用封装。
- 云同步与用户账户。
- 分享、协作和应用内教师账号/管理工作流。
- 主观题批改。
- 公开 GitHub Pages 部署和最终 GitHub Release。

## 下一步工程目标

使用双语 manual QA delta 完成 M6.0 用户验收。验收后也必须等待新的 prompt 才能开始 M6.1；全部 Milestone 6 验收 gate 完成前，不开始 Product Hardening 或 Feature Freeze 工作。

## 仓库状态

- 默认分支：`main`
- 远程：`origin`
- M6.0 开始前已验证的基线：`9949dfb Reopen lifecycle scope for translation practice`
- 当前文档修订：即包含本状态文件的 commit；其不可变标识以 Git 历史为准
- 同步目标：经过验证的 M6.0 feature work 合并到 `main`，并确保 `main` 与 `origin/main` 一致
- private 仓库状态：基于当前项目策略和 Pages 暂缓决定，按 private 处理
- Pull Request 状态：本次本地 feature branch 流程不要求 PR
