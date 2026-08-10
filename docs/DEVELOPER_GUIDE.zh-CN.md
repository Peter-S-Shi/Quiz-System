# 开发指南

Quiz Studio 是一个静态 ES module 应用。

## 架构

- `src/app.js`：UI 渲染、事件绑定、多语言和浏览器工作流。
- `src/core/question-registry.js`：题型注册、创建、标准化、就绪校验、答案完整性和练习题准备。
- `src/core/grading.js`：判分和答案格式化。
- `src/core/interchange.js`：版本化 Learner Response、Teacher Review、actor、provenance 和校验 contract。
- `src/core/learning-records.js`：独立 Learner Response 集合操作，不受 history 截断影响。
- `src/core/backup.js`：经过校验的试卷库备份组合和向后兼容恢复解析。
- `src/core/migrations.js`：schema 版本和数据标准化。
- `src/storage/local-storage.js`：浏览器本地存储边界。
- `schemas/`：公开 Quiz Paper、Learner Response 和 Teacher Review JSON Schema。
- `examples/`：合成 Quiz Paper 和教学交换示例。
- `docs/OPEN_TEACHING_INTERCHANGE.zh-CN.md`：M6.0 架构与范围边界。

## 学习证据

Objective Quiz 完成时，会在清除活动 session 前建立 finalized Learner Response。它保存本次题目快照、原始提交答案、判分快照、稳定 ID、时间和 provenance。

轻量 history 数组继续为界面显示和错题流程保留条数上限。Learner Response 使用独立存储 key，不会被该上限静默删除。完整备份同时包含两个集合。

Teacher Review 校验只接受追加式 review 字段，并拒绝未知顶层字段、不匹配的 response ID 和未知 item ID。Rich correction 语义和 review 导入 UI 仍属于后续 M6 工作。

## 验证

```bash
npm test
npm run check
```

如果本机没有 npm，可以直接运行底层 Node 检查：

```bash
node --check src/app.js
node --test
```

## 发布准备

仓库已经包含 CI 和仅手动触发的 GitHub Pages workflow。private 阶段暂缓部署，等项目准备公开时再启用 Pages。
