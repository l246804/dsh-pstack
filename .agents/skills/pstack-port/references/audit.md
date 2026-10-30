# audit：冻结需求并开始 port 轮次

产物是简体中文的 `pstack/README.md`、重置后的 `docs/port-review.md` 和已完成需求冻结的 port 轮次。`upstream` 与 `prepare` 不算 port 开始。初次移植或结构未建立时先执行 `prepare`。

## 1. 核对入口与本轮输入

无 blocker 时，只在 `port.state: idle` 开始基线轮次。core blocker 必须显式允许 `audit`；沿用其 `active_item` 作为 `port.round`，并把对应 Issue 或 EXT 的 `required_behavior` 纳入本轮需求。其他 blocker 一律拒绝。

核对 `docs/port-prepare.md` 的上游提交、生成链和适配树映射。初次从零移植没有结构报告时，下一步是 `/pstack-port prepare`；已有结构报告但提交或映射不符时也交回 `prepare`。core blocker 下不得借结构整理绕过 port 链，直接在报告中列出结构问题并保留给当前轮次处理。

完成标准：入口路由合法；本轮是 `baseline`、一个 core `#编号` 或一个 core `EXT-*`；每个 core 输入都有明确验收行为；下一步命令完整。

## 2. 清点需求并取得证据

1. 枚举并读取 `<pstack>` 全部 Markdown、模板、配置与从调用点追踪到的脚本。登记来源、入口、运行时、输入输出、退出码和关键行为；每份文档都有原子能力或「无可移植能力」标记。技能或工作流声明的脚本还要有测试与调用方；缺失、行为不完整或过时的脚本写入能力表（S-25）。
2. 完整读取 `<pstack>/docs/harness/claude-code.md`，登记覆盖域、表格粒度与平台排除基线。
3. 按 [`port-baseline.md`](port-baseline.md) 调查 `<dsh>` 的标准模式、可选插件、实验性状态、启用条件与互斥关系。每项第 2、3 层结论绑定可打开的源码证据。
4. 读取 `docs/architecture.md`、适用 accepted 决策和 `docs/extensions.md`。登记并保留 `proposed`、`active`、`broken` 与 `retired` EXT，不把 EXT 混入上游能力。
5. 逐条映射 core Issue 或 EXT 的 `required_behavior`。每项至少对应一个能力行；core Issue 确无 port 影响时，保存可复核的无影响证据，不虚构能力行。

完成标准：全部上游文档、脚本与 core 输入都有去向；每项能力恰有排除结论或一个主层；缺口含支持范围、缺失行为、场景、建议和证据；每个脚本缺口都有入口、调用方与验收要求。

## 3. 重建审查基线

写文档前，在 `<pstack>` 检出中直接读取 `skills/technical-writing/SKILL.md` 与 `skills/unslop/SKILL.md`，按 reference mode、简体中文、单一术语和先结论后证据重写 README。不依赖 skill catalog。

`pstack/README.md` 依次给出审查基线、完整能力表、标准模式与可选插件、平台排除、插件内实现范围、既定适配、必要的实现选择、分阶段状态和证据索引。每个能力 ID 的状态只在分阶段状态表定义一次；主表只保留决策所需信息。可选插件条目使用稳定 `OPT-*` 编号，并写包名、默认状态、实验性、启用条件、能力、边界与冲突。

同步重建 `docs/harness-doc.yaml`，只保存 README 运行期替代与平台排除到 `dsh.md` 小节的映射，不复制正文。`builtins` 覆盖 README 认定有替代方案的上游名字；`rows` 逐项登记目标小节、替代或跳过类型及能力 ID（R-12）。

开始轮次时设 `port.state: active`、`phase: audit`，设置本轮 `round` 与时间，重置 `docs/port-review.md` 为本轮标题、上游提交、`round`、`started_at` 和空 findings 列表。旧 findings 不继承，blocker 保持原样。完成需求冻结且准备交付实现时，把 `phase` 设为 `implement`，使 S-02 的前置成立。

若 core Issue 确无 port 影响：在 Issue 工作文件写 `port_round: no-impact` 与证据，保持 `port.state: idle`、`phase: done`，不启动实现；把 blocker 的 `allowed_routes` 收敛为 `[issue #编号]`。EXT 的 core 修复必须实际恢复验收行为，不能使用 Issue 的 no-impact 出口。

完成标准（S-01、S-05、S-18、S-25、R-08）：README 能力表完整且为中文；core 需求逐行有映射或 no-impact 证据；对账清单与 README 一致；`port-review.md` 已重置；正常轮次为 `active/implement`，no-impact Issue 为 `idle/done`；round 与 blocker 一致；未开始实现。

## 4. 复核并报告

重新打开关键证据，核对路径、行号、计数、README 相对链接和全部 core 输入。运行与本轮审查相关的只读门禁并记录退出码。

报告上游提交、能力计数、分类、既定适配、可选插件、实现项与未决证据。正常轮次的下一步是 `/pstack-port implement port`；no-impact Issue 的下一步是 `/pstack-port issue #编号`。不得自动进入下一分支。

完成标准（R-09）：报告包含与当前结果匹配、参数完整的一条 `/pstack-port ...` 下一步命令。
