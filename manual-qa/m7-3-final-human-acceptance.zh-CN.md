# M7.3 Product Hardening 最终人工验收

状态：**PASS — Product Owner 人工验收已完成**

这是合并后的 M7.3 退出门。仅使用合成内容；不要提交截图、浏览器 profile、私人 prompt、外部会话标识或本机路径。

## 已建立的前置事实

- M7.0 审计与合同锁定：PASS
- M7.1 UX/交互 Human Gate：PASS
- M7.2 C2 浏览器真实进程重启 Human Gate：PASS
- H-01：RESOLVED
- C1 与 B4：已完成
- C4 干净环境矩阵：PASS，macOS 已如实延期

## Product Owner 验收项

1. 使用真实独立外部评阅者完成 `m7-3-c3-external-review.zh-CN.md`，且只记录文件要求的非私人验收事实。
2. 完成一条受限合成关键旅程：导入或创建 Translation material、练习并 finalized、重新打开 History、导入外部 Teacher Review、检查 Correction Workspace、开始 retry/remediation，并确认原 response 与溯源保持完整。
3. 在启用生产 Service Worker 注册的受支持托管 HTTP(S) 源上，验证安装/注册、在线使用、离线重新打开与 shell 使用，然后成功恢复在线。
4. 验证从旧 Quiz Studio shell 升级到当前 shell 时，陈旧应用资源被替换而本地用户数据保持不变；确认 recovery entry 只移除 Quiz Studio Service Worker/cache 状态，不删除 localStorage 数据。
5. 单独验证规范本地流程：`start-local.bat`、`http://localhost:8000`、loopback 上刻意保持零生产 Service Worker 注册、安全关闭及重启；确认直接 `file://` 使用被视为不支持。
6. 在代表性的窄屏和普通宽度下，以中文与英文 UI 重复受限旅程；确认已接受的 M7.1/M7.2 行为没有新增 M7.3 回归。

## 验收记录

- C3 真实外部往返：PASS (由 Product Owner 人工验证通过)
- 受限关键旅程：PASS (由 Product Owner 人工验证通过)
- 托管 PWA 在线/离线/恢复在线：PASS (由 Product Owner 人工验证通过)
- 托管缓存升级及数据保持：PASS (由 Product Owner 人工验证通过)
- 规范本地运行时策略：PASS (由 Product Owner 人工验证通过)
- 中英文与响应式回归：PASS (由 Product Owner 人工验证通过)
- M7.3 Human Gate 总结：**PASS**
- Product Hardening 已完成：**YES**
- Release Candidate 已开始：**NO**

在全部 Product Owner 项通过后，M7.3 与 Product Hardening 已完成；Release Candidate 工作（Milestone 8）尚未开始。
