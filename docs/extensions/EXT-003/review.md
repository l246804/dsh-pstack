# EXT-003：pstack 角色模型配置页

- status: implement
- repair_target: extension
- Issue: [#2](https://github.com/l246804/dsh-pstack/issues/2)
- 建立：2026-10-30（Issue #2 首次分诊）
- DSH 版本：0.2.2-alpha.2（`ce7073d51254c26cd63b22a60835b8f948deb447`）

## required_behavior

- Plugins 页的 dsh-pstack bundle 页提供配置页，显示 `$DSH_HOME/pstack-models.mdc` 的绝对路径与加载状态：`missing`、`loaded`、`unreadable`；`unreadable` 显示实际原因。
- 按 `src/internal/role-manifest.ts` 的 manifest 顺序显示全部 17 个角色；已配置角色显示当前 `provider/model [effort]`（无 effort 时 `provider/model`），未配置角色显示 `inherit-parent`（继承父级路由）。
- 每个角色可从 `pstack_models` 的实时目录选择 provider、model 与该模型声明的 effort；`inherit-parent` / `auto` 仍可选。
- 选择不存在的 provider/model 或该模型未声明的 effort 时，保存被拒绝并显示原因，文件不变。
- 每个角色提供重置按钮，恢复为默认的 `inherit-parent`；保存后不残留旧的 `provider/model [effort]`。
- 保存写回 `$DSH_HOME/pstack-models.mdc`：只更新对应角色行，其他角色行与 `# budget` 行保持不变；连续保存两次结果一致；文件缺失时创建。
- 保存后无需重启，下一次 `pstack_subagent` 委派立即使用新值；已在运行的子代理不受影响。
- 未知/退役角色行或格式错误按行号显示，不静默删除原行。
- 与 `/setup-pstack` 读写同一文件，结果一致。
- `pstack_models`、`pstack_subagent` 与既有测试不回退；新增 UI 行为有自动化测试覆盖。
- 列表角色（`arena runners`、`arena cross-judge pool`、`swarm workers`、`architect runners`、`interrogate reviewers`）显示完整多 route 现值；保存单个角色不得静默丢弃未展示的 route。

## 实现与验证

待实现（下一步 `/pstack-port implement #2`）。

## 审查证据

待审查。
