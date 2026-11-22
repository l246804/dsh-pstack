# 术语表

本表固定代码、界面和文档中的核心概念。新增容易混淆的概念时补充定义，不复用已有术语表达另一种状态。

## Role（角色）

pstack 工作流中的委派职责，由 `src/roles/role-manifest.ts` 的精确 key 标识。调用方读取角色文件把 Role 映射到子代理要用的模型路由，工具本身不做角色解析；Role 不是 Agent preset，也不直接规定子代理的人格或工具集合。

## Route（路由）

一次子代理调用的模型选择，表示为以下两类之一：

- `route`：结构化对象 `{ "kind": "route", "provider", "model", "effort"? }`，`provider` 和 `model` 都可含 `/`，`effort` 取该模型公布的档位；委派时把 `provider`、`model`、`effort` 分别传给 `pstack_subagent`，不要拼成 `provider/model` 字符串。
- `inherit`：不向子代理传递模型覆盖，沿用父级路由；文件中的别名为 `inherit-parent` 或 `auto`。

角色文件中的 `routes: []` 是保存协议中的**删除该角色行**操作，不是一个继承路由。删除后角色处于未配置状态，委派时同样继承父级。

## Role shape

Role 的路由基数由 `shape` 描述：

- `shape = single`：最多配置一条路由。
- `shape = list`：配置多条路由；由调用方挑一条传给子代理。

## Budget（推理预算）

`budget` 是角色文件中的全局推理目标，存为 JSON 的 `budget` 字段，值形如 `<tier> (<target>)`，如 `large (xhigh)`。三档为 `large`、`medium`、`small`，分别以 `xhigh`、`high`、`medium` 为目标 effort，没有档位高于 `xhigh`；旧文件里的 `unlimited` 读取时迁移为 `large`。它是一次批量应用操作的记录，不直接参与委派；真正生效的是每个角色的具体模型和路由 effort。应用预算时按模型实际公布的 efforts 做精确匹配、向下回退或标记需要手动选择；自定义 efforts 或没有 effort 的模型保持原值并提示。

## Agent preset（Agent 预设）

DSH 对一类 Agent 的插件组合，包含人格、工具、沙箱及其他会话能力。DSH 的根 preset 面向用户会话；本插件只随包提供子代理 preset（`poteto-agent`、`comment-sicko`、`readonly`），用户会话的 Poteto 工作流改由会话级开关启用。`pstack_subagent` 的 `agent_preset` 选择 preset 类别；模型路由由调用方读取角色文件后通过 `provider`/`model`/`reasoning_effort` 传入，两者是正交配置。

## Session sidecar（会话 sidecar）

插件拥有的按 Session 维度持久化、但不进入 Session 事件日志的 Host 状态。本插件的 Poteto 开关用 `ctx.storageDomain` 的 `pstack` domain 保存；它不参与模型历史重放，也不改变 Session 日志的读取契约。

## Generated tree（生成树）

由 `scripts/generate-pstack.mjs --target port` 从固定上游和 `port/dsh.md` 整体生成的根 `pstack/` 目录，构建时复制到 `dist/pstack/`。

手工变更应落在生成来源、插件源码、测试或技能工作区。发布兼容范围由 `package.json` 的 `engines.dsh` 提供，pstack 版本记在 `port/baseline.json`；场景注册表与当前审核快照分别位于 `playground/scenarios/` 和 `playground/reviews/`，都不属于本仓工程决策记录目录。

## Playground（验证场）

`playground/` 的真实 DSH Web 会话验证环境。它运行 raw/adapted 能力 probe，收集 RunRecord、SessionAnalysis 和评审快照，为 port 和 src 提供缺口与结论。

## Raw 与 Adapted

`raw` 是原生 DSH 基线阶段，只能观察 DSH 原生能力；`adapted` 是适配实现验证阶段，只使用当前适配实现和 `port/dsh.md`。两个阶段证据和结论隔离，不能互相替代。

## Capability probe（能力探针）

围绕一个能力行为编写的可观察场景。它用自然语言任务、workspace fixture、机械断言、语义 rubric 和 UI 观察点验证能力是否被触发，而不是验证某个实现细节。

## Capability environment（能力对照环境）

在 `environments.ts` 中登记的可选环境，用于比较某个可选依赖是否改变行为。它只作为对照，不代表原生 DSH 能力，也不进入 base 通过条件。

## Baseline（发布基线）

`port/baseline.json` 中的发布基线，记录当前移植的 pstack 版本。它不是 playground 的测试基线，也不是 README 兼容表的数据源；DSH 兼容范围以 `package.json` 的 `engines.dsh` 为准，兼容表由 `scripts/release-compatibility.ts` 直接维护。

## Repair queue（修复队列）

`$DSH_HOME/pstack-repair.json` 保存等待下次启动处理的 Session id。用户在维护页确认后追加写入；DSH 启动时读取、逐个修复并删除该文件。它是一次性迁移队列，不是 Session 日志，也不是 storageDomain sidecar。
