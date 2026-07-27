# 项目状态

## 当前阶段

Feature Complete Review

## 当前里程碑

Post-Milestone 5 acceptance review

## 当前发布范围

当前 v1 候选范围包括本地优先试卷库、五种客观题型、练习恢复、答题历史、错题重练、随机抽题、题型筛选、JSON 导入导出、全库备份、schema version、旧数据迁移、中英文 UI、Windows 本地启动、PWA 基础、CI 和文档。

## Feature Complete 状态

候选状态；尚未完成验证。

Milestone 1 作为基础基线已完成。Milestone 2-5 的首版实现已落地，但完整验收待完成。

## Feature Freeze 状态

尚未进入。

只有在 v1 发布范围确认、Deferred Features 与当前版本分离、且用户接受当前 v1 产品边界后，才应进入 Feature Freeze。

## 当前发布阻断项

- 尚未完成项目级完整人工验收。
- 数据迁移、备份往返、答题进度恢复和破坏性工作流尚未获得正式端到端验证。
- 仓库保持 private 时，公开 Pages 部署继续暂缓。
- 尚不存在 Release Candidate，也尚未完成最终干净环境验证。

## Hardening 进度

尚未开始。

Milestone 6 Product Hardening 仍需要系统审计、缺陷清单、人工用户旅程验收、回归证据和发布阻断项分级。

## 验证状态

- 自动化核心测试已经存在，并在最近的本地检查中通过。
- CI workflow 已存在。
- 完整 v1 用户旅程的人工验收尚未完成。
- 尚未执行干净 clone 验证。
- GitHub Pages 部署为仅手动触发，并继续暂缓。

## 已知风险

- 由于仓库保持 private 且 Pages 部署暂缓，GitHub Pages 目前不能视为可用交付方式。
- ES module 应用不支持通过浏览器 `file://` 直接打开；用户必须使用本地静态服务器或 `start-local.bat`。
- 当前功能面已经较大，但人工 QA 证据还不足。

## 未知或未验证事项

- 使用接近真实规模的本地数据进行完整备份导出和导入往返。
- 旧版单试卷数据在代表性旧 localStorage 状态下的迁移行为。
- 刷新和重启浏览器后的答题进度恢复。
- 删除试卷、清空历史、导入备份覆盖等破坏性工作流。
- PWA 安装、离线行为和缓存升级在主要浏览器中的表现。
- 代表性设备上的可访问性和响应式行为。
- 干净环境重新 clone 并运行项目。

## Deferred Features

- AI 辅助生成题目。
- 桌面应用封装。
- 云同步与用户账户。
- 分享、协作和教师工作流。
- 主观题批改。
- 公开 GitHub Pages 部署和最终 GitHub Release。

## 下一步工程目标

确认 v1 发布范围，完成 Feature Complete Review，并决定项目是否可以进入 Feature Freeze。

## 仓库状态

- 默认分支：`main`
- 远程：`origin`
- 本次修订开始时读取到的最新 commit：`a9e91d8 Ignore local prompt drafts`
- 本次修订开始时远程同步状态：`main...origin/main`
- private 仓库状态：基于当前项目策略和 Pages 暂缓决定，按 private 处理
