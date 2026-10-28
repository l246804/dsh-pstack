# 决定：第三方技能树移到 `assets/` 之外，并让生成器拒绝非生成物

Status: accepted
Date: 2026-10-27

## 背景

[第三方技能决策](2026-10-27-third-party-skills.md)把 vendored 技能树放在 `assets/skills-ext/`。那个位置在第一次真正跑 `pnpm run build:assets` 时把它删掉了：生成器先在 `.assets-staging/` 建好整棵新树，再 `rename` 盖到 `assets/` 上，而 vendored 树不是生成物，所以随旧目录一起消失。没有报错，唯一的信号是事后 `git status` 里的两个 `D`。

这不是写入顺序写错了。仓库早就定过 `assets/` 的性质：[静态资源决策](2026-10-26-static-resource-directory.md)第 16 行写着"`assets/` 保持纯生成树"，并为此专门建了 `assets/` 放手工内容。`skills-ext/` 是 `assets/` 里唯一一处不是生成物的东西，它违反了那条规则，`rename` 只是把一直存在的矛盾暴露出来。实测数字：`buildAssets()` 产出 142 个文件，磁盘上 144 个，多出的 2 个正是 vendored 树。

同时，为了让这套结构能通过检查，代码里有 49 处 `skills-ext` 相关处理，其中三处是纯粹的豁免：`compareAssets` 跳过 `skills-ext/` 前缀、`checkUndeclaredFiles` 不覆盖这棵树、`checkAssetsHostCopy` 遇到它就 `continue`。**豁免的数量是分层错误的计量单位**：生成器需要替一棵不归它管的树背书，说明这棵树站错了位置。

用户提出的方向是：插件最终有两种能力，一是移植上游 pstack，二是三方技能用于补缺与强化。这两类内容的生命周期不同，而生命周期不同的东西共用一个会被整体替换的父目录，是结构问题而不是偶发事故。

## 决定

1. **把树移到仓库根 `skills-ext/`**，作为 `assets/` 的兄弟目录，用 `git mv` 保留历史。布局仍是 `skills-ext/<来源>/<技能>/`，来源、哈希、同步流程全部不变。
2. **`package.json` 的 `files` 增加 `skills-ext`。** 这条是发布正确性问题，不是整洁问题：`files` 原来只列 `assets`，树一旦移出 `assets/` 就不再随包发布，而 provider 对缺失的源目录是"安静返回空表"，插件会照常启动、只是没有任何第三方技能。`checkPackageManifest` 因此把 `skills-ext` 加进必备项。
3. **`writeAssets` 在写入前加一道前置断言。** `assets/` 里只要出现生成器不产出的文件，`build:assets` 直接失败并点名该路径，提示移到兄弟目录，而不是静默删除。这是本次事故的真正修复：位置调整让同一故障无法再发生一次，而断言让它无法以别的形式再发生。
4. **删掉三处豁免。** `compareAssets` 的 `skills-ext/` 前缀跳过、`checkUndeclaredFiles` 的说明、`checkAssetsHostCopy` 的 `continue`。树不在 `assets/` 里之后，这些跳过不是"放宽"，而是不再需要：遍历根本到不了它。
5. **`checkLayout` 的顶层白名单回到 `skills`、`agents`、`docs`。** 加上 `skills-ext/` 之后它现在会正确报错，这正是想要的行为：`assets/` 只能有生成物。

## 备选方案

- **留在 `assets/skills-ext/`，把 `writeAssets` 改成"删除前先备份非生成物"。** 放弃：那是让生成器承担一项它不该有的职责。它的语义是"这个目录等于一次全新构建"，一旦要它分辨哪些文件该保留，这个语义就没了，`--check` 的逐字节比对也不再等价于"提交树可由源码重建"。而且备份文件放哪里、什么时候清理，会带出一串新的边缘情况。
- **留在 `assets/skills-ext/`，写入时把这棵子树挪开再挪回来。** 放弃：和上一条同源，只是把同样的职责藏在 `rename` 的两侧。它还能工作，但每次构建都要搬 2 个文件、将来 200 个，而且"构建期间目录短暂不完整"这件事会让并行跑 `check` 的 CI 出现竞态。
- **留在 `assets/skills-ext/`，只加前置断言。** 放弃：断言能挡住这一种事故，挡不住下一次。断言要求 `assets/` 只含生成物，而树在里面就意味着断言每次构建都必须对它破例；破例一多，断言就退化成又一处豁免。位置和规则必须一致。
- **把 vendored 技能改成由 `build:assets` 生成**（即从 `sources.yml` 复制进 `assets/`）。放弃：那要求生成器联网或者每次构建都能读到上游内容，而 `pnpm run check` 必须离线通过。`sources.yml` 只记哈希不存正文，正是为了离线。真要把正文也纳入生成，就得把上游内容整份提交进仓库，等于维护两份一样的文本。
- **用 `vendor/` 而不是新目录。** 放弃：`vendor/` 现在放的是 `commander` 这类构建期依赖（随包运行所需），与"随包发布的技能树"不是一类东西。混在一起会让"哪些是运行时依赖、哪些是技能内容"重新变得看不出来。

## 后果

`assets/` 现在真的只有生成物，`build:assets` 可以安全地整棵重写，第三方技能不再依赖"这个目录恰好不被替换"这个隐含前提。三处豁免变成真正的无关，`checkLayout` 的顶层白名单也回到三项。

代价有三条。第一，包结构多了一个顶层目录，读包的人要理解"`assets/` 是生成的，`skills-ext/` 是 vendored 的"，这条已经写进 README 与差异清单。第二，`package.json` 的 `files` 与之一处耦合，漏了不会报错只会缺功能，用 `checkPackageManifest` 守住了。第三，前置断言让"往 `assets/` 里手工放个文件快速试试"变成一次失败，这是有意的摩擦：那个文件活不过下一次构建，早失败比晚丢失好。

重新考虑的条件：如果第三方技能需要与 pstack 技能一起参与同一套 patch 改写（例如它们的措辞也要跟着宿主改），那它们就不再是"原样复制"，此时的位置与校验方式都要重定，那是一个新决定。

## 附：验证

- 把 `assets/__guardprobe.md` 放进去再跑 `build:assets`，生成器拒绝并点名该文件。
- 移除探针后正常生成 142 个文件，`skills-ext/` 内容与哈希不变（`pnpm run check:skills-ext` 通过）。
- provider 从新根目录加载到 `writing-for-agents`。
