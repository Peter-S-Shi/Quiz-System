# 项目状态

## 当前阶段

Feature Freeze / Product Hardening（功能冻结 / 产品硬化阶段）

## 当前里程碑

Milestone 7.1 — UX & Interaction Hardening（UX 与交互硬化）

产品负责人已正式接受 Whole-Product Feature Complete Review V3（PASS 裁决），确认 V1 不存在任何 Category A 阻断项，正式宣布 Quiz Studio V1 为 **Feature Complete（功能完备）**，并明确授权进入 **Feature Freeze（功能冻结）**。

### 功能冻结前 V1 范围收尾里程碑摘要（历史基线）

- **Batch A（做题反馈模式与专项练习信息架构）**：即时反馈与答完交卷双模式完整支持，具备显式交卷确认、交卷前零答案/分数泄露保护，以及独立 Tool Launcher 首页启动台（Human Gate A = **PASS**）。
- **Batch B（试卷库分类组织与渐进式导航）**：集合式分类体系（`全部试卷`、`未分类`、用户自定义分类）、空分类持久化、分类作用域搜索、渐进式单层侧边栏导航（分类 → 试卷 → 题目）以及安全删除弹窗（Human Gate B = **PASS**）。
- **Batch C（客观题多媒体支持：图片与音频）**：覆盖全部 5 大客观题型（`单选`、`多选`、`填空`、`判断`、`匹配`）的图片/音频附件支持、基于 IndexedDB（`quiz-studio-media-db`）的原生 Blob 存储、模态图片查看器（`#imageViewerDialog`）及缩放控制、题目内嵌音频播放器、自包含单卷便携包（v2）、支持 `mediaAssets` 且具备严格引用完整性校验的全量备份恢复、保守引用感知媒体清理以及多媒体验收样卷（Human Gate C = **PASS**）。
- **全产品功能完整性审查（Whole-Product Feature Complete Review V3）**：覆盖全部 10 大 V1 范围领域、跨里程碑集成及 270 项自动化测试的只读生命周期审查，0 阻断项并达成全票 PASS 结论（已合并至 `main`，提交：`22d9aee`）。

## Pre-Freeze UI 产品化里程碑摘要（历史基线）

