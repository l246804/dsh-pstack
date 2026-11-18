# raw 能力用例提取规则

本文件定义 `playground/scenarios/` 中的能力用例如何从上游和 raw 资料提取、如何写成 probe，以及 inventory 与排除项如何维护。目标是让新会话可以按这些规则生成完整的能力用例集合，而不是只补当前看到的几个点。

## 目录与文件

```text
playground/scenarios/
├── <capability>.ts                  # 每个能力一份 probe（扁平，无目录分组）
├── capability-inventory.json        # 手工维护的能力清单
├── capability-exclusions.json       # 用户批准的排除决定
├── capability-exclusions.proposed.json
├── environments.ts                  # 环境矩阵
├── index.ts
└── registry.ts                      # 收集所有扁平 probe，不推导环境
```

- 一个文件只放一个独立 probe，默认导出 `BehaviorScenario`。
- 目录是扁平的：`registry.ts` 收集 `playground/scenarios/*.ts` 下的每个 probe，不再从目录名推导环境，也不再有 re-export stub。
- probe 用 `treatments`（`native` | `adapted`，默认两者都允许）和 `environments`（环境 id 数组，默认 `["base"]`）声明自己在哪些运行单元成立。
- 能力通过场景的 `capability` 字段表达。

```ts
import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = { ... };
export default scenario;
```

## 能力来源

能力需求只来自：

- `upstream/cursor-plugins/pstack` 源树中的技能、playbook、命令和 agent 文档。
- `playground/raw/dsh.md` 的映射行。

以下内容不是能力来源：

- `playground/raw/pstack/` 和根 `pstack/` 生成物。
- DSH 运行时和 profile。
- `playground/raw/dsh-evidence.md`。
- 当前插件实现。

如果上游树缺失或结构不符合预期，直接失败，不使用生成树或其他目录兜底。

## 能力分类

必须按下面的类别扫描上游和 raw 资料，不要只读取 `dsh.md` 的表格行，也不要因为当前实现没有某个能力就跳过该类。每个类别都可能产生多个 capability probe。

### 1. tool

工具调用、交互方式和用户可见操作：

- 任务委派工具及其输入输出
- 提问、确认、跳过和取消
- todo、搜索、文件读取、文件修改
- 工具不存在、超时、参数缺失时的降级

### 2. delegation

子代理和委托行为：

- 单代理和并行代理
- role、model、reasoning effort、cwd 的传递
- 只读、可写、继承父级
- 后台执行、恢复、停止和多阶段协作

### 3. routing

模型和角色路由：

- 可用模型发现
- provider、model、effort 的显式路由
- 未知模型、非 Claude slug、继承路由
- 角色文件和默认路由
- 模型不可用时的降级

### 4. environment

可选运行时能力的前提和降级：

- worktree 能力
- session history/search 能力
- browser、screenshot、desktop 能力
- terminal 或持久 shell 能力
- 外部 forge、PR 或 CI 能力

对每个前提都要写清：启用时能做什么；未启用时是跳过、报环境限制，还是使用替代工具。

### 5. output-render

输出形态是一类独立能力，不是场景写法里的一句通用检查。以下输出都必须提取对应能力并建立 probe：

- 截图或实际页面
- 生成的图片
- 图表、Mermaid 图或画布
- 实际 UI 呈现
- 视频或音频播放

没有对应 `render-*` capability 和 probe 就是覆盖缺口。非文本产物的 probe 必须要求观察真实呈现，不能用源码、路径、文件卡片或 assistant 文本代替。

### 6. skill-dependency

上游技能依赖其他技能时，依赖关系本身是一类能力：

- Cursor 内置技能，例如 `create-skill`、`/loop`、`/visualize`
- `cursor-team-kit` 或其他外部技能，例如 `deslop`、`control-ui`、`control-cli`
- pstack 本地技能，例如 `unslop`、`technical-writing`、`no-comments`
- 技能被直接调用、作为步骤交接、或者要求某个技能必须存在

处理方式：

- 为每个被依赖的技能建立 `skill-dependency.<name>` capability，并在 `sources` 中记录引用它的上游文档。
- raw probe 要观察该技能不存在、不可加载或只能降级时会发生什么。
- adapted probe 要观察本地替代、vendored skill 或 pstack 提供的能力是否成立。
- 不能因为该技能不是 pstack 当前自带，就把它排除出能力提取。
- 技能依赖与 skill-loading 不同：skill-loading 验证“能否按名加载技能”，skill-dependency 验证“某个技能需要另一个技能时，整个任务是否仍然完整”。

## 提取流程

1. 扫描上游 pstack 的技能、playbook、命令和 agent 文档，按上面的六个类别逐类记录候选。
2. 对照 `playground/raw/dsh.md` 的映射行，确认该行为在 raw DSH 中应如何观察。
3. 将同一行为归并为稳定的 capability id；一个 capability 只对应一个 base probe。
4. 为每个 capability 设计自然语言 prompt、workspace fixture、机械 assertions、语义 rubric 和 UI 观察点。
5. 在 `capability-inventory.json` 中记录能力、来源、`probes`、状态和用户批准过的排除原因。
6. 新增或删除 probe 后同步 inventory，确保 `probes.base` 指向实际场景。

## 完整生成检查

