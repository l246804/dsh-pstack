# port 重建回归记录

本文件只记录跨移植反复出现、容易被再次漏掉的问题，以及对应的预防或验证方式。普通缺陷由修复提交和测试留存，不在这里堆叠。

## 记录规则

- 只有跨版本重建或重复发生的移植坑才记录。
- 每条记录包含：问题与触发条件、根因、预防或验证、状态。
- 记录要指向可重跑的行为检查，不把一次性日志或临时观察当成回归。
- 没有复发风险的历史问题可以删除，保持本文件短小。

## 记录

| 编号 | 问题与触发条件 | 根因 | 预防或验证 | 状态 |
| --- | --- | --- | --- | --- |
| RG-002 | 把上游 skill 的散文式委派选择（派几个、挑哪条）固化成 `role`、`roleRoute`、`roleIndex`、autoPanel 等专用参数，模型频繁漏传或错传，工具还要替调用方解析角色文件 | 适配偏离上游调用形态：上游是调用方直接给模型、按需多次调用做 fan-out，固化成专用选择参数后，参数面和校验围绕补偿概念膨胀，且和角色文件里的配置反复漂移 | `pstack_subagent` 只收 `provider`、`model`、`reasoning_effort`，省略则继承父路由；角色到路由的映射由调用方读取角色文件决定；`tests/subagent.test.ts` 覆盖薄包装语义 | 已覆盖 |
| RG-003 | 上游 pstack 升级后 `src/roles/role-manifest.ts` 的角色清单和 `src/roles/budget.ts` 的预算档位与随包 `setup-pstack` 脱节（0.15.43 把角色 17→9、预算四档→三档） | 适配层把 `pstack/skills/setup-pstack/SKILL.md` 第 5 步的角色键和预算档位抄成硬编码，上游增删时不会自动跟随 | 每次上游升级对照第 5 步同步清单与档位；退役角色键进 `RETIRED_ROLE_KEYS` 由读取静默丢弃，`unlimited` 预算迁移为 `large`；`tests/role-catalog.test.ts`、`tests/role-editor.test.ts`、`tests/budget.test.ts`、`tests/role-config.test.ts` 覆盖；`tests/role-upstream-drift.test.ts` 直接比对上游第 5 步清单与预算档位，不一致即 CI 红；展示层对未见角色/档位回退原始 key，不强制改文案 | 已覆盖 |
| RG-004 | 调用 `pstack_subagent` 覆盖子代理路由时只传 `provider` 或只传 `model`，被工具拒绝并中断当前回合 | 路由覆盖必须 `provider` 与 `model` 成对，只给一个无法确定完整路由；模型容易只抄到角色报告里的另一个字段 | 只给其一时工具抛「provider and model must be provided together, or both omitted」，只给 `reasoning_effort` 也会被拒；`tests/subagent.test.ts` 覆盖；覆盖路由时成对传 `provider` 与 `model`，或全部省略继承父路由 | 已覆盖 |

## 新增流程

1. 先确认问题会在下一次上游或 DSH 基线变更时重复出现。
2. 写出最小触发条件和失败现象。
3. 增加可复跑的测试或脚本检查。
4. 在这里登记问题和验证入口；修复细节留在提交和代码中。
