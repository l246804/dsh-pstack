# 决定：`pstack/` 按来源四分，生成树落到 `dist/`，脚本 fork 成本地源码

Status: accepted
Date: 2026-10-27

## 背景

上一轮把随包内容按"是否上游移植"分成 `pstack/` 与 `skills/` 两棵树，解决了四处结构缺陷。这一轮暴露出它留下的五个问题，都指向同一件事：`pstack/` 一个目录同时装三种生命周期不同的东西。

**手写内容与生成物同层。** `pstack/` 由 `build:assets` 整棵重建，但它旁边没有任何地方放手写的生成器、检查脚本与脚本源码。这些文件只能放在仓库根的 `scripts/`，于是"移植上游"这件事被拆到两个顶层目录里，读者要同时看两处才知道一个技能从哪里来。

**生成树是 committed 的 tracked 文件。** `pstack/` 里有 142 个文件进了 git。它们的唯一价值是让 `--check` 能证明"提交的树可以由源码重建"，代价是每次上游同步都产生一棵巨大的 diff，而 diff 里几乎没有一行是人写的。

**产物落点与正文路径耦合。** 五个 CLI 的构建产物落在 `pstack/skills/**/scripts/`，`pstack_script` 用 `PSTACK_ROOT + assetPath` 定位，技能正文里也写着同样的路径。产物位置因此不能只在一个地方改。

**上游脚本靠 13 条锚点 patch 在构建期改写。** `orch`、`watch-pr`、`check-plan` 的 TypeScript 被 `RUNTIME_SOURCE_PATCHES` 改写后再打包。锚点失效时构建失败，锚点仍匹配但语义已变时静默出错，这与上一轮废掉的 322 条 prose patch 是同一种机制。

**发布清单与构建方式都不表达依赖顺序。** `package.json` 的 `files` 列了七项，`build` 是 `&&` 串起来的一条链，其中两个步骤本来可以并行。

## 决定

**`pstack/` 按来源四分，每个子目录的生命周期用一句话说得清。**

```
pstack/
  pstack/    生成树，只含 agents/ docs/ skills/，每次构建整棵替换
  docs/      手写覆盖层，按 overlay.yml 覆盖生成树里的同名文件
  runtime/   手写脚本源码，上游 bash 与 bun 脚本的 Node 平替，以及 fork 出来的上游 TypeScript
  scripts/   生成器、检查脚本、构建脚本
pstack/README.md  手写，说明这个目录由什么生成
```

**生成树不进 git，落到 `dist/`。** `dist/pstack` 由生成器写入，`dist/skills` 由复制脚本写入，`dist/*.mjs` 由 bundler 写入。`dist/` 一直在 `.gitignore` 里，`package.json` 的 `files` 因此收到三项：`dist`、`cordis.patch.yml`、`static`。

**运行期只认 `dist/`，路径只有一个答案。** `src/paths.ts` 的 `PACKAGE_ROOT` 是"本模块的上一级"，这个表达式在 checkout（`src/paths.ts` → 仓库根）与安装包（`dist/index.mjs` → 包根）里都成立，所以 `join(PACKAGE_ROOT, "dist")` 在两处指向同一棵真实的树。删掉了"先找 `dist` 再回落到仓库根"的探测：那条规则会让同一个资源有两个位置，checkout 与安装包对"哪些文件是真的"给出不同答案。

代价是 checkout 里跑测试或检查必须先构建。这件事由 `run.tasks` 的 `dependsOn` 承担，而不是在代码里加分支。

**三个上游 bun 脚本 fork 成本地源码，删掉 patch 机制。** `pstack/runtime/fork/` 保存 `applyFilePatches` 处理过的文本，路径与上游一致。`scripts/patches.ts`、`scripts/apply-patches.ts`、`.runtime-sources` 全部删除。构建期不再有暂存目录，bundler 直接读仓库里的文件。

