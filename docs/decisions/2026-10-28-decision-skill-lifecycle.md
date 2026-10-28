# 决定：决策记录的状态更新并入 decision-write，不单开技能

Status: proposed
Date: 2026-10-28
Scope: skills/authored/decision-*/**, skills/authored/setup-project-docs/**, skills-lock.json, docs/decisions/AGENTS.md, AGENTS.md
Implemented-by: -
Review: 2027-04-28

## 背景

`decision-write` 负责写记录，`decision-audit` 只读报告；两者之间没有谁负责把 `proposed` 改成 `accepted`。记录通常在代码提交前写，`Implemented-by` 只能填 `-`；合并到默认分支后，这个字段就停在那里，下一次审计也只会把带 `-` 的 `proposed` 当成“待落地”，不会提醒补锚点。改动前的三条记录都处于这个状态，验证了缺口确实存在。

“提交代码时自动更新”不是一个可实现的触发点：提交完成前拿不到该提交的 SHA，写入后再 amend 又会改变 SHA；`PR #N` 也要等 PR 创建。可核验的落地锚点只在提交或 PR 最终确定后存在，所以更新点只能是合并后的显式动作，不能是提交钩子。

直接改头部字段在机械上可行，但不再作为支持的路径：本仓库把 `decision-write` 设为唯一入口，其他技能或手工写文件都不直接改记录。需要两条规则：`Status` 与 `Implemented-by` 必须成对，锚点必须按命令核验。没有这两条，最容易写出 `accepted` + `-`，让记录声称已落地却拿不出证据。

## 决定

- `decision-write` 增加唯一入口规则：所有 `Status`、`Implemented-by`、`Review`、正文或链接修改都走它，不直接编辑记录文件；`decision-audit` 只读。
- `decision-write` 增加“落地”模式：用户只给出记录并说 `accepted` 时，自动从 `Scope` 匹配的提交/已合并 PR 中查找实现并写入对应锚点；Land 只能由用户明确触发，不能从合并自动推断。找不到实现而用户仍要求 `accepted` 时，必须确认是否用新增记录的那次提交作为锚点，并解释原因与后果。
- `decision-write` 的 Draft 可以自动开始，但写文件前必须报告完整的新记录、每个相关记录的分类，以及拟改为 `superseded` 的旧记录及其 `Superseded-by`，等待用户确认。
- `decision-write` 明确 `Status`/`Implemented-by` 的成对表：未落地 `proposed` + `-`，已落地 `accepted` + 核验锚点，被取代 `superseded` 并保留原锚点；`accepted` 与 `-` 不能并存。新草稿取代旧记录时，旧记录在新记录起草时即改为 `superseded`，新记录仍可为 `proposed`；旧记录原为 `proposed` 时保留 `-`，不删除、不回退。
- `decision-write` 的 `Scope` 检查同时看已提交改动和 `git status`，默认分支从 `origin/HEAD` 探测，不再硬编码 `origin/main`。
- `decision-write` 要求 `superseded` 记录必须有 `Superseded-by: <record path> — <one-line reason>`；只改状态或只写链接不算完成。
- `decision-audit` 增加反向检查：`accepted` 带 `-` 或无法核验的锚点是 B 类发现；PR 锚点区分 `OPEN`、`CLOSED`、`MERGED`；`superseded` 缺少 `Superseded-by` 或原因属于 E 类发现；读取记录时跳过 `AGENTS.md` 与 `README.md`。
- `docs/decisions/AGENTS.md` 写明合并后的更新时机、`Superseded-by` 必填规则与“所有修改走 `decision-write`、不直接编辑文件”的规则；不新增 `decision-update` 技能。

## 备选方案

- **新增独立的 `decision-update` 技能。** 不选：它和 `decision-write` 的取代分支、`decision-audit` 的 B 类检查三处重叠；多一个模型可见技能还会让模型在“写”和“更新”之间二选一。等状态更新发展为批量迁移或链接修复时，再拆出去。
- **用 git 提交钩子自动改记录。** 不选：提交 SHA 在钩子执行前不存在，写入后再 amend 又会改变 SHA；`PR #N` 也在提交时还不存在。钩子无法稳定地写出可核验的锚点。
- **只写进 `docs/decisions/AGENTS.md`，让调用方直接手改。** 不选：这正是当前缺口的来源——没有触发点和核验步骤，记录会一直停在 `proposed`。
- **把 `accepted` 定义为“本地已提交”，锚点对当前分支校验。** 不选：未合并的分支会声称已落地，锚点随后可能被 squash 或 rebase 改写；默认分支才是稳定锚点。

## 后果

- 好处：合并后有一个明确的落地步骤，`proposed` 不再永久滞留；`accepted` 与 `-` 的矛盾在写入和审计两侧都会被拦住；审计不再把约定文件误报成旧格式记录。
- 代价：每次合并后多一次显式更新；`decision-write` 从“只写新记录”扩展到“写 + 落地”，正文约增加三十行；`decision-audit` 的 B 类检查从单向变成双向。
- 重新考虑的条件：状态更新开始批量发生，或需要跨多条记录修复链接/锚点，说明更新逻辑已大到值得独立技能；届时再拆 `decision-update`。
