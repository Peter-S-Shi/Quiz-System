# Quiz Studio 路线图

本文档记录 Quiz Studio 的产品生命周期。它保留 Milestone 1-5 的历史结构，同时区分实现状态、验收状态、质量收敛和发布就绪。

## Milestone 1：基础原型

状态：基础基线已完成

Milestone 1 建立了本地优先的 quiz 编辑与练习系统原型。

已完成范围：

- 可编辑试卷标题、说明和题目。
- 支持客观题：单选题、多选题、填空题、判断题、一对一匹配题。
- 做题时选择题选项可打乱。
- 答对和答错反馈。
- 亮色和暗色主题。
- 中文和英文界面支持。
- 浏览器本地存储。
- JSON 导入和导出。
- 英文和中文项目文档。
- private GitHub 同步流程。

## Milestone 2：练习流程增强

状态：首版实现已落地；完整验收待完成

Milestone 2 增强学习者的练习闭环，让每次做题过程可以恢复、回顾、重复练习，并且更容易筛选。

已实现范围：

- 保存答题进度，并在刷新后恢复。
- 提交答案前检查未答题。
- 优化结果总览和答案对比。
- 记录答题历史与成绩。
- 支持错题单独重练。
- 支持随机抽题。
- 支持按题型筛选。
- 新增界面文案同时支持中文和英文。

验收状态：

- 尚未完成项目级完整人工验收。
- 答题恢复、答题历史、错题重练、随机抽题和题型筛选仍需正式端到端验证。

## Milestone 3：本地试卷库

状态：首版实现已落地；完整验收待完成

Milestone 3 将 Quiz Studio 从单试卷流程推进到本地试卷库，让用户可以在同一台设备上管理多套试卷。

已实现范围：

- 管理多套试卷。
- 新建、复制、重命名、删除试卷。
- 使用分类、标签和搜索组织试卷。
- 记录最近打开的试卷和更新时间。
- 提供更安全的导入、导出和完整本地备份流程。
- 将旧版单试卷本地数据迁移到试卷库。

验收状态：

- 删除等破坏性流程、备份往返、导入安全和旧数据迁移仍需完整人工验证。
- 数据管理继续保持本地优先和隐私友好，但数据完整性尚未完成正式验证。

## Milestone 4：Quiz Core 与开放数据格式

状态：首版实现已落地；完整验收待完成

Milestone 4 将当前原型中的内部逻辑整理成更稳定的基础，把可复用 quiz 行为与界面分离。

已实现范围：

- 拆分原来的单文件 app 结构。
- 建立独立的题目模型、校验器和判分逻辑。
- 建立统一的 Question Type Registry。
- 加入 `schemaVersion` 和数据迁移机制。
- 将存储逻辑与 UI 渲染解耦。
- 建立单元测试、格式检查和基础 CI。
- 公开 JSON Schema 文件和合成示例 quiz 文件。

验收状态：

- 核心测试已经存在并可在本地通过，但这还不能等同于发布就绪保证。
- Schema、迁移、存储和判分行为仍需要更全面的审计和回归检查。

## Milestone 5：公开发布准备基础

状态：首版实现已落地；完整验收待完成

Milestone 5 为未来公开发布建立基础，但不代表当前版本已经发布就绪。

已实现范围：

- 建立响应式设计和可访问性基础。
- 支持具备离线能力的 PWA 行为。
- 准备 GitHub Pages 部署 workflow。
- 完善 README、使用指南、开发指南和安全文档。
- 添加 License、CONTRIBUTING、CHANGELOG 和 RELEASE_NOTES。
- 提供合成示例 quiz 和安全说明。
- 添加 Windows 本地启动器。

验收状态：

- 仓库保持 private 时，GitHub Pages 部署继续暂缓。
- 尚未创建稳定公开版本 tag。
- 完整人工 QA、Product Hardening 和 Release Candidate 验证仍待完成。

## Feature Complete Review

状态：旧范围下已达到候选评审；随后因发布范围调整而重新开放

此前已评审的 Milestone 1-5 候选范围包括：

- 现有五种客观题型。
- 本地多试卷库。
- 试卷创建、复制、重命名、删除、分类、标签和搜索。
- 练习进度保存与刷新恢复。
- 未答题检查。
- 结果对比、答题历史和错题重练。
- 随机抽题与题型筛选。
- JSON 导入导出。
- 全库备份与导入。
- Schema version 和旧数据迁移。
- 中英文界面。
- 本地优先数据边界。
- Windows 本地启动方式。
- PWA、CI、文档和未来 Pages 发布基础。

当前解释：

- 项目在原 Milestone 1-5 边界下曾达到 Feature Complete Candidate 评审状态。
- 该历史评审对当时已审查的范围仍然有效，但不再代表当前版本功能范围已经关闭。
- Translation Practice 已被批准为当前版本的必要工作，因此项目重新进入功能开发阶段。
- 当前版本尚未 Release Ready。
- Translation Practice 目前只是已批准计划，尚未实现或验收。
- 尚未完成系统级人工验收。
- 项目尚未进入 Feature Freeze。

## Feature Freeze Gate

只有满足以下条件后，才能进入 Feature Freeze：

- Milestone 6 Translation Practice 已按批准范围实现并通过验收。
- 重新开放后的当前版本范围通过新一轮 Feature Complete Review。
- 不再存在必须补充的核心功能。
- Deferred Features 已经与 v1 发布范围清楚分离。
- 用户明确接受当前 v1 产品边界。

Freeze 规则：

