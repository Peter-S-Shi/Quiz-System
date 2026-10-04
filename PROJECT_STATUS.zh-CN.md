# 项目状态

## 当前阶段

V1 最终定版 / 维护冻结状态 (V1 Finalized / Maintenance Hold) + **Quiz Studio V2 `2.0.0` 已发布 / 维护中**（位于 `main`，tag `v2.0.0`；`v2` 分支保留）：Desktop Foundation **已验收**；ADR 0002 **已验收**；**V1 Migration 里程碑已验收**；**ADR 0003（Learning Orchestration / Scheduling / Recommendation / Calendar）ACCEPTED — GO WITH AMENDMENT**；**Learning Orchestration + Calendar 里程碑已验收**；**ADR 0004（Task-Domain Integration 与 Typing Evidence Contract）ACCEPTED — GO WITH AMENDMENT**；**Task-Domain Integration 里程碑已验收（Human Gate PASS）**；**Objective Answer Explanation + Focused Practice 里程碑已验收（Human Gate PASS）**；**Final Product UI Integration 里程碑已验收（Human Gate PASS）**；**Human Evaluation Repair 已验收（定向人工复测 PASS）**；**整体产品功能关口（Whole Product Feature Gate）PASS —— Quiz Studio V2 正式 FEATURE COMPLETE，Feature Freeze 生效；Product Hardening PASS —— 已验收 / 完成（Human Hardening Gate PASS，2026-10-03）；Release Candidate 2.0.0-rc.1 已验收（Human RC Gate PASS）；GA `2.0.0` 已发布 —— Quiz Studio V2 进入维护**（[`docs/V2_RELEASE_CANDIDATE.md`](docs/V2_RELEASE_CANDIDATE.md)）（[`docs/V2_WHOLE_PRODUCT_FEATURE_GATE.md`](docs/V2_WHOLE_PRODUCT_FEATURE_GATE.md)）

## 当前活跃里程碑

V1：无（维护冻结）。V2：**V1 → V2 Migration 里程碑已验收**（Human Gate PASS；记录：[`docs/V2_MIGRATION.zh-CN.md`](docs/V2_MIGRATION.zh-CN.md)），在长期 `v2` 分支上开发，并作为 `2.0.0` 提升到 `main`（`v2` 分支保留；没有使用 PR）。Desktop Foundation 已验收（[`docs/V2_DESKTOP_FOUNDATION.zh-CN.md`](docs/V2_DESKTOP_FOUNDATION.zh-CN.md)），ADR 0002 已验收。架构决策 **[ADR 0003](docs/adr/0003-learning-orchestration-scheduling-recommendation-calendar.md)** 已 **ACCEPTED — GO WITH AMENDMENT**（仅文档）。**Learning Orchestration + Calendar 里程碑已验收**（Human Gate PASS）；里程碑记录与证据映射：[`docs/V2_ORCHESTRATION.zh-CN.md`](docs/V2_ORCHESTRATION.zh-CN.md)。**[ADR 0004](docs/adr/0004-task-domain-integration-and-typing-evidence-contract.md)**（Task-Domain Integration 与 Typing Evidence Contract）为 **ACCEPTED — GO WITH AMENDMENT**（仅文档）。**Task-Domain Integration 里程碑已在 `v2` 上验收（Human Gate PASS）**；里程碑记录与证据映射：[`docs/V2_TASK_DOMAINS.zh-CN.md`](docs/V2_TASK_DOMAINS.zh-CN.md)。**Objective Answer Explanation + Focused Practice 里程碑已验收（Human Gate PASS）**（[`docs/V2_PRACTICE.zh-CN.md`](docs/V2_PRACTICE.zh-CN.md)）；**Final Product UI Integration 里程碑已验收（Human Gate PASS）**（[`docs/V2_PRODUCT_UI.zh-CN.md`](docs/V2_PRODUCT_UI.zh-CN.md)）。

## 最近已完成里程碑

Milestone 8 — Release Candidate 1 验证：COMPLETE / ACCEPTED（候选版本 `v1.0.0-rc.1` 于提交 `f33bafcfe42ac8dd521466026c343102dc18897a` 获 Product Owner 正式人工验收通过）

产品负责人已正式接受 Whole-Product Feature Complete Review V3（PASS 裁决），确认 V1 不存在任何 Category A 阻断项，正式宣布 Quiz Studio V1 为 **Feature Complete（功能完备）**，并明确授权进入 **Feature Freeze（功能冻结）**。

### 功能冻结前 V1 范围收尾里程碑摘要（历史基线）

- **Batch A（做题反馈模式与专项练习信息架构）**：即时反馈与答完交卷双模式完整支持，具备显式交卷确认、交卷前零答案/分数泄露保护，以及独立 Tool Launcher 首页启动台（Human Gate A = **PASS**）。
- **Batch B（试卷库分类组织与渐进式导航）**：集合式分类体系（`全部试卷`、`未分类`、用户自定义分类）、空分类持久化、分类作用域搜索、渐进式单层侧边栏导航（分类 → 试卷 → 题目）以及安全删除弹窗（Human Gate B = **PASS**）。
- **Batch C（客观题多媒体支持：图片与音频）**：覆盖全部 5 大客观题型（`单选`、`多选`、`填空`、`判断`、`匹配`）的图片/音频附件支持、基于 IndexedDB（`quiz-studio-media-db`）的原生 Blob 存储、模态图片查看器（`#imageViewerDialog`）及缩放控制、题目内嵌音频播放器、自包含单卷便携包（v2）、支持 `mediaAssets` 且具备严格引用完整性校验的全量备份恢复、保守引用感知媒体清理以及多媒体验收样卷（Human Gate C = **PASS**）。
- **全产品功能完整性审查（Whole-Product Feature Complete Review V3）**：覆盖全部 10 大 V1 范围领域、跨里程碑集成及 270 项自动化测试的只读生命周期审查，0 阻断项并达成全票 PASS 结论（已合并至 `main`，提交：`22d9aee`）。

