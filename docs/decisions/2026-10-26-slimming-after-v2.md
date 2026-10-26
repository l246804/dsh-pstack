# 决定：V2 完成后按"整体链路正常"收敛检查链与测试体量

Status: accepted
Date: 2026-10-26

## 背景

V2 实现完毕。实现期为了把设计文档里的每一条都钉住，长出了一批只在实现期有意义的资产：两道发布期专用门（`check:upstream`、`check:pack`）、一套只用来测试检查器本身的单元测试、两份实施期长文（91KB 的设计文档和 20KB 的发布验收清单），以及 542 个用例。

这些资产在实现期是对的。设计文档要逐条核对 56 个技能和 23 个 playbook 的处置；`check:pack` 要证明 tarball 形状；`tests/release.test.ts` 要证明 README 与 workflow 的 37 个断言。实现完成后它们的问题变成另一个：**读者要维护的东西比产品本身还多**，而其中大部分并不在验证"插件在真实 profile 里能不能用"。

两条判断支撑这次收敛。

第一，**真实门已经能独立抓到真实漂移**，不需要单元测试替它抓。实测三例：
- 往 `assets/skills/poteto-mode/SKILL.md` 追加两行，`node scripts/check-assets.ts` 报 `body differs from the patched expectation`；
- 往 README 追加 `` Run `/loop` to finish. ``，它报 `names /loop outside a sentence that excludes it`；
- 把 `scripts/patches.ts` 里一处 `expectedMatches: 1` 改成 `2`，它报 `anchor for replace matched 1 time(s), expected 2`。

`check:assets` 每次运行都重新调 `buildAssets()`，`:check` 模式再与磁盘逐字节比对。所以 `tests/patches.test.ts` 和 `tests/assets.test.ts` 里大量"逐个 patch 断言"的用例，是在断言门每次运行都会断言的东西。

第二，**发布机制比用户需要的重**。`check:pack` 补的三个缺口（缺 `dist/` 仍能打包、`exports` 目标不存在、条目数手抄）都是"发版前"的问题，而发版是一条低频、单人、有 `pnpm publish --dry-run` 可看输出的人工路径。为一个低频人工动作维持 439 行检查器和 14 个用例，成本高于它挡住的失败。

## 决定

按"整体链路正常"收敛，删掉只服务实现期与发布期的东西。

**删除的两道门。** `scripts/check-upstream-tree.mjs` 只校验上游 `pstack/skills` 与 `harness/pstack/claude-code/skills` 两份目录的镜像关系，而后者不发布、生成器也不读它；`scripts/check-pack.ts` 整份删除，`prepublishOnly` 从 `check && build:bundle && check:pack` 收成 `check && build:bundle`。`check` 从 6 段串成 4 段：`check:assets && check:scripts && typecheck && test`。

**删除的两份实施期长文。** `docs/pstack-dsh-port-development-design.md`（它的 Status 本来就是 implemented）与 `docs/release-verification-checklist.md`。`docs/decisions/` 下 25 条决策记录全部保留，它们是"当时为什么这样选"的唯一载体。随之删除的还有 `checkDesignRowList`：它比对设计文档 §3.3 与 `cordis.patch.yml` 的行清单，文档没了它就没有可比对象，而 `checkBundlePatch` 已经直接对着真实 patch 断言行 id、顺序、插件名、guard 文本和 `exports` 对应关系。

**收敛的测试。** 542 个用例收到大约 400 个，再对 `history`、`script`、`subagent` 三个最大文件做一轮按"能否观察到"的裁剪。删掉的四类：只测试检查器内部函数的（`tests/assets.test.ts`、`tests/patches.test.ts` 的大部分）、复制粘贴检查器常量的（`tests/release.test.ts`）、验证 Node 自身语义而非本包契约的（`tests/check-scripts.test.ts`、`tests/worktree-mount.test.ts`）。保留的是只经过用户接口就能观察到的行为：返回值和错误类型、Host 收到的请求、输出 schema、授权拒绝、分页边界、release/lease 语义、真实 Cordis 装配。

