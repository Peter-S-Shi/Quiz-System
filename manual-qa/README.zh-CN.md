# 手工 QA 基线

本文件夹用于保存 Quiz Studio 的回顾式手工验收基线。

## 内容

- `manual_review_questionnaire.html` 是一个离线、双语、单文件验收问卷，可以直接用浏览器打开。
- `samples/` 保存用于导入、备份、边界情况和失败路径测试的合成试卷文件。
- `results/` 预留给填写后的问卷导出和截图。填写结果默认只保存在本地。
- `m7-1-human-acceptance.zh-CN.md` 是 M7.1 UX 与交互硬化的 Product Owner 专项验收门（**PASS — 未发现问题**）。
- `m7-2-process-restart-acceptance.zh-CN.md` 是 M7.2 C2 浏览器真实进程重启专项验收门（**PASS — Product Owner 已接受，未发现问题**）。
- `m7-3-c3-external-review.zh-CN.md`、`m7-3-c3-seed-backup.json` 与通过真实 UI 导出的 `m7-3-c3-review-request.json` 组成可复现 C3 外部评阅交接（**PASS — Product Owner 已接受**）。
- `m7-3-c4-clean-environment.zh-CN.md` 记录 Windows 与 Ubuntu 必须项的干净环境矩阵（**PASS；macOS 延期/未验证**）。
- `m7-3-final-human-acceptance.zh-CN.md` 汇总 M7.3 Product Owner 验收门（**PASS — Product Owner 已接受；Product Hardening 完成**）。
- `m8-rc1-verification.zh-CN.md` 建立 Release Candidate 1 (`v1.0.0-rc.1`) 全量验证合同与完整矩阵（**COMPLETE / ACCEPTED**）。
- `m8-b-exact-candidate-verification.zh-CN.md` 记录覆盖自动化套件、Ubuntu CI、运行时合同、累积备份往返与发布安全性的精确候选版本验证证据（**PASS**）。
- `m8-c-human-acceptance.zh-CN.md` 记录覆盖干净 Windows 启动、浏览器矩阵冒烟、原生文件选择器、托管 PWA 与已知局限性的最终 Product Owner 人工验收证据（**PASS — ACCEPTED；Milestone 8 完成**）。

## 使用方式

1. 使用 `start-local.bat` 启动 Quiz Studio。
2. 在浏览器中打开 `manual_review_questionnaire.html`。
3. 填写顶部元信息，然后按模块完成 QA 检查。
4. 遇到导入或备份相关测试时，使用 `samples/` 里的样例文件。
5. 从问卷导出 JSON 或 Markdown 结果，并保存在 `results/`。

## 范围

这份基线只用于手工验收，不改变产品功能、业务逻辑、工作流或发布状态。

问卷保留了 M6.0 与 M6.2–M6.7 各里程碑增量，以及一条贯穿 M6.0–M6.7 的端到端综合旅程。这些模块覆盖 finalized evidence、Translation Library 与 Practice、学习者标记、富文本批改、外部文件交换、History、重练、溯源和破坏性工作流安全。这些保留的增量在整个 Milestone 7 期间持续作为可复用回归证据；Milestone 7 产品硬化与 Milestone 8 候选版本验证随后均已全部完成并获得正式验收。

## 隐私

请使用测试代号、合成备注和通用截图文件名。不要在 QA 结果中输入真实个人信息、真实试卷内容、账号信息、凭据、本地绝对路径或敏感截图。