- 允许：修复崩溃、错误结果、数据完整性、迁移、隐私、安全、核心工作流缺陷和严重 UX 问题。
- 默认不允许：新增题型、AI、云同步、账号、协作、教师工作流、桌面封装或其他非必要扩展。
- 新功能默认进入下一版本。
- 如必须解除 Freeze，需要在 `ROADMAP.md` 和 `PROJECT_STATUS.md` 中显式记录原因。

## Milestone 6：Translation Practice

状态：已批准纳入当前版本；尚未开始实现

目标：在 Quiz Studio 中加入一个本地优先、面向文档型书面翻译训练的专用工作区，同时不假设参考译文是唯一正确答案。

已批准的宏观范围：

- 在 Quiz Studio 内提供独立的 Translation Practice 工作区。
- 使用“文件夹 → 文档”结构管理翻译材料。
- 批量导入仅含源语言的材料，或同时包含源文和参考译文的双语材料。
- 导出翻译练习材料和数据。
- 练习时向学习者展示源文，并由学习者独立输入译文。
- 允许把困难词语或短语标记为“不认识/不理解”“不确定”或“本应知道但未能想起”。
- 提供轻量 vocabulary inbox 或移交边界，但不在 Quiz Studio 内复制完整词汇学习应用。
- 支持练习后的复盘与订正，包括整次练习或批量复盘。
- 保持源语言与目标语言方向通用，不硬编码某一种语言组合。
- 第一版实现不依赖 AI 判分或付费模型 API。

初始里程碑不包含：

- AI 判分，或把某个参考译文视为唯一正确答案。
- Quiz Studio 内部的完整词汇学习系统。
- 云账号、协作或教师工作流。
- 在具体实现 prompt 获批前提前制定详细的 M6 子里程碑。

对验收流程的影响：

- Translation Practice 必须完成实现和验收，重新开放的当前版本范围才能通过 Feature Complete Review。
- 在该评审完成并被明确接受前，Feature Freeze 保持未启用。

## Milestone 7：Product Hardening

目标：在不扩大产品范围的前提下，让现有功能成为可靠、统一、可验证的整体。

质量收敛领域：

- System Audit and Defect Inventory。
- Quiz Correctness and Data Integrity。
- Import / Export / Backup / Migration Safety。
- Workflow and UX Consistency。
- PWA / Local Launch / Browser Robustness。
- Privacy and Secret Safety。
- Regression and Manual Acceptance。

质量收敛的核心用户旅程：

```text
首次启动
-> 创建试卷
-> 编辑五种题型
-> 开始做题
-> 中途刷新与恢复
-> 完成并查看结果
-> 错题重练
-> 查看历史
-> 多试卷切换
-> 导出与导入
-> 全库备份与恢复
-> 旧版数据迁移
-> 整理翻译练习文件夹和文档
-> 导入翻译材料并完成书面练习
-> 标记困难词汇并复盘整次练习
-> 导出翻译练习数据
```

退出条件：

- 无已知 release-blocking defect。
- 无已知高风险数据丢失、覆盖、迁移、隐私或安全问题。
- 所有定义的核心用户旅程通过人工验收。
- 自动测试与 CI 通过。
- 每个重要修复缺陷具备回归测试或书面验证步骤。
- 已知风险和未验证事项已记录。
- Deferred Features 已与当前版本范围分离。
- Roadmap、Project Status、README、Release Notes 和仓库实际状态一致。
- 隐私与 secret-safety 检查通过。
- 经过验证的本地提交与目标远程分支一致。

## Milestone 8：Release Candidate and Public Delivery

目标：从干净环境验证候选版本，并准备公开交付。

必要工作：

- 创建 `v1.0.0-rc.1`。
- 从干净目录重新 clone 仓库并运行。
- 验证 Windows `start-local.bat`。
- 验证标准本地静态服务器启动方式。
- 验证主要浏览器。
- 验证 PWA 安装、离线与缓存升级。
- 使用空数据、合成示例数据和旧版数据测试。
- 执行最终隐私与 secret 扫描。
- 确认所有公开示例都是合成内容。
- 更新 README、CHANGELOG 和 RELEASE_NOTES。
- 仓库公开后启用并验证 GitHub Pages。
- 记录已知限制。
- 创建最终 `v1.0.0` tag 和 GitHub Release。

RC 规则：

- RC 阶段不得继续扩大功能范围。
- 如果发现阻断问题，返回 Milestone 7 修复，并重新执行回归检查。

## Current Version Complete

只有在 Milestone 8 验收完成后，当前版本才可以标记为：

```text
Current Version Complete / v1.0.0
```

## Maintenance / Next Version

当前版本完成后，工作应聚焦于：

- 严重缺陷与兼容性维护。
- 已明确选择的下一版本功能。
- Deferred Features 的重新评估。

## Deferred Features / Next Version Candidates

这些内容不属于当前 v1 范围：

- AI 辅助生成题目。
- 桌面应用封装。
- 云同步与用户账户。
- 分享、协作和教师工作流。
- 主观题批改。

## 路线原则

当前生命周期路线是：

1. 保留旧 Milestone 1-5 范围下曾达到 Feature Complete Candidate 的历史事实。
2. 在重新开放的当前版本范围内完成 Milestone 6 Translation Practice。
3. 重新执行 Feature Complete Review，并只在扩展后的边界获接受后进入 Feature Freeze。
4. 完成 Milestone 7 Product Hardening。
5. 生成并验证 Milestone 8 Release Candidate 与公开交付。
6. 只有 RC 验收完成后才标记 Current Version Complete。
