# V2 Desktop Foundation —— 里程碑记录

**分支：** `v2`（长期 V2 开发线，自 `main@8eb6608` 切出）
**状态：** **已验收（ACCEPTED）**（Desktop Foundation Human Gate PASS，2026-10-02），期间经过两次限定范围的修复（第 8、9 节）；验收欠账 D1–D4 保持开放，作为不阻塞的打包/手动验收欠账（第 10 节）
**权威输入：** `V2_PRODUCT_SCOPE_FREEZE.md` Revision 1（§5.1、§24）、ADR 0001（已接受，含修订 A1–A8）、`docs/V2_UI_ARCHITECTURE_FREEZE.md`、`docs/adr/evidence/0001-desktop-spike-report.md`。
**代码：** [`desktop/`](../desktop/README.md)。V1 生产代码、测试与 CI 均未改动。

## 1. 目标

建立正式、可持续的桌面基础，供后续所有 V2 里程碑依赖：Tauri 2 + WebView2 外壳、由 Rust 持有的持久化边界（单一 SQLite store）、带 payload/projection 一致性的 Unit of Work、内容寻址媒体、统一的 staging/activation/rollback 原语、V2 archive、稳定的应用身份，以及 Windows 构建/打包 CI。

## 2. 范围与非目标

| 范围内 | 明确不在范围内（保持不变、未启动） |
|---|---|
| Tauri 2 外壳、单实例、严格 CSP、白名单 IPC | V1 迁移读取/实现（Migration ADR 尚未开始） |
| Store（catalog 驱动）、Unit of Work、projection、schema 所有权 | Scheduler / Recommendation / Calendar 的表或逻辑 |
| 媒体库、activation/rollback/recovery、V2 archive | Objective / Translation / Typing 领域集成 |
| 应用身份、版本、数据根、NSIS 按用户安装包 | 产品视图（外壳仅用于证明基础可运转） |
| Windows CI、已安装应用验收、故障/崩溃测试套件 | 代码签名、自动更新、macOS、最终应用图标 |

领域表结构按设计保持未定（ADR 0001 §12），因此基础里程碑只提供结构性 collection（`media_object`、`setting`、`recovery_session`）；领域 collection 以后以 catalog migration 方式加入。

## 3. 实际架构

```text
WebView（离线外壳，JS）                           desktop/ui/web
   │  唯一命令 `port`（白名单）+ native_* 命令（路径不进入 JS）
   ▼
Tauri 外壳 (qs-desktop)                           desktop/app/src-tauri
   ▼
qs-port   与运行时无关的 Store Port（JSON 入、envelope 出）、健康闸门、快照、离线恢复、自测
   ├─ qs-archive     zip + 逐文件 SHA-256 manifest · 全量校验后才激活 · 明确的拒绝码
   ├─ qs-activation  staging · 校验 · 快照 · ATTACH 单事务提交 · 回滚 · journal 恢复
   ├─ qs-media       不可变内容寻址文件 · 流式写入 · gc
   └─ qs-store       catalog · 规范化 JSON · Unit of Work · projection · 一致性检查 · schema 所有权
        └─ qs-platform   错误码 · 数据根布局 · fsync/原子发布/重试 · 进程锁 · 长路径 · 故障钩子
```

`qs-testkit`（合成 catalog/数据）与 `qs-scenarios`（子进程故障场景）仅用于测试，不随产品发布。

### 实现中做出的决定（均在 ADR 0001 范围内，无一重开 ADR）

1. **catalog 驱动的 store**：catalog = 前向 migration + 对每个 collection 的声明式描述（类型化 projection 列、多值关系行、身份指针、canonical / 仅恢复用）。Store Port 对任意给定 catalog 强制 payload/projection 契约，不硬编码领域表。
2. **修订号**：每个 collection 行带 store 管理的 `rev`；Unit of Work 可声明 `absent` / `exists` / `rev = N` 前置条件。
3. **schema 升级**：先自动快照，再在**一个事务**内执行整条 migration 链，提交前核对 catalog 与实际 schema；失败时以物理哈希证明 store 未变（否则从快照文件恢复）。升级失败时应用拒绝降级运行。
4. **JS 负责 projection、Rust 负责验证**：`schema.info` 发布声明式 collection spec；`projection.js` 据此构造 projection；Rust 重新计算并拒绝不一致者；共享 fixture 保证两端一致。
5. **规范化 JSON** 只定义一次、实现两遍（Rust、JS），以共享向量验证。跨语言运行发现了一处真实的 ECMAScript 平局舍入差异（`153924.33520507812`），已修复并永久纳入测试（40,012 向量全部一致）。
6. **原生文件流程归 Rust**：打开/保存对话框、拖放与流式写入均在 Rust；WebView 不接触原始路径，也没有文件系统、shell 或对话框能力。WebView 白名单（`qs_port::webview::ALLOWLIST`）不含携带路径的命令（`media.ingest_file`、`backup.*`）和文件系统维护（`media.gc` 仅由 Rust 维护路径以固定 24 小时安全延迟执行），见第 8 节。
7. **故障注入是编译期 feature**，仅测试场景 crate 启用；CI 断言发布二进制中没有该钩子。
8. **健康闸门**：启动 `quick_check` 或 `check_consistency` 失败即拒绝写入且不自动修复；数据库无法打开时显示恢复界面，可用所选快照恢复，并逐字节保留损坏文件。