**覆盖层用整份文件替换，并记录 base 与哈希。** `pstack/docs/overlay.yml` 每条写 `path`（覆盖层内位置）、`tree`（生成树内位置）、`replaces`（它替换的上游文件）、`revision` 与 `sha256`。生成器哈希固定的上游文件，与记录不符就构建失败，并打印新的哈希。整份替换而不是句级 patch，是为了让上游改动表现为一次明确的失败，而不是一次静默的语义漂移。

覆盖层的文件仍然经过同样的四个机械变换：收窄 frontmatter、重指树外链接、插入适配指针、复制。来源与变换是两个独立问题，覆盖只改变第一个。

**构建编排进 `run.tasks`，用依赖边而不是 `&&`。**

```
build:runtime ──> build:port ──┐
                               ├──> build:copy ──> build
build:bundle ──────────────────┘
```

`build:runtime` 与 `build:bundle` 互不读取对方输出，因此并行。`build:port` 需要产物，因为产物是生成树的文件。`build:copy` 在 bundle 之后，否则 `clean: true` 会删掉它复制的内容。`check` 与 `test` 依赖 `build:copy`，因为它们读 `dist/`。

`package.json` 里与任务同名的脚本全部删除，因为同名同时出现在两处是 vite-plus 的错误。

**发布清单与 `exports` 只指向 `dist/`。** `locale/` 删除，`exports` 里的 `./locale/*.json` 一并删除。这是"只发 `dist`"的必然结果：保留一个指向包内不存在文件的 `exports` 只会让读它的人以为它可用。

**检查按归属分家。** 端口树的检查（技能、playbook、agent 的索引、斜杠命令、相对链接与锚点、计数、role 键、overlay 新鲜度、worktree 守卫字节）进 `pstack/scripts/check-pstack-docs.ts`。随包脚本能否零安装运行进 `pstack/scripts/check-shipped-scripts.ts`。第三方技能的提交号与每文件哈希进 `pstack/scripts/sync-skills-ext.ts`。`scripts/check-assets.ts` 里那些包级检查（bundle patch 行、`files`、图标、LICENSE）随目录一起删除。

## 备选方案

- **保留 tracked 的生成树，只搬子目录。** 放弃。committed 生成物的唯一用途是让 `--check` 有意义，但 `dist/` 每次构建都重建，`--check` 改成"构建两次结果一致"同样能证明可重现，而且不需要把 143 个文件放进 diff。换掉的是一条更强的性质：现在 `pstack/pstack` 不是事实源，`pstack/runtime` 与 `pstack/docs` 才是。
- **覆盖层用句级替换表，像上一轮的 `RETARGETED_LINKS`。** 放弃。用户点名要覆盖整份文件，而且锚点 patch 的失败方式已经在注释里记过一次：上游改了措辞就匹配失败，改了含义不动措辞就静默通过。整份替换加哈希守卫把这两种失败都变成一次构建错误。
- **覆盖层头写在每个文件第一行。** 实测放弃。`SKILL.md` 必须以 `---` 开头，头部注释会让 skill 无法解析。改成独立的 `overlay.yml`，顺带让"哪些文件被覆盖"可以在一处读完。
- **覆盖层内的技能文件跳过 frontmatter 变换。** 实测放弃。第一次实现这么做，链接检查立刻报出两处悬空链接：覆盖只替换正文，加载器读的字段和读者需要的指针没有变。
- **`codeSplitting: false` 让 `paths.ts` 落在入口文件里。** 实测放弃。多入口时这个选项直接报错，而删掉共享 chunk 会让每个入口重复一份路径常量。`paths.ts` 靠"上一级是包根"计算，chunk 与入口同在 `dist/` 下深度相同，这条性质成立，不需要靠配置保证。
- **运行期探测 `dist` 与仓库根两个位置。** 放弃。这正是上一轮 `ASSETS_ROOT` 写两次的那类缺陷：同一个路径两个定义，两边各有一个能通过的场景。
- **`build:copy` 清空整个 `dist/` 再复制。** 实测放弃。它会把 bundle 一起删掉，取决于两者顺序。改成只管理 `pstack`、`skills/vendored`、`skills/authored` 三个目录。
- **`locale/` 保留在 `files` 里。** 放弃。用户要求只发 `dist`，而 `locale` 在仓库根。保留目录但从 `files` 去掉会留下一个指向包内不存在文件的 `exports`。
- **保留 `scripts/check-assets.ts` 作为总检查。** 放弃。它 1895 行里一半检查的是被这轮删掉或移走的树，留着就是第二份事实。真正的取舍是：端口树的检查跟着端口树走，包级检查该重写而不是搬家。
- **`check` 只依赖其它任务、不写 `command`。** 实测放弃。vite-plus 不接受没有 `command` 的任务定义。

