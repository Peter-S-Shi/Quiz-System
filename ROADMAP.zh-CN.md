# Quiz Studio 路线图

本文档记录 Quiz Studio 的产品生命周期。它保留 Milestone 1-5 的历史结构，同时区分实现状态、验收状态、质量收敛和发布就绪。

## Milestone 1：基础原型

状态：基础基线已完成

Milestone 1 建立了本地优先的 quiz 编辑与练习系统原型。

已完成范围：

- 可编辑试卷标题、说明和题目。
- 支持客观题：单选题、多选题、填空题、判断题、一对一匹配题。
- 做题时选择题选项可打乱。
- 答对和答错反馈。
- 亮色和暗色主题。
- 中文和英文界面支持。
- 浏览器本地存储。
- JSON 导入和导出。
- 英文和中文项目文档。
- private GitHub 同步流程。

## Milestone 2：练习流程增强

状态：首版实现已落地；完整验收待完成

Milestone 2 增强学习者的练习闭环，让每次做题过程可以恢复、回顾、重复练习，并且更容易筛选。

已实现范围：

- 保存答题进度，并在刷新后恢复。
- 提交答案前检查未答题。
- 优化结果总览和答案对比。
- 记录答题历史与成绩。
- 支持错题单独重练。
- 支持随机抽题。
- 支持按题型筛选。
- 新增界面文案同时支持中文和英文。

验收状态：

- 尚未完成项目级完整人工验收。
- 答题恢复、答题历史、错题重练、随机抽题和题型筛选仍需正式端到端验证。

## Milestone 3：本地试卷库

状态：首版实现已落地；完整验收待完成

Milestone 3 将 Quiz Studio 从单试卷流程推进到本地试卷库，让用户可以在同一台设备上管理多套试卷。

已实现范围：

- 管理多套试卷。
- 新建、复制、重命名、删除试卷。
- 使用分类、标签和搜索组织试卷。
- 记录最近打开的试卷和更新时间。
- 提供更安全的导入、导出和完整本地备份流程。
- 将旧版单试卷本地数据迁移到试卷库。

验收状态：

- 删除等破坏性流程、备份往返、导入安全和旧数据迁移仍需完整人工验证。
- 数据管理继续保持本地优先和隐私友好，但数据完整性尚未完成正式验证。

## Milestone 4：Quiz Core 与开放数据格式

状态：首版实现已落地；完整验收待完成

Milestone 4 将当前原型中的内部逻辑整理成更稳定的基础，把可复用 quiz 行为与界面分离。

已实现范围：

- 拆分原来的单文件 app 结构。
- 建立独立的题目模型、校验器和判分逻辑。
- 建立统一的 Question Type Registry。
- 加入 `schemaVersion` 和数据迁移机制。
- 将存储逻辑与 UI 渲染解耦。
- 建立单元测试、格式检查和基础 CI。
- 公开 JSON Schema 文件和合成示例 quiz 文件。

验收状态：

- 核心测试已经存在并可在本地通过，但这还不能等同于发布就绪保证。
- Schema、迁移、存储和判分行为仍需要更全面的审计和回归检查。

## Milestone 5：公开发布准备基础

状态：首版实现已落地；完整验收待完成

Milestone 5 为未来公开发布建立基础，但不代表当前版本已经发布就绪。

已实现范围：

- 建立响应式设计和可访问性基础。
- 支持具备离线能力的 PWA 行为。
- 准备 GitHub Pages 部署 workflow。
- 完善 README、使用指南、开发指南和安全文档。
- 添加 License、CONTRIBUTING、CHANGELOG 和 RELEASE_NOTES。
- 提供合成示例 quiz 和安全说明。
- 添加 Windows 本地启动器。

验收状态：

- 仓库保持 private 时，GitHub Pages 部署继续暂缓。
- 尚未创建稳定公开版本 tag。
- 完整人工 QA、Product Hardening 和 Release Candidate 验证仍待完成。

