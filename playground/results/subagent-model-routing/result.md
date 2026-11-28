# 子代理模型路由

[场景](../../scenarios/subagent-model-routing.ts)

| 组合 | 最近实测 | 结论 | 关键观察 |
| --- | --- | --- | --- |
| native/base | 2026-11-27 | 缺口成立 | 单次委派显式选择其他路由被宿主拒绝；脚本编排的替代动作不满足本场景。 |
| adapted/base | 2026-11-27 | 通过 | 子会话记录确认使用指定路由，产物由子代理写出。 |

处理：用户已批准由插件补齐；适配验证通过。

适配答案：`native/dsh.md` Models 行已按用户批准区分工具开关、宿主授权和默认继承，审查够用；`src/dsh.md` 的角色发现与显式路由说明与实测一致。

证据：[native](./native-base.png)、[adapted](./adapted-base.png)。指定路由的判断依据为本地子会话 header，截图仅辅助展示。
