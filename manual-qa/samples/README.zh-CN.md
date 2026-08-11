# 手工 QA 样例

本文件夹中的所有文件都是合成数据，可用于手工测试。

本文件夹只覆盖 Objective Quiz（Milestone 1-5）。这里不包含 Translation Practice、Learner Response、Teacher Review 或评阅/补救请求相关的样例。

## 文件

- `quiz-normal-sample.json`：有效试卷，覆盖单选、多选、填空、判断和一对一匹配。
- `quiz-boundary-sample.json`：有效试卷，包含较长文本、标签、符号、双语内容、大小写敏感填空答案和更大的匹配题。
- `quiz-invalid-sample.json`：故意无效的试卷文件，用于测试导入失败路径。应用应拒绝它，或在不破坏现有数据的前提下安全处理。

## Translation / Open Teaching Interchange 样例

`../manual_review_questionnaire.html` 中 M6.0-M6.7 的手工 QA 模块并不使用本文件夹中的文件，而是引用顶层 `examples/` 目录里公开契约的合成示例，这样这些样例才能和验证它们的自动化测试保持同步：

- `examples/sample-translation-document.json`
- `examples/sample-translation-learner-response.json`
- `examples/sample-learner-response.json` / `examples/sample-teacher-review.json`
- `examples/sample-external-teacher-review.json`
- `examples/sample-review-request.json`
- `examples/sample-remediation-request.json`
- `examples/sample-remediation-translation-document.json`

请不要把它们复制进 `samples/`；如果某个 QA 步骤要求手写一个变体，请直接在 `examples/` 原地编辑或改编。

## 使用说明

- 普通导入、练习、导出、备份和答案对比测试使用 normal 样例。
- 布局、筛选、搜索、随机、乱序和判分边界测试使用 boundary 样例。
- invalid 样例只在测试用例明确要求验证导入失败时使用。

不要把这些文件替换成真实用户试卷内容。
