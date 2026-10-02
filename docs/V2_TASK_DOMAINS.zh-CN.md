# V2 Task-Domain Integration 里程碑（Objective / Translation / Typing）

**状态：** 实现完成，**等待 Human Gate**
**依据：** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1（§3.3、§4.2–§4.3、§4.8、§8、§9、§11、§12、§14、§23）、ADR 0001–0003（ACCEPTED）、**ADR 0004（ACCEPTED — GO WITH AMENDMENT；§5–§12 是契约，§13 是验证与验收依据）**、Desktop Foundation、V1 Migration 与 Learning Orchestration + Calendar（均已验收）。
**代码：** [`desktop/core/task_domains`](../desktop/core/task_domains)（`qs-task-domains`，store schema 4）与 [`desktop/ui/web/src/task-domains`](../desktop/ui/web/src/task-domains) 中的纯 JS 领域层，以及 §2 列出的增量改动。V1 生产代码、测试与 CI 均未改动。**按设计不做：** Answer Explanation、Focused Practice、任何产品或最终 UI、Typing 文本编写 UI、Teacher Review 的编写/导入改动。

## 1. 目标与范围

把 ADR 0004 落成现实：三个 Task Domain 通过**同一个**封闭接缝完成真实会话的 finalization，同时保持各自证据语义分离；Typing 成为拥有自己不可变证据的一等领域。所有内容都以对真实 Rust store 的自动化测试证明（与 Orchestration 里程碑相同的测试桥）。

不在范围内：任何 UI（WebView 绑定只是一个很薄的事件映射，不是界面）、Typing 文本库 UI、Answer Explanation、Focused Practice、长文本布局、Scope §21 的任何延后能力（打字速度分级、掌握度、分析、自适应按键、原始键击遥测），以及 Typing 的自动排程（Human Gate 已否决）。

## 2. 已构建内容

| # | 内容 | 位置 |
|---|---|---|
| 1 | store schema 3 → 4：集合 `typing_text`（Content）与 `typing_attempt`（Evidence），均为 `canonical`，只有软引用，`intent` 带 CHECK 枚举；发布用 catalog（`qs_task_domains::product_catalog`）取代自测、scenario 与应用中的 schema-3 catalog | `core/task_domains`、`core/port/src/selftest.rs` |
| 2 | **Domain Evidence Adapter 注册表**（封闭）：Objective 与 Translation（`learner_response`，V1 契约不变，V2 会话事实只放在 `extensions["quiz-studio.v2.session"]`）以及 Typing（`typing_attempt`）；写入注册表 `SESSION_EVIDENCE_WRITABLE` **由 adapter 推导**，不是 Reader 注册表 | `task-domains/adapters.js` |
| 3 | finalization 接缝：`validateSessionEvidenceOps` 现在在访问 Store Port 之前先运行 domain adapter，要求恰好一条证据，并**从证据推导 slot**（调用方给的 slot 不一致则 `SLOT_MISMATCH`）；`completeSession` 仍是仅创建、原子 | `orchestration/session-finalization.js`、`schedule-store.js` |
| 4 | `SessionFinalizer`：所有 domain 的唯一入口；跨越不确定的崩溃时幂等（内容规范相等 → 已 finalize；内容不同 → `SESSION_ALREADY_RECORDED`） | `task-domains/finalizer.js` |
| 5 | `SessionRecovery`：`recovery_session` 中的仅恢复状态；证据 id 在会话开始时分配；证据已提交的状态会被丢弃，绝不重新 finalize | `task-domains/recovery.js` |
| 6 | **typing-compare/1**：项目自有、固定到 **Unicode 16.0.0** 的语义——NFC 与 UAX #29 扩展字素切分（含 GB9c/InCB、GB11、GB12/13），基于生成的表，绝不使用 `Intl.Segmenter` / `String.prototype.normalize`；确定性的最小编辑对齐；对齐字素边界的 UTF-16 span | `task-domains/unicode/*`、`typing/compare.js`、`tools/gen-unicode-data.mjs` |
| 7 | `typing_attempt` 记录：封闭 schema、构造器、只在记录所写的固定版本下重新证明对齐的校验器；未知版本只读 | `typing/attempt.js` |
| 8 | Typing 会话引擎：一条 committed-text 路径（可信的 user-agent 输入，不要求 keydown/composition）、composition 绝不提交、paste/drop 被拒、合成变更被排除、Practice 实时反馈与 Test 不透明、恢复快照/还原、finalize；外加很薄的 DOM 事件映射 | `typing/session.js`、`typing/dom-adapter.js` |
| 9 | Typing Reader（只看最新 attempt → `TYPING_ERRORS_REMAIN`，Tier 3，无参数）、理由注册表 v2（没有 `TYPING_REVISIT_DUE`）、Reader 注册表加入 `typing_attempt`、`typing-text` 的材料可用性/证据 id；planner **不变**（自有版本常量 `PLANNER_ALGORITHM_VERSION = 'v1'`） | `orchestration/readers.js`、`recommend.js`、`planner.js` |

