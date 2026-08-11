# Open Teaching Interchange 架构

Open Teaching Interchange 是 Quiz Studio 的横向、本地优先基础设施，使应用可以通过可移植的结构化数据与外部人类教师、语言模型和 agent 协作。

它不是与 Translation Practice 并列的第二个独立学习产品。Translation Practice 仍是 Milestone 6 的主要新增学习工作流，从 M6.6 起已成为这套基础设施第一个完整的 rich-response consumer，包含完整的外部评阅和补救练习往返。Open Teaching Interchange 同时服务现有 Objective Quiz 流程。

## 产品原则

```text
External Authoring
-> Learner Practice
-> Learner Response
-> External Review
-> Remediation
-> Learner Practice Again
```

系统遵循“AI-native，API-optional”。这些流程使用本地 JSON 文件，不要求内置 AI provider、API key、付费模型、账号或网络连接。

## 领域边界

### Learning Material

分配给学习者练习的材料，例如 Quiz Paper 或 Translation Document。

### Learner Response

学习者已提交内容的最终、版本化记录。对于 Objective Quiz，它包含：

- 稳定的 response、session、material 和 item 标识；
- 本次作答所见题目的快照；
- 原始提交答案；
- 判分快照和成绩摘要；
- 时间与 provenance。

Learner Response 与轻量 history 列表独立存储。history 列表可以只保留近期摘要，但不会因此静默截断 finalized Learner Response。

应用代码把 finalized evidence 视为受保护内容：后续 review 不能替换原始材料快照或提交答案。这是应用层不可变规则，不代表密码学意义上的防篡改保证。

### Teacher Review

Teacher Review 是通过 `responseId` 关联 Learner Response 的独立版本化 artifact。它可以包含 reviewer 新增的判断、评论、标签、建议修订、总结、补救建议和版本化扩展。

M6.0 contract 最初刻意不定义完整的 rich annotation 或 revision 语言。M6.4 增加了学习者主动控制的元认知标记（Learner Response 上的 `learnerAnnotations`），M6.5 增加了 `DEVELOPER_GUIDE.zh-CN.md` 中描述的 rich correction / revision 语言（Teacher Review 上的 `itemReviews[].corrections`）。当前校验边界会拒绝未知或试图携带受保护 evidence 的顶层字段。

Reviewer metadata 可以匿名或使用合成身份。支持的 actor 类型为 `anonymous`、`human`、`external-ai`、`agent` 和 `system`；不要求真实姓名、邮箱或账号标识。

### Remediation Material

根据既有学习证据生成的后续材料。适用时应复用现有学习材料格式。补救 Quiz Paper 可以通过 `purpose`、`sourceResponseId` 和 `sourceReviewId` 等 provenance 字段保留来源，无需建立独立练习引擎。

M6.6 针对 Translation 具体落地了这一点：补救翻译文档就是一份普通的 `quiz-studio.translation-document`，额外带有一个增量的 `provenance` 字段块（`purpose: "remediation"`、`sourceResponseId`、`sourceReviewId`、`sourceMaterialId`、`createdAt`、`author`）。专用导入边界要求这些用途声明和元数据，并在持久化前针对本地 Learner Response/Teacher Review 记录交叉校验引用；普通 M6.2 翻译文档导入保持不变。练习补救材料时会把同一份 provenance 带入产生的 Learner Response，因此即使之后删除了补救文档，溯源链路依然完好。

### 传输信封（M6.6）

两种小巧的、带版本号的信封负责把规范 evidence 传给外部一方、再接收回来，同时不会成为第二个真源：`quiz-studio.review-request`（一份 finalized Learner Response，加上对预期 Teacher Review 输出契约的说明）和 `quiz-studio.remediation-request`（一份 Learner Response 和一条 Teacher Review，加上对预期补救翻译文档输出契约的说明）。两者都嵌入规范对象的忠实可移植副本，只作为导出/导入用的临时产物存在——绝不会作为规范学习记录被持久化。具体实现（`src/core/review-transport.js`）见 `DEVELOPER_GUIDE.zh-CN.md`。

