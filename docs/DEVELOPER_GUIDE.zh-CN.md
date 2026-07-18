# 开发指南

Quiz Studio 是一个静态 ES module 应用。

## 架构

- `src/app.js`：UI 渲染、事件绑定、多语言和浏览器工作流。
- `src/core/question-registry.js`：题型注册、创建、标准化、就绪校验、答案完整性和练习题准备。
- `src/core/grading.js`：判分和答案格式化。
- `src/core/migrations.js`：schema 版本和数据标准化。
- `src/storage/local-storage.js`：浏览器本地存储边界。
- `schemas/quiz-paper.schema.json`：公开试卷 JSON Schema。
- `examples/sample-quiz.json`：合成公开示例数据。

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

仓库已经包含 CI 和 GitHub Pages workflow。GitHub Pages 可能还需要在仓库设置中启用，部署才会真正成功。
