# 决定：随包内容按来源分两棵树，`pstack/` 只放上游移植

Status: accepted
Date: 2026-10-27

## 背景

这次改动从一个具体的不适开始：移植上游 pstack 的文件散在 `assets/`、`docs/harness/`、`runtime/`、`skills-ext/` 四处，而 `skills-ext` 这个名字既不好懂，又同时装两种互斥的东西。

查下去发现四处能在代码里指到的结构缺陷。

**产品依赖了声明为"不发布"的目录。** `src/models.ts`、`src/roles.ts`、`src/subagent.ts` 从 `../scripts/role-manifest.ts` 导入，`src/script.ts` 从 `../scripts/runtime-manifest.ts` 导入。`dist/subagent.mjs` 里能查到 `how explorer`，说明角色表真的进了发布产物，而 `checkScriptReferences` 的注释写着 `.ts` 引用是 "this repository's build scripts"，"They never ship"。

**同一个路径有两个独立定义。** `ASSETS_ROOT` 在 `src/paths.ts` 与 `scripts/build-assets.ts` 各写一次，`SKILLS_EXT_ROOT` 在 `src/paths.ts` 与 `scripts/sync-skills-ext.ts` 各写一次，没有检查断言两者相等。

**`skills-ext/` 一个目录装两种生命周期。** `skills-ext/mattpocock-skills/` 是某次提交的逐字节拷贝，靠 SHA-256 证明；`skills-ext/local/` 是本仓库写的，没有上游。两者靠 `sources.yml` 的 `origin` 字段区分，`checkSkillsExt` 里 25 处 `skills-ext` 字面量有一半在为这个分支做双向断言。

**`runtime/` 与 `scripts/runtime/` 同名不同命。** 前者是 gitignored 构建输出，后者是 tracked 源码，靠 `.gitignore` 里一段注释警告维持正确。

运营者在评审中提了两条修正。第一，`pstack/` 只放上游移植的内容，第三方技能与本仓库自写的技能不属于它。第二，构建期依赖不需要逐个署名，只有随包正文实质承载的强依赖才在 README 声明。

## 决定

**按来源分两棵树。** `pstack/` 是上游移植，由 `build:assets` 整棵重新生成，保持上游自己的相对布局。`skills/` 是所有非上游技能，不被重新生成，`vendored/` 必须有哈希与提交号，`authored/` 不能有哈希。清单在 `skills/sources.yml`。

```
pstack/
  skills/       55 个技能
  agents/       2 个 agent 人格
  docs/         guide 11 页、适配层副本、角色文件模板
skills/
  vendored/<来源>/<技能>/
  authored/<技能>/
  sources.yml
```

**`pstack/` 内部不重排。** 我试过把 guide 提到 `pstack/guide/`、适配层放到 `pstack/adapter/`，生成器的链接检查立刻报出 110 处失效：这些链接从 `docs/guide/` 指向 `skills/`，把任何一层挪动相对位置都会全部断掉。所以 `pstack/` 内部保持上游的 `skills/`、`agents/`、`docs/` 三分的形状，外部按来源分树，内部按上游分。

**`skills/sources.yml` 用两个键，删掉 `origin` 字段。** `vendored:` 与 `authored:` 各是列表，各自的字段在类型上必填。vendored 必须有 `repository`、40 位 `revision`、每文件哈希；authored 必须没有这些但有 `invocation`。原来一个 `origin` 字段要在检查里向两个方向各断言一次，现在文件形状本身说明适用哪条规则，列出错键的技能会因为解析出的路径不存在而被抓到。

**`runtime/` 改到 `.build/runtime/`。** 同名冲突靠改名消除，不靠注释解释。

**provider 收根列表。** `loadBundledSkillIndexes(skillsRoot, sourceRoot)` 改成 `loadBundledSkillIndexes(roots)`，每项带 `kind: "flat" | "sourced"` 与 `label`。根来自 `src/paths.ts` 的 `SKILL_ROOTS`，所以"技能从哪来"只有一个答案。

**署名范围。** README 只声明两个来源：上游 pstack（Lauren Tan，MIT）与 mattpocock/skills（Matt Pocock，MIT）。`commander` 这类构建期依赖不逐个署名，与其余 `devDependencies` 一致。

## 备选方案

- **只把 `assets/` 改名 `pstack/`，其余不动。** 放弃。这满足"收拢"的字面要求，但缺陷一到三原样保留，`skills-ext` 的双生命周期也没解决。
- **`pstack/` 内分 `generated/`、`adapter/`、`authored/`、`vendored/` 四个子目录。** 放弃。这是第一版方案，运营者的修正把它否掉了，而且它本身有问题：`pstack/` 一旦同时装上游产物和本仓库文本，"这个目录是纯生成物"就不再成立，而这条性质正是第三方树被构建删掉那次事故的修复所依赖的。
- **非上游技能拆成两个顶层目录 `vendored/` 与 `authored/`。** 放弃。可行，但"哪些技能不是官方的"要读两个目录。合成一个 `skills/` 下两个子目录，规则可以一句话说完。
- **`pstack/` 内部也按功能重排（guide 提到顶层、适配层单独放）。** 实测放弃。110 处相对链接会断，需要新增一张链接改写表来补偿，用一张表换一个目录次序不值得。
- **适配层不复制，让技能直接链到 `docs/harness/dsh.md`。** 放弃。`docs/` 不进发布包，装好的包里这个链接是死的。
- **保留 `skills-ext`，只改名。** 放弃。名字不是缺陷的成因，两种生命周期共用一棵树才是。
- **把 `commander` 留在 `vendor/` 并补一份许可声明。** 放弃。补许可消不掉"不在 lockfile、靠手抄版本号"这条，也消不掉一个只为一个依赖存在的顶层目录。这项工作留给后续的 P4。

## 后果

读者问"移植在哪"答案是 `pstack/`，问"哪些技能不是官方的"答案是 `skills/`，问"随包发布什么"看 `package.json` 的 `files`。顶层 tracked 目录从 10 个降到 9 个。`src/paths.ts` 成为路径的唯一来源。`runtime/` 与 `scripts/runtime/` 不再同名。

代价三条。第一，这次移动涉及 168 个文件，评审要看 `git diff -M`。第二，`pstack/docs/harness/dsh.md` 里两处自指路径必须随移动一起改，所以它不是纯字节移动，这条差异单独列在等价证明里。第三，`skills-ext` 会留在 3 条历史决策记录里（`2026-10-27-third-party-skills.md`、`-skills-ext-outside-assets.md`、`-local-skill-source.md`），按 `AGENTS.md` 不改写，由本记录承接。

## 附：验证

- `node scripts/sync-upstream.ts --check` 从 `pstack/` 逐字节重建成功：55 个技能、2 个 agent、11 页 guide、142 个文件。
- 一次性脚本对 HEAD 逐个比对内容哈希：142 个移植文件与 5 个技能文件全部字节相同，唯一允许的差异是适配层那两处路径字符串。脚本在 `.audit/` 下，属于临时证据，不进仓库。
- 干净 clone 中 `pnpm run check` 的六段全绿，417 个用例通过。