**保留的门各守一件真事。** `check:assets` 守生成树能由源码重建、禁词只出现在排除语境、README 链接在 tarball 内可达；`check:scripts` 守五个随包 CLI 零安装可跑（它跑的是真实产物，不是 mock）；`typecheck` 守类型；`test` 守行为。`plugin-wiring.test.ts` 用真实 Cordis 装配六行 patch，是"整体链路正常"最直接的那条证据，明确保留。

## 备选方案

- **一条 `check` 都不留，只留 `test`。** 放弃：`check:assets` 是唯一能证明"提交的 `assets/` 可由源码重建"的门。删掉它，`assets/` 就可以被手改而不被发现，而 `assets/` 恰恰是插件运行时真正读取的东西。这属于删过头。
- **保留 `check:pack`，只删它的 14 个单元测试。** 放弃：检查器本身的 439 行就是成本，留着不带测试的检查器比删掉更糟——它会在某次 `dist/` 不存在时静默给出错误结论。
- **保留 `check:upstream`。** 放弃：它校验的镜像目录不属于本包产物，也不进 `files`。上游同步的真实约束由 `sync-upstream.ts --check` 保证（重新生成 `assets/` 再逐字节比对），那才是本包自己的不变量。
- **保留设计文档，改成"历史归档"目录。** 放弃：91KB 里绝大部分是逐技能、逐 playbook 的处置表，那是实现期的施工图。实现完成后它的每条结论要么已经落在代码里，要么落在决策记录里，留着只会诱使读者照抄过期指令——文档自己开头就写着"凡本文件与代码不一致，以代码为准"。
- **把两份长文压成一条决策记录。** 放弃：决策记录回答"为什么这样选"，被放弃的选项要写出来。这两份文件的主体是"做了什么"的清单，不是取舍，压进记录会让记录变成流水账，而 AGENTS.md 明确禁止记录里写实施流水账。
- **一次性删到只剩 `src/` 和最小测试。** 放弃：`assets/` 是产品本身（55 个技能、23 个 playbook、2 个 agent 人格、随包 CLI），`scripts/` 是生成它们的确定性来源。没有生成器和 `check:assets`，`assets/` 就退化成一份无法从源码重建的手抄树。

## 后果

得到了更短的检查链（一轮从 6 段降到 4 段）、更小的测试体量（542 → 约 340 用例）、以及一份只有 25 条决策记录的 `docs/`。读者需要维护的表面从"产品 + 实现期施工图 + 发布期门"降到"产品 + 决策记录"。

代价有三条。第一，`prepublishOnly` 不再校验 tarball 形状，缺 `dist/` 或在 `files` 外漏链的问题要等 `pnpm publish --dry-run` 的输出或用 npm 页面 404 来发现。第二，设计文档删除后，`docs/decisions/` 里有 5 条记录（`2026-10-24-upstream-generated-port.md`、`2026-10-25-release-verification-staging.md`、`2026-10-26-f01-optional-session-query.md`、`2026-10-26-script-execution-boundary.md`、`2026-10-26-dynamic-reasoning-effort.md`、`2026-10-25-node-native-script-runtime.md`）里的链接会指向不存在的路径。按 AGENTS.md，被推翻的决定不改写旧记录，所以旧记录原样保留，指向关系由本记录承接。第三，上游 `harness/pstack/claude-code/skills` 镜像的漂移不再有任何门盯着；它本来就不发布，所以这不是回归，只是把一个从未被守护过的目录明确标为不守护。

重新考虑的条件：如果发布变成多人协作或高频动作，`check:pack` 那三个缺口会重新变得值得封；如果上游镜像目录开始影响生成器输出，`check:upstream` 要按新的不变量重写，而不是原样恢复。
