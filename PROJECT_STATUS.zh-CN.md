# 项目状态

## 当前阶段

Feature Development - Scope Reopened（功能开发阶段，范围已重新开放）

## 当前里程碑

Milestone 6.7：History, Retry, Portability, and Whole-Product Integration - implementation complete / M6-wide acceptance deferred

M6.7 是 M6 功能开发阶段的最后一个子里程碑。M6 的功能开发实现现已完成。

## 验收政策（已变更）

用户已明确决定：M6.2 到 M6.7 不再逐个进行正式用户验收。每个子里程碑仍然需要实现评审、回归测试、CI 和范围审查，但一次性的、覆盖整个 M6 的综合验收现在 M6.7 已经完成，可以统一进行。M6.0 和 M6.1 在这一政策变更之前已经分别完成验收，这一历史事实不会被追溯改写。请不要把"implementation complete / M6-wide acceptance deferred"理解为等同于已验收。

## 当前发布范围

当前版本范围包括 Milestone 1-5 基线和已批准的 Milestone 6 工作线。Translation Practice 仍是 M6 的主要新增学习工作流。M6.0 Open Teaching Interchange 和 M6.1 Translation Domain and Persistence Foundation 均已验收。M6.2 Translation Library and Material Import/Export、M6.3 Translation Practice and Session Recovery、M6.4 Learner Answer Marking and Annotation Foundation、M6.5 Rich Correction / Revision Workspace、M6.6 External Teacher Round Trip 和 M6.7 History, Retry, Portability, and Whole-Product Integration 均已完成实现，验收统一推迟到 M6 整体验收时进行。M6.7 把已经完成的 Translation/Open Teaching 功能集合变成了一个持久的产品：覆盖全部 finalized 作答记录的 Translation 历史浏览（无论原始文档是否还存在）、总是产生新的独立证据的显式重新练习（整份/选定条目/需要加强条目）、双向溯源导航，以及针对翻译文档、Learner Response 和 Teacher Review 的显式带警告删除。M6 保持本地优先，不要求内置 AI API、付费推理或网络连接。

## Feature Complete 状态

旧范围下曾达到候选评审；当前范围已重新开放，因此不再属于功能完整状态。

Milestone 1 作为基础基线已完成。Milestone 2-5 的首版实现已落地，但完整验收待完成。旧边界下曾达到 Feature Complete Candidate 的事实作为历史证据保留。M6.0 和 M6.1 已验收。M6.2 到 M6.7 均已完成实现，验收推迟到 M6 整体验收；M6 的功能开发实现现已完成。完成推迟的 M6 整体验收后，必须重新执行全产品 Feature Complete Review。

## Feature Freeze 状态

尚未进入。

只有在完成推迟的 M6 整体验收、重新开放的范围通过新一轮 Feature Complete Review、Deferred Features 与当前版本分离，并且用户明确接受扩展后的产品边界后，才可以进入 Feature Freeze。

## 当前发布阻断项

- 尚未完成项目级完整人工验收。
- 覆盖 M6.0-M6.7 的整体 M6 验收正在进行：Journey 01-03 已通过；Journey 04 的工程修复与自动化证据已完成，但仍待真实浏览器复验；Journey 05-10 尚未验收。
- M6 的功能开发实现已经完成，不再有后续的 M6.x 子里程碑；但整体 M6 验收本身在完成之前仍是一项发布阻断项。
- 数据迁移、备份往返、答题进度恢复和破坏性工作流尚未获得正式端到端验证。
- 仓库保持 private 时，公开 Pages 部署继续暂缓。
- 尚不存在 Release Candidate，也尚未完成最终干净环境验证。

## Hardening 进度

尚未开始。

Product Hardening 是 Milestone 7，只能在全部 Milestone 6 工作通过评审并明确进入 Feature Freeze 后开始。

## 验证状态

