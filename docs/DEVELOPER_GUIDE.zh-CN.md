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
- `src/core/translation-history.js`：与 DOM 解耦的 M6.7 历史派生逻辑——从 Learner Response 和 Teacher Review（绝不新建第二个真源）派生历史条目/索引、需要加强条目的判定、条目状态派生、筛选，以及跨越重新练习和补救 provenance 的前向/后向溯源解析。
- `src/core/translation-retry.js`：与 DOM 解耦的 M6.7 重新练习材料派生逻辑——基于某条历史 Learner Response 快照（整份或选定的条目子集）构建一个带 `provenance.purpose: "retry"` 的临时、文档形状对象，可直接交给 `createTranslationSession()`，全程不触碰实时 Translation Library。
- `src/core/deletion-policy.js`：与 DOM 解耦的 M6.7 依赖分析——针对删除翻译文档、Learner Response 或 Teacher Review 各自计算依赖关系，只报告依赖、绝不修改任何数据，供 `src/app.js` 在破坏性操作前渲染准确的白话警告。
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

## Translation 历史、重新练习与溯源（M6.7）

M6.7 没有引入第二个数据库。Translation 历史在每次渲染时都从 M6.0/M6.5 已经维护的同一批规范集合（`quiz-studio-learner-responses-v1` 和 `quiz-studio-teacher-reviews-v1`）重新派生——`buildHistoryIndex()` 只筛选出 Translation response（`material.type === "translation-document"`），并仅从这两个集合计算批改数量、需要加强数量以及重新练习/补救徽章；因此它始终可重建、绝不设置历史条数上限，并且在实时翻译文档被删除后依然完全可用（response 自身的 `material.snapshot` 已经携带历史视图所需的全部信息）。

`deriveNeedsWorkItemIds()` 是唯一有文档说明的、确定性的"需要加强"规则：一个条目会被纳入，只要它带有任意学习者标记（`unknown`/`uncertain`/`should_know`），或任意一条 Teacher Review 对它给出 `incorrect`/`partial`/`needs-review` 评判，或任意一条 Teacher Review 对它附加了批改——这些信号会跨这个 response 的全部 review 取并集（而不仅仅是最新一条），因此结果绝不会依赖 review 的先后顺序。

重新练习复用了 M6.6 既有的 provenance/session 机制，而不是新增一套平行机制：`buildRetryMaterial()` 接收一条历史 Learner Response（可选地传入条目 ID 子集），返回一个带有全新条目/材料 ID 的文档形状对象，其 `provenance: { purpose: "retry", sourceResponseId, sourceReviewId?, sourceMaterialId, createdAt }`，直接交给既有的 `createTranslationSession()`——正是这套已经把 `document.provenance` 带入 `session.materialProvenance`、再带入 finalized response 的 `provenance` 字段（M6.6 为补救材料所做的机制），在这里为重新练习做了同样的事，`translation-session.js` 和 `interchange.js` 都不需要任何改动。重新练习与补救练习只通过 `provenance.purpose` 区分；当"需要加强"集合来自不止一条 review（或仅来自标记）时，针对需要加强条目的重新练习绝不会设置 `sourceReviewId`，因为此时不存在唯一的一条"它是针对哪条 review 的重新练习"。

`resolveResponseLineage()` 沿 `provenance.sourceResponseId`（以及可选的 `sourceReviewId`）向后回溯，并查找所有 `provenance.sourceResponseId` 指向当前 response 的记录（向前）。缺失的来源记录（已删除的 response 或 review）会被表示为 `{ ...Available: false }`，而不是抛出异常——这正是 M6.6 已经为补救材料建立的"历史 provenance 可以指向一个如今已经不存在的来源"约定，在这里被推广到重新练习和历史 UI。

### 删除安全（M6.7）

`deletion-policy.js` 本身从不删除任何数据；它只报告依赖关系，供 `src/app.js` 在执行不可逆操作前给出准确的警告：

- **翻译文档**：删除它绝不会影响 Learner Response（它们携带自己的快照）；分析函数只报告有多少条依赖它，供确认提示引用。
- **Learner Response**：影响较大，因为 Teacher Review 的 `responseId` 是一条必须始终可解析的受保护链接。文档化的策略是显式级联：确认后会把这条 response 连同所有指向它的 review 一并删除，但绝不会删除由它派生出的重新练习/补救 response——它们的 `provenance.sourceResponseId` 之后会安全地变成一条无法解析、但被明确表示出来的历史引用（参见上面的 `resolveResponseLineage()`）。
- **Teacher Review**：绝不会修改它所针对的 Learner Response。某条重新练习/补救 response 可能把这条 review 的 ID 记作 `sourceReviewId`；这是历史引用而非规范链接，因此该 review 始终可以被删除——UI 只会先警告有多少派生记录引用了它。

**收尾补丁——实时补救文档是规范数据，不是历史引用。** 一条 *finalized Learner Response* 自身的 `provenance.sourceResponseId`/`sourceReviewId` 可以安全地引用一个已经被删除的来源（见上面关于溯源的讨论）。但一份仍然存在于 Translation Library 中的*实时*补救翻译文档不同：`parseLibraryBackup()` 每次恢复时都会把它的 `provenance` 与备份中的 Learner Response/Teacher Review 集合做交叉校验，因此如果一份实时补救文档声称的来源不再能解析，下一次备份就会恢复失败。为此，`analyzeLearnerResponseDeletion()`/`analyzeTeacherReviewDeletion()` 现在接受 `translationDocuments` 参数，并报告 `dependentRemediationDocumentIds`/`hasBlockingDependents`——只要有任意一份*实时*补救文档仍把目标记为自己的 `sourceResponseId`/`sourceReviewId`。当 `hasBlockingDependents` 为真时，`deleteLearnerResponseConfirm()`/`deleteTeacherReviewConfirm()` 会直接拒绝这次删除（通过 `showToast()` 提示依赖数量，连确认对话框都不会弹出），而不是级联穿过它——补救文档绝不会作为副作用被自动删除。先删除依赖它的补救文档（普通的翻译文档删除，行为不变）即可解除这个阻塞，之后上面描述的级联/警告行为照常适用。

