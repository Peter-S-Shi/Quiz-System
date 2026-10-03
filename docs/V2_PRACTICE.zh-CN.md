# V2 Objective Answer Explanation + Focused Practice 里程碑

**状态：** **已验收（Human Gate PASS）**（经一次 HOLD 修复）；M-T1a、M-T1c 通过，其余手动项保持 open
**依据：** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1（§3.4–§3.5、§4.7、§10、§11、§12、§13、§22–§23）、`docs/V2_UI_ARCHITECTURE_FREEZE.md`、已批准的 UI 原型 / 设计输入、ADR 0001–0004（均已 ACCEPTED），以及已验收的 Desktop Foundation、V1 Migration、Learning Orchestration + Calendar、Task-Domain Integration 里程碑。没有重新打开任何 Evidence 或 Scheduling 语义，也没有引入新的 UI 架构。

## 1. 范围

**已构建**

1. **Objective Answer Explanation** —— 五种题型（单选、多选、填空、判断、匹配）都支持可选的文字 `explanation`。它是 Content：绝不进入判分、结果、汇总、slot、Reader 或 Scheduling。即时反馈只在该题判分之后显示正确答案和解析；整卷提交（Submit-at-End）在提交之前不泄露任何内容（没有判分、没有正确答案、没有解析）；已 finalize 的 Learner Response 保留作答当时的解析，之后编辑源题不会改写历史。向后兼容：没有解析的题目行为与之前完全一致。
2. **Focused Practice 界面** —— 三个 Domain 共用的一个框架（不是 canonical mode）：会话进行中移除侧边栏 / 导航 / 管理类外壳；保留的是该 Domain 自己的交互、进度、安全退出（继续练习 / 保存并离开 / 放弃）与会话恢复。
3. **Objective**（五题型、即时与整卷提交两种反馈、Practice 与 Test 意图、错题重做）、**Translation**（产出、按需显示参考译文、片段标注与整句标记、从已 finalize 的快照重做）、**Typing**（committed-text 引擎，接到真实 textarea；长文本换行与活动位置跟随），都是“引擎 + 视图”。
4. **最小练习启动器**，使该界面能从 store 中的材料进入，并可恢复未完成的会话。按设计它是临时的，现已**移除**：Final Product UI Integration 里程碑（`docs/V2_PRODUCT_UI.zh-CN.md`）提供了真正的入口（今日、日历、资料库、历史），并完成了下面记录的两项 carry-forward（通过 media pipeline 呈现客观题图片 / 音频；在资料库中编辑跟打文本）。
5. **固定比较的 WebView 烟测**：应用启动时在真实 WebView 内运行固定的 `typing-compare/1` 字面用例，经 `ui_ready` 上报；打包应用烟测对其断言。

**按设计未构建：** Today / Calendar / Library / History / Review / Exchange / Settings 最终产品 UI；提示、AI 解析、知识点或引用；编辑界面；题目内图片 / 音频的显示（**fail-closed**，见澄清 11）；对 Evidence、Scheduling、Recommendation 算法（Reader 注册表、recommender v2、planner v1 均未动）、V1 主线、Rust store schema（仍为 4）或公开 JSON Schema 的任何改动。

## 2. 代码位置

| 关注点 | 代码 |
|---|---|
| 题目内容、就绪规则、与 V1 钉死一致的判分 | `desktop/ui/web/src/objective/questions.js` |
| Objective 引擎（唯一决定“显示什么”的地方；`view()` 是白名单） | `…/objective/session.js` |
| Translation 引擎、重做材料 | `…/translation/session.js` |
| Typing 引擎：窗口化的实时比较；DOM adapter | `…/task-domains/typing/session.js`、`dom-adapter.js` |
| 原文单元格 / 状态 / 跟随滚动（纯函数） | `…/practice/typing-passage.js` |
| 界面框架、退出 / 恢复 / 提交管线 | `…/practice/surface.js` |
| 各 Domain 视图 | `…/practice/objective-view.js`、`translation-view.js`、`typing-view.js` |
| store 胶水（材料、开始时分配 id、恢复、finalization 唯一入口） | `…/practice/runtime.js` |
| 启动器、WebView 自检 | `…/practice/launcher.js`、`webview-selfcheck.js` |
| 真实浏览器引擎中的自检 | `desktop/ui/selftest/`（`practice-selftest.mjs`、`app-selftest.mjs`、CDP 客户端、harness） |

## 3. 实现澄清（供 Human Gate 评审）

