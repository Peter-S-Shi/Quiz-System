# V2 Learning Orchestration + Calendar 里程碑

**状态：** 实现完成，**等待 Human Gate**
**依据：** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1（§3.2、§3.6、§4.4–§4.6、§6、§7、§8、§23）、ADR 0001（ACCEPTED）、ADR 0002（ACCEPTED）、**ADR 0003（ACCEPTED — GO WITH AMENDMENT；§15 foundation 扩展与 §17 验证合约是本里程碑的实施与验收依据）**、Desktop Foundation 与 V1 Migration（均已验收）。
**代码：** [`desktop/core/orchestration`](../desktop/core/orchestration)（`qs-orchestration`，store schema 3）、下列追加式 foundation 扩展，以及 [`desktop/ui/web/src/orchestration`](../desktop/ui/web/src/orchestration) 中的纯 JS/TS 领域层。V1 生产代码、测试与 CI 均未改动。没有 Objective / Translation / Typing 领域集成，没有 Answer Explanation / Focused Practice，没有产品 UI。

## 1. 目标与范围

把 ADR 0003 变成可运行、可证明的软件：带数据库级不变量的持久化 Scheduling Context（schedule、exception、fulfillment、suggestion、selection provenance）；学习者主权所有权与绑定 revision 的 suggestion；带锚点、例外、“仅此次 vs 此次及以后”的简单重复规则；派生的 Due/Overdue；与证据同事务的原子履约；基于异质证据、把未知当作未知、无分数、确定性、可解释的 Recommender；带版本的 planner；以及 Calendar/Today 投影。

| 范围内 | 范围外（不变） |
|---|---|
| store schema 2 → 3、catalog 角色 `context`、五个集合、部分唯一索引、硬外键、`sched-*` 故障检查点 | Objective / Translation / Typing 领域集成，Typing 领域及其 Reader（仅按合约预留） |
| `ScheduleStore`、occurrence 投影、Calendar/Today 投影、planner、Evidence Readers、Recommender、解释文本、selection provenance | 已批准的最终 V2 UI（壳中 Today / Calendar 仍是占位） |
| 会话完结接缝 `completeSession`（证据 + selection + 履约在同一 Unit of Work） | Answer Explanation、Focused Practice、Session Composition 题目策略 |
| 测试桥：JS 领域层直接驱动真实 Rust store | 外部事件、精确时间、提醒、通知、截止/考试、工作量规划、每日预算、AI 排程、分析、FSRS、掌握度状态 |

## 2. 已构建内容

```text
WebView 领域层（纯 JS/TS，注入时钟）                         Rust core
 dates · schema（封闭）· occurrences（投影）                   qs-orchestration：schema 2→3、5 个 context 集合、
 readers（Evidence Readers、未知规则）· recommend               部分唯一索引、硬外键（延迟）
 planner（算法 v1、阶梯）· ScheduleStore（唯一写入者）          qs-store：Role::Context、UoW `tag` → sched-* 检查点
        │  Store Port：read / commit(UoW + rev 前置条件)         qs-platform：sched-before/after-commit:<op>（仅测试构建）
        └──────────────────────────────────────────────────────► qs-port：产品 catalog = schema 3、9 步自检
```

| # | 内容 | 位置 |
|---|---|---|
| 1 | catalog 角色 `context`（随归档与恢复，不在 `domain_collections` 内） | `qs-store`（`Role::Context`、`Collection::context()`）、`catalog_roles` 测试 |
| 2 | schema 2 → 3：`schedule`、`schedule_exception`、`schedule_fulfillment`、`schedule_suggestion`、`session_selection`，含 `ux_schedule_active_slot`、`ux_suggestion_pending`、`ux_fulfillment_occurrence`、`ux_fulfillment_session`、`ux_exception_occurrence`、`ux_selection_session`、CHECK 枚举、延迟外键 | `qs-orchestration` |
| 3 | 九个操作标签的 `sched-before-commit:<op>` / `sched-after-commit:<op>`，由 Unit of Work 上可选的 `"tag"` 驱动（发布构建中编译为空） | `qs-platform`（`fault`）、`qs-store`（`uow`） |
| 4 | 应用、自检（新增 `scheduling` 步骤）与 port 使用 schema 3 产品 catalog | `qs-port::selftest` |
| 5 | 日期、封闭 schema、occurrence 投影（展开、状态、Calendar、Today、Overdue 上限） | `orchestration/{dates,schema,occurrences}.js` |
| 6 | `ScheduleStore`：create（仅未占用槽位）、moveOnce / moveOccurrence / moveFuture、cancel、decideSuggestion、applyPlan、sweep（含退役素材已移除的引擎排程）、completeSession | `orchestration/schedule-store.js` |
| 7 | Evidence Readers（Objective、Translation、Teacher Review、Retry/Recovery、Scheduling、预留 Typing）、Recommender、封闭原因注册表、以命名分组表示的 tier、`explain`（en / zh-CN）、`selectionProvenance` | `orchestration/{readers,recommend}.js` |
| 8 | planner（算法 `v1`，阶梯 `[1,3,7,14,30]`） | `orchestration/planner.js` |
| 9 | 测试桥：`qs-scenario port-serve`（经管道的 WebView 分发）、`product-archive-create/restore` | `qs-scenarios`、`ui/tests/integration/bridge.mjs` |

