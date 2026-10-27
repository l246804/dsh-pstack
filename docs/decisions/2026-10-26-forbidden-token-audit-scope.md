# 决定：禁词审计按"被 patch 过的文件"闭合，不按"Cursor 词汇"闭合

Status: superseded
Superseded-by: [2026-10-27-upstream-text-plus-adapter.md](2026-10-27-upstream-text-plus-adapter.md) — 整条被取代：checkRewrittenTexts 与 UNIT 分组已删除，没有“被 patch 过的文件”这个集合。
Date: 2026-10-26

## 背景

`checkRewrittenTexts` 按组审计：每组是一批文件、一份禁词表、以及是否检查"粗体技能名"规则。一个文件会被扫，当且仅当它被列进某个组的 `paths`。组按单元编号划分（`UNIT4`–`UNIT8`），划分原则是"哪个单元改的，就归哪个单元"。

这套机制有一个闭包条件，2026-10-26 补上：`FILE_PATCHES` 里出现的每个文件都必须在某个组里，否则 `check-assets` 失败。补之前漏了四个（`setup-pstack` 13 个 patch、`ketchup` 2 个、`blast-radius` 3 个、`poteto-agent` 3 个，共 21 个 patch 无人审计）。

同一次审查把另外三个文件也列成了 "NOT AUDITED"：`skills/technical-writing/SKILL.md`、`skills/teach/SKILL.md`、`agents/comment-sicko.md`。照字面看，它们像是同一类漏网，应当一并补进审计组。实测不是：

| 文件 | patch 数 | 实际机制 |
|---|---|---|
| `skills/technical-writing/SKILL.md` | 0 | `INTRO_SKILLS` 条目，正文由导读块覆盖 |
| `skills/teach/SKILL.md` | 0 | 同上 |
| `agents/comment-sicko.md` | 0 | 逐字节复制自上游，无改写 |

三者禁词命中数都是 0，但**命中为 0 的原因各不相同**，而且都不是"被审计过所以干净"。

把它们塞进 `UNIT4`/`UNIT5` 组会立刻失败两条：那两个组 `boldSkillRule: true`，而 `technical-writing` 与 `teach` 的正文里有 `the **xxx** skill` 这种写法。要收进来就得先改正文，而正文本来就不该按"已改写单元"的标准管——它靠导读块处理，不是靠 patch。

## 决定

审计的闭包条件是**"被 patch 过的文件"**，不是**"含 Cursor 词汇的文件"**。

1. `FILE_PATCHES` 里的每个文件必须在某个审计组里，由 `checkRewrittenTexts` 的闭合检查强制，违反即失败。
2. 没有 patch 的文件不进 `checkRewrittenTexts`，由各自的机制负责：
   - 在 `INTRO_SKILLS` 里的 skill，正文由导读块覆盖，`checkIntroScope` 保证每个条目有理由、且指向真实存在的 skill。
   - 逐字节复制的 agent 文件由 `checkAgents` 按数量与结构校验，正文本身不审。
3. 因此 `technical-writing`、`teach`、`comment-sicko` **有意不在**任何审计组里。这不是漏网，是分工。
4. 审查记录里 "NOT AUDITED" 的枚举把"没被禁词审计"与"有 patch 却没被审计"混成了一类。前者是设计，后者才是缺陷；以后者为准。

## 备选方案

- 把这 3 个文件加进 `UNIT8_PATCHED_FILES`（与那四个真漏网的同组）。放弃：`UNIT8` 用 `ALL_FORBIDDEN_FIELDS` 并集，加进去会因 `boldSkillRule` 让 `technical-writing` 与 `teach` 失败；而且"没 patch 却挂在某个单元名下"会让组名失去意义。
- 为它们新建一个 `boldSkillRule: false` 的组。放弃：这等于承认"这些文件也要按已改写单元审"，可它们的正文没被改写，审的是上游原文。真正该问的是"它们有没有被自己的机制覆盖"，而答案是"有"。
- 把 `boldSkillRule` 从 `UNIT4`/`UNIT5` 去掉，让它不再拦这两类文件。放弃：该规则拦的是"用粗体点名技能"这种在 DSH 里会指向不存在目录的写法，是有价值的检查，不能为了让文件能入组而削规则。
- 把这 3 个文件的禁词命中改写成"已审计"的报告项。放弃：命中为 0 不等于审计过。报告里写"已审计"会让人以为有检查覆盖，恰恰是这次要避免的误导。

## 后果

"新加 patch 但忘了归组"现在会失败，这一类不会再漏。代价是闭包只覆盖被 patch 的文件：一个既没有 patch、又不在 `INTRO_SKILLS` 里、正文却带上游 Cursor 词汇的 skill，不会被 `checkRewrittenTexts` 发现。

那个缺口有一个部分防线，但它不是禁词审计：`checkConceptCoverage` 会扫上游里没被任何单元改写过的文件，命中 `KNOWN_CONCEPTS` 就失败并要求给出处置理由。所以"新上游概念静默复制进树"这条路径是堵住的，堵它的是概念覆盖检查，而不是本记录讨论的禁词审计。

若将来出现"既无 patch、又恰好在 `KNOWN_CONCEPTS` 之外"的 Cursor 词汇，应扩 `KNOWN_CONCEPTS`，而不是把文件塞进审计组——前者按概念闭合，后者按单元闭合，只有前者能覆盖新增内容。
