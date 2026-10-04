# Quiz Studio

<p align="center">
  <img src="assets/readme/quiz-studio-v2-hero-banner.png" alt="Quiz Studio —— 证据优先、本地优先的桌面学习工作台" width="100%">
</p>

<p align="center">
  <strong>一款以学习证据为核心，连接刻意练习、学习安排、批改与长期记录的 Windows 桌面工作台。</strong>
</p>

<p align="center">
  引擎负责推荐；学习者保留决定权。
</p>

<p align="center">
  <a href="https://github.com/Peter-S-Shi/Quiz-System/releases/tag/v2.0.0"><strong>下载 v2.0.0</strong></a>
  ·
  <a href="#看看真实产品">看看真实产品</a>
  ·
  <a href="#工程深度">工程设计</a>
  ·
  <a href="docs/V2_QUICKSTART.zh-CN.md">快速上手</a>
  ·
  <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/Peter-S-Shi/Quiz-System/releases"><img alt="Release" src="https://img.shields.io/github/v/release/Peter-S-Shi/Quiz-System?display_name=tag"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-2563eb">
  <img alt="Local first" src="https://img.shields.io/badge/data-local--first-15803d">
  <img alt="Desktop" src="https://img.shields.io/badge/desktop-Tauri%202-24C8DB">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-informational"></a>
</p>

Quiz Studio 围绕一个很简单的学习原则构建：

> **证据是规范事实；解释可以被替换。**

你真正答过什么、打过什么、标记过什么、接受过怎样的批改、如何重练与安排学习，都应该能够被回看，而不应该被后续编辑、推荐或评价悄悄改写。

Quiz Studio 把 **客观题（Objective）**、**翻译（Translation）** 与 **跟打（Typing）** 放进同一个本地优先桌面工作区，再通过 **Evidence History、Review、Today 与 Calendar** 把一次练习连接到下一次练习，同时保留学习者的最终决定权。

---

## 看看真实产品

下面的画面来自正式发布的 **v2.0.0** Windows 桌面版本，并使用合成演示数据。

<p align="center">
  <img src="assets/readme/quiz-studio-v2-product-proof.png" alt="Quiz Studio 产品实机：Today、Calendar、Library 与 Focused Practice" width="100%">
</p>

Quiz Studio 不是“一个刷题页加一个历史记录页”。它把材料、练习、证据、批改与安排连接成一个完整工作流，同时保持这些概念之间清晰的边界。

---

## 为什么做 Quiz Studio？

| 历史证据保持诚实 | 推荐保持可解释 | 数据保持在自己手里 |
| --- | --- | --- |
| 完成后的练习以事实记录保存。之后编辑或删除源材料，不会静默改写已经发生的学习历史。 | Today 与 Calendar 可以说明“为什么值得练”，但学习者可以忽略、改期、手动开始，或选择别的 Domain / Intent。 | 核心数据保留在本机。正常使用不需要账号、云数据库、遥测服务或内置远程 AI。 |

---

## 一个工作区，三个学习 Domain

### Objective｜客观题

支持五种基础题型：单选、多选、填空、判断与一对一匹配。

Objective Practice 支持：

- **即时反馈**或**整卷提交后反馈**；
- 单次会话可选题目顺序打乱；
- 图片与音频附件；
- 在正确反馈时机显示 Answer Explanation；
- 错题重练；
- 完成后的结果快照保留当时的答案、解释与媒体语境。

### Translation｜翻译

Translation 被刻意设计为定性练习，不把复杂译文压缩成一个虚假的分数。

学习者可以：

- 逐句翻译；
- 在提交前标记自己的不确定内容；
- 把原始 Learner Response 保存为只读证据；
- 创建或导入独立 Teacher Review；
- 整体重练或针对 Needs-Work 条目重练；
- 用可移植文件交换 review request 与 teacher review。

### Typing｜跟打

Typing 关注“最终提交的文本”而不是原始键盘事件。

它支持：

- 长文本练习；
- 真实输入法提交文本；
- Practice / Test intent；
- 确定性的 grapheme-level comparison；
- 对剩余错误进行重练；
- 记录完成耗时与不可变 attempt；
- 中断后恢复，而不把 WPM 或 accuracy 伪装成 mastery。

---

## 从练习，到证据，再到下一次练习

<p align="center">
  <img src="assets/readme/quiz-studio-v2-evidence-loop.png" alt="Quiz Studio 学习闭环：练习、证据历史、批改、重练与下一次安排" width="100%">
</p>

```text
学习材料
   │
   ▼
Focused Practice
   │
   ▼
Canonical Evidence
   │
   ├────────► Teacher Review / 外部批改
   │
   ├────────► Retry / Remediation
   │
   └────────► Today / Calendar 推荐
                         │
                         ▼
                    学习者决定
```

这几个概念被刻意分开：

- **Evidence** 记录“发生了什么”；
- **Review** 添加解释，但不修改原始答案；
- **Scheduling** 添加上下文，但不成为 Evidence；
- **Recommendation** 是可替换的派生结果，而不是事实本身。

---

