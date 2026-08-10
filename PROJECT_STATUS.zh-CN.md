# 项目状态

## 当前阶段

Feature Development - Scope Reopened（功能开发阶段，范围已重新开放）

## 当前里程碑

Milestone 6.3：Translation Practice and Session Recovery - implementation complete / M6-wide acceptance deferred

## 验收政策（已变更）

用户已明确决定：M6.2 到 M6.7 不再逐个进行正式用户验收。每个子里程碑仍然需要实现评审、回归测试、CI 和范围审查，但一次性的、覆盖整个 M6 的综合验收将在 M6.7 完成后统一进行。M6.0 和 M6.1 在这一政策变更之前已经分别完成验收，这一历史事实不会被追溯改写。请不要把"implementation complete / M6-wide acceptance deferred"理解为等同于已验收。

## 当前发布范围

当前版本范围包括 Milestone 1-5 基线和已批准的 Milestone 6 工作线。Translation Practice 仍是 M6 的主要新增学习工作流。M6.0 Open Teaching Interchange 和 M6.1 Translation Domain and Persistence Foundation 均已验收。M6.2 Translation Library and Material Import/Export 和 M6.3 Translation Practice and Session Recovery 均已完成实现，验收统一推迟到 M6 整体验收时进行。M6.3 加入了第一个可用的、基于主动回忆原则的 Translation Practice 工作流：从文档开始练习、原文可见而参考译文默认隐藏地书写译文、在条目间导航、恢复中断的 session，并最终生成受保护的非客观 Learner Response。M6 保持本地优先，不要求内置 AI API、付费推理或网络连接。

## Feature Complete 状态

旧范围下曾达到候选评审；当前范围已重新开放，因此不再属于功能完整状态。

Milestone 1 作为基础基线已完成。Milestone 2-5 的首版实现已落地，但完整验收待完成。旧边界下曾达到 Feature Complete Candidate 的事实作为历史证据保留。M6.0 和 M6.1 已验收。M6.2 和 M6.3 已完成实现，验收推迟到 M6 整体验收；M6.4-M6.7 仍未实现。所有 Milestone 6 工作实现、并完成推迟的 M6 整体验收后，必须重新执行全产品 Feature Complete Review。

## Feature Freeze 状态

尚未进入。

只有在 Milestone 6 完成实现并完成推迟的 M6 整体验收、重新开放的范围通过新一轮 Feature Complete Review、Deferred Features 与当前版本分离，并且用户明确接受扩展后的产品边界后，才可以进入 Feature Freeze。

## 当前发布阻断项

- 尚未完成项目级完整人工验收。
- 覆盖 M6.0-M6.7 的整体 M6 验收尚未进行；M6.2 和 M6.3 已完成实现，但按设计不做单独验收。
- Translation Practice 练习 session 现已存在，但 Learner Answer Marking（M6.4）、Rich Correction（M6.5）、External Teacher Round Trip（M6.6）和 History/Retry/Portability（M6.7）尚未开始。
- 数据迁移、备份往返、答题进度恢复和破坏性工作流尚未获得正式端到端验证。
- 仓库保持 private 时，公开 Pages 部署继续暂缓。
- 尚不存在 Release Candidate，也尚未完成最终干净环境验证。

## Hardening 进度

尚未开始。

Product Hardening 是 Milestone 7，只能在全部 Milestone 6 工作通过评审并明确进入 Feature Freeze 后开始。

## 验证状态