## Pre-Freeze UI 产品化里程碑摘要（历史基线）

- **设计规范与系统基础**：创建 [DESIGN.md](DESIGN.md)，确立 Layered Paper Study Desk 设计 Token、字体层级、呼吸间距、自然语义墨水系统与基于 Web Audio API 的零外部依赖物理合成音效引擎。
- **应用框架与工具启动台**：新增独立 Tool Launcher 首页启动台、顶部栏音效切换按钮、可拖拽侧边栏，以及持久化 UI 偏好设置（主题模式、音效开关、减弱动效偏好、侧边栏宽度）。
- **核心做题与研习纸面**：客观题练习与翻译练习重构为停靠在桌面上的连续手稿纸（Laid Paper Sheet），提供有机物理翻页动效、铅笔书写摩擦音效，以及匹配题逐对独立状态判定与内联正确答案提示。
- **教师批改台**：批改工作区重构为单张连续纸面批改台，配备样式批注笔盘、实时墨水投射视图，以及带有物理下压回弹与钝击音效的橡胶印章反馈。
- **离线与测试闭包**：完整 Service Worker ESM 预缓存闭包，覆盖所有运行模块与 schema。
- **Human Acceptance Gates**：Final Human Acceptance Gate 已执行并通过（PASS），Batch A / Gate A（PASS）、Batch B / Gate B（PASS）、Batch C / Gate C（PASS）、Review V3（PASS）与 M7.1 Product Owner 专项 Human Acceptance（PASS）均已通过。

## 验收政策（历史记录）

M6.2 到 M6.7 的正式用户验收统一推迟至 M6.7 实现完成后统一进行 M6 综合验收。该项综合人工验收（Journeys 01–10）已执行完毕并全部通过（PASS）。M6.0 和 M6.1 此前已单独完成验收。Batch A Human Gate A (Journeys 01–06)、Batch B Human Gate B (Journeys 01–07) 与 Batch C Human Gate C (Journeys 01–07) 均已正式通过人工验收（PASS）。Whole-Product Feature Complete Review V3 已正式完成评估并合入 `main`。

M7.0 已通过 PR #20 接受。M7.1 实现与 Product Owner Human Acceptance 已完成，并通过 PR #21 合并。H-01 已解决，C1 与 B4 已完成；Product Owner 已完成 C2 浏览器真实进程重启 Human Gate，结果为 PASS，未发现问题。M7.2 已完成、被 Product Owner 接受，并通过 PR #22 合并。M7.3 已完成并通过 PR #23 合并，所有验证门（C3、C4、最终人工验收门）结果均为 PASS；产品硬化已全部完成。

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

V1 产品功能范围已全面冻结：
- 在 Feature Freeze 期间，不得向 V1 引入常规新功能、新题型、新练习分支或任何功能范围扩充。
- 若未来维护过程中发现缺陷确实需要扩大 V1 范围，必须作为 **Product Owner Hard Gate（产品负责人硬门禁）** 严格升级审批，严禁自主扩充。

## 冻结期策略（Frozen-Scope Policy）

在 Feature Freeze 与 maintenance hold 期间，允许的工程活动仅限于：
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

- 无。Milestone 7 产品硬化与 Milestone 8 候选版本验证均已全部完成并获得验收通过（PASS）。全部自动化、运行时与 Product Owner 人工验收门均通过，0 发布阻断缺陷。

## Hardening 进度

**M7.0 已完成；M7.1 已完成并被接受；M7.2 已完成并被 Product Owner 接受；M7.3 已完成、被 Product Owner 接受并已合并。**

Milestone 7 产品硬化已在 Feature Freeze 下全部完成。M7.2 与 PR #22 在 `e3d6a693c29d6be93848ffb652743f8919e17216` 合并；H-01 已 **RESOLVED**，C1/B4 已完成，C2 Human Acceptance 为 PASS。M7.3 已完成并通过 PR #23 合并至 `6e175df53a6abb7ea75d9415ff6640801cddbb0b`。其 Windows 11 与 Ubuntu C4 必须项均通过；修订合同下 macOS 明确为 DEFERRED / NOT VERIFIED。准备真实 C3 交接时发现并修复了一项受限缺陷：review-request 导出会静默丢弃 `learnerItemMarks`；公共导出 seam 现已保持完整 Learner Response。C3 与汇总最终 Human Gate 均为 PASS，因此 M7.3 与 Product Hardening 已全部完成。Milestone 8 候选版本验证已全部完成并通过验收。

### Milestone 7 Product Hardening 范围（V1 必须项）
- **翻译学习者元认知标记切换交互优化**：翻译练习中的标记交互优化（活动颜色切换按钮、再次点击取消标记、免弹窗内联切换）。
- **移动端/触屏工效学与原生对话框打磨**：针对历史清单、多按钮操作行和触屏视口上的确认工作流进行响应式微调，并将剩余的 `window.prompt()` / `window.confirm()` 替换为 Study Desk 模态弹窗。
- **翻译历史性能特征分析**：针对真实数据积累场景进行性能画像与回归测试。
- **全产品完整性验证**：解决 Review V3 验证差距 C1–C4（旧版本数据迁移安全测试、浏览器重启恢复验证、真实外部评阅往返、跨平台干净环境 Clone 验证）。

## 验证状态

