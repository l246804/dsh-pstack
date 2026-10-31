# playground：真实插件运行测试场

开发期**唯一**的真实运行测试环境。`tests/` 的 vitest 用 mock 宿主契约验证公共行为；
凡是需要真实 DSH 进程才能观察的（bundle 配置模态框渲染与交互、推荐插件区状态、真实会话里
`pstack_skill` / `pstack_subagent` 的派发与路由），都在这里跑。

- DSH home：`playground/.dsh/`（`playground/.gitignore` 忽略，不进版本库）
- 自定义 profile：`playground/profile/`（提交；`web` 模板 + `dsh-pstack`，可移植）
- vite-plus 子包：`@internal/playground`（`playground/package.json`）；启动命令配在根 `vite.config.ts` 的 `playground` task
- 固定端口：`17353`（不常用、避开 Linux 临时端口段、绝不回退 `--port 0`）

## 先决条件

- `dsh` 在 `PATH` 上（当前基线 `0.2.2-alpha.2`），`pnpm` 可用。
- 仓库已构建：`vp install` 且 `vp run build`（`dsh-pstack` 的 exports 指向 `dist/`）。
- （可选）宿主 `~/.dsh/.credentials.yaml` 有模型登录，`~/.dsh/profiles/web/cordis.patch.yml` 有模型 provider。

## 启动（在仓库根执行）

```bash
vp run playground        # 每次启动前同步 profile/凭据/宿主模型配置，然后开在 127.0.0.1:17353
vp run playground:reset    # 删除运行期 profile 后重装依赖（改了 profile 或仓库路径时）
vp run playground:reinstall # 仅强制重装依赖
```

（底层是 `node playground/start.mjs`，task 定义在根 `vite.config.ts`。）默认端口固定 `17353`（硬性规定，不得自行换端口或改用随机端口）；被占用时先探测是否已是用户手动启动的 playground，非用户实例须先向用户确认「中止任务还是换端口」，确认后才可用 `PLAYGROUND_PORT=<另一个固定不常用端口> node playground/start.mjs` 临时避让。

每次启动都会：

1. 把 `playground/profile/` 覆盖到 `playground/.dsh/profiles/pstack-playground`，并以 `link:<仓库根>` 注入本仓 `dsh-pstack` 依赖；
2. 复制 `~/.dsh/.credentials.yaml` 到 `playground/.dsh/.credentials.yaml`；
3. 从宿主 `~/.dsh/profiles/web/cordis.patch.yml` 重新抽取 `agent-default-model`、`llm-pi-ai`，重写 `playground/.dsh/cordis.patch.yml`。

这样宿主模型/provider 更新后，playground 每次启动都会跟着更新，不会拿着旧或不支持的模型启动。
依赖只在 `node_modules/dsh-pstack` 缺失（或 `--reset`/`--reinstall`）时安装。
`.dsh/` 内的一切（home、node_modules、凭据、sessions、logs）都不提交。

> pnpm store 权限：首次安装依赖会写 pnpm 默认 store（在工作区之外）。若沙箱下不可写，
> 按 [pnpm 默认 store home 决策](../docs/decisions/2026-10-30-pnpm-default-store-home.md)
> 申请提权或自行执行，**不要**改用项目内 store。

## 验证（在终端直接对 playground 跑 dsh 命令）

playground 只提供启动与 profile；验证时直接用 `dsh` 命令，把 `DSH_HOME` 和 `--profile`
指向 playground，不另建环境：

```bash
export DSH_HOME="$PWD/playground/.dsh"
dsh --profile pstack-playground --dump-config         # 查看合成后的整棵配置树
dsh --profile pstack-playground --dump-config-schema  # 生成配置 JSON Schema（官方 web 模板本身也非零退出）
dsh --profile pstack-playground --help                # web app 参数（--port/--host 等）
```

不内置断言脚本：插件当前提供哪些工具、preset、配置模态框内容会随插件演进变化，写死进脚本会很快
过期；需要判定什么，就在终端按当时目标直接看 `dsh` 的输出。

### 验证方式：截图/视觉用 agent-browser，真实会话由用户确认

- **截图 / 视觉**：`node playground/browser.mjs '<token URL>' [--click 文本] [--out .tmp/x.png]`；
  body text 出现 `Failed to load plugins` 或 console 有 error（退出码 2）即失败。用户只需确认
  截图里的视觉/UX 是否符合预期。
- **UI 交互**（不涉及模型）：用 `playground/browser.mjs` 或 `node_modules/.bin/agent-browser`
  执行 click/fill/type/press，驱动角色保存/重置、推荐插件开关/一键启用；随后回读
  `$DSH_HOME/pstack-models.mdc`、profile `package.json`、plugin-manager 日志佐证。
- **真实会话（涉及模型选择）**：由用户操作并确认结果，agent 不代跑——不同用户选择的模型/路由
  可能不同，agent 无法替用户确认。用户操作后 agent 可读最新
  `playground/.dsh/sessions/**/session.v4.jsonl.zstd`（`zstdcat`）核对 prompt、
  `pstack_skill` / `pstack_subagent` 调用、子会话 id 与返回，作为佐证。

helper 封装沙箱需要的 `--no-sandbox`、可写 HOME/XDG 与 Chrome 路径，并把 open → 交互 →
console → screenshot 放在同一进程树（daemon 会随沙箱 shell 结束消失）。Chrome 优先用
`~/.agent-browser/browsers` 最新版，没有则先跑 `node_modules/.bin/agent-browser install`。

验证清单（`agent` = agent-browser 自动跑；`user` = 用户操作并确认）：

1. **配置按钮与模态框**（agent 截图，用户确认视觉）：Plugins → dsh-pstack bundle 页页头出现「配置」
   按钮；点击后打开仿 Settings 的居中模态框，左侧「推荐插件」/「角色配置」分区可切换；
   遮罩、圆角、关闭按钮与 Escape/遮罩关闭正常，详情页不再内联铺配置块。
2. **角色模型配置保存/重置**（agent 驱动，回读 `$DSH_HOME/pstack-models.mdc`；用户确认视觉）：模态框
   角色分区显示路径与状态、17 个角色；provider/model/effort 下拉可用；保存/重置后对应行更新或消失。
3. **中英文本**（agent 切换截图，用户确认视觉）：切换 en/zh，按钮、模态框与两区文案完整（含推理强度会浮动的说明）。
4. **推荐插件区**（静态状态 agent 截图；开关/一键启用 agent 驱动并回读 profile；用户确认视觉）：
   `OPT-01`..`OPT-09` 分组与 `enabled`/`off`/`missing` 状态正确；首次启用后的一次性 activation 提示出现。
5. **真实会话派发子代理**（user 操作并确认；agent 读会话日志佐证）：用户在 17353 的会话里发一个触发
   `pstack_skill` / `pstack_subagent` 的任务，确认隐藏技能加载、子代理按角色/preset 路由、effort 生效、子会话返回。

## 说明

- 改插件源码后需 `vp run build` 再重启 playground（当前无客户端热更新）。
- 端口冲突时 `start.mjs` / `dsh` 会直接失败，不会悄悄换端口；这是有意的。
