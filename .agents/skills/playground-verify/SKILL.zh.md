---
name: playground-verify
description: 在新机器上跑完整的 dsh-pstack 移植验证闭环：raw 基线生成、语义审核、adapted 回归、官方插件矩阵、插件 UI 检查与最终全量复跑。
disable-model-invocation: true
---

# 跑 playground 验证

用真实 DSH Web 会话驱动完整的测试驱动移植。raw 证据决定适配内容，adapted 证据证明适配成立。不存在 case lock 与审批文件：审核结论在 `playground/reviews/` 侧车，发布兼容键在 `playground/baseline.json`。

## 1. 机器准备

1. `vp install`。
2. 确认 `dsh` 在 PATH 中，`agent-browser` 已安装 Chromium。
3. 把 `playground/config.example.json` 复制为 `playground/config.json`，填 `providers` 与 `testModel`（provider/model/effort）。该文件已忽略，缺失时脚本直接报错，不要提交。
4. `vp run playground:raw-generate` 从上游与 `playground/raw/dsh.md` 生成隔离的 raw 树。

## 2. raw 发现轮

```sh
vp run playground:prepare -- --phase raw --environment base --workers 4 --reset
vp run playground:bootstrap -- --worker 0 --environment base
vp run playground:run-batch -- --phase raw --environment base --all
vp run playground:collect -- --phase raw --environment base
vp run playground:status -- --phase raw --environment base
```

raw 只允许无附加插件的 `base` 环境，使用 standard preset 加 `playground/raw/dsh.md` 的 raw `systemPrompt` 注入。每个场景等待真实 `turn/end`，没有 probe、到点中止或 truncated 状态。

然后做语义审核。每个场景写一份侧车 `playground/reviews/<scenarioId>-<phase>-<environmentId>.json`：

```json
{
  "status": "supported",
  "reason": "查了哪些产物与回复，rubric 为何成立或不成立",
  "reviewer": { "kind": "model", "route": { "provider": "...", "model": "...", "effort": "..." } },
  "reviewedAt": "2026-11-11T00:00:00Z"
}
```

```sh
vp run playground:review            # 校验侧车并列出待审
vp run playground:review -- --apply # 合并为 append-only 的 RunRecord 修订
```

侧车早于最新重采记录会被判 stale 并跳过，绝不能把旧审核洗到新证据上。

## 3. 实现适配

按 raw 发现更新 `port/dsh.md` 与 `port/dsh.zh.md`。生成器只复制上游并插入适配引用行，不改上游文案；所有适配差异只在适配文档里。

```sh
vpx port/generate.mjs
vp run build
```

## 4. adapted 回归轮

```sh
vp run playground:prepare -- --phase adapted --environment base --workers 4 --reset
vp run playground:run-batch -- --phase adapted --environment base --only-failed
vp run playground:collect -- --phase adapted --environment base
```

adapted 加载构建后的 `dsh-pstack` 并选择 `poteto-mode` preset，不注入 raw 提示。用同样的侧车流程审核并 apply。重复 `--only-failed`（not-verified 或 inconclusive）直到没有实现缺陷，然后做一次全量 adapted 复跑。

## 5. 官方插件矩阵与 UI

环境定义在 `playground/scenarios/environments.ts`：`base`、`session-search`、`browser-use`、`terminal`、`forge`、`agent-team-conflict`。相关环境用同一批场景 id 逐个 prepare 与运行。

```sh
vp run playground:prepare -- --phase adapted --environment session-search --workers 1 --reset
vp run playground:run-batch -- --phase adapted --environment session-search --scenarios <ids>
vp run playground:run-conflict -- --environment agent-team-conflict
vp run playground:run-ui -- --worker 0 --scenario plugin-ui-role-config --environment base --packages dsh-pstack
vp run playground:run-ui -- --worker 0 --scenario plugin-ui-recommended-plugins --environment base --packages dsh-pstack
```

声明了 `versionExemptions` 的环境需要 exact-version 豁免，`prepare` 会按实际安装版本与运行时版本自动 grant。Agent Teams 是冲突回归，不是支持组合：Web 能启动，`poteto-mode` preset 必须显示 `AGENT_TEAMS_CONFLICT` 加载失败。

## 6. 收尾

矩阵与 UI 完成后，做一次干净的 raw 与 adapted 全量复跑，collect 两份报告，审核全部侧车。通过条件是每个 adapted 场景 verified，或因环境 blocked 且有证据地记录，同时 schema、覆盖与构建检查全绿。

## 约定

- 场景 prompt 保持自然用户请求，不点名工具、不展开调用参数。
- 运行中无人回答提问。`run-case` 自行回答 `ask_user_question`：场景自带 `answers` 优先，否则取第一个选项或输入默认文本，并记录每次回答。
- 模型由操作者选择，每条 RunRecord 记录实际路由。
- 技能加载只是过程证据；语义效果由审核侧车判定，pending 不算通过。
- raw 四态 observed/gap/blocked/unobserved；adapted 三态 verified/not-verified/inconclusive。
- 不恢复 cases.lock、审批流、旧 SkillCase、Finding 或 `reports/skill-audit.md`。
