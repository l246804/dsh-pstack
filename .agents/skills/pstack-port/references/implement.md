# implement：实现一个工作项

交付当前 `port`、`EXT-*` 或 `#编号` 的实现与行为验证。先冻结需求和 DSH 公共接口，再读取现有实现。一次只处理一个工作项。

## 1. 选择工作项并检查前置

无参数时，请用户选择 `port`、`EXT-*` 或 `#编号`。可以列出 `docs/issues/*` 与 `docs/extensions.md` 的本地待办，但不访问 GitHub 自动发现。

| 路由 | 可执行前置 | 工作文件 |
|---|---|---|
| `implement port` | `port.state: active`、`phase: implement`；core blocker 可暂停后恢复，但必须允许本路由 | `pstack/README.md`、`docs/port-review.md` |
| `implement EXT-*` | blocker `mode: issue` 且对应当前 EXT；或无 blocker、`port.state: idle` 且用户显式选择本地 EXT | `docs/extensions.md`、`docs/extensions/<EXT-ID>/review.md` |
| `implement #编号` | 已分诊为 `extension` 或 `bug`，Issue `stage: implement`，issue blocker 对应当前编号 | `docs/issues/<编号>/review.md` 及其 EXT/FIX 映射 |

`core` 不使用 `implement #编号`；下一步是 `/pstack-port audit` 或当前 port 阶段命令。`external` 不进入实现。工作文件缺失、阶段不符或映射缺失时停止，报告对应 review、audit 或 issue 命令。

port 在 `phase: review` 且存在开放 finding 时，下一步是 `/pstack-port review port` 完成复核；审查确认可修复后由 review 切回 implement。EXT 工作文件的 `status` 只能是 `implement` 或 `broken` 才开始实现；`review` 等待复核，`passed` 等待验收或恢复。

完成标准：只选一个工作项；前置状态、需求、验收行为与产物边界明确；其他工作项的状态和文件不变；报告含当前可执行的完整 `/pstack-port ...` 命令。

## 2. 冻结接口与实现范围

读取适用的 `AGENTS.md`、`docs/architecture.md`、accepted 决策和当前需求。涉及决策记录时先读 `docs/decisions/AGENTS.md`，再按当前变更路径核对 `Scope` 相交的记录。沿 `<dsh>` 的正式导出、类型、插件包与测试确认公共接口、依赖、权限执行面和插件组合。优先复用 SDK、声明式 bundle 和公共插件接口；确需手写时使用架构规定的位置。

读取现有实现，逐项标为保留、修改、新增或删除。每项对应一个能力、EXT 或 finding。生产依赖与类型声明按仓库约定进入 `dependencies`；生成树与发布树只由构建更新。

按工作项限制范围：

- **port**：实现 README 的插件内范围与 `status: active` FIX；开放 port finding 也只在此修复。忽略无效 FIX 记录，不汇报被忽略项。EXT 风险不改变 port 需求，不修改 `docs/extensions.md`。生成或修改脚本时，按能力表补齐入口、输入输出、行为测试、调用方和验收命令；脚本与测试写入架构规定的手写源（S-25）。
- **本地 EXT 或 Issue 映射的 EXT**：只改该扩展代码、必要测试和 EXT 工作记录，不改 `pstack/runtime/`、`pstack/harness/` 或 port 能力行为。
- **Issue 映射的 FIX**：按 Issue 工作文件实现，填写 `files`、`test`，将对应 FIX 从 `open` 改为 `active`，不改 port 行为。

完成标准：每个实现项都有公共接口依据、具体文件动作和可观察验收；当前范围不含其他工作项；脚本都有明确调用方和验收命令。

## 3. 处理 EXT 修复落点

实现前和修复 finding 时先判断 `repair_target`，按实际修复动作落点分类：

| repair_target | 判定 | 处置 |
|---|---|---|
| `extension` | 只改 `src/` 或 EXT 扩展代码 | 走当前 EXT 的 implement/review；port 中发现时先暂停 |
| `port` | 必须改 `pstack/runtime/`、`pstack/harness/` 或 port 能力行为 | 并入当前 port 需求或 finding，不建普通 Issue、不写 issue blocker |
| `external` | 只能改上游 pstack 或 DSH | 记录复现、版本、外部责任层和证据，停止并询问用户一次 |

