# 项目状态

## 当前阶段

Feature Development - Scope Reopened（功能开发阶段，范围已重新开放）

## 当前里程碑

Milestone 6.7：History, Retry, Portability, and Whole-Product Integration - complete（已完成，M6 综合人工验收 Journeys 01–10：PASS；UX 强化收尾批次已完成）

M6.7 是 M6 功能开发阶段的最后一个子里程碑。M6 的功能开发实现与综合人工验收均已完成。

## 验收政策（历史记录）

M6.2 到 M6.7 的正式用户验收统一推迟至 M6.7 实现完成后统一进行 M6 综合验收。该项综合人工验收（Journeys 01–10）现已执行完毕并全部通过（PASS）。M6.0 和 M6.1 此前已单独完成验收。

## M6 综合人工验收与 UX 强化收尾

- **M6 综合人工验收 Journeys 01–10**：PASS（全部通过）。
- 片段批注（Comment）创建入口继续从当前产品范围中移除。
- **小型 UX 强化收尾批次**：
  1. 条目级元认知标记：为整道翻译题目新增一等公民的“不认识 / 不确定 / 应该会但想不起来”标记状态，具备可替换与可清除性，在进度恢复与最终作答证据中完整持久化，并纳入 needs-work 派生。
  2. 练习导航边界状态：翻译练习上下题切换按钮在第一题和最后一题边界上实现真实的 `disabled` 状态、置灰样式与边界守护。
  3. 备份恢复即时刷新翻译题库：导入完整备份成功后，内存中的 `translationLibrary` 与选中状态立即同步刷新并渲染，无需用户手动 F5 刷新页面。

## 当前发布范围

当前版本范围包括 Milestone 1-5 基线和已批准的 Milestone 6 工作线。Translation Practice 仍是 M6 的主要新增学习工作流。M6.0 Open Teaching Interchange、M6.1 Translation Domain and Persistence Foundation 以及 M6.2–M6.7 均已完成实现并通过综合人工验收 Journeys 01–10（PASS）。M6.7 把已经完成的 Translation/Open Teaching 功能集合变成了一个持久的产品：覆盖全部 finalized 作答记录的 Translation 历史浏览（无论原始文档是否还存在）、总是产生新的独立证据的显式重新练习（整份/选定条目/需要加强条目）、双向溯源导航，以及针对翻译文档、Learner Response 和 Teacher Review 的显式带警告删除。M6 保持本地优先，不要求内置 AI API、付费推理或网络连接。

## Feature Complete 状态

旧范围下曾达到候选评审；当前范围已重新开放，因此不再属于功能完整状态。

Milestone 1 作为基础基线已完成。Milestones 2-5 的首版实现已落地，但完整验收待完成。旧边界下曾达到 Feature Complete Candidate 的事实作为历史证据保留。M6 综合人工验收 Journeys 01–10 已在缩减 Comment 范围及完成强化批次后全部通过（PASS）。进入 Feature Freeze 之前的下一个生命周期门禁是重新执行全产品 Feature Complete Review。

## Feature Freeze 状态

尚未进入。

只有在重新开放的范围通过新一轮全产品 Feature Complete Review、Deferred Features 与当前版本分离，并且用户明确授权进入 Feature Freeze 后，才可以进入 Feature Freeze。

## 当前发布阻断项

- 尚未完成全项目全里程碑（M1–M5 基线 + 全产品）的最终完整人工验收。
- 旧版单试卷数据在代表性旧 localStorage 状态下的迁移行为，以及真实浏览器关闭/重开后的 active session 恢复尚未获得单独专项验证。
- 仓库保持 private 时，公开 Pages 部署继续暂缓。
- 尚不存在 Release Candidate，也尚未完成最终干净环境验证。

## Hardening 进度

尚未开始。

Product Hardening 是 Milestone 7，只能在全部 Milestone 6 工作通过评审并明确进入 Feature Freeze 后开始。

## 验证状态