## Feature Complete Review

状态：Whole-Product Feature Complete Review V3 已通过并获接受；V1 Feature Complete 已宣布

此前已评审的 Milestone 1-5 候选范围包括：

- 现有五种客观题型。
- 本地多试卷库。
- 试卷创建、复制、重命名、删除、分类、标签和搜索。
- 练习进度保存与刷新恢复。
- 未答题检查。
- 结果对比、答题历史和错题重练。
- 随机抽题与题型筛选。
- JSON 导入导出。
- 全库备份与导入。
- Schema version 和旧数据迁移。
- 中英文界面。
- 本地优先数据边界。
- Windows 本地启动方式。
- PWA、CI、文档和未来 Pages 发布基础。

当前解释：

- 原 Milestone 1–5 Candidate 评审仅作为历史证据保留。
- Milestone 6、Pre-Freeze UI Productization 与范围收尾 Batches A–C 随后均已实现并验收。
- Whole-Product Feature Complete Review V3 以 0 个 Category A 阻断项通过。
- V1 Feature Complete 已宣布，Feature Freeze 已激活。
- 产品尚未达到 Release Candidate 就绪状态；Milestone 7 Product Hardening 与 Milestone 8 Release Candidate 验证仍待完成。

## Feature Freeze Gate

状态：Product Owner 已授权，且 PR #19 合并（`d5c78b9`）后 **ACTIVE**。

该 Gate 当时要求：

- Milestone 6 Translation Practice 已按批准范围实现并通过验收。
- 重新开放后的当前版本范围通过新一轮 Feature Complete Review。
- 不再存在必须补充的核心功能。
- Deferred Features 已经与 v1 发布范围清楚分离。
- 用户明确接受当前 v1 产品边界。

Freeze 规则：

- 允许：修复崩溃、错误结果、数据完整性、迁移、隐私、安全、核心工作流缺陷和严重 UX 问题。
- 默认不允许：新增题型、内置 AI、云同步、账号、协作、应用内教师管理、桌面封装或其他非必要扩展。
- 新功能默认进入下一版本。
- 如必须解除 Freeze，需要在 `ROADMAP.md` 和 `PROJECT_STATUS.md` 中显式记录原因。

## Milestone 6：Translation Practice

状态：功能开发阶段实现完成；M6.0、M6.1 已验收；M6.2、M6.3、M6.4、M6.5、M6.6、M6.7 均已完成实现，整体 M6 验收待进行

验收政策说明：M6.2 到 M6.7 不再逐个进行正式用户验收，而是推迟到 M6.7 完成后进行一次覆盖整个 M6 的综合验收。在此期间，每个子里程碑仍然需要实现评审、回归测试、CI 和范围审查。M6.0 和 M6.1 在这一政策生效前已经验收，继续保持已验收状态。

目标：在 Quiz Studio 中加入一个本地优先、面向文档型书面翻译训练的专用工作区，同时不假设参考译文是唯一正确答案。

架构定位：

- Translation Practice 是 Milestone 6 的主要新增学习工作流。
- M6.0 Open Teaching Interchange 是横向 product/platform 基础设施，不是并列的第二个独立学习产品。
- 该基础设施服务现有 Objective Quiz，并将由 Translation Practice 作为第一个完整 rich-response consumer。
- 外部教师闭环为 `External Authoring -> External Review -> External Remediation`，通过可移植结构化数据工作，不要求内置 AI API。

已批准的子里程碑顺序：

1. M6.0 Open Teaching Interchange Foundation。
2. M6.1 Translation Domain and Persistence Foundation。
3. M6.2 Translation Library and Material Import / Export。
4. M6.3 Translation Practice and Session Recovery。
5. M6.4 Learner Answer Marking and Annotation Foundation。
6. M6.5 Rich Correction / Revision Workspace。
7. M6.6 External Teacher Round Trip。
8. M6.7 History, Retry, Portability and Whole-Product Integration。