- **292 项自动化单元/集成测试通过**（M7.2 接受基线 290 项，加 M7.3 review-request 保真与可复现 seed/request 回归）。既有题目注册、评分、schema、分类、媒体、备份、标记、批改、评阅、删除策略、runtime 与 Service Worker 合同继续全绿。
- **Pre-Freeze V1 Scope Closure (Batch A)**：客观做题反馈模式与专项练习信息架构已通过人工验证（Human Gate A = **PASS**）。
- **Pre-Freeze V1 Scope Closure (Batch B)**：试卷库分类组织与渐进式导航已通过人工验证（Human Gate B = **PASS**）。
- **Pre-Freeze V1 Scope Closure (Batch C)**：客观题多媒体支持已通过人工验证（Human Gate C = **PASS**）。
- **Whole-Product Feature Complete Review V3**：全产品完整性审查确认 0 阻断项并达成全票 PASS 结论（Review V3 = **PASS**）。
- **M7.1 Product Owner Human Acceptance**：整题标记、对话框、删除保护、响应式/窄屏、双语、分类删除与 Correction Workspace 等专项验证均未发现问题（Human Gate = **PASS**）。
- **M7.2 H-01 / C1**：损坏或不受支持的规范数据保持逐字节可恢复；恢复写入失败时阻止后续规范写入；优先级、中断升级、幂等、迁移后备份/导出及 M1–M6 代表性兼容均通过。
- **M7.2 B4**：记录的参考运行中，2,500 条响应索引由 173.47 / 181.46 ms 降至 6.05 / 6.39 ms（中位数/最差），仅使用一次性内存 Map；每层正确性一致。
- **M7.2 C2**：Objective `instant`/`submitAtEnd`、Translation 普通/Retry/Remediation 自动化恢复合同均通过；Product Owner 已在 Google Chrome 151.0.7922.173（Official Build，64-bit）中接受真实浏览器进程关闭/重开与强制终止/重开验证。Human Gate = **PASS**。
- **M7.3 C3**：隐私安全 seed backup 可在一次性 profile 中恢复精确 finalized 合成 response；随后已通过真实 Quiz Studio History UI 导出提交的请求，并保留答案、span annotation 与整题标记。独立外部新编写及 Product Owner 预览/确认/持久化/重开/再导出/拒绝验证 = **PASS**。
- **M7.3 C4**：干净 Windows 11 clone、`npm ci`、290/290 基线测试、规范 runtime 健康/重启、全新 Chrome 151 profile 与真实合成试卷导入/导出均通过；精确基线 Ubuntu CI 通过；macOS 为 **DEFERRED / NOT VERIFIED**。C4 总结 = **PASS**。
- **Milestone 8 RC1 验证**：在精确候选 tag `v1.0.0-rc.1`（提交 `f33bafcfe42ac8dd521466026c343102dc18897a`）上通过全部 292/292 自动化测试；代表性累积全量备份往返通过；干净 Windows 启动、浏览器矩阵冒烟、原生文件对话框、托管 HTTPS PWA 与已知局限性均获 Product Owner 验收通过（Milestone 8 = **PASS — ACCEPTED**）。

## 题目媒体支持规范（Batch C 范围定义）

- **V1 范围内（Pre-Freeze Batch C）**：全部 5 种客观题型（`单选`、`多选`、`填空`、`判断`、`匹配`）均可选同时包含图片和/或音频；图片支持放大/全屏查看；音频渲染为题目内嵌播放控制条。
- **V2 延迟范围**：单卷级音频播放策略（如快进/拖拽进度条限制、最大重听次数权限以及严格考试锁定策略）。

## 已知风险

- Quiz Library 规范恢复刻意保持为存储层合同，没有新增迁移管理 UI；保留的原始规范数据位于专用恢复键中，供诊断/恢复。
- GitHub Pages 部署保持延期且未激活；仓库可见性与 Pages 部署相互独立。
- ES module 应用不支持通过浏览器 `file://` 直接打开；用户必须使用本地静态服务器或 `start-local.bat`。
- Finalized Learner Response 使用浏览器本地存储且不被 history 静默截断；长期积累的大型 evidence 集合最终可能遇到浏览器容量限制。Translation 历史按设计同样没有条目数量上限，继承了这一风险。
- 外部 Teacher Review 与补救往返完全是手动的（导出一份文件、交给外部一方、导入他们返回的文件）；目前没有、也不计划做任何应用内 AI 集成。
- 学习者是否显示过隐藏的参考译文只记录在 active session 中，不会带入 finalized evidence；重新练习和补救材料的练习同样如此。
- 删除一条 Learner Response 会级联删除其 Teacher Review；目前没有单独保留批改内容、只删除作答记录的方式。这是 M6.7 的一项刻意设计选择（一条 review 的 `responseId` 链接必须始终可解析），而不是疏漏，但想要在删除作答记录后保留批改内容的用户，需要先导出该批改。
- 导出包内嵌的评阅请求/补救练习请求"task"指令文字是按语言固定的、用户不可编辑的字符串；它假设外部评阅者/agent 能理解一段纯文本的自然语言指令，这对某些非 LLM 的外部工具而言是一个合理但尚未验证的假设。

## 未知或未验证事项

### 已完成的 RC 验证（Milestone 8）
- 在现实长期使用状态下的代表性累积全量备份导出与导入往返（**PASS**）。
- 针对 Teacher Review 导入与补救 Translation Document 导入的操作系统原生文件选择器行为（**PASS**）。
- 跨浏览器冒烟与干净 Windows 运行时健康/重启（**PASS**）。
- 托管 HTTPS PWA 生命周期（**PASS**）。

### 可接受的已记录局限性
- 浏览器本地存储限制下的超大评阅请求/补救请求实用文件大小。

### 明确延期
- macOS 干净 clone/run 行为明确保持为 **DEFERRED / NOT VERIFIED**。

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

**V1 发布线：维护保留状态（当前无活跃 V1 工程里程碑）**

Quiz Studio V1 已完成版本 `1.0.0` 最终定版。已接受的候选版本 `v1.0.0-rc.1`（提交 `f33bafcfe42ac8dd521466026c343102dc18897a`）作为不可变验证基线保持不变，且无任何候选版本后的运行时代码修改。当前未安排任何 V1 工程里程碑。V1 的后续事项（如 GitHub Pages 部署或正式 GitHub Release）保持独立延期，仅在获得 Product Owner 明确授权后方可启动。

