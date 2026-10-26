# 决定：发版用 bumpp + main 的 reusable workflow，发布门留在 prepublishOnly

Status: accepted
Date: 2026-10-26

## 背景

`main` 分支的发包方式是 15 行：一个 `v*` tag 触发器，加 `sxzz/workflows` 的 reusable release workflow，`build` 输入只有 `git submodule update --init --recursive`。版本号由 `bumpp` 推进。当前分支重写后没有搬过来，于是 tag 推上去没有任何自动化。

搬过来时有两处不能照抄，都是本分支的发布链与 main 不同导致的：

1. **`prepublishOnly` 的门比 main 重。** main 的 `prepare` 只是 `vp pack`；本分支的 `prepublishOnly` 是只读 `check` 全家加重新打包加 `check:pack`。
2. **`runtime/` 与 `dist/` 都被 `.gitignore` 忽略，而发布门依赖它们存在。** `check:runtime` 缺目录时报告每个产物 `missing`；`check-pack` 的单元测试读 `dist/`，缺目录时 `expectedTarball()` 推不出条目。实测：全新 clone 直接 `pnpm publish --dry-run`，`prepublishOnly` 退出 1。

还有一处命名问题。本分支上一版把发版前的校验命令叫 `release`（`check && build:bundle && check:pack`），发版命令叫 `bump`——而 `release` 在 main 和多数 npm 项目里正是"发一个版本"的意思。名字与实际动作相反。

## 决定

workflow 结构与 main 一致，只在 `build` 输入里补两条本分支必需的构建：

```yaml
build: |
  git submodule update --init --recursive
  pnpm run build:runtime
  pnpm run build:bundle
```

版本推进用 `bumpp`，脚本名 `release`，与 main 同名同义。这条改动推翻了[构建与校验命令决策](2026-10-26-build-and-check-commands.md)里 `"release": "check && build:bundle && check:pack"` 这个名字，理由见下面备选方案第一条：一个叫 `release` 却只跑校验的命令，读起来就是"发版"，实际不发版。

发布门因此没有自己的名字，它只在 `prepublishOnly` 里写一次：

```jsonc
"prerelease": "pnpm run check",
"release": "bumpp",
"prepublishOnly": "pnpm run check && pnpm run build:bundle && pnpm run check:pack"
```

`prerelease` 是 `release` 这个**自定义脚本**的 pre 钩子，靠 npm 的 pre/post 通用规则触发，不是 npm 内置的发布生命周期。两个钩子覆盖互不重叠的入口，实测结论：

| 入口 | 触发 `prerelease` | 触发 `prepublishOnly` |
|---|---|---|
| `pnpm run release` | 是 | 否 |
| `pnpm publish`（CI 的 `pnpm -r publish` 同） | 否 | 是 |

所以在临时包上验证过：`publish` 只跑 `prepublishOnly`、`prepack`、`prepare`，`prerelease` 不出现。`bumpp` 内部调用 `preversion` / `version` / `postversion`，也不经过 `release` 脚本。**门的主入口是 `prepublishOnly`**，`prerelease` 只是把同样的检查提前到改版本号之前，让失败早一步出现，代价是多跑一遍 `check`（约十几秒）。

**`build` 步骤不用 `pnpm run build`。** 它多出的 `build:assets` 会重写 tracked 的 `assets/`，之后 `check:assets` 的字节比对拿刚写出的树当基准，等于自己校验自己。`build:assets` 是开发时从源码重建生成树的命令；CI 里要的是"提交的 `assets/` 能不能由源码重建"，那要求 `assets/` 保持提交时的样子。这条与[构建与校验命令决策](2026-10-26-build-and-check-commands.md)里"`check` 不写任何 tracked 文件"是同一个理由，本次只是把它落到 CI 配置上。

认证用 OIDC（`id-token: write`），不引入 `NPM_TOKEN`。`main` 用的 reusable workflow 本来就声明了这个权限，所以维持原样即为无长期密钥方案。

## 备选方案

