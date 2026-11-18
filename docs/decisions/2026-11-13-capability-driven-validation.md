# 决策：以 capability 驱动验证覆盖

Status: accepted
Date: 2026-11-13
Scope: playground/**, docs/decisions/**
Implemented-by: commit:99e6036
Review: 2026-11-15

## 背景

旧测试覆盖以 skill、playbook 和官方插件分组组织，重写场景时容易漏掉跨切面能力，也容易把 adapted 实现或角色配置带入 raw 阶段。测试需要围绕能力缺口生成，而不是围绕文件数量生成。

## 决策

- 覆盖单位是 capability，不是 skill/playbook 文件数量；skill/playbook 只作为能力消费者登记。
- 能力需求只从 pstack 使用和 `playground/adapter/dsh.md` 提取；`dsh.md` 的路径布局和 Cursor-only features 是适配事实/跳过规则，不纳入能力提取。DSH 运行时、profile 和 `raw/dsh-evidence.md` 只作为执行或证据，不作为能力来源。
- `playground/scenarios/capability-inventory.json` 是 agent 从上游和 raw/dsh 手工维护的派生清单；`description` 使用中文；候选排除写入 `capability-exclusions.proposed.json`，只有用户明确批准后才写入 `capability-exclusions.json`。
- capability probe 放在 `playground/scenarios/capabilities/`；特殊环境 probe 放在与它平级的、和环境 id 一致的环境目录。
- 默认只保留 `base` 环境；`agent-team` 只用于用户明确指定的 pstack 与 Agent Teams 冲突 probe，其他环境按需增加。
- 现有 skill/playbook 场景不再作为覆盖守卫；旧的按 skill/playbook 分组模型由 capability probe 取代。

## 替代方案

**继续按每个 skill/playbook 建场景。** 覆盖数量大但大量用例只重复同类行为，跨切面的角色、子代理和环境能力反而容易漏掉；该方案被否决。

**把 DSH 运行时和 profile 当成能力来源。** 这会只覆盖已有工具，漏掉 pstack 需要但 DSH 没有的能力；该方案被否决。

**为每个插件预置环境。** 没有对应 probe 的环境只会重复启动，冲突环境应由用户明确指定；该方案被否决。

## 后果

- capability 覆盖由 inventory 和 probe 驱动，skill/playbook 不再决定测试数量。
- raw/adapted 的输入边界和特殊环境更清楚。
- 本记录不定义全项目类型规则；类型规则见 [2026-11-13-project-type-discipline.md](./2026-11-13-project-type-discipline.md)。
