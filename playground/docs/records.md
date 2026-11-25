# 记录长什么样

本文件说明 playground 的运行维度、运行身份和证据布局。怎么跑见 [run.md](./run.md)，怎么判定见 [judge.md](./judge.md)。

## 运行维度

- `variant`：`native` 使用 DSH 标准运行时，不加载被测插件；`adapted` 加载当前插件和适配配置。
- `environment`：环境列表与能力由 `runner/scenario/environments.ts` 维护；`base` 是默认对照。
- 同一场景在成对运行时保持相同的 prompt、workspace 和断言；variant 专属判断属于分析规则，不写进场景。场景可以声明只跑某一个 variant，缺失的 variant 不是可比较记录。
- 场景和环境的默认值见 `runner/scenario/defaults.ts`；解析和适用性判断见 `runner/scenario/registry.ts`。

## 运行身份

一次记录的身份由 `RunRecord` 和 `RunEnvironment` 定义，类型见 `runner/types.ts`。

环境记录四样：`dshVersion` 是产出这条记录的 DSH 版本；`pstackVersion` 是当时 `native/upstream.lock.json` 钉定的上游版本；`upstreamRevision` 是对应提交；`matrix` 是环境定义，它同时驱动 `prepare` 选插件和 `home` 开关 Team，所以是运行配置而不只是标签。

`dshVersion` 与 `pstackVersion` 是读快照的人判断「这是哪个运行时、哪个上游版本产出的」的依据。它们不参与任何跨版本比较，也不构成发布门禁。playground 证明缺口，不证明版本。

## 证据布局

- 提交快照在 `playground/evidence/runs/<variant>-<environment>/`。
- 每个场景的 `record.json` 和截图位于快照的 `scenarios/` 下；具体目录构造见 `runner/evidence/review-snapshot.ts`。
- `manifest.json` 记录当前快照的范围和批次；不要手工维护它的场景列表。
- session、`record.source.json` 和 `record.safe.json` 只留在本地，不进入快照；脱敏与提交流程见 [run.md](./run.md#证据脱敏)。

## 不变量

- native 和 adapted 使用同一 scenario 定义和同一 environment；场景声明只跑一个 variant 时，只要求该 variant 的记录。
- 生成物必须能由记录重建；快照范围由 manifest 和实际目录共同决定。
- 合并视图只读，不把一侧结论写进另一侧的分析结果。

## 完成标准

- `manifest.json` 的 `scenarioIds` 与快照实际场景一致。
- 同一场景的 native/adapted record 使用相同 scenario 定义和 environment；只声明单 variant 的场景只要求该 variant 的记录。
- 快照里的环境字段能说明该记录由哪个 DSH 版本、哪个上游版本产出。
