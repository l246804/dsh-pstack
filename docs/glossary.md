# 术语表

只收录代码里已出现、且叫法不统一就会分歧的词。新增概念时在此补一条。

## 生成树（generated tree）

`pstack/pstack/`：`generate` 从 `upstream/cursor-plugins/pstack` 加覆盖层渲染出的整棵树；每次构建整棵重建，生成结果提交进 git，`generate --check` 用它比对漂移。
反例：`pstack/` 是整个工作区（含源码与配置），不要把它叫“生成树”。

## 覆盖层（overlay）

`pstack/overlay/` 与 `overlay.yml`：手写文件按路径镜像生成树、替换上游同名文件；`overlay.yml` 记 `replaces`、`revision`、`sha256`，`verify:overlay` 在渲染前核对哈希，不符就构建失败。
反例：不要把 `pstack/pstack/` 里已生成的结果叫作“覆盖层”。

## 随包内容（shipped payload）

`dist/`：根 `vp pack` 的发布产物（`index.mjs`、`pstack/`、`skills/`），被 `.gitignore` 忽略，npm 只发它和 `assets/`、`cordis.patch.yml`。
反例：不要叫它“构建树”或“源码”。

## 运行时（runtime）

`pstack/runtime/skills/<技能>/scripts/**` 的脚本源码，编译为 mjs 后经 `replace:scripts` 替换随包树里上游附带的脚本。
反例：不是泛指“运行环境”；指本仓这份脚本源码及其编译产物。

## 上游（upstream）

`upstream/cursor-plugins`（生成树来源）与 `upstream/deepseek-harness`（DSH 宿主参考）两个 git 子模块。
反例：上游 ≠ 生成树；生成树是上游经渲染后的结果。

## 本地扩展（local extension）

上游 pstack 未声明、由 DSH 版插件独立维护的产品能力；在 `docs/extensions.md` 以 `EXT-*` 编号登记需求、DSH 依赖与验收，区别于 README 中的上游移植能力。

反例：不要把 Cursor 已有但 DSH 尚未完整覆盖的移植缺口叫作本地扩展。
