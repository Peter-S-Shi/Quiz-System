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

问卷包含 M6.0 增量检查，覆盖 finalized Learner Response 建立、双语导出控件、备份覆盖和显式删除确认；M6.2 增量检查，覆盖 Translation Library 工作区、批量与 JSON 导入安全、导出、持久化和备份覆盖；M6.3 增量检查，覆盖 Translation Practice 工作流、session 恢复、非客观 finalization，以及与 Objective Quiz 的隔离；M6.4 增量检查，覆盖学习者主动控制的作答标记、重叠/重复处理、编辑失效处理，以及 finalized 标记证据；M6.5 增量检查，覆盖批改工作区、rich correction 的各种样式/操作、内容操作冲突策略、review 的持久化/重新打开，以及原始 Learner Response 的不可变性；M6.6 增量检查，覆盖完整的外部往返（评阅请求导出、带预览/确认的外部 Teacher Review 导入、多 review 访问、review 导出、补救练习请求导出、带 provenance 校验的补救翻译文档导入，以及补救练习的溯源）；以及 M6.7 增量检查，覆盖 Translation 历史浏览/筛选/证据访问、从历史中访问多条批改、双向溯源导航（包括对缺失来源的安全表示）、整份/选定条目/需要加强条目重新练习，以及针对翻译文档、Learner Response 和 Teacher Review 的显式删除安全。最后还有一个 M6.0-M6.7 综合验收流程模块，贯穿全部子里程碑走一遍完整的端到端场景。完成对应增量检查可以积累验收证据；仅仅存在这些检查并不代表对应里程碑已通过验收。M6.2 到 M6.7 的正式验收被有意推迟到 M6.7 完成后的一次整体 M6 验收——M6.2 到 M6.7 的全部增量检查和综合验收流程模块会被保留，供那次整体验收复用。

## 隐私

请使用测试代号、合成备注和通用截图文件名。不要在 QA 结果中输入真实个人信息、真实试卷内容、账号信息、凭据、本地绝对路径或敏感截图。
