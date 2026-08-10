# Translation 领域模型与持久化

Milestone 6.1 为 Translation Practice 建立了数据基础。Milestone 6.2 在此基础上加入了第一个面向用户的消费者：Translation Library 工作区，包含文件夹/文档/条目管理和材料导入导出。Milestone 6.3 加入了 Translation Practice 练习 session 本身：基于主动回忆的练习、session 恢复，以及生成非客观 Learner Response 的 finalization。

## 聚合模型

```text
Translation Library
|- Translation Folder
`- Translation Document
   `- 有序 Translation Items
```

### Translation Folder

Folder 包含稳定 `id`、面向用户的 `name` 和 `createdAt` / `updatedAt` 元数据。Document 通过 `folderId` 关联 folder。

### Translation Document

Document 是由 `quiz-studio.translation-document` 标识的一等学习材料。它包含稳定 ID、标题、folder 关系、通用源语言和目标语言标识、时间戳、有序 items，以及可选 provenance 或 extensions。

### Translation Item

Item 包含稳定 ID、源文本和确定性的零起始 position。`referenceTranslation` 与 `notes` 均为可选字段。参考译文只是参考材料，不是唯一正确答案；领域模型不包含精确字符串判分逻辑。

## 完整性规则

- Folder、document 和 item ID 必须在各自适用范围内唯一。
- 每个 document 必须关联一个现有 folder。
- Item position 会被规范化为连续、确定的顺序。
- 存储数据统一在 `parseTranslationLibrary()` 边界规范化并校验。
- 删除非空 folder 时，除非调用方明确要求 cascade，否则操作会被拒绝。
- 显式 cascade 会一次性删除 folder、其 documents 及内嵌 items，避免产生孤儿数据。
- 领域操作与 DOM 解耦，并返回新的规范化 library 值。

## 持久化与备份

浏览器存储 key 为 `quiz-studio-translation-library-v1`。系统复用现有 JSON 存储边界，不引入 backend 或平行数据库。

新版完整备份包含 `translationLibrary`。缺少该字段的旧备份仍可读取；恢复时，字段缺失不会覆盖已有 Translation 数据。

## Learner Response 兼容

通用 Learner Response contract 现在按材料类型应用客观判分字段：

- `quiz-paper` response 仍要求逐项 `result`、`correctCount` 和 `percent`。
- 未来 `translation-document` response 可以只用 `itemCount` 保存书面答案。

这是向后兼容的追加式放宽。现有 Objective Quiz response 文件仍然有效，finalized evidence 继续受到保护，后续 Teacher Review 仍可通过 response ID 关联。M6.1 不在 UI 中创建 Translation session 或 finalized Translation response。

## 公开 Contract

- `schemas/translation-document.schema.json`
- `examples/sample-translation-document.json`

该 contract 具有版本、使用稳定 ID、支持通用语言、不含 raw HTML，并且不依赖特定 AI provider。

## Library、导入与导出（M6.2）

Milestone 6.2 的 Translation Library 工作区完全构建在 M6.1 领域函数之上，不引入并行存储表示，也不新增 schema 版本。

`src/core/translation-import.js` 提供与 DOM 解耦、可单独测试的解析与安全性辅助函数：

- 仅原文批量导入：每个非空行对应一个 Translation Item。
- 双语批量导入：`原文<Tab>参考译文` 格式的行；任何格式不完整的行都会被记录为校验错误，而不是被静默丢弃或静默导入。
- 可移植 Translation Document JSON 导入：独立于任何本地文件夹进行校验，因此外部作者撰写的文档可以在不知道本地文件夹 ID 的情况下，被分配给用户选择的本地文件夹。文档自带的 `folderId` 仅用于结构校验，在持久化时会被用户选择的文件夹覆盖。
- 重复的 document ID 默认会被拒绝。用户明确选择以副本方式导入时，会在调用同一个具备关系安全保护的 `createTranslationDocument` 之前，重新分配 document ID 和全部 item ID，因此冲突策略由与其他写操作相同的领域层强制执行。

三种导入路径都遵循 输入 -> 解析 -> 校验 -> 预览 -> 确认 -> 持久化 流程。预览和校验不会修改已存储的 library；只有明确的确认操作才会调用 M6.1 领域函数。导入失败或取消都不会改变现有 Translation Library 数据。

导出直接使用 `getTranslationDocument()`，因此导出的文件与系统内部使用、并可在重新导入时被接受的规范化、符合 schema 的形状完全一致。

## 练习与 Session 恢复（M6.3）

Milestone 6.3 在 `src/core/translation-session.js` 中加入第一个 Translation Practice 练习工作流，与 Translation Library 和 Objective Quiz 相互独立。

- `createTranslationSession()` 会在练习开始的那一刻对文档条目做快照。此后 session 不会再读取实时文档，因此后续对源文档的编辑、重排、移动，乃至删除，都不能改写学习者正在或已经练习过的内容。
- 答案和可选的参考译文显示状态都以稳定的 Translation Item ID 为键，与条目位置无关，并且能在经过 `normalizeTranslationSession()` 的 `JSON.stringify`/`parse` 往返后保持一致；该函数对结构无效的数据会归一化为 `null`，而不是抛出异常。
- active session 使用独立的存储 key（`quiz-studio-translation-active-session-v1`），与 Objective Quiz 的 active session 完全隔离，因此即使两者同时未完成，也不会互相静默覆盖。
- 完成 session 时会调用 `interchange.js` 中的 `createTranslationLearnerResponse()`，生成 `material.type` 为 `"translation-document"` 的 finalized Learner Response。它会为快照中的每一条条目提供 `answer`（默认为空字符串），因此即使练习未完成，也满足 interchange contract 对完整覆盖的要求，并且不会设置 `result`、`correctCount` 或 `percent`。
- 只有在 Learner Response 成功写入后，active session 才会被清空；因此 finalization 过程中的存储失败会保留可恢复的 session，而不会静默丢弃学习者的作答。
- 对同一文档重复练习会生成新的 session ID 和新的 Learner Response ID；现有的幂等/不可变 `upsertLearnerResponse()` 写入路径保证此前已完成的证据不会被覆盖。

## 延后范围

学习者选段标记、`unknown / uncertain / should_know` 分类、rich correction、Teacher Review 往返、remediation UI 和 AI 集成都属于后续 M6 工作。
