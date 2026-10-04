# Quiz Studio

<p align="center">
  <img src="assets/readme/hero.svg" alt="Quiz Studio Banner - 本地优先学习书桌与开放教学交换体系" width="100%">
</p>

<p align="center">
  <a href="#快速开始"><img src="https://img.shields.io/badge/运行环境-原生%20ESM%20%C2%B7%20零构建-blue?style=flat-square" alt="零构建步骤"></a>
  <a href="#工程设计亮点"><img src="https://img.shields.io/badge/架构体系-100%25%20本地优先-success?style=flat-square" alt="本地优先"></a>
  <a href="#工程设计亮点"><img src="https://img.shields.io/badge/测试用例-292%20全部通过-brightgreen?style=flat-square" alt="292 测试通过"></a>
  <a href="docs/OPEN_TEACHING_INTERCHANGE.zh-CN.md"><img src="https://img.shields.io/badge/交换协议-JSON%20Schema%20标准-orange?style=flat-square" alt="开放教学交换"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/开源协议-MIT-informational?style=flat-square" alt="MIT License"></a>
  <a href="README.md"><img src="https://img.shields.io/badge/Documentation-English-blueviolet?style=flat-square" alt="English Documentation"></a>
</p>

---

> **Quiz Studio V2（Windows 桌面版）—— `v2` 分支上的发布候选版 `2.0.0-rc.1`。** 一款本地优先、支持客观题、翻译与跟打练习的桌面应用。它只是候选版，**尚未发布也尚未合并**，且**仅在 Windows 上验证**。请从 [V2 桌面版快速上手](docs/V2_QUICKSTART.zh-CN.md) 开始。以下章节描述的是 **Quiz Studio V1**——浏览器版（`v1.0.0`，维护冻结），它在本仓库中保持不变。

---

## 概述

**Quiz Studio** 是一个专为专注自学与刻意练习打造的**本地优先（Local-First）**个人学习工作区。它基于**分层纸质书桌（Layered Paper Study Desk）**设计隐喻，无缝整合了两大互补学习体系：
1. **客观题刷题工作区**：支持 5 类基础题型、多媒体附件、即时/交卷反馈模式、会话中断恢复与错题针对性重练。
2. **定性翻译练习工作区**：支持逐句独立翻译、学习者译文元认知不确定性标注、富文本教师批改工作区与基于可移植文件的开放教学交换。

Quiz Studio 践行 **“AI 原生，API 可选（AI-Native & API-Optional）”** 架构哲学：借助版本化公开 JSON Schema，学习者可与外部真人教师或任意 AI 模型（ChatGPT、Claude、Codex 或本地大模型）完成异步评阅批改与补救练习流转，**全程无需配置云端数据库、注册账号、依赖网络连接或绑定付费 API Key**。

---

## 核心功能

<p align="center">
  <img src="assets/readme/capabilities.svg" alt="Quiz Studio 核心学习表面" width="100%">
</p>

### 1. 客观题练习台与试卷编排
- **支持 5 大题型**：单选题、多选题、填空题、判断题与一对一连线题。
- **内嵌多媒体附件**：题目支持插入图片（支持模态缩放查看器）与音频（支持内嵌播放器），依托浏览器端 IndexedDB Blob 独立安全持久化。
- **多样化做题反馈模式**：自由选择 *即时反馈模式*（答题即判分并提供提示）或 *交卷反馈模式*（还原真实模拟考场）。
- **会话持久化与选项打乱**：做题时随机乱序题支与连线项；意外刷新浏览器可无缝恢复中断的练习会话。
- **试卷库分层归档**：支持“分类 → 试卷 → 题目”三级侧边栏层级导航、关键词搜索、标签管理与单卷/整库 JSON 备份导出。

### 2. 翻译工作区与元认知标记
- **定性刻意练习**：逐句翻译界面，参考译文默认隐藏且按需查看，彻底摆脱机械死板的自动对错评分。
- **主动式元认知置信度标记**：学习者在提交前可高亮选中自己译文中的特定字词短语，标记为 **不认识 (Unknown)**、**不确定 (Uncertain)** 或 **应该会 (Should know)**。
- **批量文本导入**：支持纯原文文本行粘贴，或中英双语制表符（`source<TAB>reference`）表格快速批量建卷。
- **受保护的学习记录证据**：完成练习后生成不可篡改、带时间戳的 Learner Response 快照，完整保留原始译文与元认知标记。