测试侧新增：共享夹具 `tests/task-fixtures.mjs`、`tests/integration/faults-kit.mjs`；既有集成夹具现在构造带会话事实、符合 V1 的原生记录。

## 3. ADR 0004 §13 → 证据

| §13 条目 | 证据（文件 → 断言内容） |
|---|---|
| 1 三个 domain 的合法 finalization | `integration/task-finalization` —— Objective slot-match、Translation 链接、Typing 经由真实会话引擎；selection 以证据 collection+id 为键；推荐 selection 快照逐字节往返（`algorithmVersion` v2）；Practice 从不满足 Test；typing/quiz-paper/translation 互不满足对方的 slot；Translation retry 满足**源**文档的 slot；remediation 使用自己的文档 |
| 2 封闭的 adapter 边界 | `integration/task-finalization`（九种非法 payload、store 字节一致、`SLOT_MISMATCH`）、`integration/orch-finalization`（结构类用例）、`task-adapters`（保留 V1 严格度、封闭键集合与公开 JSON Schema 一致、会话事实封闭且按 domain 区分、domain 互不渗漏）、`orch-architecture`（写入注册表 ≠ Reader 注册表） |
| 3 不可变与幂等 | `integration/task-finalization` —— 同一会话两次、内容不同被拒、并发 finalize、提交后/提交前被杀再重新 finalize（Objective 与 Typing）→ 恰好一条记录；已 finalize 会话的 recovery 行被丢弃；retry 是新 attempt |
| 4 故障矩阵 | `integration/task-faults` —— 对**每个** domain 的 `sched-before/after-commit:session-complete`：恰好是 pre 或 post 状态、三件套不被拆开、一致性干净；三 domain 混合负载下的随机杀进程（CI：`QS_ORCH_KILLS=100`）保持 S-1/S-3/S-6/S-7、证据不可变与 collection/材料类型完整性 |
| 5 Schema、归档、升级 | `core/task_domains/tests/schema`（角色、软引用、投影不一致、intent 枚举、3 → 4 升级、失败的升级、`SCHEMA_NEWER`、含 NFD 文本的归档往返、schema-3 归档恢复）、`typing-attempt`（校验器）、`integration/task-finalization`（通过真实 scenario 工具归档，recovery 不进归档）、`integration/orch-migrated`（V1 导入：零 Typing 行、缺口 `v2.typing`、发布用 catalog）、`core/port` 在 schema-4 catalog 上的迁移测试 |
| 6 Unicode 保真与确定性 | `typing-unicode`（**官方** `GraphemeBreakTest.txt` 与 `NormalizationTest.txt`，Unicode 16.0.0）、`typing-compare`（夹具：拉丁、NFC/NFD、ZWJ 家庭 emoji、肤色、旗帜、Hangul、CJK、RTL、Indic 连字、CRLF、代理对；带种子的属性测试；静态禁止 ambient Unicode API；故意损坏宿主后结果不变）、`typing-attempt`（被篡改的事实被拒、已存字面量的历史重放、未知版本只读且不可创建） |
| 7 IME / committed 输入 | `typing-session` —— composition 绝不提交、取消、提交；普通键、dead key、`insertText` 与**单独一个可信 input 事件**都能提交；composition 期间的非组合 input 也提交；paste/drop 被拒并回滚；不可信事件永不进入；用假元素测试 DOM 绑定 |
| 8 Practice/Test 语义 | `typing-session`（实时视图 vs 不透明的 Test/on-completion 视图、Test 配实时反馈在构造时被拒、恢复不泄露任何结果）、`orch-architecture`（对比的结构性门控）、`task-adapters`（Objective 反馈时机不改变其它任何东西） |
| 9 推荐无跨域污染 | `typing-recommend` —— v2 与已提交的 v1 golden 在去掉标签后相同；加入 Typing 行只改变 Typing 目标；`environment → enviroment` 只产生一个 Typing 信号；无任何跨域理由码；只看最新 attempt；可用性；打乱输入后确定性 |
| 10 不自动排 Typing | `typing-recommend`（有无 attempt planner 输出相同）、`integration/task-finalization`（困难 attempt 后 sweep 不创建排程也不创建 suggestion；手动排程与 retry 履约可用）、`orch-architecture`（planner 从不提及 Typing） |
| 11 Retry lineage | `task-adapters`、`integration/task-finalization`（Objective recovery 照旧被读取；Typing retry 对其不可见）、`task-v1-preservation`（V1 retry/remediation provenance） |
| 12 V1 保持不变 | `task-v1-preservation` —— **未改动的 V1 构造器**产出的记录加上事实即为原生记录；portable 导出、OTI review request、带 UTF-16 锚点修正的 Teacher Review 导入、retry 材料、remediation lineage 均照常工作 |
| 13 边界 | 封闭 schema 与静态测试：没有 score/level/speed/mastery 字段、没有原始键击数据、除这两个之外没有新集合、WebView allowlist 与 Store Port 命令不变 |

