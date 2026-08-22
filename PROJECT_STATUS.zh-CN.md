# 项目状态

## 当前阶段

Pre-Freeze UI Productization（功能冻结前 UI 产品化阶段）

## 当前里程碑

UI Productization: Layered Paper Study Desk（分层纸质研习台：设计规范、应用框架与工具启动台、核心做题与翻译研习纸面、教师批改台、物理动效与合成音效）— 已实现并通过全量测试；Final Human Acceptance Gate = PASS

本工作流在进入下一轮 Feature Complete Review 之前完成产品级 UI 收敛（包括 DESIGN.md 规范、Strong Paper 亮色、Soft Near-Black 暗色、翻页动效/音效、MCQ 墨水选择反馈、匹配题逐对即时纠错、判定盖章反馈、首页 Tool Launcher 启动台与可拖拽侧边栏）。本工作流不重新开放 M6 产品业务逻辑语义，亦非 Milestone 7 Product Hardening。

## Pre-Freeze UI 产品化里程碑摘要

- **设计规范与系统基础**：创建 [DESIGN.md](file:///f:/CodexWorkspaces/Quiz%20System/DESIGN.md)，确立 Layered Paper Study Desk 设计 Token、字体层级、呼吸间距、自然语义墨水系统与基于 Web Audio API 的零外部依赖物理合成音效引擎。
- **应用框架与工具启动台**：新增独立 Tool Launcher 首页启动台、顶部栏音效切换按钮、可拖拽侧边栏，以及持久化 UI 偏好设置（主题模式、音效开关、减弱动效偏好、侧边栏宽度）。
- **核心做题与研习纸面**：客观题练习与翻译练习重构为停靠在桌面上的连续手稿纸（Laid Paper Sheet），提供有机物理翻页动效、铅笔书写摩擦音效，以及匹配题逐对独立状态判定与内联正确答案提示。
- **教师批改台**：批改工作区重构为单张连续纸面批改台，配备样式批注笔盘、实时墨水投射视图，以及带有物理下压回弹与钝击音效的橡胶印章反馈。
- **离线与测试闭包**：全量 238 项自动化测试（237 项通过，1 项 Linux CI 上的 Windows 启动器测试安全跳过，0 项失败），包含 UI 偏好持久化测试、轻量偏好设置对话框与完整的 Service Worker ESM 离线预缓存闭包。
- **Human Acceptance Gate**：Final Human Acceptance Gate 已执行并通过（PASS）。

## 验收政策（历史记录）

M6.2 到 M6.7 的正式用户验收统一推迟至 M6.7 实现完成后统一进行 M6 综合验收。该项综合人工验收（Journeys 01–10）现已执行完毕并全部通过（PASS）。M6.0 和 M6.1 此前已单独完成验收。

## 当前发布范围

当前版本范围包括 Milestone 1-5 基线、已批准的 Milestone 6 工作线，以及 Pre-Freeze UI Productization 设计系统。Translation Practice 仍是 M6 的主要新增学习工作流。M6.0 Open Teaching Interchange、M6.1 Translation Domain and Persistence Foundation 以及 M6.2–M6.7 均已完成实现并通过综合人工验收 Journeys 01–10（PASS）。M6 保持本地优先，不要求内置 AI API、付费推理或网络连接。

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

- 232 项 core/interchange/translation/import/session/annotation/corrections/review/transport/history/retry/deletion/sw/runtime 自动测试通过。除条目级元认知标记、Schema/运行时校验、needs-work 派生、导航边界、备份即时刷新、本地运行契约以及浏览器启动失败双语诊断外，覆盖现已包括 `.bat` 的 CRLF 检出契约与真实 Windows 缺少 Python 诊断执行。历史 `comment` 和 `strikethrough` 校验继续通过；此前全部 M6.0-M6.7 覆盖保持通过。
- **删除完整性收尾补丁**：CI 通过后的复查发现 `analyzeLearnerResponseDeletion()`/`analyzeTeacherReviewDeletion()` 忽略了实时补救翻译文档，导致删除 Learner Response 或 Teacher Review 可能让 Translation Library 中仍然存在的补救文档留下无法解析的 provenance——这与 `parseLibraryBackup()` 的要求不一致（后者在每次恢复时都要求实时补救文档的 provenance 必须可解析）。修复方式是明确区分 finalized response 自身的（可以安全无法解析的）历史 provenance，与一份*实时*补救文档的规范性声明：两个分析函数现在都接受 `translationDocuments` 参数，并报告 `dependentRemediationDocumentIds`/`hasBlockingDependents`；只要存在这样的实时依赖，`app.js` 中的删除流程就会直接拒绝删除（弹出提示，不出现确认对话框），而不是级联穿过它。补救文档绝不会作为副作用被自动删除。新增 7 个测试，其中包括一个证明补丁修复前的操作序列会产生无法恢复的备份的回归防护测试，以及一个证明先删除补救文档后再执行的许可删除仍能正常完整备份/恢复的测试。
- **Hardening 前本地运行恢复（Human Gate 5/5 PASS；reviewed/fixed）**：`start-local.bat` 现在是单一 Python runtime owner `scripts/dev-server.py` 的薄包装。runtime 会在 Windows 公布的全部 IPv4/IPv6 localhost 地址族上独占严格固定的端口 `8000`，同时通过规范 `localhost` hostname 与每个绑定 listener 验证 `/__runtime__/health`，以 `no-store` 提供当前工作树，在可用时报告占用端口的 PID，并且绝不漂移 origin。服务器拥有的恢复入口只注销同 origin 的 Quiz Studio `/sw.js` 注册，只删除 `quiz-studio-*` Cache Storage，且不访问 localStorage。浏览器启动失败时服务器保持运行，并输出准确的双语手动打开 URL。loopback 开发环境不再注册生产 Service Worker；托管生产环境的 PWA 行为与完整 ESM 离线闭包仍然保留。
- CI workflow 已存在；已在 `milestone/6.7-history-retry-integration` 分支上通过（PR #6），删除完整性收尾补丁提交后同样通过。
- 本地浏览器 smoke test 使用预置的真实场景数据（一条带有两条评判相互冲突的批改的作答记录）完整走过了 M6.7 的流程：浏览并按来源/状态/排序筛选 Translation 历史；打开历史详情，确认条目级证据、学习者标记和两条关联批改均可访问；执行一次真实的"针对需要加强的条目重新练习"，确认新的 session 只包含被标记的条目、带有 `materialProvenance.purpose: "retry"`，完成后确认 finalized response 携带重新练习 provenance（`sourceResponseId`/`sourceMaterialId`），而原始记录未受影响；执行"选择条目重新练习"并取消勾选一个条目，确认只有被选中的条目被带入新的练习；从原始记录正向跟随溯源到重新练习记录、再反向跟随回去；删除一条被某个重新练习记录的 `sourceReviewId` 引用的 Teacher Review，确认溯源视图随后正确显示为不可用，而不是崩溃；删除一份带有依赖 finalized 作答记录的翻译文档，确认确认提示中说明了依赖数量，且该记录之后依然可以在历史中完整浏览和重新练习；触发作答记录删除的级联确认，确认提示中正确说明了依赖批改和派生记录的数量，确认后正确地把该记录连同其批改一起删除，同时保留了由它派生出的重新练习记录。同一批流程也抽查确认了英文界面的一致性。
- 在本次 smoke test 中，发现并修复了一处真实缺陷（未被单元测试捕获，因为它存在于 `app.js` 的 UI glue 代码中而非核心模块）：`deleteLearnerResponseConfirm()` 最初会先写入更新后的 Learner Response 集合，之后才再次读取 `loadTeacherReviews()`；而 `loadTeacherReviews()` 每次调用都会把全部批改重新对照*当前*的作答记录集合做校验——于是它看到了刚刚变成孤儿的批改并抛出异常。修复方式是提前对两个集合都做快照。修复后通过一次独立的干净复现重新验证。
- **Service Worker 分离**：托管生产环境继续使用 Network-First v4 PWA 路径、立即接管与完整 ESM 预缓存。loopback 开发环境被明确分离：不注册生产 SW，响应使用 no-store，并由本地 runtime 提供精确限定的旧 SW/cache 退休入口。
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
- 条目级元认知标记交互优化（高亮色彩切换按钮、再次点击取消标记、单个条目支持同时多种标记、移除弹出框交互）——已记录至 post-UI 硬化/Backlog。

## 下一步工程目标

在进入 Feature Freeze 和 Milestone 7 Product Hardening 之前，重新执行覆盖全产品全部工作流的 Whole-Product Feature Complete Review V2。

## 仓库状态

- 默认分支：`main`
- 远程：`origin`
- M6.7 开始前已验证的基线：`61cd16f Record M6.6 merge into main`（`main`）
- M6.7 合并提交：`d6a5327 M6.7: History, Retry, Portability, and Whole-Product Integration (#6)`（`main`）——由主体实现、PR/CI 状态更新和删除完整性收尾补丁 squash 而成
- 当前文档修订：即包含本状态文件的 commit；其不可变标识以 Git 历史为准
- Local Runtime Recovery 基线：远端 `main` 精确提交 `eb5b70b7e820b1bd0183b2f864ebb892c5e70b47`；PR #11 已以 `6b38c40` 合并，BAT CRLF 后续修复 PR #12 已以 `6643a1b` 合并
- private 仓库状态：基于当前项目策略和 Pages 暂缓决定，按 private 处理
- Pull Request 状态：PR #14（`ui/layered-paper-productization`）已完成 Pre-Freeze UI Productization 并通过 Final Human Acceptance Gate，具备 238/238 测试通过（237 项通过，1 项 Linux CI 跳过，0 项失败）与 GitHub CI PASS；等待执行 Whole-Product Feature Complete Review V2。历史 PR #11 与 PR #12 保持已合并至 `main`。历史 Draft PR #10 保持 Closed/Superseded。