M6.0 状态：

- 已验收。
- Objective Quiz 现在会生成独立 finalized Learner Response，并支持可移植 response 导出。
- 版本化 Learner Response 与 Teacher Review contract、校验边界、合成示例、provenance 和备份覆盖已经实现。
- Teacher Review 导入/渲染、rich correction 语义和所有 Translation UI 仍属于后续 M6 工作。

M6.1 状态：

- 已验收。
- Translation Folder、Document、有序 Item 领域模型和核心操作已经实现，并与 Question Type Registry 和 DOM 解耦。
- 版本化 Translation Document schema、合成示例、本地持久化边界和完整备份覆盖已经实现。
- 通用 Learner Response 支持未来书面 Translation 答案且不制造客观判分，同时保留 Objective Quiz 要求。

M6.2 状态：

- 已完成实现；验收推迟到 M6 整体验收（未单独验收，见上方验收政策说明）。
- 新增面向用户的 Translation Library 工作区：文件夹与文档管理、有序 Item 编辑与重排、文档在文件夹间移动。
- 新增仅原文批量导入、双语制表符分隔批量导入，以及可移植 Translation Document JSON 导入，均遵循 输入 -> 解析 -> 校验 -> 预览 -> 确认 -> 持久化 流程。
- 外部 Translation Document JSON 可在不要求外部作者知道本地文件夹 ID 的情况下，分配给用户选择的本地文件夹；重复的 document ID 会被拒绝，除非用户明确选择以新副本方式导入并重新分配 ID。
- 新增使用公开标准合约的 Translation Document JSON 导出。

M6.3 状态：

- 已完成实现；验收推迟到 M6 整体验收（未单独验收，见上方验收政策说明）。
- 新增第一个 Translation Practice 练习工作流：从文档开始练习、原文可见、学习者独立书写译文、可选参考译文默认隐藏并由学习者主动选择显示、在条目间导航，以及主动完成练习的操作。
- 新增专门的 Translation Session 模型（`src/core/translation-session.js`），在 session 开始时对文档条目做快照，因此后续文档编辑不会改写学习者正在或已经练习过的内容。
- 新增基于隔离存储 key 的 Translation active-session 恢复机制，与 Objective Quiz 的 active session 完全独立，两者不会互相破坏；格式错误的 session 数据会被安全拒绝，而不是导致崩溃。
- 完成 session 时通过 `createTranslationLearnerResponse()` 生成非客观 Learner Response（不制造虚假的 `correct`、`correctCount` 或 `percent`）；只有在 response 成功保存后才会清空 active session。
- 对同一文档重复练习会创建新的 session 和新的 Learner Response ID，不会覆盖此前的证据。

M6.4 状态：

- 已完成实现；验收推迟到 M6 整体验收（未单独验收，见上方验收政策说明）。
- 在新的 `src/core/translation-annotations.js` 模块中，新增学习者对自己作答文本片段的、由学习者主动控制的元认知标记：`unknown`、`uncertain` 或 `should_know`——这些是学习者信号，绝不是自动判分结果、词汇记录或 remediation 任务。
- 标记锚定在针对实时作答文本校验过的字符范围上；对完全相同的范围再次标记会替换其分类，与另一个已有标记重叠的范围会被拒绝，直到冲突的标记被移除或调整。
- 编辑作答会自动丢弃该条目中锚定文字已不匹配的标记，因此标记绝不会静默指向错误的文本。
- 标记按稳定的 Translation Item ID 保存在 M6.3 的 Translation Session 中（`session.annotations`），能在导航、刷新和正常恢复中保持不变；格式错误的标记会被单独安全丢弃，不会导致 session 恢复失败。
- 完成练习时，标记会被复制进 Learner Response 上一个可选的追加字段 `learnerAnnotations` 数组；公开 schema 做了最小化、向后兼容的扩展，没有标记的 response 与 M6.3 时的形状保持一致。
- Rich correction、建议/插入式修改文本、外部 Teacher Review 导入、remediation 生成和 Vocabulary App 集成仍属于 M6.5 及之后的工作。

