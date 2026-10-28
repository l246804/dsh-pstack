# 决定：随包正文只写读者能执行的验证，不写本仓库的开发期脚本

Status: accepted
Date: 2026-10-27

## 背景

`authoring-a-skill` playbook 的第 2 步被移植成"跑 `scripts/check-assets.ts`，它会在本包的 `assets/` 树上跑这些检查；你写在 `.dsh/skills/` 里的技能不在这棵树里，所以自己检查，别声称跑过检查"。`reflect` 的收尾句也补了同样的话，说本宿主"没有独立的 SKILL.md 校验器，别声称跑过"。

这三句话在事实层面都不算撒谎，但放错了地方。`scripts/` 不随包发布：`package.json` 的 `files` 只有 `dist`、`assets`、`cordis.patch.yml`、`locale`、`assets`、`README.md`、`LICENSE`。所以一个装了这个包的使用者，看到"跑 `scripts/check-assets.ts`"时无从执行。它是开发期门，守的是"生成树可以由源码重建"，与使用者写一个技能没有任何关系。

仓库自己早就写下过这条判据。`scripts/check-assets.ts` 的 `checkScriptReferences` 注释原文是：`.ts` 与 `.sh` 引用是"this repository's build scripts"，"They never ship and the reader is not meant to run them"。检查按这条规则放过 `.ts`，于是正文里那几处开发期脚本引用既不被拦下，也没有任何检查守"随包正文不许提它们"。判据存在，执行缺位。

同时还有一个反向的漏项。宿主的加载器对 `name` 有形状要求：`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`。不满足时 `parseSkillFile` 走 `logger.warn` 然后 `return`，技能**从目录里消失**，没有报错。使用者写一个 `My_Skill` 会得到一个静默失效的技能，而这正是第 2 步该提醒的事。原来的移植版本把这一条换成了"拒绝未知字段"——那是本包 `src/frontmatter.ts` 的严格度，比宿主严，读者真正会踩的是名字形状。

## 决定

`assets/` 里的正文只描述读者在本机真的能执行的动作。

1. `authoring-a-skill` 第 2 步回到上游的清单，只加一条宿主真正会拒的：`name` 必须 kebab-case，否则加载器跳过该技能、只留一条 warn，所以写完要确认它出现在 catalog 里。
2. `reflect` 的收尾句删掉"本宿主没有独立校验器"这个否定式说明，只说按 `authoring-a-skill` 的清单自查。
3. `capabilities.ts` 里 `create-skill` 那行的 `reason` 不再声称"playbook 指向本包实际运行的校验器"——它不指，也不该指。改成"playbook 带着作者执行的清单；发布门另外检查随包内容的前置格式与链接"。
4. 开发期脚本的去留仍由 `pnpm run check` 负责，它不在正文里出现，也就不需要读者知道。

## 备选方案

- **保留原文，只是在句子里说明"这个脚本不随包"。** 放弃：那正是 `2026-10-27-cursor-builtin-dependencies.md` 已经否掉的否定式写法。读者要的是"我该做什么"，不是"有个你跑不了的东西存在"。而且它会引诱 agent 去 `scripts/` 里找那个文件。
- **保留原文，同时让 `checkScriptReferences` 开始检查 `.ts` 引用。** 一并放弃：检查能拦下泄漏，但拦不住"该怎么写"。正文仍然空着，第 2 步该给读者的那条（名字形状）还是不写。补上内容才解决问题，加一条禁令只是把同一个决定换个地方执行。
- **照抄上游第 2 步，一个字不加。** 放弃：上游的清单里没有名字形状，因为 Cursor 的内置撰写器替作者挡了这一步。这里没有撰写器，而加载器会静默跳过，这条信息只有本包能给。
- **把 `name` 形状写进 README 或差异清单，正文不提。** 放弃：写技能的人读的是 playbook，不是维护者文档。读者在哪一步动手，就在哪一步告诉他。
- **给真实加载器加一条自检命令让作者跑。** 放弃：DSH 没有暴露这样的入口，虚构一个就是又一次"说了做不到"。

## 后果

三处正文停止指向使用者跑不到的脚本，第 2 步重新包含一条读者真正需要的信息。差异清单里记下这条规则，`checkScriptReferences` 的既有判据现在有了正文侧的对应说明。

代价是这条规则仍然只有文字约束，没有机器检查。`checkScriptReferences` 放行 `.ts` 是有理由的（`assets/docs/harness/dsh.md` 自己就写着"由 `scripts/capabilities.ts` 生成"，那是给维护者看的），所以不能简单禁掉全部 `.ts`。真要做成检查，得先能区分"写给读者的步骤"与"写给维护者的出处说明"，那是另一件事。

重新考虑的条件：如果 `assets/` 里再出现第二处开发期脚本引用并被当成操作步骤，就该把这条规则做成检查，而不是再修一次文字。
