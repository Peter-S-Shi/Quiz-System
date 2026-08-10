# Translation 领域模型与持久化

Milestone 6.1 为 Translation Practice 建立数据基础，但不加入 Translation Library 或练习 UI。

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

## 延后范围

Translation Library UI、材料导入/导出 UI、练习 session、学习者标记、rich correction、Teacher Review 往返、remediation UI 和 AI 集成都属于后续 M6 工作。
