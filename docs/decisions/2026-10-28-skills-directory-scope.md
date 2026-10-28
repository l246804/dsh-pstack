# 决定：skills 目录只补充 pstack 缺失的能力

Status: accepted
Date: 2026-10-28
Scope: skills/**
Implemented-by: commit:478a5140b15cbab8d927b6ce4626c2e71e840a48
Review: 2027-04-28

## 背景

发布产物里有两处技能：`pstack/pstack/skills/` 是上游 pstack 的移植树，`skills/authored/` 与 `skills/.agents/skills/`（构建时以 `vendored/` 落进 `dist/skills`）是本仓库自己的技能工作区。

上游 pstack 是 Cursor 语境的技能集。移植到 DSH 后，个别技能会因为 DSH 没有 Cursor 的官方内置能力而引用 `skills/` 目录里的替代件，例如 `create-skill` 指向 `writing-for-agents`。这条依赖容易推出两个错误结论：一是 `skills/` 属于 pstack 的配套件；二是凡是 pstack 已经提供同类能力的技能都不该再收。两者都没有依据——`skills/` 服务的是真实项目开发，pstack 只是它的一个使用方。

## 决定

`skills/authored/` 与 `skills/.agents/skills/` 的唯一职责是补充 pstack 插件缺失的能力；与 pstack 的内容是否相关，不构成收录条件。

- `vendored/`（源目录 `skills/.agents/skills/`，由 `skills experimental_sync` 维护）：开源上游技能的移植件。逐字保留上游内容，在 `skills-lock.json` 记 `source`、`ref`、`skillPath`、`computedHash`。
- `authored/`：本仓库自建的技能，例如决策记录类。
- 收录判据，两条同时满足：cursor pstack 中没有提供类似作用的技能；该技能在真实项目开发中作用明显。
- 移植后的 pstack 技能依赖 `skills/` 下某个技能，只是一条使用关系，不使双方强相关，也不改变收录判据。

## 备选方案

- **把 `skills/` 当 pstack 的配套件，只收移植树跑起来所依赖的技能。** 不选：会把与 pstack 无关但真实开发需要的技能挡在门外，`authored/` 里的决策记录技能正是这一类；依赖关系是使用关系，不足以当收录边界。
- **不设统一判据，逐例讨论。** 不选：同一条边界会被反复重议，也回答不了"为什么收这个不收那个"。
- 本次没有考虑"看到就用、无条件收录"，那等于没有判据。

## 后果

- 得到一条可以反复套用的判据。第一个按它收录的是 `retro`（来源 `mattpocock/skills@59db609eb1e18aaf59b63284d0e52255aff0c63c`，落进 `.agents/skills/`，构建时以 `vendored/` 发布）：pstack 的 `/reflect` 只在本次会话用到的技能范围内产出技能编辑，`/correct` 只在同类错误重复出现后动手，两者都不提供对 agent 运行环境——导航、guardrail、AGENTS.md、工具经济、空指令、信息获取——做体检的等价能力；retro 单文件、无脚本、只出报告不改仓库，在真实项目开发中作用明显。
- 代价：`skills/` 的技能集可以独立于 pstack 增长，与上游 pstack 版本没有对应关系，不能再靠比对上游推断这里应该有什么；每个新收录都要单独论证那两条判据。
- 重新考虑的条件：一旦 `skills/` 需要与 pstack 版本联动发布（同名技能覆盖、版本对齐、成对升级），这条判据要重写。
