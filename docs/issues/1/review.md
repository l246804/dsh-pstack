# Issue #1：角色配置文件名 poteto-models.mdc 与上游 pstack-models.mdc 不一致

- Issue: https://github.com/l246804/dsh-pstack/issues/1
- target: core
- status: open
- port_round: "#1"
- stage: passed
- 公开状态: open（2026-10-29 创建，标题与正文经用户确认）

## required_behavior

- 新写入和读取的角色文件路径为 `$DSH_HOME/pstack-models.mdc`，与上游命名一致。
- 用户文档、DSH 适配文档、术语表和测试中的 DSH 角色文件名与上游一致。
- 不兼容、不迁移已有的 `poteto-models.mdc`：旧文件不再被读取，按缺失配置处理（各角色继承父级路由）。
- 格式错误仍按行号报告。

## 映射

- 能力基线（`pstack/README.md`）：SET-02、SET-06（角色文件读取/写入）、MOD-04（角色到模型映射）；§6.1 AD-01 验收行为与分阶段状态中 SET-06 的覆盖结论都记录当前文件名。
- 既定适配：`docs/decisions/2026-10-28-pstack-plugin-tools.md`（Status: accepted）第 18 行把 `/setup-pstack` 写入路径记为 `$DSH_HOME/poteto-models.mdc`；改名改变该决策所记事实，须同步处理。
- 适配文档：`pstack/harness/docs/harness/dsh.md`（生成 `pstack/pstack/docs/harness/dsh.md`）。
- 实现面：`src/internal/role-manifest.ts`（`PSTACK_MODELS_FILENAME` 与文件头注释）、`src/internal/role-config.ts`（文件头注释）、`src/models.ts`（`pstack_models` 工具描述）、`tests/subagent.test.ts`（夹具文件名与诊断正则）。
- 用户文档与术语：根 `README.md`、`README.zh.md`、`docs/glossary.md`。
- 判据：修复要改 `pstack/harness/` 与 port 能力行为（repair_target: port），并改 port 基线与已接受决策，按 core 流程走，不走 issue implement。
