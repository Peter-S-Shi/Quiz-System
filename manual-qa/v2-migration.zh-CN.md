# V2 V1 迁移 —— 手动验收清单

V1 → V2 Migration 里程碑（ADR 0002 第 16 节）中自动化套件无法覆盖的已安装应用检查：原生“打开”对话框与已安装外壳。数据路径的行为已由自动化证明（`docs/V2_MIGRATION.zh-CN.md`）。仅使用**合成** V1 备份（用 `node desktop/scripts/gen-v1-fixtures.mjs` 生成，或从加载了演示数据的 V1 构建导出），在已安装的按用户安装版本上执行，并在每项旁记录结果（PASS / FAIL / 未执行、日期、构建版本）。这些与 Desktop Foundation 的 D1–D4 一样，属于不阻塞的验收欠账。

| # | 检查 | 步骤 | 预期 | 结果 |
|---|---|---|---|---|
| M1 | V1 备份的原生**打开**对话框 | 设置 → System → *Import from Quiz Studio V1* → *Choose V1 backup…*；分别从普通文件夹和路径含中文字符的文件夹选择合成备份 | 弹出系统对话框；出现预览（计数、媒体、说明、“V1 从未记录的信息保持未知”）；任何位置都**不显示路径**；此时尚未导入 | **PO-PASS**（产品负责人，Human Hardening Gate，2026-10-03；PH 候选 `4c04181`，CI-L2 run 37172021453） |
| M2 | 确认 / 取消 | 在预览中点 *Cancel*；重复一次并点 *Confirm import* | 取消无任何改动；确认后导入，出现 *Active import* 行，存储报告健康 | **PO-PASS**（产品负责人，Human Hardening Gate，2026-10-03；PH 候选 `4c04181`，CI-L2 run 37172021453） |
| M3 | 被阻断的输入 | 选择一个并非 V1 备份的文件（例如 V2 `.qsarchive`，或备份的截断副本） | 给出带稳定代码的阻断说明（`MIG_SOURCE_WRONG_KIND`、`MIG_SOURCE_NOT_JSON`）；未导入任何内容；你的文件不变 | **PO-PASS**（产品负责人，Human Hardening Gate，2026-10-03；PH 候选 `4c04181`，CI-L2 run 37172021453） |
| M4 | 可选的 recovery artifact | *Add recovery artifact (optional)…* 选择合成的 `quiz-studio-library-recovery-v1` JSON，然后导入 | 预览说明它将被逐字节保留且永不激活；导入后该文件位于数据文件夹的 `recovery-artifacts` 下，并且 V2 备份（*Create backup…*）可将其恢复 | **PO-PASS**（产品负责人，Human Hardening Gate，2026-10-03；PH 候选 `4c04181`，CI-L2 run 37172021453） |
| M5 | 重复导入与撤销 | 再次导入同一备份；然后对活动导入点 *Undo* | 第二次导入被报告为已导入；*Undo* 恰好移除该次导入所创建的内容（若你编辑过迁移记录则拒绝） | **PO-PASS**（产品负责人，Human Hardening Gate，2026-10-03；PH 候选 `4c04181`，CI-L2 run 37172021453） |
| M6 | OneDrive 重定向的源文件 | 选择位于 OneDrive 重定向桌面或文档文件夹中的备份 | 行为与 M1 相同；数据文件夹仍在 `%LOCALAPPDATA%` | **PO-PASS**（产品负责人，Human Hardening Gate，2026-10-03；PH 候选 `4c04181`，CI-L2 run 37172021453） |
| M7 | 大备份 | 导入媒体 ≥ 400 MiB 的备份（自动化的内存包络测试已证明内存有界） | 预览和激活期间窗口保持响应；待媒体显示功能出现后，导入的媒体可逐字节一致地打开 | **PO-PASS**（产品负责人，Human Hardening Gate，2026-10-03；PH 候选 `4c04181`，CI-L2 run 37172021453） |

对应的自动化检查：`qs-migrate-v1` 各套件（检测、阻断、守恒 + 突变击杀、幂等/撤销、历史、媒体、预览、artifact、oracle）、`qs-scenarios` 的 `migration_faults`（kill 矩阵、随机 kill、撤销中 kill、内存包络）以及已安装应用 `--self-test` 中的迁移步骤。