### 3. 教师批改台与富文本修订
- **实体墨水批注工具**：评阅者可自由应用展示样式（**加粗**、**斜体**、**高亮**、**下划线**、专属墨水色彩）及结构性修订（**插入**、**替换**、**删除线**）。
- **印章评判与批语反馈**：支持敲印评判（*正确*、*错误*、*部分正确*、*需重温*）、题级针对性批语及整句建议修订。
- **多评阅版本并存**：同一份作答记录可随时间积累多位教师或 AI 评阅者的独立批改，绝不篡改原始作答。

### 4. 溯源历史与精准重练闭环
- **持久化证据档案库**：即使原始试卷或翻译文档被删除，全部作答历史、评阅状态与谱系链依然完整可查。
- **针对性重练模式**：支持整卷重练、自选题目重练，或一键触发 **“针对薄弱项重练 (Retry Needs-Work Items)”**（智能抽取带有不确定性标记或被教师批改指出的条目发起专属复习）。
- **严谨的谱系完整性**：重练与补救练习均具备独立的身份标识与双向谱系追踪（`resolveResponseLineage`），并内置级联删除依赖安全分析。

---

## 系统架构：开放教学交换 (Open Teaching Interchange)

Quiz Studio 提出了 **开放教学交换（Open Teaching Interchange）** 架构——一套基于文件的标准化离线协作协议，连接学习者、真人导师与各类 AI 智能体。

<p align="center">
  <img src="assets/readme/architecture.svg" alt="开放教学交换生命周期" width="100%">
</p>

```text
外部出题排版 (JSON / AI 提示词)
  │
  ▼
学习者练习书桌 (客观题库与翻译练习台)
  │
  ▼
固化受保护证据 (不可篡改的 Learner Response)
  │
  ├──► 导出 "review-request.json" ──► 外部真人教师 / AI 评阅者
  │                                                │
  ▼                                                ▼
薄弱项针对性重练 ◄── 导入 "teacher-review.json" 批改文件
```

### 为什么选择基于文件的交换？
- **零 API 门槛**：应用无需内置 OpenAI、Anthropic 等特定厂商的 API Key，避免网络限制与计费依赖。
- **全模型通用兼容**：导出一份标准的 `quiz-studio.review-request` JSON，可直接投喂给任意大模型 Web 界面、本地 Ollama 或外部导师，再将生成的 `quiz-studio.teacher-review` 导入即可。
- **数据主权归还用户**：学习数据严格保留在用户本地，绝不在后台静默上传。

---

## 工程设计亮点

### 1. 100% 本地优先与双存储协同引擎
- 基于**原生 ES 模块（ESM）**、HTML5 与现代 CSS 开发，零打包工具（无需 webpack/Vite），即开即用。
- **双客户端存储架构**：
  - `localStorage`：负责结构化元数据、试卷信息、翻译文档与历史轻量索引的高速读写。
  - `IndexedDB`（`quiz-studio-media-db`）：独立存储音频与图片二进制 Blob 数据，避免占用 localStorage 配额。
- 完整配置 **Service Worker ESM 预缓存**，支持离线独立运行。

### 2. 字符锚定级元认知标记引擎
- 自研字符索引精确锚定算法，精准记录学习者译文中的选区范围。
- **确定性冲突消解**：优雅处理重叠选区、增删文本后的位置偏移，并在完成提交时锁定证据谱系。

### 3. 基于 Web Audio 的动态程序化音频合成
- 纯代码生成拟真物理音效，**零外部音频文件加载**：
  - *翻书纸张沙沙声*：白噪与粉噪的指数带通滤波扫频（180ms）。
  - *铅笔书写摩擦声*：高 Q 值的局部高频带通突发脉冲（90ms）。
  - *橡胶印章盖印声*：低频谐振正弦波配合瞬态冲击音（120ms）。
- 顶栏一键静音切换，完全尊重系统级 `prefers-reduced-motion` 动效设置。

### 4. 公开版本化 JSON Schema 契约
- 仓库 [`schemas/`](schemas/) 目录下维护完整的标准化数据协议：
  - [`quiz-paper.schema.json`](schemas/quiz-paper.schema.json)：标准化客观题试卷格式。
  - [`learner-response.schema.json`](schemas/learner-response.schema.json)：学习者作答证据快照。
  - [`teacher-review.schema.json`](schemas/teacher-review.schema.json)：富文本修订、评判与批注。
  - [`translation-document.schema.json`](schemas/translation-document.schema.json)：定性翻译材料格式。
  - [`review-request.schema.json`](schemas/review-request.schema.json) 与 [`remediation-request.schema.json`](schemas/remediation-request.schema.json)：可移植外部流转信封。

