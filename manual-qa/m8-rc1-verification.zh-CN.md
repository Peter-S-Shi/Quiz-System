# Milestone 8 — Release Candidate 1 (`v1.0.0-rc.1`) 验证清单

本文件为 Quiz Studio Release Candidate 1 (`v1.0.0-rc.1`) 建立精确的候选版本验证合同。

## 候选版本元信息

- **候选版本 Tag**：`v1.0.0-rc.1`
- **候选版本提交 SHA**：`f33bafcfe42ac8dd521466026c343102dc18897a`
- **候选版本提交身份**：PR #25 中冻结并打上 `v1.0.0-rc.1` tag 的精确产品提交快照
- **Feature Freeze**：ACTIVE（已激活）
- **Milestone 7 Product Hardening**：COMPLETE / ACCEPTED（292 项测试全绿，H-01 解决，C1–C4 PASS）
- **Milestone 8 状态**：ACTIVE（基于 PR #25 统一执行；Batch A 候选版本准备已完成；Batch B Agent 检查完成；Batch C 人工验收推进中）
- **公开正式发布授权**：NOT AUTHORIZED（仅用于 RC 验证；公开 Pages 与正式 GitHub Release 延期）

---

## 验证矩阵

| 验证领域 | 验证范围 | 目标环境 | 状态 | 证据 / 备注 |
| :--- | :--- | :--- | :--- | :--- |
| **1. 自动化套件** | 干净执行 `npm ci` 与 `npm run check`（292 测试） | Node.js 20+ / Windows & Ubuntu | **PASS** | 精确候选 SHA 上通过 292/292 测试（0 失败、0 跳过，耗时 1663 ms） |
| **2. CI 流水线** | GitHub Actions 工作流执行 | Ubuntu runner (`ubuntu-latest`) | **PASS** | 候选提交 `f33bafcfe42ac8dd521466026c343102dc18897a` CI 全绿 |
| **3. 干净 Windows 启动** | 干净目录 clone/checkout、`start-local.bat`、环回 `localhost:8000`、干净启动/重启 | Windows 11 (64-bit) | **PENDING** | 自动化合同通过；真实浏览器启动流程就绪供 Product Owner 验收 |
| **4. 浏览器矩阵** | 受支持浏览器上的受限冒烟测试 | Google Chrome, Microsoft Edge, Mozilla Firefox (Windows) | **PENDING** | 已就绪供 Product Owner 在 Batch C 中进行冒烟测试 |
| **5. 托管 PWA** | HTTPS 测试源：SW 注册、在线使用、离线重新打开/使用、重回在线恢复 | 生产 HTTPS 测试源 | **PENDING** | 已就绪供 Product Owner 在 Batch C 中进行真实源验证 |
| **6. 累积数据可移植性** | 代表性累积全量备份导出 → 新配置文件恢复 → 数据完整性比对 | Node.js / 核心 API | **PASS** | 有界全量备份/恢复往返实测验证通过（5305 字节，覆盖试卷、媒体、翻译、评阅与血缘） |
| **7. 原生文件选择器** | Teacher Review 导入与补救 Translation Document 导入使用原生 OS 文件对话框 | Windows 11 文件对话框 | **PENDING** | 已就绪供 Product Owner 在 Batch C 中使用系统文件对话框验证 |
| **8. 发布安全性** | 隐私、凭据、机器特异性绝对路径与 prompt-draft 扫描 | 仓库源码树 | **PASS** | 零私有凭据、零机器路径、零未跟踪 draft |
| **9. 合成示例审计** | 审计已提交的示例试卷、备份、评阅与示例文件 | `examples/`, `manual-qa/samples/` | **PASS** | 确认所有提交的示例资产均为严格合成数据 |
| **10. 已知局限性确认** | 准确披露并确认已知边界 | 文档审查 | **PASS** | 本地存储配额、手动文件交换、无内置 AI |
| **11. macOS 环境** | 在 macOS 上干净 clone 与运行 | macOS / Safari | **DEFERRED / NOT VERIFIED** | 明确延期，位于已验证 Windows/Ubuntu 边界之外 |
| **12. PO 最终 RC 验收** | Product Owner 对精确 RC 候选版本的全量审查与验收 | Product Owner 审查 | **PENDING** | 统一的最终 RC 人工验收门（Batch C） |

---

## Milestone 8 RC1 退出条件

Milestone 8 RC1 验证只有在以下条件全部满足时方可宣布 PASS：
1. 精确候选 tag `v1.0.0-rc.1` 已在 PR #25 中冻结的候选提交快照上打出（`f33bafcfe42ac8dd521466026c343102dc18897a`）。
2. 矩阵项 1、2、6、8、9、10 均已通过并附带 Agent 可执行记录证据（`manual-qa/m8-b-exact-candidate-verification.zh-CN.md`）。
3. 真实人工/原生环境矩阵项 3、4、5、7 在 Batch C 中获得 Product Owner 正式验收。
4. 矩阵项 11 保持诚实地记录为 **DEFERRED / NOT VERIFIED**。
5. 矩阵项 12 获得 Product Owner 的正式人工验收（Batch C）。
6. PR #25 在打 Tag 后的所有后续提交仅限添加验证记录与生命周期证据，绝不包含任何产品/运行时代码变更（如有产品代码变更必须废弃当前候选版本并创建 `v1.0.0-rc.2`）。
7. PR #25 只有在全部退出条件满足并获得 Product Owner 验收后，方可最终合并入 `main`。