- 221 项 core/interchange/translation/import/session/annotation/corrections/rendering/review/transport/history/retry/deletion/sw-closure 自动测试通过。Journey 04 恢复新增覆盖会直接调用生产批改渲染器，验证精确的批注高亮/badge、安全转义，以及嵌套在 Replace/Delete 范围中的 Comment/Bracket 锚点。此前全部 M6.0-M6.7 覆盖继续通过。
- **删除完整性收尾补丁**：CI 通过后的复查发现 `analyzeLearnerResponseDeletion()`/`analyzeTeacherReviewDeletion()` 忽略了实时补救翻译文档，导致删除 Learner Response 或 Teacher Review 可能让 Translation Library 中仍然存在的补救文档留下无法解析的 provenance——这与 `parseLibraryBackup()` 的要求不一致（后者在每次恢复时都要求实时补救文档的 provenance 必须可解析）。修复方式是明确区分 finalized response 自身的（可以安全无法解析的）历史 provenance，与一份*实时*补救文档的规范性声明：两个分析函数现在都接受 `translationDocuments` 参数，并报告 `dependentRemediationDocumentIds`/`hasBlockingDependents`；只要存在这样的实时依赖，`app.js` 中的删除流程就会直接拒绝删除（弹出提示，不出现确认对话框），而不是级联穿过它。补救文档绝不会作为副作用被自动删除。新增 7 个测试，其中包括一个证明补丁修复前的操作序列会产生无法恢复的备份的回归防护测试，以及一个证明先删除补救文档后再执行的许可删除仍能正常完整备份/恢复的测试。
- **标准本地启动入口（M6 验收支持）**：`start-local.bat` 委托给 `start-local.ps1`，固定使用稳定来源 `http://localhost:8000`，端口被占用时直接拒绝启动。仓库自带的 Node 服务器绑定 `127.0.0.1:8000`，以 `Cache-Control: no-store` 提供开发资源，并在打开 QA 前把标准来源返回的 `index.html` 哈希与当前工作树进行比对。已成功执行文档中的 execution-policy-bypass 命令和非交互验证模式；验证进程退出后端口没有残留监听。
- CI workflow 已存在；已在 `milestone/6.7-history-retry-integration` 分支上通过（PR #6），删除完整性收尾补丁提交后同样通过。
- 本地浏览器 smoke test 使用预置的真实场景数据（一条带有两条评判相互冲突的批改的作答记录）完整走过了 M6.7 的流程：浏览并按来源/状态/排序筛选 Translation 历史；打开历史详情，确认条目级证据、学习者标记和两条关联批改均可访问；执行一次真实的"针对需要加强的条目重新练习"，确认新的 session 只包含被标记的条目、带有 `materialProvenance.purpose: "retry"`，完成后确认 finalized response 携带重新练习 provenance（`sourceResponseId`/`sourceMaterialId`），而原始记录未受影响；执行"选择条目重新练习"并取消勾选一个条目，确认只有被选中的条目被带入新的练习；从原始记录正向跟随溯源到重新练习记录、再反向跟随回去；删除一条被某个重新练习记录的 `sourceReviewId` 引用的 Teacher Review，确认溯源视图随后正确显示为不可用，而不是崩溃；删除一份带有依赖 finalized 作答记录的翻译文档，确认确认提示中说明了依赖数量，且该记录之后依然可以在历史中完整浏览和重新练习；触发作答记录删除的级联确认，确认提示中正确说明了依赖批改和派生记录的数量，确认后正确地把该记录连同其批改一起删除，同时保留了由它派生出的重新练习记录。同一批流程也抽查确认了英文界面的一致性。
- 在本次 smoke test 中，发现并修复了一处真实缺陷（未被单元测试捕获，因为它存在于 `app.js` 的 UI glue 代码中而非核心模块）：`deleteLearnerResponseConfirm()` 最初会先写入更新后的 Learner Response 集合，之后才再次读取 `loadTeacherReviews()`；而 `loadTeacherReviews()` 每次调用都会把全部批改重新对照*当前*的作答记录集合做校验——于是它看到了刚刚变成孤儿的批改并抛出异常。修复方式是提前对两个集合都做快照。修复后通过一次独立的干净复现重新验证。
- **Service Worker 缓存策略升级**：生产 PWA 行为继续使用 Network-First、`skipWaiting`/`claim` 和 v5 缓存；在 localhost/loopback 上会移除注册，标准开发服务器还会发送 `Cache-Control: no-store`，确保刷新后能观察到源码修改。
- 浏览器测试工具无法驱动原生的 `window.confirm()`/`window.prompt()` 对话框；删除和重新练习相关的确认是通过给 `window.confirm` 打补丁来捕获确切的提示文字、并以编程方式接受/拒绝来测试的，这能验证真实的确认逻辑和提示内容，但不能验证原生对话框界面本身。这是延续自此前里程碑的已知测试工具局限，不是产品缺陷。
- 完整 v1 用户旅程的人工验收正在进行：Journey 01-03 PASS；Journey 04 工程修复完成但真实浏览器复验待进行；Journey 05-10 尚未验收。当前下一步是一次连续完成 Journey 04-10 的浏览器验收。
- 尚未执行干净 clone 验证。
- GitHub Pages 部署为仅手动触发，并继续暂缓。
- M6.0 和 M6.1 已验收。M6.2 到 M6.7 已有自动化测试和 smoke test 覆盖；六者的正式验收都按政策推迟到整体 M6 验收——现在 M6.7 已完成，这项验收已不再有阻塞因素。

