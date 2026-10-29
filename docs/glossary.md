# 术语表

只收录代码里已出现、且叫法不统一就会分歧的词。新增概念时在此补一条。

## 生成树（generated tree）

`pstack/pstack/`：`generate` 从 `upstream/cursor-plugins/pstack` 加本地 harness 适配树 `pstack/harness/` 渲染出的整棵树；每次构建整棵重建，生成结果提交进 git，`generate --check` 用它比对漂移。
反例：`pstack/` 是整个工作区（含源码与配置），不要把它叫“生成树”。

## 本地适配树（local harness tree）

`pstack/harness/`：DSH 宿主适配文档，按生成树相对路径镜像；主适配器 `docs/harness/dsh.md` 替换上游 `claude-code.md`，其他上游 harness 附件保持上游相对路径与文件名。只承载适配文档，不改写上游页面、技能、playbook、reference。
反例：不是覆盖层，不能整份替换上游正文；生成树里的结果也不叫“本地适配树”。

## 随包内容（shipped payload）

`dist/`：根 `vp pack` 的发布产物（`index.mjs`、`pstack/`、`skills/`），被 `.gitignore` 忽略，npm 只发它和 `assets/`、`cordis.patch.yml`。
反例：不要叫它“构建树”或“源码”。

## 运行时（runtime）

`pstack/runtime/skills/<技能>/scripts/**` 的脚本源码，编译为 mjs 后经 `replace:scripts` 替换随包树里上游附带的脚本。
反例：不是泛指“运行环境”；指本仓这份脚本源码及其编译产物。

## pstack 工具（pstack tools）

根 `src/*.ts` 注册到 DSH 的模型可见工具：`pstack_skill`（按名加载隐藏技能）、`pstack_models`（只读模型目录）、`pstack_subagent`（按角色与 agent preset 委派）、`pstack_script`（运行随包 Node 脚本）。
反例：不是 pstack 上游技能里的 `Task`/`AskQuestion` 文本，也不是宿主标准工具。

## 代理预设（agent preset）

`cordis.patch.yml` 中以 `@deepseek-ai/dsh-agent-preset` 声明的 `poteto-agent`、`comment-sicko` 两个子代理人格与工具组合；`pstack_subagent` 的 `agent` 参数映射到 preset id，`general` 不挂 preset。
反例：不是上游的 `subagent_type` 值，也不是 `pstack_subagent` 的 `role`（模型路由）。

## 角色文件（role file）

`$DSH_HOME/poteto-models.mdc`：`/setup-pstack` 写入、`pstack_subagent` 每次委派重读的角色到 `provider/model [effort]` 映射；缺失表示全部角色继承父级路由。
反例：不是 DSH 的 `AGENTS.md`；也不是上游 Cursor 的 `pstack-models.mdc`，DSH 版文件名固定为 `poteto-models.mdc`。

## 上游（upstream）

`upstream/cursor-plugins`（生成树来源）与 `upstream/deepseek-harness`（DSH 宿主参考）两个 git 子模块。
反例：上游 ≠ 生成树；生成树是上游经渲染后的结果。

## 本地扩展（local extension）

上游 pstack 未声明、由 DSH 版插件独立维护的产品能力；在 `docs/extensions.md` 以 `EXT-*` 编号登记需求、DSH 依赖与验收，区别于 README 中的上游移植能力。

反例：不要把 Cursor 已有但 DSH 尚未完整覆盖的移植缺口叫作本地扩展。

## 审查 finding 状态（finding status）

技能审查工作文件中的 finding 状态：`open`（待修复）、`reopened`（重新打开）、`fixed-pending-review`（修复待复核）、`closed`（关闭）、`blocked`（需用户决策或缺少公共能力，不参与普通修复，汇总到 `阻断摘要`）。