## 4. 验收证据

阈值即 ADR/合同阈值，未更改。

| 退出条件 | 证据 |
|---|---|
| 外壳可构建、安装、独立启动 | `cargo tauri build --bundles nsis`（3 MiB 按用户安装包）；`package-test.ps1`：静默安装、已安装 exe 冒烟、同标识升级、静默卸载 |
| 规范数据脱离浏览器源存储 | `boundary.spec.mjs`；启动次数与侧栏宽度经 Rust store 往返并在强制结束后保留 |
| store/media/activation/archive 基础 | 18 + 9 + 11 + 7 + 7 + 3 个 Rust 测试，15 个 JS 测试 |
| H2 类崩溃安全 | **500 次强制 kill**，约 12,100 个已确认 UoW，0 违规 |
| H3 类 activation 故障 | 6 个检查点 × 2 模式 × 3 次 + 回滚中 kill：状态恰为 pre 或恰为 post；恢复确定且幂等；回滚还原精确 pre 状态 |
| H4/H5 类媒体与 archive | 400 MiB 流式写入/归档/恢复子进程峰值 5–8 MiB（上限 300）；14 种命名篡改与位翻转循环均在激活前被拒绝 |
| JS ↔ Rust ↔ DB 保真 | 40,012 向量（本地）、CI 5,000 向量，0 不一致 |
| Windows CI 绿色 | [Desktop (V2) 运行记录](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37012332165)（`windows-latest`，rustc 1.99，MSVC，静态 CRT）：fmt、clippy `-D warnings`、按 ADR 阈值的 JS + Rust 套件、应用二进制可复现（两次构建 SHA-256 相同）、发布二进制无故障钩子、NSIS 安装 → 已安装 exe 冒烟 → 升级（数据保留）→ 静默卸载（数据保留，使用真实 `%LOCALAPPDATA%`）—— 首次运行即全部通过 |
| V1 生产线未改动 | `desktop/`、`docs/`、状态文件、`.gitignore` 与新 workflow 之外无改动；V1 `ci.yml` 未动 |
| 未开始迁移实现 | 无；Migration ADR 尚未开始 |

## 5. 自 Architecture Gate 移交的遗留项

| 项目 | 状态 |
|---|---|
| 原生**打开**对话框 | 已实现，未做自动化往返 → 验收欠账 D1（手动步骤见 `manual-qa/v2-desktop-foundation.zh-CN.md`） |
| ≥ 1 GiB OS **拖放** | 已实现；无界面流式写入已在 400 MiB 验证；OS 拖放 ≥ 1 GiB 未执行 → D2 |
| **OneDrive 重定向**桌面/文档 | 未执行 → D3 |
| 无运行时机器上的 WebView2 **downloadBootstrapper** | 仅有静态证据 → D4（环境不可得） |

其他未决项（不阻塞基础里程碑）：最终应用图标（目前为中性占位图标）、内置 CJK 字体（外壳使用系统字体且不引用网络资源）、代码签名、自动更新、标准用户安装测试（无管理员权限无法创建标准用户）。

## 6. 运行方式

见 [`desktop/README.md`](../desktop/README.md)。

## 7. Gate 就绪情况

除验收欠账 D1–D4（产品负责人可接受、排期或手动执行）外，退出条件均已满足。V1 Migration、Scheduler、Calendar 与各领域集成均未启动。已被第 10 节取代：Human Gate 已通过，V1 Migration ADR（ADR 0002）为当前活跃的下一阶段；Migration 实现尚未开始。

## 8. Human Gate HOLD：原始路径边界修复

