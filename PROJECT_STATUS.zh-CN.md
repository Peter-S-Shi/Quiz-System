# 项目状态

## 当前阶段

Feature Development - Scope Reopened（功能开发阶段，范围已重新开放）

## 当前里程碑

Milestone 6.6：External Teacher Round Trip - implementation complete / M6-wide acceptance deferred

## 验收政策（已变更）

用户已明确决定：M6.2 到 M6.7 不再逐个进行正式用户验收。每个子里程碑仍然需要实现评审、回归测试、CI 和范围审查，但一次性的、覆盖整个 M6 的综合验收将在 M6.7 完成后统一进行。M6.0 和 M6.1 在这一政策变更之前已经分别完成验收，这一历史事实不会被追溯改写。请不要把"implementation complete / M6-wide acceptance deferred"理解为等同于已验收。

## 当前发布范围

当前版本范围包括 Milestone 1-5 基线和已批准的 Milestone 6 工作线。Translation Practice 仍是 M6 的主要新增学习工作流。M6.0 Open Teaching Interchange 和 M6.1 Translation Domain and Persistence Foundation 均已验收。M6.2 Translation Library and Material Import/Export、M6.3 Translation Practice and Session Recovery、M6.4 Learner Answer Marking and Annotation Foundation、M6.5 Rich Correction / Revision Workspace 和 M6.6 External Teacher Round Trip 均已完成实现，验收统一推迟到 M6 整体验收时进行。M6.6 在完全不依赖任何应用内 AI API 的前提下，完成了第一次真正端到端的 Open Teaching Interchange 往返：从一份 finalized Translation Learner Response 导出一份自包含的评阅请求，导入外部返回的规范 Teacher Review 并完成校验/预览/确认，再导出一份补救练习请求，供外部一方据此生成一份带交叉校验 provenance 的新翻译文档——可以像其他材料一样导入并练习。M6 保持本地优先，不要求内置 AI API、付费推理或网络连接。

## Feature Complete 状态

旧范围下曾达到候选评审；当前范围已重新开放，因此不再属于功能完整状态。

Milestone 1 作为基础基线已完成。Milestone 2-5 的首版实现已落地，但完整验收待完成。旧边界下曾达到 Feature Complete Candidate 的事实作为历史证据保留。M6.0 和 M6.1 已验收。M6.2、M6.3、M6.4、M6.5 和 M6.6 已完成实现，验收推迟到 M6 整体验收；M6.7 仍未实现。所有 Milestone 6 工作实现、并完成推迟的 M6 整体验收后，必须重新执行全产品 Feature Complete Review。

## Feature Freeze 状态

尚未进入。

只有在 Milestone 6 完成实现并完成推迟的 M6 整体验收、重新开放的范围通过新一轮 Feature Complete Review、Deferred Features 与当前版本分离，并且用户明确接受扩展后的产品边界后，才可以进入 Feature Freeze。

## 当前发布阻断项

- 尚未完成项目级完整人工验收。
- 覆盖 M6.0-M6.7 的整体 M6 验收尚未进行；M6.2、M6.3、M6.4、M6.5 和 M6.6 已完成实现，但按设计不做单独验收。
- 外部教师往返现已存在，但 History/Retry/Portability（M6.7）尚未开始。
- 数据迁移、备份往返、答题进度恢复和破坏性工作流尚未获得正式端到端验证。
- 仓库保持 private 时，公开 Pages 部署继续暂缓。
- 尚不存在 Release Candidate，也尚未完成最终干净环境验证。

## Hardening 进度

尚未开始。

Product Hardening 是 Milestone 7，只能在全部 Milestone 6 工作通过评审并明确进入 Feature Freeze 后开始。

## 验证状态

