# 工作区与会话流程

本文说明如何运行一个真实场景并保存证据。完整命令见 playground/README.md。

## 隔离运行环境

一个 worker 有一套独立运行环境。home、浏览器 profile、证据、pid 和日志在仓库内 `playground/.workers/<environmentId>/w<k>`，便于审计；被测会话的工作区和 raw 技能挂载在仓库外隔离根 `<isolatedRoot>/<environmentId>/w<k>`（默认 `os.tmpdir()/dsh-pstack-playground`，环境变量 `PLAYGROUND_WORKSPACE_ROOT` 可覆盖）。沙箱只限写不限读，所以 prepare 把 `playground/raw/generated` 整体复制到隔离根的 `raw` 挂载目录，raw profile 与常驻提示只引用该副本，工作区与挂载路径都不得暴露仓库根。environmentId 属于 RunRecord 的身份，不能只靠时间戳区分。

每个 worker 使用 `dsh --port 0`。prepare 从实际启动输出读取 URL 和端口。当前受管 web 生命周期只在 Linux 上运行。其他平台需要接入受管 DSH 进程，不能把未知 PID 当成 web 进程。

## 准备和运行

先运行 raw 生成器，再准备 raw 环境。raw 不能包含 dsh-pstack 或其他附加插件。standard preset 加 raw systemPrompt 提示提供与 poteto-mode 相同的常驻工作流入口。

```sh
vp run playground:raw-generate
vp run playground:prepare -- --phase raw --environment base --workers 1 --reset
vp run playground:bootstrap -- --worker 0 --environment base
vp run playground:run -- --worker 0 --environment base --phase raw --scenario poteto-help-smoke
vp run playground:collect -- --phase raw --environment base
```

adapted 重建自己的环境。它选择 poteto-mode preset，不再挂载 raw 提示。附加官方插件必须列在 EnvironmentMatrix 中。UI 插件开关属于环境矩阵，不是场景复制。

```sh
vp run playground:prepare -- --phase adapted --environment base --workers 1 --reset
vp run playground:run -- --worker 0 --environment base --phase adapted --scenario poteto-help-smoke
vp run playground:collect -- --phase adapted --environment base
```

run-case 在同一会话中顺序发送 Scenario 的所有自然语言 turns。每轮等待新的 turn/end。没有自动停止和隐藏超时。浏览器或会话日志不可读时记录基础设施未决，不自动重试。

## 证据和报告

RunRecord 的身份是 scenarioId、phase、environmentId。记录包含实际 DSH 版本、安装版本、实际模型路由、上游 revision、配置 hash、会话事实、产物和裁决。密钥只用于进程环境，不能进入记录。

可观察断言检查完成状态、产物和过程事实。语义审核另存状态、理由与审核者。pending 在 raw 是 unobserved，在 adapted 是 inconclusive。

collect 读取全部 worker 的 RunRecord。报告列出已运行、未运行和排除的场景。adapted 必须与 raw 对照自然语言、实际模型、上游 revision 和配置 hash。归档避免重复复制已归档文件。

`--only-failed` 在 raw 只选择 gap，在 adapted 只选择 not-verified。blocked、unobserved 和 inconclusive 需要显式选择或人工处理，不自动重试到变绿。
