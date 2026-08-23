# 项目状态

## 当前阶段

V1 最终定版 / 维护冻结状态 (V1 Finalized / Maintenance Hold)

## 当前活跃里程碑

无

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

**维护保留状态（当前无活跃工程里程碑）**

Quiz Studio V1 已完成版本 `1.0.0` 最终定版。已接受的候选版本 `v1.0.0-rc.1`（提交 `f33bafcfe42ac8dd521466026c343102dc18897a`）作为不可变验证基线保持不变，且无任何候选版本后的运行时代码修改。当前未安排任何活跃工程里程碑。

未来任何工作（如 GitHub Pages 部署、桌面应用打包或下一版本规划）均保持独立延期，仅在获得 Product Owner 明确授权后方可启动。

保留的延期边界：macOS 环境保持 **DEFERRED / NOT VERIFIED**。

## 仓库状态

- 默认分支：`main`
- 远程仓库：`origin`
- 仓库生命周期状态：V1 最终定版 / 维护冻结状态 (V1 Finalized / Maintenance Hold)
- 最终发布版本号：`1.0.0`
- 已接受候选版本 Tag：`v1.0.0-rc.1`（指向不可变提交 `f33bafcfe42ac8dd521466026c343102dc18897a`）
- 提交与合并追踪：请查阅 Git 历史以获取 `main` 提交身份与 PR 合并记录
- 当前文档版本：包含本状态文件的提交；请使用 Git 历史获取其不可变标识符
- 发布状态：请参考 GitHub Releases 页面以获取已发布分发状态