- 225 项 core/interchange/translation/import/session/annotation/corrections/review/transport/history/retry/deletion/bootstrap-cache-coherence/sw-closure 自动测试通过。覆盖条目级元认知标记、Schema/运行时校验、needs-work 派生、导航边界、备份即时刷新、引导前置 SW 注销与缓存清理、周期 Nonce 作用域重载守护、以及开发态 no-store HTTP 头验证。历史 `comment` 和 `strikethrough` 校验继续通过；此前全部 M6.0-M6.7 覆盖保持通过。
- **本地开发模块缓存一致性与规范启动器修复**：彻底解决了长期使用的浏览器 Profile 在本地开发环境因 ES Module 依赖混杂产生的语法错误（SyntaxError）。新增独立的 Preflight Bootstrap 模块（`src/bootstrap.js`），在主应用静态模块依赖图解析前率先执行，自动注销 localhost 下的旧版 Service Worker、清理 `quiz-studio-*` Cache Storage，并在存在旧控制器时执行至多一次受控重载（作用域限定于启动周期的 `?dev=<nonce>`，防止死循环并在控制器持续存在时安全拦截阻止加载）以干净卸载控制器后再动态导入 `src/app.js`，从根本上避免静态 import 解析期的语法错误，且绝不触碰 `localStorage` 用户数据。在 `start-local.bat` 中严格固定规范源 `http://localhost:8000`，端口冲突时提供明确的可操作诊断（禁止静默端口漂移）并支持显式参数覆盖（明确提示不同端口为隔离的独立 Origin）；配合 `scripts/dev-server.py` 发送 `Cache-Control: no-store, no-cache, must-revalidate` 响应头，启动时通过 `?dev=<nonce>` 规避历史导航缓存。生产环境与 GitHub Pages 的 Service Worker / PWA 离线能力完整保留。
- **删除完整性收尾补丁**：CI 通过后的复查发现 `analyzeLearnerResponseDeletion()`/`analyzeTeacherReviewDeletion()` 忽略了实时补救翻译文档，导致删除 Learner Response 或 Teacher Review 可能让 Translation Library 中仍然存在的补救文档留下无法解析的 provenance——这与 `parseLibraryBackup()` 的要求不一致（后者在每次恢复时都要求实时补救文档的 provenance 必须可解析）。修复方式是明确区分 finalized response 自身的（可以安全无法解析的）历史 provenance，与一份*实时*补救文档的规范性声明：两个分析函数现在都接受 `translationDocuments` 参数，并报告 `dependentRemediationDocumentIds`/`hasBlockingDependents`；只要存在这样的实时依赖，`app.js` 中的删除流程就会直接拒绝删除（弹出提示，不出现确认对话框），而不是级联穿过它。补救文档绝不会作为副作用被自动删除。新增 7 个测试，其中包括一个证明补丁修复前的操作序列会产生无法恢复的备份的回归防护测试，以及一个证明先删除补救文档后再执行的许可删除仍能正常完整备份/恢复的测试。
- CI workflow 已存在；已在 `milestone/6.7-history-retry-integration` 分支上通过（PR #6），删除完整性收尾补丁提交后同样通过。
- 本地浏览器 smoke test 使用预置的真实场景数据（一条带有两条评判相互冲突的批改的作答记录）完整走过了 M6.7 的流程：浏览并按来源/状态/排序筛选 Translation 历史；打开历史详情，确认条目级证据、学习者标记和两条关联批改均可访问；执行一次真实的"针对需要加强的条目重新练习"，确认新的 session 只包含被标记的条目、带有 `materialProvenance.purpose: "retry"`，完成后确认 finalized response 携带重新练习 provenance（`sourceResponseId`/`sourceMaterialId`），而原始记录未受影响；执行"选择条目重新练习"并取消勾选一个条目，确认只有被选中的条目被带入新的练习；从原始记录正向跟随溯源到重新练习记录、再反向跟随回去；删除一条被某个重新练习记录的 `sourceReviewId` 引用的 Teacher Review，确认溯源视图随后正确显示为不可用，而不是崩溃；删除一份带有依赖 finalized 作答记录的翻译文档，确认确认提示中说明了依赖数量，且该记录之后依然可以在历史中完整浏览和重新练习；触发作答记录删除的级联确认，确认提示中正确说明了依赖批改和派生记录的数量，确认后正确地把该记录连同其批改一起删除，同时保留了由它派生出的重新练习记录。同一批流程也抽查确认了英文界面的一致性。
- 在本次 smoke test 中，发现并修复了一处真实缺陷（未被单元测试捕获，因为它存在于 `app.js` 的 UI glue 代码中而非核心模块）：`deleteLearnerResponseConfirm()` 最初会先写入更新后的 Learner Response 集合，之后才再次读取 `loadTeacherReviews()`；而 `loadTeacherReviews()` 每次调用都会把全部批改重新对照*当前*的作答记录集合做校验——于是它看到了刚刚变成孤儿的批改并抛出异常。修复方式是提前对两个集合都做快照。修复后通过一次独立的干净复现重新验证。
- **Service Worker 缓存策略升级**：最初 Service Worker 使用 Cache-First 策略，开发迭代或部署更新时需要手动清除浏览器缓存。现已升级：`sw.js` 升级为 Network-First (v4) 策略，并结合 `skipWaiting`/`claim` 实现了立即的客户端接管，从而在服务器运行时页面刷新即可立即获取并使用最新版资源。
- 浏览器测试工具无法驱动原生的 `window.confirm()`/`window.prompt()` 对话框；删除和重新练习相关的确认是通过给 `window.confirm` 打补丁来捕获确切的提示文字、并以编程方式接受/拒绝来测试的，这能验证真实的确认逻辑和提示内容，但不能验证原生对话框界面本身。这是延续自此前里程碑的已知测试工具局限，不是产品缺陷。
- M6 综合人工验收 Journeys 01–10 已在缩减 Comment 范围及完成强化批次后全部通过（PASS）。全项目全里程碑人工验收仍待完成。
- 尚未执行干净 clone 验证。
- GitHub Pages 部署为仅手动触发，并继续暂缓。
- M6.0–M6.7 均已完成实现，并通过综合人工验收验证。

