# 场景

一个 `scenarios/<id>.ts` 默认导出一份 `BehaviorScenario`，文件名与 `id` 一致。注册表自动发现该目录的 TypeScript 文件，结果放在 `results/<id>/`。

`kind: "gap"` 用于调查能力缺口，`kind: "regression"` 用于验证已知行为。两者共用执行器，由场景文件决定覆盖范围；缺口清单的审批状态不参与注册、选择或校验。

## 编写

- 一个场景验证一个用户可观察的行为。prompt 和 rubric 描述目标，不指定某个插件工具或某一 variant 的实现。
- `workspace` 只放必要 fixture。具体模型、provider 和测试输入通过 fixture 提供；被测会话不能读取场景定义。
- `assertions` 检查文件、回合等机械事实；`rubric` 定义最终合格条件。纯视觉行为可以只检查回合完成，再按 `uiObservations` 观察实际呈现。文字提到文件名不能证明播放器或图表存在。
- `variants`、`environments` 声明适用范围，默认值见 `runner/scenario/defaults.ts`。未声明的组合不记失败；对照运行保持任务和判据相同。
- `id` 使用小写字母、数字和短横线，保持稳定。结构与可用断言见 `runner/types.ts`。

修改场景后运行 `vp run playground:typecheck` 和相关测试。用户调整场景集合时，同步删除或更新对应的结果目录及索引；改变行为或判据时，在该项结果说明需要复核的具体原因，不把旧结果当作新判据的运行证明。
