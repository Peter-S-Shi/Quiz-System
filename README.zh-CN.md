# Quiz Studio

Quiz Studio 是一个本地优先的 quiz 编辑与练习系统原型。它可以让用户创建可编辑的试卷、完成客观题练习、获得即时反馈，并在中文和英文界面之间切换。

当前版本是一个静态 ES module Web 应用。它需要通过本地静态服务器在浏览器中打开，并把试卷数据保存到浏览器本地存储中，因此第一版原型不需要后端数据库。

## 功能

- 编辑试卷名称、说明和题目。
- 支持题型：
  - 单选题
  - 多选题
  - 填空题
  - 判断题
  - 一对一匹配题
- 每次开始做题时，选择题选项会重新打乱。
- 匹配题右侧答案会在做题时重新打乱。
- 答题后显示正确或错误的即时反馈。
- 保存未完成的练习进度，并支持刷新后恢复。
- 提交答案前检查当前题目是否未答。
- 在浏览器本地记录答题历史与成绩。
- 独立保存 finalized Learner Response，包括原始答案和本次题目快照。
- 可从结果页和已关联近期历史导出 Learner Response JSON。
- 支持错题单独重练。
- 支持随机抽题和按题型筛选。
- 结果页支持用户答案与正确答案对比。
- 支持本地试卷库，管理多套试卷。
- 支持试卷新建、复制、重命名、删除、搜索、分类和标签。
- 支持完整本地试卷库备份和导入。
- 支持亮色和暗色主题。
- 支持中文和英文界面。
- 使用浏览器本地存储保存试卷草稿。
- 支持 JSON 试卷文件的导入和导出。
- 拆分出模块化 Quiz Core，用于题目模型、校验、判分和迁移。
- 提供公开 JSON Schema 和合成示例 quiz 数据。
- 提供版本化 Learner Response 和 Teacher Review contract，用于基于文件的外部教师交换。
- 提供 Translation Library 工作区，支持文件夹、文档和条目管理。
- 支持仅原文和双语批量导入，以及可移植 Translation Document JSON 的导入导出。
- 提供 Translation Practice 练习 session：原文可见、学习者独立书写译文、参考译文默认隐藏且可按需显示，并支持中断后恢复进度。
- 为 Translation Practice 提供非客观的 finalized Learner Response 证据，与 Objective Quiz 判分完全分开。
- 支持学习者对自己译文片段进行主动控制的元认知标记（不认识 / 不确定 / 应该会但想不起来），并保存为结构化证据。
- 提供批改 / 修订工作区，支持评阅者样式、插入/替换/删除批改、评判和批注，并支持一份记录拥有多条批改。
- 提供外部教师往返：导出评阅请求、导入外部生成的 Teacher Review、导出/导入补救翻译文档，全程不依赖任何应用内 AI API。
- 提供覆盖全部 finalized 作答记录的 Translation 历史浏览，支持筛选、溯源导航，以及在原始文档被删除后依然可用的证据访问。
- 支持从任意历史记录整份重新练习、选择条目重新练习，或针对需要加强的条目重新练习，每一次都会产生新的、独立的证据，重新练习的 provenance 与补救练习明确区分。
- 为 Learner Response 和 Teacher Review 提供带明确警告的删除操作，执行任何不可逆操作前都会先展示依赖分析。
- 提供 PWA 文件，为静态托管和离线能力做准备。
- 提供 CI workflow 文件，并保留仅手动触发的 GitHub Pages workflow，供未来公开发布时使用。

## 开始使用

不需要构建步骤。在 Windows 上直接双击 `start-local.bat`；它会把运行责任交给规范的 Python runtime，验证系统公布的全部 localhost 地址族，然后打开 `http://localhost:8000`。

端口 `8000` 是严格固定的，因为浏览器内的 Quiz Studio 数据属于这个 origin。如果端口被占用，启动会给出诊断并失败，而不会静默改用其他端口。受支持的启动器还会在不读取、不清空、不迁移 localStorage 的前提下退休旧的 Quiz Studio Service Worker/cache 状态。生产托管环境中的 PWA 行为仍然独立保留。

等价的前台命令为：

```bash
python -u scripts/dev-server.py
```

## 验证

```bash
npm test
npm run check
```

如果本机没有 npm，可以直接运行等价的核心检查：

```bash
node --check src/app.js
node --test
```

## 使用方式