Quiz Studio V2 已 **通过 Desktop Architecture Gate**；正式 V2 开发分支 `v2` 已创建，**Desktop Foundation 已验收（ACCEPTED）**。上述 V1 发布线保持不变，仍是不可变的 `v1.0.0` 基线；V2 工作不会修改它。

V2 进展（以所链接文档为准，此处不改变其内容）：

- **产品范围冻结 Revision 1：已完成** —— [`V2_PRODUCT_SCOPE_FREEZE.md`](V2_PRODUCT_SCOPE_FREEZE.md)。
- **UI 架构冻结：已完成** —— [`docs/V2_UI_ARCHITECTURE_FREEZE.md`](docs/V2_UI_ARCHITECTURE_FREEZE.md)（已通过 Human Design Gate；已批准的设计输入已纳入 `docs/design-inputs/` 版本控制）。
- **V1 Migration Readiness Inventory：已完成** —— 已通过 Human Gate 并合入 `main`（[`docs/V2_MIGRATION_READINESS_INVENTORY.md`](docs/V2_MIGRATION_READINESS_INVENTORY.md)）。
- **Desktop Runtime & Application Data ADR 0001：已接受（ACCEPTED）** —— [`docs/adr/0001-desktop-runtime-and-application-data.md`](docs/adr/0001-desktop-runtime-and-application-data.md)（Tauri 2 + WebView2、Rust 持久化边界、SQLite、无损 JSON payload + projections、内容寻址媒体、统一 staging/activation/rollback、V2 archive）。spike 强制得出的修订 A1–A8 已并入；Electron fallback 未被触发。
- **Bounded desktop spike：已完成。** 在一次性的 `spike/desktop-runtime` 分支上执行（最终 HEAD `a79cea5c29d10f88c0a7f09c8a265a76dca17d23`，永不合并）；长期证据见 [`docs/adr/evidence/0001-desktop-spike-report.md`](docs/adr/evidence/0001-desktop-spike-report.md)，并配有已修订的 [spike contract](docs/adr/0001-appendix-desktop-spike-contract.md)。
- **Desktop Architecture Gate：已通过 —— GO WITH AMENDMENT**（Product Owner）。H2–H7 PASS；H1 为 CONDITIONAL，已带残余限制被接受（无 WebView2 Runtime 环境下的 `downloadBootstrapper` 实测、禁用网卡 + `pktmon` 运行均推迟）；H8 已由 Human Gate CANCELLED / RECLASSIFIED（其未完成的原生 Open 对话框、OS 拖放与 OneDrive 重定向的 Desktop/Documents 检查转入 Desktop Foundation / 打包验收）。
- **延续的 Typing 约束：** 第三方搜狗拼音 IME 在打包应用中不产生 composition 事件；未来 Typing 不得把 `compositionend` 作为唯一的已提交文本路径，必须兼容非 composing 的已提交输入 / `insertText`。这不会重新打开桌面架构。
- **Desktop Foundation：已验收（Human Gate PASS，2026-10-02）。** 在 `v2` 上实现： Tauri 2 + WebView2 外壳（单实例、严格 CSP、白名单 IPC、由 Rust 持有的原生对话框/拖放）、catalog 驱动的 SQLite store（Unit of Work 与 payload/projection 一致性）、内容寻址媒体、带 journal 恢复的统一 staging/activation/rollback 原语、V2 archive、稳定的身份/版本/数据根、按用户 NSIS 安装包。代码位于 [`desktop/`](desktop/README.md)；一次性 spike 代码未被复制。
- **验证（Windows CI，`windows-latest`，MSVC + 静态 CRT —— [运行记录](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37012332165)，全部步骤通过）：** fmt + clippy `-D warnings`；15 个 JS 测试；按 ADR 阈值运行的 Rust 套件 —— 500 次强制 kill 崩溃循环（0 违规）、activation 检查点矩阵 6 个检查点 × 2 模式 × 3 次 + 回滚中 kill（状态恒为 pre 或 post）、400 MiB 流式写入/归档/恢复（子进程峰值远低于 300 MiB 上限）、14 种命名 archive 篡改 + 300 次位翻转均在激活前被拒绝、5,000 个 JS↔Rust↔DB 保真向量（0 不一致）；应用二进制可复现（两次构建 SHA-256 相同）；发布二进制不含故障注入钩子；安装包为 `downloadBootstrapper` 模式；已安装 exe 冒烟（标识、自测、启动、单实例、应用进程无监听/无远程连接、强制结束后恢复）；同标识升级保留数据；静默卸载保留用户数据。
- **验收欠账（不阻塞的打包/手动欠账；保持开放，未标 PASS，未删除）：** D1 原生打开对话框自动化往返、D2 ≥ 1 GiB OS 拖放、D3 OneDrive 重定向桌面/文档、D4 无运行时 WebView2 的 `downloadBootstrapper`（仅静态证据）—— 手动步骤见 [`manual-qa/v2-desktop-foundation.zh-CN.md`](manual-qa/v2-desktop-foundation.zh-CN.md)。其他未决项：最终应用图标（目前为中性占位图标）、内置 CJK 字体（外壳使用系统字体，不引用网络资源）、代码签名与自动更新（范围外）。
- **V1 Migration ADR 0002：已验收 —— GO WITH AMENDMENT**（Human Gate，2026-10-02）—— [`docs/adr/0002-v1-to-v2-migration-architecture.md`](docs/adr/0002-v1-to-v2-migration-architecture.md)。仅文档，不存在迁移器或测试代码。决策：H-1 遇孤立 UTF-16 代理项阻断（不做 U+FFFD 替换）；H-2 仅追加的 `Merge(KeepExisting)`（不提供 Replace/覆盖）；H-3 迁移记录以 `migration_origin.offsetEncoding` 作为权威 UTF-16 标签，**取消**全局默认（native V2 含偏移的记录必须显式声明编码；无 origin 且无编码视为无效）；H-4 recovery artifact 随 V2 archive 保存（archive `formatVersion` 演进，旧格式保持可读）；H-5 定向反向 UoW 撤销（快照恢复仅作灾难路径）；H-6 twin/twin-divergent 对账表只能依据 V1 基线代码证据缩窄。修订：media 是特殊映射（C-4），`recovery_artifact` 不是 canonical 领域数据，P1 staging 副本是 TOCTOU 边界。
- **Learning Orchestration + Calendar 里程碑：已验收（Human Gate PASS）。** store schema 2 → 3（`context` catalog 角色；`schedule`、`schedule_exception`、`schedule_fulfillment`、`schedule_suggestion`、`session_selection`，带数据库级单一 active / 单一 pending / 单次履约约束、硬外键、`sched-*` 故障检查点），以及纯 JS/TS 领域层（`ScheduleStore`、occurrence 投影、Calendar/Today、planner v1、Evidence Readers、无分数且确定性的 Recommender、selection provenance、`completeSession` 接缝）。ADR 0003 §17 已自动化：对真实 Rust store 的所有权与竞态测试、重复规则/属性测试、零写入的 Due/Overdue、与证据同事务的原子履约、证据不可变、在真实迁移 store 上“未知不是负面证据”、逐字节相同的推荐、schema 封闭性、归档往返、2 → 3 升级，以及带随机杀进程的 `sched-*` 故障矩阵。记录、证据映射及供评审的实现澄清见 [`docs/V2_ORCHESTRATION.zh-CN.md`](docs/V2_ORCHESTRATION.zh-CN.md)。按设计没有产品 UI；M1–M7 与 D1–D4 仍 open、不阻塞。Windows Desktop CI：**全绿**，[run 37059517115](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37059517115)；会话完结写入契约修复之后：**全绿**，[run 37062816414](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37062816414)。
- **Task-Domain Integration 里程碑：已验收（Human Gate PASS）。** store schema 3 → 4（`typing_text` Content、不可变的 `typing_attempt` Evidence，只有软引用）；封闭的 Domain Evidence Adapter 注册表覆盖 Objective、Translation（V1 `learner_response` 不变，V2 会话事实放在带命名空间的 `extensions` 键）与 Typing，写入注册表由其推导且不同于 Reader 注册表；finalization 接缝经 adapter 校验并**从证据推导 slot**；`SessionFinalizer` 在不确定的崩溃之后仍幂等（证据 id 在会话开始时分配）；`typing-compare/1` 基于项目自有的 Unicode 16.0.0 表（CI 中运行官方一致性套件，不使用 ambient `Intl.Segmenter`/`normalize`）；Typing 会话引擎：单一 committed-text 输入路径、Practice/Test 不透明与恢复；Typing Reader（仅 `TYPING_ERRORS_REMAIN`，算法 v2，已证明无污染）以及**不做 Typing 自动排程**。ADR 0004 §13 已自动化：对真实 store 的三 domain finalization、封闭 adapter 边界、幂等崩溃恢复、每个 domain 的 `session-complete` 故障矩阵与随机杀进程、schema 3 → 4 / 归档 / 恢复、Unicode 与属性测试、IME 事件模型测试、用未改动的 V1 构造器验证 V1 保持不变。记录、证据映射与澄清：[`docs/V2_TASK_DOMAINS.zh-CN.md`](docs/V2_TASK_DOMAINS.zh-CN.md)。按设计没有产品 UI；手动项 M-T1–M-T4（真实 IME、长文本 UI、可访问性、WebView 烟测）与 M1-M7 / D1-D4 在该次验收时仍为 open（之后已在 Human Hardening Gate（2026-10-03）PO-PASS）。Human Gate HOLD 修复已应用（Objective/Translation adapter 已证明是未改动 V1 校验器与公开 JSON Schema 的子集；`typing-compare/1` 对齐改为带状限界，长篇基本正确的转录可以 finalize，结果不变）。验收 head `601b4cf` 的 Windows Desktop CI：**全绿**，[run 37078651808（attempt 2）](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37078651808)（attempt 1 由账户所有者中途取消，不是失败；更早 `a1e354f` 的运行失败仅因 workflow 没有安装锁定的 `ajv` 开发依赖，已在 `601b4cf` 修复）。仍然 open、未 PASS、未豁免：手动项 M-T1–M-T4（真实 IME、长文本 UI、可访问性、WebView 烟测）、M1-M7、D1-D4。
- **Objective Answer Explanation + Focused Practice 里程碑：`v2` 上已验收（Human Gate PASS）**（经一次 HOLD 修复）。 五种 Objective 题型都可带可选的文字 `explanation`，属于 Content（绝不是 Evidence；不改变判分、Reader、Scheduling，也不改 V1 / 公开 schema）；即时反馈只在该题判分之后显示正确答案 + 解析，整卷提交在提交前不泄露任何内容（引擎的 `view()` 是白名单；匹配题令牌不透明），已 finalize 的快照保留作答当时的解析。Objective、Translation（按 V1 语义的引擎、字素安全的标记、重做）与 Typing（接在真实 textarea 上的 committed-text 引擎；窗口化的实时比较；换行与活动位置跟随）共用一个 Focused Practice 界面，带安全退出 / 保存并离开 / 放弃与会话恢复，入口是一个临时的最小启动器。固定的 `typing-compare/1` 在应用启动时于真实 WebView 内执行，并由打包应用烟测断言。自动化证据：单元 + 集成套件，以及用可信 CDP 输入驱动 headless Edge 的 DOM 自检与真实 store 的应用自检（泄露、键盘、焦点、可访问性契约、长文本跟随、输入法组合不被计分、缩放、恢复）。**未 PASS 且未豁免：** WebView2 中真实的微软 / 第三方输入法、真人长文本阅读、Narrator / 高对比度（手动清单 [`manual-qa/v2-focused-practice.zh-CN.md`](manual-qa/v2-focused-practice.zh-CN.md)），以及 M1-M7 / D1-D4（之后均已在 Human Hardening Gate PO-PASS，2026-10-03）。**Human Gate 修复：** *保存并离开* / *放弃* 现在是必须成功的动作（只有恢复状态确实保存 / 清除成功后才关闭界面；失败时界面保持打开并显示持续错误，可重试）；需要图片 / 音频的 Objective 试卷 fail-closed（不可开始，引擎在开始 / 重做 / 恢复时拒绝，元数据不变）；真实的 Objective 图片 / 音频渲染是最终产品 UI 集成的**必须 carry-forward 项**。**M-T1a 与 M-T1c：通过**（Product Owner，2026-10-03，`77b259f` 的本地 release 构建；第三方输入法为搜狗；Product Owner 认定本地 release 构建已足够，无需 CI 打包安装包）。修复后候选版（head 77b259f）的 Windows Desktop CI：**绿色**，[run 37096529380](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37096529380)（a95a654 有一项应用自检失败，为恢复保存竞态，已在 77b259f 修复；此前候选版 b318938 为绿色，[run 37083868209](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37083868209)，现已被取代）。记录与证据映射：[`docs/V2_PRACTICE.zh-CN.md`](docs/V2_PRACTICE.zh-CN.md)。
- **ADR 0004 — Task-Domain Integration 与 Typing Evidence Contract：ACCEPTED — GO WITH AMENDMENT**（Human Gate 2026-10-02；仅文档；[ADR](docs/adr/0004-task-domain-integration-and-typing-evidence-contract.md)，记录见 §18）。一个 finalization 接缝 + 三个封闭的 Domain Evidence Adapter；Objective/Translation 继续使用未改动的 `learner_response`（V2 会话事实只放在带命名空间的 `extensions` 键）；新增 Evidence 集合 `typing_attempt`（不可变的抄写打字事实：逐字文本、对齐字素边界的 UTF-16 span、显式比较基准、不存任何指标）与最小 Content 集合 `typing_text`；封闭的 Evidence Source 注册表与会话写入注册表正式加入 `typing_attempt`；slot 由证据推导；幂等 finalization；Typing Reader（仅 `TYPING_ERRORS_REMAIN`）；打字错误永不等同于知识错误。**修订：**(A-1) `typing-compare/1` 是冻结的、项目自有的、固定 Unicode 版本的比较语义，不使用宿主环境的 `Intl.Segmenter`/`normalize`；已存事实与 `comparison.version` 保持权威，历史 attempt 的合法性不随宿主升级改变；(A-2) 所有 user-agent 提交的文本走同一条 committed-text 路径，不要求 keydown 或 composition 事件，可识别的 paste/drop 被拒绝，合成/应用自有的 DOM 变更不得进入该通道；(A-3) typing attempt 不会创建 engine-owned 排程（本版否决 D-9，保守选择），Typing 仍完整支持 Retry 与手动/重复排程。Task-Domain Integration 实现：已验收（见上方里程碑条目）。
- **ADR 0003 —— Learning Orchestration / Scheduling / Recommendation / Calendar 架构：ACCEPTED — GO WITH AMENDMENT**（Human Gate；修订见 ADR §22：Create 永不覆盖已占用的槽位；任何不同日期都是冲突、无最小差值；建议绑定 schedule revision 并被学习者的修改 superseded；occurrence 身份只有 `(scheduleId, originalDate)`）（[`docs/adr/0003-learning-orchestration-scheduling-recommendation-calendar.md`](docs/adr/0003-learning-orchestration-scheduling-recommendation-calendar.md)）。仅文档：所有权模型与“唯一活动排程”不变量、引擎/用户冲突作为持久化建议并以原子二选一决定、日期级重复规则（锚点/例外/仅此次 vs 此次及以后）、派生的 Due/Overdue 与履约、带封闭原因注册表且“未知不是负面证据”的派生可解释 Recommendation，以及供后续实现里程碑使用的自动化验证合约。已由 Learning Orchestration + Calendar 里程碑（见上）实现。
- **Final Product UI Integration 里程碑：`v2` 上已验收（Human Gate PASS，经首轮人工评测、Human Evaluation Repair 及其定向复测）。** 已批准的信息架构（今日、日历、资料库、证据历史、批改台、交换与备份、设置，加上共享的 Focused Practice 界面）在真实打包应用里用真实数据与真实操作运行，采用 Warm Paper · Living Ink，离线（系统字体、无 CDN），双语（zh-CN / en）。只做集成：Evidence、Scheduling、Recommendation 与 session 语义均未改变。今日按建议开始时保存当时展示的 Selection 与理由，日历使用已验收的投影与按 occurrence 身份的 `ScheduleStore` 操作，资料库是正式的内容入口（试卷、翻译文档、**跟打文本编辑**），历史 / 批改台显示并创建独立记录，交换对每次导入先预览。**carry-forward 已完成：** 客观题图片 / 音频通过新的 `media.read` / `media.put` pipeline 呈现，`MEDIA_UNSUPPORTED` 的 fail-closed 只对已证明可呈现的媒体解除；跟打文本编辑迁入资料库，临时启动器已移除。自动化证据：单元 + 集成套件、真实 store 之上 headless Edge 的自检（练习 84、学习回归 23、**产品 UI 140**），以及同一个产品**在真实打包的 exe 内**（真实 WebView2 + CSP + IPC，19 项检查）。**未 PASS 且未豁免：** 新增的手动项 M-U1–M-U8（[`manual-qa/v2-final-product-ui.zh-CN.md`](manual-qa/v2-final-product-ui.zh-CN.md)），以及 M-T1b/d/e、M-T2a–d、M-T3a–c、M1-M7、D1-D4（均已在 Human Hardening Gate PO-PASS，2026-10-03）；**已在 Human Gate 决定：** 正式接受系统字体栈（见 `docs/V2_UI_ARCHITECTURE_FREEZE.md` 的窄幅修订）。候选版的 Windows Desktop CI（CI-L2）：**全绿**，[run 37131774633](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37131774633)，head `837b07b`。此前几次失败只出在测试基础设施（产品自检里的时序竞争；托管机 WebView2 拒绝开放调试端口），均未改动产品代码即修复。托管机上“真实打包应用内的产品检查”记为**未运行（NOT RUN）**（开发机上 19/19）；CI 仍会启动并烟测打包应用。记录与证据映射：[`docs/V2_PRODUCT_UI.zh-CN.md`](docs/V2_PRODUCT_UI.zh-CN.md)。
- **Human Evaluation Repair 里程碑：`v2` 上已验收（定向人工复测 PASS）。** 针对首轮人工评测发现的一次有界修缮；不改动 Evidence / Scheduling / Recommendation / Task-Domain 契约、schema 或 session-facts。（1）客观题结果与证据历史共用得分横幅（全对为绿色并带克制的小花标记 / 90–99% 绿 / 70–89% 橙 / 低于 70% 红，绝不只靠颜色）和分层的逐题卡片；仅为展示，不存储。（2）资料库行与详情显示由事实推导的状态：未开始 / 进行中 / 已练习，不是掌握度，也不持久化。（3）客观题试卷在主工作区编辑：单题卡片 + 导航栏 + 跳转 + 上一题/下一题 + 显式排序。（4）跟打完成页与历史显示推导的用时（无速度或得分）。（5）Rust 持有的物理音效偏好现已真正控制练习中的声音（翻页 / 笔触 / 盖章；绝不逐键发声）。（6）客观题可选的单次“打乱题目顺序”（默认关闭；以实际快照顺序为记录）。记录：[`docs/V2_HUMAN_EVAL_REPAIR.md`](docs/V2_HUMAN_EVAL_REPAIR.md)。自动化：新增单元测试、真实存储集成测试，练习自测 93、产品 UI 自测 158。声音的真实听感仍为人工检查项。候选版 CI-L2（Windows Desktop）：**绿色**，[run 37155144502](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37155144502)，head `32f5ead`。此前两次失败仅出在自测基础设施（读取 DevToolsActivePort 与浏览器自身写入竞争；慢速运行器上在练习结果渲染前就点击），均未改动产品代码即修复。
- **V1 Migration 里程碑：已验收（Human Gate PASS）。** 已在 `v2` 上实现（范围与证据见里程碑记录）。 `qs-migrate-v1`（无损 reader、检测优先级、带 `migration_origin` 来源的逐字携带映射、历史 twin/divergent/legacy-only 分类、媒体与 recovery artifact、staging/预览/确认、带提交守卫的追加式激活、幂等、撤销、独立的守恒验证器），加上 ADR 0002 第 15 节的 foundation 扩展与最小的原生/WebView 流程。ADR 0002 第 16 节已自动化：检测表、覆盖全部阻断代码的 40+5 个阻断 fixture、15 类突变击杀套件、V1 差分与 JS 规范化 oracle、重复/撤销/竞态测试、kill 矩阵 + 随机 kill + 撤销中 kill、400 MiB 内存包络（本地峰值 10.3 MiB）。记录、证据映射及供评审的实现澄清见 [`docs/V2_MIGRATION.zh-CN.md`](docs/V2_MIGRATION.zh-CN.md)。**Human Gate HOLD 收口已实现**（ADR 0002 第 21 节：已迁移 source 事后提供 artifact 时只保存 artifact、不重新迁移；删除所有权与历史 `disposition` 分离；守恒合约区分 direct-verbatim / 结构性 / media 三类映射），已复审并**验收（Human Gate PASS）**。收口的 Windows Desktop CI：**全绿**，[run 37039302072](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37039302072)（HOLD 之前的实现已全绿：[run 37034644764](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37034644764)）。未决：手动打包检查 M1–M7（[`manual-qa/v2-migration.zh-CN.md`](manual-qa/v2-migration.zh-CN.md)）与 D1–D4，均不阻塞。