M6.5 状态：

- 已完成实现；验收推迟到 M6 整体验收（未单独验收，见上方验收政策说明）。
- 新增从已完成的 Translation Learner Response 打开的批改 / 修订工作区，供评阅者（学习者本人或人类教师）查看不可编辑的原始作答和 M6.4 学习者标记（均为只读），并添加结构化的 rich correction 证据。
- 新增 `src/core/corrections.js`：一个与 DOM 无关的 rich correction 模型，用单一的 `correction` 概念覆盖表现型样式（加粗、斜体、下划线、删除线、高亮、加括号、文字颜色）、内容变更类操作（插入、替换、删除）以及片段/整条批注，每一条都锚定在针对原始作答文本校验过的字符范围上。
- 表现型样式之间、以及表现型样式与任意内容变更类操作之间，可以合理地重叠（例如一段被替换的文字也可以同时是加粗的）；内容变更类操作之间绝不允许重叠，新增会产生冲突的操作会被明确拒绝，而不是被静默应用。
- 对既有的 M6.0 Teacher Review 契约做了增量扩展：`itemReviews[].corrections` 是新增的可选数组；既有的简单 Teacher Review（仅含 judgment/comment/tags/suggestedRevision）保持不变、依然合法。`suggestedRevision` 被保留，并可以和同一条目上的 rich correction 共存。
- 对 `schemas/teacher-review.schema.json` 做了增量扩展，新增可选的 `corrections` 数组和 `correction` 定义；跨字段的锚点与冲突校验（锚定文本必须匹配学习者作答、范围必须在界内、内容变更类操作不得冲突）仍然是 `validateTeacherReview()` 的运行时职责，因为静态 JSON Schema 无法表达这些约束。
- 新增一个独立的 Teacher Review 存储集合（`quiz-studio-teacher-reviews-v1`，位于 `src/core/review-records.js`），以稳定的 review ID 为键、与 `responseId` 保持稳定关系；一条 review 的 `responseId` 绝不会被静默改指向另一个 response，review 也不会嵌套保存在 Learner Response 证据内部。
- 完整的库备份/恢复现在包含 Teacher Review；没有 Teacher Review 的旧版备份依然合法，格式错误的 review 数据会在应用任何状态之前安全失败。
- 所有评阅者/插入的文字都以转义后的纯文本方式渲染（绝不注入原始 HTML），文字颜色被限制在一个经过校验的小型调色板内，以防止 CSS 注入。
- Rich correction 绝不会修改原始学习者作答、M6.4 标记、材料快照或 session 元数据；创建、编辑或保存一条 review 不会对底层已完成的 Learner Response 产生任何影响。
- 外部 Teacher Review 导入/导出往返、自动/AI 批改、语义判分和 remediation 生成仍属于 M6.6 及之后的工作。

M6.6 状态：

