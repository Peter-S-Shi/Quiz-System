# M7.3 C3 真实外部评阅往返

状态：**PENDING — 仍需独立外部评阅者及 Product Owner 导入验证**

仓库中已准备新的合成产品导出文件 `manual-qa/m7-3-c3-review-request.json`。它是在全新隔离 Chrome profile 中导入 `manual-qa/m7-3-c3-seed-backup.json`、从 Translation History 打开 seeded finalized response，再通过真实 Quiz Studio UI 点击 Export Review Request 生成的；它不是预先编写的示例 fixture。两个文件都只有合成内容，不含外部会话元数据。

请求 SHA-256：`9a0cc759b7428064a916c001d0470b425a4bc1377db989963b3ba04ec447d5e0`

Seed backup SHA-256：`95835dc8819de2dd9ee68e47c65a67415430d6c4c84f76a6c351a8dfbc096bb2`

## 复现本地匹配 Response

全库 backup 导入会替换当前 Quiz Studio library 与 evidence collection。请使用一次性全新浏览器 profile，或先导出并安全保留现有备份。

1. 核对上述 seed-backup hash。
2. 打开 Editor，返回 Categories 层级，选择 Import backup。
3. 导入 `m7-3-c3-seed-backup.json`，确认 Translation History 中出现 `Synthetic Community Notes`，response ID 为 `m7-3-c3-response-20260822`。
4. 打开 history detail，核对答案、span annotation 与整题标记均与请求一致。外部评阅者返回后，已提交的请求即可对该精确本地 response 完成导入往返。

## 外部交接

1. 先核对上述请求 hash，再将 `m7-3-c3-review-request.json` 原样交给一位真实外部人类评阅者，或交给本次 M7.3 Codex 会话之外的新建、独立 AI/LLM 会话。
2. 评阅者必须按照请求内嵌任务，新编写并只返回一个 `quiz-studio.teacher-review` JSON 对象。
3. 必须原样保留下列标识：
   - `responseId`：`m7-3-c3-response-20260822`
   - item ID：`m7-3-c3-item-1`、`m7-3-c3-item-2`、`m7-3-c3-item-3`
4. 评阅结果应覆盖真实富评阅契约：三项 judgment、有用的 comment 或 suggested revision、至少一个有效锚定内容修正，以及至少一个有效展示样式修正。具体评阅内容由外部评阅者决定，不要在 Quiz Studio 内预先编写。
5. 不要把外部账号、会话 ID、私人 prompt 历史或截图写入仓库。

## Product Owner 导入与持久化门

1. 导入前保留原始导出请求不变，并在同一个一次性 profile 中完成上述 seed-backup 步骤。
2. 在 Translation History 中打开 seeded 匹配 Learner Response，并导入外部新返回的 Teacher Review。
3. 确认预览指向预期 response 和所有被评阅 item；先取消一次，并确认没有持久化任何内容。
4. 再次导入并确认；核对 History 与 Correction Workspace 中 judgment、comment、suggested revision 和富修正均保持完整。
5. 离开工作区后重新打开，并在浏览器重启后再次打开；确认评阅仍绑定同一 response。
6. 确认原 Learner Response 的答案、span annotation、整题标记、ID 与时间戳完全不变。
7. 导出已持久化 Teacher Review 并重新导入；确认相同 ID、内容未变的评阅按幂等方式处理，不产生重复项或重绑定。
8. 制作一份 `responseId` 错误或含未知 `itemId` 的无效副本；确认预览/确认流程无法持久化它，已有有效评阅及 Learner Response 均不改变。

## 验收记录

- 已使用独立评阅者：PENDING
- 返回评阅由本请求真实新编写：PENDING
- 有效预览/取消/确认：PENDING
- 持久化/重开/History/溯源/再导出：PENDING
- 无效文件拒绝且无状态变更：PENDING
- 原 Learner Response 保持不变：PENDING
- C3 Human Gate 总结：**PENDING**

在 Product Owner 提供真实外部评阅与产品内完整往返证据前，C3 必须保持 PENDING。自动化 fixture 和本次准备的请求文件本身不能关闭该门。
