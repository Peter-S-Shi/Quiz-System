# 项目状态

## 当前阶段

Pre-Freeze V1 Scope Closure — 功能冻结前 V1 范围收尾

## 当前里程碑

Pre-Freeze V1 Scope Closure · Batch C: Objective Question Media (Image & Audio)（客观题多媒体支持：图片与音频）— 全部完成并已验收 (Human Gate C = PASS)。后续行动：合并 PR #17，随后开展全产品功能完整性审查（Whole-Product Feature Complete Review V3）。

本工作流为功能冻结前的第三批范围收尾：
1. **5 种客观题型全覆盖多媒体**：单选、多选、填空、判断、匹配全部 5 种客观题型均支持可选附加图片、音频，或同时附加图片与音频。
2. **纯本地离线媒体存储架构**：使用基于 IndexedDB 的二进制本地媒体资产库（`quiz-studio-media-db` / `media_assets` 对象仓库），以原生 Blob 格式持久化，题目 JSON 中仅持有稳定的唯一 ID 与元数据引用，实现零网络请求与完全离线可用。
3. **图片编排、预览与无障碍 Alt 说明**：支持本地图片上传（PNG、JPEG、WebP、GIF、SVG）、实时缩略图预览、文件大小展示、替换、移除及无障碍 Alt 文本配置。
4. **交互式图片模态查看器**：响应式全屏/模态查看器（`#imageViewerDialog`），支持放大（`+`）、缩小（`-`）、重置（`1:1`）、关闭（`✕`）以及键盘快捷键（`+`、`-`、`0`、`Esc`）。
5. **音频编排与作答播放器**：支持本地音频上传（MP3、WAV、OGG、WebM、AAC、M4A、FLAC）、编辑器内试听、以及作答界面中的题目内嵌播放控件（支持播放/暂停、进度拖拽与无限次重播；单卷播放策略限制延迟至 V2）。
6. **单卷便携包与全库备份恢复（严格引用完整性校验）**：导出包含 base64 媒体负载的自包含信封包（`quiz-studio.quiz-paper` v2），导入时严格拦截缺失/空载/损坏资产与不兼容 MIME 类型，全量备份支持 `mediaAssets`，并完全向下兼容纯文本遗留 JSON 试卷。
7. **作答证据不可变性与引用感知保守清理**：进行中会话快照与已归档 Learner Response 快照对媒体引用的独立持久留存，结算复盘列表中的图片缩略图（点击放大）与内嵌音频播放，以及在删除题目/试卷时安全保留被引用的多媒体资产。
8. **多媒体 QA 验收试卷包与双语指南**：在 `manual-qa/media-sample/` 下提供常驻多媒体自包含验收样卷包（包含必须听音作答的音调序列题），并在 `manual-qa/human-gate-c.md` 与 `manual-qa/human-gate-c.zh-CN.md` 中 7 项验证旅程全部通过人工验收（Human Gate C = PASS）。

至此，功能冻结前 V1 范围收尾的全部三个批次（Batch A: 练习反馈模式与专项练习架构；Batch B: 试卷库分类组织与渐进式导航；Batch C: 客观题多媒体支持）均已全部完成并获得人工验收。

## Pre-Freeze UI 产品化里程碑摘要（历史基线）