- **设计规范与系统基础**：创建 [DESIGN.md](file:///f:/CodexWorkspaces/Quiz%20System/DESIGN.md)，确立 Layered Paper Study Desk 设计 Token、字体层级、呼吸间距、自然语义墨水系统与基于 Web Audio API 的零外部依赖物理合成音效引擎。
- **应用框架与工具启动台**：新增独立 Tool Launcher 首页启动台、顶部栏音效切换按钮、可拖拽侧边栏，以及持久化 UI 偏好设置（主题模式、音效开关、减弱动效偏好、侧边栏宽度）。
- **核心做题与研习纸面**：客观题练习与翻译练习重构为停靠在桌面上的连续手稿纸（Laid Paper Sheet），提供有机物理翻页动效、铅笔书写摩擦音效，以及匹配题逐对独立状态判定与内联正确答案提示。
- **教师批改台**：批改工作区重构为单张连续纸面批改台，配备样式批注笔盘、实时墨水投射视图，以及带有物理下压回弹与钝击音效的橡胶印章反馈。
- **离线与测试闭包**：全量 270 项自动化单元/集成测试通过。
- **Human Acceptance Gates**：Final Human Acceptance Gate 已执行并通过（PASS），Batch A / Gate A（PASS）、Batch B / Gate B（PASS）、Batch C / Gate C（PASS）与 Review V3（PASS）均已通过。

## 验收政策（历史记录）

M6.2 到 M6.7 的正式用户验收统一推迟至 M6.7 实现完成后统一进行 M6 综合验收。该项综合人工验收（Journeys 01–10）已执行完毕并全部通过（PASS）。M6.0 和 M6.1 此前已单独完成验收。Batch A Human Gate A (Journeys 01–06)、Batch B Human Gate B (Journeys 01–07) 与 Batch C Human Gate C (Journeys 01–07) 均已正式通过人工验收（PASS）。Whole-Product Feature Complete Review V3 已正式完成评估并合入 `main`。

M7.0 Hardening Audit & Contract Lock 已通过 PR #20 接受并合并。M7.1 已在专用分支完成实现；专项 Product Owner Human Acceptance Gate 仍为 pending，自动检查不能替代该人工门禁。

## 当前发布范围

当前版本范围包括 Milestone 1-5 基线、已批准的 Milestone 6 工作线、Pre-Freeze UI Productization 设计系统，以及 Pre-Freeze V1 范围收尾工作流（Batch A、Batch B、Batch C）。翻译练习作为专项练习的一个子分支。全部操作均保持本地优先，不要求外部网络连接或付费 AI 推理。

## Feature Complete 状态

**DECLARED — V1 Feature Complete（已正式宣布 V1 功能完备）**

宣布依据：
- Whole-Product Feature Complete Review V3 = **PASS**（已合入 `main` 提交 `22d9aee`）。
- Category A 功能完备阻断项 = **0**。
- 功能冻结前收尾批次 Batch A、Batch B 与 Batch C 均已完工并通过人工验收。
- 验收基线上 **270 项自动化单元/集成测试全部通过**。
- 核心本地优先、完全离线可用及数据模式契约均完好且通过验证。

## Feature Freeze 状态

**ACTIVE（已正式激活）**

产品负责人已明确授权进入 **Feature Freeze（功能冻结）**。

自此节点开始，V1 产品功能范围全面冻结：
- 在 Milestone 7 期间，不得向 V1 引入常规新功能、新题型、新练习分支或任何功能范围扩充。
- 若产品硬化过程中发现真正阻断发布的缺陷确实需要扩大 V1 范围，必须作为 **Product Owner Hard Gate（产品负责人硬门禁）** 严格升级审批，严禁自主扩充。

## 冻结期硬化规则（Frozen-Scope Hardening Rules）

Milestone 7 Product Hardening 可以包含：
- 缺陷修复与可靠性硬化；
- 数据完整性保护与防御性错误处理；
- 既有交互体验打磨（明确包含翻译元认知标记切换交互优化必做项）；
- 触屏/移动端工效学与响应式布局微调；
- 无障碍（a11y）改进与键盘导航打磨；
- 真实数据积累下的性能特征分析与低风险防御性优化；
- 代表性旧版 localStorage 数据迁移安全验证；
- 浏览器进程关闭重开后的 active-session 恢复验证；
- 干净环境重新 clone 与执行验证；
- 文档与治理状态同步。

Feature Freeze 期间明确禁止的内容（V2 / 延迟范围）：
- 新题型或新专项练习分支；
- 翻译历史分页、虚拟滚动或新导航能力；
- 单卷级音频播放策略限制、快进限制与重听次数限制；
- AI 题目或文档生成；
- 云端同步、用户账号或应用内教师管理；
- 桌面客户端打包；
- 公开 GitHub Pages 部署与正式 GitHub Release。

## 当前发布阻断项

- **H-01 — 规范 Quiz Library 启动覆盖风险：**损坏或不受支持的 `quiz-studio-library-v1` JSON 可能在加载失败后被立即替换为自动生成的默认 Library。M7.2 必须先保留原始值、安全失败并补充迁移/损坏回归测试，之后才可进入 RC。
- M7.1 自动化实现已完成，但 Product Owner Human Acceptance Gate 仍待执行；M7.2 与 M7.3 尚未开始。
- 旧版单试卷数据在代表性旧 localStorage 状态下的迁移行为，以及真实浏览器关闭/重开后的 active session 恢复尚未获得单独专项验证。
- 尚不存在 Release Candidate，也尚未完成最终干净环境验证。

## Hardening 进度

**M7.0 已完成并被接受；M7.1 实现完成；M7.1 Human Acceptance 待执行。**

Milestone 7 继续处于 Feature Freeze。M7.1 已完成接受的 M-01、M-02、M-03 与 M-05 实现范围：整题标记语义活动态与焦点恢复、响应式/触屏/键盘硬化、以统一 Study Desk 合同替换 19 处批准的原生对话框，以及为客观题和 Translation Item 删除增加确认保护。两处明确允许的原生确认继续保留。包括 H-01 在内的 M7.2 工作尚未开始。

### Milestone 7 Product Hardening 范围（V1 必须项）
- **翻译学习者元认知标记切换交互优化**：翻译练习中的标记交互优化（活动颜色切换按钮、再次点击取消标记、免弹窗内联切换）。
- **移动端/触屏工效学与原生对话框打磨**：针对历史清单、多按钮操作行和触屏视口上的确认工作流进行响应式微调，并将剩余的 `window.prompt()` / `window.confirm()` 替换为 Study Desk 模态弹窗。
- **翻译历史性能特征分析**：针对真实数据积累场景进行性能画像与回归测试。
- **全产品完整性验证**：解决 Review V3 验证差距 C1–C4（旧版本数据迁移安全测试、浏览器重启恢复验证、真实外部评阅往返、跨平台干净环境 Clone 验证）。

## 验证状态

- **275 项自动化单元/集成测试通过**（接受的 270 项基线加 5 项 M7.1 交互合同回归，覆盖原生对话框清单、统一 Study Desk 对话框、高内容删除确认顺序、整题标记 pressed 语义与 Correction Workspace 焦点恢复）。既有题目注册、评分、schema、session、分类、媒体、备份、标记、批改、评阅、删除策略、runtime 与 Service Worker 合同继续全绿。
- **Pre-Freeze V1 Scope Closure (Batch A)**：客观做题反馈模式与专项练习信息架构已通过人工验证（Human Gate A = **PASS**）。
- **Pre-Freeze V1 Scope Closure (Batch B)**：试卷库分类组织与渐进式导航已通过人工验证（Human Gate B = **PASS**）。
- **Pre-Freeze V1 Scope Closure (Batch C)**：客观题多媒体支持已通过人工验证（Human Gate C = **PASS**）。
- **Whole-Product Feature Complete Review V3**：全产品完整性审查确认 0 阻断项并达成全票 PASS 结论（Review V3 = **PASS**）。

## 题目媒体支持规范（Batch C 范围定义）

- **V1 范围内（Pre-Freeze Batch C）**：全部 5 种客观题型（`单选`、`多选`、`填空`、`判断`、`匹配`）均可选同时包含图片和/或音频；图片支持放大/全屏查看；音频渲染为题目内嵌播放控制条。
- **V2 延迟范围**：单卷级音频播放策略（如快进/拖拽进度条限制、最大重听次数权限以及严格考试锁定策略）。

## 已知风险

- 规范 Quiz Library 启动流程目前没有针对损坏或不受支持存储 JSON 的隔离/恢复路径；这是 M7 审计中的 H-01 发布阻断项，目标在 M7.2 关闭。
- 由于仓库保持 private 且 Pages 部署暂缓，GitHub Pages 目前不能视为可用交付方式。
- ES module 应用不支持通过浏览器 `file://` 直接打开；用户必须使用本地静态服务器或 `start-local.bat`。
- Finalized Learner Response 使用浏览器本地存储且不被 history 静默截断；长期积累的大型 evidence 集合最终可能遇到浏览器容量限制。Translation 历史按设计同样没有条目数量上限，继承了这一风险。
- 外部 Teacher Review 与补救往返完全是手动的（导出一份文件、交给外部一方、导入他们返回的文件）；目前没有、也不计划做任何应用内 AI 集成。
- 学习者是否显示过隐藏的参考译文只记录在 active session 中，不会带入 finalized evidence；重新练习和补救材料的练习同样如此。
- 删除一条 Learner Response 会级联删除其 Teacher Review；目前没有单独保留批改内容、只删除作答记录的方式。这是 M6.7 的一项刻意设计选择（一条 review 的 `responseId` 链接必须始终可解析），而不是疏漏，但想要在删除作答记录后保留批改内容的用户，需要先导出该批改。
- M7.1 已实现 Translation 历史、重新练习选择、标记、批改工作区控件和对话框的响应式/触屏布局与焦点恢复；320/375/768/桌面视口的 Product Owner 验证仍待执行。
- 导出包内嵌的评阅请求/补救练习请求"task"指令文字是按语言固定的、用户不可编辑的字符串；它假设外部评阅者/agent 能理解一段纯文本的自然语言指令，这对某些非 LLM 的外部工具而言是一个合理但尚未验证的假设。

## 未知或未验证事项

- 使用超大规模积累数据进行完整备份导出和导入往返。
- 旧版单试卷数据在代表性旧 localStorage 状态下的迁移行为（Review V3 Gap C1）。
- 真实浏览器关闭后重新打开（而非仅刷新）时 Translation Practice session 的恢复情况（Review V3 Gap C2）。
- M7.1 自定义对话框的取消、焦点返回与高内容删除在真实人工浏览器会话中的表现；自动化源合同已全绿，但 Product Owner 门禁仍待执行。
- PWA 安装、离线行为和缓存升级在主要浏览器中的表现。
- 代表性设备上的可访问性和响应式行为，包括新增的 Translation 历史浏览器和重新练习条目选择清单。
- 干净环境重新 clone 并运行项目（Review V3 Gap C4）。
- 在触屏/移动端视口下进行标记、历史浏览和重新练习条目选择操作。
- 在触屏/移动端视口下进行范围内的富文本批改（样式/插入/替换/删除与颜色选择器）。
- 人工检查统一 Study Desk 文本输入/破坏性/进度丢失对话框，包括 Insert/Replace 选择范围保持和双语焦点返回。只有“答完交卷”和“只重练需要加强条目”按合同继续保留原生确认。
- 使用真实的外部人类评阅者或真实的外部 AI assistant/LLM 会话从导出的请求文件生成 Teacher Review 或补救 Translation Document 的真实端到端往返（Review V3 Gap C3）。
- 针对 Teacher Review 和补救文档文件输入的操作系统原生文件选择器行为。
- 超大评阅请求/补救请求导出文件的实用文件大小与目标外部工具的上下文限制。
- 累积大量作答/批改记录时的 Translation 历史性能特征。

## 延迟特性

- AI 辅助题目生成。
- 桌面客户端打包。
- 云端同步与用户账号系统。
- 试卷分享、协作以及应用内教师账号/管理体系。
- 主观题批改。
- 公开 GitHub Pages 部署与最终 GitHub Release。
- 翻译历史分页、虚拟滚动与高级图谱血缘可视化（V2 延迟）。
- 单卷级音频播放策略限制、快进限制与重听次数限制（V2 延迟）。

## 后续工程目标

**Product Owner 执行 M7.1 Human Acceptance**

执行 `manual-qa/m7-1-human-acceptance.zh-CN.md`。在 M7.1 被接受并获得单独授权前，不得开始 M7.2。

## 仓库状态

- 默认分支：`main`
- 远程仓库：`origin`
- 已验证基线：`db079224263c3453097cf8c45ad36aa451282f9e Merge pull request #20`（`main`，来源分支 `hardening/m7-audit-contract-lock`）
- 当前工作分支：`hardening/m7-1-ux-interaction`
- 当前文档版本：包含本状态文件的提交；请使用 Git 历史获取其不可变标识符
- 私有仓库状态：M7.0 preflight 已验证为 private
- Pull Request 状态：PR #20 已合并入 `main`；M7.1 Draft PR #21 已开启，在 Product Owner Human Acceptance 前不得合并。
