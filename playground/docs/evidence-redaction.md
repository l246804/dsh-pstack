# 证据脱敏规则

`record.json` 不是完整 session 文件。它是从 session 事件提取的摘要；完整 session 仍可能包含宿主路径、凭证和原始消息，只保留本地，不提交。

## 两层流程

1. `run-case` 在 worker 生成机械脱敏后的 `record.json`，并把真实 artifact/session 路径写入本地 `record.source.json`；`collect` 只从 `record.source.json` 复制证据。
2. 独立分析会话读取该 `record.json`，按本规则产出 `record.safe.json`。
3. 运行：

```sh
vp run playground:redact -- --treatment native --environment base
```

检查候选文件。无残留后执行：

```sh
vp run playground:redact -- --treatment native --environment base --apply
```

只有校验通过的 `record.safe.json` 才会替换 `record.json`。`record.safe.json` 不提交。

## agent 脱敏要求

- 只读取已机械脱敏的 `record.json`；不要读取或粘贴原始 session。
- 保留 RunRecord 的结构和 evidence 语义；只替换敏感文本。
- 清除 API key、GitHub token、Bearer token、云密钥、私钥、宿主绝对路径、用户目录、临时目录、session 文件绝对路径和 workspace 绝对路径，以及错误文本、工具参数、assistant 文本中的同类内容。
- 无法判断的字段必须标为 `needs-human`，不得猜测后放行。
- 不要为了通过校验删除 evidence 字段；应替换为明确的 `<REDACTED_*>` 占位符。

## 记录格式

`record.safe.json` 与 `record.json` 同结构。需要额外记录脱敏决定时，在同目录写 `redaction-notes.md`，写明字段、原因和残留风险；该文件只保留本地。

## 提交门

- `evidence/runs/**/session.jsonl.zstd` 永不提交。
- `evidence/runs/**/record.safe.json` 永不提交。
- 只有 `redact --apply` 成功后的 `record.json` 和截图进入提交。
- 截图仍需人工确认不含账户名、凭证或其他敏感内容。
