# 发布流程

本文写现在怎么做一次发布。为什么这样分层，见 [发布流程决策](decisions/2026-10-26-release-automation.md)。

## 一条命令

发版就是 `pnpm run release`。它和 main 分支同名同义：`bumpp` 交互选版本号、写 `package.json`、提交 `chore: release vX.Y.Z`、打 tag `vX.Y.Z`、推送。推送 tag 之后由 GitHub Actions 接手。

前面还有一道 `prerelease`，它只读不写，跑的是 `pnpm run check`。所以改版本号之前就已知门是否绿，不用等 bumpp 提交完才发现问题。

| 命令 | 做什么 | 写不写文件 |
|---|---|---|
| `pnpm run check` | 只读验证，不打包 | 不写 |
| `pnpm run release` | 先跑 `prerelease`（即 `check`），再改版本号、提交、打 tag、推送 | 写 `package.json`、写 git 历史 |
| `pnpm publish` | 自动跑 `prepublishOnly` 全门，含打包与 tarball 检查 | 写 `dist/`（gitignored） |

两个钩子覆盖不同的入口，都不多余：

- **`prerelease`** 挂在 `release` 这个自定义脚本上，靠 npm 的 pre/post 通用规则触发。只有 `pnpm run release` 会走到它。
- **`prepublishOnly`** 是 npm 内置的发布钩子，只有 `pnpm publish` 会走到它。

`prerelease` 不能替代 `prepublishOnly`：`pnpm publish` 不会运行 `release` 脚本，因此也不会触发 `prerelease`。实测在临时包上验证过——`publish` 只触发 `prepublishOnly`、`prepack`、`prepare`，`prerelease` 完全不出现。`bumpp` 内部调用的是 `preversion` / `version` / `postversion`，同样不经过 `release` 脚本。

所以门的主入口是 `prepublishOnly`，`prerelease` 只是把同样的检查提前到改版本号之前，让失败早一步出现。

## 发一次版

```bash
pnpm run release
```

`bumpp` 的默认行为已经够用：提交、打 tag、推送都开着，没有 `bump.config.ts`，也没有第二份版本号。推送之后：

1. `.github/workflows/release.yml` 在 `v*` tag 上触发，调用 `sxzz/workflows` 的 reusable release workflow；
2. 它的 `build` 步骤初始化上游 submodule，跑 `pnpm run build:runtime` 与 `pnpm run build:bundle`；
3. `pnpm -r publish` 触发 `prepublishOnly`，全门跑完才上传；
4. 上传成功后打 GitHub release，changelog 由 `changelogithub` 生成。

版本号只有 `package.json` 一处。`bumpp` 只改它，CI 的 tag 与它也隔着 `pnpm publish` 读取的同一个字段，没有第二份需要同步的版本号。

## 为什么 build 步骤不是空的

`runtime/` 和 `dist/` 都在 `.gitignore` 里，全新 clone 没有它们。而发布门里有两处需要它们已经存在：

- `check:assets` 的第一个前置是 `check:runtime`，它比较"仓库里的 `runtime/`"与"从源码重建的结果"，缺目录时报告每个产物 `missing`；
- `check-pack` 的单元测试读取 `dist/`，缺目录时 `expectedTarball()` 推不出应有的条目。

`pnpm run build` 能一次补上两者，但**不要用它**：它先跑 `build:assets`，会重写 tracked 的 `assets/`。之后 `check:assets` 的字节比对拿刚写出的树当基准，等于自己校验自己，`assets/` 与源码不一致这类问题就再也报不出来。所以 build 步骤固定为 `build:runtime` 加 `build:bundle`，只写两个 gitignored 目录。

`assets/` 在 CI 里始终是提交时的样子，`check:assets` 才真的在证明"提交的生成树可以由源码重建"。这条推论的完整理由见 [构建与校验命令决策](decisions/2026-10-26-build-and-check-commands.md)里"`check` 不写任何 tracked 文件"一段。

## 认证：OIDC，没有长期密钥

workflow 只声明 `id-token: write`，不读任何 `NPM_TOKEN`。npm 侧需要一次性配置 Trusted Publisher：

- 包：`dsh-pstack`
- 仓库：`l246804/dsh-pstack`
- workflow 文件名：`release.yml`

配好之后每次发布由 GitHub 签发短期 token 换取 npm 上传凭据，没有可泄漏的长期密钥，也不需要轮换。

**在配置完成之前，tag 推送会让 release job 失败在上传这一步。** 门是全绿的，失败形态是 `pnpm publish` 的认证错误，不是构建错误——看到那种报错先查 Trusted Publisher，不要怀疑产物。

`0.1.0` 之前两次 Release run 都失败在这里（第一次是 `ERR_PNPM_AUTH_TOKEN_EXCHANGE`，第二次是 `Failed to publish ... status 404 Not Found`），所以本仓库的 npm 侧配置目前尚未确认可用。

## 只验证不发版

`release.yml` 只接受 tag push，没有手动入口。要验证发布链而不发版，在本地模拟 CI 的顺序：

```bash
git clone --recurse-submodules https://github.com/l246804/dsh-pstack <dir>
cd <dir>
pnpm install --frozen-lockfile
pnpm run build:runtime
pnpm run build:bundle
pnpm publish --dry-run --no-git-checks   # 走 prepublishOnly 全门，不上传
```

关键是**干净的 clone**：在开发目录里跑，`runtime/` 和 `dist/` 早就在了，上面两条构建步骤缺一不可这件事看不出来。

不要在开发目录里用 `pnpm run release` 来验证——它真的会改版本号、提交并推送 tag。日常提交前的验证是 `pnpm run check`。

## 发布前的人工确认

自动化只覆盖静态门。以下仍然要人来看：

- `docs/release-verification-checklist.md` 里的 36 条行为级用例，一条都没执行。发布 announcement 不得把静态门写成"已验证"。
- README 的"支持的 DSH 版本"要与 `engines.dsh` 一致，`tests/release.test.ts` 断言了这一致性，但版本号本身要不要升是人决定的。
