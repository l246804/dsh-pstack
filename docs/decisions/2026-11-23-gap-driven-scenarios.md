# 决策：以 native gap 驱动 playground 场景

Status: superseded
Date: 2026-11-23
Scope: native/gaps.json, playground/**, docs/decisions/**
Implemented-by: PR #43
Review: 2026-11-27
Superseded-by: docs/decisions/2026-11-27-playground-scenario-results.md — 场景文件由用户独立维护，不再与 native 缺口状态和指纹绑定

## 背景

旧的 capability inventory 和 `playground/scenarios/capabilities/` 目录把场景覆盖做成独立清单，场景文件按 skill、render 和 agent-team 目录分组。新增或移除 gap 时需要同时维护 inventory、排除清单和目录结构，覆盖关系容易和 `native/gaps.json` 脱节。最终需要一条单一的覆盖来源，并把 probe 定义收敛到扁平文件。

## 决策

- gap 场景只从 `native/gaps.json` 中状态为 `confirmed` 的缺口生成，必须声明 `kind: "gap"`、对应的 `gap` id，且 `capability` 等于 gap id。
- 回归场景声明 `kind: "regression"`，不携带 gap，也不进入 gap-lock。
- 每个 probe 是 `playground/scenarios/` 下的一个扁平文件，默认导出 `BehaviorScenario`；目录不表达 variant 或 environment。
- `vp run playground:gap-lock -- --check` 校验 confirmed gap 与场景覆盖、缺口描述指纹和场景声明。
- 该决策取代 [2026-11-13-capability-driven-validation.md](./2026-11-13-capability-driven-validation.md) 中 capability inventory、排除清单和目录分组的实现；capability 作为覆盖单位的原则由本记录延续。

## 替代方案

**继续维护 `capability-inventory.json` 和按目录分组的 probe。** 被否决。inventory、排除清单和目录结构需要与 `native/gaps.json` 同步，新增 gap 时容易漏场景或留下空目录。

**只按 confirmed gap 生成场景，不保留 regression 场景。** 被否决。已修复的行为仍需要持续防回归，regression 场景不依赖缺口清单。

## 后果

- native gap 清单是 gap 场景的唯一来源，场景覆盖由 gap-lock 守卫。
- 新增 probe 只需增加一个扁平场景文件，不再修改目录结构或能力清单。
- regression 场景独立于 gap 生命周期，可以在缺口关闭后继续保留。