1. 使用 `start-local.bat`（Windows）或 `python -u scripts/dev-server.py` 启动 Quiz Studio，然后在受支持的浏览器中打开 `http://localhost:8000`（不支持直接以 `file://` 协议打开）。
2. 在 **编辑** 页面创建或更新试卷。
3. 添加题目并标记正确答案。
4. 切换到 **做题** 页面。
5. 可选择题型筛选或随机抽题数量。
6. 开始做题、提交答案，并可在刷新后恢复进度。
7. 查看最终分数、逐题答案对比、历史记录和错题重练选项。
8. 需要与外部教师共享可移植作答包时，导出 finalized Learner Response。
9. 切换到 **翻译练习** 页面，把 Translation Document 组织到文件夹中、添加条目、批量导入材料，并把文档导出为可移植 JSON。
10. 在某份翻译文档中开始练习，为每条条目独立书写译文，可选择把自己作答中的片段标记为不认识/不确定/应该会但想不起来，完成后保存为受保护的 Learner Response。详见 `docs/USER_GUIDE.zh-CN.md`。
11. 使用 **翻译历史** 浏览全部 finalized 作答记录，查看其证据和溯源，打开或删除对应的 Teacher Review，并可以整份、按选定条目或按需要加强条目重新练习成一次新的作答。

## 项目结构

```text
Quiz System/
  index.html        应用页面结构
  styles.css        界面样式和响应式布局
  start-local.bat   Windows 本地启动器
  scripts/          规范 Python 本地 runtime
  src/app.js        试卷库、试卷编辑、练习流程和多语言支持
  src/core/         题型注册、校验、判分和迁移
  src/storage/      浏览器存储边界
  schemas/          公开 JSON Schema 文件
  examples/         合成公开示例 quiz 文件
  docs/             用户、开发和安全文档
  .github/          CI 和未来手动 GitHub Pages workflows
  README.md         英文项目文档
  README.zh-CN.md   中文项目文档
  ROADMAP.md        英文生命周期路线图
  ROADMAP.zh-CN.md  中文生命周期路线图
  PROJECT_STATUS.md 当前项目状态
  PROJECT_STATUS.zh-CN.md 中文当前项目状态
  DEVLOG.md         开发日志
```

Open Teaching Interchange 架构见 `docs/OPEN_TEACHING_INTERCHANGE.zh-CN.md`。
Translation 领域与持久化基础见 `docs/TRANSLATION_DOMAIN.zh-CN.md`。

## 路线图

项目开发按照生命周期阶段组织。完整路线见 `ROADMAP.zh-CN.md`，当前发布状态见 `PROJECT_STATUS.zh-CN.md`。

### 当前版本能力

Milestone 6 Translation Practice 工作线（M6.0–M6.7）、Pre-Freeze UI Productization 与功能冻结前范围收尾 Batches A–C 均已实现并验收。Whole-Product Feature Complete Review V3 以 0 个 Category A 阻断项通过；V1 Feature Complete 已宣布，Feature Freeze 已激活。冻结后的当前版本继续保持本地优先、多语言通用，并且不依赖 AI 判分或付费模型 API。

## 多语言支持

界面已经按照未来扩展更多语言的方向设计。UI 文案集中放在 `app.js` 的 `locales` 字典中。

试卷内容和界面语言刻意分离。切换界面语言不会改写用户已经编辑的题目、答案或导入的试卷内容。

## 当前状态

当前阶段：Feature Freeze / Milestone 8 完成（候选版本 `v1.0.0-rc.1` 已接受）。

Quiz Studio 是一个本地优先的 private pre-release 产品。M6 综合验收、功能冻结前各项验收门、Whole-Product Feature Complete Review V3 与 Milestone 7 产品硬化（M7.0–M7.3）均已通过并完成验收。V1 Feature Complete 已宣布，Feature Freeze 保持激活。

Milestone 8 候选版本验证已全部完成并通过验收（候选版本 `v1.0.0-rc.1` 于提交 `f33bafcfe42ac8dd521466026c343102dc18897a` 通过全部自动化、运行时与 Product Owner 人工验收门）。公开 GitHub Pages 部署、桌面应用打包与正式 GitHub Release 已延迟至冻结 V1 范围之外。

## 数据和隐私

默认情况下，试卷、练习进度、本地试卷库元数据、答题历史和 finalized Learner Response 会保存在浏览器本地存储中。导出的 JSON 文件由用户自行管理，并可能包含学习者原始答案。

当前静态版本不会把数据发送到服务器。

## 开发说明

这个项目在当前阶段刻意保持轻量，使用原生 HTML、CSS 和 JavaScript。这样可以先快速打磨产品行为，再决定是否引入更大的前端框架或后端架构。

架构和验证细节见 `docs/DEVELOPER_GUIDE.zh-CN.md`。
