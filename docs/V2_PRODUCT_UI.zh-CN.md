# V2 Final Product UI Integration 里程碑

**状态：** 实现完成，**等待 Human Gate**
**依据：** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1、`docs/V2_UI_ARCHITECTURE_FREEZE.md`（已批准原型的信息架构、“Warm Paper · Living Ink”，不引入第二套 UI 架构）、ADR 0001–0004（均已 ACCEPTED），以及已验收的 Desktop Foundation、V1 Migration、Learning Orchestration + Calendar、Task-Domain Integration 与 Objective Answer Explanation + Focused Practice 里程碑。**这是集成工作：没有改动任何 Evidence、Scheduling、Recommendation、session 或 domain 语义。**

## 1. 范围

**已构建** —— 所有已批准的界面现在都用真实数据、真实操作运行，并且在真实打包应用里运行：

| 界面 | 学习者能做什么（全部经由已验收的服务） |
|---|---|
| **今日** | 每日简报：到期 / 逾期 / 待你决定的日期（派生，零写入）；来自确定性 Recommender、带可读理由（en / zh-CN）而非分数的建议；到期的已排练习；未完成练习的继续 / 放弃；组合器（Selection × Intent × Domain）。开始任何练习都会打开 Focused Practice，并保存学习者真实的 Selection（保存的是当时展示的理由），到期的 occurrence 还会带上排程关联。 |
| **日历** | 已验收 occurrence 投影的月视图；侧栏可显示某一天、某个条目、新建安排，以及**待你决定的日期**（采用 / 保留）。改期（只这一次 / 这一次及之后）、取消（这一次 / 整个系列）、新建（一次性或简单重复），全部是按 occurrence 身份 `(scheduleId, originalDate)` 的 `ScheduleStore` 操作；拖放与键盘日期输入框做的是同一件事。被占用的 slot 会被拒绝并解释原因。 |
| **资料库** | 正式的内容入口：三栏（任务域 / 分类 / 文件夹 · 列表 · 详情）、搜索，对**客观题试卷**（五题型、可选解析、图片 / 音频）、**翻译文档**（含文件夹）与**跟打文本**提供新建 / 编辑 / 删除 / 导入 / 导出。编辑或删除内容绝不触碰已记录的作答。 |
| **证据历史** | 按记录原样显示每次作答（客观题带当时的解析，翻译带学习者的标记与批改，跟打差异，迁移来的 V1 历史；V1 twin 从不列出）。重做（带有记录溯源的新练习）、到批改台查看、导出批改请求。没有掌握度状态。 |
| **批改台** | 对已记录作答做独立的教师批改：判定、评语、标签、建议改写，以及在学习者作答的精确 UTF-16 范围上的修改（样式 / 插入 / 替换 / 删除 / 批注，按字素吸附），原始作答只读。多份批改并存；可导入外部批改（新批改 / 完全相同 → 不做任何事 / 明确的更新 / 拒绝），可导出批改、补救请求与批改请求。 |
| **交换与备份** | 开放教学交换卡片（批改请求、教师批改、带溯源校验的补救材料、试卷、翻译文档）、完整备份、恢复，以及 V1 → V2 迁移 —— 每次导入都先预览。 |
| **设置** | V1 的偏好（语言 zh-CN / en、外观、动效、物理音效、列表宽度）保存在 Rust 拥有的数据库里；只读的系统信息；媒体文件。 |

**上一个里程碑要求的两项 carry-forward —— 已完成：**

1. **客观题的图片 / 音频现在通过正式的 media pipeline 真实呈现。** 新增 Rust Store-Port 命令 `media.read`（按媒体 id 分块读取，每块至多 1 MiB）与 `media.put`（字节 → 内容寻址对象，仅限图片 / 音频类型，上限 24 MiB），两者都不含路径并在 WebView 白名单内；`desktop/ui/web/src/media/media-source.js`（不含 DOM）与 `practice/media-presenter.js`（在浏览器引擎里解码图片 / 加载音频）。**只有对已被证明可呈现的媒体，才解除 `MEDIA_UNSUPPORTED` 的 fail-closed**（经 port 读出、类型与声明的种类一致、引擎成功解码）：`ObjectiveSession.start / restore` 接受 `presentableMedia` 集合，其余一律拒绝；缺失、无法解码、类型不符的对象，或没有 presenter，仍然使该试卷无法开始，也不记录任何内容。
2. **跟打文本编辑迁入资料库内容工作流**；临时启动器（`practice/launcher.js`）及其 harness 在真实产品入口完全覆盖后被**移除**；它们的回归断言（`app-selftest.mjs`，23 项）已移植到产品上。

