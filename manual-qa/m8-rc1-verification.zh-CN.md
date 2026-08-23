# Milestone 8 — Release Candidate 1 (`v1.0.0-rc.1`) 验证清单

本文件建立 Quiz Studio Release Candidate 1 (`v1.0.0-rc.1`) 的完整验证与验收记录。

## 候选版本元信息

- **候选版本 Tag**：`v1.0.0-rc.1`
- **候选版本提交 SHA**：`f33bafcfe42ac8dd521466026c343102dc18897a`
- **候选版本提交身份**：PR #25 中冻结并打上 `v1.0.0-rc.1` tag 的精确产品提交快照
- **Feature Freeze**：ACTIVE（0 行产品/运行时代码修改）
- **Milestone 7 Product Hardening**：COMPLETE / ACCEPTED（292 项测试全绿，H-01 解决，C1–C4 PASS）
- **Milestone 8 状态**：**COMPLETE / ACCEPTED（已完成并接受）**（Batch A 准备完成；Batch B 验证完成；Batch C 获 Product Owner 验收通过）
- **候选版本整体状态**：**ACCEPTED（已接受）**（0 发布阻断缺陷）
- **公开正式发布授权**：NOT AUTHORIZED（仅用于 RC 验证；公开 Pages 与正式 GitHub Release 延期）

---

## 验证矩阵

| 验证领域 | 验证范围 | 目标环境 | 状态 | 证据 / 备注 |
| :--- | :--- | :--- | :--- | :--- |
| **1. 自动化套件** | 干净执行 `npm ci` 与 `npm run check`（292 测试） | Node.js 20+ / Windows & Ubuntu | **PASS** | 精确候选 SHA 上通过 292/292 测试（0 失败、0 跳过，耗时 1443 ms） |
| **2. CI 流水线** | GitHub Actions 工作流执行 | Ubuntu runner (`ubuntu-latest`) | **PASS** | 候选提交 `f33bafcfe42ac8dd521466026c343102dc18897a` CI 全绿 |
| **3. 干净 Windows 启动** | 干净目录 clone/checkout、`start-local.bat`、环回 `localhost:8000`、干净启动/重启 | Windows 11 (64-bit) | **PASS** | Product Owner 实测通过：8000 端口即时拉起、零环回 SW、干净关闭与重启（`manual-qa/m8-c-human-acceptance.zh-CN.md`） |
| **4. 浏览器矩阵** | 受支持浏览器上的受限冒烟测试 | Google Chrome, Microsoft Edge, Mozilla Firefox (Windows 11) | **PASS** | Product Owner 实测通过：试卷编辑、做题、历史、主题切换均无缺陷（`manual-qa/m8-c-human-acceptance.zh-CN.md`） |
| **5. 托管 PWA** | HTTPS 测试源：SW 注册、在线使用、离线重新打开/使用、重回在线恢复 | 生产 HTTPS 测试源 | **PASS** | Product Owner 实测通过：生产 SW 注册、离线缓存与无损状态恢复（`manual-qa/m8-c-human-acceptance.zh-CN.md`） |
| **6. 累积数据可移植性** | 代表性累积全量备份导出 → 新配置文件恢复 → 数据完整性比对 | Node.js / 核心 API | **PASS** | 实测全量备份/恢复往返通过：5305 字节（媒体、分类、评阅与血缘）完整无损恢复（`manual-qa/m8-b-exact-candidate-verification.zh-CN.md`） |
| **7. 原生文件选择器** | Teacher Review 导入与补救 Translation Document 导入使用原生 OS 文件对话框 | Windows 11 文件对话框 | **PASS** | Product Owner 实测通过：真实 Windows 文件对话框成功导入评阅与补救文档（`manual-qa/m8-c-human-acceptance.zh-CN.md`） |
| **8. 发布安全性** | 隐私、凭据、机器特异性绝对路径与 prompt-draft 扫描 | 仓库源码树 | **PASS** | 零私有凭据、零机器路径、零未跟踪 draft（`manual-qa/m8-b-exact-candidate-verification.zh-CN.md`） |
| **9. 合成示例审计** | 审计已提交的示例试卷、备份、评阅与示例文件 | `examples/`, `manual-qa/samples/` | **PASS** | 确认所有提交的示例资产均为严格合成数据（`manual-qa/m8-b-exact-candidate-verification.zh-CN.md`） |
| **10. 已知局限性确认** | 准确披露并确认已知边界 | 文档审查 | **PASS** | 本地存储配额、手动文件交换、无内置 AI 正式接受 |
| **11. macOS 环境** | 在 macOS 上干净 clone 与运行 | macOS / Safari | **DEFERRED / NOT VERIFIED** | 明确延期，位于已验证 Windows/Ubuntu 边界之外 |
| **12. PO 最终 RC 验收** | Product Owner 对精确 RC 候选版本的全量审查与验收 | Product Owner 审查 | **PASS — ACCEPTED** | 统一的最终 RC 人工验收门通过，0 发布阻断缺陷（`manual-qa/m8-c-human-acceptance.zh-CN.md`） |

---

## Milestone 8 RC1 退出条件

Milestone 8 RC1 验证已全部完成并通过验收：
1. 精确候选 tag `v1.0.0-rc.1` 已在冻结候选提交 `f33bafcfe42ac8dd521466026c343102dc18897a` 上打出（**PASS**）。
2. 矩阵项 1–10 均已通过并附带 Agent 与真实人工记录证据（**PASS**）。
3. 矩阵项 11 保持诚实地记录为 **DEFERRED / NOT VERIFIED**（**PASS**）。
4. 矩阵项 12 获得 Product Owner 的正式人工验收通过（**PASS — ACCEPTED**）。
5. 打 Tag 后的所有提交未引入任何产品/运行时代码变更（**PASS**）。
6. Milestone 8 已 **COMPLETE**；PR #25 就绪等待最终合并入 `main` 的授权。
