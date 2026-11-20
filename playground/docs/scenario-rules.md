# 场景规则

本文件说明 `playground/scenarios/` 的场景契约、gap 绑定和回归边界。运行维度见 [model.md](./model.md)；缺口生成规则见 [../../native/AGENTS.md](../../native/AGENTS.md)。

## 来源

- gap 场景：来自 `native/gaps.json` 中状态为 `confirmed` 的缺口，必须声明 `kind: "gap"` 和对应的 `gap` id。
- regression 场景：记录已验证、需要持续防回归的行为，必须声明 `kind: "regression"`，不写 `gap`，也不依赖 `gaps.json`。

两类场景共用同一个目录和执行器。不要为了增加回归场景而新增缺口，也不要把 regression 场景写进 gap-lock。

## 定义

一个文件一份 probe，默认导出 `BehaviorScenario`。字段定义和断言类型见 `runner/types.ts`；默认 variants/environments 见 `runner/scenario/defaults.ts`。

- `id` 稳定且唯一；同一 probe 在 native/adapted 使用同一 id。
- gap 场景的 `capability` 必须等于 `gap`；regression 不声明 `gap`。
- 一个场景只覆盖一个行为分支，不写工具名、包名、实现路径或 variant 专属期望。
- 场景 prompt 和 rubric 不绑定具体 provider、模型名、外部 URL 或宿主路径；需要资源时使用 workspace fixture。
- `turns` 描述用户可观察目标；`workspace` 只放必要 fixture，不引用宿主路径。
- `assertions` 只做机械事实，必须能在目标行为缺失时失败；`turn-completed` 只能作为基础项，不能是唯一断言。
- `rubric` 描述用户可观察的合格边界；`uiObservations` 只在需要真实呈现时使用；`answers` 只用于自动回答 ask_user_question。
- 场景允许的 assertion 类型由 `runner/types.ts` 定义；执行和判定见 `runner/evidence/evidence.ts`。

## Gap 守卫

- 每个 confirmed 缺口至少有一个 gap 场景。
- gap 场景引用的缺口必须存在且仍为 confirmed；缺口被推翻或排除时，删除场景或改成 regression。
- gap 场景的 capability 必须与 gap 相同。
- 缺口描述变化后先重读场景；确认场景仍成立后运行 `vp run playground:gap-lock -- --write`。
- regression 场景不参与 gap 计数，也不进入 gap-lock。

守卫由 `vp run playground:gap-lock` 提供。

## 完成标准

- `vp run playground:gap-lock -- --check` 通过。
- 新增 gap 场景不会破坏 confirmed gap 覆盖；regression 场景不携带 gap。
- `vp run typecheck`、`vp run playground:typecheck` 和 `vp test` 通过。
