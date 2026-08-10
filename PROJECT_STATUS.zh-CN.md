# 项目状态

## 当前阶段

Feature Development - Scope Reopened（功能开发阶段，范围已重新开放）

## 当前里程碑

Milestone 6.5：Rich Correction / Revision Workspace - implementation complete / M6-wide acceptance deferred

## 验收政策（已变更）

用户已明确决定：M6.2 到 M6.7 不再逐个进行正式用户验收。每个子里程碑仍然需要实现评审、回归测试、CI 和范围审查，但一次性的、覆盖整个 M6 的综合验收将在 M6.7 完成后统一进行。M6.0 和 M6.1 在这一政策变更之前已经分别完成验收，这一历史事实不会被追溯改写。请不要把"implementation complete / M6-wide acceptance deferred"理解为等同于已验收。

## 当前发布范围

当前版本范围包括 Milestone 1-5 基线和已批准的 Milestone 6 工作线。Translation Practice 仍是 M6 的主要新增学习工作流。M6.0 Open Teaching Interchange 和 M6.1 Translation Domain and Persistence Foundation 均已验收。M6.2 Translation Library and Material Import/Export、M6.3 Translation Practice and Session Recovery、M6.4 Learner Answer Marking and Annotation Foundation 和 M6.5 Rich Correction / Revision Workspace 均已完成实现，验收统一推迟到 M6 整体验收时进行。M6.4 加入了学习者对自己 Translation Practice 作答片段的、由学习者主动控制的元认知标记（`unknown`/`uncertain`/`should_know`），并作为结构化证据保存在 finalized Learner Response 中。M6.5 加入了批改工作区：评阅者可以查看一份已完成的 Translation Learner Response 的不可变原始作答，并在一个独立的、增量扩展的 Teacher Review 层中添加结构化的 rich correction 证据（样式、插入/替换/删除、批注）。M6 保持本地优先，不要求内置 AI API、付费推理或网络连接。

## Feature Complete 状态

旧范围下曾达到候选评审；当前范围已重新开放，因此不再属于功能完整状态。

Milestone 1 作为基础基线已完成。Milestone 2-5 的首版实现已落地，但完整验收待完成。旧边界下曾达到 Feature Complete Candidate 的事实作为历史证据保留。M6.0 和 M6.1 已验收。M6.2、M6.3、M6.4 和 M6.5 已完成实现，验收推迟到 M6 整体验收；M6.6-M6.7 仍未实现。所有 Milestone 6 工作实现、并完成推迟的 M6 整体验收后，必须重新执行全产品 Feature Complete Review。

## Feature Freeze 状态

尚未进入。

只有在 Milestone 6 完成实现并完成推迟的 M6 整体验收、重新开放的范围通过新一轮 Feature Complete Review、Deferred Features 与当前版本分离，并且用户明确接受扩展后的产品边界后，才可以进入 Feature Freeze。

## 当前发布阻断项

- 尚未完成项目级完整人工验收。
- 覆盖 M6.0-M6.7 的整体 M6 验收尚未进行；M6.2、M6.3、M6.4 和 M6.5 已完成实现，但按设计不做单独验收。
- Rich Correction 现已存在，但 External Teacher Round Trip（M6.6）和 History/Retry/Portability（M6.7）尚未开始。
- 数据迁移、备份往返、答题进度恢复和破坏性工作流尚未获得正式端到端验证。
- 仓库保持 private 时，公开 Pages 部署继续暂缓。
- 尚不存在 Release Candidate，也尚未完成最终干净环境验证。

## Hardening 进度

尚未开始。

Product Hardening 是 Milestone 7，只能在全部 Milestone 6 工作通过评审并明确进入 Feature Freeze 后开始。

## 验证状态