- 已完成实现；验收推迟到 M6 整体验收（未单独验收，见上方验收政策说明）。
- 完成了以 Translation Practice 为载体的第一次真正端到端 Open Teaching Interchange 往返，全程不依赖任何应用内 AI API：撰写材料 → 练习 → finalized Learner Response → 导出一份自包含的评阅请求 → 外部人类/AI/agent 进行评阅 → 导入返回的规范 Teacher Review → 校验 → 预览 → 确认 → 持久化 → 查看导入的 rich correction → 导出补救练习请求 → 外部人类/AI/agent 生成一份补救翻译文档 → 导入 → 正常练习。
- 规范记录（Learner Response、Teacher Review、Translation Document）继续保持为唯一真源。新增 `src/core/review-transport.js`：两种带版本号、与厂商无关的传输/请求信封（`quiz-studio.review-request`、`quiz-studio.remediation-request`），内部嵌入的是规范对象的忠实可移植副本，而不是另一套竞争性的 evidence 格式；这些信封只是导出/传输用的临时产物，绝不会作为规范学习记录被持久化。
- 为 Teacher Review 导入、两种请求信封，以及补救翻译文档导入新增了明确的外部互通版本门槛（独立于、且比通用的、向前兼容的运行时校验器更严格），因此一个不被支持的未来 schema 版本会被拒绝，而不是因为版本号「看起来够新」就被默默接受。
- Teacher Review 导入流程（解析 → 结构校验 → 相当于公开 schema 的检查 → 定位目标 Learner Response → 针对受保护证据的运行时交叉校验 → 预览 → 确认 → 持久化）复用既有的 M6.5 校验器；确认之前不会持久化任何内容，取消或格式错误的导入不会改变任何既有的 Teacher Review 或 Learner Response。会拒绝格式错误的 JSON、错误的 documentType、不受支持的 schema 版本、缺失/空的 review ID、孤儿 responseId、未知的 item ID、锚定文本不匹配、冲突的批改、无效的操作/样式/颜色取值，以及试图把已有 review ID 静默改指到另一个 response 的行为。
- 一份 response 完全可以合理地收到不止一条 Teacher Review。重复导入完全相同的内容会被当作安全的空操作；对同一个 response 用相同 review ID 导入内容有变化的版本，会被归类为需要用户确认的显式更新；相同 review ID 却指向不同 response 会被直接拒绝。新增一个极简的 review 选择器，让用户能看到某个 response 现有的全部 review（评阅者、review ID）并确定性地打开指定的一条，而不去构建 M6.7 的历史浏览器。
- 新增了直接的 Teacher Review JSON 导出（保留稳定 ID 和 rich correction 结构），以及一个把 Learner Response 和某条选定 Teacher Review 打包给外部补救练习作者的补救练习请求导出。
- 补救翻译文档直接复用既有的 M6.2 Translation Document contract 和 JSON 导入流程，未作改动；它仅通过一个增量的 `provenance` 字段块（`purpose: "remediation"`、`sourceResponseId`、`sourceReviewId`、`sourceMaterialId`、`createdAt`、`author`）来标识自己——这个字段块 M6.0 早已通用地支持。导入时会交叉校验 `sourceResponseId`/`sourceReviewId` 必须能解析到真实的本地记录、且该 review 确实属于那个 response，之后才允许持久化；既有的本地文件夹重新绑定与冲突/复制为新 ID 的策略不受影响，也绝不会丢弃 provenance。
- 从补救材料开始的 Translation Practice session 会捕获这份 provenance，完成练习时会把它带入新的 Learner Response 的 `provenance` 字段，因此即使之后删除了实时的补救文档，产生的 evidence 依然可以追溯回来源 response、来源 review 和补救材料。
- 所有外部提供的 JSON 都被当作不可信数据处理：统一通过既有的、会转义的批改渲染器展示，绝不作为原始 HTML 渲染，不会执行任何内嵌脚本或标记。
- 刻意不添加任何应用内 AI API、模型选择器、API key 字段，也不做自动评阅/补救生成；由用户手动把导出的 JSON 交给外部人类/AI/agent，再手动导入结果。同样不构建 M6.7 的完整历史浏览器、分析、重练系统或溯源仪表盘。

M6.7 状态：

