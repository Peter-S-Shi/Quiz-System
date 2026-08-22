# 项目状态

## 当前阶段

Pre-Freeze V1 Scope Closure — 功能冻结前 V1 范围收尾

## 当前里程碑

Pre-Freeze V1 Scope Closure · Batch A: Practice Feedback Modes & Special Practice Information Architecture（练习反馈模式与专项练习信息架构）— 实现完成并通过验证；Human Gate A = PASS

本工作流为功能冻结前的两批范围收尾之第一批：
1. **客观题练习反馈模式**：在做题设置中新增“即时反馈”（`instant`，默认）与“答完交卷”（`submitAtEnd`）两种模式，完整支持页面刷新进度恢复与全部 5 种客观题型，并引入显式交卷二次确认与取消隔离保护。
2. **专项练习信息架构**：调整产品层级，将“翻译练习”收纳在顶级“专项练习”产品空间下，既有全部翻译研习工作流完整保持。
3. **Human Gate A**：人工验证旅程全部通过（PASS）。

后续将进入第 B 批次（题目媒体支持：图片/音频），随后执行全产品 Feature Complete Review V3。

## Pre-Freeze UI 产品化里程碑摘要（历史基线）

- **设计规范与系统基础**：创建 [DESIGN.md](file:///f:/CodexWorkspaces/Quiz%20System/DESIGN.md)，确立 Layered Paper Study Desk 设计 Token、字体层级、呼吸间距、自然语义墨水系统与基于 Web Audio API 的零外部依赖物理合成音效引擎。
- **应用框架与工具启动台**：新增独立 Tool Launcher 首页启动台、顶部栏音效切换按钮、可拖拽侧边栏，以及持久化 UI 偏好设置（主题模式、音效开关、减弱动效偏好、侧边栏宽度）。
- **核心做题与研习纸面**：客观题练习与翻译练习重构为停靠在桌面上的连续手稿纸（Laid Paper Sheet），提供有机物理翻页动效、铅笔书写摩擦音效，以及匹配题逐对独立状态判定与内联正确答案提示。
- **教师批改台**：批改工作区重构为单张连续纸面批改台，配备样式批注笔盘、实时墨水投射视图，以及带有物理下压回弹与钝击音效的橡胶印章反馈。
- **离线与测试闭包**：全量 244 项自动化单元/集成测试通过（涵盖题目注册表、评分计算、JSON Schema 校验、即时反馈与答完交卷两种模式下的 active session 序列化与恢复规整、交卷确认与取消隔离保护、元认知标记、富文本批改、评阅传输包、删除策略、UI 偏好、合成音效引擎、Python 双栈服务器以及 Service Worker 策略）。测试覆盖包含 Windows 与 Linux CI 全量运行。
- **Human Acceptance Gate**：Final Human Acceptance Gate 已执行并通过（PASS）。

## 验收政策（历史记录）

M6.2 到 M6.7 的正式用户验收统一推迟至 M6.7 实现完成后统一进行 M6 综合验收。该项综合人工验收（Journeys 01–10）现已执行完毕并全部通过（PASS）。M6.0 和 M6.1 此前已单独完成验收。

## 当前发布范围

当前版本范围包括 Milestone 1-5 基线、已批准的 Milestone 6 工作线、Pre-Freeze UI Productization 设计系统，以及 Pre-Freeze V1 范围收尾工作流（Batch A 反馈模式与专项练习架构；Batch B 题目媒体）。翻译练习作为专项练习的一个子分支。全部操作均保持本地优先，不要求外部网络连接或付费 AI 推理。

## Feature Complete 状态

暂缓宣布。

仓库正在执行 Pre-Freeze V1 Scope Closure（Batch A 与 Batch B）。在两批次全部收尾后，将通过 Whole-Product Feature Complete Review V3 重新进行全产品功能完整性判定。

## Feature Freeze 状态

尚未进入（非激活）。

只有在 Pre-Freeze V1 Scope Closure 批次通过人工验收、Whole-Product Review V3 获得正式确认，且用户明确授权后，才可以进入 Feature Freeze。

## 当前发布阻断项

- 尚未完成全项目全里程碑（M1–M5 基线 + 全产品）的最终完整人工验收。
- 旧版单试卷数据在代表性旧 localStorage 状态下的迁移行为，以及真实浏览器关闭/重开后的 active session 恢复尚未获得单独专项验证。
- 仓库保持 private 时，公开 Pages 部署继续暂缓。
- 尚不存在 Release Candidate，也尚未完成最终干净环境验证。

## Hardening 进度

尚未开始。

Product Hardening 是 Milestone 7，只能在 Pre-Freeze V1 Scope Closure（Batch A 与 Batch B）通过人工验收、Whole-Product Feature Complete Review V3 获得正式确认并明确进入 Feature Freeze 后开始。

### Milestone 7 Product Hardening 范围（V1 必须项）
- **翻译学习者元认知标记切换交互优化**：翻译练习中的标记交互优化（活动颜色切换按钮、再次点击取消标记、免弹窗内联切换）被归类为 V1 Milestone 7 Product Hardening 必做硬化项（非延迟项）。
- **移动端/触屏工效学与原生对话框打磨**：针对历史清单、多按钮操作行和触屏视口上的确认工作流进行响应式微调。
- **全产品完整性验证**：旧版本数据迁移安全测试与干净环境 Clone 验证。

## 验证状态

- 244 项自动化单元/集成测试通过（涵盖题目注册表、评分计算、JSON Schema 校验、即时反馈与答完交卷两种模式下的 active session 序列化与恢复规整、交卷确认与取消隔离保护、元认知标记、富文本批改、评阅传输包、删除策略、UI 偏好、合成音效引擎、Python 双栈服务器以及 Service Worker 策略）。测试覆盖包含 Windows 与 Linux CI 全量运行。
- **Pre-Freeze V1 Scope Closure (Batch A)**：客观做题反馈模式（即时反馈与带显式交卷确认的答完交卷）与专项练习信息架构（`专项练习 -> 双语翻译研习`）已实现，并通过 `tests/practice-modes.test.js` 自动化测试。
- **Human Gate A 验证指南**：验证旅程 A、B、C 已在 `manual-qa/human-gate-a.md` 和 `manual-qa/human-gate-a.zh-CN.md` 中完整就绪并通过人工验证（**PASS**）。

## 题目媒体支持规范（Batch B 范围定义）

- **V1 范围内（Pre-Freeze Batch B）**：全部 5 种客观题型（`单选`、`多选`、`填空`、`判断`、`匹配`）均可选同时包含图片和/或音频；图片支持放大/全屏查看；音频渲染为题目内嵌播放控制条。
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
- 单卷级音频播放策略、进度条拖拽限制与最大重听次数限制（V2 延迟）。

## 下一步工程目标

1. **Pre-Freeze V1 Scope Closure · Batch B**：实现客观题目媒体支持（全部 5 种客观题型可选包含图片和/或音频、图片放大查看、题目内嵌音频播放条）。
2. **Whole-Product Feature Complete Review V3**：重新执行覆盖全产品全部工作流的功能完整性评审，并建议进入 Feature Freeze。
3. **Milestone 7 Product Hardening**：正式进入 Feature Freeze，执行产品硬化工作（含元认知标记切换交互优化）。

## 仓库状态

- 默认分支：`main`
- 远程：`origin`
- M6.7 开始前已验证的基线：`61cd16f Record M6.6 merge into main`（`main`）
- M6.7 合并提交：`d6a5327 M6.7: History, Retry, Portability, and Whole-Product Integration (#6)`（`main`）——由主体实现、PR/CI 状态更新和删除完整性收尾补丁 squash 而成
- 当前文档修订：即包含本状态文件的 commit；其不可变标识以 Git 历史为准
- Local Runtime Recovery 基线：远端 `main` 精确提交 `eb5b70b7e820b1bd0183b2f864ebb892c5e70b47`；PR #11 已以 `6b38c40` 合并，BAT CRLF 后续修复 PR #12 已以 `6643a1b` 合并
- private 仓库状态：基于当前项目策略和 Pages 暂缓决定，按 private 处理
- Pull Request 状态：PR #15（`feature/pre-freeze-scope-batch-a`）实现了 Batch A（做题反馈模式与专项练习信息架构），通过 Human Gate A（PASS）及 CI 检验，并合并入 `main`。历史 PR #14（`ui/layered-paper-productization`）保持已合并至 `main`。