有一条排序规则值得任何后续扩展者注意：`src/app.js` 中的 `loadTeacherReviews()` 每次调用都会把全部 review 重新对照*当前*的 Learner Response 集合做校验（因此孤儿 review 会被立即发现，而不仅仅在导入时）。任何删除某条 response 的流程都必须在写入更新后的 response 集合*之前*先给 `loadTeacherReviews()` 拍一份快照——如果在那之后才调用它，会看到刚刚变成孤儿的 review 并抛出异常。`deleteLearnerResponseConfirm()` 正是因为这个原因才提前对两个集合都做了快照。

### 存储治理（M6.7）

M1-M6 引入的每一个持久化 key，为 M6.7 生命周期收尾而逐一复查：

| Key | 规范记录 | 迁移 | 备份 | 删除行为 |
| --- | --- | --- | --- | --- |
| `quiz-studio-library-v1` | Quiz 试卷 | `migrations.js` | 包含 | 删除试卷是显式操作；对应的历史/response 需要同样的确认清空 |
| `quiz-studio-legacy-paper`（`quiz-studio-paper-v1`） | 试卷库之前的单套试卷 | 一次性迁移进试卷库后不再使用 | 不适用 | 只读迁移来源 |
| `quiz-studio-active-paper` | 当前选中试卷 ID | 不适用 | 不备份（UI 选中状态，可重建） | 删除试卷时清空 |
| `quiz-studio-active-session-v1` | 进行中的 Objective Quiz session | 不适用 | 不备份（仅为可恢复的临时状态） | 完成/放弃时清空 |
| `quiz-studio-translation-active-session-v1` | 进行中的 Translation session | 不适用 | 不备份（仅为可恢复的临时状态） | 完成/放弃时清空；与 Objective Quiz 的 key 相互隔离 |
| `quiz-studio-history-v1` | Quiz 成绩摘要历史 | 不适用 | 包含 | 按设计上限 100 条；随对应试卷的 response 一起被显式清空 |
| `quiz-studio-learner-responses-v1` | Learner Response（Quiz 和 Translation） | 不适用（按记录带 `schemaVersion`） | 包含 | 无上限；M6.7 新增单条 response 删除，并级联删除其批改（见上文） |
| `quiz-studio-teacher-reviews-v1` | Teacher Review | 不适用（按记录带 `schemaVersion`） | 包含 | 无上限；M6.7 新增单条批改删除 |
| `quiz-studio-translation-library-v1` | 翻译文件夹/文档/条目（包含补救文档） | 不适用（带 `schemaVersion`） | 包含 | 删除文件夹会级联删除其文档；删除文档绝不影响 Learner Response |
| `quiz-studio-theme` / `quiz-studio-language` | UI 偏好 | 不适用 | 不备份（设备本地偏好） | 不适用 |

本次复查未发现重复真源：Translation 历史（M6.7）和 Quiz 成绩摘要历史都是建立在规范集合之上的派生/展示层，而不是另一个规范存储。复查过程中直接修复（而非推迟）了两个会影响备份原子性的完整性缺口：`parseLearnerResponseCollection()`/`parseTeacherReviewCollection()` 现在会拒绝同一集合中出现两条相同稳定 ID 的记录（此前只有实时的 `upsert*()` 写入路径会做这项检查，批量/备份解析路径并没有）；`parseLibraryBackup()` 现在会在替换任何状态之前，把每一份补救翻译文档的 `provenance` 与同一份备份中的 Learner Response/Teacher Review 集合做交叉校验，复用 `review-transport.js` 中的 `validateRemediationProvenance()`。其余部分——"规范链接必须可解析 vs. 历史引用可能已缺失"的区分、无静默上限，以及完整的备份覆盖——在 M6.6 时就已经正确，此次无需改动。

## 本地运行契约

`start-local.bat` 是 `scripts/dev-server.py` 的 Windows 薄包装。Python 是唯一的 runtime owner：它绑定严格固定的规范 origin `http://localhost:8000`，以 `Cache-Control: no-store` 提供当前工作树，针对操作系统公布的全部 IPv4/IPv6 localhost 地址族验证健康端点，打开浏览器并负责关闭生命周期。它绝不会漂移到其他端口；在 Windows 上发生端口冲突时，诊断会在可用时包含监听进程的 PID。

受支持的浏览器入口会先访问服务器拥有的 `/__runtime__/recover` 页面。这个有明确边界的迁移只注销同 origin、脚本路径为 `/sw.js` 的 Quiz Studio 注册，只删除名称以 `quiz-studio-` 开头的 Cache Storage，随后重定向到普通的 `index.html -> src/app.js` bootstrap。它绝不会读取、清空或迁移 localStorage。`src/core/service-worker-policy.js` 禁止 loopback origin 注册生产 Service Worker，而非 loopback 的托管部署仍保留 `sw.js` 的生产 PWA 路径。

运行回归测试通过真实 HTTP 边界覆盖：独占端口 `8000`、冲突诊断/禁止漂移、IPv4 与 IPv6 localhost 可达性、规范健康响应、no-store headers、当前工作树 ESM 图一致性、精确限定的旧状态恢复、localStorage 不访问、薄启动器契约，以及生产/本地 Service Worker 策略。

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