- 110 项 core/interchange/translation/import/session/annotation/corrections/review 自动测试通过，覆盖稳定 Translation 持久化、顺序、source-only 与 reference 材料、孤儿防护、显式 cascade 删除、非客观 Learner Response 兼容、finalized evidence 保护、备份兼容、公开示例校验、批量导入解析、格式错误行拒绝、JSON 导入文件夹重新分配、重复 ID 冲突处理、导出/导入往返对公开 schema 的校验、Translation session 快照在后续文档编辑下保持稳定、按条目 ID 持久化答案与导航、格式错误 session 被安全拒绝、非客观 finalization、隔离的 active-session 存储 key、全部三种标记类型、多词片段、零长度/无效范围/未知类型拒绝、锚定文本匹配、完全相同片段的替换与重叠拒绝、编辑作答后的失效处理、标记在 session 序列化/恢复中的存续、个别格式错误标记的安全丢弃与 `learnerAnnotations` 的 schema/向后兼容性、从存储恢复的持久化标记的确定性重叠消解、对 finalized `learnerAnnotations` 锚点相对于对应作答文本的运行时交叉校验（文本匹配、范围内、同条目不重叠）、每一种 rich correction 样式/操作类型、表现型样式的正交重叠、内容变更类操作的冲突拒绝、批改锚点不匹配/越界/重复 ID 的拒绝、HTML 风格的评阅者文本保持为安全的纯文本数据、Teacher Review 的持久化/刷新/重新打开、review ID 绝不被静默改指，以及 Teacher Review 的备份/恢复往返与旧版/格式错误数据处理。
- CI workflow 已存在。
- 本地浏览器 smoke test 走过了 M6.5 批改工作区旅程：分别从练习完成页和翻译文档的"已完成的作答记录"列表打开工作区，确认原始作答和源条目正确渲染（期间绕过了一个脚本化测试自身的时序问题——刚编辑完条目文字后如果没有经过一次重新渲染就点击"开始练习"，可能会把编辑前的旧文字快照进新 session；这是一个 M6.2 时代就存在的 UI 问题，不是 M6.5 引入的回归，已单独记录为后续工作）、对同一片段应用重叠的加粗和下划线、应用一条带有评阅者选定颜色的插入文字的替换批改并确认预览正确渲染、尝试在重叠范围上添加冲突的删除批改并确认被拒绝且弹出提示、移除一条批改、添加条目批注/建议修订/评判、保存、刷新页面、从"已完成的作答记录"列表重新打开同一条 review，确认全部批改/批注/修订/评判以及未被改动的原始作答都完整保留，确认 HTML 风格的评阅者文本被安全转义渲染（没有注入 `<img>`/script 标签），并确认英文界面正确渲染——没有出现新的控制台错误。此前的 smoke test 已覆盖完整的 M6.4 标记旅程、M6.3 练习/恢复旅程和 M6.2 Translation Library 旅程。
- 浏览器测试工具确认了导出下载会正确触发（文件名和事件正确），但未捕获下载文件的实际落盘内容，因此人工检查下载文件内容仍属于推迟的 M6 整体验收范围。
- 浏览器自动化测试工具无法直接驱动原生的 `window.prompt()`/`window.confirm()` 对话框；M6.5 的插入/替换/批注文字录入（以及此前的文件夹新建/重命名/放弃确认）都是通过脚本改写页面的 `window.prompt`/`window.confirm` 来测试的，而不是真实的原生对话框。这是测试工具本身的已知局限，不是产品缺陷，因为真实浏览器的原生对话框是同步的、不会抛出异常。
- 完整 v1 用户旅程的人工验收尚未完成。
- 尚未执行干净 clone 验证。
- GitHub Pages 部署为仅手动触发，并继续暂缓。
- M6.0 和 M6.1 已验收。M6.2、M6.3、M6.4 和 M6.5 已有自动化测试和 smoke test 覆盖；四者的正式验收都按政策推迟到 M6.7 之后的整体验收。

## 已知风险