- 已完成实现；验收推迟到 M6 整体验收（未单独验收，见上方验收政策说明）。M6.7 是 M6 功能开发阶段的最后一个子里程碑。
- 新增 Translation 历史：一个可筛选的、覆盖全部 finalized Translation Learner Response 的持久浏览视图，完全从既有的 Learner Response 和 Teacher Review 集合派生（`src/core/translation-history.js`），而不是新建第二个可变数据库。即使原始的实时翻译文档被删除，历史依然完全可用，因为一条 response 自身的 `material.snapshot` 已经携带索引所需的全部信息。
- 历史详情视图展示某条 response 的完整持久证据：源条目快照、学习者原始作答、学习者标记、session 时间戳、provenance、每一条关联的 Teacher Review（可打开指定一条，也可以删除不再需要的一条），以及一个溯源区块，显示这条 response 来自哪里、又派生出了哪些重新练习或补救记录。
- 新增显式的重新练习操作（`src/core/translation-retry.js`）：整份重新练习、选择条目重新练习，或只重新练习由一条有文档说明的确定性"需要加强"规则标记出的条目（学习者标记、Teacher Review 给出 incorrect/partial/needs-review 评判，或附带批改——这些信号会跨该 response 的全部 review 取并集，因此结果绝不依赖 review 的先后顺序）。每一次重新练习都会基于历史 response 快照（绝不是实时文档）开启一个全新的 Translation Practice session，并产生新的、独立的 Learner Response；绝不会重新打开或覆盖被重新练习的那条记录。
- 重新练习复用了 M6.6 既有的 provenance/session 机制，而不是重复实现：重新练习材料携带 `provenance: { purpose: "retry", sourceResponseId, sourceReviewId?, sourceMaterialId, createdAt }`，沿用把补救 provenance 带入 finalized response 的同一条 session/finalization 路径，`translation-session.js` 和 `interchange.js` 都无需改动。重新练习与补救练习的 provenance 通过 `purpose` 保持区分，绝不会被混淆。
- 新增显式的删除安全机制（`src/core/deletion-policy.js`），在任何不可逆操作前先报告依赖关系：删除翻译文档绝不会删除 Learner Response；删除 Learner Response 需要显式的级联确认，会一并删除其 Teacher Review（一条必须始终可解析的受保护链接），但会保留由它派生出的重新练习/补救 response，其 `sourceResponseId` 会安全地变成一条被明确表示出来的、无法解析的历史引用；删除 Teacher Review 绝不会修改它所针对的 Learner Response。在初次 CI 通过之后又追加了一个收尾补丁：只要有*实时*补救翻译文档仍把某条 Learner Response 或 Teacher Review 记作自己的 `sourceResponseId`/`sourceReviewId`，删除它就会被直接拒绝（不级联、不出现确认对话框）——这是一条规范性声明而非历史引用，因为 `parseLibraryBackup()` 要求它必须始终可解析；用户需要先删除依赖的补救材料。
- 在批改工作区和 Translation 历史中都新增了"删除批改"操作，补上了 M6.6 中已经明确记录的一处缺口。
- 修复了 M6.7 存储治理复查中发现的两处备份原子性缺口：`parseLearnerResponseCollection()`/`parseTeacherReviewCollection()` 现在会拒绝同一集合中出现重复的稳定 ID（此前只有实时的 `upsert*()` 路径会做这项检查，批量/备份解析路径没有）；`parseLibraryBackup()` 现在会在替换任何状态之前，把每一份补救翻译文档的 provenance 与同一份备份中的 Learner Response/Teacher Review 集合做交叉校验。
- 完成了对 M1-M6 全部 localStorage key 的存储治理盘点（schema/版本、迁移、备份覆盖、删除行为）；未发现重复真源，完整库备份在 M6.6 时就已经覆盖了全部规范 M6 记录。
- 把手工 QA 问卷整合进一个 M6.7 增量模块和一段覆盖 M6.0 到 M6.7 的完整端到端 M6 验收流程，为推迟到此刻的整体 M6 验收做好准备。
- 不添加任何应用内 AI API、语义判分、高级分析、图形化溯源可视化、云同步或账号系统。不开始 M7 Product Hardening，也不宣布 Feature Freeze。

已批准的宏观范围：

