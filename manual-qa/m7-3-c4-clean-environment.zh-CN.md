# M7.3 C4 干净环境验证

状态：**PASS — Windows 与 Ubuntu 必须项均通过；macOS 明确延期**

日期：2026-08-22

验证基线：远程 `main` 的 `e3d6a693c29d6be93848ffb652743f8919e17216`

仓库未保留私人数据、本机专属路径、截图、浏览器配置内容或导出的本地状态。

## 必须项：Windows 11 — PASS

- 从远程 `main` 创建了真实全新临时 clone；未从开发 checkout 复制依赖或工作树文件。
- `npm ci`：PASS，按 lockfile 安装 5 个 package。
- 完整仓库检查：PASS，290/290 tests。
- 运行时版本：Windows 11 25H2 build 26200.9168；Node.js 24.18.0；npm 11.16.0；Python 3.12.13；Chrome 151.0.7922.173。
- 在 `PATH` 中没有 `py`/`python` 时首次运行 `start-local.bat --no-browser`：按预期安全失败，并显示中英双语 Python 前置条件提示；未留下源地址漂移或半启动运行时。
- 提供文档要求的 Python 3 前置条件后运行 `start-local.bat --no-browser`：PASS；IPv4 + IPv6 的规范 `http://localhost:8000` 运行时正常就绪。
- 健康端点：PASS，返回 `{ "status": "ok", "origin": "http://localhost:8000" }`。
- 当前根页面与 `sw.js`：HTTP 200，并带 `no-store` 缓存控制。
- 全新隔离 Chrome profile：PASS；`Quiz Studio` 在编辑器中渲染，导入/导出控件存在，完整 ESM 图成功加载。
- 合成导入/导出：PASS；导入 `examples/sample-quiz.json` 后显示 `Sample Web Basics Quiz`，随后成功导出一个 `quiz-studio.quiz-paper` JSON 文件。
- 规范 loopback Service Worker 策略：PASS；生产 Service Worker 注册数为零，符合 no-store 开发源的刻意设计。
- 关闭与重启：PASS；停止运行时后在规范源重新启动、健康检查通过，再次停止，全程无源地址漂移。
- `file://`：合同明确不支持；不作相反声明。

## 必须项：Ubuntu CI — PASS

- 精确合并基线 commit 的 GitHub Actions `CI`（`ubuntu-latest`）：PASS。
- Workflow 保持 Node.js 22、Python 3.12、`npm ci` 与 `npm run check`；未弱化检查或绕过平台。
- Draft PR 推送后，M7.3 分支 CI 仍必须通过；这是交付检查，不替代本干净基线记录。

## macOS — DEFERRED / NOT VERIFIED

当前没有 macOS runner 或干净 macOS 环境。修订后的 C4 合同不把 macOS 作为 M7.3 必须退出项。仓库不会宣称已验证 macOS，也不会添加人为的 macOS 基础设施。

## C4 结论

- 干净 Windows 11：PASS
- Ubuntu CI：PASS
- 运行时缺陷：未发现
- macOS：DEFERRED / NOT VERIFIED
- C4 总结：**PASS**