- 六个类别都扫描过，不因当前没有 probe 就漏掉整类。
- 上游文档中的工具、模型、环境、输出和技能依赖都有对应 capability，或者有明确记录的原因。
- 所有 base probe 默认允许 native 和 adapted；需要限定 treatment 时显式写 `treatments`，不要在 base probe 上静默限制。
- 每个 capability 有 `probes.base`；需要环境对照时在该能力的 probe 上追加 `environments` 键。
- 每个 `render-*` 和 `skill-dependency.*` 都有 probe，不能只写文档说明。
- 新增 probe 后重新运行 `vp check --fix` 和 `vp test`。

## 阶段边界

| 阶段 | 允许输入 | 禁止输入 | 观察目标 |
| --- | --- | --- | --- |
| native | `reviews/native-*`、`playground/raw/dsh.md`、上游 pstack 源树、场景 fixture、当前 native session、已登记的 capability 对照环境 | `port/dsh.md`、`src/**`、已发布端口实现、`reviews/adapted-*`、adapted 证据 | 原生 DSH 能力；capability 环境只做对照 |
| adapted | `reviews/adapted-*`、`port/dsh.md`、`src/**`、当前适配实现和环境文件、当前 adapted session | `reviews/native-*`、native 分析结论、native 证据 | 适配实现 |

- 场景声明 `treatments` 时，只能在这些 treatment 运行；不声明表示 native/adapted 都允许。
- 场景声明 `environments` 时，只能在这些环境运行；不声明表示只在 `base` 运行。
- `native/base` 是 native baseline；`native/<capability-environment>` 只用于证明可选依赖是否改变结果，不能替代 base 对照。
- 发现需要读取跨阶段文件时，停止该 probe 或分析，重新选择来源。
- native 不预置适配工具或环境文件；adapted 不反推 native 结论。

## 环境

- `base` 是默认环境，不加载额外插件。
- 其他环境必须在 `environments.ts` 中登记 `description`、`kind` 和 `enabledPluginPackages`。
- 具体第三方包名只写在 `environments.ts`，文档只写环境 id、用途和对照方式。
- 同题能力对照环境（如 `render`）由单份 probe 声明 `environments: ["base", "render"]` 覆盖，不再从 base 场景 import 后覆盖环境身份。
- 非同题对照的特殊目的场景使用独立用例，不能复用 base prompt。
- 环境文档不提前假设某个环境一定是冲突环境；用途由 `environments.ts` 的 `description` 和 `kind` 表达。

## 任务完成标准

- 判定的是能力是否被触发、是否产生可观察行为，不是模型性能或质量上限。
- 不把绝对数值或质量阈值当作通过条件，例如必须优化到 50ms、必须达到固定字数、必须达到固定测试分数。性能类任务改为记录基线、实际测量、是否改善、是否说明限制；没有达到某个数值不等于能力缺失。
- 质量类任务只检查最低可观察结构或内容要点，不按高质量写作、复杂设计或完整推演打分。
- 复杂任务拆成小分支；必要时减少并行数量或阶段数量，避免低能力模型因任务过大而误判为能力缺失。
- 模型能力不足、输出不稳定或无法完成复杂推演时，记 `inconclusive` 或 `待你判断`，不要自动记成 DSH 能力 `gap`。
- 能力或工具确实不存在、环境受限、依赖未启用时，才按 `gap` 或 `ignore-environment` 记录。
- 跨模型或交叉验证只要求实际出现两条明确路由和可观察结果；不要求模型都达到高性能。

## probe 写法

- prompt 保持自然任务目标和必要上下文，不为了降低难度改写成逐步指令，也不要明确指定工具或实现路径，否则会测不到需要观察的工具调用能力。
- prompt 用自然语言描述用户目标和约束，不写工具名、实现名或预期答案。
- `rubric` 描述用户可观察的最低合格边界，允许合理的替代实现和降级路径。
- `assertions` 只做机械事实；语义效果由 rubric、实际 tool call、截图和产物共同判断。
- 非文本产物必须检查实际呈现；源码、路径、文件卡片和 assistant 文本不能替代渲染或播放结果。
- 一个 probe 只覆盖一个能力分支；分支按行为、环境或降级路径拆分。

## inventory 与排除

- `capability-inventory.json` 是 agent 手工维护的派生清单；不写自动解析上游文档的脚本。
- `probes` 按环境记录场景 id：普通能力为 `probes.base`，对照环境追加对应环境键。
- `status` 只能是 `discovered`、`covered` 或 `excluded`。
- `covered` 必须有 `probes.base` 或对应环境 probe；`excluded` 必须写 `exclusionReason`。
- agent 可以把候选排除理由写入 `capability-exclusions.proposed.json`；该文件不产生 `excluded` 状态。
- 只有用户明确批准时，才把决定写入 `capability-exclusions.json`，格式为：

```json
{
  "capability-id": {
    "reason": "为什么排除",
    "decidedBy": "user"
  }
}
```

- `excluded` 必须有用户批准的决定和原因，不能自动排除，也不能静默删除。
- 上游变化或 probe 增删后，由 agent 手工同步 inventory 并检查与当前来源一致。

## 验证

新增或修改场景、inventory 或排除项后运行：

```sh
vp check --fix
vp test
```
