# V2 V1 → V2 迁移 —— 里程碑记录

**分支：** `v2`（长期 V2 开发线；未合并到 `main`）
**状态：** **已验收**（Human Gate PASS，2026-10-02）；手动检查 M1–M7 已在 Human Hardening Gate（2026-10-03）PO-PASS
**依据：** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1（§4.5、§5.2、§10.3、§23）、`docs/V2_MIGRATION_READINESS_INVENTORY.md`（Human Gate 决策 D-1…D-15）、ADR 0001（已接受）、**ADR 0002（已接受 —— GO WITH AMENDMENT；其 §15 foundation 扩展与 §16 验证契约是本里程碑的实施与验收依据）**、已验收的 Desktop Foundation。
**代码：** [`desktop/core/migrate_v1`](../desktop/core/migrate_v1)（`qs-migrate-v1`）及下列追加式 foundation 扩展。V1 生产代码、测试与 CI 均未改动（`desktop/`、`docs/`、`manual-qa/`、状态文件与 V2 workflow 之外没有任何文件变化）。无 V1.x 补丁、不读取浏览器配置文件、不使用真实用户数据。

## 1. 目标与范围

把 ADR 0002 变成可运行且经过证明的软件：合法的 V1 `v1.0.0` 完整备份先预览、再确认，然后原子地迁入 V2 store，所有历史事实守恒；其余情形一律 fail-closed，用户文件与 live store 不受影响；重复导入是空操作；导入可撤销；崩溃恰好落在 *pre* 或 *post*。

| 范围内 | 未开始（不变） |
|---|---|
| Foundation 扩展（ADR 0002 §15） | Scheduler / Recommendation / Calendar（其 ADR 尚未开始） |
| `qs-migrate-v1`：无损接收/检测、映射与来源、历史对账、媒体与 recovery artifact、staging/预览/确认、追加式激活、幂等、撤销、守恒验证器 | Objective / Translation / Typing 领域集成、完整产品 UI、冲突解决交互 |
| 最小的正式 WebView/原生交互：Rust 中的原生打开对话框、无路径的预览与确认/取消/撤销命令、Settings 卡片 | 代码签名、自动更新、V1 改动 |
| ADR 0002 §16 自动化验证契约（接入 CI） | 手动项 M1–M7 与 D1–D4 的执行（见第 6 节） |

## 2. 已构建内容

```text
WebView（离线外壳）    Settings 卡片 “Import from Quiz Studio V1”：预览、确认 / 取消、撤销列表
   │  migration.status | confirm | cancel | undo    （无路径，白名单）      ← native_migration_* 在 Rust 中选择文件
   ▼
qs-port  Core：待确认预览 · 写入闸门 · migration.prepare（仅原生，携带路径）
   ▼
qs-migrate-v1
   reader.rs   事件级无损 reader（重复 key、孤立代理项、JS 可产生的数字、流式 base64 媒体）
   model.rs    检测优先级 · 结构/身份/引用/媒体/语义校验 · 历史分类
   stage.rs    计划行（逐字携带；媒体特殊映射）· live 对账 · staging store · Disposition Ledger
   verify.rs   守恒验证器 C-1…C-9、C-12（独立于映射器）
   engine.rs   prepare → activate → post-verify → undo · status · Host trait
   catalog.rs  store schema 1 → 2：paper、library_categories、learner_response、teacher_review、translation_*、
               legacy_history_entry、legacy_residue、migration_origin/run/undo、recovery_artifact
   diag.rs     封闭的 50 个诊断代码注册表（阻断 / 可报告）及阶段
```

### Foundation 扩展（ADR 0002 §15）—— 仅追加，既有语义不变

| # | 扩展 | 位置 | 证据 |
|---|---|---|---|
| 1 | 提交守卫：提交事务内的只读 SQL 断言（`Guard::no_conflicting_ids`） | `qs-activation` | `activation_contract`（新增 2 个测试）：同 id 不同 payload 触发回滚且 live 数据物理不变；未配置守卫时行为不变（H3 套件未改） |
| 2 | 写入闸门（`STORE_BUSY`，RAII，unwind 时释放），拒绝 store 写入、恢复与 GC | `qs-port` | `port_contract` 闸门测试；`migration_port` |
| 3 | archive 格式 v2 同时携带 `recovery_artifact` 行**与**文件；v1 archive 仍可读；v1 archive 不得夹带 recovery 条目 | `qs-archive` | 新增 4 个 archive 测试（逐字节往返、缺失/被篡改的 artifact 在激活前被拒、v1 archive 可恢复） |
| 4 | 通过 Foundation 的 schema 所有权完成 catalog 迁移 1 → 2（领域 collection） | `qs-migrate-v1::catalog` | `catalog_upgrade`：升级保留数据；失败的升级 → `UPGRADE_FAILED` 且 store 不变；旧版本得到 `SCHEMA_NEWER`；Foundation 时代的 archive 可恢复到 schema 2 |
| 5 | Collection 角色 `canonical` / `metadata` / `retained` / `recovery-only` | `qs-store::catalog` | `catalog_roles` |
| 6 | 故障检查点（`mig-*`） | `qs-platform` | `migration_faults`；发布二进制仍不含任何钩子（CI 断言不变） |