- **设计规范与系统基础**：创建 [DESIGN.md](file:///f:/CodexWorkspaces/Quiz%20System/DESIGN.md)，确立 Layered Paper Study Desk 设计 Token、字体层级、呼吸间距、自然语义墨水系统与基于 Web Audio API 的零外部依赖物理合成音效引擎。
- **应用框架与工具启动台**：新增独立 Tool Launcher 首页启动台、顶部栏音效切换按钮、可拖拽侧边栏，以及持久化 UI 偏好设置（主题模式、音效开关、减弱动效偏好、侧边栏宽度）。
- **核心做题与研习纸面**：客观题练习与翻译练习重构为停靠在桌面上的连续手稿纸（Laid Paper Sheet），提供有机物理翻页动效、铅笔书写摩擦音效，以及匹配题逐对独立状态判定与内联正确答案提示。
- **教师批改台**：批改工作区重构为单张连续纸面批改台，配备样式批注笔盘、实时墨水投射视图，以及带有物理下压回弹与钝击音效的橡胶印章反馈。
- **离线与测试闭包**：全量 270 项自动化单元/集成测试通过（涵盖题目注册表、评分计算、JSON Schema 校验、即时反馈与答完交卷两种模式下的 active session 序列化与恢复规整、交卷确认与取消隔离保护、分类注册表与安全删除、多媒体类型校验、IndexedDB 媒体存储、引用收集与孤儿清理、便携式媒体包、元认知标记、富文本批改、评阅传输包、删除策略、UI 偏好、合成音效引擎、Python 双栈服务器以及 Service Worker 策略）。测试覆盖包含 Windows 与 Linux CI 全量运行。
- **Human Acceptance Gate**：Final Human Acceptance Gate 已执行并通过（PASS）。

## 验收政策（历史记录）

M6.2 到 M6.7 的正式用户验收统一推迟至 M6.7 实现完成后统一进行 M6 综合验收。该项综合人工验收（Journeys 01–10）现已执行完毕并全部通过（PASS）。M6.0 和 M6.1 此前已单独完成验收。Batch A Human Gate A (Journeys 01–06)、Batch B Human Gate B (Journeys 01–07) 与 Batch C Human Gate C (Journeys 01–07) 均已正式通过人工验收（PASS）。

## 当前发布范围

当前版本范围包括 Milestone 1-5 基线、已批准的 Milestone 6 工作线、Pre-Freeze UI Productization 设计系统，以及 Pre-Freeze V1 范围收尾工作流（Batch A 反馈模式与专项练习架构；Batch B 试卷库分类组织；Batch C 题目媒体）。翻译练习作为专项练习的一个子分支。全部操作均保持本地优先，不要求外部网络连接或付费 AI 推理。

## Feature Complete 状态

暂缓宣布。

所有三个 Pre-Freeze V1 范围收尾批次（A/B/C）均已全部完成并验收。后续将通过 Whole-Product Feature Complete Review V3 正式评估全产品功能完整性。

## Feature Freeze 状态

尚未进入（非激活）。

只有在 Whole-Product Review V3 获得正式确认，且用户明确授权后，才可以进入 Feature Freeze。

## 当前发布阻断项

- 尚未完成全项目全里程碑（M1–M5 基线 + 全产品）的最终完整人工验收。
- 旧版单试卷数据在代表性旧 localStorage 状态下的迁移行为，以及真实浏览器关闭/重开后的 active session 恢复尚未获得单独专项验证。
- 仓库保持 private 时，公开 Pages 部署继续暂缓。
- 尚不存在 Release Candidate，也尚未完成最终干净环境验证。

## Hardening 进度

尚未开始。

Product Hardening 是 Milestone 7，只能在 Whole-Product Feature Complete Review V3 获得正式确认并明确进入 Feature Freeze 后开始。

### Milestone 7 Product Hardening 范围（V1 必须项）
- **翻译学习者元认知标记切换交互优化**：翻译练习中的标记交互优化（活动颜色切换按钮、再次点击取消标记、免弹窗内联切换）被归类为 V1 Milestone 7 Product Hardening 必做硬化项（非延迟项）。
- **移动端/触屏工效学与原生对话框打磨**：针对历史清单、多按钮操作行和触屏视口上的确认工作流进行响应式微调。
- **全产品完整性验证**：旧版本数据迁移安全测试与干净环境 Clone 验证。

## 验证状态

- 270 项自动化单元/集成测试通过（涵盖题目注册表、评分计算、JSON Schema 校验、即时反馈与答完交卷两种模式下的 active session 序列化与恢复规整、交卷确认与取消隔离保护、分类注册表规整、空分类持久化、重命名传播、安全删除契约、媒体格式校验、IndexedDB 原生 Blob Media Asset Store 读写与导入导出、便携包引用完整性校验、引用收集与保守孤儿清理、便携式单卷打包、媒体全量备份恢复、元认知标记、富文本批改、评阅传输包、删除策略、UI 偏好、合成音效引擎、Python 双栈服务器以及 Service Worker 策略）。测试覆盖包含 Windows 与 Linux CI 全量运行。
- **Pre-Freeze V1 Scope Closure (Batch A)**：客观做题反馈模式与专项练习信息架构已实现并通过人工验证（Human Gate A = **PASS**）。
- **Pre-Freeze V1 Scope Closure (Batch B)**：试卷库集合式分类组织、空分类持久化、分类作用域搜索、重命名传播、试卷归类调整、渐进式单层导航及安全删除弹窗已完整实现并通过人工验证（Human Gate B = **PASS**）。
- **Pre-Freeze V1 Scope Closure (Batch C)**：客观题多媒体支持（5 大题型图片/音频、原生 Blob IndexedDB 存储、模态图片查看器、内嵌播放器、单卷便携包引用完整性校验、全量备份恢复、证据不可变性与保守引用清理）已完整实现并通过人工验证（Human Gate C = **PASS**）。

## 题目媒体支持规范（Batch C 范围定义）

- **V1 范围内（Pre-Freeze Batch C）**：全部 5 种客观题型（`单选`、`多选`、`填空`、`判断`、`匹配`）均可选同时包含图片和/或音频；图片支持放大/全屏查看；音频渲染为题目内嵌播放控制条。
- **V2 延迟范围**：单卷级音频播放策略（如快进/拖拽进度条限制、最大重听次数权限以及严格考试锁定策略）。

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
- 在触屏/移动端视口下进行范围内的富文本批改（样式/插入/替换/删除与颜色选择器）。
- 对插入/替换文本输入与重新练习/删除确认的原生浏览器 `window.prompt()`/`window.confirm()` 进行人工检查。
- 使用真实的外部人类评阅者或真实的外部 AI assistant/LLM 会话（非合成 fixture）从导出的请求文件生成 Teacher Review 或补救 Translation Document 的真实端到端往返。
- 针对 Teacher Review 和补救文档文件输入的操作系统原生文件选择器行为。
- 超大评阅请求/补救请求导出文件（大量条目、大量批改）的实用文件大小与目标外部工具的上下文限制。
- 累积大量作答/批改记录时的 Translation 历史性能（未实现分页；列表会一次性渲染所有过滤后的条目）。

## 延迟特性

- AI 辅助题目生成。
- 桌面客户端打包。
- 云端同步与用户账号系统。
- 试卷分享、协作以及应用内教师账号/管理体系。
- 主观题批改。
- 公开 GitHub Pages 部署与最终 GitHub Release。
- 高级历史分析/搜索、图谱式血缘可视化，以及 History 分页/虚拟滚动层（若未来历史数据规模成为实际瓶颈，将在后续版本考虑）。
- 单卷级音频播放策略限制、快进限制与重听次数限制（V2 延迟）。

## 后续工程目标

1. **合并 Batch C PR #17**：合并 PR #17（`feature/pre-freeze-scope-batch-c`）至 `main` 分支。
2. **全产品功能完整性审查（Review V3）**：开展全产品功能完整性审查，评估是否符合 Feature Complete 并建议进入 Feature Freeze。
3. **Milestone 7 Product Hardening**：正式进入 Feature Freeze 并执行产品硬化（包含元认知标记切换交互优化等必做项）。

## 仓库状态

- 默认分支：`main`
- 远程仓库：`origin`
- Batch C 前验证基线：`fb9ff72 Merge pull request #16 from codex/feature/pre-freeze-scope-batch-b` (`main`)
- 当前工作分支：用于 Batch C 的 `feature/pre-freeze-scope-batch-c`
- 当前文档版本：包含本状态文件的提交；请使用 Git 历史获取其不可变标识符
- 私有仓库状态：基于当前项目策略和暂缓 Pages 的决定，设定为 private
- Pull Request 状态：PR #16 已合并入 `main`。PR #17（`feature/pre-freeze-scope-batch-c`）已通过验收，等待合并。