**Human Gate HOLD / 修复：** Human Gate 发现原始文件系统路径进入了 WebView（绝对数据根、绝对媒体路径、WebView 可调用的 `media.gc`）。已在限定范围内修复：响应不含路径、`media.gc` 移出 WebView 白名单（仅 Rust 以固定策略执行 GC）、删除 `verifyBackup(path)`、移除 asset protocol 与预览、新增回归测试；ADR 0001 第 7 节现明确升级失败拒绝运行为已接受行为，第 15 节标记为已接受。D1–D4 仍为未执行的验收欠账。

**跟进修复（保真）：** 第一次修复的整体路径 scrub 会改写 `store.read` payload 中用户写入的、形似路径的文本。WebView 边界现为结构化契约：系统结果按构造无路径，规范/用户内容永不改写，只清洗失败诊断信息（`error.message`，覆盖含空格 Windows、UNC/verbatim 与 Unix 路径）；回归测试同时证明无损往返与无泄露。

- **整体产品功能关口（Whole Product Feature Gate）：PASS —— Quiz Studio V2 正式 FEATURE COMPLETE 并冻结**（产品负责人 / Verifier，2026-10-03；记录：[`docs/V2_WHOLE_PRODUCT_FEATURE_GATE.md`](docs/V2_WHOLE_PRODUCT_FEATURE_GATE.md)）。Scope Freeze 的各核心系统均已实现；首轮人工评测、修缮及定向复测均已通过。其余手动 / 打包 / 迁移项属于 **Product Hardening / RC 证据欠账，而不是功能欠账**，保持 OPEN（未 PASS，未豁免）。**Feature Freeze：** 从此不得因便利、审美或新想法增加产品功能；只有真实的发布阻断项（数据完整性、安全、迁移 / 升级、无障碍，或已冻结工作流无法使用）才能重新打开具体范围。正式接受系统字体栈；最终应用图标与发布版本号转为 RC 验收项。