## 已知风险

- 由于仓库保持 private 且 Pages 部署暂缓，GitHub Pages 目前不能视为可用交付方式。
- ES module 应用不支持通过浏览器 `file://` 直接打开；用户必须使用本地静态服务器或 `start-local.bat`。
- 当前功能面已经较大，但人工 QA 证据还不足。
- Finalized Learner Response 使用浏览器本地存储且不被 history 静默截断；长期积累的大型 evidence 集合最终可能遇到浏览器容量限制。Translation 历史按设计同样没有条目数量上限，继承了这一风险。
- 外部 Teacher Review 与补救往返完全是手动的（导出一份文件、交给外部一方、导入他们返回的文件）；目前没有、也不计划做任何应用内 AI 集成。
- 把验收推迟到 M6 结束意味着 M6.2-M6.7 之间的集成问题可能比逐里程碑验收更晚才被发现；在此期间更依赖回归测试和 CI，现在 M6.7 已完成，这项权衡将在整体 M6 验收中接受检验。
- 学习者是否显示过隐藏的参考译文只记录在 active session 中，不会带入 finalized evidence；重新练习和补救材料的练习同样如此。
- 删除一条 Learner Response 会级联删除其 Teacher Review；目前没有单独保留批改内容、只删除作答记录的方式。这是 M6.7 的一项刻意设计选择（一条 review 的 `responseId` 链接必须始终可解析），而不是疏漏，但想要在删除作答记录后保留批改内容的用户，需要先导出该批改。
- Translation 历史、重新练习的条目选择和删除确认尚未在触屏/移动端视口下进行人工验证，条目选择清单和多按钮操作行的布局可能需要在 M7 硬化阶段关注。
- 导出包内嵌的评阅请求/补救练习请求"task"指令文字是按语言固定的、用户不可编辑的字符串；它假设外部评阅者/agent 能理解一段纯文本的自然语言指令，这对某些非 LLM 的外部工具而言是一个合理但尚未验证的假设。

## 未知或未验证事项