## 3. ADR 0002 §16 → 证据

| §16 条目 | 证据（套件 → 证明内容） |
|---|---|
| 16.1 Fixtures | 与 producer 一致：`scripts/gen-v1-fixtures.mjs` 使用 **V1 自己的 `createLibraryBackup` 与 interchange 构造器**生成 `r-min`、`r-full`（5 种题型、图片+音频、跨试卷重复题目 id、CJK/星际平面/组合字符文本、同一 response 的多份 review、remediation 文档、带悬空 provenance 的 retry response、twin/divergent/legacy-only 历史、共享内容媒体）、`r-hist100`（CI 会重新生成并在漂移时失败）。手工变异用例由它们派生；400 MiB fixture 由 `qs-scenario gen-big` 流式生成 |
| 16.2-1 检测表 | `detection`：29 项表 + 优先级（声明优先于结构；信封版本从不单独决定；失败阶段阻止后续阶段但列出本阶段全部问题） |
| 16.2-2 差分 oracle | `oracle`：V1 的 `parseLibraryBackup` 接受 ⇒ 迁移器接受（3 个已记录的更严格情形除外）；V1 拒绝 ⇒ 迁移器阻断 |
| 16.2-3 零静默丢弃 | `conservation`：每个被接受的 fixture 在 `prepare` 内与提交后各执行 C-1…C-9、C-12；**突变击杀套件**（15 类破坏：丢字段、数组重排、补默认时间戳、缺失→null、改写字符串、丢未知 key、丢记录、缺 origin、位置错误、历史角色错误、媒体哈希错误、payload 中残留 base64、产生调度行、悬空 remediation provenance、未被处置的源实体）必须各自让验证器失败 |
| 16.2-4 无损往返 | `conservation`（各嵌套层的未知字段、路径样式文本、CJK、数字形式）+ `oracle`（每个 fixture 每个实体的 JS 规范化哈希 == Rust origin 哈希）+ `migration_port`（路径样式文本经 WebView 不被清洗） |
| 16.2-5 缺失 / gap | `conservation`：缺失保持缺失（从不 null/默认值）、gap 已声明、不产生 V2 独有行或字段、偏移编码标签只出现在迁移的含锚点记录上、payload 逐字不变 |
| 16.2-6 历史 | `history`：twin / divergent / legacy-only、计数公式、折叠与冲突、内容派生键、翻译 twin 不匹配、恰好 100 条的上限标记 |
| 16.2-7 媒体 | `media`：逐字节相同的文件、不存储 base64、共享内容、孤儿媒体被报告而非迁移（含 id 提及告警）、`data:` 前缀与无填充 base64、staging 媒体在 72 小时旧 GC 下仍存活、400 MiB 内存包络（`migration_faults`） |
| 16.2-8 幂等 / 重复 | `idempotence`：同字节两次导入是零写入空操作；两个预览只激活一次；重叠去重；导入 → 撤销 → 再导入；被修改/被依赖时撤销被拒；撤销某一来源时共享记录保留；**所有权与处置分离**（X carried + Y deduplicated：撤销 X 后记录与 Y 的 disposition 保留，撤销 Y 后移除；反序；被两次迁移去重的 V2 原生记录在两次撤销后都保留）；缺失 section 从不删除；提交后缺陷 → 自动撤销 |
| 16.2-9 Fail-closed | `blocking`：40 个变异源 + 5 个选项/live 用例覆盖注册表中**每一个**阻断代码（缺一个测试就失败）；每个用例结束时 live store 物理不变、无 staging 残留、用户文件逐字节相同 |
| 16.2-10 预览契约 | `preview`：独立运行间 `reportHash` 确定、无路径、§12.1 各部分齐全、过期/外来的确认被拒、被阻断的预览无可确认内容 |
| 16.2-11 源不可变 / TOCTOU | `preview`：只读文件（任何写模式打开都会失败）可迁移；用户文件被改动并删除后该次尝试仍完成；staging 副本哈希 == `sourceId`；OS 元数据不是不变量 |
| 16.2-12 Recovery artifact | `artifact`：逐字节（CRLF、BOM）、从不 canonical、可解析为库的 `rawValue` 保持惰性、无法识别则阻断、archive 往返、撤销删除行但从不删除文件；**首次导入无 artifact → 同一 source 之后带 artifact → artifact-only 保存且 canonical 状态哈希不变 → archive 往返 → 重复为 no-op → 撤销 attach**；事后提供非法 artifact 会阻断且无任何改变 |
| 16.3 崩溃/故障矩阵 | `migration_faults`：每个检查点（13 个，另有 4 个带 artifact）× `QS_H3_REPEATS` 次 kill → 恰好 pre 或恰好 post、恢复幂等、用户文件不变、重试完成；随机时刻 kill（`QS_MIG_KILLS`）；撤销期间 kill（迁移检查点与 `uow-before-commit` 两种）；预览→提交之间的竞态由提交守卫捕获（`idempotence`）；失败/更旧的 schema（`catalog_upgrade`） |
| 内存包络 | `migration_faults::a_large_backup…`：对 CI 规模，迁移进程峰值工作集低于 300 MiB（见第 4 节） |