1. **解析是题目字段；无需改动 V1 或 schema。** `explanation` 是题目上的可选字符串，逐字保存；规范化时，缺失、空、仅空白或非字符串都视为“没有解析”，编写期校验会拒绝已存在的非字符串。公开的 quiz-paper JSON Schema 对每道题是开放的，V1 自己的规范化 / 导出也会保留未知题目字段 —— 两点都有测试证明 —— 因此 `schemas/` 与 V1 代码均未改动。
2. **由引擎而不是 UI 决定“显示什么”。** Objective 的视图模型由显式白名单构造：在允许之前，任何视图里都不存在 `correct` 标记、填空的可接受答案、判断题的答案、匹配的配对或解析。匹配题右侧选项用不暴露配对关系的不透明位置令牌显示（存储的 V1 答案格式不变）。整卷提交后的 `review()` 在试卷完成前会抛错。
3. **会话开始时取快照。** 题目快照（V1 形状，含解析）在会话开始时取一次，learner response 与恢复后的会话都使用它；源题的编辑无法触及。判分移植自 V1，并由针对未改动 V1 模块的差分测试钉死。
4. **Translation 引擎按 V1 语义移植**（逐句作答；参考译文的显示状态只属于会话；三种互不相同的标记；同一片段替换 / 部分重叠拒绝；编辑时丢弃失效锚点；恢复时损坏的标记降级处理）。新增：标注的选区会向外吸附到固定 Unicode 表的扩展字素簇边界，因此标记绝不会切开一个字符；偏移仍是 UTF-16，并在 session facts 中声明。
5. **Typing 实时反馈改为窗口化（仅是实时视图的行为变化）。** 实时视图把已输入文本与“输入可能已到达的原文窗口”比较（从已输入长度起，在输入超出窗口时扩大），而不是整篇原文，因此成本只取决于已输入的部分。未输入的剩余部分因此是 *pending*（`live.reached`），不再作为末尾遗漏错误上报。`finalize` 时的最终比较不变，且始终使用全文。
6. **对“未受信事件绝不进入”的一个狭窄例外**（用 CDP 驱动真实 Chromium 的输入法输入时发现）：某些用户代理路径会以 `isTrusted=false` 投递结束用的 `compositionend`。未受信的 `compositionend` 现在只能*关闭*由受信事件开启的组合输入，并且仅当元素的值恰好等于最后一次受信组合输入所报告的值；它永远无法注入或改变文本。单元测试覆盖了伪造值被拒绝的情形。
7. **退出语义。** 退出 / Esc 会询问：继续练习、保存并离开（写入恢复状态）、或放弃（需确认；不记录任何结果）。输入法组合期间按 Esc 绝不会弹出对话框。恢复状态在会话开始时、每次作答 / 更改后、失焦时和页面隐藏时写入；只有在证据提交成功之后才清除。
8. **结果只有一个入口。** 每个完成的会话都经 `SessionFinalizer`（ADR 0004）；`practice/` 之下没有任何代码写出证据集合的名字（静态测试）。
9. **CI 中 DOM 检查用的是 Chromium，而不是 WebView2 本身。** 自检驱动 Microsoft Edge headless（WebView2 内嵌的引擎），使用可信的 `Input.insertText` / `Input.imeSetComposition` / 按键事件；它们证明引擎层面的契约，但*不是* WebView2 中真实的系统输入法 —— 那些保持手动。
10. **显式退出动作是必须成功的动作（Human Gate 修复）。** 自动保存（每次更改、失焦、页面隐藏）仍是尽力而为，失败时显示持续的错误。*保存并离开*只有在恢复状态确实写入之后才关闭界面；*放弃*只有在恢复记录确实清除之后才关闭并报告 `discarded`。失败时界面保持打开、显示持续错误、不丢失也不记录任何结果，并可重试。保存被串行化，因此放弃不会被已在进行中的保存抵消。证据提交之后的恢复清理保持不变（幂等、崩溃安全），finalization 没有改动。
11. **Objective 媒体 fail-closed（Human Gate 修复）。** 界面目前还不能显示图片或播放音频，因此需要含 `image` 或 `audio` 题目的会话不会启动：引擎在开始、重做所请求的含媒体题、恢复恢复状态时都会拒绝（`MEDIA_UNSUPPORTED`），启动器把这样的试卷列为不可开始，并给出原因 *Contains image or audio that this practice screen cannot show yet*。从含媒体的试卷中重做不含媒体的题仍然可以。媒体元数据从不删除或改写。**Carry-forward（必须完成，不是豁免或推迟）：真实的 Objective 图片 / 音频渲染属于最终产品 UI 集成，必须在含媒体试卷可开始之前完成。**

## 4. 证据

