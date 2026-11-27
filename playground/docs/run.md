# 运行

配置以 [config.example.ts](../config.example.ts) 和 `runner/types.ts` 为准。复制为本地 `playground/config.ts`，确认模型选择后执行 `vp run playground:doctor`；需要时用 `vp run playground:image` 构建与运行时匹配的 worker 镜像。

## 批次

按 `prepare → bootstrap → run-batch → collect` 串行执行。native 先生成基准树：

```sh
vp run native:generate
vp run playground:prepare -- --variant native --environment base --reset
vp run playground:bootstrap -- --variant native --environment base --all
vp run playground:run-batch -- --variant native --environment base --full
vp run playground:collect -- --variant native --environment base
```

adapted 先 `vp run build`，再使用同样顺序，把 variant 改成 `adapted`。`prepare` 安装当前打包产物。其他 environment 以 `runner/scenario/environments.ts` 和场景适用范围为准。

`--full` 运行该组合的全部适用场景；`--scenarios a,b` 只运行选中场景。批次结束后核对本地执行记录，再按 [judge.md](./judge.md) 分析并更新结果。执行失败、断言失败返回非零，但记录齐全时仍可收集已有截图并分析原因。

`collect` 默认只读取当前批次，缺少本批记录时报错，不拿更早的结果填充。它只将截图复制为 `results/<id>/<variant>-<environment>.png`，不会写入 JSON 或改写 `result.md`，也不会清理未选中场景。阻塞记录没有截图时删除该组合的旧图，避免把旧图当成这次证据。

单独运行场景后，显式选择要收集的最近记录：

```sh
vp run playground:run -- --worker 0 --scenario <id> --variant native --environment base
vp run playground:collect -- --variant native --environment base --scenarios <id>
```

运行记录与 session 位置由命令输出，可从 worker 的 `evidence` 目录读取；重建 worker 前完成所需分析。截图收集不要求不同场景或两侧记录的版本相同。

## 进度与停止

```sh
vp run playground:status -- --variant <variant> --environment <environment>
vp run playground:session-tail -- --variant <variant> --environment <environment> --worker <N> --scenario <id> --limit 10
vp run playground:stop-task -- --variant <variant> --environment <environment> --worker <N>
vp run playground:stop -- --variant <variant> --environment <environment>
```

长批次定期检查进度、最后事件和 `latestAge`。持续重复工具调用、长期无进展或偏离任务时停止对应任务；`stop-task` 写停止请求，由 runner 在轮询时处理。结束后用 `stop` 停止 worker 容器。

手动预览使用 `playground:open`、`playground:close`、`playground:reset`，对应 adapted/preview，不参与批次场景选择。

## 修改后的检查

按根目录要求运行 `vp check`、`vp test`，并运行 `vp run typecheck` 与 `vp run playground:typecheck`。场景集合、runner 和结果文档按各自改动验证；真实模型运行由用户按需触发。