- 178 项 core/interchange/translation/import/session/annotation/corrections/review/transport 自动测试通过。M6.6 收尾覆盖证明：原始外部 Teacher Review 无法借助归一化隐藏不受支持的顶层/item/correction 字段、替换受保护证据、畸形 reviewer 元数据或缺失的规范字段；专用补救导入会拒绝缺失/用途错误的 provenance 和畸形原始 author 元数据，同时接受能在本地完整解析的溯源链；review/remediation request 的运行时校验器和公开 schema 会拒绝不支持的包/输出版本和空 task；中英文应用导出指令均明确要求 provenance 的时间戳和 actor 元数据。此前 M6.0-M6.6 的全部覆盖继续通过。
- CI workflow 已存在；在 `milestone/6.6-external-teacher-round-trip` 分支上已通过。
- 本地浏览器 smoke test 完整走过了 M6.6 的真实往返：练习并完成一次 Translation 作答；从完成页导出评阅请求，确认其中嵌入了正确的 learnerResponse/requestedOutput；构造一份指向该 response 的外部 Teacher Review，通过已完成的作答记录行导入，确认预览正确显示目标作答记录、评阅者、review ID、"新增批改"状态，以及条目数/批改数/补救建议数；点击**取消**并确认没有任何 teacherReviews 被持久化；重新导入并点击**确认导入**，确认批改已保存；打开批改工作区（因为恰好只有一条 review 所以自动打开），确认导入的批改正确渲染；在工作区内导出批改 JSON 和补救练习请求，确认其内容正确；构造并导入一份 provenance 指向该 response/review 的补救翻译文档，确认预览正确解析并显示真实的来源作答记录/review 标题，且文档带着完整 provenance 持久化进了所选文件夹；对补救文档开始并完成一次练习，确认 active session 携带 materialProvenance，finalized response 携带完整溯源（sourceResponseId/sourceReviewId/sourceMaterialId/author）；确认原始 response 及其 provenance 保持逐字节不变；为原始 response 再导入第二条 review，确认多 review 选择器正确出现，打开指定 review 会显示它自己的批改/评判，工作区内的切换栏能在不同 review 之间正确切换；尝试导入一条孤儿 responseId 的 review，确认它被清晰地拒绝且确认按钮被禁用；并确认英文界面下同样的流程渲染正确——全程没有出现控制台错误。
- 浏览器测试工具此前确认了导出下载会正确触发（文件名和事件正确），但未捕获下载文件的实际落盘内容；这次 M6.6 的 smoke test 改为拦截 `Blob` 构造函数直接检查导出的评阅请求/补救练习请求/review JSON 内容，这比只验证文件名更严格，但仍不完全等同于打开一个真实落盘的下载文件。
- 浏览器测试工具无法驱动原生的 `window.prompt()`/`window.confirm()` 对话框，也无法驱动真实的操作系统文件选择对话框；M6.6 基于文件的 Teacher Review 和补救文档导入是通过在内存中构造 `File`/`DataTransfer` 并在文件输入框上派发 `change` 事件来测试的——这走的正是真实选择文件时会触发的同一段 `FileReader` 代码路径，但不会真正测试原生选择器界面本身。这是测试工具本身的已知局限，不是产品缺陷。
- 完整 v1 用户旅程的人工验收尚未完成。
- 尚未执行干净 clone 验证。
- GitHub Pages 部署为仅手动触发，并继续暂缓。
- M6.0 和 M6.1 已验收。M6.2、M6.3、M6.4、M6.5 和 M6.6 已有自动化测试和 smoke test 覆盖；五者的正式验收都按政策推迟到 M6.7 之后的整体验收。

## 已知风险

- 由于仓库保持 private 且 Pages 部署暂缓，GitHub Pages 目前不能视为可用交付方式。
- ES module 应用不支持通过浏览器 `file://` 直接打开；用户必须使用本地静态服务器或 `start-local.bat`。
- 当前功能面已经较大，但人工 QA 证据还不足。
- Finalized Learner Response 使用浏览器本地存储且不被 history 静默截断；长期积累的大型 evidence 集合最终可能遇到浏览器容量限制。
- 外部 Teacher Review 与补救往返现已存在，但完全是手动的（导出一份文件、交给外部一方、导入他们返回的文件）；目前没有、M6.6 和 M6.7 也都不计划做任何应用内 AI 集成。
- 目前界面除了刚完成练习后的即时复盘页、文档编辑器上的极简"已完成的作答记录"列表，以及批改工作区内部的极简多 review 选择器外，没有更完整的入口可以浏览某份翻译文档历史上的 Learner Response；详细的历史/重练/溯源仪表盘视图明确属于 M6.7 范围。
- 如果某份翻译文档（包括补救文档）在其 Learner Response evidence 存在期间被删除，该 evidence 依然有效（它自带 material 快照，对于补救类 evidence 还自带一份来源 provenance 的副本），但不再能通过文档编辑器直接找到；这与现有 Objective Quiz 的行为一致（删除试卷不会删除其 Learner Response）。
- 把验收推迟到 M6 结束意味着 M6.2-M6.7 之间的集成问题可能比逐里程碑验收更晚才被发现；在此期间更依赖回归测试和 CI。
- 学习者是否显示过隐藏的参考译文只记录在 active session 中，不会带入 finalized evidence；补救材料的练习同样如此。
- 一个 response 现在完全可以随时间积累不受限数量的 Teacher Review（源自反复的外部往返）；按设计没有 review 历史条数上限（与既有的 Learner Response 无上限策略一致），但目前也没有删除某条 review 的方式，这留给 M6.7 的历史/重练范围处理。
- 导出包内嵌的评阅请求/补救练习请求"task"指令文字是按语言固定的、用户不可编辑的字符串；它假设外部评阅者/agent 能理解一段纯文本的自然语言指令，这对某些非 LLM 的外部工具而言是一个合理但尚未验证的假设。

