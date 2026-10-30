---
name: pstack-upstream-feedback
description: 从 dsh-pstack 的移植实践找出值得 DSH 官方优化的能力点，整理成一篇移植反馈讨论并提交。
disable-model-invocation: true
---

# 提交上游 DSH 移植反馈

在把 pstack 移植到 DSH 的过程中，记录遇到的能力限制，整理成 `deepseek-ai/deepseek-harness` 的 Ideas 讨论。默认写一篇；`docs/upstream-discussions.md` 已有移植反馈讨论时，默认在该讨论下追加评论，用户明确要求新开或原讨论已关闭时才新建。公开创建或追加前由用户确认；`draft` 只生成草稿，不调用 GitHub 写接口。

本技能只创建或追加 Ideas 讨论；不改代码，不改 port 基线。一次调用只处理一篇讨论，完成报告后停止。参数：默认自动选择新建或追加，`draft` 只生成草稿，`new` 强制新建。

## 通道约束

`deepseek-ai/deepseek-harness` 目前只通过 GitHub Discussions 接收改进建议。`gh discussion create` 和 `gh discussion comment` 是本技能仅有的 GitHub 写命令；不要调用 `gh issue create`，也不要在 Discussion 创建或追加失败时改用 Issue。失败时报告错误并保留草稿。

## 1. 读实现

读：

- 根 `README.md` 的 `## Capabilities` 与 `## Optional DSH plugins`，确认原生工具和稳定或实验状态。
- `src/*.ts`、`src/internal/*.ts`、`cordis.patch.yml`。
- `tests/*.test.ts`。
- `pstack/README.md` 的 3.4、5 节，只作为缺口背景。
- `docs/upstream-discussions.md`，查已有的上游讨论。

继续条件：

- `port.phase` 是 `done`。
- `src/` 与根 `README.md` 存在。

完成标准：列出移植涉及的原生工具、agent preset、配置页、随包脚本，以及每项对应的官方服务。

## 2. 找移植中发现的能力限制

逐项阅读实现，回答：

- 移植时需要在官方工具之外补什么能力？
- 官方工具或插件的当前状态是什么：稳定、稳定可选、实验性？
- 这个限制是多个插件或技能包都会遇到的，还是 pstack 专属规则？
- 如果官方提供标准能力，移植层能少写哪一块通用逻辑？

分成三类：

- **稳定工具限制**：稳定工具缺少某个标准能力。
- **实验性插件缺口**：实验插件提供部分能力，但默认关闭或功能不完整。
- **不进入建议**：pstack 专属角色、preset、工作流规则、外部工具前提。

判据，四项同时满足：

1. **可复用**：多个插件或技能包会遇到同一限制。
2. **标准**：应在稳定工具里提供，不放在默认关闭的实验性插件里。
3. **收益**：能让移植层少写一块通用适配，或让实验插件达到可用。
4. **可观察**：能写清标准工具的参数或行为。

输出表格：

| 类别 | 移植中遇到的限制 | 官方状态 | 相关实现 | 建议 | 判定 |
|---|---|---|---|---|---|
| 稳定工具 | 隐藏技能无法通过 `skill` 工具加载 | 稳定工具 | `src/skill.ts` | 标准 `skill` 工具支持按名称加载隐藏技能 | 写入 |
| 稳定工具 | 子代理派发无法标准地动态设置 provider/model/effort，模型发现依赖默认关闭的实验性插件 | 稳定工具 | `src/subagent.ts`、`src/models.ts` | 标准路由参数与模型发现 | 写入 |
| 实验插件 | Agent Teams 开启后角色派发能力不完整 | 实验性插件 | `cordis.patch.yml`、根 README 警告 | 补齐子代理与角色派发 | 写入 |

判定只用 `写入`、`备选`、`跳过`；`跳过` 写一句理由。没有条目时报告原因并停止。默认选 6 到 10 条写入同一篇讨论，用户可增删。

完成标准：每个限制都有判定；每条有官方状态、相关实现和一句话建议。

## 3. 选提交位置并查重

读 `docs/upstream-discussions.md`，找主题为移植反馈的已有讨论；有多行时取最近更新的一行：

- 没有记录：本轮新建 Discussion。
- 有记录且未关闭：默认在该讨论下追加评论。用户传入 `new` 时改为新建。
- 有记录但已关闭或锁定：新建 Discussion，并在报告说明原因。

追加模式先读原讨论：

```bash
gh discussion view <编号> --comments --json number,title,body,comments,url,closed,locked
```

把本轮 `写入` 项和原讨论正文、评论逐条对照，已有内容不再重复。新建模式对每个 `写入` 项运行：

