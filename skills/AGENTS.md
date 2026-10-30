# skills 目录

本目录是随包发布的技能工作区：`authored/` 由本仓维护，`.agents/skills/` 是 vendored 上游技能（构建时以 `vendored/` 发布）。根 `README.md` 是这些技能的用户文档。

## 变更技能后同步根 README

改动本目录下的技能后（新增、删除、改名，或改变用途、补充的能力、来源分类 `authored` / `vendored`、vendored 来源版本），逐项核对根 README 中与该技能相关的内容：

- `## Skills directory` / `## skills 目录`：来源说明、技能表（每个技能一行：来源、技能、作用、补充的工程能力）、vendored 来源与 `skills/skills-lock.json` 段落。
- `### Common entry points` / `### 常用入口`：该技能对应的命令与用途。
- `## Credits` / `## 鸣谢`：vendored 技能的来源署名。

变更后的技能与根 README 的相关内容无差异时，不修改 README，并写明“根 README 无差异”。有差异时以 `README.md` 为主更新，双语时同步所有语言版本，保持对应内容一致。只改技能内部步骤、脚本或措辞，且 README 对用途与能力的陈述仍然成立，按无差异处理。
