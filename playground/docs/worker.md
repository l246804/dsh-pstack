# Worker 运行说明

本文说明 worker 的隔离环境、prepare/bootstrap/run/stop 行为、就绪缓存和证据目录。阶段和批次规则见 [workflow.md](./workflow.md)。

## 隔离运行环境

一个 worker 有一套独立运行环境：

- repo 内状态：`playground/.workers/<treatment>/<environmentId>/w<k>`
  - home
  - browser profile
  - evidence
  - pid 和日志
- repo 外隔离工作区：`<isolatedRoot>/<treatment>/<environmentId>/w<k>`
  - 被测会话工作区
  - raw 资源挂载

`isolatedRoot` 默认使用系统临时目录，可用 `PLAYGROUND_WORKSPACE_ROOT` 覆盖。沙箱只限制写，不限制读，因此工作区和挂载路径都不能暴露仓库根。

- prepare 为每个 worker 写结构化 `$DSH_HOME/AGENTS.md` 读取边界。
- prepare 为每个 worker 写入 `$DSH_HOME/pstack-models.json`，内容从 `playground/config.json` 的 `roleModels` 提取。该角色文件是唯一允许读取的 worker home 运行时输入。
- scenario workspace 初始化本地 `git init`，不设置 origin。
- worker 不携带 Git/GitHub 凭证。

## 直接预览

需要手动打开 adapted worker 的 Web URL 查看插件效果时：

```sh
vp run playground:open
```

该命令固定启动独立的 `adapted/preview` 环境 w0，worker 目录为 `.workers/adapted/preview/w0`。它只启动 Web 服务并输出 URL，不打开浏览器、不处理 preview notice、不截图、不写 readiness。关闭该 worker 使用：

```sh
vp run playground:close
```

`playground:open` 不会执行 reset。需要从零重建预览 worker 时使用：

```sh
vp run playground:reset
```

该命令会停止并重建 `adapted/preview` worker，不需要先执行 `playground:close`。

## 准备和运行

- `prepare` 构建 worker home/profile，启动 Web，并检查 URL 可达性。
- `bootstrap` 打开每个 worker 页面，检查 preview notice、默认 workspace、model/provider/name、reasoning effort、登录/401 状态，并截图 `ready.png`。
- `bootstrap --all` 检查该环境全部 worker；全部通过后写环境级 `bootstrap-ready.json`。
- 同一 `treatment/environment` 已有 `bootstrap-ready.json` 时，后续 `bootstrap` 直接通过。
- 单 worker `bootstrap --worker <k>` 只校验该 worker，不写环境总标记。
- `prepare --reset`、`prepare --reuse` 或 `stop` 会清除该环境的 `bootstrap-ready.json`。

## 单场景调试

完整 prepare/bootstrap/run-batch/collect 命令见 [workflow.md](./workflow.md)。单场景调试时，在准备和 bootstrap 完成后使用：

```sh
vp run playground:run -- --worker 0 --environment base --treatment native --scenario <capability-probe-id>
vp run playground:run -- --worker 0 --environment base --treatment adapted --scenario <capability-probe-id>
```

## 外部停止

任务运行超过 10 分钟时，读取该 worker 最新的 session 文件，判断是否仍在产生有效 assistant/tool 事件。确认空转、漂移或无效推进后执行：

```sh
vp run playground:stop-task -- --treatment native --environment base --worker <N>
```

`stop-task` 只写停止请求；`run-case` 在下一个轮询点保存当前截图和会话证据，写一条 `blocked` record，然后 `run-batch` 继续派发后续任务。不要用 `playground:status` 的进度摘要替代 session 文件判断。

## 证据与快照

RunRecord 的身份是 `scenarioId + treatment + environmentId`。记录包含：

- 实际 DSH 版本
- pstack 版本（`port/baseline.json` 固定值）
- 安装版本
- 实际模型路由
- 上游 revision
- 配置 hash
- 会话事实
- 工具调用统计（含首次是否成功、重试/失败/恢复）
- 产物和裁决

密钥只用于进程环境，不进入记录。

`run-case` 在 worker evidence 目录写机械脱敏后的 `record.json`，并写本地 `record.source.json`，只用于 `collect` 定位原始截图和 session。`record.source.json` 不提交。

`collect` 读取 worker 的脱敏 RunRecord，并从 `record.source.json` 复制证据到 `reviews/<treatment>-<environment>/scenarios/<scenario>/<treatment>-<environment>/`。每个目录保存 `record.json`、`screenshot.png`；`session.jsonl.zstd` 只保留本地。

`manifest.json` 记录当前快照的 `treatment`、`environment`、`dshVersion`、`pstackVersion` 和 `scenarioIds`。根因问答按 treatment 手写到 `findings/<treatment>.md`。未出现在当前快照中的场景目录会被删除，`findings` 里的对应问答也要清理。

`--only-failed` 在 native 只选择 gap，在 adapted 只选择 not-verified。blocked、unobserved 和 inconclusive 需要显式选择或人工处理，不自动重试到变绿。
