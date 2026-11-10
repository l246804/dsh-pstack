---
name: playground-verify
description: 在一台全新机器上跑完整的 dsh-pstack playground 验证闭环，从环境准备、原始审核轮、修订后的回归轮直至收敛复跑。
disable-model-invocation: true
---

# 运行 playground 验证

驱动 playground 走完整个验证闭环，面对一个真实的 DSH Web 会话。它以一份审核报告收尾，报告里每条证据路径都真实存在。报告名不带阶段序号：待审批的审核报告是 `reports/skill-audit.md`，单次运行是 `reports/run-raw-<date>.md` 或 `reports/run-adapted-<date>.md`。

## 1. 一次性机器准备

这些步骤每台机器只做一次。当 `dsh` 在 PATH 中、`playground/config.json` 已填好、插件构建是最新时，整节跳过。只有依赖或插件源码变了才重新执行 `vp install` 与 `vp run build`。

1. `vp install`。
2. 按 `port/AGENTS.md` 把生成的目录树准备好，然后 `vp run build`。
3. 确认 `dsh` 在 PATH 中。
4. 把 `playground/config.example.json` 的内容复制到 `playground/config.json`，填入真实的供应商与 apiKey。每个需要它的脚本在缺失或为空时都会大声报错，且该文件被 git 忽略。

## 2. 每轮准备 worker

每轮都执行。worker 数量由机器检测得出，除非被覆盖。每个 worker 独占 `playground/.workers/w<k>/`，拥有自己的 DSH home、浏览器 profile、工作区根目录和证据目录，并从 `dsh --port 0` 绑定一个由操作系统分配的端口。不存在固定端口。

```sh
vp run playground:prepare -- --mode raw --reset
vp run playground:prepare -- --mode raw --reset --workers 6
```

## 3. 落地浏览器 profile

```sh
vp run playground:bootstrap -- --all
```

## 4. raw 轮

用短探针跑每一个可运行的技能用例，principle 用例 120 秒，behavior 用例 300 秒。探针会中止进行中的 turn，并把证据标记为 truncated。

```sh
vp run playground:run-batch -- --mode raw --all
vp run playground:status
vp run playground:collect -- --mode raw
```

collect 写出 `reports/run-raw-<date>.md`，并把本轮的证据归档到 `reports/evidence/<round>-<date>/` 下。每一行都写明它自己的归档证据文件。

然后写审核报告 `reports/skill-audit.md`，每个技能一节。每一节陈述上游能力以及当前状态与缺口，并留两个空行供操作者在审批时填写：建议的 dsh.md 适配和建议的插件工具。状态从待审批开始。不要预先填写这些建议。停在这里，把报告交给操作者逐节审批。用 `vp run playground:approve -- --skill <a>,<b> --round <n>` 记录每次审批，它写入该技能的审批字段，报告显示对应状态。

## 5. 审批后适配

对每个获批的节，填写并实现操作者建议的 dsh.md 适配和插件工具，然后构建可发布的插件。

```sh
vp run build
```

## 6. adapted 回归轮

第一个 adapted 轮会用刚构建好的插件重建 worker profile，同时保留 raw 证据。不要在第一个轮次传 `--reuse`，否则 worker 会保留旧的 raw profile。adapted 轮里 run-case 会在发送前于输入区选中 `poteto-mode` preset，让模型带上技能路由指令；raw 轮保持标准 preset。

```sh
vp run playground:prepare -- --mode adapted --workers 4
vp run playground:run-batch -- --mode adapted --only-failed
vp run playground:collect -- --mode adapted
```

后续轮次重启同一批 worker，不触碰 profile、工作区或证据。

```sh
vp run playground:prepare -- --mode adapted --reuse --workers 4
vp run playground:run-batch -- --mode adapted --only-failed --round 2
vp run playground:run-batch -- --mode adapted --skills <a>,<b>
```

`--only-failed` 读取各归档轮次中最新的证据，选出判定失败或运行以 infra error 结束的用例。`--skills` 把技能名映射到它们的用例。`--round` 设置写入进度的轮次。`playground/status` 和 `playground/.workers/progress.json` 里的进度携带轮次号。

逐个分类每个失败并采取行动。

- 实现缺陷：修实现，`vp run build`，重启受影响的 worker，重跑受影响的用例。
- 用例缺陷：改用例，更新 `cases.lock.json`，重跑该用例。
- 环境错误：自动重试一次；若再次失败，深入排查。
- 真实遗留：把原因记入审核报告的遗留行，不要重跑。

重复直到某一轮没有实现缺陷，且每个剩余项都是已声明的遗留。

## 7. 收敛复跑

收敛之后，对所有用例完整跑一次 adapted，确保没有用例漏验。

```sh
vp run playground:prepare -- --mode adapted --reuse
vp run playground:run-batch -- --mode adapted --all
vp run playground:collect -- --mode adapted
```

当每个用例通过，或每个未通过的用例都是带原因的已声明遗留时，判定通过。若完整复跑暴露出新的实现缺陷，回到第 6 步。

## 8. 收口报告

把 `reports/skill-audit.md` 的每一节更新到最终状态，已通过或带原因的遗留，并把轮次和状态记录进 `cases.lock.json`。下一轮从第 5 步开始。

## 约定

- 用例 prompt 保持自然的用户请求。绝不点名工具或展开调用参数。
- 运行中没有真人回答问题。run-case 会自己应答 ask_user_question 卡片：用例自身的 `answers` 规则优先，否则选第一个选项或填入默认文本，每个回答都记入证据。
- 模型选择属于操作者。每台机器确认一次；agent 引用会话事件作为证据。
- 上游技能集与每个技能的用例映射位于 `playground/cases.lock.json`。`vp run playground:check` 在出现漂移时失败。
- Cursor-only 处理以 `playground/AGENTS.md` 与 lock 为准：只有依赖 Cursor 专属能力的技能才排除、不获得用例；仅在正文提及的技能记入 `CURSOR_MENTION_REVIEWED` 后仍可运行。因此 `--all` 覆盖全部可运行用例。
