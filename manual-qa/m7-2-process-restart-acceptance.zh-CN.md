# M7.2 浏览器真实进程重启验收

状态：**PENDING — 需要 Product Owner 执行**

只有使用合成数据完成浏览器全部进程退出以及强制终止浏览器进程后，才能关闭 C2。仅刷新页面不算通过。不要记录私人题目、个人信息、本机绝对路径或敏感截图。

## 证据元数据

- 测试者代号：
- 日期：
- 操作系统：
- 浏览器及准确版本：
- Quiz Studio commit：
- 本地启动方式：
- 正常重启方法（如何确认全部浏览器进程已关闭）：
- 强制终止方法：

以下每一项都要记录：预期状态、实际恢复状态、重启方法及 PASS/FAIL。

## 1. Objective Quiz — instant

1. 以 `instant` 模式开始一份包含多题的合成测验。
2. 至少回答一题，保留一题未答，前进到非第一题，并保留先前已提交答案的评分反馈。
3. 完全关闭浏览器，重新打开，回到同一 Paper，核对当前题号、已答/未答状态、结果与反馈。
4. 变更进行中状态后，使用强制终止浏览器进程的方法重复验证。
5. 完成会话，重启浏览器，确认已完成的活动会话不会被提示或恢复。

结果：PENDING

## 2. Objective Quiz — submit at end

1. 以 `submitAtEnd` 模式开始合成测验。
2. 输入多个答案，至少保留一题未答，并停在非第一题；确认最终提交前不泄露评分或结果。
3. 分别执行完整关闭/重开与强制终止/重开；每次核对模式、当前题号、答案、未答状态及无提交前反馈。
4. 取消一次最终提交确认，确认活动状态完全不变。
5. 完成会话并重启，验证已完成会话被清理。

结果：PENDING

## 3. Translation Practice — 普通来源

1. 开始一份至少三项的合成 Translation Document。
2. 输入多个答案，移动到非第一项，揭示参考译文，添加 span annotation 与整题标记。
3. 完整关闭并重开，逐项核对上述状态。
4. 修改一项状态，强制终止浏览器并重开，核对最新持久化状态。
5. 取消一次明确的放弃/覆盖提示，确认状态不变；随后确认放弃，确认旧活动会话不再恢复。
6. 完成另一会话并重启，验证已完成会话清理。

结果：PENDING

## 4. Translation Practice — Retry 与 Remediation 来源

1. 从合成的已完成证据开始 Retry，会前记录 source response/material 标识。
2. 添加多个答案、非第一项位置、揭示状态、span annotation 与整题标记；分别完整关闭/重开及强制终止/重开，每次核对工作状态与 Retry 来源。
3. 从合成 Teacher Review 开始 Remediation，并记录 source response/review/material 标识。
4. 重复两种重启方法，每次核对工作状态与 Remediation 来源。
5. 分别验证两个来源路径的明确放弃及完成后清理。

Retry 结果：PENDING

Remediation 结果：PENDING

## 5. 存储隔离

1. 在各自工作流中同时保留一个 Objective 与一个 Translation 进行中会话。
2. 仅放弃或完成 Objective，进程重启后确认 Translation 恢复不受影响。
3. 重建 Objective 进度，再仅放弃或完成 Translation，确认 Objective 恢复不受影响。

结果：PENDING

## 最终验收

- 正常完整进程关闭/重开：PENDING
- 强制终止进程/重开：PENDING
- Objective `instant`：PENDING
- Objective `submitAtEnd`：PENDING
- Translation 普通：PENDING
- Translation Retry：PENDING
- Translation Remediation：PENDING
- 放弃/取消语义：PENDING
- 已完成会话清理：PENDING
- Objective/Translation 键隔离：PENDING
- C2 Human Gate 总结：**PENDING**

验收备注：