- **Product Hardening：PASS —— 已验收 / 完成**（产品负责人 Human Hardening Gate PASS，2026-10-03；2026-10-03 获授权；记录：[`docs/V2_HARDENING.md`](docs/V2_HARDENING.md)；权威清单：[`HARDENING_BACKLOG.md`](HARDENING_BACKLOG.md)；产品负责人手动验收包：[`manual-qa/v2-hardening-pack.md`](manual-qa/v2-hardening-pack.md)）。清单已与真实检查表对账，并包含 **D5（交互式卸载）**。本地自动化各通道通过（Rust 186、JS 235、集成 95、practice 93、app 23、product 158；fmt 与 clippy 干净）；开发机打包检查 19/19，启动冒烟通过；托管运行器上的打包 DevTools 检查仍为 **NOT RUN**。**PH 候选 CI-L2（Windows Desktop）：绿色，[run 37172021453](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37172021453)，head `4c04181`**，所有步骤通过，包括 NSIS 基础 + 升级安装包与 Package acceptance；此前的 run 37168470932 在 product UI 自测处失败（测试竞态，未改产品代码即修复），其后的步骤是 SKIPPED，不是 PASS。托管机上的打包 DevTools 检查为 **NOT RUN**（开发机 19/19）。未发现产品缺陷；观察项 F1（大历史读取成本）与 F2（导出原地写入）作为已知观察项带入 RC，未被解决。未新增功能、字体、签名或自动更新；RC 未开始。

