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
- 提供 PWA 文件，为静态托管和离线能力做准备。
- 提供 CI workflow 文件，并保留仅手动触发的 GitHub Pages workflow，供未来公开发布时使用。

## 开始使用

用本地静态服务器启动仓库，然后通过该服务器打开 `index.html`。

不需要构建步骤。

示例：

```bash
python -m http.server 8000
```

然后打开 `http://localhost:8000`。

在 Windows 上，也可以直接双击 `start-local.bat`。它会在 `8000` 端口启动本地服务器，并自动用浏览器打开应用。

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

1. 打开 `index.html`。
2. 在 **编辑** 页面创建或更新试卷。
3. 添加题目并标记正确答案。
4. 切换到 **做题** 页面。
5. 可选择题型筛选或随机抽题数量。
6. 开始做题、提交答案，并可在刷新后恢复进度。
7. 查看最终分数、逐题答案对比、历史记录和错题重练选项。
8. 需要与外部教师共享可移植作答包时，导出 finalized Learner Response。

## 项目结构

```text
Quiz System/
  index.html        应用页面结构
  styles.css        界面样式和响应式布局
  start-local.bat   Windows 本地启动器
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

### 当前版本已规划能力

Translation Practice 仍是 Milestone 6 的主要新增学习工作流。M6.0 Open Teaching Interchange 已验收，M6.1 现在提供独立 Translation 领域、持久化、公开 document contract 和未来非客观 Learner Response 边界。Translation Library 与练习 UI 尚未实现。计划中的功能继续保持本地优先、多语言通用，并且不依赖 AI 判分或付费模型 API。

## 多语言支持

界面已经按照未来扩展更多语言的方向设计。UI 文案集中放在 `app.js` 的 `locales` 字典中。

试卷内容和界面语言刻意分离。切换界面语言不会改写用户已经编辑的题目、答案或导入的试卷内容。

## 当前状态

当前阶段：Feature Development - Scope Reopened（功能开发阶段，范围已重新开放）。

Quiz Studio 是一个本地优先的 private pre-release 原型。M6.0 Open Teaching Interchange 已验收。M6.1 Translation Domain and Persistence Foundation 已完成实现并等待用户验收。Translation Library 与练习 UI 尚未开始，当前版本也尚未 Release Ready。

M6.1 用户验收、其余 M6.2-M6.7 工作、新一轮 Feature Complete Review、Feature Freeze、Milestone 7 Product Hardening、Milestone 8 Release Candidate 验证、完整人工 QA 和最终干净环境验证仍待完成。GitHub Pages 部署继续暂缓，直到仓库公开并完成发布验证。

## 数据和隐私

默认情况下，试卷、练习进度、本地试卷库元数据、答题历史和 finalized Learner Response 会保存在浏览器本地存储中。导出的 JSON 文件由用户自行管理，并可能包含学习者原始答案。

当前静态版本不会把数据发送到服务器。

## 开发说明

这个项目在当前阶段刻意保持轻量，使用原生 HTML、CSS 和 JavaScript。这样可以先快速打磨产品行为，再决定是否引入更大的前端框架或后端架构。

架构和验证细节见 `docs/DEVELOPER_GUIDE.zh-CN.md`。
