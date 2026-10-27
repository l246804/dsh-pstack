# 决定：自写技能进 `skills-ext/local`，用 `origin` 区分自写与 vendored

Status: accepted
Date: 2026-10-27
Scope: scripts/skills-ext/**, scripts/sync-skills-ext.ts, scripts/check-assets.ts, skills-ext/local/**
Implemented-by: -
Review: 2027-04-27

## 背景

要随包发布三个自写技能：`decision-write`、`decision-audit`、`setup-project-docs`。本仓库此前只有两种技能来源，两种都不接受自写文本。

`assets/skills/` 的语义是"可由 pinned submodule 重新生成"，由 `writeAssets` 整棵 `rename` 覆盖，并用 `assertAssetsHoldsOnlyGeneratedFiles` 断言里面只有生成物。自写技能放进去会让那条断言失效，而这个断言正是 [第三方技能树移出 `assets/`](2026-10-27-skills-ext-outside-assets.md)那次事故的修复本身。

`skills-ext/` 的语义是"逐字节拷贝上游某次提交"，靠内容哈希证明"手里的文本等于那个提交"。自写技能没有上游，哈希无从比对。

第三个问题是入口。`setup-pstack` 的正文写着它只写 `$DSH_HOME/pstack-models.md`，从不碰仓库文件。它又是全包唯一模型可调用的技能。让一个会被模型自己触发的技能去改用户仓库的 `AGENTS.md`，是把风险等级抬了一级：那个文件是用户的源码，不是插件的状态。

## 决定

**新增来源 `skills-ext/local/<技能>/`，在 `sources.yml` 里用 `origin: local` 标记。** 它与 vendored 来源共用目录约定与文件清单，跳过两件只有拷贝才需要的事：内容哈希与远端比对。

**`origin` 缺失时按 `vendored` 处理**，所以既有条目不用改。

**`authored` 与 `vendored` 的差异由检查强制，不靠约定**：`origin: local` 的来源若写了 `repository`、`revision` 或内容哈希，`check-assets` 直接失败。反向也成立：vendored 来源缺 40 位 SHA 就失败。这样一条错误的来源声明不会悄悄生效。

**opt-in 靠项目状态，不靠配置。** `decision-write` 与 `decision-audit` 在仓库没有 `docs/decisions/` 时停下并说明。`setup-project-docs` 是唯一写仓库文件的技能，并且只由用户显式调用。

**不改 `setup-pstack`。** 它不新增步骤，也不获得写仓库文件的权限。

**每个本地技能自己声明调用方式，没有统一规则。** `sources.yml` 里每个本地技能写 `invocation: model` 或 `invocation: user`，`check-assets` 断言它与 `SKILL.md` 的 frontmatter 一致，两个方向都查：清单说 `model` 而技能写了 `disable-model-invocation` 会失败，清单说 `user` 而技能没有那一行也会失败。这样"把某个技能改成模型可调用"是一次评审可见的两处改动，不是一行 frontmatter 的静默编辑。

**移植部分保持上游的形态，扩展部分各自决定。** 55 个移植技能里只有 `setup-pstack` 模型可调用，那是上游自己声明的，不是本包的规则。本包自写的技能按触发需要各选各的：`decision-write` 选 `model`，因为它的触发时机是"这次改动刚刚否决了一个真实替代方案"，而那一刻调用方不会记得斜杠命令；`decision-audit` 与 `setup-project-docs` 选 `user`，因为前者只出报告、后者是唯一写仓库文件的技能，两者都没有"必须自己触发"的理由，留在模型目录里只是常驻开销。

**指针只写根 `AGENTS.md`，不认 `CLAUDE.md`。** 宿主两个文件都会加载，所以同时存在时同一段指令会进上下文两次，而两份文本随后各自漂移。本包把 `AGENTS.md` 定为唯一事实标准：`setup-project-docs` 只读它、只在里面插块，它不存在就创建一个。`CLAUDE.md` 不读、不改、不探测。

**这三个技能不假设语言与构建工具。** 工作区形态从各语言自己写下的文件读：`package.json` workspaces、`go.work`、Maven 或 Gradle 父工程的 `<modules>` 与 `include(...)`、Cargo workspace 的 `[workspace] members`，或者若干各自带构建文件与 `src/` 的顶层目录。它们读的其余东西只有 git、`gh` 与 Markdown，没有一项绑定 Node 生态。

**决策目录先探测再使用，只有一个家。** 默认 `docs/decisions/`；仓库已有 `docs/adr/` 或 `doc/adr/` 就沿用它，`setup-project-docs`、`decision-write`、`decision-audit` 读同一个。同时存在多个时停下询问，不合并。

## 备选方案

- **由 `build:assets` 生成进 `assets/skills/`。** 放弃：那要求给 `assertAssetsHoldsOnlyGeneratedFiles` 开口子，或给生成器加一份"自写源"输入，而生成器的语义是"这个目录等于一次全新构建"。开一个口子之后，同一个目录里就同时有"可重新生成"和"手写"两种文件，`sync-upstream --check` 与 `sync-skills-ext --check` 的边界也就说不清了。
- **新建顶层 `first-party/` 树。** 放弃：那会是第三条并行机制，而且它既没有哈希也没有生成器可依据，只剩文件清单。`skills-ext/local` 复用现成的目录约定、provider 加载路径、清单校验与打包检查，新增成本只有 `origin` 这一个字段。
- **生成到目标项目的 `.dsh/skills/`。** 放弃：`create-verification-skill` 那样做是因为验证脚本必须贴着那个仓库的启动命令和选择器。决策记录技能与具体仓库无关，每个项目生成一份就多一份永不更新的副本。
- **加进 `setup-pstack` 第 1 至 6 步。** 放弃：见背景第三条。`setup-pstack` 自己的第 7、8 步已经是"问一次、答应了就调用另一个技能"的形式，把它做成第 9 步在形式上成立，但用户明确要求与 `setup-pstack` 解耦。
- **统一规定"本包自写的技能一律用户调用"。** 放弃：那是一条为了整齐而牺牲判断的规则。`decision-write` 的触发时机在任务中途，用户调用形式意味着它经常不会被用上；而 `setup-project-docs` 写仓库文件，模型调用形式意味着一次静默改写用户源码。两者需要的答案相反，一条统一规则必然错一半。改由每个技能声明并在清单里记下理由，让不同的需要得到不同的答案，同时让这个选择在评审里显形。
- **用 profile 级配置开关做 opt-in。** 放弃：那要新建一个配置面，而"仓库有没有 `docs/decisions/`"本来就是可观测的项目状态。用配置就等于让同一个事实有两个家。
- **把三个技能放进 `assets/skills/` 并计入 55 个技能。** 放弃：见第一条。另外 `check-assets` 里 "55" 出现在四处，其中 `index.size !== 55` 会把自写技能判成 `unexpected skill`。为三个技能去改四处计数与一处模型可调用白名单，比加一个 `origin` 字段代价更大。
- **指针按 `setup-matt-pocock-skills` 的规则选文件**（`CLAUDE.md` 在就改它，都没有才问）。放弃：那条规则的目标是让两个宿主共用一份文本而不打架，代价是同一段指令有两个可能的家。本包只有一个宿主，把 `AGENTS.md` 定为唯一事实标准更简单，也省掉一次提问；`CLAUDE.md` 在仓库里存在时，它对本包就等于不存在。

## 后果

自写技能有了一条与 vendored 分开的路，且不新增顶层目录：加目录、在 `sources.yml` 登记 `origin: local`、列文件清单，三步。`pnpm run check` 的两段都认得它。

代价有三条。第一，`sources.yml` 现在描述两种东西，"每个来源一个仓库"这句话不再对整个文件成立，读的人要看 `origin`。第二，`origin: local` 的文本没有任何机器可验的来源证明，它的正确性完全由评审承担；而 vendored 那半边至少能证明"没被本地改过"。第三，`skills-ext` 的内容不计入 `capabilities.ts` 的能力表，所以这三个技能在能力映射上没有行，它们的承诺只写在自身正文与差异清单里。

另有一条取舍值得写明：仓库根若有 `CLAUDE.md`，本包对它不探测、不改写。使用者在两个文件里各写一份指针时，本包只负责 `AGENTS.md` 那一份，另一份漂移与否不在它的观察范围内。

重新考虑的条件：如果自写技能需要与 vendored 技能一批发布、或需要按来源单独更新，那就说明两类文本的生命周期已经不同到不该共用一个 `sources.yml`，那时应拆成两个文件，而不是再给这个文件加字段。

## 附：验证

- `node scripts/sync-skills-ext.ts` 输出 `local (no upstream)` 并 `check passed`，四个技能全部登记。
- `node scripts/sync-skills-ext.ts --remote` 对 `local` 输出"written here, so there is no upstream to compare with"，不把它报成漂移。
- `node scripts/check-assets.ts` 通过，`assets/` 仍为 55 个生成技能，未被改写。
- `pnpm run check` 通过，412 个用例全绿。
- provider 合并两棵树后目录为 59 个技能，模型可调用集合为 `setup-pstack`、`decision-write`、`writing-for-agents`。