在 `implement port` 中发现修法会破坏 EXT 时（S-11）：

- `extension`：在 EXT 工作文件写 `status: broken`、`repair_target: extension`、`required_behavior`；登记表标 `broken`。写 `mode: issue` blocker，`active_item` 为该 EXT，`resume_route: implement port`，`allowed_routes: [implement EXT-ID, review EXT-ID]`，停止。下一步 `/pstack-port implement EXT-ID`；实现后 `/pstack-port review EXT-ID`。关联 Issue 只在其实现审查通过后增加 `issue #n`。
- `port`：在 `docs/port-review.md` 增加或更新 finding，登记 `affected_ext` 与验收行为，把 EXT 修复并入当前 port 清单；EXT 登记表标 `broken`，继续 `/pstack-port implement port`。
- `external`：保留证据和当前 port 状态，停止并询问用户，不交付未登记破坏。

独立 EXT 或 `implement #编号` 发现必须改 port 时，停止当前修改，登记 `repair_target: port` 与 `required_behavior`，转 core 流程：`mode: core`、`active_item` 为 EXT 或 Issue、`resume_route: idle`、`allowed_routes: [audit, implement port, review port, doc]`。关联 Issue 的验收路由等 `doc` 后再加。Issue 转流时把工作文件改为 `target: core`、`port_round: pending`、`stage: implement`，保留原 EXT/FIX 映射作为证据；对应 EXT 登记表标 `broken`，工作文件同步 `repair_target: port` 与验收行为。下一步 `/pstack-port audit`。

完成标准（S-11、S-18）：每个破坏都有 `repair_target`、验收行为及对应 blocker 或 port finding；extension 先实现再审查；port 修复留在当前轮次；没有用 EXT/FIX 实现夹带 port 改动。

## 4. 实现并验证

实现当前范围的公共行为、输入校验、生命周期、错误传播与清理。为每项需求建立可执行测试，覆盖验收行为与相关失败路径。所有模型触发副作用进入 DSH 权限执行面。

共享 port 改动运行受影响回归。除第 3 节已登记的破坏外，此阶段不修复或改登记 EXT。EXT/FIX 改动用 `git diff --name-only` 核对没有 port 基线路径，并运行对应 EXT 验收或 FIX 测试。

至少运行相关测试、`vp check`、`vp test` 和 `node pstack/scripts/generate-pstack-harness-tree.mjs --check`。测试与真实运行验证遵循项目决策约定的环境；记录实际退出码、适用决策和验证环境。本次失败未解决时不得报告完成。

完成标准（S-25、S-30）：每个实现项都有代码和测试；每个脚本入口可执行且有调用方与验收命令；公共接口与权限边界有证据；测试前已读取项目约定，验证环境符合 accepted 决策；相关门禁退出 0；范围外文件未改变。

## 5. 更新记录并报告

- **port**：更新 README 对应能力的实现字段和 `docs/port-review.md` 的修复、验证证据。已修 finding 标 `fixed-pending-review`，未通过保持或改回 `open`。实现待复核时设 `phase: review`。
- **EXT**：工作文件写实现、验证与 `status: review`；`docs/extensions.md` 只更新该条目的实现记录，独立本地 EXT 不借实现阶段改成 `active`。
- **Issue**：Issue 工作文件保留 `status: open`，写 `stage: review`；EXT/FIX 工作记录进入审查。blocker 不变，下一步是同一编号的 review。

建立「需求/finding → 接口 → 实现 → 测试 → 未解决限制」追踪。报告实际变更、验证和范围检查，并以完整命令给出唯一下一步：`/pstack-port review port`、`/pstack-port review EXT-001` 或 `/pstack-port review #123`。尚未完成时报告 `/pstack-port implement <当前工作项>`；core 转流报告 `/pstack-port audit`。

完成标准（S-02～S-04、S-11、R-09）：普通 port 实现后 `phase: review` 且 EXT 登记无差异，S-11 已登记的破坏除外；EXT/FIX 实现后处于 review 且无 port diff；验证结果与状态一致；报告含完整下一步命令。