## 未知或未验证事项

- 使用接近真实规模的本地数据进行完整备份导出和导入往返。
- 旧版单试卷数据在代表性旧 localStorage 状态下的迁移行为。
- 刷新和重启浏览器后的答题进度恢复。
- 删除试卷、清空历史、导入备份覆盖等破坏性工作流。
- PWA 安装、离线行为和缓存升级在主要浏览器中的表现。
- 代表性设备上的可访问性和响应式行为。
- 干净环境重新 clone 并运行项目。
- 人工检查下载的 Learner Response JSON，并在真实浏览器中完成包含 learner evidence 的备份/恢复往返。
- 在真实浏览器中完成包含 Translation Folder、Document 和 Item 数据的备份/恢复往返。
- 在真实浏览器中人工检查下载的 Translation Document JSON 文件的实际内容（自动化 smoke test 只验证了下载触发和文件名，未验证落盘字节）。
- 真实浏览器关闭后重新打开（而非仅刷新）时 Translation Practice session 的恢复情况（已验证基于刷新的恢复，未单独验证完整关闭重开）。
- 在真实浏览器中人工检查下载的 Translation Learner Response JSON 文件的实际内容。
- 在触屏/移动端视口下进行标记、复盘和删除操作。
- 在触屏/移动端视口下进行 rich correction 创作（样式/插入/替换/删除/批注的选择和颜色选择器）。
- 在真实浏览器中人工检查用于插入/替换/批注文字录入的原生 `window.prompt()` 对话框。
- 使用真实的外部人类评阅者，或真实的 AI 助手/LLM 会话（而非合成 fixture），根据导出的请求文件生成一条真实的 Teacher Review 或补救翻译文档的完整端到端往返。
- 新增的 Teacher Review 和补救文档文件输入框的原生操作系统文件选择器行为（自动化 smoke test 派发了合成的 File/change 事件，而不是驱动真实的选择器对话框）。
- 尚未测试非常大的评阅请求/补救练习请求导出文件（大量条目、大量批改）在实际文件体积或目标外部工具的上下文/输入长度限制下的表现。

## Deferred Features

- AI 辅助生成题目。
- 桌面应用封装。
- 云同步与用户账户。
- 分享、协作和应用内教师账号/管理工作流。
- 主观题批改。
- 公开 GitHub Pages 部署和最终 GitHub Release。

## 下一步工程目标

M6.6 已完成实现，并通过 PR #5 合并进 `main`。按已批准的子里程碑顺序，下一个是 M6.7 History, Retry, Portability and Whole-Product Integration，但未经新的、明确的用户 prompt 不得开始。在覆盖 M6.0-M6.7 的整体 M6 验收完成前，不开始 Product Hardening 或 Feature Freeze 工作。

## 仓库状态

- 默认分支：`main`
- 远程：`origin`
- M6.6 开始前已验证的基线：`27ecff8 Record M6.5 closure merge into main in PROJECT_STATUS.md`（`main`）
- M6.6 合并提交：`19c8631 M6.6: External Teacher Round Trip (#5)`（`main`）
- 当前文档修订：即包含本状态文件的 commit；其不可变标识以 Git 历史为准
- 同步状态：M6.6 已合并进 `main`；本次纯状态文档提交用于记录已完成的合并
- private 仓库状态：基于当前项目策略和 Pages 暂缓决定，按 private 处理
- Pull Request 状态：PR #5 已在用户明确批准后 squash merge；最终 feature commit 的 GitHub CI 在合并前已通过
