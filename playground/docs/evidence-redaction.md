# 证据脱敏

本文件定义 `record.json` 的机械脱敏、分析会话脱敏和提交门。完整 session 不进入快照；只在本地 worker。

## 两层流程

1. `run-scenario` 在 worker 生成 `record.json`，同时把真实 artifact/session 路径写入本地 `record.source.json`；`collect` 只从 `record.source.json` 复制证据。
2. 独立分析会话读取 `record.json`，按本文件产出 `record.safe.json`，再运行：

```sh
vp run playground:redact -- --variant native --environment base
vp run playground:redact -- --variant native --environment base --apply
```

`--apply` 前先检查候选文件；只有校验通过的 `record.safe.json` 才替换 `record.json`。

## 脱敏范围

- 必须清除 API key、GitHub token、Bearer token、云密钥、私钥、`token=` URL 参数。
- 容器路径（`/dsh/...`）不是宿主秘密，但宿主侧错误文本、`blockedReason`、历史记录和工具参数仍可能带 `/home`、`/Users`、`/tmp`、`/var/folders`、Windows 盘符或编码后的 session key，必须替换为 `<HOST_PATH>` / `<TEMP_PATH>` / `<REDACTED_USER>`。
- `session.sessionFile` 和 `session.workspacePath` 固定替换为占位符；`artifacts.recordFile` 和 `screenshotFile` 用证据文件名。
- 不删除 evidence 字段；替换为明确的 `<REDACTED_*>` 占位符。

## agent 要求

- 只读已机械脱敏的 `record.json`，不读取或粘贴原始 session。
- 保留 RunRecord 结构和证据语义；只替换敏感文本。
- 无法判断的字段标 `needs-human`，不猜测放行。
- 需要记录决定时在同目录写本地 `redaction-notes.md`。

## 提交门

- `evidence/runs/**/session.jsonl.zstd` 永不提交。
- `evidence/runs/**/record.source.json` 永不提交。
- `evidence/runs/**/record.safe.json` 永不提交。
- 只有 `redact --apply` 成功后的 `record.json` 和人工确认的截图进入提交。

## 完成标准

- `playground:redact` 检查无残留 secret 或 host-path 类别。
- `record.json` 结构完整，截图经人工确认。
- session、source、safe 文件只在本地产物中。
