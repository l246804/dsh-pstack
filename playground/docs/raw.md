# raw 目录说明

本文件说明 `playground/raw/` 的文件职责和生成规则。`dsh.md` 的逐行编写规则不在 playground 内维护，统一链接根目录的 [docs/dsh-adapter.md](../../docs/dsh-adapter.md)。

## 文件职责

- `playground/raw/dsh.md`：raw 阶段 DSH 能力答案，由 agent 依据 DSH 实际能力逐条填写并经用户确认。
- `playground/raw/dsh.zh.md`：`dsh.md` 的本地化审阅译文；生成器不读取，只用于审阅。
- `playground/raw/dsh-evidence.md`：记录 `dsh.md` 每个替换项对应的 DSH 事实证据。
- `playground/raw/pstack/`：由生成器从上游 pstack 复制的 raw 生成树，不作为能力来源。

## 生成器

`scripts/generate-pstack.mjs --target raw` 只负责：

1. 从 `upstream/cursor-plugins/pstack` 复制技能、agents、guide、README、plugin.json 和 LICENSE。
2. 把 `playground/raw/dsh.md` 写入生成树，并在技能 H1 后写入 DSH 适配注入行。
3. 生成 `playground/raw/pstack/`。

生成器不得改写上游技能正文、README、guide、安装段或命令前缀。

## dsh.md 规则边界

`playground/raw/dsh.md` 和 `playground/raw/dsh.zh.md` 的结构、单元格、逐行同构和证据要求，以根目录 [docs/dsh-adapter.md](../../docs/dsh-adapter.md) 为准。

本文件说明 raw 目录的职责和生成边界。

## 修改流程

- 修改 `dsh.md` 后同步 `dsh.zh.md`。
- 需要重新生成 raw 树时运行 `vp run playground:raw-generate`。
- `dsh-evidence.md` 只记录证据，不把证据当成能力来源或能力清单。

## 与 native probe 的关系

`playground/raw/dsh.md` 是 native probe 的对照答案，但不是能力清单本身。能力提取和 probe 编写规则见 [capabilities.md](./capabilities.md)。