- 使用接近真实规模的本地数据（包含历史/重新练习/补救溯源）进行完整备份导出和导入往返。
- 旧版单试卷数据在代表性旧 localStorage 状态下的迁移行为。
- 刷新和重启浏览器后的答题进度恢复。
- 删除试卷、清空历史、导入备份覆盖等破坏性工作流。
- PWA 安装、离线行为和缓存升级在主要浏览器中的表现。
- 代表性设备上的可访问性和响应式行为，包括新增的 Translation 历史浏览器和重新练习条目选择清单。
- 干净环境重新 clone 并运行项目。
- 人工检查下载的 Learner Response JSON，并在真实浏览器中完成包含 learner evidence 的备份/恢复往返。
- 在真实浏览器中完成包含 Translation Folder、Document 和 Item 数据、以及历史/重新练习/补救溯源的备份/恢复往返。
- 在真实浏览器中人工检查下载的 Translation Document JSON 文件的实际内容（自动化 smoke test 只验证了下载触发和文件名，未验证落盘字节）。
- 真实浏览器关闭后重新打开（而非仅刷新）时 Translation Practice session（包括重新练习 session）的恢复情况（已验证基于刷新的恢复，未单独验证完整关闭重开）。
- 在真实浏览器中人工检查下载的 Translation Learner Response JSON 文件的实际内容。
- 在触屏/移动端视口下进行标记、历史浏览和重新练习条目选择操作，这些场景的文本选择和多选框交互与桌面端指针/键盘操作存在差异。
- 在触屏/移动端视口下进行 rich correction 创作（样式/插入/替换/删除/批注的选择和颜色选择器）。
- 在真实浏览器中人工检查用于插入/替换/批注文字录入、以及重新练习/删除确认的原生 `window.prompt()`/`window.confirm()` 对话框。
- 使用真实的外部人类评阅者，或真实的 AI 助手/LLM 会话（而非合成 fixture），根据导出的请求文件生成一条真实的 Teacher Review 或补救翻译文档的完整端到端往返。
- Teacher Review 和补救文档文件输入框的原生操作系统文件选择器行为（自动化 smoke test 派发了合成的 File/change 事件，而不是驱动真实的选择器对话框）。
- 尚未测试非常大的评阅请求/补救练习请求导出文件（大量条目、大量批改）在实际文件体积或目标外部工具的上下文/输入长度限制下的表现。
- 在积累了大量作答记录/批改时 Translation 历史的性能表现（未实现分页；列表会一次性渲染全部经过筛选的条目）。

## Deferred Features

- AI 辅助生成题目。
- 桌面应用封装。
- 云同步与用户账户。
- 分享、协作和应用内教师账号/管理工作流。
- 主观题批改。
- 公开 GitHub Pages 部署和最终 GitHub Release。
- 更高级的历史分析/搜索、图形化的溯源可视化，以及历史分页/虚拟滚动层（如果未来历史规模成为实际问题，会推迟到未来版本处理）。

## 下一步工程目标

M6.7 功能开发仍然完成。Journey 04 的纠正实现和自动化恢复证据已完成，但仍需真实浏览器复验；Journey 05-10 仍未验收。下一步是从 Journey 04 到 Journey 10 的一次连续浏览器验收。在完成 M6 整体验收前，不开始 Product Hardening（M7）或 Feature Freeze。

## 仓库状态

- 默认分支：`main`；当前本地恢复分支：`recovery/m6-acceptance-closure`
- 远程：`origin`
- M6.7 开始前已验证的基线：`61cd16f Record M6.6 merge into main`（`main`）
- M6.7 合并提交：`d6a5327 M6.7: History, Retry, Portability, and Whole-Product Integration (#6)`（`main`）——由主体实现、PR/CI 状态更新和删除完整性收尾补丁 squash 而成
- 当前文档修订：即包含本状态文件的 commit；其不可变标识以 Git 历史为准
- 同步状态：远端 `main` 已核实位于 `242f229`；`recovery/m6-acceptance-closure` 已 push，并创建 Draft PR #8。恢复分支的 CI 已触发；记录此状态时仍在运行。
- private 仓库状态：恢复分支发布前已通过 GitHub 核实为 Private
- Pull Request 状态：PR #7 对应的提交 `242f229` 已存在于远端 `main`；Draft PR #8 包含 M6 验收恢复工作，并会保持 Draft；Journey 04 完成真实浏览器复验、Journeys 05–10 完成验收之前不得合并。