Human Gate 发现首版违反了已声明的边界“原始文件系统路径不进入 WebView/JS”：`schema.info` 返回绝对数据根，原生入库结果返回绝对媒体路径并被 `app.js` 传给 `convertFileSrc`，且 `media.gc`（含 WebView 提供的 `minAgeSeconds`）可由 WebView 调用。修复（范围严格受限，无新增架构）：

- `schema.info` 不再返回数据根；`media.locate` 不再返回路径；原生媒体结果以无路径方式构造（`webview::media_ingest_result`）；外壳不显示路径，也取消了媒体预览（移除 asset protocol 及其作用域，不透明媒体服务推迟到首个需要显示媒体的里程碑）。
- WebView 入口为 `qs_port::webview::dispatch`：白名单（已移除 `media.gc`）→ 命令 → 仅对失败诊断信息做清洗（见第 9 节）。
- 媒体 GC 仅由 `Core::maintenance_gc` / 启动流程执行，固定 24 小时安全延迟；`media.gc` 命令已不存在。
- 删除 JS `verifyBackup(path)`；测试断言 JS Store Port 接口与白名单一致且不带路径参数。
- 回归测试：`core/port/tests/webview_contract.rs` 与 `ui/tests`；现有 store/media/activation/archive 契约不变。
- ADR 0001：升级失败时拒绝运行已写入第 7 节（规范性文本），第 15 节标记为已接受的实现澄清。
- D1–D4 仍为未执行的验收欠账（未标 PASS，不阻塞）。

## 9. Human Gate HOLD 跟进：结构化契约取代整体脱敏

第 8 节的修复引入了一个保真缺陷：`dispatch` 对**整个** envelope 做通用 scrub，导致用户写入的、仅仅“长得像路径”的文本（`C:\Windows\System32`、`/home/alice/file`、`\\server\share\doc`）在 `store.read` 的 payload 中被改写为 `<path>`。两条约束必须同时成立——内部路径不泄露、用户内容无损往返——因此边界改为结构化契约：

- 系统生成的结果（`schema.info`、`media.locate`、快照列表、原生媒体/备份结果）**按构造即无路径**并有测试保证，不做后处理。
- 规范 payload、projection 和任何用户内容**永不改写**。
- 只清洗系统生成的诊断信息：失败 envelope 的 `error.message`（`sanitize_envelope`），以及应用构造启动/恢复状态和一致性问题详情时的同一字段（`sanitize_message`）。清洗器先替换字面数据根，再处理盘符路径（允许空格）、UNC 与 `\\?\` verbatim 路径及常见 Unix 根目录。
- 回归测试（`core/port/tests/webview_contract.rs`）：包含 Windows/Unix/UNC 路径样式文本（也作为对象键、以及用户自己的 `error.message` 字段）的规范 payload 经 WebView 提交并读回，规范哈希一致且无任何 `<path>`/`<data folder>`（该测试对旧的整体 scrub 为红）；含空格 Windows、verbatim、UNC、Unix 路径的错误诊断被清洗且保留上下文；成功结果及失败 envelope 的 `result` 永不被触碰；系统响应不含真实数据根；禁用命令仍被拒绝。
- store/media/activation/archive 语义未变；D1–D4 仍为未执行验收欠账；当时里程碑仍等待 Human Gate 复审（历史记录；已被第 10 节取代：已验收）。

## 10. Human Gate 结论：ACCEPTED

产品负责人在边界修复（第 8 节）与结构化契约保真修复（第 9 节）之后通过了 Desktop Foundation Human Gate（**PASS - ACCEPTED**，2026-10-02）。`v2` 仍是长期 V2 开发分支，**不**合并到 `main`。

| 项目 | 验收后状态 |
|---|---|
| Desktop Foundation 退出条件 | 已满足（第 4 节）；被验收提交的 Windows CI 为绿色 |
| D1 原生打开对话框自动化往返 | **开放 —— 不阻塞的打包/手动验收欠账**（未标 PASS，未删除） |
| D2 ≥ 1 GiB OS 拖放 | **开放 —— 不阻塞的打包/手动验收欠账** |
| D3 OneDrive 重定向桌面/文档 | **开放 —— 不阻塞的打包/手动验收欠账** |
| D4 无运行时 WebView2 的 `downloadBootstrapper` | **开放 —— 不阻塞的打包/手动验收欠账**（仅静态证据） |
| 其他未决项 | 最终应用图标、内置 CJK 字体、代码签名、自动更新（不变） |

下一阶段：**V1 Migration ADR（ADR 0002）** 为活跃阶段，它约束 Migration 里程碑。**Migration 实现尚未开始**；Scheduler / Recommendation / Calendar 与各领域集成同样尚未开始。