**按设计未做：** Hardening、新的 Domain / Evidence / Scheduling 语义、提示 / AI / 知识点 / 引用、分析或目标、外部日历 / 提醒 / 通知、随包字体（见 3.9）。

## 2. 架构

```text
视图 (ui/views/*.js)  ── 只渲染、只询问，不做决定 ─────────────────────────────┐
  今日 · 日历 · 资料库（+编辑器）· 历史 · 批改台 · 交换 · 设置                  │
外壳 (ui/shell.js) 导航 · chrome · 偏好 · 提示 · 进入练习的唯一入口              │
        │ 产品服务 (product/*.js，不含 DOM，在真实 store 上测试)                  │
        ▼                                                                       │
  library · learning · history · reviews · exchange        练习 runtime ────────┘ → SessionFinalizer（Evidence 的唯一入口）
        │                                       ScheduleStore（Scheduling Context 的唯一写入者）
        ▼
  Store Port（Rust：SQLite、约束、媒体、归档）   原生流程（Rust 拥有的对话框；路径绝不进入 WebView）
```

静态测试（`product-architecture.spec.mjs`）钉死：任何地方都没有远程 URL / CDN / 网络 API；没有浏览器源存储、HTML 解析、动态代码或内联 style 属性（CSP 禁止）；视图从不写 store；服务与交换模块不含 DOM；Evidence 只经 finalizer 写入、Teacher Review 只由 Review 服务写入；Focused Practice 只经 `practice-entry.js` 挂载（一个共享界面，不是模式）；词典中每个 key 都有**两种**语言、占位符一致、中文是真正的中文，且代码用到的每个 key 都已定义。

## 3. 实现澄清（供 Human Gate 评审）

1. **只做集成。** Recommendation、Due / Overdue、冲突、occurrence 身份、fulfillment、finalization 与各 session 引擎都是已验收模块，原样调用。新增的只是组合、查询与视图。
2. **Selection 是真实的并被保存。** 按建议开始会保存当时展示给学习者的理由（`selectionProvenance`）；手动开始保存 `manual`；到期的 occurrence 带着它的 `scheduleRef` 开始（按身份 fulfill）。启动信息随恢复状态一起保存，所以重启后恢复的练习仍以同样的 provenance 完成。
3. **媒体证明是行为性的。** 试卷的媒体在开始练习时被证明（恢复时再证明一次）；拒绝未经证明媒体的是引擎，不是 UI。资料库把这类试卷列为可开始，并在证明失败时解释拒绝原因。
4. **Teacher Review、请求包、翻译文档导入与 corrections 都是 V1 模块的移植**，由差分测试钉死（`exchange-differential.spec.mjs`：随机 corrections、一批变异的 Teacher Review 分别过 V1 与 V2 校验器、请求 / 补救包、溯源）。差异仅限于 Learner Response 校验器的提示文字（V2 由 adapter 校验内嵌的作答），其结论被断言相等。
5. **批改是只创建的记录；** 外部批改若与已有 id 相同，是只针对该批改的、先预览的明确更新，且永远不能被移到另一份作答名下。
6. **导入的文件不可信。** 每个文件都经校验；id 冲突变成独立副本而非覆盖；补救文档必须能追溯到本资料库中的作答与批改；可移植试卷内嵌媒体，并按内容重新存入。
7. **新增原生接口（Rust 拥有）：** `native_export_text`（保存对话框 + 写入）与 `native_import_text`（打开对话框 + 有上限的读取，32 MiB，UTF-8）。所选路径绝不进入 WebView。WebView 白名单只增加了 `media.read` 与 `media.put`；已审计的“不含路径”契约测试覆盖了它们。
8. **语言。** 整个产品与 Focused Practice 都是双语（zh-CN / en）；默认跟随系统语言，也是一项偏好。材料文本从不被翻译。
9. **字体。** 产品只使用**系统字体栈**（不使用托管字体，不联网）。架构冻结还要求把每一个必需字体随包；布局并不*必需*某个特定字体，而随包 CJK 衬线子集会增加一个需要许可选择的二进制资源，所以保留为**交给 Human Gate 的明确待决项**（不是豁免）。
10. **深色模式** 默认跟随系统，除非偏好另有设置；减弱动效同时遵从系统与偏好。

