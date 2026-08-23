# 手工 QA 基线

本文件夹用于保存 Quiz Studio 的回顾式手工验收基线。

## 内容

- `manual_review_questionnaire.html` 是一个离线、双语、单文件验收问卷，可以直接用浏览器打开。
- `samples/` 保存用于导入、备份、边界情况和失败路径测试的合成试卷文件。
- `results/` 预留给填写后的问卷导出和截图。填写结果默认只保存在本地。

## 使用方式

1. 使用 `start-local.bat` 启动 Quiz Studio。
2. 在浏览器中打开 `manual_review_questionnaire.html`。
3. 填写顶部元信息，然后按模块完成 QA 检查。
4. 遇到导入或备份相关测试时，使用 `samples/` 里的样例文件。
5. 从问卷导出 JSON 或 Markdown 结果，并保存在 `results/`。

## 范围

这份基线只用于手工验收，不改变产品功能、业务逻辑、工作流或发布状态。

问卷保留了 M6.0 与 M6.2–M6.7 各里程碑增量，以及一条贯穿 M6.0–M6.7 的端到端综合旅程。这些模块覆盖 finalized evidence、Translation Library 与 Practice、学习者标记、富文本批改、外部文件交换、History、重练、溯源和破坏性工作流安全。M6 综合验收已经执行并通过；保留的增量继续作为 Milestone 7 的可复用回归证据。历史验收通过不代表新的 M7 验证合同已经关闭；这些合同记录在 `M7_HARDENING_AUDIT.md` 中。

## 隐私

请使用测试代号、合成备注和通用截图文件名。不要在 QA 结果中输入真实个人信息、真实试卷内容、账号信息、凭据、本地绝对路径或敏感截图。