```bash
gh discussion list -R deepseek-ai/deepseek-harness \
  --search "<能力关键词>" -L 10 --json number,title,category,url
```

已有讨论覆盖该项时，把它从本轮内容里去掉，报告记为 `已有 #<编号>`。只覆盖部分内容时，可以在新内容里链接它。

完成标准：已确定 `新建` 或 `追加 #<编号>`；每个 `写入` 项都有查重结论；重复项已移除。

## 4. 起草一篇讨论

默认写一篇，不拆分。新建模式写完整讨论；追加模式写评论正文，不加标题和 `## Motivation`，直接以“补充几条移植中遇到的限制：”开头，后面按分组列新增项。

新建模式的标题用 `<主题>：<用户能感知的结果>`，控制在 40 字以内，不带内部编号、版本号和 pstack 名字。示例：`多代理工作流移植反馈：稳定工具与实验性插件`。用户明确要求拆分时才按主题拆成多篇。

`Motivation` 控制在 2 到 3 句，从移植经历出发写遇到的限制和为什么值得官方优化。不要写插件内部业务划分，也不要把建议写成“我们在补标准工具缺口”。`Behavior` 按官方状态分组：`### 稳定工具` 写增加标准能力，`### 实验性插件` 写补齐功能。

建议结构：

```markdown
## Motivation

<移植经历；遇到的能力限制；为什么值得官方优化。>

## Behavior

### 稳定工具
- ...

### 实验性插件
- ...
```

写作约束：

- 默认用简体中文；用户指定其他语言时跟随。
- 正文控制在 1000 字以内；每条一行，不展开实现方案。
- 用移植中遇到的现象说明问题，不写插件内部模块分工或“业务/非业务”的判断。
- 建议写到标准工具的参数或行为，不写实现方案。
- 不写工作量估计、排期和客套话；可以指出最关键的能力。

完成标准：一篇能独立读懂；每条能单独评价；每条建议能对应到一个移植中遇到的限制；没有内部编号。

## 5. 用两个写作技能优化

先读 `pstack/pstack/docs/harness/dsh.md`，再直接读这两个文件，不通过 skill catalog：

- `pstack/pstack/skills/technical-writing/SKILL.md`
- `pstack/pstack/skills/unslop/SKILL.md`

按 `technical-writing` 的 explanation 模式改写：先结论，后理由，一段一个意思；`Behavior` 只写期望的可观察状态，不写操作步骤和实现方案。再按 `unslop` 逐条扫描，删掉 AI 词汇、空洞的 -ing 句、强行三段式、破折号和冒号滥用、粗体滥用、chatbot 话术、填充词、过度 hedging 和抽象隐喻。

查重时改动过正文的，重跑本步。保留事实、条件和边界，不为缩短删掉限制。

完成标准：两个技能都执行过；正文能一次读懂；报告记录主要修改点。

## 6. 确认并提交

`draft` 模式停在这里：把正文写到 `.tmp/upstream-discussion/<slug>.md`，报告路径，不调用 GitHub 写接口。

提交模式先运行 `gh auth status`，确认已登录且对目标仓库有写权限。`gh discussion` 是 preview 命令，需要 gh 2.100 或更高；版本不足时停止并报告。再展示目标仓库、提交位置（新建或追加 #编号）、标题、完整正文和查重结论，等待用户明确确认。

新建模式执行：

```bash
mkdir -p .tmp/upstream-discussion
gh discussion create -R deepseek-ai/deepseek-harness --category Ideas \
  --title "<标题>" --body-file .tmp/upstream-discussion/<slug>.md
```

追加模式执行：

```bash
gh discussion comment <编号> -R deepseek-ai/deepseek-harness \
  --body-file .tmp/upstream-discussion/<slug>.md
```

用文件传正文，避免 shell 引号改写内容。提交后更新 `docs/upstream-discussions.md`：新建时追加一行标题、URL、主题、首次提交和最近更新；追加时只改最近更新。失败时保留草稿，报告错误，不重复创建。

完成标准：`draft` 模式有草稿路径；提交模式用户确认过完整内容，Discussion 或评论有 URL，记录表已更新，失败时有原因和草稿路径。

## 7. 报告

| 标题 | 动作 | 状态 | 链接 | 相关实现 |
|---|---|---|---|---|

动作只用 `新建`、`追加 #<编号>`；状态只用 `已提交`、`未提交`。报告写明两个写作技能已执行及主要修改点，并列出被查重剔除的条目。最后给出下一步：重新运行 `/pstack-upstream-feedback`，或“本轮结束”。
