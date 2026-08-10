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
- `src/core/translation-annotations.js`：与 DOM 解耦的学习者元认知标记（`unknown`/`uncertain`/`should_know`），标记只针对学习者自己的作答文本——包括校验、重叠/重复策略、编辑后重新校验，以及对已保存标记的安全归一化。
- `src/core/corrections.js`：与 DOM 解耦的 rich correction 模型，服务于 M6.5 批改工作区——用单一的 `correction` 概念覆盖表现型样式、内容变更类操作（插入/替换/删除）和批注，每一条都锚定在一个字符范围上；包含校验、样式/颜色校验、内容操作冲突策略，以及一个确定性的渲染投影函数。
- `src/core/review-records.js`：独立的 Teacher Review 集合操作（按 ID 新增/更新、按 `responseId` 查找单条或查找某个 response 的全部 review），与 `learning-records.js` 对应，同样没有静默的历史条数上限。
- `src/core/review-transport.js`：与 DOM 解耦的 M6.6 外部互通层——带版本号的评阅请求与补救练习请求传输信封（创建/校验）、带明确版本门槛的 Teacher Review 外部导入解析、导入冲突分类（新增/幂等/更新/拒绝改指），以及补救翻译文档的 provenance 交叉校验。复用既有的 M6.5 Teacher Review 校验器和 M6.2 Translation Document JSON 解析器，而不是重复实现。
- `src/core/migrations.js`：schema 版本和数据标准化。
- `src/storage/local-storage.js`：浏览器本地存储边界。
- `schemas/`：公开 Quiz Paper、Learner Response、Teacher Review、Translation Document、评阅请求和补救练习请求 JSON Schema。
- `examples/`：合成 Quiz Paper 和教学交换示例，包含一条完整的 M6.6 往返 fixture 链（Translation Learner Response → 外部 Teacher Review → 评阅请求 → 补救练习请求 → 补救翻译文档）。
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

## 学习者标记

标记锚定在学习者自己作答文本的字符范围上（`{ id, kind, start, end, text, createdAt }`），绝不会渲染成内联标记语法——作答始终保持纯文本，标记是按条目 ID 存放在 `session.annotations` 中的一个并行结构化层。`translation-session.js` 在每次某条目的作答发生变化时（在 `setTranslationAnswer()` 内部）都会重新校验该条目的标记，丢弃锚点已不匹配的标记，因此失效的标记绝不会继续指向错误的文本。

重叠策略实现在 `addAnnotation()` 中：完全相同的范围再次标记会替换已有标记的分类；与另一个范围部分重叠且不同的标记会抛出异常，UI 会把它转换为一条提示，而不是静默接受错误数据。完成练习时，`createTranslationLearnerResponse()` 会把各条目的标记汇总进顶层的 `learnerAnnotations` 数组，只有在非空时才会包含该字段，因此没有标记的 response 与 M6.4 之前的形状完全一致。

## Rich Correction（M6.5）

批改工作区（`src/app.js` 中的 `renderCorrectionWorkspace()`）针对一份已完成、不可变的 Translation Learner Response 打开。它绝不会编辑 `response.responses[].answer`、`response.learnerAnnotations` 或材料快照——两者都以只读方式渲染（原始作答放在一个 `readonly` 文本框里，这样原生文本选择依然可用，同时不存在 `contenteditable` 可能带来的证据篡改风险）。

`corrections.js` 把一条 rich correction 建模为单一对象：一个 `operation`（`style`、`insert`、`replace`、`delete` 或 `comment`）、一个 `start`/`end` 锚点、对应校验过的 `anchoredText` 片段，以及按操作类型区分的字段（样式用 `styleType`/`color`，插入/替换用 `text`/`color`，批注用 `text`）。表现型样式（加粗、斜体、下划线、删除线、高亮、加括号、文字颜色）彼此正交，可以与另一个样式、也可以与任意内容变更类操作自由重叠——`addCorrection()` 从不会因为样式重叠而拒绝。内容变更类操作（插入、替换、删除）之间绝不允许重叠：`correctionsConflict()` 把零长度的 `insert` 当作一个插入点，只要该点落在另一个编辑类操作的范围内就判定冲突；`addCorrection()` 遇到冲突会抛出异常（UI 转换为一条提示），而不是静默应用一个有冲突的编辑。`renderCorrectionProjection()` 把一段作答文本加上其批改列表转换成一组有序的渲染片段（普通/带样式的文本片段、被删除或被替换的原文用删除线展示、插入/替换文字单独展示），`src/app.js` 统一通过 `escapeHtml()` 渲染这些片段——评阅者或插入的文字绝不会作为原始 HTML 注入。

批改数据以增量方式存放在既有的 M6.0 Teacher Review contract 内部：`itemReviews[].corrections` 是可选字段，因此仅含 judgment/comment/tags/suggestedRevision 的简单 M6.0 review 不受影响。`validateTeacherReview()` 会把每条批改的锚点与对应的 `responses[].answer` 做交叉校验（未知条目、越界、文本不匹配都会导致校验失败），并拒绝在同一条目上发生冲突的内容变更类操作——这项交叉字段校验只能在运行时完成，因为公开 JSON Schema（`schemas/teacher-review.schema.json`）无法表达"必须匹配同级数据"这类约束。Review 独立存储（`quiz-studio-teacher-reviews-v1`，位于 `review-records.js`），以稳定的 review ID 为键，并保持与 `responseId` 的稳定关系；`upsertTeacherReview()` 允许原地更新一条 review 的内容，但如果试图让已有的 review ID 指向另一个 response，会直接抛出异常而不是静默改指。`parseTeacherReviewCollection()`/`upsertTeacherReview()` 接受单个 `learnerResponse` 或一个 `learnerResponses` 数组作为上下文；只要提供了其中任意一种，每条 review 就必须能解析到一个真实存在的 response——孤儿 `responseId` 会被拒绝，而不是在没有交叉字段上下文的情况下被静默通过。在 upsert 内部重新解析*既有*集合时，这个上下文被特意不会重新套用（该集合可能同时保存着其他 response 的 review）；既有条目被信任为它们第一次通过校验时就已经合法。

