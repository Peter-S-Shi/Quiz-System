# 开发指南

Quiz Studio 是一个静态 ES module 应用。

## 架构

- `src/app.js`：UI 渲染、事件绑定、多语言和浏览器工作流。
- `src/core/question-registry.js`：题型注册、创建、标准化、就绪校验、答案完整性和练习题准备。
- `src/core/grading.js`：判分和答案格式化。
- `src/core/interchange.js`：版本化 Learner Response、Teacher Review、actor、provenance 和校验 contract。
- `src/core/learning-records.js`：独立 Learner Response 集合操作，不受 history 截断影响。
- `src/core/backup.js`：经过校验的试卷库备份组合和向后兼容恢复解析。
- `src/core/translation-domain.js`：Translation Folder、Document、有序 Item 模型、校验和不可变核心操作。
- `src/core/translation-import.js`：与 DOM 解耦的解析逻辑，覆盖仅原文/双语批量导入、可移植 JSON 导入校验，以及 Translation Library UI 的 document ID 冲突处理。
- `src/core/translation-session.js`：与 DOM 解耦的 Translation Practice session 模型——在 session 开始时对文档条目做快照、逐条目答案和可选参考译文显示状态、导航，以及对格式错误的已保存 session 的安全拒绝。
- `src/core/migrations.js`：schema 版本和数据标准化。
- `src/storage/local-storage.js`：浏览器本地存储边界。
- `schemas/`：公开 Quiz Paper、Learner Response 和 Teacher Review JSON Schema。
- `examples/`：合成 Quiz Paper 和教学交换示例。
- `docs/OPEN_TEACHING_INTERCHANGE.zh-CN.md`：M6.0 架构与范围边界。
- `docs/TRANSLATION_DOMAIN.zh-CN.md`：M6.1 Translation 领域、持久化与兼容边界。

## 学习证据

Objective Quiz 完成时，会在清除活动 session 前建立 finalized Learner Response。它保存本次题目快照、原始提交答案、判分快照、稳定 ID、时间和 provenance。

轻量 history 数组继续为界面显示和错题流程保留条数上限。Learner Response 使用独立存储 key，不会被该上限静默删除。完整备份同时包含两个集合。

Teacher Review 校验只接受追加式 review 字段，并拒绝未知顶层字段、不匹配的 response ID 和未知 item ID。Rich correction 语义和 review 导入 UI 仍属于后续 M6 工作。

## Translation Library

`src/app.js` 中的 Translation Library UI 是与编辑、做题并列的第三个顶层模式。它直接基于 `translation-domain.js` 的操作渲染文件夹和文档管理，不会重复维护一份状态；每次修改都经过与自动化测试相同的不可变核心函数。

批量导入和 JSON 导入都遵循 输入 -> 解析 -> 校验 -> 预览 -> 确认 -> 持久化 流程。解析和校验逻辑位于 `translation-import.js`，因此可以在没有 DOM 的情况下测试。UI 只为预览构建一个草稿对象，只有在确认时才调用 `createTranslationDocument()`，因此被取消或无效的导入不会触碰已存储数据。

## Translation Practice Session

Translation Practice session 会在调用 `createTranslationSession()`（`translation-session.js`）时对目标文档的条目做快照。之后对该翻译文档的实时编辑不会改写正在进行或已经完成的 session，因为 session 携带的是它开始时的独立条目副本。

active session 使用与 Objective Quiz active session 不同的存储 key（`quiz-studio-translation-active-session-v1` 与 `quiz-studio-active-session-v1`），因此即使两者同时存在未完成的 session，也不会互相静默覆盖。`normalizeTranslationSession()` 会把格式错误的已保存数据直接归一化为 `null`，UI 将其视为"没有未完成 session"，而不是让恢复流程崩溃。

完成 session 时会调用 `interchange.js` 中的 `createTranslationLearnerResponse()` 生成一份 finalized 的非客观 Learner Response——不会设置 `result`、`correctCount` 或 `percent`。该 response 会先经过现有的幂等/不可变写入路径 `upsertLearnerResponse()` 持久化，然后才清空 active session 存储 key；因此 finalization 过程中出现的存储失败会保留可恢复的 active session，而不会静默丢失学习者的作答。

## 验证

```bash
npm test
npm run check
```

如果本机没有 npm，可以直接运行底层 Node 检查：

```bash
node --check src/app.js
node --test
```

## 发布准备

仓库已经包含 CI 和仅手动触发的 GitHub Pages workflow。private 阶段暂缓部署，等项目准备公开时再启用 Pages。
