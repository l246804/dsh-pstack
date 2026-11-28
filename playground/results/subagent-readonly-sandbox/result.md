# 子代理只读沙箱

[场景](../../scenarios/subagent-readonly-sandbox.ts)

| 组合 | 最近实测 | 结论 | 关键观察 |
| --- | --- | --- | --- |
| native/base | 2026-11-27 | 缺口成立 | 只读要求未由运行时强制，子代理成功创建探测文件。 |
| adapted/base | 2026-11-27 | 通过 | 子会话使用只读沙箱，四条写入路径全部被拒，探测文件不存在。 |

处理：用户已批准由插件提供只读环境；适配验证通过。

适配答案：`native/dsh.md` 对原生权限限制的说明够用；`src/dsh.md` 的只读 preset 说明与实测一致。

证据：[native](./native-base.png)、[adapted](./adapted-base.png)。沙箱模式和写入拒绝来自本地子会话与工作区检查。