## 可移植 Contract

- `schemas/quiz-paper.schema.json` 支持可选、追加式 provenance。
- `schemas/learner-response.schema.json` 定义 finalized learner evidence。
- `schemas/teacher-review.schema.json` 定义追加式教师反馈，包含 M6.5 的 rich correction 扩展。
- `schemas/translation-document.schema.json` 定义 Translation 材料，包含追加式的补救 `provenance` 字段块。
- `schemas/review-request.schema.json` 和 `schemas/remediation-request.schema.json`（M6.6）定义外部传输信封。
- `examples/` 提供供外部工具和教师使用的合成示例，包含一条完整的 M6.6 往返 fixture 链。

所有 contract 使用 `schemaVersion`、适用时的 `documentType`、稳定 ID 和追加式扩展边界。原始 HTML 不是 canonical review data。

## M6.0 中的 Objective Quiz 行为

Objective Quiz 完成时，会先生成独立 Learner Response，再最终确认本次完成。如果浏览器存储无法保存该记录，练习仍保持可恢复状态，并显示失败提示。

用户可以从结果页或已关联的近期历史记录中导出 Learner Response。完整试卷库备份包含 Learner Response。缺少新集合的旧备份仍可读取，并且不会静默删除现有 learner evidence。

清空某套试卷的历史记录前必须确认；确认后会明确删除成绩摘要和该试卷对应的 Learner Response。

## M6.0 中的 Teacher Review 边界

M6.0 提供了 Teacher Review 的 schema、标准化和校验函数，但没有提供 Teacher Review 导入界面，也不渲染外部批改。M6.6 补齐了这一点：新增了 `DEVELOPER_GUIDE.zh-CN.md` 中描述的 Teacher Review 上传/预览/确认/存储/渲染流程，并复用同一套受保护 response 校验边界来处理带预览和确认的 review 导入。

## 历史、重新练习与溯源（M6.7）

M6.7 把互通循环变成一段可长期查阅、可导航的历史，而不再只是一次性的界面。Translation 历史（`src/core/translation-history.js`）派生自上面描述的同一批规范 Learner Response 和 Teacher Review 集合——它是索引/导航层，绝不是第二个真源，并且在原始的实时翻译文档被删除后依然完全可用。

M6.7 在 `"remediation"` 之外新增了第二种独立的 provenance 用途：`"retry"`（重新练习）。无论是整份重新练习、选定条目重新练习，还是自动选中需要加强条目的重新练习，都会产生新的、独立的证据，拥有自己的稳定 ID；绝不会重新打开或覆盖被重新练习的那条历史记录。`resolveResponseLineage()` 会双向回溯：向后沿 `sourceResponseId`/`sourceReviewId` 找到这条 response 的来源，向前找到由它派生出的任何重新练习或补救记录；如果来源的 response 或 reviewer 已经被删除，会被明确标注为不可用，而不是崩溃或悄悄丢弃这层关系。

M6.7 还首次让删除语义变得明确：删除一条 Learner Response 会级联删除它的 Teacher Review（一条必须始终可解析的受保护链接），但绝不会级联删除由它派生出的记录；删除一条 Teacher Review 绝不会修改它所针对的 Learner Response。完整的依赖分析与存储治理细节见 `DEVELOPER_GUIDE.zh-CN.md`。

## M6.7 之后仍推迟的工作

M6.0 到 M6.7 已经交付了上面描述的完整往返，外加持久历史、重新练习、溯源和删除安全。M6.0-M6.7 均不包含内置 AI API、provider 配置或自动 AI 判分。仍然明确排除在范围之外的：更高级的历史分析或搜索、图形化的溯源可视化、云同步或账号系统，以及任何 M7 Product Hardening 或 M8 Release Candidate 的工作。