## 已知风险

- 由于仓库保持 private 且 Pages 部署暂缓，GitHub Pages 目前不能视为可用交付方式。
- ES module 应用不支持通过浏览器 `file://` 直接打开；用户必须使用本地静态服务器或 `start-local.bat`。
- Finalized Learner Response 使用浏览器本地存储且不被 history 静默截断；长期积累的大型 evidence 集合最终可能遇到浏览器容量限制。Translation 历史按设计同样没有条目数量上限，继承了这一风险。
- 外部 Teacher Review 与补救往返完全是手动的（导出一份文件、交给外部一方、导入他们返回的文件）；目前没有、也不计划做任何应用内 AI 集成。
- 学习者是否显示过隐藏的参考译文只记录在 active session 中，不会带入 finalized evidence；重新练习和补救材料的练习同样如此。
- 删除一条 Learner Response 会级联删除其 Teacher Review；目前没有单独保留批改内容、只删除作答记录的方式。这是 M6.7 的一项刻意设计选择（一条 review 的 `responseId` 链接必须始终可解析），而不是疏漏，但想要在删除作答记录后保留批改内容的用户，需要先导出该批改。
- Translation 历史、重新练习的条目选择和删除确认尚未在触屏/移动端视口下进行人工验证，条目选择清单和多按钮操作行的布局可能需要在 M7 硬化阶段关注。
- 导出包内嵌的评阅请求/补救练习请求"task"指令文字是按语言固定的、用户不可编辑的字符串；它假设外部评阅者/agent 能理解一段纯文本的自然语言指令，这对某些非 LLM 的外部工具而言是一个合理但尚未验证的假设。

## 未知或未验证事项

- 使用超大规模积累数据进行完整备份导出和导入往返。
- 旧版单试卷数据在代表性旧 localStorage 状态下的迁移行为。
- 真实浏览器关闭后重新打开（而非仅刷新）时 Translation Practice session（包括重新练习 session）的恢复情况（已验证基于刷新的恢复，未单独验证完整关闭重开）。
- 删除试卷、清空历史等针对翻译题库/批改之外的破坏性工作流。
- PWA 安装、离线行为和缓存升级在主要浏览器中的表现。
- 代表性设备上的可访问性和响应式行为，包括新增的 Translation 历史浏览器和重新练习条目选择清单。
- 干净环境重新 clone 并运行项目。
- 在触屏/移动端视口下进行标记、历史浏览和重新练习条目选择操作，这些场景的文本选择和多选框交互与桌面端指针/键盘操作存在差异。
- 在触屏/移动端视口下进行当前范围内的 rich correction 创作（样式/插入/替换/删除和颜色选择器）。
- 在真实浏览器中人工检查用于插入/替换文字录入、以及重新练习/删除确认的原生 `window.prompt()`/`window.confirm()` 对话框。
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

M6.0–M6.7 功能实现、综合人工验收（Journeys 01–10：PASS）以及 UX 强化收尾批次均已完成。下一个生命周期门禁是重新执行全产品 Feature Complete Review，之后再进入 Feature Freeze。Product Hardening（M7）与 Feature Freeze 尚未开始。

## 仓库状态

- 默认分支：`main`
- 远程：`origin`
- M6.7 开始前已验证的基线：`61cd16f Record M6.6 merge into main`（`main`）
- M6.7 合并提交：`d6a5327 M6.7: History, Retry, Portability, and Whole-Product Integration (#6)`（`main`）——由主体实现、PR/CI 状态更新和删除完整性收尾补丁 squash 而成
- PR #10 之前的 main 基线：`eb5b70b Merge pull request #9 from Peter-S-Shi/recovery/m6-comment-scope-rollback`（`main`）
- 当前分支：`fix/local-dev-cache-coherence`
- 当前 Pull Request：[PR #10](https://github.com/Peter-S-Shi/Quiz-System/pull/10)（状态：开启，CI 测试全部通过/绿色，等待人工评审；未自动合并）
- 历史 PR 状态：Draft PR #8 已关闭/未合并/被取代；PR #9 已合并至 `main`（`eb5b70b`）
- 当前文档修订：即包含本状态文件的 commit；其不可变标识以 Git 历史为准
- private 仓库状态：基于当前项目策略和 Pages 暂缓决定，按 private 处理
