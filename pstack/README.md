# pstack

DeepSeek Harness 的 pstack 移植。这个目录装的是移植的全部内容与生成它的工具，随包发布出去的是 `dist/`。

## 四个子目录

| 目录 | 生命周期 | 谁写它 |
| --- | --- | --- |
| `pstack/` | 每次构建整棵替换，只含 `agents/`、`docs/`、`skills/` | `pstack/scripts/generate-pstack-harness-tree.ts` |
| `overlay/` | 手写，长期存在，布局镜像生成树 | 人 |
| `runtime/` | 手写，长期存在 | 人 |
| `scripts/` | 手写，长期存在 | 人 |

生成树里出现生成器不产出的文件时，构建失败并点名该路径，而不是静默删除。手写内容必须放在另外三个目录里。

## 内容从哪来

生成树的内容有三个来源：

1. **上游 pstack**，固定在 `upstream/cursor-plugins/pstack` 这个 submodule。技能、agents 与 guide 的正文来自这里。
2. **`pstack/overlay/`**，手写覆盖层。`overlay.yml` 逐条声明哪个文件替换哪个上游文件，并记录当时的 `revision` 与 `sha256`。上游改动被覆盖的页面时构建失败，要求重算哈希。
3. **`pstack/runtime/`**，脚本源码。`fork/` 保存从上游 TypeScript 移植过来的三个 CLI 与五个测试，其余是上游 shell 脚本的 Node 平替。

随包的 `README.md`、guide、适配说明都在生成树里。适配说明是 `pstack/overlay/docs/harness/dsh.md`，它记录 Cursor 与 DeepSeek Harness 的每一处差异，是随包正文里唯一手写的文档。

## 覆盖层

`overlay/` 的布局就是生成树的布局，一个文件在覆盖层里的路径就是它在树里的路径：

```
pstack/overlay/README.md                    -> 树里的 README.md
pstack/overlay/docs/harness/dsh.md          -> 树里的 docs/harness/dsh.md
pstack/overlay/docs/guide/01-setup.md       -> 树里的 docs/guide/01-setup.md
pstack/overlay/skills/poteto-help/SKILL.md  -> 树里的 skills/poteto-help/SKILL.md
pstack/overlay/agents/<name>.md             -> 树里的 agents/<name>.md
```

要覆盖生成树里哪个目录，就在 `overlay/` 下建同名目录。`overlay.yml` 里每条只写一个 `path`，因为它同时是覆盖层内位置与树内位置，两处不会不一致。

`overlay.yml` 不列目录本身，只列文件。往覆盖层加一个文件就必须在清单里登记，否则它不会被读进树里。

## 生成器做什么

四个机械变换，都不需要判断语义：

1. 收窄 frontmatter 到本宿主实际读取的字段。
2. 把指向树外文件的相对链接改指上游 GitHub 原文。
3. 在用到 Cursor 名字的技能标题下插入一行指向适配说明的指针。
4. 拷入构建产物、适配说明与 role 文件示例。

除此之外不改正文。技能读起来是上游措辞，这是刻意的：`pstack/overlay/docs/harness/dsh.md` 就是为此存在的。

覆盖只替换正文。被覆盖的 `SKILL.md` 仍然经过同样的变换，因为加载器读的字段和读者需要的指针没有变。

## 常用命令

```bash
vp run build          # 生成端口树、打包 src、组装 dist
vp run build:port     # 只重新生成 pstack/pstack
vp run check          # 端口树检查、随包脚本检查、第三方哈希、类型、测试
vp run check:pstack-docs   # 只跑端口树检查
```

`pstack/pstack/` 不进 git，所以 clone 之后跑测试或检查需要先构建。`vp run check` 与 `vp run test` 已经通过依赖边保证这一点，直接 `vp test` 不会。

## 改一处正文

先判断这处正文属于哪个来源：

- **上游正文，本宿主无需改动。** 不要动。它跟着 submodule 走。
- **上游正文，但本宿主说法不同。** 在 `overlay/` 下按树的同名路径建文件，在 `overlay.yml` 里登记，然后 `vp run build:port`。构建会把你写的内容放进生成树。
- **本仓库自己的文档。** 直接改 `overlay/` 或 `scripts/`。

覆盖层是整份文件替换，不是句级 patch。这样上游改一个措辞不会让锚点失配，只会让哈希失配，而后者带一条明确的修复指示。
