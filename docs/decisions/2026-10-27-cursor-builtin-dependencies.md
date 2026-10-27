# 决定：上游依赖 Cursor 内置技能的地方，改指向本包自己的技能

Status: accepted
Date: 2026-10-27

## 背景

pstack 的技能文本假定 Cursor 应用自带的一批技能可用。它们不在 `cursor/plugins` 仓库里，而在 Cursor 安装目录的 `~/.cursor/skills-cursor/`，共 26 个，`create-skill`、`loop`、`goal`、`autopilot`、`review`、`visualize`、`shell`、`onboard`、`origin`、`share`、`automate` 等。

移植时这些技能一个都没有随包。于是上游文本里"把这一步交给 `create-skill`"这类指令，在 DSH 里指向一个不存在的技能。这个缺口一直没有决策记录，只散落在逐条 patch 的 `reason` 字段里，读者要拼 25 处才能看出整体处置。

按引用密度统计，真正被上游依赖的只有三个：`create-skill`（技能撰写）、`loop`（定时与循环）、`visualize`（对话内图形）。其余多是产品绑定的操作流程，例如 `loop` 的 21 处里大半是 `/loop until X` 这种用户措辞，不是技能调用。

`create-skill` 缺失的影响最大：`reflect` 的三条路由规则、`automate-me` 的起草步骤、`authoring-a-skill` playbook 的第 1 步、`09-make-it-yours` 的两段说明，全都指向它。这些文件描述的是一条"改技能 → 交给撰写器 → 跑评测 → 迭代"的闭环，缺了撰写器，闭环断在第一步。

## 决定

上游每一处"交给 Cursor 内置技能 X"的指令，按 X 的三种状态分别处理。

**一、本包能提供等价技能的，改指向本包技能。**

`create-skill` 这一类。本包已 vendored `writing-for-agents`（`mattpocock-skills`，MIT，见 [第三方技能记录](2026-10-27-third-party-skills.md)），它覆盖"怎么写技能"的判据：context pointer、信息层级、完成判据、leading word、修剪。所有 `create-skill` 引用改为指向它或指向 `authoring-a-skill` playbook，后者再指向它。

不保留"本包没有撰写器，你自己写"这种句子。原因不是它不准确，而是它是个否定式指令：`writing-for-agents` 自己写着，用禁令引导会把被禁的行为拉进上下文，一半读成"去做那件事"。读者需要知道的是去哪儿读判据，而不是本包缺什么。缺什么写在本文和差异清单里，那是维护者的读物，不是执行者的读物。

**二、本包能提供等价映射的，改写成真实机制。**

`loop`、`goal` 这一类。DSH 有 `create_goal`、`goal` 的 `resume`、`schedule_create`，但没有同名命令也没有事件订阅。上游的 `/loop until X` 改成注册目标加可检验谓词，定时心跳才用 `schedule_create`，事件驱动用后台任务或显式轮询。降级写在 `capabilities.ts` 的 `loop` 行，技能正文只说真实可用的那部分。

**三、产品绑定的，明确排除并说明在哪一步失效。**

`autopilot`、`origin`、`share`、`onboard`、`shell`、`automate`、`visualize` 这一类。它们依赖 Cursor 的 PR 工具、托管仓库、CLI 配置、Canvas 运行时。DSH 没有对应闭环，硬移植会得到"每一步都说做不到"的空壳。处置是：相关技能在他们的步骤说明不支持，`capabilities.ts` 记 `excluded` 或 `degraded`，并给出替代路径（例如 `origin` 的 PR 操作改用 `gh` 或已解析的 forge CLI）。

**判定顺序**：先问本包能不能提供等价物，能就改指向；不能就问宿主有没有等价机制，有就改写；两者都没有才排除，且必须写出在哪一步失效。

## 备选方案

- **移植 Cursor 那 26 个内置技能。** 放弃：它们的授权状态无法确认。它们来自 Cursor 应用本体，目录下没有任何 licence 文件，`.sync-manifest.json` 只记同步时间，`cursor/plugins` 里也搜不到。把它们打进 MIT 的发布包是未获授权的再分发。用户已明确同一判断。
- **从 skills.sh 找 `create-skill` 的替代。** 部分采纳：`writing-for-agents` 取到了，`skill-creator` 放弃，因为它依赖 Python 与浏览器，违反本包的零运行时依赖要求，而且它做的事（并行评测、打分、描述优化）已经由 `eval` playbook 用 `pstack_subagent` 加 `pstack_history` 覆盖，那套更贴本宿主。
- **保留"本包没有撰写器"这类否定式说明。** 放弃：见决定第一点。这类句子在正文里只是噪声；读者需要的是判据在哪，不是缺陷清单。缺陷写在 `capabilities.ts` 与差异清单，那两处是给维护者和排查用的。
- **只改 `authoring-a-skill` 一处，不碰 `reflect` 与 `automate-me`。** 放弃：那三个文件是同一条闭环的三段，只改一段会让另外两段指向一个已经不存在的流程。`reflect` 有一条用例、`automate-me` 有六处。
- **在 `capabilities.ts` 里新增一行"内置技能依赖"。** 放弃：能力表是"上游概念 → 宿主处置"的映射，`create-skill` 已经有自己的行。再加一行会造成同一个概念两处描述，而差异清单需要的是按来源分类的处置说明，不是又一张表。

## 后果

上游每条"交给内置技能"的指令现在都有明确去向，三类处置可以逐条核对。`create-skill` 的闭环在本包里重新闭合：`reflect` 判定要改技能，路由到 `authoring-a-skill`，后者指向 `writing-for-agents` 拿判据，写完按 playbook 的清单自查。

代价有三条。第一，`writing-for-agents` 讲的是通用文档写作，不讲 Cursor 那套 frontmatter 字段与评测循环，所以判据的来源变了，不再是"照抄 Cursor 的规则"。第二，`automate-me` 的"描述优化"这一步没有工具，改成手工改写并重载目录确认，这比原来的自动化弱。第三，排除掉的那批技能，用户如果本来就是为它们装的 pstack，会发现这些入口不在了；`capabilities.ts` 与差异清单是唯一能解释原因的地方。

重新考虑的条件：如果 Cursor 公开那 26 个内置技能的授权，`create-skill` 应当按本文第一类补上，与 `writing-for-agents` 并存，由 `authoring-a-skill` 决定何时用哪一个。如果 DSH 出现官方的技能评测或描述优化工具，`skill-creator` 那套被放弃的能力需要重新评估。

## 附：上游的内置技能依赖清单

按实际引用统计，只有三处是真的技能调用：

| 内置技能 | 上游引用处 | 处置 |
|---|---|---|
| `create-skill` | `reflect` 3 条路由、`automate-me` 6 处、`authoring-a-skill` 第 1 步、`09-make-it-yours` 2 段 | 改指向 `writing-for-agents` 与 `authoring-a-skill` |
| `loop` | 21 处斜杠引用，多数是用户措辞 `/loop until X`，不是技能调用 | 改写为 `create_goal` 加谓词，降级见 `capabilities.ts` |
| `visualize` | `ketchup` 2 处 | 改写为 Mermaid 与真实渲染器，降级见 `capabilities.ts` |

其余 23 个在当前移植文本里没有作为技能被调用，不构成依赖。
