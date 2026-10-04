# V2 Desktop Foundation —— 手动验收清单

无法在开发机或 CI 上自动化的已安装应用检查，承接自 Desktop Architecture Gate（ADR 0001 §14“移交至 Desktop Foundation / 打包验收”）。仅使用合成文件，在已安装的按用户安装版本上执行，并在每项旁记录结果（PASS / FAIL / 未执行、日期、运行时版本）。

开始前：若已安装一次性 spike 应用，它与本产品共用永久标识符和数据文件夹。请先备份该文件夹或使用单独的 Windows 用户配置。

| # | 检查 | 步骤 | 预期 | 结果 |
|---|---|---|---|---|
| D1 | 原生**打开**对话框 | 设置 → System → *Add a file…*，分别从普通文件夹和含中文字符的文件夹选择图片；再用 *Restore from backup…* 选择 `.qsarchive` | 弹出系统对话框；文件被存储（显示哈希；本里程碑无预览）；恢复先校验再请求确认；取消则无任何改动 | **PO-PASS**（产品负责人，Human Hardening Gate，2026-10-03；PH 候选 `4c04181`，CI-L2 run 37172021453） |
| D2 | ≥ 1 GiB **拖放** | 将 ≥ 1 GiB 合成文件拖到投放区 | 窗口保持响应、进度条推进、文件入库；进程工作集 < 300 MiB | **PO-PASS**（产品负责人，Human Hardening Gate，2026-10-03；PH 候选 `4c04181`，CI-L2 run 37172021453） |
| D3 | **OneDrive 重定向**桌面/文档 | *Create backup…* 保存到被重定向的桌面与文档；再从同一位置 *Restore from backup…* | archive 写入并校验通过；恢复成功；数据文件夹仍在 `%LOCALAPPDATA%`（不在 OneDrive） | **PO-PASS**（产品负责人，Human Hardening Gate，2026-10-03；PH 候选 `4c04181`，CI-L2 run 37172021453） |
| D4 | **无运行时的 WebView2** | 在没有 Evergreen WebView2 运行时的机器/配置上，联网交互式运行安装程序 | bootstrapper 下载并安装运行时，随后应用可启动 | **PO-PASS**（产品负责人，Human Hardening Gate，2026-10-03；PH 候选 `4c04181`，CI-L2 run 37172021453） |
| D5 | 卸载复选框 | 交互式卸载两次：一次不勾选“删除应用数据”，一次勾选 | 不勾选则保留 `%LOCALAPPDATA%\io.github.peter-s-shi.quiz-studio`；勾选则删除 | **PO-PASS**（产品负责人，Human Hardening Gate，2026-10-03；PH 候选 `4c04181`，CI-L2 run 37172021453） |

对应的自动化检查（供参考）：启动/单实例/网络/崩溃冒烟与静默安装/升级/卸载在 CI 中运行（`scripts/smoke.ps1`、`scripts/package-test.ps1`）；400 MiB 流式写入/归档/恢复内存包络在 `qs-scenarios` 中运行。