## 后果

得到四件事。`pstack/` 一个目录就能回答"移植的内容从哪来"，四个子目录各有一句话的责任。生成树不再进 git，上游同步的 diff 只包含手写内容。运行期路径只有一个答案，checkout 与安装包不再可能给出不同结果。构建的并行关系写在依赖边上，`build:runtime` 与 `build:bundle` 真的同时跑。

代价有六条。

第一，**checkout 里不能直接跑测试**。`vp test` 依赖 `build:copy`，而 `vp run test` 会先构建。直接 `vp test` 会失败，因为 `dist/` 不存在。这是"路径只有一个答案"的直接代价，`dist/` 缺失时的报错必须说清楚要跑哪个命令。

第二，**上游脚本不再自动跟随**。fork 之后，上游改 `orch`、`watch-pr`、`check-plan` 需要人工重新移植。`pstack/runtime/fork/` 保留了上游的路径与形态，使一次比对是 `diff` 而不是考古。

第三，**覆盖层会过期，且过期时构建失败**。上游改一个被覆盖的页面，构建停止并要求重算哈希。这是有意的摩擦，但它意味着上游同步多了一步人工作业。

第四，**`locale/` 删除后插件管理器没有中英文标题**。这是"只发 `dist`"的直接后果，已经一并删除 `exports` 条目，不留悬空路径。

第五，**`check:assets` 这个总门不存在了**。原来一条命令能回答"这棵树是否自洽"，现在由四个任务分别回答，`vp run check` 汇总。分工更清楚，但失败时要看是四个里的哪一个。

第六，**`pstack/README.md` 与 `pstack/pstack/README.md` 是两份文档**。前者说明这个目录由什么生成，后者是随包的 pstack 介绍。两者的读者不同：一个是要改这棵树的人，一个是装了这个包的人。

重新考虑的条件：如果 fork 的三个脚本需要频繁跟随上游，说明 patch 机制的删除是对的但 fork 的位置不对，那时应考虑把上游脚本 vendor 进 `pstack/runtime` 并在构建期只做最小改写。如果 `dist/` 之外的资源（例如某天需要随包的图片或配置）出现，应该把 `pstack/scripts/copy-to-dist.ts` 的复制清单扩展成一张表，而不是放宽 `files`。

## 附：验证

- 生成器 `--check` 两次构建字节一致，143 个文件。
- 覆盖守卫：往上游 `docs/guide/01-setup.md` 追加一行，构建失败并打印新哈希；恢复后通过。
- 非生成物守卫：在 `pstack/pstack/` 放一个文件，构建失败并点名。
- worktree 守卫：改 `cordis.patch.yml` 里一个字符，检查失败并点名该行。
- 安装形态：把 `dist`、`cordis.patch.yml`、`static`、`package.json` 复制到独立目录，九个路径常量全部指向存在的文件，技能目录加载到 59 个技能，与重构前的基线逐条一致。
- `vp run check` 10/10 通过，`vp run build` 8/8 通过，417 条测试全绿，与重构前同数。