- 在 Quiz Studio 内提供独立的 Translation Practice 工作区。
- 使用“文件夹 → 文档”结构管理翻译材料。
- 批量导入仅含源语言的材料，或同时包含源文和参考译文的双语材料。
- 导出翻译练习材料和数据。
- 练习时向学习者展示源文，并由学习者独立输入译文。
- 允许把困难词语或短语标记为“不认识/不理解”“不确定”或“本应知道但未能想起”。
- 提供轻量 vocabulary inbox 或移交边界，但不在 Quiz Studio 内复制完整词汇学习应用。
- 支持练习后的复盘与订正，包括整次练习或批量复盘。
- 保持源语言与目标语言方向通用，不硬编码某一种语言组合。
- 第一版实现不依赖 AI 判分或付费模型 API。

初始里程碑不包含：

- AI 判分，或把某个参考译文视为唯一正确答案。
- Quiz Studio 内部的完整词汇学习系统。
- 云账号、协作或应用内教师账号/管理工作流。
- 把已经批准的 M6.0-M6.7 顺序合并成一次实现。

对验收流程的影响：

- Translation Practice 必须完成实现，并按推迟验收政策纳入 M6 整体验收，重新开放的当前版本范围才能通过 Feature Complete Review。
- 每个 M6.x 实现仍必须先经过实现评审、回归测试、CI 和范围审查，才能开始下一个子里程碑；正式的用户验收被推迟到 M6.7 之后的一次整体验收（这一推迟不追溯适用于已经验收的 M6.0 和 M6.1）。
- M6 整体验收已完成，Review V3 已通过，Feature Freeze 已激活。以上验收政策继续作为历史流程证据保留。

## Pre-Freeze UI Productization: Layered Paper Study Desk

状态：实现完成并通过全量验证；Final Human Acceptance Gate = PASS

Pre-Freeze UI Productization（功能冻结前 UI 产品化）在执行 Whole-Product Feature Complete Review V2 之前完成全站视觉与物理交互收敛。它完整保留 Milestone 1–6 的全部产品功能，并将临时探索原型升级为统一的分层研习台（Study Desk）设计系统。

完成范围：

- **设计规范与系统基础（[DESIGN.md](DESIGN.md)）**：建立完整的表面 Token（Strong Paper 亮色、Soft Near-Black 暗色）、中性次级标签、自然语义墨水（Oxford Blue、Vermilion、Forest、Amber、Violet）、排版阶梯、动效语言与基于 Web Audio API 的零外部依赖物理合成音效架构。
- **应用框架与偏好设置**：工具启动台首页（`homeView`）、持久化 UI 偏好管理器（`uiPreferences` 保存主题、音效、减弱动效偏好与可拖拽侧边栏宽度）、轻量偏好设置对话框与顶部栏物理音效切换。
- **核心做题与翻译研习纸面**：客观题练习与翻译练习采用停靠在研习桌面上的连续手稿纸样式，配备有机翻页动效、铅笔书写摩擦音效，以及匹配题逐对独立状态判定与内联正确答案提示。
- **教师批改台**：批改工作区重构为单张连续手稿纸批改台，配备样式批注笔盘、实时墨水投射视图，以及带有物理下压回弹与钝击音效的橡胶印章反馈。
- **离线与测试闭包**：全量 239 项自动化测试：238 项通过，1 项 Linux CI 上的 Windows 启动器测试安全跳过，0 项失败，Service Worker ESM 离线预缓存完整闭包。
- **Human Acceptance Gate**：Final Human Acceptance Gate 已执行并通过（PASS）。

## Milestone 7：Product Hardening

状态：M7.0-M7.3 已完成并被 Product Owner 接受（PASS）；H-01 已解决；C1/B4 已完成；C2/C3/C4 PASS；Product Hardening 已完成；Release Candidate 尚未开始

目标：在不扩大产品范围的前提下，让现有功能成为可靠、统一、可验证的整体。

质量收敛领域：