退出条件 ↔ Scope §23 “Migration”：合法导入（`lifecycle`、`oracle`）、历史语义（`history`、`conservation`）、Teacher Review 与 Translation 证据（`r-full`、C-2、硬 FK）、retry 血缘（响应级 provenance 含悬空者逐字携带；不做条目级推断）、媒体/引用完整性（`media`）、无静默数据丢失（突变击杀）、失败不破坏源数据（`blocking`、`preview`、`migration_faults`）。

## 4. 结果

本地（开发机，debug 测试配置；阈值取默认缩放值）：完整 workspace 套件通过，`clippy -D warnings` 干净，`rustfmt` 干净，18 个 JS 测试，（debug 构建的）启动冒烟通过，其 8 步 `--self-test` 含一次迁移导入 + 撤销。完整的 400 MiB 包络运行（533 MiB 备份文件）本地耗时 21 秒，迁移进程工作集峰值 10.3 MiB（上限 300 MiB）；dev profile 仅对 `sha2`、`qs-media`、`qs-migrate-v1` 开启优化，使此类测试保持快速。

CI（`windows-latest` 上的 `Desktop (V2)`，ADR 级阈值 `QS_MIG_KILLS=200`、`QS_H3_REPEATS=3`、`QS_HEAVY_MIB=400`）：Human Gate HOLD 收口在提交 `1eefb2f` 上**全绿**：[run 37039302072](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37039302072)。HOLD 之前的实现：提交 `4a2ad03` 上**全绿**，[run 37034644764](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37034644764)。首次运行（`3802ac6`）在随机 kill 套件中失败：身份探测用只读连接，无法在首次建库被杀后恢复遗留 WAL；已在 `4a2ad03` 修复（改为读写、不创建的探测）。

## 5. 提交 Human Gate 的实现澄清

以下均不改变 ADR 0002、Inventory 或 Scope Freeze 的任何政策；它们是实现不得不做的决定。请随里程碑一并评审。

