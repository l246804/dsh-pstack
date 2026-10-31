# 决定：新增 playground 做真实插件运行测试，开发期所有测试统一在 playground 内运行

Status: accepted
Date: 2026-10-30
Scope: playground/**, .agents/skills/**, AGENTS.md, vite.config.ts, pnpm-workspace.yaml, package.json, skills-lock.json
Implemented-by: commit:a8a74d4f146d0de4f7a3e83250742b7f034c9766
Review: 2027-04-30

## 背景

`tests/` 的 vitest 用 mock 宿主契约验证插件公共行为，覆盖不到真实运行面：插件配置页的渲染与交互、推荐插件页的状态与一键启用、真实会话里 `pstack_skill` / `pstack_subagent` 的派发与路由，只有跑在真实 DSH 进程里才能观察。此前的真实安装验证是散落在 `.tmp/dsh-home*` 的一次性脚本：没有固定端口（曾撞 `127.0.0.1:3080` 报 `EADDRINUSE`）、profile 不可复现、DSH home 与凭据靠手记，结论无法沉淀。这些分散环境让验证既不可复现，也无法沉淀成开发期的统一入口。

约束：

- 真实测试必须在真实 DSH profile 里跑，不能退回 mock。
- 能用 `dsh` 命令判定的配置正确性、截图/视觉与不涉及模型的 UI 交互可以由 agent 自动化（agent-browser + 回读文件/日志）；真实会话涉及用户所选模型/路由，必须由用户操作并确认，agent 不代跑，只读会话日志佐证。
- **playground 是开发期唯一的真实运行测试环境**：所有验证——包括能用 `dsh` 命令直接判定的那一层——都必须在 playground 内（`DSH_HOME=playground/.dsh`、`playground/` 的 profile、`start.mjs` 起的 17353 实例）跑；不得在宿主环境另建临时测试环境（宿主 `~/.dsh`、`.tmp` 下的一次性 home/profile 等）。
- 启动端口固定且极不常用，避免与其他服务/软件冲突；不得回退 `--port 0`。
- 端口 `17353` 被占用时属于需要用户决策的事件：先判断占用者是否已是用户手动启动的 playground；是则沿用，不是则先向用户确认「中止任务还是换端口」，确认前 agent 不得自行改端口。
- DSH home 定位在 playground 内且不提交；只提交基于随附 `web` 复制后改造的可移植 profile，该 profile 在每个环境 setup 后都能正常启动。

## 决定

仓库根新增 `playground/`：提交 `profile/`（由 `dsh --from-default-profile web` 复制后改造的最小可跑 profile，bundles 为 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` + `dsh-pstack`）、`start.mjs`、`README.md`、`package.json`（vite-plus 子包 `@internal/playground`，加入 `pnpm-workspace.yaml`）；运行期 DSH home 放 `playground/.dsh/`，由 `playground/.gitignore`（内容 `.dsh/`）忽略，不进版本库。开发期的真实运行测试一律以该 profile / home / 实例为唯一环境。

- 端口固定 `17353`：当前机器实测空闲、不在 `/etc/services`、避开 Linux 临时端口段 `32768–60999` 与 3080/8080/5173/8317 等常用端口；`start.mjs` 以单一常量传 `--port 17353 --host 127.0.0.1`，冲突时让 `dsh` 以 `EADDRINUSE` 失败，绝不改用 `--port 0`。被占用时由 agent 先探测是否已有 playground 实例（profile 刚被 `start.mjs` 同步、`dsh web` 有响应）：是则沿用、不抢占；不是则先向用户确认「中止任务还是换端口」，确认前不得换端口。该规则同时写入根 `AGENTS.md` 与 `playground/AGENTS.md`，README 保留人类说明。
- 机器相关配置只注入 gitignore 的 home 层：`setup.mjs` 把 `~/.dsh/.credentials.yaml` 复制到 `playground/.dsh/.credentials.yaml`，并把模型 provider/默认模型等写进 `playground/.dsh/cordis.patch.yml`（home 级 patch，叠加在每个 profile 之上）；`profile/` 不含绝对路径、本机 endpoint 或凭据，保证跨环境可启动。
- `start.mjs` 每次启动前负责：建 `playground/.dsh`、把 `profile/` 覆盖成 `$DSH_HOME/profiles/<名>`、以 `link:<仓库根>` 注入 `dsh-pstack` 依赖、复制宿主 `~/.dsh/.credentials.yaml`、从宿主 `~/.dsh/profiles/web/cordis.patch.yml` 重新生成 `agent-default-model`/`llm-pi-ai` 的 home patch；依赖缺失时才安装。宿主模型/provider 更新后 playground 每次启动自动跟随，不会用旧或不支持的模型启动。
- `playground/` 是 vite-plus 子包 `@internal/playground`（`playground/package.json`，加入 `pnpm-workspace.yaml`）；启动命令配在根 `vite.config.ts` 的 `playground` / `playground:reset` / `playground:reinstall` task，用 `vp run playground` 启动，不直接依赖 `node` 命令。
- 验证不内置断言脚本：playground 只负责启动与 profile；需要判定配置时，使用者在终端直接运行 `dsh` 命令，仅把 `DSH_HOME=playground/.dsh` 与 `--profile <名>` 指向 playground。不把插件当前提供的工具、preset 或配置页内容写死进脚本——插件演进会让写死的断言过期，且不属于测试场职责。
- 视觉验证工具 `agent-browser` 作为根 `devDependencies`（`catalog:browser`）声明，并在根 `package.json` 的 `skills` 里以 `npm:agent-browser` 声明其技能；`vp install` 的 `prepare` 把它同步到 `.agents/skills/agent-browser`。`playground/browser.mjs` 封装沙箱需要的 `--no-sandbox`、可写 HOME/XDG 与 Chrome 路径。
- 验证分三层：① 命令层——终端直接对 playground 跑 `dsh` 命令；② 视觉/交互层——agent 用 `playground/browser.mjs` 打开带 token 的 17353 URL，截图并读 body text/console，用 click/fill/type/press 驱动角色保存/重置与推荐插件开关/启用，随后回读 `$DSH_HOME/pstack-models.mdc`、profile `package.json`、plugin-manager 日志；③ 真实会话层——由用户操作并确认（用户所选模型/路由可能不同），agent 读 `playground/.dsh/sessions/**/session.v4.jsonl.zstd`（`zstdcat`，取最新 session）核对 prompt、`pstack_skill`/`pstack_subagent` 调用、子会话与返回作为佐证。视觉效果由用户看截图确认。

## 备选方案

- 继续用 `.tmp/dsh-home*` 的一次性脚本。不选：无固定端口（已发生 `EADDRINUSE`）、不可复现、profile 与凭据处理无沉淀，且 `.tmp` 本就该是临时区。
- 把真实测试也塞进 vitest。不选：mock 宿主覆盖不到真实进程内的页面渲染、交互与子代理派发，而这正是本项要补的空白。
- 保留独立 `setup.mjs` 只在首次准备 home/profile。不选：宿主模型/provider 更新后 playground 不会刷新，可能用旧或不支持的模型启动；改为每次 `start.mjs` 启动前同步。
- 命令可判定的检查留在宿主环境临时新建 DSH_HOME / 一次性 profile 去跑。不选：测试环境再次分散、不可复现，且与「playground 为开发期唯一测试环境」直接冲突；命令层与交互层必须落在同一个 playground 上，证据才可对照。
- 内置 `verify.mjs` 对插件内容（工具行、preset、配置页元素）做断言。不选：等于把插件当前实现写死进测试场，插件一变就失效，也混淆了「环境」与「断言」的职责；验证改为在终端直接跑 `dsh` 命令。
- 提交忠实复制当前 `~/.dsh/profiles/web` 的 profile。不选：含第三方/实验 bundle 与本机 `127.0.0.1:8317` 模型配置，换环境起不来，违背「每个环境都能启动」。
- 只做仓库内静态检查（`--dump-config` 之类）。不选：命令只能判配置正确性，判不了 UI 效果与真实会话行为。
- 把真实会话也交给 agent-browser 驱动并自证。不选：不同用户选择的模型/路由可能不同，真实会话结果必须由用户确认，agent 代跑无法代表用户口径；agent 只读会话日志作佐证。
- 真实会话结论只靠会话日志、不经用户确认。不选：日志能核对调用与返回，但无法确认用户所选模型是否符合预期；结论仍需用户确认。
- 只在 `playground/README.md` 说明端口占用处置。不选：README 不进 agent 上下文，agent 不会据此行动；长期规则须进决策记录与 `AGENTS.md`。
- 只写 `playground/AGENTS.md`。不选：嵌套指令文件仅在会话 cwd 进入 playground 或 agent 读写该目录文件后才加载，只跑 `vp run playground` 的 agent 看不到；根 `AGENTS.md` 才是必载保障。
- 端口被占用时自动改用备用端口。不选：违反固定端口基线，且可能与用户已手动启动的实例抢端口。
- 端口被占用时一律报错中止。不选：用户可能已经手动启动，一律中止会把正常用户实例当成冲突。

## 后果

- 真实运行测试有了唯一、可复现入口：固定端口、独立 home、可移植 profile，不再依赖个人手工环境。
- 开发期不再在宿主 `~/.dsh` 或 `.tmp` 下新建测试用 home/profile；终端 `dsh` 命令检查与交互验证都在 playground 上完成，证据可对照。（`tests/` 的 vitest 仍属单元测试，不是真实运行环境。）
- 命令层由使用者/agent 在终端直接跑 `dsh` 命令判定（不内置脚本）；截图/视觉与不涉及模型的 UI 交互由 agent 用 `playground/browser.mjs`（agent-browser）自动跑并回读文件/日志；真实会话涉及用户所选模型，由用户操作并确认，agent 读 `.dsh/sessions` 的 session 日志佐证。playground 只保证环境与 profile 一致，不对插件当前内容作断言。
- 每次启动重写 home 层模型配置：宿主模型/provider 更新会传导到 playground，因此不要手改 `playground/.dsh/cordis.patch.yml`，改宿主 web profile。
- `playground/.dsh` 会持有 sessions/logs/credentials 与 `node_modules`，必须持续被忽略；`start` 首次安装依赖的 pnpm 会写默认 store home，若在沙箱下不可写，按 [pnpm 默认 store home](2026-10-30-pnpm-default-store-home.md) 申请提权或由你执行，不得改用项目内 store。
- 依赖本仓 `dist/` 产物：改插件后需 `vp run build` 再重启 playground；若将来需要热更新，另行评估。
- 端口占用成为需用户决策的事件：agent 只做探测与询问，不擅自换端口或杀用户进程；用户已启动的 playground 可被沿用。