## 安排学习，但不替学习者做主

Quiz Studio 提供的是轻量学习安排，而不是一个完整生产力规划器。

**Today** 会呈现：

- 今天到期的练习；
- Overdue；
- 未完成 session；
- 带可读理由的 Suggested Practice。

**Calendar** 提供 date-only 学习安排、重复计划、改期、取消与 occurrence-level 操作。

最重要的原则是：

> **用户手动建立的 schedule 拥有最终主权。**

引擎不会偷偷覆盖学习者安排；发生冲突时，产品展示差异，而不是替用户做决定。

---

## Review、Remediation 与 Open Teaching Interchange

Translation learner response 是不可变证据；Teacher Review 是另一条独立记录。

因此，真人教师或外部 AI 可以批改答案，却不会覆盖学习者最初写下的内容。

Quiz Studio 支持基于文件的 **Open Teaching Interchange**：

```text
Learner Response
      │
      ▼
review-request.json
      │
      ├────► 真人教师
      └────► 外部 AI
                    │
                    ▼
          teacher-review.json
                    │
                    ▼
             Quiz Studio Review
                    │
                    ▼
          Retry / remediation
```

应用内部不需要 API Key，也不要求云端账号。只有学习者主动导出文件时，数据才离开产品数据边界。

---

## Library、Evidence History 与长期记录

**Library** 保存学习材料，不保存历史 attempt。每一项只展示事实状态：

- **Not started**
- **In progress**
- **Practiced**

这些是运行状态，不是 mastery 标签。

**Evidence History** 保存完成后的练习记录。即使源材料之后被编辑或删除，历史 attempt 依然保持原样。

材料可以编辑；历史证据不能被静默重写。

---

## Local-first by design

```text
Objective · Translation · Typing 材料
                 │
                 ▼
          Focused Practice
                 │
                 ▼
     SQLite + content-addressed media
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
Evidence / Review      Backup / Restore
       │
       └─────────► 你的 Windows 设备
```

核心使用是本地且离线的：

- 无账号；
- 无托管数据库；
- 无遥测；
- 无远程 AI 依赖；
- 无 CDN / 网络字体依赖；
- 浏览器 origin storage 不承担 canonical data。

唯一安装阶段的网络例外，是设备缺少 WebView2 Runtime 时由安装程序执行 bootstrap。

---

## 备份、恢复与 V1 迁移

Quiz Studio V2 把数据耐久性当成产品能力，而不是附加功能。

### Backup / Restore

**Exchange & backup** 会创建包含结构化数据与 media 的版本化归档。Restore 会在正式激活之前完成验证，并在替换现有状态前保存安全快照。

### V1 → V2 Migration

桌面版可以通过 staged migration 导入 Quiz Studio V1 backup。

迁移会尽可能保留受支持的历史记录、media 引用、Teacher Review、retry lineage、已有时间戳与 recovery artifacts；遇到歧义、损坏或无法证明安全的数据时会 fail closed，而不是静默丢弃。

---

## 工程深度

Quiz Studio 的 portfolio 价值来自产品背后的工程判断，而不是依赖项数量。

| 工程方向 | 项目体现 |
| --- | --- |
| **Evidence-first domain architecture** | Evidence、Scheduling Context、Review 与 Recommendation 分离，而不是塞进一个万能记录。 |
| **本地优先桌面耐久性** | Rust-owned SQLite、单 Unit of Work、staging / activation、snapshot、recovery 与 content-addressed media。 |
| **Loss-aware migration** | V1 intake 只读、分阶段、schema detection、preview、atomic activation，并有明确 conservation contract。 |
| **Learner-sovereign orchestration** | Date-only schedule、recurrence、occurrence identity、manual ownership、可解释 recommendation。 |
| **输入正确性** | Typing 使用项目控制的 grapheme comparison，并接收 IME committed text，而不是只依赖 composition lifecycle。 |
| **桌面真实验证** | Windows 安装、clean install、upgrade preservation、uninstall、packaged smoke、crash/recovery 与 exact-candidate SHA-256。 |
| **风险分级交付** | 开发、milestone、hardening 与 RC 使用不同深度的验证，而不是每次修改都跑同一套重型 CI。 |

<p align="center">
  <img src="assets/readme/quiz-studio-v2-engineering-journey.png" alt="Quiz Studio V2 从浏览器版基线到 Windows 正式发布的工程旅程" width="100%">
</p>

V2 经历了完整的产品生命周期：

```text
V1 baseline
   ↓
Desktop Foundation
   ↓
V1 Migration
   ↓
Scheduling + Recommendation
   ↓
Objective / Translation / Typing integration
   ↓
Focused Practice + Product UI
   ↓
Human Evaluation
   ↓
Product Hardening
   ↓
Release Candidate
   ↓
Quiz Studio 2.0.0
```

更完整的验证记录见 [PROJECT_STATUS.md](PROJECT_STATUS.md)、[ROADMAP.md](ROADMAP.md) 与 [docs/V2_RELEASE_CANDIDATE.md](docs/V2_RELEASE_CANDIDATE.md)。

---