1. **类别列表 payload。** V1 类别列表是数组，而 canonical payload 必须是对象，因此 `library_categories` 以固定 id `categories`（ADR §7.1）存储 `{"categories": [...]}`。固定单例 id 的后果：类别列表不同的两份备份会触发 `MIG_LIVE_CONFLICT`，绝不静默合并。
2. **Residue 包装。** `legacy_residue` 存储 `{"pointer", "value"}`（value 为逐字内容）。
3. **Remediation provenance 没有外键。** 它仅在 `provenance.purpose == "remediation"` 时适用，而投影指针无法表达条件。它由 P4 校验器保证，并由验证器检查 C-12 在 staging 之后**以及**提交之后再次证明（已被突变击杀覆盖）。`translation_document.folder_id` *是*真实 FK（V1 要求文档必须有文件夹）。
4. **比 ADR 文本更严格的地方**（均为阻断而非猜测）：超出 ±(2^53 − 1) 的整数 token 视为不安全；带首尾空白的 asset id 或媒体引用 id；缺失/非整数的声明 asset `size`；`mediaAssets` 与 `assets` 同时非空；文档没有可解析的 `folderId`；翻译条目位置不连续。差分 oracle 测试列出了 V1 接受而 ADR 要求阻断的三种情形。
5. **`MIG_OFFSET_SPLITS_SURROGATE` 对真实数据不可达。** 拆分代理对的偏移需要锚定文本内含孤立代理项，而 H-1 在 reader 即阻断（`MIG_SOURCE_LONE_SURROGATE`）；`blocking` 证明了该路径。为完整起见保留该可报告代码。
6. **额外诊断** `MIG_HISTORY_RESPONSE_KIND_MISMATCH`（`responseId` 解析到非 Objective response 的历史条目没有 twin）。`MIG_UNDO_REFUSED` 是一种*结果*（`Refused { reasons }`），不是注册表代码。
7. **撤销：所有权与处置分离**（*Human Gate HOLD 后修订，ADR §21 G-2*）。`migration_origin.disposition` 永远是原始迁移事实。当前删除所有权是单独的 origin 字段 `deletionOwner`（初始为 `disposition == carried`）。撤销某个 run 时，若它拥有的记录仍被另一活动 run 包含，则记录保留，并把 `deletionOwner` 置给这些持有者；它们的 `disposition` 不变。没有任何 origin 拥有的记录（迁移只做了去重的 V2 原生数据）永远不会被任何撤销删除。
8. **撤销的依赖检测** 覆盖硬外键与已登记的软探针（`teacher_review.response_id`、历史 `twin_response_id`、媒体引用）。*未来*领域的软依赖会在这些里程碑登记探针后变得可检测。
9. **Corrections 冲突规则。** V1 的“重叠的内容修改型 correction 冲突”规则不再重复校验（只按 ADR 0002 的规定校验 UTF-16 下的锚点/文本一致性）。
10. **非媒体 JSON 上限** 为固定常量 128 MiB（`MIG_SOURCE_TOO_LARGE`）；对被测的媒体密集型 fixture，实测进程峰值远低于该值。
11. **预检空间** 要求 staging 所在卷剩余 `2 × 源文件 + 64 MiB`（`MIG_INSUFFICIENT_SPACE`）；复制阶段的磁盘已满错误映射到同一代码。
12. **事后补 artifact**（*ADR §21 G-1*）。已迁移的 source 之后再提供一个合法、尚未保存的 recovery artifact 时，只做 artifact-only 保存：`plan.mode = "artifact-only"`，持久链接是一条 `migration_run` 行 `kind: "artifact-attach"`（`sourceId`、`recoveryId`、`attachedTo`），不写任何 canonical 记录、origin 或 import run。artifact 已保存则为 no-op；非法 artifact 仍然阻断。Settings 卡片有专门的“Preserve artifact”预览，run 列表会标出 attach 运行。
13. **包装记录**（*ADR §21 G-3*）。`library_categories`（`{categories}`）、`legacy_history_entry`（`{entry, role, ...}`）、`legacy_residue`（`{pointer, value}`）是保值的结构性映射：内部值被精确保留（验证器 C-2(b)）；不声称整份 payload 与源 JSON 哈希相等。

## 6. 未决事项（明确列出，未豁免）

- **手动打包检查 M1–M7**（V1 备份的原生打开对话框含中文与 OneDrive 重定向的源、确认/取消、被阻断的输入、可选 artifact、重复/撤销、≥ 400 MiB 导入）：[`manual-qa/v2-migration.zh-CN.md`](../manual-qa/v2-migration.zh-CN.md)。未执行；与 Desktop Foundation 的 D1–D4（同样保持开放）一样，属于不阻塞的验收欠账。
- S3 recovery blob 的接收按设计仍是手动文件（V1 没有它的导出路径；ADR 0002 §10.3）。
- 从未使用真实的 V1 数据；所有 fixture 均为合成数据。

## 7. 如何运行

```text
node desktop/scripts/gen-v1-fixtures.mjs                      # 用 V1 自己的 producer 重新生成 fixture（必须是空操作）
cargo test -p qs-migrate-v1                                    # 迁移器套件（oracle 需要 Node）
cargo test -p qs-scenarios --test migration_faults -- --nocapture
    # QS_H3_REPEATS=3  QS_MIG_KILLS=200  QS_HEAVY_MIB=400     # CI 阈值
```

## 8. Gate 就绪

实现完成；ADR 0002 §16 已实现为自动化测试，本地通过并已接入 Windows CI workflow。Human Gate 先将里程碑置为 HOLD（ADR 0002 §21 收口，已实现且 CI 全绿），随后**通过：Migration 里程碑已验收（ACCEPTED）**。

## 9. Human Gate 结论：已验收

里程碑已验收。**手动打包检查 M1–M7（§6）与 Desktop Foundation 的 D1–D4 继续保持 open、不阻塞的验收欠账：未通过（not PASS）、未豁免、未删除。** Scheduler / Recommendation / Calendar 的实现**未获授权**；架构决策 [ADR 0003](adr/0003-learning-orchestration-scheduling-recommendation-calendar.md)（ACCEPTED — GO WITH AMENDMENT；Learning Orchestration + Calendar 里程碑随后已实现，见[记录](V2_ORCHESTRATION.zh-CN.md)）。