## 4. 证据

本地（开发机）：**210 个单元 + 92 个集成 JS 测试**；在 headless Edge 中、真实 Rust store 之上的浏览器自检 —— **Focused Practice DOM 84/84**、**学习会话回归 23/23**、**最终产品 UI 140/140**；以及同一个产品**在真实打包的 `quiz-studio.exe` 内（真实 WebView2、CSP 与 Tauri IPC）19/19**，外加打包应用烟测（`webview.pinned_comparison`、单实例、崩溃恢复）；`cargo fmt --check` 与 `cargo clippy --workspace --all-targets -D warnings` 干净；Rust 的 `media.read` / `media.put` 测试。本里程碑候选版的 Windows Desktop CI 运行在完成后记录（待运行）。

| 契约 | 自动化证据 |
|---|---|
| Media pipeline：字节写入、分块读回、去重、类型 / 大小拒绝、引用的外键 | Rust `port_contract.rs`、`webview_contract.rs`；`integration/media-pipeline.spec.mjs` |
| 客观题图片 / 音频被显示和播放；无法解码的媒体被拒绝且不记录任何内容 | `product-selftest.mjs`（资料库）、`packaged-product-check.mjs`（真实 WebView2）、`objective-media-failclosed.spec.mjs`、`integration/practice-runtime.spec.mjs` |
| 资料库：跟打 / 试卷 / 文档编写，带 revision 保护的保存，文本逐字保存，删除不影响 Evidence | `integration/product-library.spec.mjs`、`product-selftest.mjs` |
| 今日 / 日历是只读投影；按身份的排程操作；建议被决定或被取代；手动 / 建议的 Selection 被保存 | `integration/product-learning.spec.mjs`、`product-selftest.mjs` |
| 历史显示被记录的内容（当时的解析、溯源、twin 不列出、无掌握度） | `integration/product-history.spec.mjs`、`product-selftest.mjs` |
| 批改：保存与导入时的契约、重叠修改被拒绝、更新 / 幂等 / 拒绝、V1 有效的请求 | `integration/product-reviews.spec.mjs`、`exchange-differential.spec.mjs`、`product-selftest.mjs` |
| 交换：先预览的导入、冲突变副本、恶意文件被拒绝、试卷媒体往返 | `integration/product-exchange.spec.mjs`、`product-selftest.mjs` |
| 离线、无浏览器存储 / HTML 解析、分层、Evidence 唯一入口、双语词典 | `product-architecture.spec.mjs`、`product-selftest.mjs`（外部资源扫描） |
| 核心跨页面旅程（建议 → 练习 → Evidence → 历史 → 重做溯源 → 批改 → 交换；资料库 → 编写 → 练习；重启后继续） | `product-selftest.mjs`、`app-selftest.mjs` |
| 每个视图的可访问性基础契约（唯一 h1、带名称的地标、id 唯一、可访问名称、alt 文本、最小窗口无横向溢出） | `product-selftest.mjs` |
| 既有 Migration / Orchestration / Task-Domain / Practice 回归 | 同一 workflow 中未改动的套件 |

## 5. 未完成 —— 手动项，未 PASS，未豁免

`manual-qa/v2-final-product-ui.zh-CN.md`（及英文版）：M-U1–M-U8（不同 DPI / 深色 / 高对比度下的视觉检查、Narrator 逐视图、纯键盘旅程、**资料库编辑器**中的真实微软输入法与第三方输入法、用真实文件的原生文件对话框、拖放、真实备份 / 恢复、带新界面的安装包升级）。更早里程碑遗留的仍保持 open：M-T1b/d/e、M-T2a–d、M-T3a–c、M1–M7、D1–D4（M-T1a 与 M-T1c 已通过）。自检驱动的是 Chromium / 真实 WebView2 加可信输入 —— **不是系统输入法、不是 Narrator、不是系统文件对话框。**

其它未决项：字体使用系统字体栈（见上方决定）；`docs/V2_PRACTICE.zh-CN.md` 中记录的跟打实时反馈等行为变化保持不变。

## 6. Gate 就绪情况

实现完成；自动化契约本地通过，并在 Windows CI workflow 中运行（包括真实打包应用）。里程碑**等待 Human Gate**。Hardening **尚未开始**。