## 4. 结果

本地（开发机、debug profile、阈值取默认缩放值）：`qs-task-domains` 6 个 Rust 测试，`qs-orchestration`/`qs-store`/`qs-port` 套件通过，`fmt --check` 与 `clippy --workspace --all-targets -D warnings` 干净，**125 个单元 + 55 个集成 JS 测试**通过（Orchestration 与 Migration 套件意图未改）。Windows Desktop CI（`windows-latest` 上的 `Desktop (V2)`，完整阈值）：运行完成后记录（待运行）。

## 5. 供 Human Gate 评审的实现澄清

以下是实现过程中在 ADR 0004 之内做出的选择，均不改变任何决定。

1. **Unicode 表是生成、固定并提交的。** `tools/gen-unicode-data.mjs` 读取 UCD 16.0.0 文件（不提交；每个输入的下载地址与 SHA-256 记录在生成的 `data.js` 中）并写出表；官方一致性套件已提交（`GraphemeBreakTest.txt`、`NormalizationTest.txt.gz`）并在 CI 中运行，所以固定的语义是被证明的，而不是被假设的。
2. **对齐的并列规则与规模上限。** 先去掉公共前后缀，中间部分按最小编辑距离对齐，回溯时依次偏好对角线、遗漏、插入；连续的不匹配步骤合成一个错误。中间部分超过 36 000 000 个单元格时按失败关闭处理（`COMPARE_TOO_LARGE`；recovery 状态保留文本）——对错误散布的超长文本这是一个如实的限制。
3. **Objective/Translation adapter 是镜像 V1 校验器而不是导入它**（发布的 UI 不能导入 `desktop/ui/web` 之外的文件）。差分测试证明凡 V1 拒绝的都会被拒绝，漂移守卫把封闭键集合钉到公开 JSON Schema（开发中它抓到过一处真实分歧：`learnerItemMarks` 的可选 `createdAt`）。
4. **原生 Objective/Translation 记录要求 `provenance`**（`purpose` 为 practice | retry | remediation；retry 记录 `sourceResponseId` 与 `sourceMaterialId`），与会话事实并列：V1 schema 允许省略，而 ADR 0004 §6.3/§10.5 需要 lineage。
5. **`completeSession` 要求恰好一条证据**且其引用即该会话；`slot` 参数现为可选，给出则必须等于推导出的 slot。
6. **`algorithmVersion` v2 / planner v1。** planner 之前导入 recommender 的版本常量；现在自有 `PLANNER_ALGORITHM_VERSION = 'v1'`，engine 排程仍为 `v1`。
7. **Typing 会话策略取值**：`feedbackTiming` 为 live | on-completion，`corrections` 为 allowed | disallowed（disallowed 时仅允许追加，通过对已提交文本的前缀检查强制）。
8. **Recovery 行以会话 id 为键**；V1 的单个活动会话是常见情形，没有任何东西禁止更多。
9. **已发布的 DOM 绑定用假元素测试**；真实 IME/WebView 行为是手动项（见下）。

## 6. 开放事项（明确列出，未豁免）

- **M-T1** 在 Windows 的 WebView2 中验证真实 IME 组合输入（中/日/韩 IME，以及只发 `input` 的第三方 IME）——**未自动化，未 PASS**。
- **M-T2** 长文本折行与活动位置跟随（UI 里程碑，Scope §12.6）。
- **M-T3** 练习界面的可访问性。
- **M-T4** 固定比较语义的 WebView 烟测（仅验证接线；语义是纯项目代码，由官方套件覆盖）。
- **M1–M7** 与 **D1–D4** 仍为 open、不阻塞、未 PASS、未豁免。
- V2 的 **Teacher Review 编写/导入**在移植时必须应用 ADR 0002 §7.5 的显式编码规则（对该里程碑的要求）。
- **Typing 文本编写 UI、Answer Explanation、Focused Practice、最终 UI** 属于后续里程碑，需要各自的授权。

## 7. 如何运行

```text
cd desktop
cargo test -p qs-task-domains                       # schema 4（升级、归档、约束）
cargo build -p qs-scenarios --bin qs-scenario       # Store Port 测试桥
cd ui
node --test "tests/*.spec.mjs"                      # 纯领域层：Unicode 一致性、compare、attempt、session、recommend、adapters、V1
node --test "tests/integration/*.spec.mjs"          # 对真实 store；QS_ORCH_KILLS=100 是 CI 随机杀进程阈值
node tools/gen-unicode-data.mjs                     # 重新生成固定表（需要 tools/ucd-cache；运行测试不需要）
```

## 8. Gate 就绪情况

实现完成；ADR 0004 §13 已实现为自动化测试，本地通过并在 Windows CI workflow 中运行。里程碑**等待 Human Gate**。Answer Explanation、Focused Practice 与最终 UI 集成**尚未开始**，需要各自的授权。