本地（开发机）：**193 个单元 + 63 个集成 JS 测试**通过（含既有 Migration / Orchestration / Task-Domain 套件），DOM 自检 **78/78**、真实 store 应用自检 **23/23** 在 headless Edge 中通过，`cargo fmt --check` 与 `cargo clippy --workspace --all-targets -D warnings` 干净（Rust 代码未改动）。修复后候选版（head `77b259f`）的 Windows Desktop CI 为**绿色**：[run 37096529380](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37096529380)。（`a95a654` 有一项应用自检失败 —— 在途的恢复保存可能晚于提交后的清理落地 —— 已在 `77b259f` 修复：提交先等待串行化的保存队列。）此前的候选版 `b318938` 在 [run 37083868209](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37083868209) 中为绿色，但已被 Human Gate 修复取代。

| 契约 | 自动化证据 |
|---|---|
| 五题型的可选解析、逐字保存；与 V1 / 公开 schema 的兼容 | `objective-explanation.spec.mjs` |
| 即时：判分之后才显示，对错都显示；之后锁定 | `objective-explanation.spec.mjs`、`practice-selftest.mjs`（键盘流程） |
| 整卷提交：提交前任何地方都没有判分 / 答案 / 解析（结构 + 文本 + DOM） | `objective-explanation.spec.mjs`、`practice-selftest.mjs`、`app-selftest.mjs` |
| 快照保留作答时的解析；之后编辑源题不会改写 | `objective-explanation.spec.mjs`、`integration/practice-runtime.spec.mjs`（真实 store） |
| 解析不改变判分、汇总、slot、adapter 判定，也不影响 Reader 所见 | `objective-explanation.spec.mjs`、`integration/practice-runtime.spec.mjs` |
| Focused Practice 移除外壳并还原；退出 / 放弃 / 恢复；渲染失败会清理 | `practice-selftest.mjs`、`app-selftest.mjs` |
| Translation 的产出、显示参考、标记（UTF-16、字素安全）、重做谱系 | `translation-session.spec.mjs`、`practice-selftest.mjs`、`app-selftest.mjs` |
| Typing 长文本：换行、跟随（单调、始终可见）、无焦点 / 光标丢失、缩放、恢复 | `typing-long-text.spec.mjs`、`practice-selftest.mjs`、`app-selftest.mjs` |
| Typing 不依赖 keydown / compositionend 的提交路径；组合输入不被计分；Test 不透明 | `typing-session.spec.mjs`、`practice-selftest.mjs`（可信 CDP 输入） |
| 键盘操作、焦点、基础可访问性契约（名称、legend、progressbar、live region、唯一 h1、id 唯一、Exit 在最前） | `practice-selftest.mjs` |
| 真实 WebView 内的固定比较 | `webview-selfcheck.spec.mjs` + `scripts/smoke.ps1`（打包应用步骤中的 `webview.pinned_comparison`、`webview.engine_reported`） |
| 架构：引擎不含 DOM；视图不能判分；只有 runtime 访问 store；无浏览器存储 / HTML 解析 | `practice-architecture.spec.mjs` |
| 保存并离开 / 放弃是必须成功的动作：保存 / 清除失败时界面保持打开、持续错误、可重试、不记录结果 | `practice-selftest.mjs`（故障注入） |
| 含媒体的试卷：不可开始，引擎在开始 / 重做 / 恢复时拒绝，无 Evidence，元数据不变 | `objective-media-failclosed.spec.mjs`、`integration/practice-runtime.spec.mjs`、`app-selftest.mjs` |
| 既有 Migration / Orchestration / Task-Domain 回归 | 同一 workflow 中未改动的套件 |

## 5. 未完成 —— 手动项，未 PASS，未豁免（gate 之后）

**M-T1a 与 M-T1c：通过**（Product Owner，2026-10-03）。仍为 open、未 PASS、未豁免：M-T1b/d/e、M-T2a–d、M-T3a–c、M1–M7、D1–D4。

`manual-qa/v2-focused-practice.zh-CN.md`（及英文版）：M-T1a–e 真实 WebView2 中的微软输入法 / 第三方输入法 / 死键 / 粘贴拖放；M-T2a–d 真人阅读长文本、缩放 / DPI、Test 意图、中断恢复；M-T3a–c 纯键盘、Narrator、高对比度 / 200 %。另有 M1–M7（Migration）与 D1–D4（Desktop Foundation），保持不变。

其它未决项：**Objective 图片 / 音频渲染（最终产品 UI 集成的必须 carry-forward 项，未豁免）**；真正的 Library / Today 入口；Typing 文本编辑；手动清单记录范围之外的各输入法行为。

## 6. Gate 结果

Human Gate 结论为 PASS — ACCEPTED（经一次 HOLD 修复：必须成功的退出动作与 fail-closed 媒体）。Final Product UI Integration 里程碑已授权，媒体与 Typing 文本编辑的 carry-forward 在该里程碑完成；在真实呈现得到证明之前，`MEDIA_UNSUPPORTED` fail-closed 保持不变。