- **Human Hardening Gate：PASS（产品负责人，2026-10-03）。** 整个 Human Hardening Pack 已执行：**D1–D5、M1–M7、M-T1b/d/e、M-T2a–d、M-T3a–c、M-U1–M-U8 与 S1 均为 PO-PASS**（M-T1a、M-T1c 保留此前的 PO-PASS）。**P1**（托管运行器上打包 WebView2 的 DevTools 深度检查）严格保持 **NOT RUN on hosted CI**；开发机 19/19 为 **DEV-PASS**。候选：head `4c04181`，CI-L2 [run 37172021453](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37172021453)。保留的已知 RC 观察项：**F1** 大历史读取成本，**F2** 导出原地写入。最终应用图标与发布版本号仍是 RC 验收项；为此没有改动任何东西（未改版本、图标、tag、`main`、Release、签名或自动更新）。

- **Release Candidate：已验收 —— Human RC Gate PASS（产品负责人）。** 已记录 Gate 层面的 PASS；逐项 R1–R10 的详细结果未提供给本记录，因此没有编造任何一项。RC 证据：运行时提交 `cec737b`，确切 HEAD 的 CI-L3 [run 37176744235](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37176744235)（绿色），安装包 `quiz-studio_2.0.0-rc.1_x64-setup.exe` 的 SHA-256 为 `34FE8E4DD189DB6281104C9D0EDE7B6178E1EA10A39A2243AE948E43774F052F`，最终图标 Concept A“Ink-tail Q”（产品负责人批准）。记录：[`docs/V2_RELEASE_CANDIDATE.md`](docs/V2_RELEASE_CANDIDATE.md)。
- **Quiz Studio V2 `2.0.0`：已发布 / 维护中。** GA 就是被验收的 RC，仅改动了发布标识（`2.0.0-rc.1` → `2.0.0`）和面向发布的文档；没有任何行为、schema、界面、Evidence、调度、迁移、图标、签名或自动更新的改动。它由自己的确切 HEAD 的 Desktop CI-L3 运行构建并验证（安装包 `quiz-studio_2.0.0_x64-setup.exe`），`main`、带注释的 tag `v2.0.0` 与 GitHub Release `v2.0.0` 都指向同一个提交；该提交、CI 运行以及安装包 / 可执行文件的 SHA-256 公布在 Release 页面及其校验文件中。Product Hardening 已完成；Feature Freeze 继续有效。**`2.0.0` 已接受的已知限制：** F1（大历史读取成本）与 F2（导出原地写入所选文件）。托管运行器上打包 WebView2 的 DevTools 深度检查：**NOT RUN**（开发机 19/19 = DEV-PASS）。安装包未签名、不会自动更新；Windows 是经过验证的平台，macOS 未验证。V1 的 `v1.0.0` 发布及其 tag 保持不变；溯源 tag `v2.0.0-rc.1` 标记被验收的 RC 运行时提交。

