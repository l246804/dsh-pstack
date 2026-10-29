# doc：写适配文档并结束 port 轮次

只在 `port.state: active`、`phase: doc` 且满足以下一种前置时执行：`review port` 通过且无开放 finding；或 core 验收仅发现 documentation-only 缺口，实现审查证据仍有效。无 blocker，或 core blocker 显式允许 `doc` 才可进入。`docs/port-review.md` 只保存本轮证据，不作为路由状态。

## 1. 核对基线并处理不一致

读取状态、README、当前 port 工作文件、上游提交和当前实现。核对受审文件、全部 core `required_behavior`、测试和最终覆盖依据。

发现 README、实现、测试或适配证据不一致时，在写入任何适配内容前停止：向 `docs/port-review.md` 追加含 `origin: doc`、`status: open`、`required_behavior`、`evidence` 的 finding，把 `phase` 置回 `review`，不标任何能力通过。下一步 `/pstack-port review port`。

完成标准（S-13）：不一致已转为可复核 finding 和证据，状态为 `active/review`，适配文档没有留下未经验证的内容。

## 2. 按上游模板写适配文档

枚举并完整读取 `<pstack>/docs/harness/`。`claude-code.md` 映射为 `pstack/harness/docs/harness/dsh.md`，其他附件保持相对路径与文件名。逐份以英文模板的章节、表格、段落职责和顺序为骨架，只替换宿主名、字段、路径和行为。正文使用英文，保留平台排除的跳过语义。

`dsh.md` 另设 `## Optional plugins`，覆盖 README 当前可选插件表的全部 `OPT-*`，编号集合必须一致。每行写：

1. `OPT-*` 编号与准确插件包名。
2. 启用后获得的能力。
3. `When not enabled` 的替代命令、工具或路径；无替代时原样使用 `Skipped in DeepSeek Harness: <step>. <reason>.`。
4. 未启用时不得声称对应步骤通过。可选插件是默认关闭的能力，不写成平台永久不支持。

至少保留一个上述跳过行。其他表格中的分散说明不能替代本节索引。README 文档状态区记录该产物。

完成标准（S-20）：每个 OPT 都有启用能力与未启用 fallback/skip；包名、默认状态和 README 一致；dsh.md 保持英文模板结构，跳过项没有写成通过。

## 3. 更新中文审查记录

写 README 前直接读取 `<pstack>/skills/technical-writing/SKILL.md` 与 `<pstack>/skills/unslop/SKILL.md`，不依赖 skill catalog。`pstack/README.md` 使用简体中文与 reference mode，先给能力结论，再给证据和缺口。每个能力 ID 的状态仍只在分阶段状态表定义一次。

只更新文档状态与最终覆盖相关字段，保留上游需求、分类、既定适配和实现记录。逐项写产物位置、实际覆盖与有意排除；部分或未实现项写具体缺口与证据。core Issue 的每项 `required_behavior` 都有最终覆盖结论。core EXT 的 `repair_target: port` 修复通过后恢复登记表 `active`。

完成标准：README 可从能力表定位每项状态与证据；core 输入没有漏项；没有重复状态表或为排版服务的重复段落；两个写作技能均已执行并做 unslop 扫描。

## 4. 同步根 README 动态内容

这是 agent 的完成条件，不交给用户复核。先按 R-08 的两个写作技能整理内容，识别根 README 的实际语言结构。双语段落或 `README*.md` 多文件必须逐段同步；无法同步时在报告中列出缺失语言与段落。

按当前结构逐项对照 `pstack/README.md` 和实现：

- DSH、pstack、Node.js、Cordis 版本与 pstack 上游基线提交。
- 技能、playbook、原生工具、preset、随包脚本的数量。
- `常用入口` 的新增或删除。
- 原生工具与随包脚本清单。
- 可选 DSH 插件的包名、默认状态、实验性、启用条件、能力、边界与冲突，包括浏览器 provider 组合、互斥、单 provider 槽和全局工具替换。
- 版本表、冲突与降级说明。
- 仅在架构变化时检查 `实现方式`。

没有差异就不修改，并在报告中写“根 README 无差异”。有差异时，安装与使用段采用 how-to mode，所有语言版本同步对应修改。

完成标准（R-01）：动态内容与当前 README 和实现一致；OPT 集合一一对应；无差异未写文件，有差异已同步全部语言或明确报告缺失。

## 5. compact、验证并收尾

执行 `node pstack/scripts/port-fixes.mjs compact`。活跃台账只留 `open/active`；退役候选带 `retired_at`、`retired_reason` 移入 `docs/port-fixes-archive.yaml`。编号永不复用，replay 不读 archive。

运行并记录全部命令的实际退出码：

```bash
vp check
vp test
node pstack/scripts/generate-pstack-harness-tree.mjs --check
node pstack/scripts/port-fixes.mjs replay
```

任一必要验证失败时，先恢复本次调用写入且尚未验证的适配文档、README 动态内容和 compact 变更，只保留修复所需的已验证证据；再写 `origin: doc` finding、设 `phase: review`，不进入完成状态。全部通过后清空 `docs/port-review.md` 正文，只留完成头部、round、上游提交和完成时间。

按本轮来源设置状态：

| 来源 | 收尾 |
|---|---|
| baseline，无 core 验收事项 | `port.state: idle`、`phase: done`，本轮结束 |
| core Issue | 保留 blocker，`port.state: done`、`phase: done`；确保允许 `issue #编号`，下一步验收 |
| core EXT，无关联 Issue | EXT 恢复 `active`，清 blocker，`port.state: idle`、`phase: done` |
| core EXT，有关联 Issue | EXT 恢复 `active`；blocker 的 `active_item` 改为 `#编号` 并允许 `issue #编号`；`port.state: done`、`phase: done` |

报告逐文件产物、最终覆盖、OPT 降级表、compact、根 README 核对和全部验证。最后按状态写 `/pstack-port issue #编号` 或“本轮结束，无下一步”。

完成标准（S-01、S-14、S-18、S-19）：适配文档与中文 README 完整；OPT 和根 README 已核对；四条门禁通过；port-review 正文已清空；FIX 台账与 archive 一致；port 状态、EXT 状态和 blocker 符合来源；报告含完整下一步命令或结束语。