- 44 项 core/interchange/translation/import/session 自动测试通过，覆盖稳定 Translation 持久化、顺序、source-only 与 reference 材料、孤儿防护、显式 cascade 删除、非客观 Learner Response 兼容、finalized evidence 保护、备份兼容、公开示例校验、批量导入解析、格式错误行拒绝、JSON 导入文件夹重新分配、重复 ID 冲突处理、导出/导入往返对公开 schema 的校验、Translation session 快照在后续文档编辑下保持稳定、按条目 ID 持久化答案与导航、格式错误 session 被安全拒绝、非客观 finalization，以及隔离的 active-session 存储 key。
- CI workflow 已存在。
- 本地浏览器 smoke test 完整走过 M6.3 练习旅程：开始练习、逐条作答与导航、显示/隐藏可选参考译文、刷新后恢复且答案/位置/显示状态完全一致、完成后进入无虚假分数的复盘页、确认只有在证据成功保存后才清空 active session、导出作答记录、刷新后确认证据仍存在、再次练习生成不同 response ID 且不影响第一次证据，并在存在未完成 Translation session 的同时运行 Objective Quiz session，确认互不干扰，控制台无错误。测试过程中发现并修复了一个真实 bug（在完成页显示时切换选择其他文档不会离开完成页）。此前的 smoke test 已覆盖完整的 M6.2 Translation Library 旅程，控制台无错误。
- 浏览器测试工具确认了导出下载会正确触发（文件名和事件正确），但未捕获下载文件的实际落盘内容，因此人工检查下载文件内容仍属于推迟的 M6 整体验收范围。
- 完整 v1 用户旅程的人工验收尚未完成。
- 尚未执行干净 clone 验证。
- GitHub Pages 部署为仅手动触发，并继续暂缓。
- M6.0 和 M6.1 已验收。M6.2 和 M6.3 已有自动化测试和 smoke test 覆盖；两者的正式验收都按政策推迟到 M6.7 之后的整体验收。

## 已知风险

- 由于仓库保持 private 且 Pages 部署暂缓，GitHub Pages 目前不能视为可用交付方式。
- ES module 应用不支持通过浏览器 `file://` 直接打开；用户必须使用本地静态服务器或 `start-local.bat`。
- 当前功能面已经较大，但人工 QA 证据还不足。
- Finalized Learner Response 使用浏览器本地存储且不被 history 静默截断；长期积累的大型 evidence 集合最终可能遇到浏览器容量限制。
- Translation Practice 练习 session 现已存在，但学习者选段标记、rich correction 和外部 Teacher Review 往返仍是后续 M6 子里程碑尚未设计的 UX 边界。
- 目前界面除了刚完成练习后的即时复盘页外，没有单独的入口可以浏览某份翻译文档历史上的 Learner Response；详细的历史/重练视图明确属于 M6.7 范围。
- 如果某份翻译文档在其 Learner Response evidence 存在期间被删除，该 evidence 依然有效（它自带 material 快照），但不再能通过文档编辑器直接找到；这与现有 Objective Quiz 的行为一致（删除试卷不会删除其 Learner Response）。
- 把验收推迟到 M6 结束意味着 M6.2-M6.7 之间的集成问题可能比逐里程碑验收更晚才被发现；在此期间更依赖回归测试和 CI。

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
- 真实浏览器关闭后重新打开（而非仅刷新）时 Translation Practice session 的恢复情况（已验证基于刷新的恢复，未单独验证完整关闭重开）。
- 在真实浏览器中人工检查下载的 Translation Learner Response JSON 文件的实际内容。

## Deferred Features

- AI 辅助生成题目。
- 桌面应用封装。
- 云同步与用户账户。
- 分享、协作和应用内教师账号/管理工作流。
- 主观题批改。
- 公开 GitHub Pages 部署和最终 GitHub Release。

## 下一步工程目标

按已批准的子里程碑顺序，下一个是 M6.4 Learner Answer Marking and Annotation Foundation，但未经新的 prompt 不得开始。在覆盖 M6.0-M6.7 的整体 M6 验收完成前，不开始 Product Hardening 或 Feature Freeze 工作。

## 仓库状态

- 默认分支：`main`
- 远程：`origin`
- M6.3 开始前已验证的基线：`2774d58 Build M6.2 Translation Library and material import/export`（squash merge，已包含 CI 依赖安装修复）
- 当前文档修订：即包含本状态文件的 commit；其不可变标识以 Git 历史为准
- 同步目标：经过验证的 M6.3 feature work 位于 `milestone/6.3-translation-practice` 分支，将开出 Pull Request 提交到 `main`，未经明确指示不得合并
- private 仓库状态：基于当前项目策略和 Pages 暂缓决定，按 private 处理
- Pull Request 状态：正在为 `milestone/6.3-translation-practice` 创建 Pull Request 供独立评审；未经用户明确指示不得合并
