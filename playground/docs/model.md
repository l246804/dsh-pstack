# Playground 运行矩阵模型

一个能力一份 probe 定义。treatment 和 environment 是运行维度，DSH 与 pstack 版本是运行身份和失效轴。所有状态与分析视图都从记录生成。阶段隔离由作者身份保证，不靠目录。

## 1. 身份

- `treatment`：`native` | `adapted`。
  - `native`：不加载被测插件，只运行 DSH 标准运行时。它是实现中立的基线：从不加载被测插件，因此在 DSH 升级后重跑能发现 DSH 已经原生提供的能力，也不会与当前实现耦合。
  - `adapted`：加载被测插件及其适配配置，验证适配是否成立。
- `environment`：id 来自 `environments.ts`；可选插件和 team 模式属于 environment 定义，不属于目录名。
  - `base` 不加载额外插件，是默认对照。
  - 可选环境按需启用，仅用于对照；同一 probe 必须保留 base 结果，才能区分环境效应与适配效应。
- RunRecord 携带 `treatment`、`environment.matrix.id`、`environment.dshVersion` 和 `environment.pstackVersion`。
- `pstackVersion`：`native/upstream.lock.json` 钉定的已发布 pstack 版本，按运行记录。`upstreamRevision` 只用于复现，永不作为身份键。

## 2. 证据布局

- `playground/evidence/runs/<treatment>-<environment>/scenarios/<scenarioId>/<treatment>-<environment>/record.json` 与 `screenshot.png`。
- `playground/evidence/runs/<treatment>-<environment>/manifest.json` 记录 treatment、environment、`dshVersion`、`pstackVersion`、`scenarioIds`。

## 3. 生成与手写

- 生成物（必须支持 `--check`，防止漂移）：按单元的状态表、跨单元透视、对比报告和 gap lock。
- 手写物：probe 定义、按能力打标签的 `playground/evidence/findings/<treatment>.md` 根因问答、适配答案审阅。

## 4. 命令

运行命令、批次与参数见 [workflow.md](./workflow.md)，本文件不重复。

## 5. 不变量

- 阶段隔离：native 分析只读 native 单元，adapted 分析只读 adapted 单元；生成视图中的合并是只读的。每个单元携带其产出 treatment 作为来源。
- 可比性：相同的 `dshVersion`、相同场景内容 hash、相同 environment、相同模型路由。`pstackVersion` 是 adapted 的来源信息，不是 native 行为的硬性相等条件。
- 场景 treatment 中立：同一场景定义在 native 与 adapted 都运行；treatment 专属判定属于分析规则，不进入场景。
- 生成物都带 `--check` 守卫。