## 3. ADR 0003 §17 → 证据

| §17 项 | 证据（套件 → 证明什么） |
|---|---|
| 1 所有权矩阵 | `orch-store`：学习者 move/cancel 在原行上翻转 owner（丢弃 engine 元数据、revision 前进）；引擎面对 user 行只存 suggestion，该行逐字节不变 |
| 2 竞争写入者 | `orch-store` 竞态 1–5：引擎 vs 学习者移动、原地重算 vs 学习者移动、accept vs cancel、完成 vs 移动（两种变体）——学习者的修改始终保留，引擎写入被丢弃并重算 |
| 3 数据库级约束 | `qs-orchestration::schema`（第二个 active 排程、第二个 pending suggestion、同一 occurrence/会话的第二次履约、每键一个 exception/selection、CHECK 枚举、延迟硬外键）+ `orch-store` 经 Store Port 的直接重复提交 |
| 4 冲突选择 | `orch-store`：用户 10 月 4 日 vs 引擎 10 月 3 日（**相差一天**也是冲突）→ accept 后只有一个 active 排程，keep 保留学习者日期；相同日期为 no-op；无最小差值（`orch-recommend` 中的 `decideProposal` 表） |
| 5 / 5a / 5b / 5c | 已占用槽位被拒绝且不改写任何内容、cancel 后再创建 = 新身份（`orch-store`）；学习者修改在同一 Unit of Work 内 supersede 待决 suggestion，过期**以及伪造**的 suggestion 都被拒绝且无改动；sweep 基于新 revision 重算且不重复提醒（已覆盖依据含 kept / superseded / accepted）；属性测试 |
| 6 展开表 | `orch-occurrences`：cadence × anchor × `until`、跨年的周、闰日、月末、大间隔、anchor = until、once、时区/DST 无关 |
| 7 仅此次 / 此次及以后 | `orch-occurrences`（Scope 7.7 示例 10/3→8→11→14、多次 re-anchor）+ `orch-store`（exception、移回、丢弃 ≥ 切点的 exception、DATE_TAKEN / NO_CHANGE / REANCHOR_OVERLAP / BEYOND_UNTIL / FUTURE_HAS_FULFILLMENT，每次拒绝后逐字节不变） |
| 8 属性测试 | `orch-store`：带种子的随机操作序列（创建、移动、取消、完成、证据、sweep、decide、时钟推进），**每一步**后断言 S-1、S-3、S-6、S-7、L-3、E-1（`QS_ORCH_SEQUENCES`，CI 60） |
| 9 状态表、零写入 | `orch-occurrences`：Due/Overdue/Scheduled/fulfilled/cancelled 随时钟偏移（含回拨）在深度冻结数据上推导 |
| 10 错过的排程 | `orch-occurrences`（Overdue 保持；366 上限报告 `overdueTruncated` 与精确总数）+ `orch-recommend`（Overdue 的 engine-owned 排程产生 suggestion，绝不移动） |
| 11 改期后的旧日期 | `orch-store`：被舍弃的日期不再产生 occurrence，因此不产生 Overdue |
| 12 / 13 / 13a 履约 | `orch-fulfillment`：slot-match、linked 提前开始、未链接的提前完成不消耗任何东西、intent/domain/material、已结束的 series、多个 Overdue 逐个清除、一个会话 ↔ 一个 occurrence（数据库强制）、拒绝重复提交已定稿证据、**被移动的 occurrence 以 `originalDate` 为键**（履约、selection `scheduleRef`、任何位置都没有 `#<movedTo>` 键、用显示日期链接不会履约） |
| 14 原子性 | `orch-faults`：在 `sched-before/after-commit:session-complete` 处被杀，证据 + selection + 履约要么全无要么全有 |
| 15 证据不可变 | `orch-store` 属性测试（每步后所有既有证据行逐字节不变）、`orch-migrated`（排程操作后证据、origin、run、paper、document、media 逐字节不变）、`orch-architecture`（Evidence readers 与证据侧代码从不触碰排程） |
| 16 / 17 未知不是负面；迁移不制造债务 | `orch-recommend`（缺口登记的 lineage、无时间戳记录、`twin` 条目、悬空 retry）+ `orch-migrated`（真实迁移后的 `r-full` store：无恢复/排程/Typing 原因、twin 不计数、一年后 sweep 也不创建任何东西）及 NATIVE 副本对照（同样事实但没有 origin 则**会**产生提议） |
| 18 异质性 | `orch-recommend`：三个互不合并的学习者代码、仅评语不产生任何信号、Translation 恢复仅在 Teacher Review 全部 `correct` 时成立、Typing 代码不出现 |
| 19 无分数 | `orch-recommend`（输出中没有任何数字或类分数键）+ `orch-architecture`（静态） |
| 20 确定性 | `orch-recommend`：60 次打乱输入逐字节相同、已提交 golden JSON（`ui/tests/fixtures/orch-recommend.golden.json`）、静态的无时钟/无随机/无 locale 扫描、每个代码的 en 与 zh-CN 解释 |
| 21 来源 | `orch-fulfillment`（已展示内容的快照不可变、用 id 而不是位置、缺失即未知）+ `orch-faults` 归档往返 |
| 22 / 23 封闭与投影 | `orch-occurrences`（CAL-1：time、reminder、notify、duration、budget、deadline、goal、exam、title、notes、location、extensions，槽位/anchor 中的时刻，monthly cadence 均被拒绝）+ Calendar/Today 投影测试 + `orch-architecture`（无通知/定时器/网络词汇） |
| 24 归档往返 | `orch-faults`（真实 `product-archive-create/restore`：五个集合与证据的摘要相同、一致性干净、约束仍然有效）+ `qs-orchestration::schema` |
| 25 升级 | `qs-orchestration::schema`（2 → 3 保留数据；失败的 3 拒绝运行且 store 仍可被上一版打开；旧版拒绝 schema-3 store；schema-2 归档可恢复）+ `orch-migrated`（真实迁移后的 schema-2 store 逐字升级） |
| 26 故障矩阵 | `orch-faults`：九个标签 × 提交前/后 → 恰好是 pre 或 post 状态（post 状态在克隆上计算）、一致性干净；混沌负载下的随机时刻杀进程（`QS_ORCH_KILLS`，CI 100）及原子性不变量 |