- 由于仓库保持 private 且 Pages 部署暂缓，GitHub Pages 目前不能视为可用交付方式。
- ES module 应用不支持通过浏览器 `file://` 直接打开；用户必须使用本地静态服务器或 `start-local.bat`。
- 当前功能面已经较大，但人工 QA 证据还不足。
- Finalized Learner Response 使用浏览器本地存储且不被 history 静默截断；长期积累的大型 evidence 集合最终可能遇到浏览器容量限制。
- 学习者作答标记和 rich correction 现已存在，但外部 Teacher Review 往返（导出/导入、外部 AI/人工评阅）仍是 M6.6 尚未设计的 UX 边界。
- 目前界面除了刚完成练习后的即时复盘页、以及为 M6.5 批改入口新增的文档编辑器"已完成的作答记录"极简列表外，没有更完整的入口可以浏览某份翻译文档历史上的 Learner Response；详细的历史/重练视图明确属于 M6.7 范围。
- 一个自 M6.2 起就存在、并非 M6.5 引入的 UI 行为：编辑某个 Translation Item 的文字后，如果没有任何中间的重新渲染就直接点击"开始练习"，可能会把该条目编辑前的旧文字快照进新 session——因为该按钮的点击处理函数闭包捕获的是上一次完整渲染时的 `doc` 对象，而不是实时的 `translationLibrary` 状态。这个问题在 M6.5 之前没有被发现或报告，是在为 M6.5 做浏览器 smoke test（脚本化地快速"编辑后立即开始练习"）时才被发现的；需要作为独立的后续工作单独调查和修复，不并入本次 M6.5 范围。
- 如果某份翻译文档在其 Learner Response evidence（包括其中的学习者标记）存在期间被删除，该 evidence 依然有效（它自带 material 快照），但不再能通过文档编辑器直接找到；这与现有 Objective Quiz 的行为一致（删除试卷不会删除其 Learner Response）。
- 把验收推迟到 M6 结束意味着 M6.2-M6.7 之间的集成问题可能比逐里程碑验收更晚才被发现；在此期间更依赖回归测试和 CI。
- 学习者是否显示过隐藏的参考译文只记录在 active session 中，不会带入 finalized evidence；如果后续某个 M6.x 需要这个信号用于批改/复核，需要专门做一次追加式设计决策，而不是天然可用。
- 在触屏/移动端视口下进行 rich correction 创作（样式/插入/替换/删除/批注的选择和颜色选择器）时，文本选择的操作方式与桌面端指针/键盘选择不同，尚未验证。
- 在真实浏览器中人工检查用于插入/替换/批注文字录入的原生 `window.prompt()` 对话框（自动化 smoke test 是直接脚本化改写 `window.prompt`，因为浏览器自动化测试工具无法驱动原生模态对话框）。

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
- 在触屏/移动端视口下进行标记、复盘和删除操作（文本选择的操作方式与桌面端指针/键盘选择不同）。
- 在触屏/移动端视口下进行 rich correction 创作。

## Deferred Features

- AI 辅助生成题目。
- 桌面应用封装。
- 云同步与用户账户。
- 分享、协作和应用内教师账号/管理工作流。
- 主观题批改。
- 公开 GitHub Pages 部署和最终 GitHub Release。

## 下一步工程目标

按已批准的子里程碑顺序，下一个是 M6.6 External Teacher Round Trip，但未经新的 prompt 不得开始。在覆盖 M6.0-M6.7 的整体 M6 验收完成前，不开始 Product Hardening 或 Feature Freeze 工作。

## 仓库状态

- 默认分支：`main`
- 远程：`origin`
- M6.5 开始前已验证的基线：`90adb8c M6.4: Learner Answer Marking and Annotation Foundation (#3)`（squash merge，位于 main）
- 当前文档修订：即包含本状态文件的 commit；其不可变标识以 Git 历史为准
- 同步目标：经过验证的 M6.5 feature work 位于 `milestone/6.5-rich-correction` 分支，将开出 Pull Request 提交到 `main`，未经明确指示不得合并
- private 仓库状态：基于当前项目策略和 Pages 暂缓决定，按 private 处理
- Pull Request 状态：正在为 `milestone/6.5-rich-correction` 创建 Pull Request 供独立评审；未经用户明确指示不得合并