## 下载 Quiz Studio 2.0.0

### Windows

1. 打开 [Quiz Studio v2.0.0 GitHub Release](https://github.com/Peter-S-Shi/Quiz-System/releases/tag/v2.0.0)。
2. 下载 `quiz-studio_2.0.0_x64-setup.exe`。
3. 如需校验，可用 `SHA256SUMS.txt` 对照 SHA-256。
4. 运行 per-user installer。
5. 从开始菜单启动 **Quiz Studio**。

正常安装不需要管理员权限。

安装包目前未进行代码签名，因此 Windows 可能显示 unknown publisher / unrecognized app 提示。

---

## 2.0.0 已知限制

- **仅验证 Windows。** Windows 11 / WebView2 是正式验证平台；macOS 与 Linux 未支持、未验证。
- **安装包未签名。** Code signing 不属于 2.0.0 范围。
- **没有自动更新。** 更新仍是手动下载新 Release 并安装。
- **超大历史会增加读取时间。** 在约 5,000 个 completed sessions 的 release build 实测中，Library 约 0.9 秒、Today 约 1.6 秒进入 ready；没有发现数据完整性问题。
- **Export 直接写入用户选中的目标文件。** 它不会修改 Quiz Studio canonical store，但选中的 export file 会被原地写入。

---

## 有意保留的产品边界

Quiz Studio 2.0.0 并不试图成为：

- 云账号平台；
- 协作 SaaS；
- 完整 Goal / Exam / workload planner；
- mastery scoring engine；
- gamified streak system；
- 内置 AI Tutor；
- 会覆盖用户决定的自动 schedule 引擎；
- macOS 产品。

外部 AI 可以通过 review 文件参与，但 Quiz Studio 的核心能力并不依赖它。

---

## 技术栈

**Desktop：** Tauri 2 · Rust · WebView2 · Windows/MSVC · NSIS  
**本地数据：** SQLite · content-addressed media · staged activation / recovery  
**UI：** HTML · CSS · JavaScript ES modules  
**测试：** Node test runner · Rust tests · headless Edge · packaged WebView2 checks · installer/upgrade acceptance  
**交付：** GitHub Actions · GitHub Releases

技术选择服务于产品架构，而不是产品故事本身。

---

## 从源码构建

正式桌面开发环境与命令以 [`desktop/README.md`](desktop/README.md) 为准。

Windows release path 使用 MSVC Rust toolchain、Node 22+ 与 Tauri CLI 2.12.1。

```powershell
cd desktop
. .\scripts\env.ps1

node --test "ui/tests/*.spec.mjs"
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace --exclude qs-desktop

cd app/src-tauri
cargo tauri build --bundles nsis
```

Packaged app、migration、fault-injection、recovery 与 installer acceptance 的详细说明见 [`desktop/README.md`](desktop/README.md) 与各 V2 milestone 文档。

---

## 深入技术文档

- [`docs/V2_QUICKSTART.zh-CN.md`](docs/V2_QUICKSTART.zh-CN.md) — 正式桌面版快速上手
- [`V2_PRODUCT_SCOPE_FREEZE.md`](V2_PRODUCT_SCOPE_FREEZE.md) — V2 产品边界与冻结范围
- [`docs/V2_DESKTOP_FOUNDATION.md`](docs/V2_DESKTOP_FOUNDATION.md) — 桌面架构与耐久性基础
- [`docs/V2_MIGRATION.md`](docs/V2_MIGRATION.md) — V1 → V2 migration 架构与证据
- [`docs/V2_ORCHESTRATION.md`](docs/V2_ORCHESTRATION.md) — scheduling、recommendation 与 Calendar
- [`docs/V2_TASK_DOMAINS.md`](docs/V2_TASK_DOMAINS.md) — Objective、Translation、Typing 与 evidence integration
- [`docs/V2_PRODUCT_UI.md`](docs/V2_PRODUCT_UI.md) — 最终产品 UI integration
- [`docs/V2_HARDENING.md`](docs/V2_HARDENING.md) — Product Hardening 证据
- [`docs/V2_RELEASE_CANDIDATE.md`](docs/V2_RELEASE_CANDIDATE.md) — RC / Release provenance 与 exact-candidate evidence
- [`PROJECT_STATUS.md`](PROJECT_STATUS.md) — 当前生命周期状态
- [`ROADMAP.md`](ROADMAP.md) — milestone 历史

---

## V1 历史版本

Quiz Studio V1（`v1.0.0`）继续保留在本仓库中，作为早期浏览器版本以及 V2 migration source。

V1 的浏览器架构、public JSON schema、Open Teaching Interchange 与历史文档仍然是项目演进的重要证据，但**当前正式产品是 Quiz Studio V2 `2.0.0`**。

---

## Release status

**当前版本：** `v2.0.0`  
**生命周期：** Released / Maintenance  
**正式验证平台：** Windows  
**License：** [MIT](LICENSE)

V2 在发布前完成了 Feature Freeze、Product Hardening、exact-candidate CI-L3、Windows packaged acceptance 与 Human RC Gate。