变异检查（非提交的测试）：对 `ScheduleStore` 故意注入六个缺陷——移动不 supersede、忽略绑定 revision、重新引入最小差值阈值、以 `displayDate` 作履约键、去掉引擎的 revision 前置条件、Create 改写已占用槽位——集成套件均能杀死。

## 4. 结果

本地（开发机，debug profile，阈值按默认缩放）：`qs-orchestration` 13 个 Rust 测试、`qs-store` 与 `qs-port` 套件通过（自检现为 9 步）、`clippy -D warnings` 与 `rustfmt` 干净、93 个 JS 测试（既有 18 + 纯 38 + 对真实 store 的集成 37）。CI（`windows-latest` 上的 `Desktop (V2)`，阈值 `QS_ORCH_KILLS=100`、`QS_ORCH_SEQUENCES=60` 加既有 `QS_*`）：运行完成后记录（待运行）。

## 5. 提交 Human Gate 的实现澄清

以下均不改变 ADR 0003、Scope Freeze 或证据语义的任何政策；它们是实现不得不做的选择。

1. **槽位投影。** ADR 中的 `slot_key` 实现为四个分量列（`domain`、`material_type`、`material_id`、`intent`），部分唯一索引建立在其上，payload 不携带计算字段。
2. **Unit of Work 的 `tag`。** Unit of Work 可带可选的 `"tag": "<op>"` 来命名 `sched-*` 故障检查点；其他代码路径一律忽略它，发布构建中检查点编译为空。
3. **已覆盖依据包含 accepted 的 suggestion**（不仅 kept 和 superseded）：planner 以规划日期为起点，否则已接受的日期第二天又会“不同”而重复提醒。对 Overdue 的 engine-owned 排程，出于同样原因其自身 `engine.basis` 视为已考虑。
4. **engine-owned 排程的同依据规则。** 提议的依据已包含在排程的 `engine.basis` 内时，无论日期如何都是 no-op；否则引擎日期会每天向后漂移而永远不到期。只有新的 evidence id 才会原地重算。
5. **移回。** 把 occurrence 移回其原始日期会删除它的 exception（exception 永远不会有 `movedTo = originalDate`）。
6. **re-anchor 的拒绝与切点。** 当更晚的 occurrence 已被履约时，“此次及以后”被拒绝（`FUTURE_HAS_FULFILLMENT`：不得静默消失）；落在较早分段内部的切点会同时丢弃从其开始或其后的分段。
7. **取消有限 series 的最后一个未解决 occurrence 会使其完成**（§9.3）；无界 series 永不完成。
8. **`completeSession` 接缝。** 它拒绝创建已存在的证据（`SESSION_ALREADY_RECORDED`：已定稿证据永不改写）；遇到 revision 冲突最多重试三次，最终仍冲突则抛错，而不是提交没有履约的证据。指向已结束或槽位不符排程的 `scheduleRef` 不履约，但证据与 selection 仍会写入。
9. **算法 `v1` 固定的 Recommendation 细节：** tier 以命名分组呈现（`overdue-or-remediation`、`due-or-learner-flagged`、`incorrect-or-teacher-flagged`），绝不是数字；只有当**每一条** provenance 都被覆盖时，信号才被恢复所 supersede（因此带有更早未恢复尝试的重复失败仍然有效）；“最近一次”需要已知顺序（两次及以上尝试且有任何无时间戳 ⇒ 无信号），Translation 的学习者标记取自该素材最近一次作答，Translation 的恢复是 response 级（D-7：无条目对应）。
10. **Planner 细节：** 干净的引擎复习提议带原因 `SUCCESSFUL_RECOVERY`；原生会话无法排序的素材不产生提议；引擎只从原生记录规划（M-1）。
11. **素材不可用。** sweep 会退役其 Paper / Translation document 已不存在的 engine-owned 排程（`cancellation.by = engine`，不算学习者取消，因此槽位可重新规划）；user-owned 的保留，并由投影通过 `materialAvailable()` 标记为 `unavailable`。没有对应集合的素材类型（Typing，预留）视为可用。
12. **Overdue 枚举上限** 列出一个 series 中**最近**的 366 个未解决 occurrence 并报告精确总数；它从不删除或改变任何东西。
13. **已移除素材的 Recommendation 目标** 会保留并标记 `unavailable`，而不是静默丢弃。
14. **测试桥。** JS 领域层通过 `qs-scenario port-serve`（经管道的已发布 WebView allowlist 分发）对真实 store 测试，而不是重新实现一个假 store，因此约束、revision、归档与故障点都是已发布的那一套。