## 外部教师往返（M6.6）

M6.6 在完全不依赖任何应用内 AI API 的前提下，闭合了 Open Teaching Interchange 的整个循环：学习者练习、生成一份 finalized Learner Response，应用导出一份**评阅请求（review-request）**包，外部人类/AI/agent 离线完成评阅并返回一份规范的 Teacher Review，应用导入并校验它；然后，应用还可以导出一份**补救练习请求（remediation-request）**包，让同一方（或另一方）外部人员据此生成有针对性的后续翻译练习材料。

`review-transport.js` 定义了两种小巧的、带版本号的传输信封：`quiz-studio.review-request`（`{ schemaVersion, documentType, id, exportedAt, task, learnerResponse, requestedOutput }`）和 `quiz-studio.remediation-request`（在此基础上增加 `teacherReview`）。两者都通过 `toPortableLearnerResponse()`/`toPortableTeacherReview()` 嵌入规范对象的忠实可移植副本，而不是发明一套平行的 evidence 结构；它们也从不会被写入任何存储 key——只作为 `downloadJson()` 的输出内容和 `FileReader` 的输入内容短暂存在。

外部互通拥有自己独立的版本门槛，与本地数据使用的、向前兼容的通用运行时校验器区分开来、且更严格：`SUPPORTED_TEACHER_REVIEW_IMPORT_VERSIONS`、`SUPPORTED_REVIEW_REQUEST_VERSIONS`、`SUPPORTED_REMEDIATION_REQUEST_VERSIONS` 和 `SUPPORTED_REMEDIATION_DOCUMENT_VERSIONS` 目前都是 `[1]`；一个不在此列表内的 schema 版本会在导入边界被拒绝，即便同样的取值在别处可能通过一个通用的 `schemaVersion >= 1` 检查。

`parseExternalTeacherReview()` 执行完整流程（documentType 检查 → 版本门槛 → 针对目标 response 严格校验原始规范数据 → 归一化），返回 `{ review, errors }`，绝不会持久化任何内容。不支持的字段、畸形 reviewer 元数据、缺失的规范必填字段，以及试图嵌入替换 Learner Response 的数据，都会在归一化有机会丢弃或修复它们之前被拒绝。`classifyTeacherReviewImport(candidate, existingCollection)` 是一个纯的、不产生副作用的规划函数，返回 `"new"`（新增）、`"idempotent"`（内容与已存储的完全相同）、`"update"`（相同 ID 和 response，内容不同——需要用户确认）或 `"reassigned-reject"`（相同 ID、不同 response——一律拒绝）。`src/app.js` 会把这个分类结果展示在导入预览中，只有在用户确认后才会调用 `upsertTeacherReview()`，因此取消或无效的导入不会触碰任何已存储的数据。

由于一个 response 现在完全可以合理地拥有不止一条 review（不同评阅者/工具，或反复自我评阅），`renderCorrectionWorkspace()` 改为使用 `findTeacherReviewsForResponse()` 而不是自动挑选一条：零条 review 时新建一份草稿，恰好一条时直接打开（保持 M6.5 单一 review 时的体验），两条及以上时先展示一个极简的选择器（评阅者标签 + review ID）再进入工作区——之后还可以通过工作区内的切换栏改变当前打开的 review 而不必离开。这里刻意保持窄范围：它不是 M6.7 的历史浏览器。

补救材料是一份普通的 `quiz-studio.translation-document`，通过一个增量的 `provenance` 字段块（M6.0 早已通用支持）来区分：`purpose: "remediation"`、`sourceResponseId`、`sourceReviewId`、`sourceMaterialId`、`createdAt`、`author`。通用的 `validateRemediationProvenance()` 对不声称补救用途的文档仍是空操作；专用补救文件解析器和 `validateRemediationImportProvenance()` 则要求真实的补救用途声明、有效的原始时间戳/actor 元数据、能在本地解析的 response/review ID、确实属于该 response 的 review，以及匹配的可选 material ID。普通 M6.2 导入保持不变；冲突检测、"复制为新 ID"重映射和本地文件夹重新绑定仍不会改写 `provenance`。

溯源信息进入练习证据的方式是在 session 层做增量扩展：`createTranslationSession()` 会把 `document.provenance` 复制进 `session.materialProvenance`（仅当该文档确实带有 provenance 时才存在），`createTranslationLearnerResponse()` 会把它归一化后带入新 response 的 `provenance` 字段，取代原来写死的 `{ purpose: "practice" }`。由于 finalized response 是按值携带完整 provenance 字段块的，即使之后删除了实时的补救翻译文档，回溯到来源 response/review 的链路依然完好——不依赖它是否还存在。

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