- **照抄 main 的 15 行，`build` 只留 submodule 初始化。** 放弃：实测在干净 clone 上直接失败，`check:runtime` 报 10 个 `missing`，`check-pack` 的 5 个测试用例报错。这不是"更简单"，是一个跑不通的 workflow。
- **`build` 用 `pnpm run build`，一条命令搞定。** 放弃：它会重写 `assets/`，把 `check:assets` 的字节比对变成同义反复。少写两行换来一个永真的门，属于把绿灯做出来而不是把问题修掉。
- **不用 reusable workflow，自己写完整 job。** 放弃：`main` 已经在用的那条 workflow 覆盖了 setup、changelog、publish 三步，且 `0.1.0` 那次失败在认证而不是在这套结构上。重写一遍要重新解决 changelog 生成、`pnpm -r publish` 参数、OIDC 权限声明，收益只有"不依赖外部仓库"。
- **保留旧命名：`release` 是校验门，`bump` 是发版。** 放弃：`release` 在 main 分支和绝大多数 npm 项目里指的正是"发一个版本"，把它安在一条只读校验命令上，每次都要先解释"release 不发版"。`bump` 也不比 `release` 更准——它做的不止是 bump，还提交、打 tag、推送。两个名字里只能有一个叫 `release`，给它真正做那个动作的命令。
- **加一个 `check:release-tag` 门，断言 tag 与 `package.json` 版本一致。** 放弃（本轮先不加）：`bumpp` 用刚写好的版本号生成 tag，正常路径不会漂移；手推 tag 是异常路径，且 `pnpm publish` 遇到版本已存在会直接报错，失败形态并不隐蔽。真出现这个问题再加，比现在预料所有用法便宜。
- **把发布门做成一个具名脚本（如 `check:release`），`prepublishOnly` 调它。** 放弃：那就回到"两个名字指同一件事"的老问题，而且会诱使人在本地跑 `check:release` 以为自己在发版。门只写一次在 `prepublishOnly` 里，`pnpm publish` 是唯一入口，没有第二个名字可混淆。
- **把门的正式位置从 `prepublishOnly` 换成 `prerelease`。** 放弃：`prerelease` 只在 `pnpm run release` 时触发，`pnpm publish` 根本不运行 `release` 脚本，CI 的 `pnpm -r publish` 同理。换过去等于唯一真正上传的路径不跑门，而且它失败得静默——门看起来还在，检查再也不会发生。两者不是替代关系，各覆盖一个入口，所以两个都留。
- **用 `NPM_TOKEN` secret 而不是 OIDC。** 放弃：多一个可泄漏、需轮换的长期凭据，而 reusable workflow 已经声明了 `id-token: write`。

## 后果

得到：`pnpm run release` 与 main 分支语义一致，一条命令完成"改版本号、提交、打 tag、推送"，行为符合名字。发布门留在 `prepublishOnly` 一处，本地 `pnpm publish` 与 CI 的 tag job 不可能走不同的门，也没有第二个名字可以只跑一半。没有长期 npm 凭据。

代价：`release` 会真的写 `package.json`、提交并推送 tag，不能在开发目录里随便试跑——想只验证就得上干净 clone 走 `pnpm publish --dry-run`。另外 `release` 不再包含打包，`dist/` 的产出改由 `prepublishOnly` 负责，所以"跑完 release 就有可安装的包"不成立，发布链上只有 `pnpm publish` 会打包。

代价之四：`pnpm run release` 现在要跑两遍 `check`——`prerelease` 一遍，上传时 `prepublishOnly` 里再一遍。这是刻意的冗余：前者让版本号在门失败时不被改动，后者保证真正上传的那次是绿的。~十几秒的重复换取"改坏版本号"和"未验证上传"两件事都不发生。

代价之二：这条改动了已 accepted 的[构建与校验命令决策](2026-10-26-build-and-check-commands.md)里的命令名。按 AGENTS.md，被推翻的决定新写记录并链接旧的，旧记录不改写——旧记录里 `"release": "check && build:bundle && check:pack"` 那段保留原样，读的时候要知道它已被本文取代。

代价之三：workflow 依赖外部仓库 `sxzz/workflows@main`，它的 `main` 变动会直接进入本仓库的发布路径——这是沿用 main 的既有选择，本次没有改变，但也没有加版本钉住。另外 npm 侧的 Trusted Publisher 需要人工配置一次，配置之前 tag 推送会失败在上传步骤，且失败信息是认证错误而非构建错误，容易误判。

重新考虑的条件：`sxzz/workflows@main` 出现与本仓库不兼容的改动时，应改为钉 commit 或自己写 job。发布门里再出现"需要先构建某个 gitignored 目录"的新前置时，`build` 步骤要同步补，否则 CI 会以门失败的形式故障，而不是以缺文件的形式。