## 6. 未决事项（明确列出，未豁免）

- **按设计没有产品 UI。** Today / Calendar 在壳中仍是占位；已批准的最终 UI 在其自己的里程碑集成。投影与 store 已完整并经过测试。
- **任务领域集成。** 真实的会话记录（Objective、Translation、Typing）与 Typing Reader 随集成里程碑到来；`completeSession` 是它们将调用的接缝，由它们提供 `evidenceOps`。
- **手动打包检查 M1–M7**（V1 迁移）与 Desktop Foundation 的 **D1–D4** 仍是 open、不阻塞的验收欠账：未通过、未豁免。
- 素材与会话的软引用不由数据库强制（ADR 设计如此）；由 `check_consistency` 与素材不可用规则兜底。
- 算法 `v1` 的参数（阶梯、366 上限）是暂定且带版本的（ADR 0003 §22）。

## 7. 如何运行

```bash
# Rust（schema 3、约束、升级、归档、故障点注册表）
cargo test -p qs-orchestration -p qs-store -p qs-port
# 纯 JS 领域层（日期、occurrences、readers、recommender、planner、架构）
node --test "ui/tests/*.spec.mjs"
# 对真实 Rust store 的 JS 领域层（需要 scenario 二进制）
cargo build -p qs-scenarios --bin qs-scenario
node --test "ui/tests/integration/*.spec.mjs"      # QS_ORCH_KILLS=100 QS_ORCH_SEQUENCES=60 是 CI 阈值
```

## 8. Gate 就绪

实现完成；ADR 0003 §17 已实现为自动化测试，本地通过并已接入 Windows CI workflow。里程碑**等待 Human Gate**。Task-Domain Integration（Objective / Translation / Typing）、Answer Explanation、Focused Practice 与最终 UI 集成**尚未开始**，需要各自的授权。
