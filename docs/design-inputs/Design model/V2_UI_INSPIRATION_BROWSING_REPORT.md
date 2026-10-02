# Quiz Studio V2 — UI 灵感浏览报告

**性质:** Design Input(设计输入),不是冻结规格。最终视觉由 Design Lane 与 Human Design Gate 决定(见 `V2_PRODUCT_SCOPE_FREEZE.md` §22)。
**浏览日期:** 2026-10-01
**来源:** [One Page Love](https://onepagelove.com/) 收录案例(主要)、[MotionSites](https://motionsites.ai/)(仅动效思路)
**色彩起点:** `docs/design-inputs/typing-practice-demo.html` 的暖白调色板(已由用户确认作为起点)
**约束:** 未参考 V1 UI 架构。

---

## 1. 浏览方法

1. 在 One Page Love 按分类与标签检索:`color/beige`、`color/brown`、`color/earth-tones`、`style/minimal`、`style/narrow`、`style/editorial`、`tag/productivity`、`tag/web-app`、`tag/macos`、`tag/whitespace`、`tag/texture`、`tag/numbered-navigation`、`tag/library`、`tag/writing`、`tag/learning`,以及关键词搜索 learning / study / reading / writing / notes / typing / quiz / journal / calm / paper / editorial 等。
2. 从约 120 个检索结果中,按"暖色或纸感 + 安静克制 + 桌面/工具类界面 + 近期收录"初筛约 40 个。
3. 逐一打开原站实际浏览约 25 个,观察首屏、滚动、悬停、切换等交互。浏览器以**浅色模式**查看(部分站点会跟随系统切暗色)。
4. 按"与 Quiz Studio 的契合度"分为 A / B / C 三档。

---

## 2. 候选清单

### A 档 — 核心融合对象(风格主干)

1. **The Queue** — https://onepagelove.com/the-queue
   - 原站:https://sheets.works/data-viz/the-queue/
   - 看到的:暖米白底;超大衬线标题(Newsreader)+ 等宽辅助字(Roboto Mono);窄阅读栏;章节号以超大浅色数字 `02` 作背景水印;单色细线插画。
   - 借鉴:**阅读型练习正文的排版基准**。翻译原文、客观题题干、证据详情都用窄栏衬线阅读;题号和章节号用"大号浅色数字水印"。

2. **Whilst** — https://onepagelove.com/whilst
   - 原站:https://whilst.app/
   - 看到的:暖白纸面;衬线正文;等宽小按钮;首屏标题带打字光标逐字出现;背景有极淡的同心圆细线。
   - 借鉴:**"安静写作空间"气质**,这是翻译练习与跟打界面的目标感受;背景细线可作为"流动线条"的静态底纹。

3. **Cogito** — https://onepagelove.com/cogito
   - 原站:https://cogito.md/
   - 看到的:暖白底;等宽导航;一处锈橙色强调;`Source / Preview` 分段切换,切换时下方应用窗口平滑展开;桌面窗口内是侧栏 + 正文。
   - 借鉴:分段切换控件可用于批改工作台的 **Original / Corrected**、结果页的 **My answer / Reference**;"一个强调色只用一处"的克制原则。

4. **Shelf** — https://onepagelove.com/shelf
   - 原站:https://www.savetoshelf.com
   - 看到的:应用界面为浅色侧栏(Today / My shelf / Favourites / Collections,右侧等宽计数);浮起的自然语言搜索栏;卡片网格。
   - 借鉴:**资料库(Library)信息架构**,即侧栏分组 + 等宽计数 + 浮动搜索。"Today" 置顶的结构可对应"今天建议练什么"。

5. **Shiori** — https://onepagelove.com/shiori
   - 原站:https://www.shiori.sh/
   - 看到的:标准桌面三栏(侧栏 / 列表 / 阅读器);列表按 Today 分组;阅读器有 `Reader / Original` 切换;整体极干净。
   - 借鉴:**证据历史(Evidence History)与翻译文档的三栏布局**:列表选中后右侧显示详情,不跳页。

6. **Specia1ne** — https://onepagelove.com/specia1ne
   - 原站:https://specia1ne.com
   - 看到的:一条贯穿全页的细竖线("结构轴"),所有章节、过渡、交互都挂在这条轴上;作品列表用编号节点 `01–05` 串在轴上,带 `ACTIVE 01 / 05` 状态;编号导航配等宽小字。
   - 借鉴:**这是"流动线条"最贴近产品语义的版本**。
     - 练习时:题目导航可做成一条细轴上的编号节点,当前题高亮,已答 / 未答 / 标记用不同节点样式。
     - 证据历史:retry lineage 可沿同一条轴向下生长(原始作答 → 批改 → 重做 → 结果)。
     - 菜单切换:指示器沿轴滑动。

7. **Typer** — https://onepagelove.com/typer
   - 原站:https://typer.space
   - 看到的:大地色暖米底;深棕主按钮;漂浮的 3D 键帽散落四周;"本地运行、无需账号、无需网络"的叙事;窗口内输入框带光标。
   - 借鉴:**跟打(Typing)领域的视觉母题**(键帽作为图标或空状态插画);**与 Quiz Studio 的本地优先、无账号定位高度一致**;大地色可作为暖白调色板的深色锚点。

### B 档 — 局部借鉴

8. **Tiny Computer Co.** — https://onepagelove.com/tiny-computer-co
   - 原站:https://tinycomputer.co
   - 衬线大标题配等宽正文,应用窗口浮于纸面,留白充足。借鉴:**衬线 + 等宽的双字体组合**,以及"窗口浮在纸上"的轻阴影层级。

9. **WeekSync** — https://onepagelove.com/weeksync
   - 原站:https://weeksync.app/
   - 整页被**点状虚线边框**包围,像可撕的票据;页角卷起;有剪刀图标;等宽字;标题逐字打出。借鉴:点线作为"可撕下 / 可导出"的隐喻,适合 OTI 的导入导出、备份文件卡片;页角卷起可作"翻到下一题"的微交互。慎用:整体过于手工感。

10. **Daily Dispatch** — https://onepagelove.com/daily-dispatch
    - 原站:https://www.dailydispatch.app/
    - 报纸式版面:日期刊头 `01 OCT / 2026`、点线分隔、窄体衬线大标题;加载时一张"报纸"旋转飞入。借鉴:**"今日建议"页可以做成一份每日简报**(日期刊头 + 条目 + 推荐理由),天然抵抗"仪表盘化"。

11. **Kontu** — https://onepagelove.com/kontu
    - 原站:https://kontu.io/
    - 桌面应用外壳:带图标的窄侧栏;内容放在内嵌圆角面板;数字用等宽;状态用小胶囊标签(Current)。借鉴:**应用外壳的层级**(底层暖灰,工作面板纸白);数值一律等宽。

12. **Bueno.fyi** — https://onepagelove.com/bueno-fyi
    - 原站:https://bueno.fyi
    - 搜索优先的窄列表;胶囊筛选带计数(`All 197 · Company 32 …`);单行条目,右侧弱化元信息。借鉴:**题库 / 文档列表的筛选与行样式**。

13. **Ma(鳥獣戯間)** — https://onepagelove.com/ma
    - 原站:https://monakadesign.online
    - 灰米色;文字随滚动上浮淡入、互相交替;水墨晕染纹理在文字背后流动;加载计数用衬线数字。借鉴:**"墨"的动效语言**,即墨迹晕开和淡入上浮。只在首页或空状态使用,工作区不用。

14. **Midnight** — https://onepagelove.com/midnight-2
    - 原站:https://www.askmidnight.com
    - 暖奶油色段落随滚动**逐词由浅灰"上墨"变深**。借鉴:这个效果直接对应**跟打进度**(已打 = 深墨,待打 = 浅灰),也可用于翻译"完成练习"的确认动画。

15. **Rows** — https://onepagelove.com/rows
    - 原站:https://rows.gg/
    - 暖白窄版式;Logo 由点阵粒子聚合而成;界面卡片干净。借鉴:点阵聚合可作为应用启动 / 首次加载的一次性动画(不循环)。

16. **TXT Text Editor** — https://onepagelove.com/txt-text-editor
    - 原站:https://adrien.website/txt/
    - 浮动胶囊工具条(Focus mode / Switch theme / Show-hide tabs / Quick note);点击 Focus mode 后标题栏、标签、字数统计全部退场,只留纸面。借鉴:**专注练习(Focused Practice)的进入方式与退场动画**;底部等宽字数统计。

17. **Flowjam** — https://onepagelove.com/flowjam-2
    - 原站:https://flowjam.com
    - 左侧固定的悬浮纸卡侧栏;纸张颗粒噪点;有性格的衬线大字。借鉴:**侧栏作为悬浮纸卡**而非贴边;轻微纸纹噪点。不借鉴:粉色高饱和强调。

### C 档 — 已浏览、不建议采用(记录以免重复评估)

| 案例 | 原因 |
|---|---|
| [Hustla](https://onepagelove.com/hustla) | "只关心今天"的理念契合,但视觉是常规 SaaS,无独特语言 |
| [Lumnea](https://onepagelove.com/lumnea) | 学习类,但面向移动端消费,风格偏娱乐 |
| [Superwhisper](https://onepagelove.com/superwhisper) | 深色渐变大片,气质不符 |
| [Paper](https://onepagelove.com/paper-2026) | 现为深色专业工具风 |
| [Will Lenzen](https://onepagelove.com/will-lenzen) | 深色影像氛围,不符合纸面主题 |
| [Humanoid Index](https://onepagelove.com/humanoid-index) | 加载未完成,描述为冷白目录风,优先级低 |
| [ARCHIV](https://onepagelove.com/archiv) | 气质对,但内容过少,只可参考衬线字标 |
| [Uncle Rudy](https://onepagelove.com/uncle-rudy)、[Flashform](https://onepagelove.com/flashform) | 深色 / 高饱和 / 游戏化,与"不制造焦虑"相悖 |

---

## 3. 融合提炼:「Warm Paper · Living Ink」

### 3.1 风格主干(由 A 档融合)

| 维度 | 方向 | 主要来源 |
|---|---|---|
| 底色与纸面 | 暖白底 `#f4f1e9` + 纸白工作面 `#fffdf7`;可选极轻纸纹噪点 | typing demo、Whilst、Flowjam |
| 深色锚点 | 墨色 `#1f2933` 用于文字;主按钮可试大地深棕 | typing demo、Typer |
| 强调色 | 蓝 `#315d8a` 作唯一交互色;"一个强调色只用一处" | typing demo、Cogito |
| 字体 | 界面无衬线(Geist / Inter 类);阅读正文衬线(Newsreader 类);元信息、计数、计时等宽(Roboto Mono 类) | The Queue、Tiny Computer、Cogito |
| 布局 | 桌面三栏(侧栏 / 列表 / 详情);侧栏可为悬浮纸卡;窄阅读栏 | Shiori、Shelf、Kontu、Flowjam |
| 数字 | 题号、章节号用超大浅色衬线数字水印;计数一律等宽 | The Queue、Kontu、Bueno |
| 结构线 | 一条贯穿的细轴串起编号节点 | Specia1ne |

### 3.2 动效语言(motion 为点缀,不当主角)

MotionSites 的浏览结论:它的核心是深色视频背景和炫光,**不直接采用**。可取的只有三点:悬停时局部"苏醒"(卡片悬停才播放预览);胶囊筛选切换用约 150ms 的标准缓动;点阵 / 粒子场随光标变化。下面这些动效是把它们折算成纸墨语言后的结果:

| 场景 | 动效 | 来源 |
|---|---|---|
| 菜单 / 侧栏切换 | 指示器像墨线沿结构轴滑动,先拉长再收拢(200–260ms) | Specia1ne + MotionSites 胶囊切换 |
| 视图切换 | 新视图上移 8px 淡入,像纸张叠入;旧视图轻微下沉 | Ma、Daily Dispatch(弱化版) |
| 进入专注练习 | 侧栏、工具条依次退场,只留中央一张纸 | TXT Focus mode |
| 光标流线 | 首页 / 空状态背景是极淡的细线场(参考 Whilst 同心圆),靠近光标的线条轻弯、加深,离开后缓慢回弹;**练习与批改界面关闭**;遵循 `prefers-reduced-motion` | Whilst、Rows 点阵、MotionSites 背景 |
| 进度"上墨" | 跟打进度、翻译完成、证据时间线逐条出现,由浅灰过渡到深墨 | Midnight |
| 悬停 | 列表行出现左侧墨线和极淡底色;推荐条目的"理由"行展开 | MotionSites 悬停苏醒、Bueno 行样式 |
| 首次启动 | 点阵聚合成 Logo,只播放一次,不循环 | Rows |

### 3.3 与 Quiz Studio V2 界面的映射

| 产品界面 | 主要参考 |
|---|---|
| 今日建议(推荐 + 到期复习) | Daily Dispatch 简报版式 + Shelf 的 "Today" + Hustla 理念;每条推荐附可读理由,不显示百分比 |
| 资料库(三个任务域的材料) | Shelf 侧栏 + Bueno 筛选列表 + Shiori 三栏 |
| 专注练习:客观题 | The Queue 窄栏 + 题号水印 + Specia1ne 题目轴 |
| 专注练习:翻译 | Whilst 写作气质 + 衬线原文;元认知三种标记用笔迹样式区分 |
| 专注练习:跟打 | Midnight "上墨"进度 + Typer 键帽母题;长文本自动跟随(Scope §12.6) |
| 批改工作台 | Cogito `Source / Preview` 分段 → Original / Corrected |
| 证据历史与重做溯源 | Shiori 三栏 + Specia1ne 结构轴(作答 → 批改 → 重做) |
| 导入导出 / 备份 / V1 迁移 | WeekSync 点线"票据"卡片 |

### 3.4 明确避开

- 深色霓虹、高饱和渐变大字、视频背景(MotionSites 主体风格)。
- 循环动画、庆祝特效、加分或连胜反馈(范围冻结已砍掉游戏化)。
- 在练习、批改等工作区出现任何装饰性动效。

---

## 4. 待 Human Design Gate 决定

1. 阅读正文是否采用衬线(The Queue / Whilst 路线),还是全无衬线(Shiori / Kontu 路线)。
2. 侧栏是贴边(Shiori)还是悬浮纸卡(Flowjam)。
3. 主按钮用墨蓝还是大地深棕(Typer)。
4. 纸纹噪点是否保留。
5. 结构轴(Specia1ne)是否作为全局导航语言,还是只用于题目导航与证据溯源。

---

## 5. 配套原型

`quiz-studio-v2-ui-prototype.html`(同目录,单文件,浏览器直接打开)把本报告的风格与动效落到 V2 的真实功能上:今日简报、日历(Scope Revision 1 的日期级排程界面)、资料库、证据历史、批改台、交换与备份、设置(沿用 V1 界面偏好),以及三个任务域的专注练习。数据均为合成示例。左下角“设计注释”开关可显示每个区域的参考来源。