- System Audit and Defect Inventory。
- Quiz Correctness and Data Integrity。
- Import / Export / Backup / Migration Safety。
- Workflow and UX Consistency。
- PWA / Local Launch / Browser Robustness。
- Privacy and Secret Safety。
- Regression and Manual Acceptance。

质量收敛的核心用户旅程：

```text
首次启动
-> 创建试卷
-> 编辑五种题型
-> 开始做题
-> 中途刷新与恢复
-> 完成并查看结果
-> 错题重练
-> 查看历史
-> 多试卷切换
-> 导出与导入
-> 全库备份与恢复
-> 旧版数据迁移
-> 整理翻译练习文件夹和文档
-> 导入翻译材料并完成书面练习
-> 标记困难词汇并复盘整次练习
-> 导出翻译练习数据
```

退出条件：

- 无已知 release-blocking defect。
- 无已知高风险数据丢失、覆盖、迁移、隐私或安全问题。
- 所有定义的核心用户旅程通过人工验收。
- 自动测试与 CI 通过。
- 每个重要修复缺陷具备回归测试或书面验证步骤。
- 已知风险和未验证事项已记录。
- Deferred Features 已与当前版本范围分离。
- Roadmap、Project Status、README、Release Notes 和仓库实际状态一致。
- 隐私与 secret-safety 检查通过。
- 经过验证的本地提交与目标远程分支一致。

## Milestone 8：Release Candidate Validation

目标：在不扩大冻结 V1 范围的前提下，从干净环境验证候选版本。

必要工作：

- 创建 `v1.0.0-rc.1`。
- 从干净目录重新 clone 仓库并运行。
- 验证 Windows `start-local.bat`。
- 验证标准本地静态服务器启动方式。
- 验证主要浏览器。
- 验证 PWA 安装、离线与缓存升级。
- 使用空数据、合成示例数据和旧版数据测试。
- 执行最终隐私与 secret 扫描。
- 确认所有公开示例都是合成内容。
- 更新 README、CHANGELOG 和 RELEASE_NOTES。
- 记录已知限制。

公开 GitHub Pages 部署、最终 `v1.0.0` tag 与正式 GitHub Release 均延迟至冻结 V1 范围之外；RC 验收后仍需 Product Owner 单独授权。

RC 规则：

- RC 阶段不得继续扩大功能范围。
- 如果发现阻断问题，返回 Milestone 7 修复，并重新执行回归检查。

## Current Version Complete

只有在 Milestone 8 验收完成后，当前版本才可以标记为：

```text
Current Version Complete / v1.0.0
```

## Maintenance / Next Version

当前版本完成后，工作应聚焦于：

- 严重缺陷与兼容性维护。
- 已明确选择的下一版本功能。
- Deferred Features 的重新评估。

## Deferred Features / Next Version Candidates

这些内容不属于当前 v1 范围：

- AI 辅助生成题目。
- 桌面应用封装。
- 云同步与用户账户。
- 分享、协作和应用内教师账号/管理工作流。
- 主观题批改。
- 公开 GitHub Pages 部署与正式 GitHub Release。
- 超出现有“单一整题标记切换”合同的同一条目多种整题标记并存。
- Translation History 分页、虚拟化与高级历史图谱可视化。
- 单卷音频播放限制、禁止拖动与重播次数限制。

## 路线原则

当前生命周期路线是：

1. 保留早期 Milestone 1–5 Candidate 评审作为历史证据。**已完成。**
2. 完成并验收 Milestone 6 与 Pre-Freeze 范围。**已完成。**
3. 通过 Review V3、宣布 V1 Feature Complete 并激活 Feature Freeze。**已完成。**
4. 完成 Milestone 7 Product Hardening。**已完成。**
5. 生成并验证 Milestone 8 Release Candidate。**当前阶段。**
6. 只有 RC 验收完成后才标记 Current Version Complete；任何公开交付均需另行授权。
