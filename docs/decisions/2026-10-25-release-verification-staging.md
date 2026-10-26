# 决定：发布验收分两期，静态门先行，真实 profile 验收由发布方批准后执行

Status: accepted
Date: 2026-10-25

> **部分被取代（2026-10-26）。** 本文提到的 `docs/pstack-dsh-port-development-design.md` 与 `docs/release-verification-checklist.md` 已随 [V2 后收敛决策](2026-10-26-slimming-after-v2.md)删除，因此"未验证清单只有一处"（第 6 条）的载体不存在了，未验证项改由各条决策记录的"后果"一节分别声明。第 1 条里的 `check:upstream`、`sync:check`、`check:pack` 也已删除。本文其余判断（静态门先行、真实 profile 验收另行批准、静态检查不得充当行为证据）继续有效，正文按原样保留。

## 背景

单元 7 是发布审查。`docs/pstack-dsh-port-development-design.md` §12.3 与 §12.4 定义了十步真实 profile 验收和 40 个行为级用例，§16 要求用 Inspect 复核宿主契约。这些步骤都需要一台机器上的真实 profile、真实模型 route、真实 child、真实 watcher 和一次性仓库；其中若干项还会改动操作方的 profile，或用真实 PR 做外部写操作。

前六个单元已经交付了可重复的静态门：`check:upstream`、`sync:check`、`check:assets`、`typecheck`、`test`、`build` 和受控副本上的脚本测试。但它们都拿 fake reader、DI 时钟和资产断言做证据，证明的是"生成结果与声明一致"，不是"插件在 profile 里按正文跑通"。

如果在一轮里同时做两件事，会得到两种坏结果：要么为了让真实验收通过而放宽静态断言，要么把单元测试通过当成行为验收通过。设计 §13 也写明"未完成前一单元的真实验证，不在文档或帮助中宣称后续能力"，所以宣称口径必须与验证阶段绑定。

[README 内容决策](2026-10-24-readme-content.md)与[篇幅决策](2026-10-24-readme-concision.md)已经把 README 的承诺面固定下来；[worktree 决策](2026-10-25-worktree-conditional-mount.md)要求四条安装/启用路径真实验证；[长任务决策](2026-10-25-long-running-workflows.md)明确 B04、B10、B13 至 B18、B20、B21 尚未执行。这条记录说明这些验证在什么时候、以什么方式发生。

## 决定

1. **静态门是每轮都必须过的门。** 顺序固定：`node scripts/check-upstream-tree.mjs`、`pnpm typecheck`、`pnpm test`、`pnpm sync:check`、`pnpm check:assets`、`pnpm check`、`pnpm build`、`pnpm pack --dry-run`；另在受控副本上跑上游脚本的 `bun test orch watch-pr check-plan.test.ts` 与 `bun run typecheck`，并记录 Bun 与 Node 版本。任何一项失败都阻止交付，跑不了的项必须写明原因，不静默跳过。
2. **真实 profile 验收是发布门，不是开发门的同义词。** §12.3 的十步与 §12.4 的全部用例在发布方批准后集中执行一次，逐条记录真实输入、可观察结果和未覆盖项。在此之前，所有用例状态保持"未验证"。
3. **安装方式是本地构建加工作区目录链接安装。** 复现命令里的安装步骤一律写成"本地构建 + 工作区目录链接安装到一次性 profile"，不使用 registry 上的线上版本。理由与[自包含技能 provider 决策](2026-10-25-self-contained-skill-provider.md)记录的链接安装一致：这种安装解析的就是将要发布的同一份 checkout。
4. **版本号维持 `0.1.0`，`engines.dsh` 维持 `0.2.1-rc.3`。** 不 `npm publish`，不改 dist-tag，不改 README 里 `add dsh-pstack` 与 `add dsh-pstack@latest` 的写法。版本号只在第一次真实发布时变更，而那一次发布必须发生在第 2 条的验收之后。
5. **静态检查和单元测试永远不能记为某个行为级用例的证据。** 用例的通过条件写在 §12.4 的"可观察的通过条件"列，只有对应的真实运行记录能填上它。缺驱动、缺 route、缺 Bun 的用例标"未验证"或"不通过"，不降级成低一级的 smoke test。
6. **未验证清单只有一处。** 它落在 `docs/release-verification-checklist.md`，不进 README 的"功能范围"或"支持"表述。README 只描述用户可见的行为与限制，验证进度由发布说明与这份清单承载，这与[篇幅决策](2026-10-24-readme-concision.md)第 2 条"不写项目状态"一致。
7. **静态门里有机器可检查的部分就加断言。** 随包文本不许出现另一个宿主的名字、安装命令与角色文件路径各自只有一种写法、README 与 guide 的禁词只能出现在排除语境、`poteto-help` 的 playbook 承诺与 23 个文件逐条对齐——这些都由 `check:assets` 断言，并有对应单元测试，不靠人眼复读。

## 备选方案

- 在单元 7 内直接跑真实 profile 验收。放弃，因为它要求改动操作方的 profile、发起真实模型调用和真实 PR 操作，一次失败就会留下半装状态；而且评审者无法在自己的机器上复现同一结果。
- 先发布 `0.1.0`，再对着线上版本做验收。放弃，因为已发布版本不可修改，第一条验证记录就会贴在一个改不动的产物上；验收应当发生在产物冻结之前，链接安装已经能验证同一份代码。
- 把单元测试和 `check:assets` 当作行为级证据。放弃，因为用例要求的是真实 route、真实 settlement 通知、真实 PR 状态，测试里的 fake reader 和 DI 时钟按定义证明不了这些。
- 把未验证清单写进 README，让用户一眼看到。放弃，因为 README 的"功能范围与已知限制"写的是能力边界，不是内部验收台账；混进去会让读者把"未验证"读成"不支持"，也会与篇幅决策冲突。
- 暂时不写这条记录，只在提交说明里交代。放弃，因为"什么时候才算可发布"会被下一次发布重新讨论一遍，而它恰好是不能靠代码解释的那类取舍。

## 后果

开发进度与发布资格分开表述：单元 7 完成时可以说"开发层面完成，静态门通过"，不能说"已验证可用"。代价是发布前还有一次集中验收，需要操作方提供一次性 profile、真实 route、Bun 环境和一个可丢弃的仓库。

静态门的成本很低（一轮 `pnpm check` 加打包清单），因此每次改动都能跑；真实 profile 验收的成本高，因此集中执行。若集中验收的结果与本文档冲突，应新写一条记录取代本记录，而不是修改本文来迁就结果。

第 4 条的版本号决定意味着 `0.1.0` 是一个"已构建但未发布"的版本。第一次真实发布时，版本号、README 的支持版本表和 dist-tag 一起改，并按本文第 2 条先完成验收。
