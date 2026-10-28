# `/pstack-maintain` 使用说明

用于插件完成基线移植后的增量维护。`SKILL.md` 负责路由与共同约定，`references/` 保存各分支说明；每次只加载一个分支，避免缺陷、功能和上游更新规则互相干扰。本说明供人阅读，不是额外执行分支。

## 使用方式

```text
/pstack-maintain defect
/pstack-maintain feature
/pstack-maintain upstream
```

未指定分支时，技能会询问。每次只处理一个分支，完成后停止；独立需求分别调用。

## 示例

### 报告并修复移植缺陷

```text
/pstack-maintain defect
安装后执行 /poteto-mode 时 watch-pr 找不到 gh，请复现、归因并修复。
```

分支记录真实环境和最小复现，区分上游、移植或 DSH 问题，形成 Issue 草稿并添加回归验证。公开提交前会请求确认。

### 增加模型配置界面

```text
/pstack-maintain feature
实现 EXT-002：在 DSH 界面查看和编辑 ~/.dsh/poteto-models.mdc。
```

分支先核对公共客户端插件与文件接口，再实现并更新 `docs/extensions.md`。不会重新运行整个移植流程。

### 跟进 DSH 能力

```text
/pstack-maintain upstream
检查当前 DSH 提交对 EXT-002 和只读子代理实现的影响。
```

分支只检查受影响接口和回归场景，更新兼容版本；宿主已有公共能力时优先复用。

## 分支选择

- 行为偏离预期：`defect`。
- 上游没有的新产品功能：`feature`。
- pstack 或 DSH 更新后的兼容维护：`upstream`。
- 需要从零重建移植基线：使用 `/pstack-port audit`，不属于本技能。
