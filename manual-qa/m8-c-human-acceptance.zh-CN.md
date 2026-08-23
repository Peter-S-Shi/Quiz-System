# Milestone 8 Batch C: Product Owner 人工验收记录 (`v1.0.0-rc.1`)

本文件记录 Product Owner 对 Quiz Studio Release Candidate 1 (`v1.0.0-rc.1`) 的真实人工验收证据。

## 1. 候选版本标识

- **候选版本 Tag**：`v1.0.0-rc.1`
- **候选版本提交 SHA**：`f33bafcfe42ac8dd521466026c343102dc18897a`
- **评估人**：Product Owner（人工验收）
- **验收日期**：2026-08-23
- **PR 执行载体**：PR #25（`release/m8-a-rc1-candidate-preparation`）
- **候选版本整体裁决**：**PASS — ACCEPTED（通过并接受）**（0 发布阻断缺陷）

---

## 2. Product Owner 人工验收门结果

| 人工验收领域 | 执行范围与协议 | 目标环境 | PO 裁决 | 观察证据与说明 |
| :--- | :--- | :--- | :--- | :--- |
| **1. 干净 Windows 真实启动** | 在干净终端执行 `start-local.bat`；验证 `http://localhost:8000` 即时拉起，测试进程正常关闭与重启 | Windows 11 (64-bit) / Python 3 | **PASS** | 验证规范 8000 端口绑定，环回地址零生产 Service Worker 注册，关闭与重启无孤儿进程残留 |
| **2. 跨浏览器矩阵冒烟** | 受支持浏览器上的受限冒烟测试：试卷编辑、做题、历史与主题切换 | Google Chrome, Microsoft Edge, Mozilla Firefox (Windows 11) | **PASS** | 验证流畅的试卷编辑、客观题与翻译做题、响应式排版、明暗主题切换，零浏览器特异性缺陷 |
| **3. 原生 Teacher Review 导入** | 使用系统原生文件对话框导入外部 Teacher Review JSON（`m7-3-c3-review-request.json` / 评阅文件） | Windows 11 原生文件对话框 | **PASS** | 系统文件对话框无缝打开，准确导入外部评阅，历史记录中正确显示修改意见与评阅裁决 |
| **4. 原生补救 Translation Document 导入** | 使用系统原生文件对话框导入补救 Translation Document JSON | Windows 11 原生文件对话框 | **PASS** | 系统文件对话框成功选取补救文档，完整导入血缘元数据并关联至源作答/评阅记录 |
| **5. 托管 HTTPS PWA 生命周期** | 在线初始加载 → SW 注册 → 离线重新打开/做题 → 重回在线恢复 | 生产 HTTPS 测试源 | **PASS** | 生产 SW 干净注册，离线壳成功缓存，离线继续做题无数据丢失，重回在线后状态无损保持 |
| **6. 已知局限性确认** | 审查并接受已披露的产品边界 | 文档审查 | **PASS** | 本地存储配额边界、手动文件交换、无内置 AI 以及 macOS 延期均正式接受 |

---

## 3. 退出裁决与发布建议

- **Milestone 8 状态**：**COMPLETE / ACCEPTED（已完成并接受）**
- **RC1 候选版本状态**：`v1.0.0-rc.1`（提交 `f33bafcfe42ac8dd521466026c343102dc18897a`）已获得 **ACCEPTED**。
- **产品代码变更**：**NONE（0 行代码）**（`src/`、`scripts/`、`styles.css`、`index.html`、`sw.js` 保持纯净）。
- **保留的延期领域**：
  - macOS 环境保持 **DEFERRED / NOT VERIFIED**。
  - 公开 GitHub Pages 部署、正式 GitHub Release、最终 `v1.0.0` 以及桌面应用打包保持 **NOT AUTHORIZED / DEFERRED**。
- **最终操作建议**：Milestone 8 已全部完成；进入 Post-M8 发布决策阶段。
