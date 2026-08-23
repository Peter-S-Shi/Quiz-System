# Milestone 8 — Release Candidate 1 (`v1.0.0-rc.1`) 验证清单

本文件为 Quiz Studio Release Candidate 1 (`v1.0.0-rc.1`) 建立精确的候选版本验证合同。

## 候选版本元信息

- **候选版本 Tag**：`v1.0.0-rc.1` *(待 Product Owner 合并 Batch A 后正式打 Tag)*
- **候选版本提交 SHA**：*(待合并后的 main 基线提交)*
- **Feature Freeze**：ACTIVE（已激活）
- **Milestone 7 Product Hardening**：COMPLETE / ACCEPTED（292 项测试全绿，H-01 解决，C1–C4 PASS）
- **公开正式发布授权**：NOT AUTHORIZED（仅用于 RC 验证）

---

## 验证矩阵

| 验证领域 | 验证范围 | 目标环境 | 状态 | 证据 / 备注 |
| :--- | :--- | :--- | :--- | :--- |
| **1. 自动化套件** | 干净执行 `npm ci` 与 `npm run check`（292 测试） | Node.js 20+ / Windows & Ubuntu | **PENDING** | 精确候选提交上必须通过 292/292 测试，0 失败 |
| **2. CI 流水线** | GitHub Actions 工作流执行 | Ubuntu runner (`ubuntu-latest`) | **PENDING** | CI 自动化验证 |
| **3. 干净 Windows 启动** | 干净目录 clone/checkout、`start-local.bat`、环回 `localhost:8000`、干净启动/重启 | Windows 11 (64-bit) | **PENDING** | 严格 8000 端口，环回地址零生产 SW 注册 |
| **4. 浏览器矩阵** | 受支持浏览器上的受限冒烟测试 | Google Chrome, Microsoft Edge, Mozilla Firefox (Windows) | **PENDING** | 在各浏览器中验证编辑、做题、历史与主题切换 |
| **5. 托管 PWA** | HTTPS 测试源：SW 注册、在线使用、离线重新打开/使用、重回在线恢复 | 生产 HTTPS 测试源 | **PENDING** | 离线壳缓存与动态用户数据保持 |
| **6. 累积数据可移植性** | 代表性累积全量备份导出 → 新配置文件恢复 → 数据完整性比对 | Chrome / Edge | **PENDING** | 有界真实长期使用状态（试卷、作答、评阅、溯源） |
| **7. 原生文件选择器** | Teacher Review 导入与补救 Translation Document 导入使用原生 OS 文件对话框 | Windows 11 文件对话框 | **PENDING** | 真实 OS 文件选择与导入往返 |
| **8. 发布安全性** | 隐私、凭据、机器特异性绝对路径与 prompt-draft 扫描 | 仓库源码树 | **PENDING** | 零私有凭据、零机器路径、零未跟踪 draft |
| **9. 合成示例审计** | 审计已提交的示例试卷、备份、评阅与示例文件 | `examples/`, `manual-qa/samples/` | **PENDING** | 确认所有提交的示例资产均为严格合成数据 |
| **10. 已知局限性确认** | 准确披露并确认已知边界 | 文档审查 | **PENDING** | 本地存储配额、手动文件交换、无内置 AI |
| **11. macOS 环境** | 在 macOS 上干净 clone 与运行 | macOS / Safari | **DEFERRED / NOT VERIFIED** | 明确延期，位于已验证 Windows/Ubuntu 边界之外 |
| **12. PO 最终 RC 验收** | Product Owner 对精确 RC 候选版本的全量审查与验收 | Product Owner 审查 | **PENDING** | 统一的最终 RC 人工验收门 |

---

## Milestone 8 RC1 退出条件

Milestone 8 RC1 验证只有在以下条件全部满足时方可宣布 PASS：
1. 精确候选 tag `v1.0.0-rc.1` 已在合并至 `main` 的已接受提交上打出。
2. 矩阵项 1–10 均已执行并通过，附带完整记录证据。
3. 矩阵项 11 保持诚实地记录为 **DEFERRED / NOT VERIFIED**。
4. 矩阵项 12 获得 Product Owner 的正式人工验收。
5. 候选版本打 Tag 后未引入任何产品实现或 runtime 代码变更（如有变更必须废弃当前候选版本并创建 `rc.2`）。
