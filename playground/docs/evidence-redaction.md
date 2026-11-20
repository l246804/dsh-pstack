# 证据脱敏

本文件说明 record 的机械脱敏、分析会话检查和提交门。完整 session 不进入快照，只留在本地 worker。

## 流程

1. `run-scenario` 生成 record 和本地 `record.source.json`；`collect` 只从 source 复制 record 和截图到快照。
2. 独立分析会话按本文件生成 `record.safe.json`。
3. 检查候选文件：

```sh
vp run playground:redact -- --variant <variant> --environment <environment>
```

4. 只有检查通过的 safe record 才能应用：

```sh
vp run playground:redact -- --variant <variant> --environment <environment> --apply
```

`--apply` 会用 safe record 替换 `record.json`，实现见 `scripts/redact.ts`。

## 脱敏范围

- 清除 API key、GitHub token、Bearer token、云密钥、私钥和 token URL 参数。
- 宿主侧路径和编码后的 session key 替换为明确占位符；容器路径 `/dsh/...` 不是宿主秘密。
- `session.sessionFile`、`session.workspacePath`、artifact 路径使用脱敏占位符或证据文件名。
- 不删除证据字段；只替换敏感文本，保留 RunRecord 结构和语义。

## 分析会话

- 只读已机械脱敏的 record，不读取或粘贴原始 session。
- 无法判断的字段标记为 `needs-human`，不要猜测放行。
- 需要记录决定时，在同目录写本地 `redaction-notes.md`。

## 提交门

- `evidence/runs/**/session.jsonl.zstd` 永不提交。
- `evidence/runs/**/record.source.json` 永不提交。
- `evidence/runs/**/record.safe.json` 永不提交。
- 只有 `redact --apply` 成功后的 `record.json` 和人工确认的截图进入提交。

## 完成标准

- `playground:redact` 检查没有残留 secret 或 host-path 类别。
- record 结构完整，截图经人工确认。
- session、source 和 safe 文件只保留在本地。
