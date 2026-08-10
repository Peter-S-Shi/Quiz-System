# Open Teaching Interchange 架构

Open Teaching Interchange 是 Quiz Studio 的横向、本地优先基础设施，使应用可以通过可移植的结构化数据与外部人类教师、语言模型和 agent 协作。

它不是与 Translation Practice 并列的第二个独立学习产品。Translation Practice 仍是 Milestone 6 的主要新增学习工作流，并将成为这套基础设施的第一个完整 rich-response consumer。Open Teaching Interchange 同时服务现有 Objective Quiz 流程。

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

分配给学习者练习的材料，例如 Quiz Paper 或未来的 Translation Document。

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

M6.0 contract 刻意不定义完整的 rich annotation 或 revision 语言；这些语义由 M6.4 和 M6.5 负责。当前校验边界会拒绝未知或试图携带受保护 evidence 的顶层字段。

Reviewer metadata 可以匿名或使用合成身份。支持的 actor 类型为 `anonymous`、`human`、`external-ai`、`agent` 和 `system`；不要求真实姓名、邮箱或账号标识。

### Remediation Material

根据既有学习证据生成的后续材料。适用时应复用现有学习材料格式。补救 Quiz Paper 可以通过 `purpose`、`sourceResponseId` 和 `sourceReviewId` 等 provenance 字段保留来源，无需建立独立练习引擎。

## 可移植 Contract

- `schemas/quiz-paper.schema.json` 支持可选、追加式 provenance。
- `schemas/learner-response.schema.json` 定义 finalized learner evidence。
- `schemas/teacher-review.schema.json` 定义追加式教师反馈。
- `examples/` 提供供外部工具和教师使用的合成示例。

所有 contract 使用 `schemaVersion`、适用时的 `documentType`、稳定 ID 和追加式扩展边界。原始 HTML 不是 canonical review data。

## M6.0 中的 Objective Quiz 行为

Objective Quiz 完成时，会先生成独立 Learner Response，再最终确认本次完成。如果浏览器存储无法保存该记录，练习仍保持可恢复状态，并显示失败提示。

用户可以从结果页或已关联的近期历史记录中导出 Learner Response。完整试卷库备份包含 Learner Response。缺少新集合的旧备份仍可读取，并且不会静默删除现有 learner evidence。

清空某套试卷的历史记录前必须确认；确认后会明确删除成绩摘要和该试卷对应的 Learner Response。

## M6.0 中的 Teacher Review 边界

M6.0 提供 Teacher Review 的 schema、标准化和校验函数，但不提供 Teacher Review 导入界面，也不渲染外部批改。后续里程碑将沿用受保护 response 边界，实现带预览和确认的 review 导入。

## 后续 M6 工作

- Translation 文件夹、文档、持久化与练习 UI。
- 学习者 `unknown`、`uncertain`、`should_know` span 标记。
- Rich annotation/revision 语义和 UI。
- 完整 Teacher Review 上传、预览、确认、存储与渲染。
- 外部 remediation 往返 UI 和 Translation history 整合。

M6.0 不包含内置 AI API、provider 配置或自动 AI 判分。
