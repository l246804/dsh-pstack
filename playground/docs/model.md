# 运行矩阵

本文件说明 playground 的运行维度、运行身份和证据布局。场景规则见 [scenario-rules.md](./scenario-rules.md)，执行流程见 [workflow.md](./workflow.md)。

## 运行维度

- `variant`：`native` 使用 DSH 标准运行时，不加载被测插件；`adapted` 加载当前插件和适配配置。
- `environment`：环境列表与能力由 `runner/scenario/environments.ts` 维护；`base` 是默认对照。
- 同一场景在成对运行时保持相同的 prompt、workspace 和断言；variant 专属判断属于分析规则，不写进场景。场景可以声明只跑某一个 variant，缺失的 variant 不是可比较记录。
- 场景和环境的默认值见 `runner/scenario/defaults.ts`；解析和适用性判断见 `runner/scenario/registry.ts`。

## 运行身份

一次记录的身份轴由 `RunRecord` 和 `RunEnvironment` 定义，类型见 `runner/types.ts`。记录会保存实际 DSH 版本、pstack 版本、environment、scenario hash、config hash 和实际模型路由；这些字段是对比和复现的依据。

`upstreamRevision`、`pstackVersion` 和 `adaptedVersion` 是来源信息，不能替代实际运行记录。`adaptedVersion` 只记录采集时的插件版本，不参与比较或发布门禁。对比逻辑见 `scripts/compare.ts`。

## 证据布局

- 提交快照在 `playground/evidence/runs/<variant>-<environment>/`。
- 每个场景的 `record.json` 和截图位于快照的 `scenarios/` 下；具体目录构造见 `runner/evidence/review-snapshot.ts`。
- `manifest.json` 记录当前快照的范围和批次；不要手工维护它的场景列表。
- session、`record.source.json` 和 `record.safe.json` 只留在本地，不进入快照；脱敏规则见 [evidence-redaction.md](./evidence-redaction.md)。

## 不变量

- native 和 adapted 使用同一 scenario 定义和同一 environment；场景声明只跑一个 variant 时，只比较该 variant 的记录。
- 只有可比较的运行身份才能对比；缺失的 scenario hash 或 config hash 不是“未知但可以比较”。
- 生成物必须能由记录重建；快照范围由 manifest 和实际目录共同决定。
- 合并视图只读，不把一侧结论写进另一侧的分析结果。

## 完成标准

- `manifest.json` 的 `scenarioIds` 与快照实际场景一致。
- 同一场景的 native/adapted record 使用相同 scenario 定义和 environment；只声明单 variant 的场景只要求该 variant 的记录。
- `playground:compare` 和 `playground:status-table` 的检查通过；compare 会校验每条记录的 `scenarioHash`，旧记录与当前场景不一致时按失败处理。
