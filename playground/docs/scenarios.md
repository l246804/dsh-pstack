# 场景

一个 `scenarios/<id>.ts` 默认导出一份 `BehaviorScenario`，文件名与 `id` 一致。注册表自动发现该目录的 TypeScript 文件，结果放在 `results/<id>/`。

## 来源与对应关系

- gap 场景来自 `native/gaps.json` 中 `confirmed` 的缺口，声明 `kind: "gap"` 和对应的 `gap` id，`capability` 等于该 id。每个 confirmed 缺口至少有一个场景，且场景覆盖 native；adapted 是否适用由 `variants` 声明决定。
- regression 场景验证已知行为，声明 `kind: "regression"`，不写 `gap`，不参与缺口覆盖和 gap-lock。回归场景无需先新增缺口。

两类场景共用执行器。缺口被推翻或排除后，删除对应 gap 场景，或在仍需防回归时改成 regression；缺口提取与审批遵循 [native 指引](../../native/AGENTS.md)。

`scenarios/gap-lock.json` 保存 confirmed 缺口 id 与描述的指纹，用于提醒复核场景，不记录运行结果或 DSH/pstack 版本。新增或修改缺口后先检查对应场景，确认匹配后更新并校验：

```sh
vp run playground:gap-lock -- --write
vp run playground:gap-lock -- --check
```

`--write` 先检查覆盖关系，再更新 lock；`--check` 只检查、不写文件。描述即使只改措辞也会触发复核；确认场景仍适用时只更新 lock，是否重跑根据行为或判据变化决定。

## 编写

- 一个场景验证一个用户可观察的行为。prompt 和 rubric 描述目标，不指定某个插件工具或某一 variant 的实现。
- `workspace` 只放必要 fixture。具体模型、provider 和测试输入通过 fixture 提供；被测会话不能读取场景定义。
- `assertions` 检查文件、回合等机械事实；`rubric` 定义最终合格条件。纯视觉行为可以只检查回合完成，再按 `uiObservations` 观察实际呈现。文字提到文件名不能证明播放器或图表存在。
- `variants`、`environments` 声明适用范围，默认值见 `runner/scenario/defaults.ts`。未声明的组合不记失败；对照运行保持任务和判据相同。
- `id` 使用小写字母、数字和短横线，保持稳定。结构与可用断言见 `runner/types.ts`。

修改场景后运行 `vp run playground:typecheck` 和相关测试。用户调整场景集合时，同步删除或更新对应的结果目录及索引；改变行为或判据时，在该项结果说明需要复核的具体原因，不把旧结果当作新判据的运行证明。
