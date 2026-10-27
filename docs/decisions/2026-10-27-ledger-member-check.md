# 决定：让差异清单按成员受检，而不只按计数

Status: accepted
Date: 2026-10-27

## 背景

[2026-10-26 的决定](2026-10-26-upstream-divergence-ledger.md)建立了 `docs/upstream-divergences.md`，并用 `checkDivergenceLedger` 守住它。当时明确记下一条边界：检查只能做字符串匹配，所以能断言的边界是"计数与点名"，再往前会变成用一条会过期的规则去校验另一条会过期的规则。

那条边界事后证明划早了。计数相等不等于成员相同：清单的降级表里有一行 `Cursor Automations`，而它在 `capabilities.ts` 里是 `excluded`；同时 `image generation` 这一行整个缺席。一进一出，总数仍是 13，`\b13\b[^\n]{0,8}?`degraded`` 照样匹配。`mapped` 的列举同样少了 `agent store`，因为它只写名字不写数字，连计数都没碰。两处漂移期间 `pnpm run check` 全绿。

这不是"清单写错了一句话"，而是"清单的每一句都像对的，整体却错了"。计数是守恒量，成员不是。

## 决定

给 `CapabilityBase` 加一个必填字段 `ledgerAnchor`，33 行各带一个；`checkDivergenceLedger` 增加 `checkLedgerMembers`，逐行断言该字符串出现在清单里。锚点用**显式声明**，不从 `cursor` 派生。

同时把类别词表对齐：`LEDGER_CATEGORIES` 补 `deferred`，新增 `LEDGER_EXTRA_CATEGORIES` 承载 `regression`（它不是合法的 `coverage` 值，只存在于清单）。`capabilities.ts` 导出 `CAPABILITY_COVERAGES`，让"词表"和"当前用到哪些值"分开——`deferred` 合法但没有行在用它，从 `CAPABILITIES` 反推词表会漏掉它。

## 备选方案

- **从 `cursor` 机械派生锚点。** 放弃：实测 33 行里有 16 行派不出、11 行在归一化后仍匹配不到（`built-in pull request tool`、`worktree isolation`、`agent store` 这类是上游散文，不是本仓库的标识符）。派生规则会报出并不存在的漂移，而误报的门最后会被关掉。
- **只加 `mapped` 的成员检查。** 放弃：这次的 `image generation` 漂移正是发生在 `degraded` 一节，只守 `mapped` 等于绕开判例。
- **断言每行在清单里出现的次数。** 放弃：同一能力在清单里出现一次是引用、两次是"措辞改写清单"再提一遍，次数没有稳定含义，按次数断言会把正常编辑判成失败。
- **让清单由 `capabilities.ts` 整份生成。** 放弃：沿用前一条决定的分析——清单主体是判断（哪条差异可接受、哪种措辞是刻意的），生成器只能产出表，混合来源比手写更难维护。这次只在不改变手写性质的前提下加强检查。
- **什么都不改，靠同步时人工核对。** 放弃：前一条决定已经说明那正是第 6 步唯一可能失效的地方，而这次漂移是在没有任何上游变动的情况下发生的，人工核对根本不会触发。

## 后果

"一进一出"这类漂移现在会让 `check:assets` 失败，`tests/divergence-ledger.test.ts` 另有 5 条用例守住锚点的非空、唯一，以及"删掉一条就少一条"的性质。改 `capabilities.ts` 增加一行会强制同步清单。

代价三条。第一，每加一行能力要同时想一个锚点字符串，这是一个新的手工步骤。第二，锚点是字面量，清单里换个措辞就要跟着改锚点，否则误报——它守的是"有没有点名"，不是"点得对不对"。第三，`ledgerAnchor` 让 `capabilities.ts` 从纯数据变成"数据 + 对另一份文档的引用"，两份文件自此耦合更紧；这个耦合是明知代价买下的，因为它换来的正是"改代码无法只让计数守恒"。

重新考虑的条件：如果清单改成按能力维度拆成多个小文件（前一条决定也提过这个条件），锚点应随之改为"文件内必现"，届时 `checkLedgerMembers` 要按覆盖类别分派到对应文件。
