# Milestone 8 Batch B: 精确候选版本验证 (`v1.0.0-rc.1`)

本文件记录由 Agent 工具在 Quiz Studio Release Candidate 1 (`v1.0.0-rc.1`) 上执行的精确候选版本验证证据，并明确分离交接给 Batch C 的真实人工/原生浏览器验收门。

## 1. 候选版本身份与打 Tag 记录

- **候选版本 Tag**：`v1.0.0-rc.1`
- **候选版本提交 SHA**：`f33bafcfe42ac8dd521466026c343102dc18897a`
- **Tag 类型**：附注 Git Tag（`git tag -a v1.0.0-rc.1`）
- **远程验证**：`git rev-parse "v1.0.0-rc.1^{commit}"` 精确解析至 `f33bafcfe42ac8dd521466026c343102dc18897a`
- **单一 PR 载体**：PR #25（`release/m8-a-rc1-candidate-preparation`）
- **Feature Freeze**：ACTIVE（0 行产品/运行时代码变更）

---

## 2. Agent 可执行验证项（已有证据并 PASS）

| 检查项 | 范围 / 工具 | 目标环境 | 结果 | 证据 / 详情 |
| :--- | :--- | :--- | :--- | :--- |
| **依赖干净安装** | `npm ci` 干净依赖解析 | Node.js 20+ / Windows 11 | **PASS** | 依赖干净解析，无漏洞告警 |
| **语法与自动化套件** | `npm run check`（语法 + 292 项单元/集成测试） | Node.js 20+ / Windows 11 | **PASS** | 精确候选 SHA 上通过 292/292 测试（0 失败、0 跳过，耗时 1663 ms） |
| **包元数据一致性** | `package.json` 与 `package-lock.json` | 仓库文件树 | **PASS** | 两个清单文件版本号均锁定为 `1.0.0-rc.1` |
| **CI 执行** | 候选 SHA 上的 GitHub Actions 工作流 | Ubuntu runner (`ubuntu-latest`) | **PASS** | Ubuntu CI 在精确候选提交上全绿 |
| **自动化运行时合同** | Python 服务器绑定、CRLF 启动器、端口冲突 | 本地运行时测试 | **PASS** | 13/13 运行时/启动器测试通过；环回源 SW 注册被正确拦截 |
| **累积备份往返验证** | 代表性全量备份导出 → 干净状态恢复 → 完整性验证 | Node.js / 核心模块 | **PASS** | 经实测验证：5305 字节有效载荷（含试卷、媒体 Blob、翻译文档、评阅与血缘）完整恢复且引用无损 |
| **发布安全性审计** | 密钥、机器路径与 prompt-draft 扫描 | 仓库文件树 | **PASS** | 零私有凭据、零机器路径、`.prompt-drafts/` 未跟踪 |
| **合成示例资产** | 测试用例与示例文件审计 | `examples/`, `manual-qa/samples/` | **PASS** | 已提交的所有样本资产均确认为严格合成数据 |
| **已知局限性披露** | 文档边界准确披露 | 文档审查 | **PASS** | 本地存储配额、手动文件交换、无内置 AI |
| **macOS 环境** | 干净 clone 与执行 | macOS / Safari | **DEFERRED / NOT VERIFIED** | 明确延期，位于已验证平台边界之外 |

---

## 3. Product Owner / 原生环境验收门（交接至 Batch C）

以下领域需要真实人工交互、操作系统原生文件对话框或真实浏览器渲染，在 Batch B 中保持 **PENDING**，移交 Product Owner 在 Batch C 中验收：

| 验收领域 | 验证范围 | 目标环境 | 状态 | 验证协议 |
| :--- | :--- | :--- | :--- | :--- |
| **干净 Windows 真实启动** | 通过 `start-local.bat` 启动，验证拉起 `http://localhost:8000`，测试关闭与重启 | Windows 11 (64-bit) | **PENDING** | 在干净终端执行 `start-local.bat`；确认 8000 端口绑定及环回地址零 SW 注册 |
| **浏览器矩阵冒烟** | 受支持浏览器上的受限冒烟测试 | Google Chrome, Microsoft Edge, Mozilla Firefox (Windows) | **PENDING** | 验证各浏览器中的试卷编辑、做题、历史与主题切换 |
| **托管 HTTPS PWA** | HTTPS 测试源：SW 注册、在线使用、离线重新打开/使用、重回在线恢复 | 生产 HTTPS 测试源 | **PENDING** | 验证生产 Service Worker、离线缓存与用户状态保持 |
| **原生 OS 文件选择器** | 使用系统文件对话框导入 Teacher Review 与补救 Translation Document | Windows 11 文件对话框 | **PENDING** | 使用真实 Windows 文件对话框选择并导入外部评阅 JSON |
| **PO 最终 RC 验收** | Product Owner 对 RC1 的全量人工验收签署 | Product Owner 审查 | **PENDING** | 最终里程碑签署 |

---

## 4. Batch B 退出裁决

- **RC1 候选版本 (`v1.0.0-rc.1`) 有效性**：**VALID / UNCHANGED（有效且未改动）**
- **Agent 可执行验证**：**COMPLETE / PASS**
- **Batch B 产品/运行时代码变更**：**NONE（0 行代码）**（`src/`、`scripts/`、`styles.css`、`index.html`、`sw.js` 保持纯净）。
- **Milestone 8 状态**：Agent 可执行验证已全部完成；真实人工与原生浏览器验收门交接至 **Batch C (RC 人工验收与收尾)**。
