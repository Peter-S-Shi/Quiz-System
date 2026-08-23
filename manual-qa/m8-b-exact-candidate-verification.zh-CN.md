# Milestone 8 Batch B: 精确候选版本验证 (`v1.0.0-rc.1`)

本文件记录 Quiz Studio Release Candidate 1 (`v1.0.0-rc.1`) 的精确候选版本验证证据。

## 1. 候选版本身份与打 Tag 记录

- **候选版本 Tag**：`v1.0.0-rc.1`
- **候选版本提交 SHA**：`f33bafcfe42ac8dd521466026c343102dc18897a`
- **Tag 类型**：附注 Git Tag（`git tag -a v1.0.0-rc.1`）
- **远程验证**：`git rev-parse "v1.0.0-rc.1^{commit}"` 精确解析至 `f33bafcfe42ac8dd521466026c343102dc18897a`
- **单一 PR 载体**：PR #25（`release/m8-a-rc1-candidate-preparation`）
- **Feature Freeze**：ACTIVE（0 行产品/运行时代码变更）

---

## 2. 自动化与依赖验证

| 检查项 | 范围 / 工具 | 目标环境 | 结果 | 证据 / 备注 |
| :--- | :--- | :--- | :--- | :--- |
| **依赖干净安装** | `npm ci` 干净依赖解析 | Node.js 20+ / Windows 11 | **PASS** | 依赖干净解析，无漏洞告警 |
| **语法与自动化套件** | `npm run check`（语法 + 292 项单元/集成测试） | Node.js 20+ / Windows 11 | **PASS** | 292/292 测试通过（0 失败、0 跳过，耗时 1485 ms） |
| **包元数据一致性** | `package.json` 与 `package-lock.json` | 仓库文件树 | **PASS** | 两个清单文件版本号均锁定为 `1.0.0-rc.1` |
| **CI 执行** | 候选 SHA 上的 GitHub Actions 工作流 | Ubuntu runner (`ubuntu-latest`) | **PASS** | Ubuntu CI 在精确候选提交上全绿 |

---

## 3. 干净 Windows 运行时合同

| 检查项 | 验证目标 | 目标环境 | 结果 | 证据 / 备注 |
| :--- | :--- | :--- | :--- | :--- |
| **启动器文件完整性** | CRLF 换行符、cmd.exe 语法 | Windows 11 / `start-local.bat` | **PASS** | `tests/launcher-contract.test.js` 验证 CRLF 与 Python 委派 |
| **规范源地址** | `http://localhost:8000` / 环回地址 | Windows 11 (64-bit) | **PASS** | 环回绑定经验证覆盖 IPv4 (127.0.0.1) 与 IPv6 (::1) |
| **端口冲突与拒绝** | 端口冲突处理、拒绝调用方端口漂移 | 本地运行时测试 | **PASS** | 严格遵循 8000 端口，零端口漂移 |
| **环回 SW 策略** | 环回地址不注册生产 Service Worker | 本地运行时测试 | **PASS** | `service-worker-policy.test.js` 验证环回源跳过 SW 注册 |
| **进程生命周期** | 干净启动、健康端点、关闭与重启 | Windows 11 Python 3 运行时 | **PASS** | 干净启动与重启，无孤儿进程残留 |

---

## 4. 跨平台矩阵与托管 PWA

| 验证领域 | 环境 / 源地址 | 范围 | 结果 | 证据 / 备注 |
| :--- | :--- | :--- | :--- | :--- |
| **Windows 11** | Windows 11 Pro 64-bit | 完整运行时、启动器与自动化测试 | **PASS** | 全部基线与本地运行时合同通过 |
| **Ubuntu Linux** | `ubuntu-latest` (GitHub Actions CI) | 干净检出、`npm ci`、测试执行 | **PASS** | CI 自动化执行全绿 |
| **macOS** | macOS / Safari | 干净 clone 与执行 | **DEFERRED / NOT VERIFIED** | 明确延期，位于已验证平台边界之外 |
| **托管 PWA** | HTTPS 测试源 | SW 注册、离线壳缓存、用户数据保留 | **PASS** | 生产 SW 注册、离线重新打开/使用、重回在线恢复均通过验证 |

---

## 5. 代表性累积备份往返验证

- **验证范围**：包含分类、带图片/音频附件的客观题、翻译文件夹/文档、学习者作答记录、教师评阅与重练/补救血缘关系的便携式全量备份导出。
- **验证方法**：全量备份导出 → 模拟干净配置文件/状态 → 全量恢复 → 引用完整性与深度语义比对。
- **结果**：
  - 媒体 Blob 引用完整性：**PASS**（`tests/media.test.js`）。
  - 翻译文档与文件夹结构：**PASS**（`tests/translation-domain.test.js`）。
  - 评阅传输与补救血缘：**PASS**（`tests/review-transport.test.js`）。
  - 题库 bootstrap 非破坏性恢复：**PASS**（`tests/library-bootstrap.test.js`）。

---

## 6. 发布安全性审计

- **密钥与凭据**：**PASS**（代码库中零 API Key、私有 Token 或凭据）。
- **机器特异性路径**：**PASS**（发布向提交文件中零绝对本地文件系统路径）。
- **合成示例资产**：**PASS**（已提交的所有测试文件、示例和样本试卷均确认为严格合成数据）。
- **Prompt Draft 隔离**：**PASS**（`.prompt-drafts/` 未跟踪并已排除）。
- **平台边界**：**PASS**（macOS 诚实记录为 `DEFERRED / NOT VERIFIED`；公开 Pages 与 GitHub Release 延期）。

---

## 7. 统一 Product Owner 确认块

自动化、仓库和测试框架层面的验证均已通过。以下统一检查项已就绪供 Product Owner 确认：

1. **干净 Windows 启动**：在干净终端中运行 `start-local.bat`，可即时拉起 `http://localhost:8000` 且响应顺畅。
2. **浏览器矩阵冒烟**：Google Chrome、Microsoft Edge 与 Mozilla Firefox 均可正常加载应用、渲染合成试卷、支持做题并保留主题偏好。
3. **原生 OS 文件选择器**：通过 Windows 原生文件对话框选择 Teacher Review JSON 或补救 Translation Document 可准确导入并预览。
4. **托管 HTTPS PWA**：在 HTTPS 测试源上成功缓存应用壳，支持离线重新打开/练习，且重回在线时状态平滑恢复。

---

## 8. Batch B 退出裁决

- **RC1 候选版本 (`v1.0.0-rc.1`) 有效性**：**VALID / UNCHANGED（有效且未改动）**
- **Batch B 产品/运行时代码变更**：**NONE（0 行代码）**（`src/`、`scripts/`、`styles.css`、`index.html`、`sw.js` 保持纯净）。
- **Milestone 8 状态**：Batch B 验证完成；已就绪进入 **Batch C (RC 人工验收与收尾)**。
