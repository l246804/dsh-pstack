# 决定：新加脚本命令优先定义在 vite.config.ts，已有脚本保持原样

Status: proposed
Date: 2026-10-30
Scope: package.json, vite.config.ts, playground/package.json, skills/package.json, pstack/package.json, AGENTS.md, docs/architecture.md
Implemented-by: -
Review: 2027-04-30

## 背景

根 `package.json` 已有 `prepare`、`prerelease`、`release`、`prepublishOnly` 等脚本，属于既有约定，本决定不迁移、不改动。新加命令若也写进 `package.json`，会与 `vite.config.ts` 的 `run.tasks` 双轨并存：同一条命令有两个声明位置，`vp run <name>` 与 `npm run <name>` 行为可能不一致，维护者不知道改哪边，`package.json` 还会随一次性命令持续膨胀。

约束：

- 已有脚本命令保持原样，不做迁移。
- 新加的非必要命令默认定义在根 `vite.config.ts` 的 `run.tasks`。
- npm 生命周期钩子（`prepare`、`prepublishOnly` 等）或被外部工具强制要求读取 `package.json` 的命令，属于必要例外。
- 任何新命令要写进 `package.json`，都必须先向用户申请确认；未确认即中止，不先写后问。

## 决定

- 已有 `package.json` 脚本保持原样，不迁移、不修改。
- 新加命令默认定义在根 `vite.config.ts` 的 `run.tasks`，用 `vp run <task>` 调用。当前新增的 `playground:browser` 已按此定义为 task；`playground/package.json` 的 `start` 删除（根已有 `playground` task）。
- 新增任何 `package.json` 脚本前，先向用户申请并说明为何必须放 `package.json`；用户确认后才加，未通过就中止该任务、不改工作区。
- 该规则写入根 `AGENTS.md` 与 `docs/architecture.md`，后续新加命令默认按此执行。

## 备选方案

- 把所有已有脚本也迁到 `vite.config.ts`。不选：用户明确已有脚本不用管，迁移会扩大改动面并带来无必要的回归风险。
- 新命令全部写 `package.json`。不选：与 `vite.config.ts` 的 tasks 双轨，`vp run` 找不到任务或行为分叉，非必要条目持续膨胀。
- 需要时临时问用户，但不立规则。不选：没有默认位置，下一次仍会重复在 `package.json` 加脚本。
- 未确认先加、事后补问。不选：违背「先确认再动」的约束，工作区可能已产生用户不想要的脚本。

## 后果

- 已有 `package.json` 脚本保持现状（`prepare`、`prerelease`、`release`、`prepublishOnly`）；新命令统一走 `vp run <task>`，`playground:browser` 是首个新命令示例。
- 代价：查看新命令要读 `vite.config.ts`；`package.json` 仍保留既有脚本，这是「不迁移已有命令」的直接结果。
- 新加命令前多一次用户确认成本，换来不再出现未授权的 `package.json` 脚本。
- 若将来某个工具强制要求 `package.json` 脚本，按例外申请，并在本记录补充理由。
