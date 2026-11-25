# 决策：playground 只保留证据与判定

Status: proposed
Date: 2026-11-25
Scope: playground/**, vite.config.ts, docs/decisions/**
Implemented-by: -
Review: 2026-11-25

## 背景

playground 的目的是证明某个缺口在 native 不成立、在 adapted 成立。支撑这个目的只需要三样东西：真实会话的原始记录、场景文件、带审阅人和理由的判定。

现在的实现比这个目的重。七个文档交叉引用，运行身份六个字段，外加两个脚本。其中 `compare` 除了自己的测试没有调用方，`status-table` 写的 `status.md` 从未进入仓库，却被文档列为完成标准。文档驱动的门和仓库里的产物已经对不上，这就是仪式在腐坏的证据。

## 决策

保留真实会话记录、场景、review 的审阅人与理由、gap 与场景的绑定守卫、证据脱敏。

移除 `compare` 与 `status-table` 两个脚本及其测试，以及 `configHash`、`adaptedVersion` 两个没有读者的运行身份字段。保留 `matrix`，它同时是运行配置，`prepare` 用它选插件、`home` 用它开关 Team；保留 `dshVersion` 与 `pstackVersion`，读快照的人需要知道它是哪个运行时、哪个上游版本产出的。

把七份文档并成三份，分别回答怎么跑、记录长什么样、怎么判定。

playground 不作为发布门禁。它证明缺口，不证明版本。

## 替代方案

**全删，只留手写结论。** 被否决，失去可复查的原始会话，判定就没人能复核。

**保持现状。** 被否决，如上所述文档要求的产物根本不存在。

**只删脚本保留字段。** 被否决，没有消费者的身份字段会让读快照的人以为它在参与比较。

## 后果

- 证据快照仍可复查，但不再声称跨版本可比。
- `playground/docs/` 从七份降到三份，`playground:compare`、`playground:status-table` 两个命令消失。
- 已确认缺口与场景的绑定守卫保留，`native/gaps.json` 一改仍然会红。