**下一步行动：无 —— Quiz Studio V2 `2.0.0` 进入维护。** V2.1 工作、维护修复、代码签名、自动更新、macOS 工作以及任何新功能，都需要产品负责人另行授权。

保留的延期边界：macOS 环境保持 **DEFERRED / NOT VERIFIED**。

## 仓库状态

- 默认分支：`main`
- 远程仓库：`origin`
- 仓库生命周期状态：V1 最终定版 / 维护冻结状态 (V1 Finalized / Maintenance Hold) + V2（`v2` 分支）：Desktop Foundation 已验收，ADR 0002 已验收，V1 Migration 里程碑已验收，ADR 0003 已验收，Learning Orchestration + Calendar 里程碑已验收，ADR 0004 已验收，Task-Domain Integration 里程碑已验收
- V2 开发分支：`v2`（自 `main@8eb6608`；已推送；长期分支；无指向 `main` 的 PR）
- 最终发布版本号：`1.0.0`
- 已接受候选版本 Tag：`v1.0.0-rc.1`（指向不可变提交 `f33bafcfe42ac8dd521466026c343102dc18897a`）
- 提交与合并追踪：请查阅 Git 历史以获取 `main` 提交身份与 PR 合并记录
- 当前文档版本：包含本状态文件的提交；请使用 Git 历史获取其不可变标识符
- 发布状态：请参考 GitHub Releases 页面以获取已发布分发状态
