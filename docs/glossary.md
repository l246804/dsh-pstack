# 术语表

只收录代码里已出现、且叫法不统一就会分歧的词。新增概念时在此补一条。

## 生成树（generated tree）

`pstack/pstack/`：`generate` 从 `upstream/cursor-plugins/pstack` 加本地 harness 适配树 `pstack/harness/` 渲染出的整棵树；每次构建整棵重建，生成结果提交进 git，`generate --check` 用它比对漂移。
反例：`pstack/` 是整个工作区（含源码与配置），不要把它叫“生成树”。

## 本地适配树（local harness tree）

`pstack/harness/`：DSH 宿主适配文档，按生成树相对路径镜像；主适配器 `docs/harness/dsh.md` 替换上游 `claude-code.md`，其他上游 harness 附件保持上游相对路径与文件名。只承载适配文档，不改写上游页面、技能、playbook、reference。
反例：不是覆盖层，不能整份替换上游正文；生成树里的结果也不叫“本地适配树”。

## 运行期替代项（runtime replacement）

上游 Cursor 语境有、DSH 没有同名能力，但存在可执行替代，且该名字出现在随包技能、playbook 或 reference 的运行期步骤里的项，例如 `create-skill`（替代为 `writing-for-agents`）、`/loop`（替代为 `create_goal` 加 `schedule_create`）。主适配器 `dsh.md` 的 `## Local replacements` 逐行记录这些替代。
反例：不是平台排除（整类舍弃、没有替代），也不是纯审查台账里的缺口（`G-xx`）或插件内部实现（`PI-xx`）。

## 随包内容（shipped payload）

`dist/`：根 `vp pack` 的发布产物（`index.mjs`、各插件入口、`pstack/`、`skills/`），被 `.gitignore` 忽略；npm 发布它以及 `assets/`、`cordis.patch.yml`、`locale/` 与各语言 README。
反例：不要叫它“构建树”或“源码”。

## 真实插件测试场（playground）

`playground/`：开发期唯一的真实运行测试环境。提交的 `playground/profile/` 是从随附 `web` 模板复制后加入 `dsh-pstack` 的可移植 profile；运行期 DSH home 固定为 `playground/.dsh`（gitignore，不提交），启动端口固定 `17353`。`playground/` 是 vite-plus 子包 `@internal/playground`；`start.mjs` 每次启动前同步 profile、宿主凭据与模型配置并安装本仓插件，由根 `vite.config.ts` 的 `playground` task（`vp run playground`）启动。
反例：不是 `tests/` 的 vitest（mock 宿主的单元测试）；也不是宿主 `~/.dsh` 或 `.tmp` 下的一次性测试环境。