### 5. 全面完备的自动化验证体系
- 覆盖题型逻辑、评分引擎、标记碰撞、Schema 校验与存储迁移的全量测试套件：
  ```bash
  node --test
  ```
- **292 个单元与集成测试全部通过**，依托 Node.js 原生测试运行器，无任何第三方测试框架依赖。

---

## 快速开始

### 环境要求
- Python 3.8+（用于本地静态服务托管）或 Node.js 18+
- 现代主流浏览器（Chrome、Edge、Firefox、Safari）

### 方式 A：Windows 一键启动
直接双击仓库根目录下的 **`start-local.bat`**。
> *启动器会自动通过本地 Python 启动服务并打开默认浏览器访问 `http://localhost:8000`。*

### 方式 B：终端命令行启动
```bash
# 启动本地标准服务
python -u scripts/dev-server.py
```
在浏览器中打开 **`http://localhost:8000`**。

> [!NOTE]
> 端口 `8000` 是严格绑定的，因为浏览器的本地存储（localStorage 与 IndexedDB）严格隔离于源（Origin）。出于 ES 模块安全规范，不支持直接通过 `file://` 双击打开 HTML。

---

## 自动化测试与质量检验

```bash
# 核心语法检查
node --check src/app.js

# 运行完整自动化测试套件 (292 项测试)
node --test
```

---

## 60 秒快速上手体验

```text
1. 启动服务 ──► 浏览器访问 http://localhost:8000
2. 选择模式 ──► 进入“客观题练习”或“翻译工作区”
3. 专注做题 ──► 答题或翻译，并可划词添加元认知标记
4. 固化提交 ──► 完成练习，保存受保护的作答快照
5. 批改复习 ──► 打开批改台批阅，或导出 JSON 与外部 AI 交互
```

1. **体验客观题练习**：点击题库中的预置试卷，选择 **开始做题**，提交答案并查看即时解析与得分对比。
2. **体验翻译与元认知标注**：切换到 **翻译练习** 标签，打开示例单元并开始练习，在答题框中输入译文并选中词语标记为 **不确定**。
3. **体验富文本批改台**：提交翻译后进入 **批改工作区**，对译文选区进行 **替换**、**划删除线** 或敲下 **评阅印章**。

---

## 项目结构导航

```text
Quiz System/
├── assets/readme/          # README 项目原生 SVG 横幅、架构图与功能看板
├── docs/                   # 详细规范与技术指南
│   ├── USER_GUIDE.zh-CN.md         # 完整用户手册
│   ├── DEVELOPER_GUIDE.zh-CN.md    # 架构与开发者指南
│   ├── OPEN_TEACHING_INTERCHANGE.zh-CN.md # 数据交换协议规范
│   ├── TRANSLATION_DOMAIN.zh-CN.md # 翻译练习领域模型
│   └── SAFETY.zh-CN.md             # 隐私、安全与数据保护原则
├── examples/               # 合成示例试卷与交换 JSON 样例
├── schemas/                # 公开 JSON Schema 数据契约 (v1.0.0)
├── scripts/                # Python 本地开发服务器
├── src/                    # 核心应用源码 (原生 ESM)
│   ├── core/               # 题目模型、评分机制、标注引擎与谱系历史
│   ├── storage/            # 浏览器 localStorage 与 IndexedDB 存储边界
│   └── app.js              # UI 渲染控制器、路由与本地化字典
├── tests/                  # 自动化测试用例套件 (292 tests)
├── DESIGN.md               # 分层纸质书桌设计系统与视觉 Token
├── PROJECT_STATUS.zh-CN.md # 生命周期路线图与项目状态
├── index.html              # 应用入口 HTML 骨架
├── styles.css              # 书桌主题与响应式样式表
└── sw.js                   # 离线运行 Service Worker 预缓存
```

---

## 数据主权与隐私保护

- **零远程跟踪**：所有试卷草稿、做题记录、多媒体资源、评分统计与标注墨水均 100% 保存在用户浏览器本地。
- **无应用内埋点**：无任何第三方统计脚本、追踪像素或远程服务器同步。
- **自主导出控制**：数据导出完全由用户自主手动触发与管理。

---

## 项目状态与开源协议

- **当前版本**：V1 浏览器版 `v1.0.0`（最终定版 / 维护冻结）；V2 桌面版 `2.0.0-rc.1`（`v2` 分支上的发布候选版；尚未发布或合并）
- **设计规范**：Layered Paper Study Desk (`DESIGN.md`)
- **开源协议**：[MIT License](LICENSE) © 2026 Quiz Studio Contributors
